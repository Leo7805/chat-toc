/**
 * Manages favorite ChatTOC prompts, including per-conversation persistence and
 * favorite button UI state.
 */
(function () {
  const STORAGE_PREFIX = 'chatToc:favorites:';

  let conversationKey = null;
  let favoritePromptIds = new Set();

  /**
   * Loads favorite prompts for the active conversation.
   * @param {Object} options
   * @param {string} options.conversationKey
   */
  function init(options) {
    conversationKey = options.conversationKey;
    favoritePromptIds = load();
  }

  /**
   * Returns whether a message is currently favorited.
   * @param {string} messageId
   * @returns {boolean}
   */
  function isFavorite(messageId) {
    return favoritePromptIds.has(messageId);
  }

  /**
   * Creates the favorite button for one navigator row and wires its click handler.
   * @param {Object} params
   * @param {HTMLElement} params.item Navigator row element.
   * @param {string} params.messageId ChatGPT message ID.
   * @returns {HTMLButtonElement}
   */
  function createButton({ item, messageId }) {
    const favoriteButton = document.createElement('button');

    favoriteButton.className = 'navigator-favorite-btn';
    favoriteButton.type = 'button';
    favoriteButton.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />
      </svg>
    `;

    applyState(item, favoriteButton, isFavorite(messageId));

    favoriteButton.addEventListener('click', (event) => {
      event.stopPropagation();

      const nextFavorite = toggle(messageId);

      applyState(item, favoriteButton, nextFavorite);
      window.ChatTocOutline?.syncFavoriteState?.();
      favoriteButton.blur();
    });

    return favoriteButton;
  }

  /**
   * Toggles one prompt's favorite state.
   * @param {string} messageId
   * @returns {boolean} true when the prompt is favorited after toggling.
   */
  function toggle(messageId) {
    if (!messageId) return false;

    if (favoritePromptIds.has(messageId)) {
      favoritePromptIds.delete(messageId);
    } else {
      favoritePromptIds.add(messageId);
    }

    save();
    return favoritePromptIds.has(messageId);
  }

  /**
   * Applies favorite state to a navigator row and its favorite button.
   * @param {HTMLElement} item
   * @param {HTMLButtonElement} favoriteButton
   * @param {boolean} isFavorite
   */
  function applyState(item, favoriteButton, isFavorite) {
    item.classList.toggle('navigator-item-favorite', isFavorite);
    favoriteButton.classList.toggle(
      'navigator-favorite-btn-active',
      isFavorite
    );
    favoriteButton.setAttribute('aria-pressed', String(isFavorite));
    favoriteButton.setAttribute(
      'aria-label',
      isFavorite ? 'Remove prompt favorite' : 'Favorite prompt'
    );
  }

  /**
   * Loads favorite prompt IDs from localStorage.
   * @returns {Set<string>}
   */
  function load() {
    try {
      const rawValue = localStorage.getItem(getStorageKey());
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];

      return new Set(Array.isArray(parsedValue) ? parsedValue : []);
    } catch {
      return new Set();
    }
  }

  /**
   * Persists favorite prompt IDs to localStorage.
   */
  function save() {
    try {
      localStorage.setItem(
        getStorageKey(),
        JSON.stringify([...favoritePromptIds])
      );
    } catch {}
  }

  /**
   * Returns the localStorage key for the active conversation.
   * @returns {string}
   */
  function getStorageKey() {
    return `${STORAGE_PREFIX}${conversationKey}`;
  }

  window.ChatTocPromptFavorite = {
    createButton,
    init,
    isFavorite,
  };
})();
