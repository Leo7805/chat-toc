/**
 * Main ChatTOC content script. It builds the sidebar UI, listens for captured
 * ChatGPT conversation data, and coordinates the helper modules loaded before
 * this file by manifest.json.
 */
let conversationMessages = [];
let navigatorSearchQuery = ''; // filter navigator items by this query, set by the search input in the sidebar
let currentConversationKey = null;
let pendingNewChatRouteKey = null;
let pendingNewChatMessage = null;
let activeNavigatorIndex = null;

/* Use to highlight current prompt*/
let navigatorItems = [];
let activePromptObserver = null;
let activePromptMutationObserver = null;
let activePromptMutationTimer = null;
let activeNativeTocObserver = null;
let activeNativeTocTimer = null;
let lockedNavigatorIndex = null;
let lockedNavigatorTimer = null;

const NAVIGATOR_EMPTY_HINT_TEXT = 'Waiting for prompts...';
const NATIVE_PROMPT_BUTTON_SELECTORS = [
  'button[aria-label^="Prompt "]',
  'button[aria-label^="prompt "]',
  'button[aria-description^="Prompt "]',
  'button[aria-description^="prompt "]',
];
const NATIVE_PROMPT_BUTTON_SELECTOR = NATIVE_PROMPT_BUTTON_SELECTORS.join(',');
const ACTIVE_NATIVE_PROMPT_BUTTON_SELECTOR = NATIVE_PROMPT_BUTTON_SELECTORS.map(
  (selector) => `${selector}[data-toc-active]`
).join(',');

/**
 * Injects pageHook.js into the real page context.
 * Content scripts run in an isolated world, so we need this injected script
 * to hook the page's own fetch calls.
 */
function injectFetchHook() {
  const script = document.createElement('script');

  script.src = chrome.runtime.getURL('pageHook.js');

  script.onload = () => {
    script.remove(); // Clean up after execution
  };

  document.documentElement.appendChild(script);
}

/**
 * Resolves once document.body exists. The content script runs at
 * document_start, so body may not be available immediately.
 * @returns {Promise<HTMLElement>}
 */
function waitForBody() {
  return new Promise((resolve) => {
    if (document.body) {
      resolve(document.body);
      return;
    }

    const timer = setInterval(() => {
      if (document.body) {
        clearInterval(timer);
        resolve(document.body);
      }
    }, 50);
  });
}

/**
 * Creates the floating sidebar.
 */
async function createSidebar() {
  await waitForBody();

  const sidebar = document.createElement('div');
  const conversationTitle = escapeHtml(getConversationTitle());

  sidebar.id = 'conversation-navigator-sidebar';

  sidebar.innerHTML = `
    <div id="navigator-resizer"></div>
    <div class="navigator-topbar">
      <div class="navigator-header">
        <h2 id="navigator-title">${conversationTitle}</h2>
        <button class="navigator-icon-btn" id="refresh-toc-btn" type="button" aria-label="Refresh TOC">
          <span aria-hidden="true">⟳</span>
        </button>
      </div>

      <p class="navigator-hint">
        ${NAVIGATOR_EMPTY_HINT_TEXT}
      </p>

      <input
        id="navigator-search"
        type="search"
        placeholder="Search prompts..."
        autocomplete="off"
      />
    </div>

    <div class="navigator-action-rail">
      <button class="navigator-icon-btn" id="jump-chat-top-btn" type="button" aria-label="Jump to top">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 5h12M12 19V9M7 14l5-5 5 5" />
        </svg>
      </button>
      <button class="navigator-icon-btn" id="jump-chat-bottom-btn" type="button" aria-label="Jump to bottom">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 19h12M12 5v10M7 10l5 5 5-5" />
        </svg>
      </button>
    </div>

    <div id="navigator-list"></div>
	`;

  document.body.appendChild(sidebar);
  initNavigatorFollow();
  initNavigatorJump();

  document
    .getElementById('refresh-toc-btn')
    .addEventListener('click', reloadCurrentPageData);
  document
    .getElementById('jump-chat-top-btn')
    .addEventListener('click', () =>
      window.ChatTocJump.jumpToConversationEdge('top')
    );
  document
    .getElementById('jump-chat-bottom-btn')
    .addEventListener('click', () =>
      window.ChatTocJump.jumpToConversationEdge('bottom')
    );

  document
    .getElementById('navigator-search')
    .addEventListener('input', (event) => {
      navigatorSearchQuery = event.target.value;
      buildNavigator();
    });

  return sidebar;
}

/**
 * Wires the sidebar-follow state machine to native ChatGPT active prompt APIs.
 */
function initNavigatorFollow() {
  window.ChatTocFollow.init({
    listSelector: '#navigator-list',
    ignoredScrollSelector:
      '#conversation-navigator-sidebar, #navigator-tooltip',
    getNativeActiveIndex: findActiveNativePromptIndex,
    setActiveIndex: setActiveNavigatorItem,
  });
}

/**
 * Wires prompt jump behavior to native ChatGPT prompt buttons and active locks.
 */
function initNavigatorJump() {
  window.ChatTocJump.init({
    getNativePromptButtons,
    normalizeText,
    lockActiveIndex: lockActiveNavigatorItem,
  });
}

/**
 * Loads pin state for the current ChatGPT route.
 */
function initPinnedPrompts() {
  window.ChatTocPin.init({
    conversationKey: getCurrentConversationKey(),
  });
}

/**
 * Enables drag resizing for the sidebar.
 * @param {HTMLElement} sidebar
 */
function initSidebarResize(sidebar) {
  const resizer = document.getElementById('navigator-resizer');

  if (!resizer) return;

  resizer.addEventListener('mousedown', (event) => {
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;

    function handleMouseMove(moveEvent) {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.min(520, Math.max(240, startWidth + delta));

      sidebar.style.setProperty('--navigator-width', `${nextWidth}px`);
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });
}

/**
 * Derives the visible conversation title from ChatGPT's sidebar when possible,
 * then falls back to the document title.
 */
function getConversationTitle() {
  const match = location.pathname.match(/\/c\/([^/]+)/);
  const conversationId = match?.[1];

  if (conversationId) {
    const conversationLink = document.querySelector(
      `a[href*="/c/${conversationId}"]`
    );

    const sidebarTitle = conversationLink?.innerText?.trim();

    if (sidebarTitle) {
      return sidebarTitle;
    }
  }

  return (
    document.title
      .replace(/\s*[-–]\s*ChatGPT$/i, '')
      .replace(/^ChatGPT\s*[-–]\s*/i, '')
      .trim() || 'ChatTOC'
  );
}

/**
 * Returns the route key used to reset local state when ChatGPT SPA navigation
 * switches between conversations without reloading the content script.
 */
function getCurrentConversationKey() {
  const match = location.pathname.match(/\/c\/([^/]+)/);

  return match?.[1] || `new-chat:${location.pathname}`;
}

/**
 * Returns whether a route key belongs to ChatGPT's pre-conversation new-chat
 * route.
 * @param {string} routeKey
 * @returns {boolean}
 */
function isNewChatRouteKey(routeKey) {
  return routeKey.startsWith('new-chat:');
}

/**
 * Clears new-chat creation state once a real conversation payload arrives or
 * the user navigates somewhere unrelated.
 */
function clearPendingNewChat() {
  pendingNewChatRouteKey = null;
  pendingNewChatMessage = null;
}

/**
 * Appends one streamed user message if it is not already represented.
 * @param {Object} newMessage
 * @returns {boolean} Whether the message was added.
 */
function appendNavigatorMessage(newMessage) {
  const exists = conversationMessages.some(
    (message) => message.id === newMessage.id
  );

  if (exists) return false;

  const normalizedMessage =
    window.ChatTocMessages.createNavigatorMessage(newMessage);

  conversationMessages.push(normalizedMessage);
  return true;
}

/**
 * Moves a new-chat message captured before route creation into the new
 * conversation after ChatGPT navigates to /c/<id>.
 */
function flushPendingNewChatMessage() {
  if (!pendingNewChatMessage) return;

  const didAppend = appendNavigatorMessage(pendingNewChatMessage);
  clearPendingNewChat();

  if (didAppend) {
    buildNavigator({
      refreshObservers: true,
    });
  }
}

/**
 * Escapes text inserted into sidebar HTML templates.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
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
 * Reloads the page so ChatGPT and ChatTOC both rebuild from fresh state.
 */
function reloadCurrentPageData() {
  location.reload();
}

/**
 * Clears all per-conversation UI state after an in-page route change.
 */
function resetNavigatorStateForCurrentRoute() {
  // ChatGPT is a SPA, so switching chats can keep this content script alive.
  // Clear per-conversation state when the route changes.
  conversationMessages = [];
  initPinnedPrompts();
  activeNavigatorIndex = null;
  window.ChatTocOutline?.reset?.();
  navigatorItems = [];
  navigatorSearchQuery = '';

  const search = document.getElementById('navigator-search');
  const title = document.getElementById('navigator-title');

  if (search) {
    search.value = '';
  }

  if (title) {
    title.textContent = getConversationTitle();
  }

  window.ChatTocTooltip.hide();
  buildNavigator({
    refreshObservers: true,
  });
}

/**
 * Detects ChatGPT route changes and resets the navigator when the active
 * conversation changes.
 */
function syncNavigatorRouteState() {
  const nextConversationKey = getCurrentConversationKey();

  if (currentConversationKey === null) {
    currentConversationKey = nextConversationKey;
    return;
  }

  if (nextConversationKey === currentConversationKey) {
    return;
  }

  const isNewChatCreationRoute =
    isNewChatRouteKey(currentConversationKey) &&
    !isNewChatRouteKey(nextConversationKey);

  if (isNewChatCreationRoute) {
    pendingNewChatRouteKey = currentConversationKey;
  } else {
    clearPendingNewChat();
  }

  currentConversationKey = nextConversationKey;
  resetNavigatorStateForCurrentRoute();
  flushPendingNewChatMessage();
}

/**
 * Polls for SPA route changes because ChatGPT does not always trigger a full
 * page load or a reliable browser navigation event.
 */
function listenForRouteChanges() {
  currentConversationKey = getCurrentConversationKey();
  initPinnedPrompts();

  // ChatGPT route changes do not always trigger a full page load.
  setInterval(syncNavigatorRouteState, 250);
}

/**
 * Builds the sidebar list from conversationMessages.
 * @param {Object} [options]
 * @param {boolean} [options.refreshObservers=false] Whether to re-observe page messages after rebuilding.
 */
function buildNavigator({ refreshObservers = false } = {}) {
  const list = document.getElementById('navigator-list');
  const hint = document.querySelector('.navigator-hint');

  if (!list) return;

  list.innerHTML = '';
  navigatorItems = []; // Reset navigator items for new build
  window.ChatTocOutline?.resetPromptItems?.();
  window.ChatTocOutline?.setPromptMessages?.(conversationMessages);

  // Filter messages by search query
  const normalizedQuery = normalizeText(navigatorSearchQuery).toLowerCase();

  const visibleMessages = conversationMessages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => {
      if (!normalizedQuery) return true;

      return normalizeText(message.text)
        .toLowerCase()
        .includes(normalizedQuery);
    });

  if (hint) {
    const hasMessages = conversationMessages.length > 0;
    const hasQuery = normalizedQuery.length > 0;

    hint.hidden = hasMessages && (!hasQuery || visibleMessages.length > 0);

    hint.textContent = hasQuery
      ? 'No matching prompts.'
      : NAVIGATOR_EMPTY_HINT_TEXT;
  }

  // Build navigator items for visible messages
  visibleMessages.forEach(({ message, index }) => {
    const fullText = message.text.replace(/\s+/g, ' ');

    const item = document.createElement('div');
    const itemMain = document.createElement('div');
    const itemText = document.createElement('span');

    item.dataset.messageIndex = String(index);
    item.className = 'navigator-item';

    if (index === activeNavigatorIndex) {
      item.classList.add('navigator-item-active');
    }

    const pinButton = window.ChatTocPin.createButton({
      item,
      messageId: message.id,
    });

    itemMain.className = 'navigator-item-main';

    itemText.className = 'navigator-item-text';
    itemText.textContent = `${index + 1}. ${fullText}`;

    const outlineControls = window.ChatTocOutline?.createPromptItem?.({
      item,
      index,
      messageId: message.id,
    });

    navigatorItems[index] = item;

    item.addEventListener('click', () => {
      handleNavigatorItemClick(message, index);
    });

    itemMain.append(
      itemText,
      outlineControls?.outlineIndicator || document.createElement('span'),
      pinButton
    );
    item.append(itemMain);

    if (outlineControls?.outlineList) {
      item.appendChild(outlineControls.outlineList);
    }

    list.appendChild(item);

    item.addEventListener('mouseenter', (event) => {
      if (isTextTruncated(itemText)) {
        window.ChatTocTooltip.show(message.text, event);
      }
    });

    item.addEventListener('mouseleave', () => {
      window.ChatTocTooltip.hide();
    });
  });

  if (refreshObservers) {
    observeVisibleUserMessages();
  }
}

/**
 * Handles prompt row clicks, including outline toggling and chat navigation.
 * @param {Object} message
 * @param {number} index
 */
function handleNavigatorItemClick(message, index) {
  window.ChatTocTooltip.hide();

  const outlineAction = window.ChatTocOutline?.handlePromptNavigation?.(
    index,
    activeNavigatorIndex
  );

  window.ChatTocJump.jumpToMessage(message, index);

  if (outlineAction?.shouldBuild) {
    window.ChatTocOutline?.scheduleBuild?.(index);
  }
}

/**
 * Returns whether an element's text overflows its visible width.
 * @param {HTMLElement} element
 * @returns {boolean}
 */
function isTextTruncated(element) {
  return element.scrollWidth > element.clientWidth;
}

/**
 * Normalizes whitespace for prompt text comparisons and search.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Applies active styling immediately, ignoring any temporary navigation lock.
 * @param {number} index
 */
function forceActiveNavigatorItem(index) {
  activeNavigatorIndex = index;

  navigatorItems.forEach((item) => {
    item.classList.remove('navigator-item-active');
  });

  const item = navigatorItems[index];

  if (!item) return;

  item.classList.add('navigator-item-active');

  scrollNavigatorItemIntoView(item);
}

/**
 * Sets the active navigator item unless a click-triggered navigation lock is
 * temporarily preserving another item.
 * @param {number} index
 */
function setActiveNavigatorItem(index) {
  if (
    lockedNavigatorIndex !== null &&
    index !== lockedNavigatorIndex &&
    lockedNavigatorTimer
  ) {
    return;
  }

  forceActiveNavigatorItem(index);
}

/**
 * Keeps a clicked navigator item highlighted while ChatGPT performs its own
 * virtualized scroll.
 * @param {number} index
 * @param {number} duration
 */
function lockActiveNavigatorItem(index, duration = 1800) {
  clearTimeout(lockedNavigatorTimer);

  window.ChatTocFollow.keepFollowing(duration);
  lockedNavigatorIndex = index;
  forceActiveNavigatorItem(index);

  lockedNavigatorTimer = setTimeout(() => {
    lockedNavigatorIndex = null;
    lockedNavigatorTimer = null;
  }, duration);
}

/**
 * Scroll the given navigator item into view if it's not fully visible in the sidebar.
 * @param {HTMLElement} item
 */
function scrollNavigatorItemIntoView(item) {
  const scrollContainer = document.getElementById('navigator-list');

  if (!scrollContainer) return;
  if (!window.ChatTocFollow.isFollowing()) return;

  const itemRect = item.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();

  const topPadding = 56;
  const bottomPadding = 80;

  const isAbove = itemRect.top < containerRect.top + topPadding;
  const isBelow = itemRect.bottom > containerRect.bottom - bottomPadding;

  if (!isAbove && !isBelow) return;

  const nextScrollTop = isAbove
    ? scrollContainer.scrollTop + itemRect.top - containerRect.top - topPadding
    : scrollContainer.scrollTop +
      itemRect.bottom -
      containerRect.bottom +
      bottomPadding;

  scrollContainer.scrollTo({
    top: nextScrollTop,
    behavior: 'smooth',
  });
}

/**
 * Find the index of the conversation message that matches the given DOM element, by comparing their text content.
 * @param {HTMLElement} element
 * @returns {number} The index of the conversation message that matches the given element, or -1 if not found.
 */
function findConversationIndexByElement(element) {
  const domText = normalizeText(element.innerText);

  const textMatchedIndex = conversationMessages.findIndex((message) => {
    if (!message.canMatchByText) return false;

    const messageText = normalizeText(message.text);

    return domText === messageText || domText.includes(messageText);
  });

  if (textMatchedIndex !== -1) {
    return textMatchedIndex;
  }

  const visibleUserMessages = Array.from(
    document.querySelectorAll('[data-message-author-role="user"]')
  );

  if (visibleUserMessages.length === conversationMessages.length) {
    return visibleUserMessages.indexOf(element);
  }

  return -1;
}

/**
 * Returns ChatGPT's built-in prompt navigator buttons in display order.
 * This native TOC is the reliable index source for virtualized file/image
 * prompts because ChatGPT owns that state.
 * @returns {HTMLElement[]}
 */
function getNativePromptButtons() {
  return Array.from(document.querySelectorAll(NATIVE_PROMPT_BUTTON_SELECTOR));
}

/**
 * Parses ChatGPT's native one-based prompt label into ChatTOC's zero-based index.
 * @param {HTMLElement} button
 * @returns {number}
 */
function getNativePromptIndexFromButton(button) {
  const label =
    button.getAttribute('aria-label') ||
    button.getAttribute('aria-description') ||
    '';
  const match = label.match(/^prompt\s+(\d+)$/i);

  return match ? Number(match[1]) - 1 : -1;
}

/**
 * Reads the active prompt index from ChatGPT's built-in TOC.
 * @returns {number} The active prompt index, or -1 if no native active item exists.
 */
function findActiveNativePromptIndex() {
  const activeButton = document.querySelector(
    ACTIVE_NATIVE_PROMPT_BUTTON_SELECTOR
  );

  if (!activeButton) return -1;

  const labelIndex = getNativePromptIndexFromButton(activeButton);

  if (labelIndex !== -1) return labelIndex;

  const buttons = getNativePromptButtons();

  return activeButton ? buttons.indexOf(activeButton) : -1;
}

/**
 * Syncs ChatTOC's active item from ChatGPT's native TOC when available.
 * @returns {boolean} true when native TOC provided an active index.
 */
function syncActiveNavigatorItemFromNativeToc() {
  const index = findActiveNativePromptIndex();

  if (index === -1) return false;

  setActiveNavigatorItem(index);
  return true;
}

/**
 * Observes user message elements in the page and updates the active navigator item based on which message is most visible in the viewport.
 * Uses IntersectionObserver to efficiently track visibility changes.
 */
function observeVisibleUserMessages() {
  if (activePromptObserver) {
    activePromptObserver.disconnect();
  }

  activePromptObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntries = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

      const topEntry = visibleEntries[0];

      if (!topEntry) return;

      if (syncActiveNavigatorItemFromNativeToc()) return;

      const index = findConversationIndexByElement(topEntry.target);

      if (index === -1) return;

      setActiveNavigatorItem(index);
    },
    {
      threshold: [0.1, 0.25, 0.5, 0.75, 1],
    }
  );

  document
    .querySelectorAll('[data-message-author-role="user"]')
    .forEach((element) => {
      activePromptObserver.observe(element);
    });
}

/**
 * Observes ChatGPT's built-in TOC active marker and mirrors it to ChatTOC.
 * This is the primary active-state source for image/file prompts.
 */
function initNativeTocActiveTracking() {
  if (activeNativeTocObserver) {
    activeNativeTocObserver.disconnect();
  }

  activeNativeTocObserver = new MutationObserver(() => {
    clearTimeout(activeNativeTocTimer);

    activeNativeTocTimer = setTimeout(() => {
      syncActiveNavigatorItemFromNativeToc();
    }, 100);
  });

  activeNativeTocObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-toc-active'],
    childList: true,
    subtree: true,
  });

  syncActiveNavigatorItemFromNativeToc();
}

/**
 * Init tracking of the active prompt in the viewport, and highlight the corresponding navigator item.
 */
function initActivePromptTracking() {
  if (activePromptMutationObserver) {
    activePromptMutationObserver.disconnect();
  }

  activePromptMutationObserver = new MutationObserver(() => {
    clearTimeout(activePromptMutationTimer);

    activePromptMutationTimer = setTimeout(() => {
      observeVisibleUserMessages();
    }, 200);
  });

  activePromptMutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  observeVisibleUserMessages();
  initNativeTocActiveTracking();
}

/**
 * Handles the full conversation payload captured by pageHook.js and rebuilds
 * the navigator from the active conversation branch.
 */
function handleConversationData(data) {
  if (!data || !data.mapping) {
    return;
  }

  const title = document.getElementById('navigator-title');

  if (title) {
    title.textContent = getConversationTitle();
  }

  conversationMessages = window.ChatTocMessages.extractUserMessages(data);

  buildNavigator({
    refreshObservers: true,
  });
}

/**
 * Listens for pageHook.js messages from the page context. Full conversation
 * payloads rebuild the TOC; streamed input_message events append the latest
 * prompt before ChatGPT performs a full conversation refetch.
 */
function listenForConversationData() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    syncNavigatorRouteState();

    if (event.data?.type === 'CHATGPT_CONVERSATION_DATA') {
      const routeKey = event.data.routeKey;

      if (routeKey && routeKey !== getCurrentConversationKey()) return;

      clearPendingNewChat();
      handleConversationData(event.data.payload);
    }

    if (event.data?.type === 'CHATGPT_NEW_USER_MESSAGE') {
      const routeKey = event.data.routeKey;
      const isCurrentRoute =
        !routeKey || routeKey === getCurrentConversationKey();
      const isMigratingNewChatMessage =
        routeKey && routeKey === pendingNewChatRouteKey;

      if (!isCurrentRoute && !isMigratingNewChatMessage) return;

      const newMessage = event.data.payload;
      const didAppend = appendNavigatorMessage(newMessage);

      if (isMigratingNewChatMessage) {
        clearPendingNewChat();
      } else if (routeKey && isNewChatRouteKey(routeKey)) {
        pendingNewChatMessage = newMessage;
      }

      if (didAppend) {
        buildNavigator({
          refreshObservers: true,
        });
      }
    }
  });
}

/**
 * Starts ChatTOC after all helper modules have been loaded by manifest.json.
 */
async function main() {
  injectFetchHook(); // Start intercepting conversation data
  initPinnedPrompts();

  listenForConversationData(); // Listen for data sent from the fetch hook

  const sidebar = await createSidebar();

  initSidebarResize(sidebar);
  listenForRouteChanges();
  initActivePromptTracking();
  window.ChatTocToggleButton.create(sidebar);

  window.ChatTocTooltip.init({
    anchorSelector: '#navigator-list',
  });
}

main();
