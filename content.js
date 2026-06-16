console.log('ChatGPT Conversation Navigator loaded');

// const collectedMessages = new Map();
let conversationMessages = [];
let tooltipHideTimer = null;

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
 * Creates the floating sidebar.
 */
function createSidebar() {
  const sidebar = document.createElement('div');

  sidebar.id = 'conversation-navigator-sidebar';

  sidebar.innerHTML = `
  <h2>Conversation Navigator</h2>
  <button id="refresh-toc-btn">Refresh TOC</button>
	  <p class="navigator-hint">
	    Waiting for conversation data...
	  </p>
	  <div id="navigator-list"></div>
	`;

  document.body.appendChild(sidebar);
  document
    .getElementById('refresh-toc-btn')
    .addEventListener('click', reloadCurrentPageData);

  return sidebar;
}

function reloadCurrentPageData() {
  location.reload();
}

function createTooltip() {
  if (document.getElementById('navigator-tooltip')) return;

  const tooltip = document.createElement('div');

  tooltip.id = 'navigator-tooltip';
  document.body.appendChild(tooltip);
}

/**
 * Creates the floating toggle button.
 */
function createToggleButton(sidebar) {
  const toggleBtn = document.createElement('button');

  toggleBtn.id = 'toggle-sidebar-btn';
  toggleBtn.innerHTML = '☰';

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('navigator-hidden');
  });

  document.body.appendChild(toggleBtn);
}

function getMessageDisplayText(message) {
  const content = message.content;
  const parts = content?.parts || [];
  const attachments = message.metadata?.attachments || [];

  const textParts = parts
    .map((part) => {
      if (typeof part === 'string') {
        return part.trim();
      }

      if (part?.content_type === 'image_asset_pointer') {
        return '[Image]';
      }

      if (part?.content_type) {
        return `[${part.content_type}]`;
      }

      return '';
    })
    .filter(Boolean);

  const attachmentParts = attachments.map((file) => {
    return `[File] ${file.name || 'Uploaded file'}`;
  });

  return [...attachmentParts, ...textParts].join('\n').trim();
}

function getOrderedConversationNodes(data) {
  const mapping = data.mapping;
  const orderedNodes = [];

  let currentNodeId = data.current_node;

  while (currentNodeId) {
    const node = mapping[currentNodeId];

    if (!node) break;

    orderedNodes.push(node);

    currentNodeId = node.parent;
  }

  return orderedNodes.reverse();
}

function extractUserMessages(data) {
  if (!data || !data.mapping) {
    console.warn('Invalid conversation data received');
    return [];
  }

  const orderedNodes = getOrderedConversationNodes(data);

  return orderedNodes
    .filter((node) => node.message?.author?.role === 'user')
    .map((node) => {
      const message = node.message;
      const text = getMessageDisplayText(message);

      return {
        id: message.id,
        text,
        createTime: message.create_time ?? 0,
      };
    })
    .filter((message) => message.text.length > 0);
}

/**
 * Builds the sidebar list from conversationMessages.
 */
function buildNavigator() {
  const list = document.getElementById('navigator-list');
  const hint = document.querySelector('.navigator-hint');

  if (!list) return;

  list.innerHTML = '';

  if (hint) {
    hint.textContent = `${conversationMessages.length} user messages found.`;
  }

  // conversationMessages.forEach((message, index) => {
  //   const fullText = message.text.replace(/\s+/g, ' ');

  //   const item = document.createElement('div');

  //   item.className = 'navigator-item';
  //   item.textContent = `${index + 1}. ${fullText}`;

  //   item.addEventListener('click', () => {
  //     jumpToPromptByIndex(index);
  //   });

  //   item.addEventListener('mouseenter', (event) => {
  //     showTooltip(message.text, event);
  //   });

  //   item.addEventListener('mouseleave', () => {
  //     hideTooltip();
  //   });

  //   list.appendChild(item);
  // });

  conversationMessages.forEach((message, index) => {
    const fullText = message.text.replace(/\s+/g, ' ');
    const shortTitle =
      fullText.length > 40 ? `${fullText.slice(0, 40)}...` : fullText;

    const item = document.createElement('div');

    item.className = 'navigator-item';
    item.textContent = `${index + 1}. ${shortTitle}`;
    item.title = fullText;

    // item.addEventListener('click', () => {
    //   jumpToMessage(message.id);
    // });
    item.addEventListener('click', () => {
      jumpToPromptByIndex(index);
    });

    item.addEventListener('mouseenter', (event) => {
      showTooltip(message.text, event);
    });

    item.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    list.appendChild(item);
  });
}

function showTooltip(text, event) {
  const tooltip = document.getElementById('navigator-tooltip');

  if (!tooltip) return;

  clearTimeout(tooltipHideTimer);
  tooltipHideTimer = null;

  tooltip.textContent = text;
  tooltip.classList.add('visible');

  const gap = 8;
  const margin = 16;
  const sidebar = document.getElementById('conversation-navigator-sidebar');
  const sidebarRect = sidebar?.getBoundingClientRect();

  let y = event.clientY + 15;

  const rect = tooltip.getBoundingClientRect();
  const x = sidebarRect
    ? Math.max(margin, sidebarRect.left - rect.width - gap)
    : Math.max(margin, event.clientX - rect.width - gap);

  if (y + rect.height > window.innerHeight) {
    y = window.innerHeight - rect.height - margin;
  }

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById('navigator-tooltip');

  if (!tooltip) return;

  clearTimeout(tooltipHideTimer);

  tooltipHideTimer = setTimeout(() => {
    tooltip.classList.remove('visible');
    tooltipHideTimer = null;
  }, 200);
}

function initTooltip() {
  const tooltip = document.getElementById('navigator-tooltip');

  if (!tooltip) return;

  tooltip.addEventListener('mouseenter', () => {
    clearTimeout(tooltipHideTimer);
  });

  tooltip.addEventListener('mouseleave', () => {
    hideTooltip();
  });
}

/**
 * Handles conversation data sent from pageHook.js.
 */
function handleConversationData(data) {
  if (!data || !data.mapping) {
    return;
  }

  console.log('[Navigator] Conversation refreshed');

  conversationMessages = extractUserMessages(data);

  console.log('[Navigator] User messages:', conversationMessages.length);

  buildNavigator();
}

/**
 * Listens for messages sent from pageHook.js.
 */
function listenForConversationData() {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'CHATGPT_CONVERSATION_DATA') {
      handleConversationData(event.data.payload);
    }

    // ❤️ Test - Listen for conversation update events
    // if (event.data?.type === 'CHATGPT_NEW_USER_MESSAGE') {
    //   const newMessage = event.data.payload;

    //   const exists = conversationMessages.some(
    //     (message) => message.id === newMessage.id
    //   );

    //   if (!exists) {
    //     conversationMessages.push(newMessage);
    //     buildNavigator();
    //   }
    // }

    if (event.data?.type === 'CHATGPT_NEW_USER_MESSAGE') {
      const newMessage = event.data.payload;

      console.log(
        '[Navigator] Captured input message:',
        newMessage.content?.parts?.join('\n')
      );
      console.log('[Navigator] New user message:', newMessage);
      console.log('[Navigator] before:', conversationMessages.length);

      const exists = conversationMessages.some(
        (message) => message.id === newMessage.id
      );

      if (!exists) {
        conversationMessages.push(newMessage);
        console.log('❤️[Navigator] after:', conversationMessages.length);
        buildNavigator();
      } else {
        console.log('❤️[Navigator] duplicate message ignored');
      }
    }
    // ❤️ End Test
  });
}

// function jumpToPromptByIndex(index) {
//   const buttons = Array.from(
//     document.querySelectorAll('[aria-label^="Prompt"]')
//   );

//   const button = buttons[index];

//   if (!button) {
//     console.log('Prompt button not found:', index + 1);
//     return;
//   }

//   button.click();
// }

function jumpToPromptByIndex(index) {
  const buttons = Array.from(
    document.querySelectorAll('[aria-label^="Prompt"]')
  );

  const button = buttons[index];

  if (!button) {
    console.log('[Navigator] Prompt button not found:', index + 1);
    return;
  }

  button.click();
}

function main() {
  injectFetchHook(); // Start intercepting conversation data
  listenForConversationData(); // Listen for data sent from the fetch hook

  const sidebar = createSidebar();

  createToggleButton(sidebar);

  createTooltip();
  initTooltip();
}

main();
