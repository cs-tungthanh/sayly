// Capture the store screenshot scenes through Chrome's DevTools protocol, in real time.
// Called by scripts/capture-screenshots.sh with the scene server's URL and Chrome's path.
// Usage: node capture.mjs <base url> <chrome binary> <output dir>
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [baseUrl, chromePath, outDir] = process.argv.slice(2);

const SHOTS = [
  { file: 'sayly-1-word.png', query: 'shot=1' },
  { file: 'sayly-2-sentence.png', query: 'shot=2' },
  { file: 'sayly-3-settings.png', query: 'shot=3&mode=icon' },
  { file: 'sayly-4-dark.png', query: 'shot=4&theme=dark' }
];
// Long enough for the scene to select text, open the popup, load its content and click a word
const SETTLE_MS = 2500;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), 'sayly-shots-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

try {
  // Chrome prints its DevTools address once it is listening
  const browserUrl = await new Promise((resolve, reject) => {
    let output = '';
    chrome.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    chrome.on('exit', () => reject(new Error(`Chrome exited before it was ready:\n${output}`)));
  });

  const port = new URL(browserUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((target) => target.type === 'page');
  const send = await connect(page.webSocketDebuggerUrl);

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  // Reduced motion: every animation lands on its final frame, so nothing is caught halfway
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // A focused page draws the selection in blue, as a reader sees it, not the grey of a background tab
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });

  for (const { file, query } of SHOTS) {
    await send('Page.navigate', { url: `${baseUrl}/scene.html?${query}` });
    await wait(SETTLE_MS);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, file), Buffer.from(data, 'base64'));
    console.log(`Captured ${join(outDir, file)}`);
  }
} finally {
  chrome.kill();
  await wait(200);
  rmSync(profile, { recursive: true, force: true });
}

/**
 * Open a DevTools connection; returns a function that sends a command and resolves with its result
 */
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  let nextId = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const handlers = pending.get(message.id);
    if (!handlers) return;
    pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message));
    else handlers.resolve(message.result);
  });

  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
}
