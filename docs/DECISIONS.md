# Architectural Decisions Log

This document records the key architectural decisions, rationale, and consequences for ChatTOC.

---

## ADR 01: Session-Bound State Storage (sessionStorage)
* **Date**: 2026-06-19

### Context
We needed to decide how to persist user-facing state, including marked/starred prompts, sidebar pin status, and the floating toggle button's dragged coordinates. The manifest requested the `"storage"` extension permission, but it was unused.

### Decision
Keep all state stored in standard browser `sessionStorage` (scoped to the tab session) rather than migrating to persistent `chrome.storage.local`. 

### Rationale
These states are intentionally designed to be session-bound and scoped to the active tab. Storing them permanently across browser restarts or sharing them globally across tabs is undesirable for the desired UX of this extension.

### Consequences
* The unused `"storage"` permission was removed from `manifest.json` to prevent Chrome Web Store review warnings/rejections.
* Marked prompts and positions will continue to reset when the tab is closed.

---

## ADR 02: Event-Driven SPA Routing Detection
* **Date**: 2026-06-19

### Context
ChatGPT is a Single Page Application (SPA). To refresh the sidebar when a user clicks a different conversation, the content script previously ran a `setInterval` polling check on `location.pathname` every 250ms.

### Decision
Hijack the HTML5 History API (`history.pushState` and `history.replaceState`) in the main page context (`pageHook.js`) and notify the content script via `window.postMessage`, combined with a standard `'popstate'` listener in `content.js` for browser navigation.

### Rationale
Polling timers keep the CPU awake, which degrades system idle states and laptop battery life. Event-driven hooks execute 0% code when idle, and trigger the refresh instantly without the up to 250ms lag of polling.

### Consequences
* The polling timer was completely removed from the codebase.
* Router updates are now instantaneous and zero-overhead.

---

## ADR 03: Element-Based Viewport Edge Scrolling (Fallback)
* **Date**: 2026-06-19

### Context
If ChatGPT's native navigation outline buttons cannot be found in the DOM, jumping to the top or bottom of the chat fell back to `window.scrollTo`. However, ChatGPT locks the page window height at `100vh` and scrolls a nested division container instead. Thus, `window.scrollTo` had no scrolling effect.

### Decision
Query the first/last user prompt messages in the DOM (`[data-message-author-role="user"]`) and call `.scrollIntoView({ behavior: 'smooth', block: 'center' })` on them as the fallback.

### Rationale
`scrollIntoView()` automatically instructs the browser to find whichever nested parent container is actually scrollable and scroll it, making the fallback robust and container-selector agnostic.

### Consequences
* Fallback edge-jumping now functions correctly even if ChatGPT modifies its layout containers.
* The extension maintains its primary path of clicking ChatGPT's native navigation buttons (which supports React virtualized list mounting) and only falls back to element-based scrolling when native buttons are absent.
