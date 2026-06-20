/**
 * Owns ChatTOC sidebar visibility, pinning, and auto-hide behavior.
 */
(function () {
  const PINNED_STORAGE_PREFIX = 'chatTocSidebarPinned:';
  const WIDTH_SPOOF_MESSAGE_TYPE = 'CHATGPT_NAVIGATOR_SET_WIDTH_SPOOF';
  const AUTO_HIDE_DELAY_MS = 300;

  let sidebar = null;
  let toggleBtn = null;
  let pinBtn = null;
  let isPinned = true;
  let isHidden = false;
  let hideTimer = 0;
  let getPageKey = () => location.pathname;

  /**
   * @param {HTMLElement} sidebarElement
   * @param {HTMLButtonElement} toggleButton
   * @param {Object} [options]
   * @param {() => string} [options.getPageKey]
   */
  function init(sidebarElement, toggleButton, options = {}) {
    sidebar = sidebarElement;
    toggleBtn = toggleButton;
    pinBtn = document.getElementById('sidebar-pin-btn');
    getPageKey =
      typeof options.getPageKey === 'function' ? options.getPageKey : getPageKey;

    bindPinButton();
    bindToggleButton();
    bindAutoHide();
    loadPinnedState();
    finishInitializing();
  }

  function syncPageState() {
    loadPinnedState();
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

    document.addEventListener('pointerover', handleDocumentPointerOver, true);
    document.addEventListener('pointerout', handleDocumentPointerOut, true);
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
      if (
        isPointerInside(sidebar) ||
        isPointerInside(toggleBtn) ||
        isPointerInsidePreviewTooltip()
      ) {
        return;
      }

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

    updatePinButtonState();

    if (isPinned) {
      setHidden(false);
    } else if (
      !isPointerInside(sidebar) &&
      !isPointerInside(toggleBtn) &&
      !isPointerInsidePreviewTooltip()
    ) {
      setHidden(true);
    }

    if (options.persist) {
      storageSet(getPinnedStorageKey(), isPinned);
    }
  }

  function getPinnedStorageKey() {
    return `${PINNED_STORAGE_PREFIX}${getPageKey()}`;
  }

  function loadPinnedState() {
    const savedPinned = storageGet(getPinnedStorageKey());
    const nextPinned = typeof savedPinned === 'boolean' ? savedPinned : true;

    isPinned = nextPinned;
    clearHideTimer();
    updatePinButtonState();
    setHidden(isPinned ? false : true);
  }

  function updatePinButtonState() {
    pinBtn?.classList.toggle('sidebar-pin-active', isPinned);
    pinBtn?.setAttribute('aria-pressed', String(isPinned));
    pinBtn?.setAttribute(
      'aria-label',
      isPinned ? 'Enable sidebar auto-hide' : 'Pin sidebar open'
    );
  }

  function finishInitializing() {
    sidebar?.classList.remove('navigator-initializing');

    window.requestAnimationFrame(() => {
      sidebar?.classList.add('navigator-ready');
    });
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

  function isPointerInsidePreviewTooltip() {
    const tooltip = document.getElementById('navigator-preview-tooltip');
    return !!tooltip && tooltip.classList.contains('visible') && tooltip.matches(':hover');
  }

  function handleDocumentPointerOver(event) {
    if (!isTooltipEvent(event)) return;

    if (isPinned) return;

    clearHideTimer();
    setHidden(false);
  }

  function handleDocumentPointerOut(event) {
    if (!isTooltipEvent(event)) return;

    scheduleAutoHide();
  }

  function isTooltipEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) return false;

    return !!target.closest('#navigator-preview-tooltip');
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

  function storageGet(key) {
    try {
      const rawValue = sessionStorage.getItem(key);

      return rawValue ? JSON.parse(rawValue) : null;
    } catch {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }

  window.ChatTocSidebarVisibility = {
    init,
    setHidden,
    setPinned,
    syncPageState,
  };
})();
