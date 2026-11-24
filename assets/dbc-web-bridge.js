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
      "<span>✨ Discohook & Components V2 Editor</span>" +
      '<button type="button" id="dbc-discohook-close">Đóng</button>' +
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

  // 5. Native Discord Mobile App Layout Tagger & Navigation Controller
  var initialDrawerAutoOpened = false;

  function tagDiscordMobileLayout() {
    if (!document.body) return;

    var guildsList = document.querySelector('[data-list-id="guildsnav"]');
    var isAuth = !!guildsList && window.location.pathname.indexOf("/login") !== 0;
    document.body.classList.toggle("dbc-authenticated", isAuth);

    if (!isAuth) {
      document.body.classList.remove("dbc-drawer-open", "dbc-members-open");
      return;
    }

    // Auto-open Server/Channel drawer once when first arriving on /channels/@me on mobile
    if (!initialDrawerAutoOpened && window.innerWidth <= 820) {
      initialDrawerAutoOpened = true;
      if (window.location.pathname === "/channels/@me" || window.location.pathname === "/app" || window.location.pathname === "/") {
        document.body.classList.add("dbc-drawer-open");
      }
    }

    var guildsNav = guildsList.closest("nav") || guildsList.parentElement;
    var chanList = document.querySelector('[data-list-id="channels"], [data-list-id^="private-channels"]');
    var mainEl =
      document.querySelector('main[aria-label], main') ||
      (document.querySelector('[data-list-id^="chat-messages"]')
        ? document.querySelector('[data-list-id^="chat-messages"]').closest("section, div")
        : null);

    // Identify unified left drawer vs split guilds + channels panes
    if (guildsNav && chanList) {
      var common = guildsNav.parentElement;
      while (common && common !== document.body && !common.contains(chanList)) {
        common = common.parentElement;
      }

      if (common && common !== document.body) {
        var containsMain = mainEl ? common.contains(mainEl) : common.children.length >= 2 && common.lastElementChild && !common.lastElementChild.contains(chanList);
        if (!containsMain) {
          common.setAttribute("data-dbc-drawer", "unified");
          if (common.parentElement) {
            common.parentElement.setAttribute("data-dbc-shell", "1");
            Array.from(common.parentElement.children).forEach(function (sib) {
              if (sib !== common && sib.tagName === "DIV") {
                sib.setAttribute("data-dbc-content", "1");
              }
            });
          }
          // Tag direct child of unified drawer that holds chanList
          var chanWrap = chanList;
          while (chanWrap && chanWrap.parentElement !== common) {
            chanWrap = chanWrap.parentElement;
          }
          if (chanWrap) chanWrap.setAttribute("data-dbc-chan-inner", "1");
        } else {
          // common is the outer shell holding guildsNav + chanSidebar + mainContent
          common.setAttribute("data-dbc-shell", "1");
          var gTop = guildsNav;
          while (gTop && gTop.parentElement !== common) gTop = gTop.parentElement;
          var cTop = chanList;
          while (cTop && cTop.parentElement !== common) cTop = cTop.parentElement;

          if (gTop && cTop && gTop === cTop) {
            gTop.setAttribute("data-dbc-drawer", "unified");
            Array.from(common.children).forEach(function (sib) {
              if (sib !== gTop && sib.tagName === "DIV") sib.setAttribute("data-dbc-content", "1");
            });
          } else {
            if (gTop) gTop.setAttribute("data-dbc-guilds-rail", "1");
            if (cTop) cTop.setAttribute("data-dbc-chan-pane", "1");
            Array.from(common.children).forEach(function (sib) {
              if (sib !== gTop && sib !== cTop && sib.tagName === "DIV") {
                sib.setAttribute("data-dbc-content", "1");
              }
            });
          }
        }
      }
    }

    // Tag Channel Top Header Bar so channel title never overlaps the mobile menu button
    if (mainEl) {
      var headerBar =
        mainEl.querySelector('section[aria-label]') ||
        (mainEl.firstElementChild && mainEl.firstElementChild.offsetHeight <= 64 ? mainEl.firstElementChild : null);
      if (headerBar) headerBar.setAttribute("data-dbc-header-bar", "1");
    }

    // Tag Right-Hand Members / Profile Sidebar Pane
    var membersList = document.querySelector('[data-list-id^="members-"]');
    if (membersList && mainEl) {
      var mPane = membersList;
      while (mPane && mPane.parentElement && !mPane.parentElement.contains(mainEl)) {
        mPane = mPane.parentElement;
      }
      if (mPane && mPane !== document.body && !mPane.contains(mainEl)) {
        mPane.setAttribute("data-dbc-members-pane", "1");
      }
    }

    // Hide Desktop Windows Titlebar on Mobile if present (height ~24-36px at very top above shell)
    var shellEl = document.querySelector('[data-dbc-shell="1"]');
    if (shellEl && shellEl.parentElement) {
      Array.from(shellEl.parentElement.children).forEach(function (child) {
        if (child !== shellEl && child.offsetHeight > 0 && child.offsetHeight <= 40 && !child.contains(guildsList)) {
          child.setAttribute("data-dbc-desktop-titlebar", "1");
        }
      });
    }

    // Tag User Settings / Server Settings 2-column view for clean mobile drill-down
    var settingsTabList = document.querySelector('[role="tablist"][aria-orientation="vertical"]');
    if (settingsTabList) {
      var navRegion = settingsTabList;
      while (navRegion && navRegion.parentElement && navRegion.parentElement.children.length < 2) {
        navRegion = navRegion.parentElement;
      }
      if (navRegion && navRegion.parentElement && !navRegion.parentElement.contains(guildsList)) {
        var settingsRoot = navRegion.parentElement;
        settingsRoot.setAttribute("data-dbc-settings-root", "1");
        navRegion.setAttribute("data-dbc-settings-nav", "1");
        Array.from(settingsRoot.children).forEach(function (sib) {
          if (sib !== navRegion) sib.setAttribute("data-dbc-settings-body", "1");
        });
      }
    } else {
      document.body.classList.remove("dbc-settings-content-focused");
    }

    updateMobileTabActiveState();
  }

  function updateMobileTabActiveState() {
    var tabbar = document.getElementById("dbc-mobile-tabbar");
    if (!tabbar) return;
    var drawerOpen = document.body.classList.contains("dbc-drawer-open");
    var membersOpen = document.body.classList.contains("dbc-members-open");
    var isDm = window.location.pathname.indexOf("/channels/@me") === 0;

    var btns = tabbar.querySelectorAll(".dbc-tab-btn");
    btns.forEach(function (b) {
      b.classList.remove("dbc-active");
    });
    if (membersOpen) {
      var mBtn = tabbar.querySelector('[data-tab="members"]');
      if (mBtn) mBtn.classList.add("dbc-active");
    } else if (drawerOpen && isDm) {
      var dmBtn = tabbar.querySelector('[data-tab="dms"]');
      if (dmBtn) dmBtn.classList.add("dbc-active");
    } else if (drawerOpen) {
      var sBtn = tabbar.querySelector('[data-tab="servers"]');
      if (sBtn) sBtn.classList.add("dbc-active");
    } else {
      var cBtn = tabbar.querySelector('[data-tab="servers"]');
      if (cBtn && !drawerOpen) cBtn.classList.remove("dbc-active");
    }
  }

  function openUserSettingsMobile() {
    document.body.classList.remove("dbc-drawer-open", "dbc-members-open");
    try {
      if (window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common && window.Vencord.Webpack.Common.SettingsRouter) {
        window.Vencord.Webpack.Common.SettingsRouter.open("My Account");
        return;
      }
    } catch (e) {}
    // Fallback: click Discord's User Settings gear button in the user panel
    var gearBtn = document.querySelector(
      'button[aria-label*="Settings"], button[aria-label*="Cài đặt"], button[aria-label*="Thiết lập"]'
    );
    if (gearBtn) gearBtn.click();
  }

  function navigateToDMsMobile() {
    document.body.classList.remove("dbc-members-open");
    document.body.classList.add("dbc-drawer-open");
    try {
      if (window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common && window.Vencord.Webpack.Common.NavigationRouter) {
        window.Vencord.Webpack.Common.NavigationRouter.transitionTo("/channels/@me");
        updateMobileTabActiveState();
        return;
      }
    } catch (e) {}
    var homeLink = document.querySelector('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]');
    if (homeLink) homeLink.click();
    updateMobileTabActiveState();
  }

  function toggleMembersDrawerMobile() {
    document.body.classList.remove("dbc-drawer-open");
    // Ensure Discord's Member List is actually toggled on in React if not yet mounted in DOM
    if (!document.querySelector('[data-list-id^="members-"]')) {
      var memberToggleBtn = document.querySelector(
        '[data-dbc-header-bar="1"] [aria-label*="Member"], [data-dbc-header-bar="1"] [aria-label*="Thành viên"], [data-dbc-header-bar="1"] [aria-label*="thành viên"]'
      );
      if (memberToggleBtn) memberToggleBtn.click();
    }
    document.body.classList.toggle("dbc-members-open");
    updateMobileTabActiveState();
  }

  function initMobileUI() {
    if (document.getElementById("dbc-mobile-nav-fab")) return;

    // 1. Top-Left Drawer Menu Button
    var fab = document.createElement("button");
    fab.id = "dbc-mobile-nav-fab";
    fab.type = "button";
    fab.title = "Mở danh sách Server & Kênh";
    fab.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>';
    fab.addEventListener("click", function () {
      document.body.classList.remove("dbc-members-open");
      document.body.classList.toggle("dbc-drawer-open");
      updateMobileTabActiveState();
    });
    document.body.appendChild(fab);

    // 2. Frosted Backdrop Overlay
    var backdrop = document.createElement("div");
    backdrop.id = "dbc-mobile-backdrop";
    backdrop.addEventListener("click", function () {
      document.body.classList.remove("dbc-drawer-open", "dbc-members-open");
      updateMobileTabActiveState();
    });
    document.body.appendChild(backdrop);

    // 3. Settings Mobile Back Button
    var settingsBackBtn = document.createElement("button");
    settingsBackBtn.id = "dbc-settings-back-btn";
    settingsBackBtn.type = "button";
    settingsBackBtn.textContent = "← Danh mục Cài đặt";
    settingsBackBtn.addEventListener("click", function () {
      document.body.classList.remove("dbc-settings-content-focused");
    });
    document.body.appendChild(settingsBackBtn);

    // 4. Native Discord Mobile Bottom Tab Bar
    var tabbar = document.createElement("nav");
    tabbar.id = "dbc-mobile-tabbar";
    tabbar.innerHTML =
      '<button type="button" class="dbc-tab-btn" data-tab="servers">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="7" height="7" rx="2"/><rect x="14" y="4" width="7" height="7" rx="2"/><rect x="3" y="13" width="7" height="7" rx="2"/><rect x="14" y="13" width="7" height="7" rx="2"/></svg>' +
      "<span>Servers</span></button>" +
      '<button type="button" class="dbc-tab-btn" data-tab="dms">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
      "<span>Tin nhắn</span></button>" +
      '<button type="button" class="dbc-tab-btn" data-tab="members">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
      "<span>Thành viên</span></button>" +
      '<button type="button" class="dbc-tab-btn" data-tab="discohook">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>' +
      "<span>Discohook</span></button>" +
      '<button type="button" class="dbc-tab-btn" data-tab="settings">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      "<span>Cài đặt</span></button>";

    tabbar.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest(".dbc-tab-btn") : null;
      if (!btn) return;
      var tab = btn.getAttribute("data-tab");
      if (tab === "servers") {
        document.body.classList.remove("dbc-members-open");
        document.body.classList.toggle("dbc-drawer-open");
        updateMobileTabActiveState();
      } else if (tab === "dms") {
        navigateToDMsMobile();
      } else if (tab === "members") {
        toggleMembersDrawerMobile();
      } else if (tab === "discohook") {
        document.body.classList.remove("dbc-drawer-open", "dbc-members-open");
        triggerOpenDiscohookForCurrentChannel();
      } else if (tab === "settings") {
        openUserSettingsMobile();
      }
    });
    document.body.appendChild(tabbar);

    // 5. Auto-close drawer when tapping a specific Channel or DM item; focus content on Settings tab tap
    document.addEventListener(
      "click",
      function (e) {
        if (window.innerWidth > 820) return;
        var target = e.target;
        if (!target || !target.closest) return;

        // Settings vertical tab click -> drill down to content view
        var settingsTab = target.closest('[data-dbc-settings-nav="1"] [role="tab"]');
        if (settingsTab) {
          setTimeout(function () {
            document.body.classList.add("dbc-settings-content-focused");
          }, 80);
          return;
        }

        // Channel / DM item click (ignore Server icon clicks inside guildsnav so user can pick a channel in that server!)
        if (target.closest('[data-list-id="guildsnav"]')) return;

        var chanItem = target.closest(
          '[data-list-id="channels"] a[href^="/channels/"], ' +
            '[data-list-id="channels"] [data-list-item-id^="channels___"], ' +
            '[data-list-id^="private-channels"] a[href^="/channels/@me/"]'
        );
        if (chanItem) {
          // Ignore category collapse headers (they don't have href and have role="button" for category)
          var href = chanItem.getAttribute("href") || "";
          var itemId = chanItem.getAttribute("data-list-item-id") || "";
          if (href.split("/").length >= 4 || (itemId.indexOf("channels___") === 0 && itemId.indexOf("___") !== -1 && !chanItem.getAttribute("aria-expanded"))) {
            setTimeout(function () {
              document.body.classList.remove("dbc-drawer-open");
              updateMobileTabActiveState();
            }, 120);
          }
        }
      },
      true
    );

    // 6. Touch Edge Swipe Gestures (Swipe right from left edge -> Open Drawer; Swipe left -> Close Drawer)
    var touchStartX = 0;
    var touchStartY = 0;
    document.addEventListener(
      "touchstart",
      function (e) {
        if (window.innerWidth > 820 || !e.touches || e.touches.length !== 1) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    document.addEventListener(
      "touchend",
      function (e) {
        if (window.innerWidth > 820 || !e.changedTouches || e.changedTouches.length !== 1) return;
        if (!document.body.classList.contains("dbc-authenticated")) return;
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dy > 65) return;
        if (touchStartX <= 32 && dx > 65) {
          document.body.classList.remove("dbc-members-open");
          document.body.classList.add("dbc-drawer-open");
          updateMobileTabActiveState();
        } else if (dx < -70 && document.body.classList.contains("dbc-drawer-open")) {
          document.body.classList.remove("dbc-drawer-open");
          updateMobileTabActiveState();
        } else if (touchStartX >= window.innerWidth - 32 && dx < -65) {
          toggleMembersDrawerMobile();
        }
      },
      { passive: true }
    );

    // 7. Auto-hide bottom tab bar when virtual keyboard focuses chat input
    document.addEventListener("focusin", function (e) {
      if (window.innerWidth > 820) return;
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

    // 8. Observe DOM mutations to keep layout attributes tagged smoothly
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

    // 9. Fallback Bot Token Login Injection (only if Vencord's native AuthBoxTokenLogin hasn't rendered yet)
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
        '<input type="password" id="dbc-fallback-token-input" placeholder="Nhập Discord Bot Token của bạn..." autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#1e1f22;color:#f2f3f5;font-size:15px;outline:none;box-sizing:border-box;" />' +
        '<div id="dbc-fallback-token-err" style="color:#fa777c;font-size:13px;display:none;"></div>' +
        '<button type="button" id="dbc-fallback-token-btn" style="width:100%;padding:12px;border-radius:8px;border:none;background:#5865f2;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Đăng nhập Bot</button>';

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
            errEl.textContent = "Định dạng Bot Token không hợp lệ!";
            errEl.style.display = "block";
            return;
          }
          errEl.style.display = "none";
          btnEl.disabled = true;
          btnEl.textContent = "Đang đăng nhập...";

          var finishLogin = function () {
            safeSetSession("currentShard", "0");
            safeSetLocal("token", JSON.stringify(raw));
            btnEl.textContent = "Thành công! Đang mở Discord...";

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
                errEl.textContent = checkRes.message || "Bot Token không hợp lệ!";
                errEl.style.display = "block";
                btnEl.disabled = false;
                btnEl.textContent = "Đăng nhập Bot";
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
          errEl.textContent = "Lỗi: " + (fatalErr && fatalErr.message ? fatalErr.message : String(fatalErr));
          errEl.style.display = "block";
          btnEl.disabled = false;
          btnEl.textContent = "Đăng nhập Bot";
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
