/**
 * Manages ChatTOC Favorites, including local storage persistence,
 * CRUD modal dialogs, Favorites list rendering, and input autocompletion.
 */
(function () {
  let activeSort = 'updated_desc';
  let autocompleteMenu = null;
  let selectedMenuIndex = 0;
  let filteredFavoritesForMenu = [];
  let currentTextarea = null;

  /**
   * Retrieves favorites from chrome.storage.local.
   * @returns {Promise<Array>}
   */
  async function getFavorites() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['chatToc:favorites'], (result) => {
        resolve(result['chatToc:favorites'] || []);
      });
    });
  }

  /**
   * Persists favorites to chrome.storage.local.
   * @param {Array} favorites
   * @returns {Promise<void>}
   */
  async function saveFavorites(favorites) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ 'chatToc:favorites': favorites }, () => {
        resolve();
      });
    });
  }

  /**
   * Sorts the favorites list based on the chosen mode.
   * @param {Array} list
   * @param {string} sortMode
   * @returns {Array}
   */
  function sortFavorites(list, sortMode) {
    const sorted = [...list];
    if (sortMode === 'updated_desc') {
      sorted.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortMode === 'updated_asc') {
      sorted.sort((a, b) => a.updatedAt - b.updatedAt);
    } else if (sortMode === 'name_asc') {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortMode === 'name_desc') {
      sorted.sort((a, b) => b.title.localeCompare(a.title));
    }
    return sorted;
  }

  /**
   * Escapes text inserted into HTML templates.
   * @param {string} text
   * @returns {string}
   */
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"']/g, (char) => {
      const entities = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[char];
    });
  }

  /**
   * Creates the sorting toolbar.
   * @param {() => void} onSortChange Callback triggered when the sorting mode changes.
   * @param {() => void} onAddNew Callback triggered when the add button is clicked.
   * @returns {HTMLElement}
   */
  function createSortBar(onSortChange, onAddNew) {
    const bar = document.createElement('div');
    bar.className = 'favorites-sort-bar';
    bar.innerHTML = `
      <div class="sort-bar-left">
        <svg class="sort-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="15" y2="6"></line>
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="18" x2="18" y2="18"></line>
        </svg>
        <select class="favorites-sort-select" id="fav-sort-select">
          <option value="updated_desc">Newest Modified</option>
          <option value="updated_asc">Oldest Modified</option>
          <option value="name_asc">Title (A-Z)</option>
          <option value="name_desc">Title (Z-A)</option>
        </select>
      </div>
      <button id="favorites-add-new-btn" title="Create new prompt">+</button>
    `;

    const select = bar.querySelector('#fav-sort-select');
    select.value = activeSort;
    select.addEventListener('change', (e) => {
      activeSort = e.target.value;
      onSortChange();
    });

    const addBtn = bar.querySelector('#favorites-add-new-btn');
    addBtn.addEventListener('click', () => {
      onAddNew();
    });

    return bar;
  }

  /**
   * Opens the Create/Edit dialog for a favorite item.
   * @param {Object|null} item The item to edit, or null to create a new one.
   * @param {() => void} onSave Callback triggered when a save succeeds.
   */
  function showDialog(item = null, onSave = () => {}) {
    let modal = document.getElementById('chat-toc-fav-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'chat-toc-fav-modal';
      modal.className = 'fav-modal-overlay';
      document.body.appendChild(modal);
    }

    const isNew = !item || !item.id;
    const titleText = isNew ? (item?.title || '') : item.title;
    const contentText = item ? item.content : '';

    modal.innerHTML = `
      <div class="fav-modal-content">
        <h3 class="fav-modal-title">${isNew ? 'Create Favorite Prompt' : 'Edit Favorite Prompt'}</h3>
        <form id="fav-modal-form">
          <div class="fav-modal-field">
            <label for="fav-form-title">Title</label>
            <input type="text" id="fav-form-title" placeholder="e.g. Code Review Helper" value="${escapeHtml(titleText)}" required />
          </div>
          <div class="fav-modal-field">
            <label for="fav-form-content">Prompt Content</label>
            <textarea id="fav-form-content" placeholder="Type or paste your prompt content here..." required>${escapeHtml(contentText)}</textarea>
          </div>
          <div class="fav-modal-actions">
            <button type="button" id="fav-form-cancel" class="fav-btn fav-btn-secondary">Cancel</button>
            <button type="submit" id="fav-form-submit" class="fav-btn fav-btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = 'flex';
    const form = modal.querySelector('#fav-modal-form');
    const cancelBtn = modal.querySelector('#fav-form-cancel');

    // Focus the title input field
    modal.querySelector('#fav-form-title').focus();

    const closeModal = () => {
      modal.style.display = 'none';
    };

    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = modal.querySelector('#fav-form-title').value.trim();
      const content = modal.querySelector('#fav-form-content').value.trim();

      if (!title || !content) return;

      const favorites = await getFavorites();
      if (isNew) {
        const newFav = {
          id: 'fav-' + Date.now(),
          title,
          content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        favorites.push(newFav);
      } else {
        const index = favorites.findIndex((f) => f.id === item.id);
        if (index !== -1) {
          favorites[index].title = title;
          favorites[index].content = content;
          favorites[index].updatedAt = Date.now();
        }
      }

      await saveFavorites(favorites);
      closeModal();
      onSave();
    });
  }

  /**
   * Helper to insert text into ChatGPT's main input textarea.
   * @param {string} text
   */
  function insertIntoChatGPTInput(text) {
    const textarea = document.querySelector('textarea#prompt-textarea');
    if (!textarea) return;

    textarea.focus();

    // Use document.execCommand to trigger React input state updates
    try {
      document.execCommand('insertText', false, text);
    } catch (e) {
      // Fallback
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Renders the entire favorites view inside a container.
   * @param {HTMLElement} container
   * @param {string} searchQuery
   * @param {() => void} onRefresh
   */
  async function renderFavorites(container, searchQuery = '', onRefresh = () => {}) {
    container.innerHTML = '';

    const sortBar = createSortBar(onRefresh, () => {
      showDialog(null, onRefresh);
    });
    container.appendChild(sortBar);

    let list = await getFavorites();

    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.content.toLowerCase().includes(query)
      );
    }

    list = sortFavorites(list, activeSort);

    if (list.length === 0) {
      const emptyHint = document.createElement('p');
      emptyHint.className = 'navigator-hint';
      emptyHint.textContent = query
        ? 'No matching favorites.'
        : 'No favorites yet. Click + to add one, or right-click any prompt in the TOC list.';
      container.appendChild(emptyHint);
      return;
    }

    const listContainer = document.createElement('div');
    listContainer.className = 'favorites-items-container';

    list.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'navigator-item favorites-item-row';
      row.dataset.favId = item.id;

      const rowMain = document.createElement('div');
      rowMain.className = 'navigator-item-main';

      const rowText = document.createElement('span');
      rowText.className = 'navigator-item-text favorites-item-title';
      rowText.textContent = item.title;

      const actions = document.createElement('div');
      actions.className = 'favorites-item-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'fav-action-btn edit-fav-btn';
      editBtn.title = 'Edit';
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      `;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDialog(item, onRefresh);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'fav-action-btn delete-fav-btn';
      deleteBtn.title = 'Delete';
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
          const favorites = await getFavorites();
          const filtered = favorites.filter((f) => f.id !== item.id);
          await saveFavorites(filtered);
          onRefresh();
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);

      rowMain.appendChild(rowText);
      rowMain.appendChild(actions);
      row.appendChild(rowMain);

      row.addEventListener('click', () => {
        insertIntoChatGPTInput(item.content);
      });

      listContainer.appendChild(row);
    });

    container.appendChild(listContainer);
  }

  /**
   * Initializes the autocomplete overlay on ChatGPT's input textarea.
   */
  function initAutocomplete() {
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (target && target.id === 'prompt-textarea') {
        currentTextarea = target;
        handleTextareaInput(target);
      }
    });

    document.addEventListener('keydown', handleTextareaKeydown, true);

    document.addEventListener('click', (e) => {
      if (
        autocompleteMenu &&
        !autocompleteMenu.contains(e.target) &&
        e.target !== currentTextarea
      ) {
        closeAutocompleteMenu();
      }
    });
  }

  /**
   * Parses the textarea/contenteditable value and triggers the autocomplete menu if necessary.
   * @param {HTMLElement} textarea
   */
  async function handleTextareaInput(textarea) {
    let text = '';
    let textBeforeCursor = '';

    if (textarea.tagName === 'TEXTAREA') {
      text = textarea.value;
      textBeforeCursor = text.slice(0, textarea.selectionStart);
    } else {
      // For contenteditable div (ChatGPT's ProseMirror editor)
      text = textarea.innerText || '';
      try {
        const selection = window.getSelection();
        if (selection.rangeCount) {
          const range = selection.getRangeAt(0);
          const preCaretRange = range.cloneRange();
          preCaretRange.selectNodeContents(textarea);
          preCaretRange.setEnd(range.endContainer, range.endOffset);
          textBeforeCursor = preCaretRange.toString();
        } else {
          textBeforeCursor = text;
        }
      } catch (e) {
        textBeforeCursor = text;
      }
    }

    // Look for command triggers:
    // 1. "//" (Double slash command trigger)
    // 2. "#" (Hash command trigger - requires at least one character after # to trigger)
    const doubleSlashMatch = textBeforeCursor.match(/(?:^|\s)\/\/([^\s]*)$/);
    const hashMatch = textBeforeCursor.match(/(?:^|\s)#([a-zA-Z0-9_\u4e00-\u9fa5]+)$/);

    const words = textBeforeCursor.trim().split(/\s+/);
    const lastWord = words[words.length - 1] || '';

    const favorites = await getFavorites();
    let matches = [];
    let triggerText = '';

    if (doubleSlashMatch) {
      triggerText = doubleSlashMatch[0];
      const query = doubleSlashMatch[1].toLowerCase();
      matches = favorites.filter(
        (fav) =>
          fav.title.toLowerCase().includes(query) ||
          fav.content.toLowerCase().includes(query)
      );
    } else if (hashMatch) {
      triggerText = hashMatch[0];
      const query = hashMatch[1].toLowerCase();
      matches = favorites.filter(
        (fav) =>
          fav.title.toLowerCase().includes(query) ||
          fav.content.toLowerCase().includes(query)
      );
    } else if (lastWord.length >= 2 && !lastWord.includes('#') && !lastWord.includes('/')) {
      // Trigger fuzzy title match for typed words of length >= 2, ignoring words containing triggers
      matches = favorites.filter((fav) =>
        fav.title.toLowerCase().includes(lastWord.toLowerCase())
      );
      triggerText = lastWord;
    }

    if (matches.length > 0) {
      showAutocompleteMenu(textarea, matches, triggerText);
    } else {
      closeAutocompleteMenu();
    }
  }

  /**
   * Displays the autocomplete floating overlay.
   * @param {HTMLElement} textarea
   * @param {Array} matches
   * @param {string} triggerText
   */
  function showAutocompleteMenu(textarea, matches, triggerText) {
    filteredFavoritesForMenu = matches;
    selectedMenuIndex = Math.min(selectedMenuIndex, matches.length - 1);

    if (!autocompleteMenu) {
      autocompleteMenu = document.createElement('div');
      autocompleteMenu.id = 'chat-toc-autocomplete-menu';
      document.body.appendChild(autocompleteMenu);
    }

    renderAutocompleteMenuContent();

    const rect = textarea.getBoundingClientRect();
    autocompleteMenu.style.position = 'fixed';
    autocompleteMenu.style.left = `${rect.left}px`;
    autocompleteMenu.style.width = `${rect.width}px`;
    autocompleteMenu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    autocompleteMenu.style.display = 'block';
    autocompleteMenu.dataset.triggerText = triggerText;
  }

  /**
   * Renders the autocomplete suggestions items.
   */
  function renderAutocompleteMenuContent() {
    if (!autocompleteMenu) return;

    autocompleteMenu.innerHTML = '';
    filteredFavoritesForMenu.forEach((fav, index) => {
      const item = document.createElement('div');
      item.className = 'autocomplete-menu-item';
      if (index === selectedMenuIndex) {
        item.classList.add('autocomplete-menu-item-active');
      }

      item.innerHTML = `
        <div class="autocomplete-item-title">${escapeHtml(fav.title)}</div>
        <div class="autocomplete-item-preview">${escapeHtml(
          fav.content.slice(0, 80)
        )}${fav.content.length > 80 ? '...' : ''}</div>
      `;

      item.addEventListener('click', () => {
        selectAutocompleteItem(fav);
      });

      autocompleteMenu.appendChild(item);
    });
  }

  /**
   * Inserts the selected favorite content into the input element, replacing the trigger text.
   * Handles both TEXTAREA and contenteditable containers cleanly.
   * @param {Object} fav
   */
  function selectAutocompleteItem(fav) {
    if (!currentTextarea || !autocompleteMenu) return;

    const textarea = currentTextarea;
    const triggerText = autocompleteMenu.dataset.triggerText || '';

    if (textarea.tagName === 'TEXTAREA') {
      const text = textarea.value;
      const selectionStart = textarea.selectionStart;
      const textBeforeCursor = text.slice(0, selectionStart);
      const textAfterCursor = text.slice(selectionStart);

      const triggerIndex = textBeforeCursor.lastIndexOf(triggerText);
      if (triggerIndex !== -1) {
        const newTextBeforeCursor = textBeforeCursor.slice(0, triggerIndex);
        textarea.focus();
        textarea.value = newTextBeforeCursor + fav.content + textAfterCursor;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        const newCursorPos = triggerIndex + fav.content.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }
    } else {
      // For contenteditable div (ChatGPT's ProseMirror editor)
      textarea.focus();
      const selection = window.getSelection();
      if (selection.rangeCount) {
        const range = selection.getRangeAt(0);
        let textNode = range.endContainer;

        // If selection container is not a text node (e.g. wrapper element), find the text node
        if (textNode.nodeType !== Node.TEXT_NODE) {
          const offset = range.endOffset;
          if (textNode.childNodes[offset - 1]) {
            textNode = textNode.childNodes[offset - 1];
            while (textNode && textNode.nodeType !== Node.TEXT_NODE) {
              textNode = textNode.lastChild;
            }
          }
        }

        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
          const textContent = textNode.textContent;
          const offset = range.endContainer === textNode ? range.endOffset : textNode.textContent.length;
          const textBefore = textContent.slice(0, offset);

          const triggerIndex = textBefore.lastIndexOf(triggerText);
          if (triggerIndex !== -1) {
            // Select exactly the trigger text (e.g. "//" or "#" or words matching title)
            const replaceRange = document.createRange();
            replaceRange.setStart(textNode, triggerIndex);
            replaceRange.setEnd(textNode, offset);

            selection.removeAllRanges();
            selection.addRange(replaceRange);

            // Replace selection with favorite content
            document.execCommand('insertText', false, fav.content);
          }
        } else {
          // Direct fallback insertion at current cursor
          document.execCommand('insertText', false, fav.content);
        }
      }
    }

    closeAutocompleteMenu();
  }

  /**
   * Keydown handler for ArrowUp/Down, Enter, Tab, and Escape on the autocomplete dropdown.
   * @param {KeyboardEvent} e
   */
  function handleTextareaKeydown(e) {
    if (!autocompleteMenu || autocompleteMenu.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      selectedMenuIndex = (selectedMenuIndex + 1) % filteredFavoritesForMenu.length;
      renderAutocompleteMenuContent();
      scrollActiveAutocompleteItemIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      selectedMenuIndex =
        (selectedMenuIndex - 1 + filteredFavoritesForMenu.length) %
        filteredFavoritesForMenu.length;
      renderAutocompleteMenuContent();
      scrollActiveAutocompleteItemIntoView();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const selectedFav = filteredFavoritesForMenu[selectedMenuIndex];
      if (selectedFav) {
        selectAutocompleteItem(selectedFav);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeAutocompleteMenu();
    }
  }

  /**
   * Scroll active menu item into view when navigating via keyboard keys.
   */
  function scrollActiveAutocompleteItemIntoView() {
    const activeItem = autocompleteMenu.querySelector('.autocomplete-menu-item-active');
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  /**
   * Closes the autocomplete suggestions popup.
   */
  function closeAutocompleteMenu() {
    if (autocompleteMenu) {
      autocompleteMenu.style.display = 'none';
      filteredFavoritesForMenu = [];
      selectedMenuIndex = 0;
    }
  }

  // Export module API to window scope
  window.ChatTocFavorites = {
    getFavorites,
    saveFavorites,
    showDialog,
    renderFavorites,
    initAutocomplete,
    insertIntoChatGPTInput,
  };
})();
