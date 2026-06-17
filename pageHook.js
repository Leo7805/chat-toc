(() => {
  const HOOK_FLAG = '__conversationNavigatorFetchHookInstalled';
  const MESSAGE_TYPE = 'CHATGPT_CONVERSATION_DATA';
  const WIDTH_SPOOF_MESSAGE_TYPE = 'CHATGPT_NAVIGATOR_SET_WIDTH_SPOOF';
  const CONVERSATION_API_PATH = '/backend-api/conversation/';
  const SEND_MESSAGE_PATH = '/backend-api/f/conversation';
  const SPOOFED_VIEWPORT_WIDTH = 1400;
  const MEDIA_QUERY_LISTENER_METHODS = {
    addEventListener: { track: true, modern: true },
    removeEventListener: { track: false, modern: true },
    addListener: { track: true, modern: false },
    removeListener: { track: false, modern: false },
  };

  let streamBuffer = '';
  let wideViewportSpoofEnabled = true;
  const spoofedMediaQueryLists = new Set();

  if (window[HOOK_FLAG]) {
    return;
  }

  window[HOOK_FLAG] = true;
  console.log('✅ [Navigator] hook installed');

  installWideViewportMatchMediaSpoof();
  listenForWidthSpoofToggle();

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (...args) {
    const response = await originalFetch(...args);

    try {
      const input = args[0];
      const init = args[1] || {};
      const url = getFetchUrl(input);

      if (!url) {
        return response;
      }

      const method = getFetchMethod(input, init);
      const pathname = new URL(url, window.location.origin).pathname;

      const isConversationGet =
        method === 'GET' && pathname.startsWith(CONVERSATION_API_PATH);

      const isSendMessage = method === 'POST' && pathname === SEND_MESSAGE_PATH;

      if (isConversationGet) {
        console.log('✅ [Navigator] fetch:', url);

        postConversationData(response);
      }

      if (isSendMessage) {
        console.log('✅ [Navigator] fetch:', url);

        streamBuffer = '';
        inspectStream(response).catch((error) => {
          console.warn('[Navigator] stream inspect failed:', error);
        });
      }
    } catch (error) {
      console.warn('[Navigator] fetch hook error:', error);
    }

    return response;
  };

  /**
   * Normalizes fetch input into a URL string so Request objects and string
   * URLs are handled the same way.
   */
  function getFetchUrl(input) {
    if (typeof input === 'string') {
      return input;
    }

    if (input instanceof Request) {
      return input.url;
    }

    return input?.url || '';
  }

  /**
   * Resolves the effective fetch method from Request and init arguments.
   */
  function getFetchMethod(input, init) {
    return (
      init.method || (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
  }

  /**
   * Spoofs JS media-query width checks so ChatGPT keeps its built-in prompt
   * navigator mounted in narrow split-view layouts.
   */
  function installWideViewportMatchMediaSpoof() {
    const originalMatchMedia = window.matchMedia?.bind(window);

    if (!originalMatchMedia) return;

    // ChatGPT decides whether to mount its built-in prompt navigator from
    // page-context responsive checks. Content scripts run in an isolated world,
    // so the spoof has to live in this injected page script.
    window.matchMedia = function (query) {
      const mediaQueryList = originalMatchMedia(query);

      if (!isWidthMediaQuery(query)) {
        return mediaQueryList;
      }

      return createSpoofedMediaQueryList(mediaQueryList, query);
    };

    console.log(
      `[Navigator] matchMedia width spoof enabled: ${SPOOFED_VIEWPORT_WIDTH}px`
    );
  }

  /**
   * Lets the content script enable spoofing only while the ChatTOC sidebar is
   * visible. Dispatching resize nudges ChatGPT to rerun responsive layout code.
   */
  function listenForWidthSpoofToggle() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.type !== WIDTH_SPOOF_MESSAGE_TYPE) return;

      wideViewportSpoofEnabled = Boolean(event.data.enabled);
      notifySpoofedMediaQueryListeners();
      window.dispatchEvent(new Event('resize'));

      console.log(
        `[Navigator] matchMedia width spoof ${
          wideViewportSpoofEnabled ? 'enabled' : 'disabled'
        }`
      );
    });
  }

  /**
   * Returns whether a media query contains width breakpoints that can be spoofed.
   * @param {string} query
   * @returns {boolean}
   */
  function isWidthMediaQuery(query) {
    return getWidthMediaQueryRules(query).length > 0;
  }

  /**
   * Extracts min-width and max-width rules from a JS media query.
   * @param {string} query
   * @returns {RegExpMatchArray[]}
   */
  function getWidthMediaQueryRules(query) {
    return Array.from(
      String(query)
        .toLowerCase()
        .matchAll(/\((min|max)-width\s*:\s*([\d.]+)(px|rem|em)\)/g)
    );
  }

  /**
   * Returns the spoofed match result for JS width media queries.
   * @param {string} query
   * @returns {boolean | null} A forced match value, or null to keep the real result.
   */
  function getSpoofedMediaQueryMatch(query) {
    if (!wideViewportSpoofEnabled) {
      return null;
    }

    const widthRules = getWidthMediaQueryRules(query);

    if (widthRules.length === 0) {
      return null;
    }

    return widthRules.every((match) => {
      const boundary = match[1];
      const value = Number(match[2]);
      const unit = match[3];
      const width = unit === 'px' ? value : value * 16;

      return boundary === 'min'
        ? SPOOFED_VIEWPORT_WIDTH >= width
        : SPOOFED_VIEWPORT_WIDTH <= width;
    });
  }

  /**
   * Creates a MediaQueryList proxy for spoofed JS media queries. We track
   * change listeners because toggling the spoof does not trigger native
   * MediaQueryList events by itself.
   * @param {MediaQueryList} mediaQueryList
   * @param {string} query
   * @returns {MediaQueryList}
   */
  function createSpoofedMediaQueryList(mediaQueryList, query) {
    const entry = {
      query,
      listeners: new Set(),
      mediaQueryList: null,
      onchange: null,
      tracked: false,
    };

    const proxy = new Proxy(mediaQueryList, {
      get(target, property) {
        if (property === 'matches') {
          const forcedMatch = getSpoofedMediaQueryMatch(query);

          return forcedMatch ?? target.matches;
        }

        if (property === 'onchange') {
          return entry.onchange ?? target.onchange;
        }

        if (property in MEDIA_QUERY_LISTENER_METHODS && property in target) {
          return wrapMediaQueryListenerMethod(target, entry, property);
        }

        return getBoundNativeValue(target, property);
      },
      set(target, property, value) {
        if (property === 'onchange') {
          entry.onchange = isMediaQueryListener(value) ? value : null;
          syncTrackedMediaQueryEntry(entry);
          target.onchange = value;
          return true;
        }

        target[property] = value;
        return true;
      },
    });

    entry.mediaQueryList = proxy;

    return proxy;
  }

  /**
   * Wraps MediaQueryList listener methods so we can track which callbacks need
   * synthetic change events when the spoof is toggled.
   * @param {MediaQueryList} target
   * @param {Object} entry
   * @param {'addEventListener' | 'removeEventListener' | 'addListener' | 'removeListener'} method
   * @returns {Function}
   */
  function wrapMediaQueryListenerMethod(target, entry, method) {
    const config = MEDIA_QUERY_LISTENER_METHODS[method];

    return function (...args) {
      const listener = config.modern ? args[1] : args[0];

      if (!config.modern || args[0] === 'change') {
        setTrackedMediaQueryListener(entry, listener, config.track);
      }

      return target[method]?.(...args);
    };
  }

  /**
   * Adds or removes one listener from the proxy entry's tracked listener set.
   * @param {Object} entry
   * @param {Function | EventListenerObject | null | undefined} listener
   * @param {boolean} shouldTrack
   */
  function setTrackedMediaQueryListener(entry, listener, shouldTrack) {
    if (!isMediaQueryListener(listener)) return;

    if (shouldTrack) {
      entry.listeners.add(listener);
      syncTrackedMediaQueryEntry(entry);
      return;
    }

    entry.listeners.delete(listener);
    syncTrackedMediaQueryEntry(entry);
  }

  /**
   * Keeps the global spoofedMediaQueryLists set limited to proxies that have at
   * least one listener or onchange handler.
   * @param {Object} entry
   */
  function syncTrackedMediaQueryEntry(entry) {
    const shouldTrack = entry.listeners.size > 0 || Boolean(entry.onchange);

    if (shouldTrack && !entry.tracked) {
      spoofedMediaQueryLists.add(entry);
      entry.tracked = true;
      return;
    }

    if (!shouldTrack && entry.tracked) {
      spoofedMediaQueryLists.delete(entry);
      entry.tracked = false;
    }
  }

  /**
   * Returns native MediaQueryList properties while binding methods back to the
   * original object to preserve browser API behavior through the Proxy.
   * @param {MediaQueryList} target
   * @param {string | symbol} property
   * @returns {*}
   */
  function getBoundNativeValue(target, property) {
    const value = target[property];

    return typeof value === 'function' ? value.bind(target) : value;
  }

  /**
   * Notifies responsive hooks that the spoofed width result changed.
   */
  function notifySpoofedMediaQueryListeners() {
    spoofedMediaQueryLists.forEach((entry) => {
      const event = createMediaQueryChangeEvent(entry.mediaQueryList);
      const listeners = new Set(entry.listeners);

      if (entry.onchange) {
        listeners.add(entry.onchange);
      }

      listeners.forEach((listener) => {
        try {
          callMediaQueryListener(listener, entry.mediaQueryList, event);
        } catch (error) {
          console.warn('[Navigator] media query listener failed:', error);
        }
      });
    });
  }

  /**
   * Creates a MediaQueryList change event for spoof toggles. Prefer a real
   * Event so code that checks Event APIs still works; fall back to a plain
   * object if the browser refuses to define read-only event fields.
   * @param {MediaQueryList} mediaQueryList
   * @returns {Event | Object}
   */
  function createMediaQueryChangeEvent(mediaQueryList) {
    const event = new Event('change');
    const eventProperties = {
      media: {
        value: mediaQueryList.media,
      },
      matches: {
        value: mediaQueryList.matches,
      },
      target: {
        value: mediaQueryList,
      },
      currentTarget: {
        value: mediaQueryList,
      },
    };

    try {
      Object.defineProperties(event, eventProperties);
      return event;
    } catch {
      return {
        media: mediaQueryList.media,
        matches: mediaQueryList.matches,
        target: mediaQueryList,
        currentTarget: mediaQueryList,
      };
    }
  }

  /**
   * Checks whether a value is a valid MediaQueryList listener.
   * @param {*} listener
   * @returns {boolean}
   */
  function isMediaQueryListener(listener) {
    return (
      typeof listener === 'function' ||
      typeof listener?.handleEvent === 'function'
    );
  }

  /**
   * Calls either function listeners or EventListenerObject listeners with the
   * synthetic MediaQueryList change event.
   * @param {Function | EventListenerObject} listener
   * @param {MediaQueryList} mediaQueryList
   * @param {Object} event
   */
  function callMediaQueryListener(listener, mediaQueryList, event) {
    if (typeof listener === 'function') {
      listener.call(mediaQueryList, event);
      return;
    }

    listener.handleEvent(event);
  }

  /**
   * Clones ChatGPT's conversation GET response and sends the parsed payload to
   * the content script without consuming the page's original response body.
   */
  function postConversationData(response) {
    response
      .clone()
      .json()
      .then((data) => {
        window.postMessage(
          {
            type: MESSAGE_TYPE,
            payload: data,
          },
          '*'
        );
      })
      .catch(() => {});
  }

  /**
   * Reads a cloned send-message SSE stream so newly submitted user prompts can
   * appear in the navigator before the next full conversation fetch completes.
   */
  async function inspectStream(response) {
    const reader = response.clone().body?.getReader();

    if (!reader) return;

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        if (streamBuffer.trim()) {
          processStreamLine(streamBuffer);
          streamBuffer = '';
        }

        break;
      }

      streamBuffer += decoder.decode(value, {
        stream: true,
      });

      processBufferedStream();
    }
  }

  /**
   * Splits the accumulated SSE buffer into complete lines while keeping the
   * trailing partial line for the next stream chunk.
   */
  function processBufferedStream() {
    const lines = streamBuffer.split('\n');

    // The last line may be incomplete.
    streamBuffer = lines.pop() || '';

    for (const line of lines) {
      processStreamLine(line);
    }
  }

  /**
   * Parses one SSE data line and forwards ChatGPT input_message events to the
   * content script.
   */
  function processStreamLine(line) {
    if (!line.startsWith('data: ')) {
      return;
    }

    const jsonText = line.slice(6).trim();

    if (!jsonText || jsonText === '[DONE]') {
      return;
    }

    try {
      const data = JSON.parse(jsonText);

      if (data.type === 'input_message') {
        const message = data.input_message;

        window.postMessage(
          {
            type: 'CHATGPT_NEW_USER_MESSAGE',
            payload: {
              id: message.id,
              content: message.content,
              metadata: message.metadata,
              createTime: message.create_time || Date.now(),
            },
          },
          '*'
        );
      }
    } catch (error) {
      console.warn('[Navigator] Stream parse failed:', error);
    }
  }

  console.log('Conversation fetch hook installed');
})();
