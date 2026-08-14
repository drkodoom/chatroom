import { APP_VERSION } from "./config.js?v=0.17.1";

const CLIENTS = {
  modern: { name: "Default - Light", bodyClass: "theme-modern", title: "DRK CHAT", online: "ONLINE", send: "SEND", clear: "CLEAR SCREEN", clearRoom: "CLEAR ROOM", leave: "LEAVE" },
  modernDark: { name: "Default", bodyClass: "theme-modern-dark", title: "DRK CHAT", online: "ONLINE", send: "SEND", clear: "CLEAR SCREEN", clearRoom: "CLEAR ROOM", leave: "LEAVE" },
  aol90: { name: "Acirema Online", bodyClass: "theme-aol90", title: "Acirema Online - Chatroom", online: "PEOPLE HERE", send: "SEND", clear: "CLEAR MY SCREEN", clearRoom: "CLEAR ROOM HISTORY", leave: "LEAVE ROOM" },
  terminal: { name: "Phosphor", bodyClass: "theme-terminal", title: "PHOSPHOR IRC", online: "WHO", send: "TRANSMIT", clear: "CLEAR LOCAL", clearRoom: "PURGE ROOM", leave: "/PART" },
  future: { name: "One More Thing", bodyClass: "theme-future", title: "DRK FUTURE", online: "PEOPLE", send: "SEND", clear: "CLEAR VIEW", clearRoom: "CLEAR CONVERSATION", leave: "LEAVE" },
  comic: { name: "PanelChat", bodyClass: "theme-comic", title: "PANELCHAT", online: "CAST", send: "SEND!", clear: "WIPE PANEL", clearRoom: "WIPE THE ROOM", leave: "EXIT PANEL" },
  arcade: { name: "Pixel Lobby", bodyClass: "theme-arcade", title: "PIXEL LOBBY", online: "PLAYERS", send: "SEND", clear: "ERASE LOG", clearRoom: "ERASE ROOM LOG", leave: "EXIT LOBBY" },
  space: { name: "Space Station", bodyClass: "theme-space", title: "ORBITAL STATION // COMMS", online: "CREW", send: "TRANSMIT", clear: "CLEAR CONSOLE", clearRoom: "PURGE COMMS", leave: "AIRLOCK OUT" },
  tavern: { name: "Fantasy Tavern", bodyClass: "theme-tavern", title: "THE LANTERN & DRAGON", online: "PATRONS", send: "SPEAK", clear: "CLEAR TABLE", clearRoom: "BURN LEDGER", leave: "LEAVE TAVERN" },
  cartoon80: { name: "80s Cartoon", bodyClass: "theme-cartoon80", title: "SATURDAY POWER CHAT", online: "HEROES", send: "BLAST IT!", clear: "CLEAR FRAME", clearRoom: "RESET EPISODE", leave: "ROLL CREDITS" },
  vhs: { name: "VHS Horror", bodyClass: "theme-vhs", title: "CHANNEL 13 // AFTER MIDNIGHT", online: "STILL HERE", send: "TRANSMIT", clear: "ERASE TAPE", clearRoom: "WIPE TAPE", leave: "STOP TAPE" },
  newsroom: { name: "Newsroom", bodyClass: "theme-newsroom", title: "DRK NEWS NETWORK", online: "NEWS DESK", send: "FILE", clear: "CLEAR WIRE", clearRoom: "CLEAR ARCHIVE", leave: "SIGN OFF" },
  coffee: { name: "Coffee Shop", bodyClass: "theme-coffee", title: "THE COMMON CUP // COMMUNITY CAFE", online: "REGULARS", send: "SEND", clear: "CLEAR TABLE", clearRoom: "CLOSE TAB", leave: "HEAD OUT" },
  nightclub: { name: "Night Club", bodyClass: "theme-nightclub", title: "AFTERDARK // MAIN FLOOR", online: "ON THE FLOOR", send: "DROP IT", clear: "CLEAR FLOOR", clearRoom: "RESET NIGHT", leave: "STEP OUT" },
  wrestling: { name: "Pro Wrestling", bodyClass: "theme-wrestling", title: "MAIN EVENT // LIVE", online: "ROSTER", send: "CUT PROMO", clear: "CLEAR RING", clearRoom: "RESET ARENA", leave: "EXIT RING" },
  superhero: { name: "Superhero", bodyClass: "theme-superhero", title: "HERO NETWORK // WATCHTOWER", online: "HEROES ACTIVE", send: "TRANSMIT", clear: "CLEAR FEED", clearRoom: "RESET CITY", leave: "STAND DOWN" },
  godzilla: { name: "Godzilla", bodyClass: "theme-godzilla", title: "GODZILLA // TOKYO ALERT", online: "SURVIVORS", send: "BROADCAST", clear: "CLEAR RADIO", clearRoom: "RESET ALERT", leave: "EVACUATE" },
  neumorph: { name: "Off-White Neumorphism", bodyClass: "theme-neumorph", title: "SOFTSPACE", online: "PRESENT", send: "SEND", clear: "CLEAR", clearRoom: "CLEAR ROOM", leave: "LEAVE" },
  cinema: { name: "Movie Theater", bodyClass: "theme-cinema", title: "DRK CINEMA // SCREEN ONE", online: "AUDIENCE", send: "WHISPER", clear: "CLEAR SCREEN", clearRoom: "END SHOWING", leave: "EXIT THEATER" }
};

const CLIENT_CODES = {
  DRK2026: "modern", LIGHTMODE: "modern", DEFAULT: "modernDark",
  WELCOME: "aol90", AOL90: "aol90",
  TERMINAL: "terminal", PHOSPHOR: "terminal",
  FUTURE: "future", APPLEFUTURE: "future",
  POW: "comic", COMICBLAST: "comic",
  UPUPDOWNDOWN: "arcade", PIXELPOWER: "arcade",
  ORBIT: "space", SPACESTATION: "space",
  TAVERN: "tavern", ROLLFORALE: "tavern",
  RADICAL: "cartoon80", SATURDAY: "cartoon80",
  TRACKING: "vhs", VHSHORROR: "vhs",
  BREAKING: "newsroom", NEWSROOM: "newsroom",
  LATTE: "coffee", COFFEESHOP: "coffee",
  MIDNIGHT: "modernDark", DARKMODE: "modernDark",
  NIGHTLIFE: "nightclub", CLUBNIGHT: "nightclub",
  MAIN_EVENT: "wrestling", RINGBELL: "wrestling",
  HEROUP: "superhero", WATCHTOWER: "superhero",
  KAIJU: "godzilla", ATOMICBREATH: "godzilla",
  SOFTUI: "neumorph", NEUMORPH: "neumorph",
  FEATURE: "cinema", MOVIENIGHT: "cinema"
};

const THEME_KEY = "chatroom_theme";
const UNLOCKED_KEY = "chatroom_unlocked_clients";
let activeClient = "modernDark";
let forcedRoomTheme = null;
let clickCount = 0;
let clickTimer = null;
const el = (id) => document.getElementById(id);

function isAdminUI() { return document.body.classList.contains("admin-mode"); }

function getUnlockedClients() {
  let unlocked = ["modernDark", "modern"];
  try {
    const stored = JSON.parse(localStorage.getItem(UNLOCKED_KEY) || "[]");
    if (Array.isArray(stored)) unlocked = Array.from(new Set(["modernDark", "modern", ...stored.filter((id) => CLIENTS[id])]));
  } catch { unlocked = ["modernDark", "modern"]; }
  return unlocked;
}

function saveUnlockedClients(clients) { localStorage.setItem(UNLOCKED_KEY, JSON.stringify(Array.from(new Set(clients)))); }
function unlockClient(clientId) {
  const unlocked = getUnlockedClients();
  if (!unlocked.includes(clientId)) { unlocked.push(clientId); saveUnlockedClients(unlocked); }
}

function applyClient(clientId, persist = true, bypassForce = false) {
  if (!CLIENTS[clientId]) clientId = "modernDark";
  if (forcedRoomTheme && !isAdminUI() && persist && !bypassForce) {
    const notice = el("forcedThemeNotice");
    if (notice) {
      notice.className = "message error";
      notice.textContent = `The administrator currently has the room set to ${CLIENTS[forcedRoomTheme]?.name || forcedRoomTheme}.`;
    }
    return false;
  }

  const client = CLIENTS[clientId];
  document.body.classList.remove(...Object.values(CLIENTS).map((item) => item.bodyClass));
  document.body.classList.add(client.bodyClass);
  activeClient = clientId;

  el("clientTitle").textContent = client.title;
  el("onlineTitle").textContent = client.online;
  el("chatSendButton").textContent = client.send;
  el("clearScreenButton").textContent = client.clear;
  el("clearRoomButton").textContent = client.clearRoom;
  el("leaveChatButton").textContent = client.leave;
  document.title = "DRK.CHAT";

  if (persist) localStorage.setItem(THEME_KEY, clientId);
  renderClientList();
  renderRoomThemeList();
  return true;
}

function restoreClient() {
  const unlocked = getUnlockedClients();
  const migrationKey = "chatroom_default_dark_migrated_v0151";
  let stored = localStorage.getItem(THEME_KEY);

  // v0.17.1 changes the global default from the old light client to the new dark client.
  // Existing browsers that were still on the former default are migrated once; users can
  // immediately switch back to Default - Light from MY THEME.
  if (!localStorage.getItem(migrationKey)) {
    if (!stored || stored === "modern") {
      stored = "modernDark";
      localStorage.setItem(THEME_KEY, stored);
    }
    localStorage.setItem(migrationKey, "1");
  }

  if (!stored) stored = "modernDark";
  if (!unlocked.includes(stored)) stored = "modernDark";
  applyClient(stored, false, true);
}

function renderClientList() {
  const list = el("clientList");
  if (!list) return;
  list.innerHTML = "";
  const lockedByRoom = Boolean(forcedRoomTheme && !isAdminUI());
  const availableClients = isAdminUI() ? Object.keys(CLIENTS) : getUnlockedClients();
  availableClients.forEach((id) => {
    const client = CLIENTS[id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "client-switch-button";
    button.textContent = `${id === activeClient ? "✓ " : ""}${client.name}`;
    button.disabled = lockedByRoom;
    button.addEventListener("click", () => { if (applyClient(id)) closeClientDialog(); });
    list.appendChild(button);
  });
  const notice = el("forcedThemeNotice");
  if (notice) {
    notice.classList.toggle("hidden", !lockedByRoom);
    if (lockedByRoom) {
      notice.className = "message error";
      notice.textContent = `Room theme is controlled by the administrator: ${CLIENTS[forcedRoomTheme]?.name || forcedRoomTheme}.`;
    }
  }
}

function renderRoomThemeList() {
  const section = el("roomThemeAdminSection");
  const list = el("roomThemeList");
  if (!section || !list) return;
  const admin = isAdminUI();
  section.classList.toggle("hidden", !admin);
  if (!admin) return;
  list.innerHTML = "";
  Object.entries(CLIENTS).forEach(([id, client]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "client-switch-button";
    button.textContent = `${forcedRoomTheme === id ? "✓ " : ""}${client.name}`;
    button.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("drk:set-room-theme", { detail: { theme: id } }));
      const message = el("roomThemeMessage");
      if (message) { message.className = "message success"; message.textContent = `Setting the room to ${client.name}…`; }
    });
    list.appendChild(button);
  });
}

export function syncRoomTheme(themeId, { admin = false, applyToAdmin = false } = {}) {
  forcedRoomTheme = CLIENTS[themeId] ? themeId : null;

  if (!admin) {
    if (forcedRoomTheme) applyClient(forcedRoomTheme, false, true);
    else restoreClient();
  } else if (applyToAdmin) {
    if (forcedRoomTheme) applyClient(forcedRoomTheme, false, true);
    else restoreClient();
  }

  renderClientList();
  renderRoomThemeList();
}

export function getClientName(themeId) { return CLIENTS[themeId]?.name || "Default"; }

function openClientDialog() {
  el("clientCodeMessage").textContent = "";
  el("clientCodeInput").value = "";
  if (el("roomThemeMessage")) el("roomThemeMessage").textContent = "";
  renderClientList();
  renderRoomThemeList();
  el("clientOverlay").classList.remove("hidden");
  setTimeout(() => el("clientCodeInput").focus(), 0);
}
function closeClientDialog() { el("clientOverlay").classList.add("hidden"); clickCount = 0; }
function handleVersionClick(event) {
  event.preventDefault(); clickCount += 1; clearTimeout(clickTimer);
  if (clickCount >= 5) { clickCount = 0; openClientDialog(); return; }
  clickTimer = setTimeout(() => { clickCount = 0; }, 1200);
}
function submitCode(event) {
  event.preventDefault();
  const input = el("clientCodeInput"), message = el("clientCodeMessage");
  const code = input.value.trim().toUpperCase(), clientId = CLIENT_CODES[code];
  if (!clientId) { message.className = "message error"; message.textContent = "CODE NOT RECOGNIZED"; input.select(); return; }
  unlockClient(clientId);
  if (forcedRoomTheme && !isAdminUI()) {
    message.className = "message success";
    message.textContent = `${CLIENTS[clientId].name} unlocked. You can use it after the administrator releases the room theme.`;
    renderClientList();
    return;
  }
  applyClient(clientId);
  message.className = "message success"; message.textContent = `${CLIENTS[clientId].name} unlocked.`;
  renderClientList(); setTimeout(closeClientDialog, 500);
}

export function initThemeSystem() {
  const versionBadge = el("versionBadge");
  versionBadge.textContent = `v${APP_VERSION}`;
  versionBadge.addEventListener("mousedown", (event) => event.preventDefault());
  versionBadge.addEventListener("click", handleVersionClick);
  const themeButton = el("themeSwitcherButton");
  if (themeButton) themeButton.addEventListener("click", openClientDialog);
  const roomThemeButton = el("adminRoomThemeButton");
  if (roomThemeButton) roomThemeButton.addEventListener("click", openClientDialog);
  const releaseButton = el("roomThemeReleaseButton");
  if (releaseButton) releaseButton.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("drk:set-room-theme", { detail: { theme: null } }));
    const message = el("roomThemeMessage");
    if (message) { message.className = "message success"; message.textContent = "Releasing the forced room theme…"; }
  });
  el("clientCodeForm").addEventListener("submit", submitCode);
  el("clientDialogCancel").addEventListener("click", closeClientDialog);
  el("clientOverlay").addEventListener("click", (event) => { if (event.target === el("clientOverlay")) closeClientDialog(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !el("clientOverlay").classList.contains("hidden")) closeClientDialog(); });
  restoreClient();
}
