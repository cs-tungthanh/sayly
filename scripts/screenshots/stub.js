// Stands in for the extension APIs so the built content script and toolbar popup run on a plain page.
// Settings come from the page URL: ?mode=icon&theme=dark
(function () {
  const params = new URLSearchParams((window.top || window).location.search);
  const store = {
    popupMode: params.get('mode') || 'immediate',
    theme: params.get('theme') || 'light',
    targetLanguage: 'vi',
    dictionarySite: 'cambridge',
    speechSpeed: 1,
    showCopyButton: true,
    showDefinitions: true,
    geminiApiKey: 'stub',
    disabledSites: []
  };

  const TRANSLATIONS = {
    pronunciation: {
      text: 'phát âm',
      dictionary: [{ partOfSpeech: 'noun', meanings: ['sự phát âm', 'cách phát âm', 'cách đọc'] }]
    },
    'Pronunciation is the key to speaking with confidence. When you know how a word sounds, you can say it clearly and understand it when other people use it.': {
      text: 'Phát âm là chìa khóa để nói một cách tự tin. Khi biết một từ được phát âm như thế nào, bạn có thể nói nó rõ ràng và hiểu nó khi người khác sử dụng.',
      dictionary: []
    },
    'Small details make a big difference.': { text: 'Những chi tiết nhỏ tạo nên sự khác biệt lớn.', dictionary: [] },
    booked: { text: 'đã đặt', dictionary: [{ partOfSpeech: 'verb', meanings: ['đặt trước', 'đặt chỗ'] }] }
  };

  const IPA = {
    pronunciation: '/proʊˌnʌnsiˈeɪʃən/',
    confidence: '/ˈkɑːnfədəns/',
    booked: '/bʊkt/'
  };

  const DEFINITIONS = {
    pronunciation: {
      forms: [],
      meanings: [
        {
          partOfSpeech: 'noun',
          definitions: [
            { definition: 'The way a word or a language is spoken.', example: 'Her pronunciation of "schedule" is American.' },
            { definition: 'The act of saying words out loud.' }
          ]
        }
      ]
    }
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pick = (keys) => {
    const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const out = {};
    list.forEach((key) => {
      if (key in store) out[key] = store[key];
    });
    return out;
  };

  window.chrome = {
    storage: {
      local: {
        get: async (keys) => pick(keys),
        set: async (values) => Object.assign(store, values),
        remove: async () => {}
      },
      onChanged: { addListener() {} }
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://dailyreads.example/why-pronunciation-matters', lastAccessed: 1 }],
      sendMessage: async () => ({ success: true })
    },
    runtime: {
      id: 'stub',
      onMessage: { addListener() {} },
      openOptionsPage() {},
      sendMessage: async (message) => {
        await wait(10);
        const key = (message.word || message.text || '').toLowerCase();
        switch (message.action) {
          case 'translate':
            return { result: TRANSLATIONS[message.text] || TRANSLATIONS[key] || null };
          case 'lookup-ipa':
            return { ipa: IPA[key] || null };
          case 'lookup-definitions':
            return { definitions: DEFINITIONS[key] || null };
          case 'translate-gemini':
            return { text: 'Small things can change a lot.' };
          default:
            return {};
        }
      }
    }
  };
})();
