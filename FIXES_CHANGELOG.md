# Fixes Changelog (`discord-bot-client-web`)

## Audit Findings & Fixes

### 1. Mobile Login Screen Overlap (`assets/dbc-web-bridge.js`, `assets/dbc-mobile.css`, `VencordExtension/dist/Vencord.js`)
- **Root Cause**:
  - `updateMobileMode()` only enabled `dbc-page-login` when `!hasToken` (`!safeGetLocal("token")`), so any stale/expired `token` in `localStorage` left `dbc-mode-nav` / `dbc-mode-chat` active underneath the login dialog.
  - `dbc-mobile.css` applied `#app-mount [class*="base_"]` layout rules without `:not(.dbc-page-login)` and did not hide `[data-dbc-guilds-rail]`, `[data-dbc-chan-pane]`, `#dbc-profile-strip`, `#dbc-mobile-back-btn`, or Discord's floating login SVG artwork (`[class*="characterBackground_"] > svg`, `[class*="artwork_"]`).
  - If `.dbc-fallback-token-box` mounted before Vencord's `input[name="token"]`, the fallback polling loop exited early without removing `.dbc-fallback-token-box` or unhiding sibling elements, causing two overlapping login forms.
  - Vencord's `Cv` token regex (`{23,28}` first segment) and `maxLength: 100` rejected newer 70–120 char tokens, quotes, or `Bot ` prefixes.
- **Fix**:
  - Trigger `dbc-page-login` whenever `pathname === "/login"` OR any visible login element (`input[name="token"]`, `#dbc-fallback-token-input`, `[class*="authBox_"]`, `[class*="mainLoginContainer_"]`, `input[name="email"]`) is present.
  - Remove `.dbc-fallback-token-box` and restore hidden siblings as soon as Vencord's `input[name="token"]` mounts.
  - Pinned `[class*="characterBackground_"]` / `[class*="splashBackground_"]` to a clean full-screen `z-index: 100000` `#111214` overlay and hid underlying app skeleton elements during login.
  - Relaxed token validation in both `Vencord.js` (`maxLength: 160`, `{20,36}.{5,12}.{24,}`) and `dbc-web-bridge.js` (`50–160` chars, strips `Bot ` and surrounding quotes).

### 2. UTF-8 Mojibake & BOM (`assets/dbc-web-bridge.js`)
- **Root Cause**: Double-encoded UTF-8 sequences (`âœ¨`, `Ä Ã³ng`, `â† `, `Quay láº¡i...`, `Nháº­p Discord Bot Token...`, `Ä Äƒng nháº­p Bot`, etc.) broke Vietnamese UI labels and tooltips.
- **Fix**: Rewrote `assets/dbc-web-bridge.js` in clean UTF-8 (without BOM) with proper Vietnamese strings and `✨` / `←` icons.

### 3. `@mention` Tagging & Mobile Autocomplete (`assets/dbc-web-bridge.js`, `assets/dbc-mobile.css`)
- **Root Cause**:
  - Discord Bot Gateway sessions do not receive Opcode 14 lazy guild member lists, so `GuildMemberStore` remained empty and `@mention` autocomplete missed server members.
  - `assets/dbc-mobile.css` ended abruptly at line 475 with zero rules for `[class*="autocomplete_"]`, and tapping an autocomplete row on mobile triggered `blur` before selection fired.
- **Fix**:
  - Added **Bot Guild Member Hydrator** in `dbc-web-bridge.js`: on channel open, harvests `MessageStore` authors/mentions, sends Opcode 8 `REQUEST_GUILD_MEMBERS` when Gateway WS is open, fetches `GET /api/v9/guilds/:guildId/members?limit=100` (cached per guild, graceful silent fallback if `GUILD_MEMBERS` intent is off), and on typing `@<query>` (debounced 250ms, 2+ chars) queries `GET /api/v9/guilds/:guildId/members/search?query=<q>&limit=20`, dispatching `GUILD_MEMBERS_CHUNK` to `FluxDispatcher`.
  - Added fixed mobile styling for `[class*="autocomplete_"]` (`z-index: 10050`, `max-height: 40dvh`, touch scrolling) and prevented `mousedown` blur race inside `[class*="autocomplete_"]`.

### 4. iOS Keyboard Viewport, Missing Modal/Settings CSS & 25MB Upload Proxy (`assets/dbc-mobile.css`, `assets/dbc-web-bridge.js`, `src/web-server.ts`, `build/web-server.js`)
- **Root Cause**:
  - `100dvh` alone lagged/mismatched `visualViewport` during iOS soft keyboard transitions.
  - `assets/dbc-mobile.css` lacked `.dbc-hidden`, `#dbc-discohook-modal`, `#dbc-settings-back-btn`, mobile responsive `[class*="modal_"]` / `[class*="root_"]`, and `[class*="menu_"]` / `[class*="popout_"]` rules.
  - `/dbc-gcs-upload` had `limit: "10mb"`, blocking 10–25 MB uploads.
- **Fix**:
  - Synced `--dbc-vvh` from `window.visualViewport` (`resize` + `scroll`) and locked `#app-mount` height to `var(--dbc-vvh, 100dvh)`.
  - Added complete CSS for `.dbc-hidden`, `#dbc-discohook-modal` (with safe-area top inset), `#dbc-settings-back-btn` drill-down, modals, menus, and popouts.
  - Increased `/dbc-gcs-upload` body limit to `25mb` in `src/web-server.ts` and recompiled `build/web-server.js`.

### 5. Why `https://discord-bot-client-web-three.vercel.app/` Returned `404 DEPLOYMENT_NOT_FOUND`
- `DEPLOYMENT_NOT_FOUND` on Vercel indicates the deployment/project alias at that `.vercel.app` subdomain was deleted, unlinked, or expired on Vercel's side (not an Express 404 from `build/web-server.js`).
- Also note when deploying to Vercel: `@vercel/node` serverless functions enforce a hard **4.5 MB** request body cap (`FUNCTION_PAYLOAD_TOO_LARGE`) on `/dbc-gcs-upload`, whereas self-hosted Node (`node build/web-server.js`) and the standalone iOS loopback server support the full **25 MB** limit.
