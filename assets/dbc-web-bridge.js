/**
 * DiscordBotClient Web Bridge (Replaces ElectronPreload.ts & Chrome Extension Content Script)
 * Provides window.BotClientNative, window.protoAPI, Vencord CSS injection,
 * Discohook MessageChannel bridge, and Mobile Drawer Navigation toggle.
 */
(function () {
  // Unregister any leftover service workers from older builds on the same port
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) {
        reg.unregister();
      });
    });
  }
  if ("caches" in window) {
    caches.keys().then(function (keys) {
      keys.forEach(function (k) {
        if (k.indexOf("dbc-mobile-pwa") !== -1) caches.delete(k);
      });
    });
  }

  const bootData = window.__DBC_BOOT__ || {
    version: "3.10.7",
    name: "DiscordBotClient",
    defaultUserPatch: {},
    guildExperiments: [],
    userExperiments: [],
    apexExperiments: { evaluation_id: "dbc", assignments: [] },
  };

  // Rewrite any hardcoded "https://" + window.location.host requests in Discord's RestAPI to match window.location.protocol
  function normalizeLocalEndpointUrl(url) {
    if (typeof url !== "string") return url;
    const wrongOrigin = "https://" + window.location.host;
    if (window.location.protocol === "http:" && url.indexOf(wrongOrigin) === 0) {
      return "http://" + window.location.host + url.slice(wrongOrigin.length);
    }
    const discordApiHttps = "https://discord.com/api";
    if (url.indexOf(discordApiHttps) === 0) {
      return window.location.origin + "/api" + url.slice(discordApiHttps.length);
    }
    const canaryApiHttps = "https://canary.discord.com/api";
    if (url.indexOf(canaryApiHttps) === 0) {
      return window.location.origin + "/api" + url.slice(canaryApiHttps.length);
    }
    return url;
  }

  const origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const args = Array.prototype.slice.call(arguments);
    args[1] = normalizeLocalEndpointUrl(url);
    return origXhrOpen.apply(this, args);
  };

  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      if (typeof input === "string") {
        input = normalizeLocalEndpointUrl(input);
      } else if (input && typeof input === "object" && typeof input.url === "string") {
        const fixedUrl = normalizeLocalEndpointUrl(input.url);
        if (fixedUrl !== input.url) {
          input = new Request(fixedUrl, input);
        }
      }
      return origFetch.call(this, input, init);
    };
  }

  // 1. Implement window.BotClientNative (100% compatible with ElectronPreload.ts)
  window.BotClientNative = {
    getBotInfo: async function (token) {
      try {
        const res = await fetch("/dbc-bridge/get-bot-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        return await res.json();
      } catch (err) {
        return {
          success: false,
          message: err && err.message ? err.message : String(err),
        };
      }
    },
    getBotClientVersion: function () {
      return bootData.version;
    },
    getBotClientName: function () {
      return bootData.name;
    },
    getPrivateChannelDefault: function () {
      return {
        type: 1,
        recipients: [bootData.defaultUserPatch],
        last_message_id: "1000000000000000000",
        is_spam: false,
        id: "1000000000000000000",
        flags: 0,
      };
    },
    getUserExperiments: function (_allData, _botId) {
      return Array.isArray(bootData.userExperiments)
        ? structuredClone(bootData.userExperiments)
        : [];
    },
    getGuildExperiments: function () {
      return bootData.guildExperiments;
    },
    getApexExperiments: function (botId) {
      return {
        assignments: {
          "1": {
            [botId]: structuredClone(bootData.apexExperiments),
          },
        },
      };
    },
    closeWindow: function () {},
    close: function () {},
    minimize: function () {},
    maximize: function () {},
    focus: function () {},
    flashFrame: function () {},
    requestOpenMessageEditorWindow: function () {
      return new Promise((resolve) => {
        openDiscohookModal();
        resolve();
      });
    },
  };

  // 2. Implement window.protoAPI
  window.protoAPI = {
    GetPreloadedUserSettings: function () {},
    GetPreloadedUserSettingsResponse: function () {},
    SetPreloadedUserSettings: function () {},
    GetFrecencyUserSettings: function () {},
    GetFrecencyUserSettingsResponse: function () {},
    SetFrecencyUserSettings: function () {},
  };

  // 3. Emulate Vencord Chrome Extension Content Script (content.js)
  const postVencordMeta = function () {
    window.postMessage(
      {
        type: "vencord:meta",
        meta: {
          EXTENSION_VERSION: "1.15.15",
          EXTENSION_BASE_URL: window.location.origin + "/vencord-ext/",
          RENDERER_CSS_URL:
            window.location.origin + "/vencord-ext/dist/Vencord.css",
        },
      },
      "*"
    );
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", postVencordMeta, {
      once: true,
    });
  } else {
    setTimeout(postVencordMeta, 0);
  }

  // 4. Discohook Message Editor Modal & MessageChannel Bridge
  let discohookModal = null;
  let discohookIframe = null;

  function ensureDiscohookModal() {
    if (discohookModal) return;
    discohookModal = document.createElement("div");
    discohookModal.id = "dbc-discohook-modal";
    discohookModal.className = "dbc-hidden";
    discohookModal.innerHTML =
      '<div id="dbc-discohook-header">' +
      "<span>✨ DiscordBotClient — Advanced Message Editor (Discohook & Components V2)</span>" +
      '<button type="button" id="dbc-discohook-close">Đóng (Close)</button>' +
      "</div>" +
      '<iframe id="dbc-discohook-iframe" src="about:blank"></iframe>';

    document.body.appendChild(discohookModal);
    discohookIframe = document.getElementById("dbc-discohook-iframe");
    document
      .getElementById("dbc-discohook-close")
      .addEventListener("click", closeDiscohookModal);
  }

  function openDiscohookModal() {
    ensureDiscohookModal();
    discohookModal.classList.remove("dbc-hidden");
    discohookIframe.src = "/dbc-editor/index.html";
  }

  function closeDiscohookModal() {
    if (!discohookModal) return;
    discohookModal.classList.add("dbc-hidden");
    if (discohookIframe) discohookIframe.src = "about:blank";
  }

  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "dbc-editor-ready") {
      if (discohookIframe && discohookIframe.contentWindow) {
        const channel = new MessageChannel();
        discohookIframe.contentWindow.postMessage(
          "dbc-init-editor-port",
          "*",
          [channel.port2]
        );
        window.postMessage("forward-editor-port", "*", [channel.port1]);
      }
    } else if (event.data.type === "dbc-editor-close") {
      closeDiscohookModal();
    }
  });

  // 5. Mobile & iOS Safari PWA Sidebar Drawer Toggle Button
  function initMobileUI() {
    if (document.getElementById("dbc-mobile-nav-fab")) return;

    const fab = document.createElement("button");
    fab.id = "dbc-mobile-nav-fab";
    fab.type = "button";
    fab.title = "Ẩn/Hiện danh sách Server & Kênh";
    fab.innerHTML = "☰";

    fab.addEventListener("click", function () {
      document.body.classList.toggle("dbc-mobile-sidebar-hidden");
    });

    document.body.appendChild(fab);

    // Auto-collapse sidebar on mobile once a channel is clicked so chat takes full screen
    document.addEventListener(
      "click",
      function (e) {
        if (window.innerWidth > 820) return;
        const target = e.target;
        if (!target || !target.closest) return;
        const channelLink = target.closest(
          'a[href^="/channels/"], div[role="listitem"][data-list-item-id^="channels___"]'
        );
        if (channelLink) {
          setTimeout(function () {
            document.body.classList.add("dbc-mobile-sidebar-hidden");
          }, 120);
        }
      },
      true
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileUI);
  } else {
    initMobileUI();
  }
})();
