/**
 * Shared prompt storage helper for ChatTOC My Prompts.
 */
(function () {
  const storageKeys = ['chatToc:favorites', 'chatToc:myPrompts'];

  function isContextValid() {
    return (
      typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id
    );
  }

  function createPromptsStore() {
    let cache = [];
    let hydratePromise = null;

    function getCacheCopy() {
      return [...cache];
    }

    function setCache(prompts) {
      cache = Array.isArray(prompts) ? [...prompts] : [];
    }

    function wait(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
    }

    function readPromptsRecord() {
      return new Promise((resolve, reject) => {
        if (!isContextValid()) {
          reject(new Error('Invalid extension context'));
          return;
        }

        chrome.storage.local.get(storageKeys, (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          resolve(result);
        });
      });
    }

    function readPromptsList(result) {
      return Array.isArray(result['chatToc:myPrompts'])
        ? [...result['chatToc:myPrompts']]
        : [];
    }

    function readLegacyPrompts(result) {
      return Array.isArray(result['chatToc:favorites'])
        ? [...result['chatToc:favorites']]
        : [];
    }

    function migrateLegacyPrompts(prompts) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ 'chatToc:myPrompts': prompts }, () => {
          if (!chrome.runtime.lastError) {
            chrome.storage.local.remove('chatToc:favorites');
          }
          resolve();
        });
      });
    }

    async function hydrateFromStorage(maxAttempts = 3) {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await readPromptsRecord();
          const storedPrompts = readPromptsList(result);
          const legacyPrompts = readLegacyPrompts(result);

          if (legacyPrompts.length && !storedPrompts.length) {
            await migrateLegacyPrompts(legacyPrompts);
            return legacyPrompts;
          }

          return storedPrompts;
        } catch (error) {
          if (attempt < maxAttempts) {
            await wait(80 * attempt);
          }
        }
      }

      return getCacheCopy();
    }

    function hydrate() {
      if (!hydratePromise) {
        hydratePromise = hydrateFromStorage().then((prompts) => {
          setCache(prompts);
          return getCacheCopy();
        });
      }

      return hydratePromise;
    }

    if (isContextValid()) {
      try {
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName !== 'local') return;

          const promptChange = changes['chatToc:myPrompts'];
          if (!promptChange) return;

          setCache(promptChange.newValue || []);
        });
      } catch (e) {
        // Ignore listener registration failures.
      }
    }

    return {
      async getAll() {
        await hydrate();
        return getCacheCopy();
      },
      async saveAll(prompts) {
        const nextPrompts = Array.isArray(prompts) ? [...prompts] : [];
        await hydrate();
        setCache(nextPrompts);

        if (!isContextValid()) {
          return;
        }

        return new Promise((resolve) => {
          chrome.storage.local.set({ 'chatToc:myPrompts': nextPrompts }, () => {
            resolve();
          });
        });
      },
    };
  }

  window.ChatTocPromptStore = {
    create: createPromptsStore,
  };
})();
