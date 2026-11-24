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

  // Intercept Discord Gateway WebSocket OP 2 (IDENTIFY), OP 1 (HEARTBEAT) & incoming READY payload at transport layer!
  // Guarantees Bot Token authentication (stripping 'Bot ', injecting intents & shard, nulling QoS heartbeat, and patching READY user.bot=false)
  // even on iOS Safari WebKit if Vencord's regex patch on _doIdentify / handleDispatch is ever bypassed.
  let cachedBotMeta = null;
  try {
    const savedMeta = window.sessionStorage.getItem("__dbc_bot_meta__");
    if (savedMeta) cachedBotMeta = JSON.parse(savedMeta);
  } catch (e) {}

  function patchReadyDispatchPayload(pkt) {
    if (!pkt || pkt.op !== 0 || pkt.t !== "READY" || !pkt.d || !pkt.d.user) return pkt;
    const d = pkt.d;
    // If Vencord's handleDispatchPatch hasn't patched it yet, patch it here so Discord Web accepts the Bot account
    if (d.user.bot === true || !d.user.email) {
      d.user.bot = false;
      d.user.premium = true;
      d.user.premium_type = 2;
      d.user.mfa_enabled = 1;
      d.user.purchased_flags = 3;
      d.user.phone = "33550336";
      d.user.verified = true;
      d.user.mobile = true;
      d.user.desktop = true;
      d.user.nsfw_allowed = true;
      d.user.email = d.user.id + "@cyrene.moe";
      d.user.age_verification_status = 3;
      d.sessions = d.sessions || [];
      d.relationships = d.relationships || [];
      d.connected_accounts = d.connected_accounts || [];
      d.broadcaster_user_ids = d.broadcaster_user_ids || [];
      d.linked_users = d.linked_users || [];
      d.guild_join_requests = d.guild_join_requests || [];
      d.tutorial = null;
      d.pending_payments = null;
      d.analytics_token = null;
      d.explicit_content_scan_version = 4;
      d.friend_suggestion_count = 0;
      d.api_code_version = 1;
      d.ad_personalization_toggles_disabled = true;
      d.read_state = d.read_state || { version: 0, partial: false, entries: [] };
      d.auth = d.auth || { authenticator_types: [2, 3] };
      d.consents = d.consents || { personalization: { consented: false } };
      d.notification_settings = d.notification_settings || { flags: 0 };
      d.user_guild_settings = d.user_guild_settings || { entries: [], version: 0, partial: false };
      d.regional_feature_config = d.regional_feature_config || { age_gated_features: 0, teen_by_default_settings: 0 };
      d.country_code = "US";
      d.subdivision_code = "CA";
      const defChannel = window.BotClientNative.getPrivateChannelDefault();
      d.private_channels = d.private_channels && d.private_channels.length ? d.private_channels : [defChannel];
      d.guild_experiments = d.guild_experiments || window.BotClientNative.getGuildExperiments();
      d.experiments = d.experiments || window.BotClientNative.getUserExperiments([], d.user.id);
      d.apex_experiments = d.apex_experiments || window.BotClientNative.getApexExperiments(d.user.id);
      d.auth_session_id_hash = btoa("aiko-chan-ai/DiscordBotClient");
      d.static_client_session_id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : "dbc-session";
      d.users = [defChannel.recipients[0]].concat(d.users || []);
    }
    return pkt;
  }

  const OrigWebSocket = window.WebSocket;
  if (OrigWebSocket) {
    function PatchedWebSocket(url, protocols) {
      // Force JSON encoding (without zlib-stream binary compression) if Vencord isn't handling _doIdentify so we can inspect/patch READY packets seamlessly
      if (typeof url === "string" && url.indexOf("gateway.discord.gg") !== -1) {
        url = url.replace("&compress=zlib-stream", "").replace("&compress=zstd-stream", "");
      }
      const ws = protocols !== undefined ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);

      let userOnMessage = null;
      Object.defineProperty(ws, "onmessage", {
        configurable: true,
        enumerable: true,
        get: function () {
          return userOnMessage;
        },
        set: function (fn) {
          userOnMessage = fn;
          if (typeof fn !== "function") {
            OrigWebSocket.prototype.addEventListener.call(ws, "message", function () {});
            return;
          }
          OrigWebSocket.prototype.addEventListener.call(ws, "message", function (ev) {
            if (typeof ev.data === "string" && ev.data.indexOf('"READY"') !== -1) {
              try {
                const parsed = JSON.parse(ev.data);
                if (parsed && parsed.t === "READY") {
                  const patched = JSON.stringify(patchReadyDispatchPayload(parsed));
                  const syntheticEv = new MessageEvent("message", {
                    data: patched,
                    origin: ev.origin,
                    lastEventId: ev.lastEventId,
                    source: ev.source,
                    ports: ev.ports,
                  });
                  return fn.call(ws, syntheticEv);
                }
              } catch (e) {}
            }
            return fn.call(ws, ev);
          });
        },
      });

      return ws;
    }
    PatchedWebSocket.prototype = OrigWebSocket.prototype;
    PatchedWebSocket.CONNECTING = OrigWebSocket.CONNECTING;
    PatchedWebSocket.OPEN = OrigWebSocket.OPEN;
    PatchedWebSocket.CLOSING = OrigWebSocket.CLOSING;
    PatchedWebSocket.CLOSED = OrigWebSocket.CLOSED;
    window.WebSocket = PatchedWebSocket;

    const OrigSend = OrigWebSocket.prototype.send;
    OrigWebSocket.prototype.send = function (data) {
      if (typeof data === "string" && data.charAt(0) === "{") {
        try {
          const pkt = JSON.parse(data);
          // OP 1 / OP 12 QoS Heartbeat: Discord bots must send d: seq (number or null), never a QoS object
          if (pkt && pkt.op === 1 && pkt.d && typeof pkt.d === "object") {
            pkt.d = typeof pkt.d.seq === "number" ? pkt.d.seq : null;
            return OrigSend.call(this, JSON.stringify(pkt));
          }
          // OP 2 IDENTIFY: Ensure intents & shard are always attached for Bot accounts
          if (pkt && pkt.op === 2 && pkt.d) {
            if (typeof pkt.d.token === "string") {
              pkt.d.token = pkt.d.token.replace(/^Bot\s+/i, "").trim();
            }
            if (pkt.d.intents === undefined) {
              const wsRef = this;
              const tok = pkt.d.token;
              const applyAndSend = function (meta) {
                const shardId = parseInt(window.sessionStorage.getItem("currentShard") || "0", 10) || 0;
                const allShards = (meta && meta.allShards) || parseInt(window.sessionStorage.getItem("allShards") || "1", 10) || 1;
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
                    try {
                      window.sessionStorage.setItem("__dbc_bot_meta__", JSON.stringify(info));
                      window.sessionStorage.setItem("allShards", String(info.allShards || 1));
                    } catch (e) {}
                  }
                  applyAndSend(info);
                });
              }
              return;
            }
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

    // Fallback Bot Token Login Injection on Mobile / iOS Safari if Discord renders the standard email/password form
    setInterval(function () {
      // Do not inject fallback if Vencord's native AuthBoxTokenLogin is already rendered!
      if (document.querySelector('input[name="token"][placeholder="Enter your bot token"]')) return;

      const emailInput = document.querySelector('input[name="email"], input[autocomplete*="username"]');
      if (!emailInput) return;
      const formBlock = emailInput.closest("form") || emailInput.parentElement?.parentElement?.parentElement;
      if (!formBlock || formBlock.querySelector(".dbc-fallback-token-box")) return;

      // Hide standard email/password fields
      Array.from(formBlock.children).forEach(function (child) {
        child.style.display = "none";
      });

      const box = document.createElement("div");
      box.className = "dbc-fallback-token-box";
      box.style.cssText = "display:flex;flex-direction:column;gap:12px;width:100%;margin-top:12px;text-align:left;";
      box.innerHTML =
        '<div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#b5bac1;letter-spacing:0.04em;">BOT TOKEN</div>' +
        '<input type="password" id="dbc-fallback-token-input" placeholder="Nhập Discord Bot Token của bạn..." autocomplete="off" autocapitalize="off" spellcheck="false" style="width:100%;padding:12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:#1e1f22;color:#f2f3f5;font-size:15px;outline:none;" />' +
        '<div id="dbc-fallback-token-err" style="color:#fa777c;font-size:13px;display:none;">Token không hợp lệ!</div>' +
        '<button type="button" id="dbc-fallback-token-btn" style="width:100%;padding:12px;border-radius:8px;border:none;background:#5865f2;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">Login bằng Bot Token</button>';

      formBlock.appendChild(box);

      const inputEl = box.querySelector("#dbc-fallback-token-input");
      const errEl = box.querySelector("#dbc-fallback-token-err");
      const btnEl = box.querySelector("#dbc-fallback-token-btn");

      btnEl.addEventListener("click", async function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        const raw = (inputEl.value || "").replace(/^Bot\s+/i, "").trim();
        if (!raw || raw.split(".").length < 3) {
          errEl.textContent = "Định dạng Bot Token không hợp lệ!";
          errEl.style.display = "block";
          return;
        }
        errEl.style.display = "none";
        btnEl.disabled = true;
        btnEl.textContent = "Đang xác thực Bot...";

        try {
          const checkPromise = window.BotClientNative.getBotInfo(raw);
          const timeoutPromise = new Promise(function (resolve) {
            setTimeout(function () {
              resolve({ timeout: true });
            }, 5000);
          });
          const checkRes = await Promise.race([checkPromise, timeoutPromise]);
          if (checkRes && !checkRes.timeout) {
            if (!checkRes.success) {
              errEl.textContent =
                checkRes.message ||
                "Bot Token không hợp lệ hoặc chưa bật MessageContent Intent!";
              errEl.style.display = "block";
              btnEl.disabled = false;
              btnEl.textContent = "Login bằng Bot Token";
              return;
            }
            cachedBotMeta = checkRes;
            try {
              window.sessionStorage.setItem(
                "__dbc_bot_meta__",
                JSON.stringify(checkRes)
              );
              window.sessionStorage.setItem(
                "allShards",
                String(checkRes.allShards || 1)
              );
            } catch (e) {}
          }
        } catch (err) {
          console.warn(err);
        }

        window.sessionStorage.setItem("currentShard", "0");
        window.localStorage.setItem("token", JSON.stringify(raw));
        btnEl.textContent = "Đăng nhập thành công! Đang vào Discord...";

        let loggedInViaWebpack = false;
        try {
          if (window.Vencord && window.Vencord.Webpack) {
            const LoginMod = window.Vencord.Webpack.findByProps(
              "loginToken",
              "login"
            );
            if (LoginMod && typeof LoginMod.loginToken === "function") {
              LoginMod.loginToken(raw);
              loggedInViaWebpack = true;
            }
          }
        } catch (err) {
          console.warn(err);
        }

        // Always navigate into the app after 700ms if still on /login
        setTimeout(function () {
          if (window.location.pathname === "/login" || !loggedInViaWebpack) {
            window.location.href = "/app";
          }
        }, 700);
      });
    }, 600);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMobileUI);
  } else {
    initMobileUI();
  }
})();
