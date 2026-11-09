import { defineConfig, Plugin } from 'vite'
import { resolve } from 'path'
import { copyFileSync, mkdirSync } from 'fs'

function copyExtensionFiles(): Plugin {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      // Copy manifest.json
      copyFileSync('manifest.json', 'dist/manifest.json')

      // Copy CSS files
      copyFileSync('src/content/popup.css', 'dist/content-popup.css')
      copyFileSync('src/options/options.css', 'dist/options.css')
      copyFileSync('src/popup/popup.css', 'dist/popup.css')

      // Bundled pronunciation dictionary and its license (which must ship with it)
      copyFileSync('src/data/cmudict-ipa.txt', 'dist/cmudict-ipa.txt')
      copyFileSync('src/data/CMUDICT-LICENSE', 'dist/CMUDICT-LICENSE.txt')

      // Copy HTML files
      copyFileSync('src/options/options.html', 'dist/options.html')
      copyFileSync('src/popup/popup.html', 'dist/popup.html')
      copyFileSync('src/offscreen/offscreen.html', 'dist/offscreen.html')

      // Create icons directory
      mkdirSync('dist/icons', { recursive: true })

      // Copy all icons
      const iconSizes = ['16', '48', '128']
      iconSizes.forEach(size => {
        try {
          copyFileSync(`src/icons/icon${size}.png`, `dist/icons/icon${size}.png`)
        } catch {
          console.log(`Note: No icon found at src/icons/icon${size}.png`)
        }
      })
    }
  }
}

export default defineConfig(({ mode }) => ({
  build: {
    rollupOptions: {
      // The content script is built separately (vite.config.content.ts): content scripts
      // can't use `import`, so it must not share chunks with these entries
      input: {
        background: resolve(__dirname, 'src/background/background.ts'),
        options: resolve(__dirname, 'src/options/options.ts'),
        popup: resolve(__dirname, 'src/popup/popup.ts'),
        offscreen: resolve(__dirname, 'src/offscreen/offscreen.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        // Unhashed, so the Safari Xcode project (safari/), which lists every file in dist, keeps finding them
        chunkFileNames: 'assets/[name].js',
        format: 'es',
      },
    },
    outDir: 'dist',
    // In watch mode the content-script watcher writes to dist concurrently; emptying it would delete content.js
    emptyOutDir: mode !== 'development',
  },
  plugins: [copyExtensionFiles()],
}))
