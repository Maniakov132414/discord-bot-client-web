/**
 * DiscordBotClient Web Bridge (Replaces ElectronPreload.ts & Chrome Extension Content Script)
 * Provides window.BotClientNative, window.protoAPI, Vencord CSS injection,
 * Discohook MessageChannel bridge, Storage preservation, Desktop UA spoofing for Discord React,
 * Bot Guild Member @mention Hydrator, On-Device Multi-Bot Vault, and Mobile UI Controller.
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

  function cleanTokenString(val) {
    return String(val || "")
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/^Bot\s+/i, "")
      .trim();
  }

  function getStoredBotToken() {
    var raw = safeGetLocal("token") || "";
    if (!raw) return "";
    try {
      if (raw.charAt(0) === '"') raw = JSON.parse(raw);
    } catch (e) {}
    return cleanTokenString(raw);
  }

  // On-device Bot Vault (`localStorage.__dbc_saved_bots__`)
  var BOT_VAULT_KEY = "__dbc_saved_bots__";
  function loadBotVault() {
    try {
      var raw = safeGetLocal(BOT_VAULT_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function saveBotVault(list) {
    try {
      safeSetLocal(BOT_VAULT_KEY, JSON.stringify(list));
    } catch (e) {}
  }
  function upsertSavedBot(entry) {
    if (!entry || !entry.token) return;
    var tok = cleanTokenString(entry.token);
    if (!tok) return;
    var list = loadBotVault().filter(function (item) {
      if (!item || !item.token) return false;
      if (entry.id && item.id && item.id === entry.id) return false;
      return cleanTokenString(item.token) !== tok;
    });
    list.unshift({
      id: entry.id || "",
      username: entry.username || "Discord Bot",
      avatar: entry.avatar || "",
      token: tok,
      updatedAt: Date.now(),
    });
    if (list.length > 25) list = list.slice(0, 25);
    saveBotVault(list);
  }
  function removeSavedBot(token) {
    var tok = cleanTokenString(token);
    var list = loadBotVault().filter(function (item) {
      return item && cleanTokenString(item.token) !== tok;
    });
    saveBotVault(list);
  }

  // Spoof Desktop UA so Discord serves its full React app instead of the static "Download Discord App" blocker
  var origUserAgent = "";
  var isRealMobileDevice = false;
  try {
    origUserAgent = navigator.userAgent || "";
    isRealMobileDevice = /iPhone|iPad|iPod|Android|Mobile/i.test(origUserAgent);
    if (isRealMobileDevice) {
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

  if (typeof window.Notification === "undefined") {
    window.Notification = function () {};
    window.Notification.permission = "denied";
    window.Notification.requestPermission = function () {
      return Promise.resolve("denied");
    };
  }

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
      navigator.mediaDevices.enumerateDevices = function () {
        return Promise.resolve([]);
      };
    }
  } catch (e) {}

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

  // Rewrite hardcoded discord.com/api requests & upgrade http:// CDN/media URLs to https://
  function normalizeLocalEndpointUrl(url) {
    if (typeof url !== "string") return url;
    if (url.indexOf("http://cdn.discordapp.com/") === 0 || url.indexOf("http://media.discordapp.net/") === 0) {
      return "https://" + url.slice(7);
    }
    if (url.indexOf("http://images-ext-1.discordapp.net/") === 0 || url.indexOf("http://images-ext-2.discordapp.net/") === 0) {
      return "https://" + url.slice(7);
    }
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
    if (/^https:\/\/discord-attachments-uploads-[a-z0-9-]+\.storage\.googleapis\.com\//i.test(url)) {
      return window.location.origin + "/dbc-gcs-upload?url=" + encodeURIComponent(url);
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

  // Upgrade http:// media/CDN <img> src and suppress broken [?] Safari placeholders on badges/role-icons
  function sanitizeImagesInDom() {
    var imgs = document.querySelectorAll('img[src^="http://cdn.discordapp.com/"], img[src^="http://media.discordapp.net/"], img[src^="http://images-ext-"]');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute("src");
      if (src) imgs[i].setAttribute("src", "https://" + src.slice(7));
    }
  }

  document.addEventListener(
    "error",
    function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG") return;
      var src = img.getAttribute("src") || "";
      if (src.indexOf("http://") === 0 && (src.indexOf("discordapp.com") !== -1 || src.indexOf("discordapp.net") !== -1)) {
        img.setAttribute("src", "https://" + src.slice(7));
        return;
      }
      var isBadgeOrRole =
        src.indexOf("/badge-icons/") !== -1 ||
        src.indexOf("/role-icons/") !== -1 ||
        src.indexOf("/clan-badges/") !== -1 ||
        img.matches('img[class*="badge_"], img[class*="clan"], img[class*="roleIcon"], img[class*="botTag"] img');
      if (isBadgeOrRole) {
        img.setAttribute("data-dbc-hidden-broken-badge", "1");
        img.style.display = "none";
      }
    },
    true
  );

  var cachedBotMeta = null;
  try {
    var savedMeta = safeGetSession("__dbc_bot_meta__");
    if (savedMeta) cachedBotMeta = JSON.parse(savedMeta);
  } catch (e) {}

  // Track active Gateway WebSockets for Opcode 8 REQUEST_GUILD_MEMBERS
  var activeGatewaySockets = [];
  var OrigWebSocket = window.WebSocket;
  if (OrigWebSocket && OrigWebSocket.prototype) {
    var OrigSend = OrigWebSocket.prototype.send;
    OrigWebSocket.prototype.send = function (data) {
      if (activeGatewaySockets.indexOf(this) === -1 && this.url && this.url.indexOf("gateway") !== -1) {
        activeGatewaySockets.push(this);
        if (activeGatewaySockets.length > 4) activeGatewaySockets.shift();
      }
      if (typeof data === "string" && data.charAt(0) === "{") {
        try {
          var pkt = JSON.parse(data);
          if (pkt && pkt.op === 1 && pkt.d !== null && typeof pkt.d === "object") {
            pkt.d = typeof pkt.d.seq === "number" ? pkt.d.seq : null;
            return OrigSend.call(this, JSON.stringify(pkt));
          }
          if (pkt && pkt.op === 2 && pkt.d && pkt.d.intents === undefined) {
            if (typeof pkt.d.token === "string") {
              pkt.d.token = cleanTokenString(pkt.d.token);
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
        var cleaned = cleanTokenString(token);
        var res = await origFetch.call(window, "/dbc-bridge/get-bot-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: cleaned }),
        });
        var json = await res.json();
        if (json && json.success && json.data) {
          var botUser = json.data.bot || json.data;
          upsertSavedBot({
            id: botUser.id || json.data.id || "",
            username: botUser.username || json.data.name || "Discord Bot",
            avatar: botUser.avatar || json.data.icon || "",
            token: cleaned,
          });
        }
        return json;
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
      '<span style="display:inline-flex;align-items:center;gap:8px"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>Discohook &amp; Components V2 Editor</span>' +
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

  // ============================================================================
  // 4a. ON-DEVICE MULTI-BOT ACCOUNT SWITCHER MODAL (100% Inline SVG)
  // ============================================================================
  var vaultModal = null;

  function escHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  }

  function activateBotToken(rawToken, meta) {
    var cleaned = cleanTokenString(rawToken);
    if (!cleaned) return;
    safeSetSession("currentShard", "0");
    safeSetLocal("token", JSON.stringify(cleaned));
    if (meta && meta.success) {
      cachedBotMeta = meta;
      safeSetSession("__dbc_bot_meta__", JSON.stringify(meta));
      safeSetSession("allShards", String(meta.allShards || 1));
    }
    try {
      if (window.Vencord && window.Vencord.Webpack) {
        var LoginMod = window.Vencord.Webpack.findByProps("loginToken", "login");
        if (LoginMod && typeof LoginMod.loginToken === "function") {
          LoginMod.loginToken(cleaned);
        }
      }
    } catch (e) {}
    setTimeout(function () {
      window.location.href = "/channels/@me";
    }, 350);
  }

  function ensureVaultModal() {
    if (vaultModal) return;
    vaultModal = document.createElement("div");
    vaultModal.id = "dbc-bot-vault-modal";
    vaultModal.className = "dbc-hidden";
    vaultModal.addEventListener("click", function (e) {
      if (e.target === vaultModal) closeBotVaultModal();
    });
    document.body.appendChild(vaultModal);
  }

  function renderVaultModal() {
    ensureVaultModal();
    var bots = loadBotVault();
    var activeTok = getStoredBotToken();

    // Also include current logged-in bot if not yet in vault
    if (activeTok && !bots.some(function (b) { return cleanTokenString(b.token) === activeTok; })) {
      var curUser = null;
      try {
        if (window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common && window.Vencord.Webpack.Common.UserStore) {
          curUser = window.Vencord.Webpack.Common.UserStore.getCurrentUser();
        }
      } catch (e) {}
      upsertSavedBot({
        id: curUser ? curUser.id : "",
        username: curUser ? (curUser.globalName || curUser.username) : "Bot hiện tại",
        avatar: curUser ? (curUser.avatar || "") : "",
        token: activeTok,
      });
      bots = loadBotVault();
    }

    var listHtml = bots.length
      ? bots
          .map(function (b, idx) {
            var isCur = activeTok && cleanTokenString(b.token) === activeTok;
            var avatarUrl = b.avatar && b.id
              ? "https://cdn.discordapp.com/avatars/" + escHtml(b.id) + "/" + escHtml(b.avatar) + ".png?size=64"
              : "https://cdn.discordapp.com/embed/avatars/0.png";
            return (
              '<div class="dbc-vault-item ' + (isCur ? "active" : "") + '">' +
              '  <img class="dbc-vault-avatar" src="' + avatarUrl + '" alt=""/>' +
              '  <div class="dbc-vault-meta">' +
              '    <div class="dbc-vault-name">' + escHtml(b.username || "Bot") + "</div>" +
              '    <div class="dbc-vault-id">' + (b.id ? "ID: " + escHtml(b.id) : "Đã lưu cục bộ") + "</div>" +
              "  </div>" +
              '  <div class="dbc-vault-actions">' +
              (isCur
                ? '<span style="font-size:11px;font-weight:700;color:#30d158;padding:4px 8px">Đang dùng</span>'
                : '<button type="button" class="dbc-vault-btn" data-vault-use="' + idx + '">Chuyển</button>') +
              '    <button type="button" class="dbc-vault-del" data-vault-del="' + idx + '" title="Xoá">' +
              '      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>' +
              "    </button>" +
              "  </div>" +
              "</div>"
            );
          })
          .join("")
      : '<div style="font-size:13px;color:#949ba4;text-align:center;padding:10px 0">Chưa có Bot nào được lưu trên thiết bị này.</div>';

    vaultModal.innerHTML =
      '<div class="dbc-vault-card">' +
      '  <div class="dbc-vault-header">' +
      '    <span style="display:inline-flex;align-items:center;gap:8px">' +
      '      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>' +
      "      <span>Tài khoản Bot</span>" +
      "    </span>" +
      '    <button type="button" class="dbc-vault-close" id="dbc-vault-close-btn" aria-label="Đóng">' +
      '      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
      "    </button>" +
      "  </div>" +
      '  <div class="dbc-vault-body">' +
      '    <div class="dbc-vault-note">' +
      '      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#5865f2" stroke-width="2" style="flex-shrink:0"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' +
      "      <span>Token chỉ lưu cục bộ trên máy, chỉ gửi tới Discord API.</span>" +
      "    </div>" +
      '    <div class="dbc-vault-list">' + listHtml + "</div>" +
      '    <div class="dbc-vault-add">' +
      '      <input type="password" id="dbc-vault-token-input" class="dbc-vault-input" placeholder="Dán Bot Token mới để thêm..." autocomplete="off" autocapitalize="off" spellcheck="false" />' +
      '      <div id="dbc-vault-err" class="dbc-vault-err dbc-hidden"></div>' +
      '      <button type="button" id="dbc-vault-add-btn" class="dbc-vault-add-btn">' +
      '        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
      "        <span>Thêm &amp; Đăng nhập Bot</span>" +
      "      </button>" +
      "    </div>" +
      "  </div>" +
      "</div>";

    document.getElementById("dbc-vault-close-btn").onclick = closeBotVaultModal;

    var useBtns = vaultModal.querySelectorAll("[data-vault-use]");
    for (var i = 0; i < useBtns.length; i++) {
      (function (btn) {
        btn.onclick = async function () {
          var idx = parseInt(btn.getAttribute("data-vault-use"), 10);
          var target = bots[idx];
          if (!target) return;
          btn.disabled = true;
          btn.textContent = "...";
          var info = await window.BotClientNative.getBotInfo(target.token);
          activateBotToken(target.token, info);
        };
      })(useBtns[i]);
    }

    var delBtns = vaultModal.querySelectorAll("[data-vault-del]");
    for (var j = 0; j < delBtns.length; j++) {
      (function (btn) {
        btn.onclick = function () {
          var idx = parseInt(btn.getAttribute("data-vault-del"), 10);
          var target = bots[idx];
          if (!target) return;
          removeSavedBot(target.token);
          renderVaultModal();
        };
      })(delBtns[j]);
    }

    document.getElementById("dbc-vault-add-btn").onclick = async function () {
      var inp = document.getElementById("dbc-vault-token-input");
      var err = document.getElementById("dbc-vault-err");
      var addBtn = document.getElementById("dbc-vault-add-btn");
      var raw = cleanTokenString(inp ? inp.value : "");
      if (!raw || raw.split(".").length < 3) {
        err.textContent = "Định dạng Bot Token không hợp lệ!";
        err.classList.remove("dbc-hidden");
        return;
      }
      err.classList.add("dbc-hidden");
      addBtn.disabled = true;
      var info = await window.BotClientNative.getBotInfo(raw);
      if (!info || !info.success) {
        err.textContent = (info && info.message) || "Không xác thực được Bot Token!";
        err.classList.remove("dbc-hidden");
        addBtn.disabled = false;
        return;
      }
      activateBotToken(raw, info);
    };
  }

  function openBotVaultModal() {
    renderVaultModal();
    vaultModal.classList.remove("dbc-hidden");
  }

  function closeBotVaultModal() {
    if (vaultModal) vaultModal.classList.add("dbc-hidden");
  }

  // ============================================================================
  // 4b. BOT GUILD MEMBER HYDRATOR FOR @MENTION AUTOCOMPLETE (Web & Mobile)
  // ============================================================================
  var hydratedGuilds = {};
  var searchQueryCache = {};
  var lastActiveChannelKey = "";
  var mentionSearchTimer = null;

  function getFluxDispatcher() {
    try {
      if (window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common) {
        return window.Vencord.Webpack.Common.FluxDispatcher || null;
      }
    } catch (e) {}
    return null;
  }

  function dispatchGuildMembersChunk(guildId, members) {
    if (!guildId || !Array.isArray(members) || members.length === 0) return;
    var dispatcher = getFluxDispatcher();
    if (!dispatcher || typeof dispatcher.dispatch !== "function") return;
    try {
      dispatcher.dispatch({
        type: "GUILD_MEMBERS_CHUNK",
        guildId: guildId,
        members: members,
        notFound: [],
      });
    } catch (e) {}
  }

  function harvestChannelMessageAuthors(guildId, channelId) {
    try {
      var common = window.Vencord && window.Vencord.Webpack && window.Vencord.Webpack.Common;
      if (!common || !common.MessageStore) return;
      var msgCollection = common.MessageStore.getMessages(channelId);
      if (!msgCollection) return;
      var arr = typeof msgCollection.toArray === "function" ? msgCollection.toArray() : (msgCollection._array || []);
      if (!Array.isArray(arr) || arr.length === 0) return;
      var seen = {};
      var syntheticMembers = [];
      for (var i = 0; i < arr.length; i++) {
        var msg = arr[i];
        var candidates = [];
        if (msg && msg.author) candidates.push(msg.author);
        if (msg && Array.isArray(msg.mentions)) {
          for (var j = 0; j < msg.mentions.length; j++) candidates.push(msg.mentions[j]);
        }
        for (var k = 0; k < candidates.length; k++) {
          var u = candidates[k];
          if (!u || !u.id || seen[u.id]) continue;
          seen[u.id] = true;
          syntheticMembers.push({
            user: {
              id: u.id,
              username: u.username || "user",
              global_name: u.globalName || u.global_name || null,
              discriminator: u.discriminator || "0",
              avatar: u.avatar || null,
              bot: !!u.bot,
            },
            nick: null,
            roles: [],
            joined_at: new Date().toISOString(),
          });
        }
      }
      if (syntheticMembers.length > 0) {
        dispatchGuildMembersChunk(guildId, syntheticMembers);
      }
    } catch (e) {}
  }

  function requestGatewayGuildMembers(guildId, query, limit) {
    try {
      for (var i = 0; i < activeGatewaySockets.length; i++) {
        var ws = activeGatewaySockets[i];
        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              op: 8,
              d: {
                guild_id: guildId,
                query: query || "",
                limit: limit || 50,
                presences: false,
              },
            })
          );
          break;
        }
      }
    } catch (e) {}
  }

  function hydrateGuildMembers(guildId, channelId) {
    if (!guildId || guildId === "@me") return;
    if (channelId) harvestChannelMessageAuthors(guildId, channelId);
    if (hydratedGuilds[guildId]) return;
    hydratedGuilds[guildId] = true;

    var tok = getStoredBotToken();
    if (!tok) return;

    requestGatewayGuildMembers(guildId, "", 100);

    origFetch
      .call(window, "/api/v9/guilds/" + encodeURIComponent(guildId) + "/members?limit=100", {
        headers: { Authorization: "Bot " + tok },
      })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (members) {
        if (Array.isArray(members) && members.length > 0) {
          dispatchGuildMembersChunk(guildId, members);
        }
      })
      .catch(function () {});
  }

  function searchGuildMembersForMention(guildId, query) {
    if (!guildId || guildId === "@me" || !query || query.length < 2) return;
    var cacheKey = guildId + ":" + query.toLowerCase();
    if (searchQueryCache[cacheKey]) return;
    searchQueryCache[cacheKey] = true;

    var tok = getStoredBotToken();
    if (!tok) return;

    requestGatewayGuildMembers(guildId, query, 20);

    origFetch
      .call(
        window,
        "/api/v9/guilds/" + encodeURIComponent(guildId) + "/members/search?query=" + encodeURIComponent(query) + "&limit=20",
        {
          headers: { Authorization: "Bot " + tok },
        }
      )
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (members) {
        if (Array.isArray(members) && members.length > 0) {
          dispatchGuildMembersChunk(guildId, members);
        }
      })
      .catch(function () {});
  }

  function getCurrentChannelContext() {
    var m = (window.location.pathname || "").match(/^\/channels\/(\d+|@me)\/(\d+)/);
    if (m) return { guildId: m[1], channelId: m[2] };
    return null;
  }

  function checkAndHydrateCurrentChannel() {
    var ctx = getCurrentChannelContext();
    if (!ctx || ctx.guildId === "@me") return;
    var key = ctx.guildId + "/" + ctx.channelId;
    if (key !== lastActiveChannelKey) {
      lastActiveChannelKey = key;
      setTimeout(function () {
        hydrateGuildMembers(ctx.guildId, ctx.channelId);
      }, 250);
    }
  }

  document.addEventListener("input", function (e) {
    var t = e.target;
    if (!t || !(t.isContentEditable || (t.getAttribute && t.getAttribute("role") === "textbox"))) return;
    var ctx = getCurrentChannelContext();
    if (!ctx || ctx.guildId === "@me") return;
    var text = t.innerText || t.textContent || "";
    var match = text.match(/@([^\s@]{2,24})$/);
    if (!match) return;
    var q = match[1];
    clearTimeout(mentionSearchTimer);
    mentionSearchTimer = setTimeout(function () {
      searchGuildMembersForMention(ctx.guildId, q);
    }, 250);
  });

  document.addEventListener(
    "mousedown",
    function (e) {
      if (e.target && e.target.closest && e.target.closest('[class*="autocomplete_"]')) {
        e.preventDefault();
      }
    },
    true
  );

  // ============================================================================
  // 5. Discord Native Mobile App Navigation Controller & Settings Drill-Down
  // ============================================================================
  var currentMobileMode = "nav";

  function isMobileViewport() {
    return isRealMobileDevice || window.innerWidth <= 900;
  }

  function syncVisualViewport() {
    try {
      var vv = window.visualViewport;
      var h = vv ? Math.round(vv.height) : window.innerHeight;
      if (h > 100) {
        document.documentElement.style.setProperty("--dbc-vvh", h + "px");
      }
      if (isMobileViewport() && vv) {
        var kbOpen = vv.height < window.innerHeight * 0.82;
        if (kbOpen) {
          document.body.classList.add("dbc-keyboard-open");
        } else {
          var a = document.activeElement;
          var inputFocused =
            a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.getAttribute("role") === "textbox" || a.isContentEditable);
          if (!inputFocused) document.body.classList.remove("dbc-keyboard-open");
        }
      }
    } catch (e) {}
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", syncVisualViewport);
    window.visualViewport.addEventListener("scroll", syncVisualViewport);
  }
  window.addEventListener("resize", syncVisualViewport);

  function isVisibleElement(el) {
    if (!el) return false;
    var st = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if (st && (st.display === "none" || st.visibility === "hidden")) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }

  function detectAndTagSettingsLayer() {
    var settingsView = document.querySelector('[class*="standardSidebarView_"]');
    var foundSettings = false;
    if (settingsView && isVisibleElement(settingsView)) {
      settingsView.setAttribute("data-dbc-settings-root", "1");
      var navReg = settingsView.querySelector('[class*="sidebarRegion_"]');
      var contReg = settingsView.querySelector('[class*="contentRegion_"]');
      if (navReg) navReg.setAttribute("data-dbc-settings-nav", "1");
      if (contReg) contReg.setAttribute("data-dbc-settings-content", "1");
      foundSettings = true;
    } else {
      // Newer Discord Settings layer/modal with [role="tablist"]
      var tablists = document.querySelectorAll('[class*="layer_"] [role="tablist"], [role="dialog"] [role="tablist"]');
      for (var i = 0; i < tablists.length; i++) {
        var tl = tablists[i];
        if (!isVisibleElement(tl)) continue;
        var tabs = tl.querySelectorAll('[role="tab"]');
        if (tabs.length < 4) continue;
        var root = tl.closest('[class*="layer_"]') || tl.closest('[role="dialog"]');
        if (!root) continue;
        var navBox = tl.closest('[class*="sidebar_"]') || tl.parentElement;
        var contentBox = root.querySelector('[role="tabpanel"]') && root.querySelector('[role="tabpanel"]').parentElement;
        if (navBox && contentBox && navBox !== contentBox) {
          root.setAttribute("data-dbc-settings-root", "1");
          navBox.setAttribute("data-dbc-settings-nav", "1");
          contentBox.setAttribute("data-dbc-settings-content", "1");
          foundSettings = true;
          break;
        }
      }
    }
    document.body.classList.toggle("dbc-settings-open", foundSettings);
    if (!foundSettings) {
      document.body.classList.remove("dbc-settings-content-focused");
    }
  }

  function closeDiscordSettings() {
    var closeBtn = document.querySelector(
      '[data-dbc-settings-root="1"] [class*="closeButton_"], [aria-label="Close" i][role="button"], [aria-label="Đóng" i][role="button"]'
    );
    if (closeBtn) {
      closeBtn.click();
    } else {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
    }
    document.body.classList.remove("dbc-settings-open", "dbc-settings-content-focused");
  }

  function updateMobileMode() {
    if (!isMobileViewport()) {
      document.body.classList.remove(
        "dbc-mobile-active",
        "dbc-mode-nav",
        "dbc-mode-chat",
        "dbc-members-open",
        "dbc-page-login",
        "dbc-settings-open",
        "dbc-settings-content-focused"
      );
      return;
    }
    document.body.classList.add("dbc-mobile-active");
    syncVisualViewport();

    var path = window.location.pathname;
    var loginEl = document.querySelector(
      'input[name="token"], #dbc-fallback-token-input, [class*="authBox_"], [class*="mainLoginContainer_"], input[name="email"]'
    );
    var isLogin = path === "/login" || isVisibleElement(loginEl);
    document.body.classList.toggle("dbc-page-login", isLogin);

    if (isLogin) {
      document.body.classList.remove("dbc-mode-nav", "dbc-mode-chat", "dbc-settings-open");
      injectLoginVaultButton();
      return;
    }

    detectAndTagSettingsLayer();

    if (path === "/channels/@me" || path === "/app" || path === "/" || path === "") {
      setMobileMode("nav");
    } else {
      if (safeGetSession("__dbc_mobile_nav_override__") === "1") {
        setMobileMode("nav");
      } else {
        setMobileMode("chat");
      }
    }
  }

  function setMobileMode(mode) {
    currentMobileMode = mode;
    if (mode === "nav") {
      safeSetSession("__dbc_mobile_nav_override__", "1");
      document.body.classList.remove("dbc-mode-chat");
      document.body.classList.add("dbc-mode-nav");
    } else {
      try {
        if (origSessionStorage) origSessionStorage.removeItem("__dbc_mobile_nav_override__");
      } catch (e) {}
      document.body.classList.remove("dbc-mode-nav");
      document.body.classList.add("dbc-mode-chat");
    }
    updateProfileStrip();
  }

  function tagDiscordMobileLayout() {
    if (!document.body) return;

    sanitizeImagesInDom();
    updateMobileMode();
    checkAndHydrateCurrentChannel();

    var titleBars = document.querySelectorAll(
      '[data-window-chrome="true"], [data-window-chrome], [class*="winTitleBar_"], [class*="typeWindows_"], [class*="withFrame_"]'
    );
    for (var i = 0; i < titleBars.length; i++) {
      titleBars[i].style.display = "none";
      titleBars[i].setAttribute("data-dbc-desktop-titlebar", "1");
    }

    var guildsNav =
      document.querySelector('nav[class*="guilds_"]') ||
      document.querySelector('[data-list-id="guildsnav"]') ||
      document.querySelector('nav[aria-label*="Servers"], nav[aria-label*="Máy chủ"]');
    if (guildsNav) {
      var gEl = guildsNav.tagName === "NAV" ? guildsNav : guildsNav.closest("nav") || guildsNav;
      gEl.setAttribute("data-dbc-guilds-rail", "1");
      guildsNav = gEl;
    }

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

    var chatArea = document.querySelector('[class*="chat_"], main');
    if (chatArea) {
      chatArea.setAttribute("data-dbc-content", "1");
      var headerBar =
        chatArea.querySelector("section[aria-label]") ||
        chatArea.querySelector('section[class*="title_"]') ||
        (chatArea.firstElementChild && chatArea.firstElementChild.offsetHeight <= 64 ? chatArea.firstElementChild : null);
      if (headerBar) {
        headerBar.setAttribute("data-dbc-header-bar", "1");
      }
    }

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

    if (meta && meta.data) {
      var botU = meta.data.bot || meta.data;
      username = botU.username || meta.data.name || "Bot";
      if (botU.avatar && botU.id) {
        avatarUrl = "https://cdn.discordapp.com/avatars/" + botU.id + "/" + botU.avatar + ".png?size=64";
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
        setTimeout(detectAndTagSettingsLayer, 120);
        return;
      }
    } catch (e) {}
    var gearBtn = document.querySelector(
      'button[aria-label*="Settings"], button[aria-label*="Cài đặt"], button[aria-label*="Thiết lập"]'
    );
    if (gearBtn) gearBtn.click();
    setTimeout(detectAndTagSettingsLayer, 120);
  }

  function injectLoginVaultButton() {
    var box = document.querySelector('[class*="authBox_"] form, [class*="authBox_"], .dbc-fallback-token-box');
    if (!box || box.querySelector("#dbc-login-vault-btn")) return;
    var btn = document.createElement("button");
    btn.id = "dbc-login-vault-btn";
    btn.type = "button";
    btn.className = "dbc-login-vault-btn";
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>' +
      "<span>Tài khoản Bot</span>";
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openBotVaultModal();
    });
    box.appendChild(btn);
  }

  function cleanupFallbackTokenBoxIfVencordMounted() {
    var vencordTokenInput = document.querySelector('input[name="token"], input[placeholder*="bot token" i]');
    if (!vencordTokenInput) return false;
    var existingFallback = document.querySelector(".dbc-fallback-token-box");
    if (existingFallback) {
      var parent = existingFallback.parentElement;
      existingFallback.remove();
      if (parent) {
        Array.from(parent.children).forEach(function (child) {
          if (child.getAttribute("data-dbc-hidden-by-fallback") === "1") {
            child.style.display = "";
            child.removeAttribute("data-dbc-hidden-by-fallback");
          }
        });
      }
    }
    return true;
  }

  function initMobileUI() {
    if (document.getElementById("dbc-mobile-back-btn")) return;

    // 1. Channel Chat Header Back Button (SVG arrow)
    var backBtn = document.createElement("button");
    backBtn.id = "dbc-mobile-back-btn";
    backBtn.type = "button";
    backBtn.title = "Quay lại danh sách kênh";
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

    // 3. Settings Mobile Back & Close Buttons (100% Inline SVG)
    var settingsBackBtn = document.createElement("button");
    settingsBackBtn.id = "dbc-settings-back-btn";
    settingsBackBtn.type = "button";
    settingsBackBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>' +
      "<span>Danh mục</span>";
    settingsBackBtn.addEventListener("click", function () {
      document.body.classList.remove("dbc-settings-content-focused");
    });
    document.body.appendChild(settingsBackBtn);

    var settingsCloseBtn = document.createElement("button");
    settingsCloseBtn.id = "dbc-settings-close-btn";
    settingsCloseBtn.type = "button";
    settingsCloseBtn.title = "Đóng cài đặt";
    settingsCloseBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    settingsCloseBtn.addEventListener("click", closeDiscordSettings);
    document.body.appendChild(settingsCloseBtn);

    // 4. Discord Native Mobile Bottom Profile Bar
    var profileStrip = document.createElement("div");
    profileStrip.id = "dbc-profile-strip";
    profileStrip.innerHTML =
      '<div class="dbc-profile-inner">' +
      '  <div class="dbc-profile-avatar"><img src="https://cdn.discordapp.com/embed/avatars/0.png" alt="Avatar"/></div>' +
      '  <div class="dbc-profile-info">' +
      '    <div class="dbc-profile-name">Bot Client</div>' +
      '    <div class="dbc-profile-tag">Trực tuyến</div>' +
      "  </div>" +
      "</div>" +
      '<div class="dbc-profile-actions">' +
      '  <button type="button" class="dbc-profile-btn" id="dbc-btn-bots" title="Tài khoản Bot">' +
      '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/></svg>' +
      "    <span>Tài khoản Bot</span>" +
      "  </button>" +
      '  <button type="button" class="dbc-profile-btn" id="dbc-btn-discohook" title="Mở Discohook">' +
      '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z"/></svg>' +
      "    <span>Embed</span>" +
      "  </button>" +
      '  <button type="button" class="dbc-profile-btn" id="dbc-btn-settings" title="Cài đặt">' +
      '    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
      "  </button>" +
      "</div>";

    profileStrip.querySelector(".dbc-profile-inner").addEventListener("click", function () {
      openBotVaultModal();
    });
    profileStrip.querySelector("#dbc-btn-bots").addEventListener("click", function (e) {
      e.stopPropagation();
      openBotVaultModal();
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

    // 5. Click Interceptor
    document.addEventListener(
      "click",
      function (e) {
        if (!isMobileViewport()) return;
        var target = e.target;
        if (!target || !target.closest) return;

        var settingsTab = target.closest('[data-dbc-settings-nav="1"] [role="tab"], [class*="standardSidebarView_"] [role="tab"]');
        if (settingsTab) {
          setTimeout(function () {
            document.body.classList.add("dbc-settings-content-focused");
          }, 80);
          return;
        }

        if (target.closest('[data-dbc-guilds-rail="1"], [data-list-id="guildsnav"], nav[class*="guilds_"]')) {
          setMobileMode("nav");
          return;
        }

        if (target.closest('[data-list-item-id="guildsnav___home"], a[href="/channels/@me"]')) {
          setMobileMode("nav");
          return;
        }

        if (target.closest('[data-dbc-member-toggle-btn="1"], [aria-label*="Member"], [aria-label*="Thành viên"], [aria-label*="thành viên"]')) {
          document.body.classList.toggle("dbc-members-open");
          return;
        }

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
              checkAndHydrateCurrentChannel();
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
        if (document.body.classList.contains("dbc-page-login") || document.body.classList.contains("dbc-settings-open")) return;
        var dx = e.changedTouches[0].clientX - touchStartX;
        var dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
        if (dy > 60) return;

        if (currentMobileMode === "chat") {
          if (dx > 70) {
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
        syncVisualViewport();
      }
    });
    document.addEventListener("focusout", function () {
      setTimeout(function () {
        var a = document.activeElement;
        if (!a || (a.tagName !== "INPUT" && a.tagName !== "TEXTAREA" && a.getAttribute("role") !== "textbox" && !a.isContentEditable)) {
          document.body.classList.remove("dbc-keyboard-open");
          syncVisualViewport();
        }
      }, 120);
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

    // 9. Fallback Bot Token Login Injection (only if Vencord AuthBoxTokenLogin hasn't rendered)
    setInterval(function () {
      tagDiscordMobileLayout();
      if (cleanupFallbackTokenBoxIfVencordMounted()) {
        injectLoginVaultButton();
        return;
      }

      var emailInput = document.querySelector('input[name="email"], input[autocomplete*="username"]');
      if (!emailInput) return;
      var formBlock =
        emailInput.closest("form") ||
        (emailInput.parentElement &&
          emailInput.parentElement.parentElement &&
          emailInput.parentElement.parentElement.parentElement);
      if (!formBlock || formBlock.querySelector(".dbc-fallback-token-box")) return;

      Array.from(formBlock.children).forEach(function (child) {
        if (child.style.display !== "none") {
          child.setAttribute("data-dbc-hidden-by-fallback", "1");
          child.style.display = "none";
        }
      });

      var box = document.createElement("div");
      box.className = "dbc-fallback-token-box";
      box.style.cssText = "display:flex;flex-direction:column;gap:12px;width:100%;margin-top:12px;text-align:left;";
      box.innerHTML =
        '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#b5bac1;letter-spacing:0.04em;">BOT TOKEN</div>' +
        '<input type="password" id="dbc-fallback-token-input" placeholder="Nhập Discord Bot Token của bạn..." autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#1e1f22;color:#f2f3f5;font-size:16px;outline:none;box-sizing:border-box;" />' +
        '<div id="dbc-fallback-token-err" style="color:#fa777c;font-size:13px;display:none;"></div>' +
        '<button type="button" id="dbc-fallback-token-btn" style="width:100%;padding:12px;border-radius:8px;border:none;background:#5865f2;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Đăng nhập Bot</button>';

      formBlock.appendChild(box);
      injectLoginVaultButton();

      var inputEl = box.querySelector("#dbc-fallback-token-input");
      var errEl = box.querySelector("#dbc-fallback-token-err");
      var btnEl = box.querySelector("#dbc-fallback-token-btn");

      btnEl.addEventListener("click", async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          var raw = cleanTokenString(inputEl.value || "");
          var parts = raw.split(".");
          var isValidShape =
            (/^mfa\.[a-z0-9_-]{20,}$/i.test(raw)) ||
            (parts.length === 3 && raw.length >= 50 && raw.length <= 160 && /^[a-z0-9_-]+$/i.test(parts[0]));
          if (!raw || !isValidShape) {
            errEl.textContent = "Định dạng Bot Token không hợp lệ!";
            errEl.style.display = "block";
            return;
          }
          errEl.style.display = "none";
          btnEl.disabled = true;
          btnEl.textContent = "Đang đăng nhập...";

          var checkRes = await window.BotClientNative.getBotInfo(raw);
          if (checkRes && !checkRes.success) {
            errEl.textContent = checkRes.message || "Bot Token không hợp lệ!";
            errEl.style.display = "block";
            btnEl.disabled = false;
            btnEl.textContent = "Đăng nhập Bot";
            return;
          }
          btnEl.textContent = "Thành công! Đang mở Discord...";
          activateBotToken(raw, checkRes);
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
