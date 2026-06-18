/**
 * Shared tooltip for truncated ChatTOC navigator text.
 */
(function () {
  const SHOW_DELAY_MS = 500;
  const HIDE_DELAY_MS = 200;

  let hideTimer = null;
  let showTimer = null;
  let anchorSelector = null;

  /**
   * Creates the tooltip element and wires tooltip hover behavior.
   * @param {Object} options
   * @param {string} options.anchorSelector Selector used to position the tooltip beside the sidebar.
   */
  function init(options = {}) {
    anchorSelector = options.anchorSelector || null;

    create();

    const tooltip = getTooltip();

    if (!tooltip) return;
    if (tooltip.dataset.initialized === 'true') return;

    tooltip.dataset.initialized = 'true';

    tooltip.addEventListener('mouseenter', () => {
      clearTimeout(hideTimer);
    });

    tooltip.addEventListener('mouseleave', () => {
      hide();
    });
  }

  /**
   * Creates the tooltip element if it does not already exist.
   */
  function create() {
    if (document.getElementById('navigator-tooltip')) return;

    const tooltip = document.createElement('div');

    tooltip.id = 'navigator-tooltip';
    document.body.appendChild(tooltip);
  }

  /**
   * Shows a tooltip with the full prompt text near the hovered row.
   * @param {string} text
   * @param {MouseEvent} event
   */
  function show(text, event) {
    const tooltip = getTooltip();

    if (!tooltip) return;

    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    hideTimer = null;
    showTimer = null;
    tooltip.classList.remove('visible');

    const clientX = event.clientX;
    const clientY = event.clientY;

    showTimer = setTimeout(() => {
      tooltip.textContent = text;
      tooltip.classList.add('visible');
      positionTooltip(tooltip, clientX, clientY);
    }, SHOW_DELAY_MS);
  }

  /**
   * Hides the tooltip after a short delay so pointer transitions are not abrupt.
   */
  function hide() {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);

    showTimer = null;

    const tooltip = getTooltip();

    if (!tooltip) return;

    hideTimer = setTimeout(() => {
      tooltip.classList.remove('visible');
      hideTimer = null;
    }, HIDE_DELAY_MS);
  }

  /**
   * Positions the tooltip beside the sidebar while keeping it in the viewport.
   * @param {HTMLElement} tooltip
   * @param {number} clientX
   * @param {number} clientY
   */
  function positionTooltip(tooltip, clientX, clientY) {
    const gap = 8;
    const margin = 16;
    const anchor = anchorSelector ? document.querySelector(anchorSelector) : null;
    const anchorRect = anchor?.getBoundingClientRect();

    let y = clientY + 15;

    const rect = tooltip.getBoundingClientRect();
    const x = anchorRect
      ? Math.max(margin, anchorRect.left - rect.width - gap)
      : Math.max(margin, clientX - rect.width - gap);

    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - margin;
    }

    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  /**
   * Returns the shared tooltip element.
   * @returns {HTMLElement | null}
   */
  function getTooltip() {
    return document.getElementById('navigator-tooltip');
  }

  window.ChatTocTooltip = {
    hide,
    init,
    show,
  };
})();
