/**
 * DiscordBotClient Web Bridge (Replaces ElectronPreload.ts & Chrome Extension Content Script)
 * Provides window.BotClientNative, window.protoAPI, Vencord CSS injection,
 * Discohook MessageChannel bridge, Storage preservation, Desktop UA spoofing for Discord React,
 * and Native Discord Mobile App UI Controller (Slide-Over Drawers, Swipe Gestures & Bottom Tab Bar).
 */
(function () {
  // 0. Capture window.localStorage & window.sessionStorage IMMEDIATELY in <head>
  // BEFORE Discord's web.js executes `delete window.localStorage`!
  var origLocalStorage = null;
  var origSessionStorage = null;
  try {
    origLocalStorage = window.localStorage;
  } catch (e) {}
  try {
    origSessionStorage = window.sessionStorage;
  } catch (e) {}

  function safeGetSession(key) {
    try {
      return origSessionStorage ? origSessionStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }
  function safeSetSession(key, val) {
    try {
      if (origSessionStorage) origSessionStorage.setItem(key, String(val));
    } catch (e) {}
  }
  function safeGetLocal(key) {
    try {
      return origLocalStorage ? origLocalStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }
  function safeSetLocal(key, val) {
    try {
      if (origLocalStorage) origLocalStorage.setItem(key, String(val));
    } catch (e) {}
  }

  // Spoof Desktop UA so Discord serves its full React app instead of the static "Download Discord App" blocker,
  // while our Mobile App Controller + CSS transforms the React DOM into a true Mobile App UI on phones!
  try {
    var ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) {
      Object.defineProperty(navigator, "userAgent", {
        get: function () {
          return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
        },
        configurable: true,
      });
      Object.defineProperty(navigator, "platform", {
        get: function () {
          return "MacIntel";
        },
        configurable: true,
      });
    }
  } catch (e) {}

  // Ensure window.Notification stub exists on iOS Safari browser tabs so plugins checking Notification.permission never throw
  if (typeof window.Notification === "undefined") {
    window.Notification = function () {};
    window.Notification.permission = "denied";
    window.Notification.requestPermission = function () {
      return Promise.resolve("denied");
    };
  }

  // Stub navigator.mediaDevices (missing in some iOS WebViews / insecure contexts) so Vencord's webScreenShare plugin never crashes the bundle
  try {
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    }
    ["getDisplayMedia", "getUserMedia"].forEach(function (fn) {
      if (typeof navigator.mediaDevices[fn] !== "function") {
        navigator.mediaDevices[fn] = function () {
          return Promise.reject(new Error(fn + " is not supported on this device"));
        };
      }
    });
    if (typeof navigator.mediaDevices.enumerateDevices !== "function") {
      navigator.mediaDevices.enumerateDevices = function () { return Promise.resolve([]); };
    }
  } catch (e) {}

  // Unregister any leftover service workers from older builds
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

  var bootData = window.__DBC_BOOT__ || {
    version: "3.10.7",
    name: "DiscordBotClient",
    defaultUserPatch: {},
    guildExperiments: [],
    userExperiments: [],
    apexExperiments: { evaluation_id: "dbc", assignments: [] },
  };

  // Rewrite hardcoded discord.com/api requests in Discord's RestAPI to current APIServer origin
  function normalizeLocalEndpointUrl(url) {
    if (typeof url !== "string") return url;
    var wrongOrigin = "https://" + window.location.host;
    if (window.location.protocol === "http:" && url.indexOf(wrongOrigin) === 0) {
      return "http://" + window.location.host + url.slice(wrongOrigin.length);
    }
    var discordApiHttps = "https://discord.com/api";
    if (url.indexOf(discordApiHttps) === 0) {
      return window.location.origin + "/api" + url.slice(discordApiHttps.length);
    }
    var canaryApiHttps = "https://canary.discord.com/api";
    if (url.indexOf(canaryApiHttps) === 0) {
      return window.location.origin + "/api" + url.slice(canaryApiHttps.length);
    }
    return url;
  }

  var origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    args[1] = normalizeLocalEndpointUrl(url);
    return origXhrOpen.apply(this, args);
  };

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      if (typeof input === "string") {
        input = normalizeLocalEndpointUrl(input);
      } else if (input && typeof input === "object" && typeof input.url === "string") {
        var fixedUrl = normalizeLocalEndpointUrl(input.url);
        if (fixedUrl !== input.url) {
          input = new Request(fixedUrl, input);
        }
      }
      return origFetch.call(this, input, init);
    };
  }

  var cachedBotMeta = null;
  try {
    var savedMeta = safeGetSession("__dbc_bot_meta__");
    if (savedMeta) cachedBotMeta = JSON.parse(savedMeta);
  } catch (e) {}

  // Outgoing-only Gateway WebSocket safety net (preserves zlib-stream binary frames & Vencord BotClient patches)
  var OrigWebSocket = window.WebSocket;
  if (OrigWebSocket && OrigWebSocket.prototype) {
    var OrigSend = OrigWebSocket.prototype.send;
    OrigWebSocket.prototype.send = function (data) {
      if (typeof data === "string" && data.charAt(0) === "{") {
        try {
          var pkt = JSON.parse(data);
          if (pkt && pkt.op === 1 && pkt.d !== null && typeof pkt.d === "object") {
            pkt.d = typeof pkt.d.seq === "number" ? pkt.d.seq : null;
            return OrigSend.call(this, JSON.stringify(pkt));
          }
          if (pkt && pkt.op === 2 && pkt.d && pkt.d.intents === undefined) {
            if (typeof pkt.d.token === "string") {
              pkt.d.token = pkt.d.token.replace(/^Bot\s+/i, "").trim();
            }
            var wsRef = this;
            var tok = pkt.d.token;
            var applyAndSend = function (meta) {
              var shardId = parseInt(safeGetSession("currentShard") || "0", 10) || 0;
              var allShards = (meta && meta.allShards) || parseInt(safeGetSession("allShards") || "1", 10) || 1;
              pkt.d.intents = (meta && meta.intents) || 3276541;
              pkt.d.shard = [shardId < allShards ? shardId : 0, allShards];
              OrigSend.call(wsRef, JSON.stringify(pkt));
            };
            if (cachedBotMeta && cachedBotMeta.intents) {
              applyAndSend(cachedBotMeta);
            } else {
              window.BotClientNative.getBotInfo(tok).then(function (info) {
                if (info && info.success) {
                  cachedBotMeta = info;
                  safeSetSession("__dbc_bot_meta__", JSON.stringify(info));
                  safeSetSession("allShards", String(info.allShards || 1));
                }
                applyAndSend(info);
              });
            }
            return;
          }
        } catch (e) {}
      }
      return OrigSend.call(this, data);
    };
  }

  // 1. Implement window.BotClientNative (100% compatible with ElectronPreload.ts)
  window.BotClientNative = {
    getBotInfo: async function (token) {
      try {
        var res = await origFetch.call(window, "/dbc-bridge/get-bot-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: token }),
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
        ? JSON.parse(JSON.stringify(bootData.userExperiments))
        : [];
    },
    getGuildExperiments: function () {
      return bootData.guildExperiments;
    },
    getApexExperiments: function (botId) {
      var map = {};
      map[botId] = JSON.parse(JSON.stringify(bootData.apexExperiments));
      return {
        assignments: {
          "1": map,
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
      return new Promise(function (resolve) {
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
  var postVencordMeta = function () {
    window.postMessage(
      {
        type: "vencord:meta",
        meta: {
          EXTENSION_VERSION: "1.15.15",
          EXTENSION_BASE_URL: window.location.origin + "/vencord-ext/",
          RENDERER_CSS_URL: window.location.origin + "/vencord-ext/dist/Vencord.css",
        },
      },
      "*"
    );
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", postVencordMeta, { once: true });
  } else {
    setTimeout(postVencordMeta, 0);
  }

  // 4. Discohook Message Editor Modal & MessageChannel Bridge
  var discohookModal = null;
  var discohookIframe = null;

  function ensureDiscohookModal() {
    if (discohookModal) return;
    discohookModal = document.createElement("div");
    discohookModal.id = "dbc-discohook-modal";
    discohookModal.className = "dbc-hidden";
    discohookModal.innerHTML =
      '<div id="dbc-discohook-header">' +
      "<span>âœ¨ Discohook & Components V2 Editor</span>" +
      '<button type="button" id="dbc-discohook-close">ÄÃ³ng</button>' +
      "</div>" +
      '<iframe id="dbc-discohook-iframe" src="about:blank"></iframe>';

    document.body.appendChild(discohookModal);
    discohookIframe = document.getElementById("dbc-discohook-iframe");
    document.getElementById("dbc-discohook-close").addEventListener("click", closeDiscohookModal);
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

  function triggerOpenDiscohookForCurrentChannel() {
    // First try clicking BotClient's native ChatBar Embed Editor button if visible so port handshake is initialized with channel emojis/draft!
    var chatForm = document.querySelector("main form") || document.querySelector("form");
    if (chatForm) {
      var btns = chatForm.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        var label = (b.getAttribute("aria-label") || b.title || "").toLowerCase();
        if (label.indexOf("embed") !== -1 || label.indexOf("editor") !== -1 || b.querySelector('path[d*="M19 3H5"]')) {
          b.click();
          return;
        }
      }
    }
    openDiscohookModal();
  }

  window.addEventListener("message", function (event) {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.type === "dbc-editor-ready") {
      if (discohookIframe && discohookIframe.contentWindow) {
        var channel = new MessageChannel();
        discohookIframe.contentWindow.postMessage("dbc-init-editor-port", "*", [channel.port2]);
        window.postMessage("forward-editor-port", "*", [channel.port1]);
      }
    } else if (event.data.type === "dbc-editor-close") {
      closeDiscohookModal();
    }
  });

  // 5. Discord Native Mobile App Navigation Controller
  // Replicates Discord Mobile UX:
  // - Mode "nav": User is browsing servers and channel list / DMs list (Left Rail + Channel list visible side-by-side)
  // - Mode "chat": User tapped a channel -> fullscreen chat view with Back Button (â†) to return to channels
  // - Mode "profile": Bottom profile strip with bot avatar, name, status, and quick settings

  var currentMobileMode = "nav"; // "nav" or "chat"

  function isMobileViewport() {
    var isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    var isNarrow = window.innerWidth <= 1024;
    return isTouch || isNarrow;
  }

  function updateMobileMode() {
    if (!isMobileViewport()) {
      document.body.classList.remove("dbc-mode-nav", "dbc-mode-chat", "dbc-members-open", "dbc-page-login");
      return;
    }

    var path = window.location.pathname;
    var hasToken = !!safeGetLocal("token");
    var hasLoginForm = !!document.querySelector('input[type="password"], [class*="authBox_"], .dbc-fallback-token-box');
    var isLogin = path === "/login" || (!hasToken && hasLoginForm);
    document.body.classList.toggle("dbc-page-login", isLogin);

    if (isLogin) {
      document.body.classList.remove("dbc-mode-nav", "dbc-mode-chat");
      return;
    }

    // Navigation logic:
    // When user is on /channels/@me, show nav (DM list)
    // When on /channels/:guildId/:channelId, default to chat UNLESS user tapped Back (nav override)
    if (path === "/channels/@me" || path === "/app" || path === "/" || path === "") {
      setMobileMode("nav");
    } else {
      if (sessionStorage.getItem("__dbc_mobile_nav_override__") === "1") {
        setMobileMode("nav");
      } else {
        setMobileMode("chat");
      }
    }
  }

  function setMobileMode(mode) {
    currentMobileMode = mode;
    if (mode === "nav") {
      sessionStorage.setItem("__dbc_mobile_nav_override__", "1");
      document.body.classList.remove("dbc-mode-chat");
      document.body.classList.add("dbc-mode-nav");
    } else {
      sessionStorage.removeItem("__dbc_mobile_nav_override__");
      document.body.classList.remove("dbc-mode-nav");
      document.body.classList.add("dbc-mode-chat");
    }
    updateProfileStrip();
  }

  function tagDiscordMobileLayout() {
    if (!document.body) return;

    updateMobileMode();

    // 1. Hide Desktop Titlebars / Window Chrome immediately
    var titleBars = document.querySelectorAll(
      '[data-window-chrome="true"], [data-window-chrome], [class*="winTitleBar_"], [class*="typeWindows_"], [class*="withFrame_"]'
    );
    for (var i = 0; i < titleBars.length; i++) {
      titleBars[i].style.display = "none";
      titleBars[i].setAttribute("data-dbc-desktop-titlebar", "1");
    }

    // 2. Identify Guilds Server Rail
    var guildsNav =
      document.querySelector('nav[class*="guilds_"]') ||
      document.querySelector('[data-list-id="guildsnav"]') ||
      document.querySelector('nav[aria-label*="Servers"], nav[aria-label*="Máy chủ"]');
    if (guildsNav) {
      var gEl = guildsNav.tagName === "NAV" ? guildsNav : guildsNav.closest("nav") || guildsNav;
      gEl.setAttribute("data-dbc-guilds-rail", "1");
      guildsNav = gEl;
    }

    // 3. Identify Channels Sidebar (handle Discord Visual Refresh where .sidebar_ wraps BOTH .guilds_ and .sidebarList_)
    var chanSidebar = document.querySelector('[class*="sidebar_"]');
    var chanListPane = document.querySelector('[class*="sidebarList_"]');
    if (chanSidebar && guildsNav && chanSidebar.contains(guildsNav)) {
      chanSidebar.setAttribute("data-dbc-drawer", "unified");
      chanSidebar.removeAttribute("data-dbc-chan-pane");
      if (chanListPane) {
        chanListPane.setAttribute("data-dbc-chan-pane", "1");
      } else {
        Array.from(chanSidebar.children).forEach(function (child) {
          if (child !== guildsNav && !child.contains(guildsNav) && child.tagName !== "SECTION") {
            child.setAttribute("data-dbc-chan-pane", "1");
          }
        });
      }
    } else if (chanListPane) {
      chanListPane.setAttribute("data-dbc-chan-pane", "1");
    } else if (chanSidebar) {
      chanSidebar.setAttribute("data-dbc-chan-pane", "1");
    }

    // 4. Identify Chat area & Header Bar
    var chatArea = document.querySelector('[class*="chat_"], main');
    if (chatArea) {
      chatArea.setAttribute("data-dbc-content", "1");
      var headerBar =
        chatArea.querySelector('section[aria-label]') ||
        chatArea.querySelector('section[class*="title_"]') ||
        (chatArea.firstElementChild && chatArea.firstElementChild.offsetHeight <= 64 ? chatArea.firstElementChild : null);
      if (headerBar) {
        headerBar.setAttribute("data-dbc-header-bar", "1");
      }
    }

    // 5. Right-Hand Members Sidebar Pane
    var membersList = document.querySelector('[data-list-id^="members-"], [class*="membersWrap_"]');
    if (membersList) {
      membersList.setAttribute("data-dbc-members-pane", "1");
    }

    updateProfileStrip();
  }

  function updateProfileStrip() {
    var strip = document.getElementById("dbc-profile-strip");
    if (!strip) return;

    var meta = cachedBotMeta;
    if (!meta) {
      try {
        var stored = safeGetSession("__dbc_bot_meta__");
        if (stored) meta = JSON.parse(stored);
      } catch (e) {}
    }

    var avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    var username = "Bot Client";

    if (meta && meta.botUser) {
      username = meta.botUser.username || "Bot";
      if (meta.botUser.avatar) {
        avatarUrl = "https://cdn.discordapp.com/avatars/" + meta.botUser.id + "/" + meta.botUser.avatar + ".png?size=64";
      }
    } else {
      var foundUser = false;
      try {
        if (window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common && window.Vencord.Webpack.Common.UserStore) {
          var u = window.Vencord.Webpack.Common.UserStore.getCurrentUser();
          if (u) {
            username = u.globalName || u.username || "Bot";
            if (typeof u.getAvatarURL === "function") {
              avatarUrl = u.getAvatarURL(null, 64, false);
            } else if (u.avatar) {
              avatarUrl = "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + ".png?size=64";
            }
            foundUser = true;
          }
        }
      } catch (e) {}
      if (!foundUser) {
        var userPanel = document.querySelector('section[aria-label*="User"], section[class*="panels_"]');
        if (userPanel) {
          var img = userPanel.querySelector("img");
          if (img && img.src) avatarUrl = img.src;
          var nameEl = userPanel.querySelector('[class*="nameTag_"], [class*="title_"]');
          if (nameEl && nameEl.textContent) username = nameEl.textContent.trim();
        }
      }
    }

    var nameElNode = strip.querySelector(".dbc-profile-name");
    var imgElNode = strip.querySelector(".dbc-profile-avatar img");
    if (nameElNode && nameElNode.textContent !== username) nameElNode.textContent = username;
    if (imgElNode && imgElNode.src !== avatarUrl) imgElNode.src = avatarUrl;
  }

  function openUserSettingsMobile() {
    try {
      if (window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common && window.Vencord.Webpack.Common.SettingsRouter) {
        window.Vencord.Webpack.Common.SettingsRouter.open("My Account");
        return;
      }
    } catch (e) {}
    var gearBtn = document.querySelector(
      'button[aria-label*="Settings"], button[aria-label*="CÃ i Ä‘áº·t"], button[aria-label*="Thiáº¿t láº­p"]'
    );
    if (gearBtn) gearBtn.click();
  }

  function initMobileUI() {
    if (document.getElementById("dbc-mobile-back-btn")) return;

    // 1. Channel Chat Header Back Button (â†)
    var backBtn = document.createElement("button");
    backBtn.id = "dbc-mobile-back-btn";
    backBtn.type = "button";
    backBtn.title = "Quay láº¡i danh sÃ¡ch kÃªnh";
    backBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>';
    backBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      setMobileMode("nav");
    });
    document.body.appendChild(backBtn);

    // 2. Members Slide-over Backdrop
    var membersBackdrop = document.createElement("div");
    membersBackdrop.id = "dbc-members-backdrop";
    membersBackdrop.addEventListener("click", function () {
      document.body.classList.remove("dbc-members-open");
    });
    document.body.appendChild(membersBackdrop);

    // 3. Settings Mobile Back Button
    var settingsBackBtn = document.createElement("button");
    settingsBackBtn.id = "dbc-settings-back-btn";
    settingsBackBtn.type = "button";
    settingsBackBtn.textContent = "â† Danh má»¥c CÃ i Ä‘áº·t";
    settingsBackBtn.addEventListener("click", function () {
      document.body.classList.remove("dbc-settings-content-focused");
    });
    document.body.appendChild(settingsBackBtn);

    // 4. Discord Native Mobile Bottom Profile Bar (Across bottom in Nav Mode)
    var profileStrip = document.createElement("div");
    profileStrip.id = "dbc-profile-strip";
    profileStrip.innerHTML =
      '<div class="dbc-profile-inner">' +
      '  <div class="dbc-profile-avatar"><img src="https://cdn.discordapp.com/embed/avatars/0.png" alt="Avatar"/></div>' +
      '  <div class="dbc-profile-info">' +
      '    <div class="dbc-profile-name">Bot Client</div>' +
      '    <div class="dbc-profile-tag">Trực tuyến • Bot Client Web</div>' +
      '  </div>' +
      '</div>' +
      '<div class="dbc-profile-actions">' +
      '  <button type="button" class="dbc-profile-btn" id="dbc-btn-discohook" title="Mở Discohook">' +
      '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>' +
      '    <span>Discohook</span>' +
      '  </button>' +
      '  <button type="button" class="dbc-profile-btn" id="dbc-btn-settings" title="Cài đặt">' +
      '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      '  </button>' +
      '</div>';

    profileStrip.querySelector(".dbc-profile-inner").addEventListener("click", function () {
      openUserSettingsMobile();
    });
    profileStrip.querySelector("#dbc-btn-discohook").addEventListener("click", function (e) {
      e.stopPropagation();
      triggerOpenDiscohookForCurrentChannel();
    });
    profileStrip.querySelector("#dbc-btn-settings").addEventListener("click", function (e) {
      e.stopPropagation();
      openUserSettingsMobile();
    });
    document.body.appendChild(profileStrip);

    // 5. Click Interceptor: Tapping a channel opens Chat mode; Tapping a server stays in Nav mode!
    document.addEventListener(
      "click",
      function (e) {
        if (!isMobileViewport()) return;
        var target = e.target;
        if (!target || !target.closest) return;

        // Settings tab click -> drill down
        var settingsTab = target.closest('[data-dbc-settings-nav="1"] [role="tab"], [class*="standardSidebarView_"] [role="tab"]');
        if (settingsTab) {
          setTimeout(function () {
            document.body.classList.add("dbc-settings-content-focused");
          }, 80);
          return;
        }

        // Server icon click (inside guilds rail): STAY IN NAV MODE! So user sees channels list for that server!
        if (target.closest('[data-dbc-guilds-rail="1"], [data-list-id="guildsnav"], nav[class*="guilds_"]')) {
          setMobileMode("nav");
          return;
        }

        // Tapping direct messages icon (DM home button) at top of server rail: STAY IN NAV MODE to see DM conversations!
        if (target.closest('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]')) {
          setMobileMode("nav");
          return;
        }

        // Tapping Member List icon in Header Bar toggles members drawer
        if (target.closest('[data-dbc-member-toggle-btn="1"], [aria-label*="Member"], [aria-label*="Thành viên"], [aria-label*="thành viên"]')) {
          document.body.classList.toggle("dbc-members-open");
          return;
        }

        // Tapping a Channel item or DM user item -> SWITCH TO CHAT MODE (fullscreen message area!)
        var chanItem = target.closest(
          '[data-list-id="channels"] a[href^="/channels/"], ' +
            '[data-list-id="channels"] [data-list-item-id^="channels___"], ' +
            '[data-list-id^="private-channels"] a[href^="/channels/@me/"], ' +
            '[class*="sidebar_"] a[href^="/channels/"], ' +
            '[class*="sidebar_"] [role="listitem"]'
        );
        if (chanItem) {
          if (!chanItem.getAttribute("aria-expanded") || chanItem.tagName === "A") {
            setTimeout(function () {
              setMobileMode("chat");
            }, 80);
          }
        }
      },
      true
    );

    // 6. Swipe Gestures
    var touchStartX = 0;
    var touchStartY = 0;
    document.addEventListener(
      "touchstart",
      function (e) {
        if (!isMobileViewport() || !e.touches || e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    document.addEventListener(
      "touchend",
      function (e) {
        if (!isMobileViewport() || !e.changedTouches || e.changedTouches.length !== 1) return;
        if (document.body.classList.contains("dbc-page-login")) return;
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dy > 60) return;

        if (currentMobileMode === "chat") {
          if (dx > 70) {
            // Swipe right anywhere in chat -> back to server & channel list (matches Discord iOS)
            setMobileMode("nav");
          } else if (touchStartX >= window.innerWidth - 50 && dx < -60) {
            document.body.classList.toggle("dbc-members-open");
          }
        } else if (currentMobileMode === "nav") {
          if (dx < -70) {
            setMobileMode("chat");
          }
        }
      },
      { passive: true }
    );

    // 7. Virtual Keyboard handling
    document.addEventListener("focusin", function (e) {
      if (!isMobileViewport()) return;
      var t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.getAttribute("role") === "textbox" || t.isContentEditable)) {
        document.body.classList.add("dbc-keyboard-open");
      }
    });
    document.addEventListener("focusout", function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!a || (a.tagName !== "INPUT" && a.tagName !== "TEXTAREA" && a.getAttribute("role") !== "textbox" && !a.isContentEditable)) {
          document.body.classList.remove("dbc-keyboard-open");
        }
      }, 100);
    });

    // 8. Observe DOM mutations & location changes
    var rafPending = false;
    var scheduleTag = function () {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        tagDiscordMobileLayout();
      });
    };
    var observer = new MutationObserver(scheduleTag);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleTag);
    window.addEventListener("popstate", scheduleTag);
    scheduleTag();

    // 9. Fallback Bot Token Login Injection (only if Vencord AuthBoxTokenLogin hasn't rendered yet)
    setInterval(function () {
      tagDiscordMobileLayout();
      if (document.querySelector('input[name="token"], input[placeholder*="bot token" i]')) return;

      var emailInput = document.querySelector('input[name="email"], input[autocomplete*="username"]');
      if (!emailInput) return;
      var formBlock =
        emailInput.closest("form") ||
        (emailInput.parentElement &&
          emailInput.parentElement.parentElement &&
          emailInput.parentElement.parentElement.parentElement);
      if (!formBlock || formBlock.querySelector(".dbc-fallback-token-box")) return;

      Array.from(formBlock.children).forEach(function (child) {
        child.style.display = "none";
      });

      var box = document.createElement("div");
      box.className = "dbc-fallback-token-box";
      box.style.cssText = "display:flex;flex-direction:column;gap:12px;width:100%;margin-top:12px;text-align:left;";
      box.innerHTML =
        '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#b5bac1;letter-spacing:0.04em;">BOT TOKEN</div>' +
        '<input type="password" id="dbc-fallback-token-input" placeholder="Nháº­p Discord Bot Token cá»§a báº¡n..." autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#1e1f22;color:#f2f3f5;font-size:15px;outline:none;box-sizing:border-box;" />' +
        '<div id="dbc-fallback-token-err" style="color:#fa777c;font-size:13px;display:none;"></div>' +
        '<button type="button" id="dbc-fallback-token-btn" style="width:100%;padding:12px;border-radius:8px;border:none;background:#5865f2;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">ÄÄƒng nháº­p Bot</button>';

      formBlock.appendChild(box);

      var inputEl = box.querySelector("#dbc-fallback-token-input");
      var errEl = box.querySelector("#dbc-fallback-token-err");
      var btnEl = box.querySelector("#dbc-fallback-token-btn");

      btnEl.addEventListener("click", async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          var raw = (inputEl.value || "").replace(/^Bot\s+/i, "").trim();
          if (!raw || raw.split(".").length < 3) {
            errEl.textContent = "Äá»‹nh dáº¡ng Bot Token khÃ´ng há»£p lá»‡!";
            errEl.style.display = "block";
            return;
          }
          errEl.style.display = "none";
          btnEl.disabled = true;
          btnEl.textContent = "Äang Ä‘Äƒng nháº­p...";

          var finishLogin = function () {
            safeSetSession("currentShard", "0");
            safeSetLocal("token", JSON.stringify(raw));
            btnEl.textContent = "ThÃ nh cÃ´ng! Äang má»Ÿ Discord...";

            var usedWebpack = false;
            try {
              if (window.Vencord && window.Vencord.Webpack) {
                var LoginMod = window.Vencord.Webpack.findByProps("loginToken", "login");
                if (LoginMod && typeof LoginMod.loginToken === "function") {
                  LoginMod.loginToken(raw);
                  usedWebpack = true;
                }
              }
            } catch (e) {}

            setTimeout(function () {
              if (window.location.pathname === "/login" || !usedWebpack) {
                window.location.href = "/channels/@me";
              }
            }, 600);
          };

          var watchdog = setTimeout(finishLogin, 3500);

          try {
            var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
            if (ctrl) {
              setTimeout(function () {
                ctrl.abort();
              }, 3000);
            }
            var fetchRes = await origFetch.call(window, "/dbc-bridge/get-bot-info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: raw }),
              signal: ctrl ? ctrl.signal : undefined,
            });
            var checkRes = await fetchRes.json();
            if (checkRes) {
              if (!checkRes.success) {
                clearTimeout(watchdog);
                errEl.textContent = checkRes.message || "Bot Token khÃ´ng há»£p lá»‡!";
                errEl.style.display = "block";
                btnEl.disabled = false;
                btnEl.textContent = "ÄÄƒng nháº­p Bot";
                return;
              }
              cachedBotMeta = checkRes;
              safeSetSession("__dbc_bot_meta__", JSON.stringify(checkRes));
              safeSetSession("allShards", String(checkRes.allShards || 1));
            }
          } catch (netErr) {
            console.warn("get-bot-info warning:", netErr);
          }

          clearTimeout(watchdog);
          finishLogin();
        } catch (fatalErr) {
          errEl.textContent = "Lá»—i: " + (fatalErr && fatalErr.message ? fatalErr.message : String(fatalErr));
          errEl.style.display = "block";
          btnEl.disabled = false;
          btnEl.textContent = "ÄÄƒng nháº­p Bot";
        }
      });
    }, 800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileUI);
  } else {
    initMobileUI();
  }
})();
