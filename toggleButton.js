/**
 * Builds and manages the floating ChatTOC sidebar toggle button.
 */
(function () {
  const WIDTH_SPOOF_MESSAGE_TYPE = 'CHATGPT_NAVIGATOR_SET_WIDTH_SPOOF';
  const POSITION_MARGIN = 8;

  /**
   * Creates the floating toggle button.
   * @param {HTMLElement} sidebar
   */
  function create(sidebar) {
    const toggleBtn = document.createElement('button');

    toggleBtn.id = 'toggle-sidebar-btn';
    toggleBtn.className = 'sidebar-visible';
    toggleBtn.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 64 64">
        <path
          fill="currentColor"
          d="M48 8A26 26 0 1 1 15 48C29 52 43 43 49 29C52 21 51 13 48 8Z"
        />
      </svg>
    `;

    toggleBtn.addEventListener('click', (event) => {
      if (toggleBtn.dataset.dragged === 'true') {
        event.preventDefault();
        toggleBtn.dataset.dragged = 'false';
        return;
      }

      const isHidden = sidebar.classList.toggle('navigator-hidden');

      toggleBtn.classList.toggle('sidebar-hidden', isHidden);
      toggleBtn.classList.toggle('sidebar-visible', !isHidden);
      setWideViewportSpoofEnabled(!isHidden);
    });

    document.body.appendChild(toggleBtn);
    initDrag(toggleBtn);
  }

  /**
   * Enables pointer dragging for the current page session.
   * @param {HTMLButtonElement} toggleBtn
   */
  function initDrag(toggleBtn) {
    window.addEventListener('resize', () => {
      keepButtonInViewport(toggleBtn);
    });

    toggleBtn.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;

      const rect = toggleBtn.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      let didDrag = false;

      toggleBtn.setPointerCapture(event.pointerId);
      toggleBtn.classList.add('toggle-sidebar-btn-dragging');

      function handlePointerMove(moveEvent) {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        if (!didDrag && Math.hypot(deltaX, deltaY) < 4) {
          return;
        }

        didDrag = true;

        const nextPosition = clampPosition(
          startLeft + deltaX,
          startTop + deltaY,
          rect.width,
          rect.height
        );

        setPosition(toggleBtn, nextPosition.left, nextPosition.top);
      }

      function handlePointerUp() {
        toggleBtn.releasePointerCapture(event.pointerId);
        toggleBtn.classList.remove('toggle-sidebar-btn-dragging');
        toggleBtn.removeEventListener('pointermove', handlePointerMove);
        toggleBtn.removeEventListener('pointerup', handlePointerUp);
        toggleBtn.removeEventListener('pointercancel', handlePointerUp);

        if (!didDrag) return;

        toggleBtn.dataset.dragged = 'true';
      }

      toggleBtn.addEventListener('pointermove', handlePointerMove);
      toggleBtn.addEventListener('pointerup', handlePointerUp);
      toggleBtn.addEventListener('pointercancel', handlePointerUp);
    });
  }

  /**
   * Applies a fixed viewport position to the toggle button.
   * @param {HTMLButtonElement} toggleBtn
   * @param {number} left
   * @param {number} top
   */
  function setPosition(toggleBtn, left, top) {
    toggleBtn.style.left = `${left}px`;
    toggleBtn.style.top = `${top}px`;
    toggleBtn.style.right = 'auto';
    toggleBtn.style.bottom = 'auto';
  }

  /**
   * Re-clamps the current session position after viewport size changes.
   * @param {HTMLButtonElement} toggleBtn
   */
  function keepButtonInViewport(toggleBtn) {
    const rect = toggleBtn.getBoundingClientRect();
    const nextPosition = clampPosition(
      rect.left,
      rect.top,
      rect.width,
      rect.height
    );

    if (nextPosition.left === rect.left && nextPosition.top === rect.top) {
      return;
    }

    setPosition(toggleBtn, nextPosition.left, nextPosition.top);
  }

  /**
   * Keeps the button fully inside the viewport.
   * @param {number} left
   * @param {number} top
   * @param {number} width
   * @param {number} height
   * @returns {{ left: number, top: number }}
   */
  function clampPosition(left, top, width, height) {
    const maxLeft = Math.max(
      POSITION_MARGIN,
      window.innerWidth - width - POSITION_MARGIN
    );
    const maxTop = Math.max(
      POSITION_MARGIN,
      window.innerHeight - height - POSITION_MARGIN
    );

    return {
      left: Math.min(maxLeft, Math.max(POSITION_MARGIN, left)),
      top: Math.min(maxTop, Math.max(POSITION_MARGIN, top)),
    };
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

  window.ChatTocToggleButton = {
    create,
  };
})();
