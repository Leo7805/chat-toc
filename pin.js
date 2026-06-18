/**
 * Manages pinned ChatTOC prompts, including per-conversation persistence and
 * pin button UI state.
 */
(function () {
  const STORAGE_PREFIX = 'chatToc:pinned:';

  let conversationKey = null;
  let pinnedPromptIds = new Set();

  /**
   * Loads pinned prompts for the active conversation.
   * @param {Object} options
   * @param {string} options.conversationKey
   */
  function init(options) {
    conversationKey = options.conversationKey;
    pinnedPromptIds = load();
  }

  /**
   * Returns whether a message is currently pinned.
   * @param {string} messageId
   * @returns {boolean}
   */
  function isPinned(messageId) {
    return pinnedPromptIds.has(messageId);
  }

  /**
   * Creates the pin button for one navigator row and wires its click handler.
   * @param {Object} params
   * @param {HTMLElement} params.item Navigator row element.
   * @param {string} params.messageId ChatGPT message ID.
   * @returns {HTMLButtonElement}
   */
  function createButton({ item, messageId }) {
    const pinButton = document.createElement('button');

    pinButton.className = 'navigator-pin-btn';
    pinButton.type = 'button';
    pinButton.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <g transform="rotate(45 12 12)">
          <path d="M8 4h8l-1 7 3 3v2H6v-2l3-3-1-7Z" />
          <path d="M12 16v5" />
        </g>
      </svg>
    `;

    applyState(item, pinButton, isPinned(messageId));

    pinButton.addEventListener('click', (event) => {
      event.stopPropagation();

      const nextPinned = toggle(messageId);

      applyState(item, pinButton, nextPinned);
      window.ChatTocOutline?.syncPinnedState?.();
      pinButton.blur();
    });

    return pinButton;
  }

  /**
   * Toggles one prompt's pinned state.
   * @param {string} messageId
   * @returns {boolean} true when the prompt is pinned after toggling.
   */
  function toggle(messageId) {
    if (!messageId) return false;

    if (pinnedPromptIds.has(messageId)) {
      pinnedPromptIds.delete(messageId);
    } else {
      pinnedPromptIds.add(messageId);
    }

    save();
    return pinnedPromptIds.has(messageId);
  }

  /**
   * Applies pinned state to a navigator row and its pin button.
   * @param {HTMLElement} item
   * @param {HTMLButtonElement} pinButton
   * @param {boolean} isPinned
   */
  function applyState(item, pinButton, isPinned) {
    item.classList.toggle('navigator-item-pinned', isPinned);
    pinButton.classList.toggle('navigator-pin-btn-active', isPinned);
    pinButton.setAttribute('aria-pressed', String(isPinned));
    pinButton.setAttribute(
      'aria-label',
      isPinned ? 'Unpin prompt' : 'Pin prompt'
    );
  }

  /**
   * Loads pinned prompt IDs from localStorage.
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
   * Persists pinned prompt IDs to localStorage.
   */
  function save() {
    try {
      localStorage.setItem(
        getStorageKey(),
        JSON.stringify([...pinnedPromptIds])
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

  window.ChatTocPin = {
    createButton,
    init,
    isPinned,
  };
})();
