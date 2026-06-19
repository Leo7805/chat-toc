/**
 * Manages marked ChatTOC prompts, including per-conversation persistence and
 * mark button UI state.
 */
(function () {
  const STORAGE_PREFIX = 'chatToc:marks:';

  let conversationKey = null;
  let markedPromptIds = new Set();

  /**
   * Loads marked prompts for the active conversation.
   * @param {Object} options
   * @param {string} options.conversationKey
   */
  function init(options) {
    conversationKey = options.conversationKey;
    markedPromptIds = load();
  }

  /**
   * Returns whether a message is currently marked.
   * @param {string} messageId
   * @returns {boolean}
   */
  function isMarked(messageId) {
    return markedPromptIds.has(messageId);
  }

  /**
   * Creates the mark button for one navigator row and wires its click handler.
   * @param {Object} params
   * @param {HTMLElement} params.item Navigator row element.
   * @param {string} params.messageId ChatGPT message ID.
   * @returns {HTMLButtonElement}
   */
  function createButton({ item, messageId }) {
    const markButton = document.createElement('button');

    markButton.className = 'navigator-mark-btn';
    markButton.type = 'button';
    markButton.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 3 2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.53l6.22-.9L12 3Z" />
      </svg>
    `;

    applyState(item, markButton, isMarked(messageId));

    markButton.addEventListener('click', (event) => {
      event.stopPropagation();

      const nextMarked = toggle(messageId);

      applyState(item, markButton, nextMarked);
      window.ChatTocOutline?.syncMarkState?.();
      markButton.blur();
    });

    return markButton;
  }

  /**
   * Toggles one prompt's mark state.
   * @param {string} messageId
   * @returns {boolean} true when the prompt is marked after toggling.
   */
  function toggle(messageId) {
    if (!messageId) return false;

    if (markedPromptIds.has(messageId)) {
      markedPromptIds.delete(messageId);
    } else {
      markedPromptIds.add(messageId);
    }

    save();
    return markedPromptIds.has(messageId);
  }

  /**
   * Applies mark state to a navigator row and its mark button.
   * @param {HTMLElement} item
   * @param {HTMLButtonElement} markButton
   * @param {boolean} isMarked
   */
  function applyState(item, markButton, isMarked) {
    item.classList.toggle('navigator-item-marked', isMarked);
    markButton.classList.toggle('navigator-mark-btn-active', isMarked);
    markButton.setAttribute('aria-pressed', String(isMarked));
    markButton.setAttribute(
      'aria-label',
      isMarked ? 'Unmark prompt' : 'Mark prompt'
    );
  }

  /**
   * Loads marked prompt IDs from localStorage.
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
   * Persists marked prompt IDs to localStorage.
   */
  function save() {
    try {
      localStorage.setItem(
        getStorageKey(),
        JSON.stringify([...markedPromptIds])
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

  window.ChatTocPromptMark = {
    createButton,
    init,
    isMarked,
  };
})();
