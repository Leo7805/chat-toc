/**
 * Builds and manages the floating ChatTOC sidebar toggle button.
 */
(function () {
  const POSITION_STORAGE_KEY = 'chatToc:toggleButtonPosition';
  const WIDTH_SPOOF_MESSAGE_TYPE = 'CHATGPT_NAVIGATOR_SET_WIDTH_SPOOF';

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
        <defs>
          <mask id="chat-toc-moon-mask">
            <rect width="64" height="64" fill="black" />
            <circle cx="32" cy="32" r="24" fill="white" />
            <circle cx="23" cy="22" r="25" fill="black" />
          </mask>
        </defs>
        <rect width="64" height="64" fill="currentColor" mask="url(#chat-toc-moon-mask)" />
      </svg>
    `;

    initDrag(toggleBtn);

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
  }

  /**
   * Enables pointer dragging and persists the final button position.
   * @param {HTMLButtonElement} toggleBtn
   */
  function initDrag(toggleBtn) {
    const savedPosition = loadPosition();

    if (savedPosition) {
      setPosition(toggleBtn, savedPosition.left, savedPosition.top);
    }

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
        savePosition({
          left: toggleBtn.offsetLeft,
          top: toggleBtn.offsetTop,
        });
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
   * Keeps the button fully inside the viewport.
   * @param {number} left
   * @param {number} top
   * @param {number} width
   * @param {number} height
   * @returns {{ left: number, top: number }}
   */
  function clampPosition(left, top, width, height) {
    const margin = 8;

    return {
      left: Math.min(
        window.innerWidth - width - margin,
        Math.max(margin, left)
      ),
      top: Math.min(
        window.innerHeight - height - margin,
        Math.max(margin, top)
      ),
    };
  }

  /**
   * Loads and validates the saved button position.
   * @returns {{ left: number, top: number } | null}
   */
  function loadPosition() {
    try {
      const rawValue = localStorage.getItem(POSITION_STORAGE_KEY);
      const parsedValue = rawValue ? JSON.parse(rawValue) : null;

      if (
        typeof parsedValue?.left !== 'number' ||
        typeof parsedValue?.top !== 'number'
      ) {
        return null;
      }

      return clampPosition(parsedValue.left, parsedValue.top, 42, 42);
    } catch {
      return null;
    }
  }

  /**
   * Persists the button position.
   * @param {{ left: number, top: number }} position
   */
  function savePosition(position) {
    try {
      localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {}
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
