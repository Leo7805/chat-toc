/**
 * Owns ChatTOC sidebar visibility, pinning, and auto-hide behavior.
 */
(function () {
  const PINNED_STORAGE_KEY = 'chatTocSidebarPinned';
  const WIDTH_SPOOF_MESSAGE_TYPE = 'CHATGPT_NAVIGATOR_SET_WIDTH_SPOOF';
  const AUTO_HIDE_DELAY_MS = 300;

  let sidebar = null;
  let toggleBtn = null;
  let pinBtn = null;
  let isPinned = true;
  let isHidden = false;
  let hideTimer = 0;

  /**
   * @param {HTMLElement} sidebarElement
   * @param {HTMLButtonElement} toggleButton
   */
  function init(sidebarElement, toggleButton) {
    sidebar = sidebarElement;
    toggleBtn = toggleButton;
    pinBtn = document.getElementById('sidebar-pin-btn');

    bindPinButton();
    bindToggleButton();
    bindAutoHide();
    setPinned(true, { persist: false });

    storageGet(PINNED_STORAGE_KEY, (savedPinned) => {
      if (typeof savedPinned === 'boolean') {
        setPinned(savedPinned, { persist: false });
      }

      finishInitializing();
    });
  }

  function bindPinButton() {
    if (!pinBtn) return;

    pinBtn.addEventListener('click', () => {
      setPinned(!isPinned, { persist: true });
    });
  }

  function bindToggleButton() {
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', (event) => {
      if (toggleBtn.dataset.dragged === 'true') {
        event.preventDefault();
        toggleBtn.dataset.dragged = 'false';
        return;
      }

      clearHideTimer();
      setHidden(!isHidden);
    });
  }

  function bindAutoHide() {
    if (!sidebar || !toggleBtn) return;

    sidebar.addEventListener('pointerenter', handleAutoHideEnter);
    toggleBtn.addEventListener('pointerenter', handleAutoHideEnter);
    sidebar.addEventListener('pointerleave', scheduleAutoHide);
    toggleBtn.addEventListener('pointerleave', scheduleAutoHide);
  }

  function handleAutoHideEnter() {
    if (isPinned) return;

    clearHideTimer();
    setHidden(false);
  }

  function scheduleAutoHide() {
    if (isPinned) return;

    clearHideTimer();
    hideTimer = window.setTimeout(() => {
      if (isPointerInside(sidebar) || isPointerInside(toggleBtn)) return;

      setHidden(true);
    }, AUTO_HIDE_DELAY_MS);
  }

  /**
   * @param {boolean} pinned
   * @param {{ persist?: boolean }} options
   */
  function setPinned(pinned, options = {}) {
    isPinned = pinned;
    clearHideTimer();

    pinBtn?.classList.toggle('sidebar-pin-active', isPinned);
    pinBtn?.setAttribute('aria-pressed', String(isPinned));
    pinBtn?.setAttribute(
      'aria-label',
      isPinned ? 'Enable sidebar auto-hide' : 'Pin sidebar open'
    );

    if (isPinned) {
      setHidden(false);
    } else if (!isPointerInside(sidebar) && !isPointerInside(toggleBtn)) {
      setHidden(true);
    }

    if (options.persist) {
      storageSet(PINNED_STORAGE_KEY, isPinned);
    }
  }

  function finishInitializing() {
    sidebar?.classList.remove('navigator-initializing');
  }

  /**
   * @param {boolean} hidden
   */
  function setHidden(hidden) {
    isHidden = hidden;

    sidebar?.classList.toggle('navigator-hidden', isHidden);
    sidebar?.setAttribute('aria-hidden', String(isHidden));
    if (sidebar && 'inert' in sidebar) {
      sidebar.inert = isHidden;
    }
    toggleBtn?.classList.toggle('sidebar-hidden', isHidden);
    toggleBtn?.classList.toggle('sidebar-visible', !isHidden);
    setWideViewportSpoofEnabled(!isHidden);
  }

  function clearHideTimer() {
    if (!hideTimer) return;

    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }

  /**
   * @param {Element | null} element
   * @returns {boolean}
   */
  function isPointerInside(element) {
    if (!element) return false;

    return element.matches(':hover');
  }

  /**
   * Enables the page-context width spoof only while the ChatTOC sidebar is open.
   * @param {boolean} enabled
   */
  function setWideViewportSpoofEnabled(enabled) {
    window.postMessage(
      {
        type: WIDTH_SPOOF_MESSAGE_TYPE,
        enabled,
      },
      '*'
    );
  }

  function storageGet(key, callback) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      callback(null);
      return;
    }

    chrome.storage.local.get([key], (result) => {
      callback(result?.[key] ?? null);
    });
  }

  function storageSet(key, value) {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

    chrome.storage.local.set({
      [key]: value,
    });
  }

  window.ChatTocSidebarVisibility = {
    init,
    setHidden,
    setPinned,
  };
})();
