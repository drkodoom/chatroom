import { APP_VERSION } from "./config.js";

const CLIENTS = {
  modern: {
    name: "DRK Modern",
    bodyClass: "theme-modern",
    title: "DRK CHAT",
    online: "ONLINE",
    send: "SEND",
    clear: "CLEAR SCREEN",
    clearRoom: "CLEAR ROOM",
    leave: "LEAVE"
  },
  aol90: {
    name: "Acirema Online",
    bodyClass: "theme-aol90",
    title: "Acirema Online - Chatroom",
    online: "PEOPLE HERE",
    send: "SEND",
    clear: "CLEAR MY SCREEN",
    clearRoom: "CLEAR ROOM HISTORY",
    leave: "LEAVE ROOM"
  },
  terminal: {
    name: "Phosphor",
    bodyClass: "theme-terminal",
    title: "PHOSPHOR IRC",
    online: "WHO",
    send: "TRANSMIT",
    clear: "CLEAR LOCAL",
    clearRoom: "PURGE ROOM",
    leave: "/PART"
  },
  future: {
    name: "One More Thing",
    bodyClass: "theme-future",
    title: "DRK FUTURE",
    online: "PEOPLE",
    send: "SEND",
    clear: "CLEAR VIEW",
    clearRoom: "CLEAR CONVERSATION",
    leave: "LEAVE"
  },
  comic: {
    name: "PanelChat",
    bodyClass: "theme-comic",
    title: "PANELCHAT",
    online: "CAST",
    send: "SEND!",
    clear: "WIPE PANEL",
    clearRoom: "WIPE THE ROOM",
    leave: "EXIT PANEL"
  },
  arcade: {
    name: "Pixel Lobby",
    bodyClass: "theme-arcade",
    title: "PIXEL LOBBY",
    online: "PLAYERS",
    send: "SEND",
    clear: "ERASE LOG",
    clearRoom: "ERASE ROOM LOG",
    leave: "EXIT LOBBY"
  }
};

const CLIENT_CODES = {
  DRK2026: "modern",
  DEFAULT: "modern",
  WELCOME: "aol90",
  AOL90: "aol90",
  TERMINAL: "terminal",
  PHOSPHOR: "terminal",
  FUTURE: "future",
  APPLEFUTURE: "future",
  POW: "comic",
  COMICBLAST: "comic",
  UPUPDOWNDOWN: "arcade",
  PIXELPOWER: "arcade"
};

const THEME_KEY = "chatroom_theme";
const UNLOCKED_KEY = "chatroom_unlocked_clients";
let activeClient = "modern";
let clickCount = 0;
let clickTimer = null;

const el = (id) => document.getElementById(id);

function getUnlockedClients() {
  let unlocked = ["modern"];
  try {
    const stored = JSON.parse(localStorage.getItem(UNLOCKED_KEY) || "[]");
    if (Array.isArray(stored)) {
      unlocked = Array.from(new Set(["modern", ...stored.filter((id) => CLIENTS[id])]));
    }
  } catch {
    unlocked = ["modern"];
  }
  return unlocked;
}

function saveUnlockedClients(clients) {
  localStorage.setItem(UNLOCKED_KEY, JSON.stringify(Array.from(new Set(clients))));
}

function unlockClient(clientId) {
  const unlocked = getUnlockedClients();
  if (!unlocked.includes(clientId)) {
    unlocked.push(clientId);
    saveUnlockedClients(unlocked);
  }
}

function applyClient(clientId, persist = true) {
  if (!CLIENTS[clientId]) clientId = "modern";
  const client = CLIENTS[clientId];

  document.body.classList.remove(...Object.values(CLIENTS).map((item) => item.bodyClass));
  document.body.classList.add(client.bodyClass);
  activeClient = clientId;

  el("clientTitle").textContent = client.title;
  el("clientNameStatus").textContent = client.name;
  el("onlineTitle").textContent = client.online;
  el("chatSendButton").textContent = client.send;
  el("clearScreenButton").textContent = client.clear;
  el("clearRoomButton").textContent = client.clearRoom;
  el("leaveChatButton").textContent = client.leave;
  document.title = `${client.name} — DRKODOOM Chatroom v${APP_VERSION}`;

  if (persist) localStorage.setItem(THEME_KEY, clientId);
  renderClientList();
}

function restoreClient() {
  const unlocked = getUnlockedClients();
  let stored = localStorage.getItem(THEME_KEY) || "modern";
  if (!unlocked.includes(stored)) stored = "modern";
  applyClient(stored, false);
}

function renderClientList() {
  const list = el("clientList");
  if (!list) return;
  list.innerHTML = "";

  getUnlockedClients().forEach((id) => {
    const client = CLIENTS[id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "client-switch-button";
    button.textContent = `${id === activeClient ? "✓ " : ""}${client.name}`;
    button.addEventListener("click", () => {
      applyClient(id);
      closeClientDialog();
    });
    list.appendChild(button);
  });
}

function openClientDialog() {
  el("clientCodeMessage").textContent = "";
  el("clientCodeInput").value = "";
  renderClientList();
  el("clientOverlay").classList.remove("hidden");
  setTimeout(() => el("clientCodeInput").focus(), 0);
}

function closeClientDialog() {
  el("clientOverlay").classList.add("hidden");
  clickCount = 0;
}

function handleVersionClick(event) {
  event.preventDefault();
  clickCount += 1;
  clearTimeout(clickTimer);

  if (clickCount >= 5) {
    clickCount = 0;
    openClientDialog();
    return;
  }

  clickTimer = setTimeout(() => { clickCount = 0; }, 1200);
}

function submitCode(event) {
  event.preventDefault();
  const input = el("clientCodeInput");
  const message = el("clientCodeMessage");
  const code = input.value.trim().toUpperCase();
  const clientId = CLIENT_CODES[code];

  if (!clientId) {
    message.className = "message error";
    message.textContent = "CODE NOT RECOGNIZED";
    input.select();
    return;
  }

  unlockClient(clientId);
  applyClient(clientId);
  message.className = "message success";
  message.textContent = `${CLIENTS[clientId].name} unlocked.`;
  renderClientList();
  setTimeout(closeClientDialog, 500);
}

export function initThemeSystem() {
  el("versionBadge").textContent = `v${APP_VERSION}`;
  el("statusVersionBadge").textContent = `v${APP_VERSION}`;

  [el("versionBadge"), el("statusVersionBadge")].forEach((badge) => {
    badge.addEventListener("mousedown", (event) => event.preventDefault());
    badge.addEventListener("click", handleVersionClick);
  });

  const themeButton = el("themeSwitcherButton");
  if (themeButton) {
    themeButton.addEventListener("click", openClientDialog);
  }

  el("clientCodeForm").addEventListener("submit", submitCode);
  el("clientDialogCancel").addEventListener("click", closeClientDialog);
  el("clientOverlay").addEventListener("click", (event) => {
    if (event.target === el("clientOverlay")) closeClientDialog();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!el("clientOverlay").classList.contains("hidden")) closeClientDialog();
    }
  });

  restoreClient();
}
