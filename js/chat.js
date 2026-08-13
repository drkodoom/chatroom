import { LIVE_HOST, ROOM_NAME } from "./config.js?v=0.14.0";
import { apiFetch } from "./api.js?v=0.14.0";
import { getToken, state } from "./state.js?v=0.14.0";
import { openMemberByUsername } from "./admin.js?v=0.14.0";
import { syncRoomTheme, getClientName } from "./themes.js?v=0.14.0";

const el = (id) => document.getElementById(id);
const REACTIONS = ["👍", "❤️", "😂", "😮", "👎"];

function isAdmin() {
  return state.currentUser?.role === "admin";
}

function isMod() {
  return Boolean(
    state.currentUser?.username &&
    state.roomSettings.modUsername &&
    String(state.currentUser.username).toLowerCase() === String(state.roomSettings.modUsername).toLowerCase()
  );
}

function isStaff() {
  return isAdmin() || isMod();
}

function currentDisplayName() {
  return String(state.adminIdentity?.displayName || state.currentUser?.username || "");
}

function isOwnDisplayedUsername(username) {
  const value = String(username || "").toLowerCase();
  return Boolean(value && [String(state.currentUser?.username || "").toLowerCase(), currentDisplayName().toLowerCase()].includes(value));
}

function userIsCurrentMod(username) {
  return Boolean(username && state.roomSettings.modUsername && String(username).toLowerCase() === String(state.roomSettings.modUsername).toLowerCase());
}


function isNearBottom() {
  const box = el("chatMessages");
  return box.scrollHeight - box.scrollTop - box.clientHeight < 70;
}

function scrollChatToBottom() {
  const messages = el("chatMessages");
  messages.scrollTop = messages.scrollHeight;
  clearUnread();
}

function clearUnread() {
  state.unreadCount = 0;
  el("newMessagesButton").classList.add("hidden");
}

function bumpUnread() {
  state.unreadCount += 1;
  const button = el("newMessagesButton");
  button.textContent = `${state.unreadCount} NEW MESSAGE${state.unreadCount === 1 ? "" : "S"} ↓`;
  button.classList.remove("hidden");
}

export function addSystemLine(text) {
  const line = document.createElement("div");
  line.className = "chat-line system-line";
  line.textContent = `*** ${text} ***`;
  el("chatMessages").appendChild(line);
  if (isNearBottom()) scrollChatToBottom();
}

function addAnnouncement(data) {
  const wasBottom = isNearBottom();
  const line = document.createElement("div");
  line.className = "chat-line admin-announcement";
  const label = data.role === "mod" ? "MOD ANNOUNCEMENT" : (data.role === "admin" ? "ADMIN ANNOUNCEMENT" : "ROOM ANNOUNCEMENT");
  line.textContent = `${label} — ${data.username}: ${data.content}`;
  el("chatMessages").appendChild(line);
  if (wasBottom) scrollChatToBottom(); else bumpUnread();
}

function addGameEvent(data) {
  const wasBottom = isNearBottom();
  const line = document.createElement("div");
  const tone = ["good", "bad", "critical"].includes(String(data.tone)) ? ` ${data.tone}` : "";
  line.className = `chat-line game-event-line${tone}`;
  line.textContent = `🎲 ${String(data.text || "")}`;
  el("chatMessages").appendChild(line);
  if (wasBottom) scrollChatToBottom(); else bumpUnread();
}

function getProfile(username) {
  if (!username) return { nameColor: null, badge: "" };
  const direct = state.profiles[username];
  if (direct) return direct;
  const key = Object.keys(state.profiles).find((name) => name.toLowerCase() === String(username).toLowerCase());
  return key ? state.profiles[key] : { nameColor: null, badge: "" };
}

function setProfile(username, profile = {}) {
  if (!username) return;
  const existingKey = Object.keys(state.profiles).find((name) => name.toLowerCase() === String(username).toLowerCase());
  if (existingKey && existingKey !== username) delete state.profiles[existingKey];
  state.profiles[username] = {
    nameColor: profile.nameColor || null,
    badge: profile.badge || ""
  };
}

function formatTime(epoch) {
  if (!epoch) return "";
  try {
    return new Date(Number(epoch)).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function messageById(id) {
  return state.messages.find((message) => message.id === id) || null;
}

function applyTextFormat(content, format = {}) {
  content.classList.toggle("message-size-small", format.size === "small");
  content.classList.toggle("message-size-large", format.size === "large");
  content.style.fontWeight = format.bold ? "800" : "";
  content.style.fontStyle = format.italic ? "italic" : "";
  const decorations = [];
  if (format.underline) decorations.push("underline");
  if (format.strike) decorations.push("line-through");
  content.style.textDecoration = decorations.join(" ");
  content.style.color = /^#[0-9A-Fa-f]{6}$/.test(String(format.color || "")) ? format.color : "";
}

function hasMention(content) {
  if (!content) return false;
  const names = new Set([String(state.currentUser?.username || "").trim(), currentDisplayName().trim()].filter(Boolean));
  return Array.from(names).some((username) => new RegExp(`(^|\\s)@${username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s|$|[.,!?;:])`, "i").test(content));
}

function buildUsername(message) {
  const profile = getProfile(message.user);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-user-button";
  button.textContent = message.user;
  if (profile.nameColor) button.style.color = profile.nameColor;
  if (isAdmin()) {
    button.title = isOwnDisplayedUsername(message.user) ? "Your disguised chat identity" : `View ${message.user}`;
    button.addEventListener("click", () => openMemberByUsername(isOwnDisplayedUsername(message.user) ? state.currentUser.username : message.user));
  } else if (isMod()) {
    button.title = `Change ${message.user}'s chat name color`;
    button.addEventListener("click", () => promptStaffNameColor(message.user));
  }
  return { button, profile };
}

function makeAction(label, handler, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function renderReplyQuote(message) {
  if (!message.replyTo) return null;
  const original = messageById(message.replyTo);
  const quote = document.createElement("div");
  quote.className = "reply-quote";
  quote.textContent = original
    ? `${original.user}: ${original.deleted ? "Message removed" : String(original.content || "").slice(0, 120)}`
    : "Reply to an earlier message";
  return quote;
}

function renderReactionRow(message) {
  const reactions = message.reactions || {};
  const keys = Object.keys(reactions).filter((emoji) => Number(reactions[emoji]) > 0);
  if (!keys.length || message.deleted) return null;
  const row = document.createElement("div");
  row.className = "reaction-row";
  keys.forEach((emoji) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "reaction-chip";
    chip.textContent = `${emoji} ${reactions[emoji]}`;
    chip.addEventListener("click", () => sendReaction(message.id, emoji));
    row.appendChild(chip);
  });
  return row;
}

function requestReply(message) {
  state.replyingTo = message;
  el("replyPreviewUser").textContent = message.user;
  el("replyPreviewText").textContent = message.deleted ? "Message removed" : String(message.content || "").slice(0, 160);
  el("replyPreview").classList.remove("hidden");
  el("chatInput").focus();
}

function cancelReply() {
  state.replyingTo = null;
  el("replyPreview").classList.add("hidden");
}

function editMessage(message) {
  const updated = prompt("Edit your message:", message.content || "");
  if (updated == null || !updated.trim()) return;
  sendSocket({ type: "edit", id: message.id, content: updated.trim(), format: message.format || {} });
}

function deleteMessage(message) {
  const own = isOwnDisplayedUsername(message.user);
  const wording = own ? "Delete this message?" : `Delete ${message.user}'s message as administrator?`;
  if (!confirm(wording)) return;
  sendSocket({ type: "delete", id: message.id });
}

function sendReaction(id, emoji) {
  sendSocket({ type: "reaction", id, emoji });
}

function pinMessage(message) {
  sendSocket({ type: "admin_pin", id: message.id });
}

function highlightMessage(message) {
  if (message.highlightColor) {
    sendSocket({ type: "admin_highlight", id: message.id, color: null });
    return;
  }
  const color = prompt("Highlight color (hex):", "#FFD84D");
  if (!color) return;
  sendSocket({ type: "admin_highlight", id: message.id, color });
}

function moderateUser(username) {
  if (!username || isOwnDisplayedUsername(username)) return;
  const command = prompt(
    `Moderate ${username}:\n\nType one of:\n5m  = mute 5 minutes\n1h  = mute 1 hour\n1d  = mute 1 day\nforever = mute until you remove it\noff = unmute\nkick = remove from room`,
    "5m"
  );
  if (!command) return;
  const value = command.trim().toLowerCase();
  if (value === "off" || value === "unmute") return sendSocket({ type: "admin_unmute", username });
  if (value === "kick") return sendSocket({ type: "admin_kick", username });
  const durations = { "5m": 300, "1h": 3600, "1d": 86400, "forever": -1 };
  if (!(value in durations)) return alert("Unknown moderation option.");
  const reason = prompt("Optional mute reason:", "") || "";
  sendSocket({ type: "admin_mute", username, durationSeconds: durations[value], reason });
}

function buildActions(message) {
  if (message.deleted) return null;
  const actions = document.createElement("div");
  actions.className = "message-actions";
  actions.appendChild(makeAction("REPLY", () => requestReply(message)));

  REACTIONS.forEach((emoji) => actions.appendChild(makeAction(emoji, () => sendReaction(message.id, emoji))));

  const own = isOwnDisplayedUsername(message.user);
  if (own) {
    actions.appendChild(makeAction("EDIT", () => editMessage(message)));
    actions.appendChild(makeAction("DELETE", () => deleteMessage(message)));
  }

  if (isStaff()) {
    const pinnedIds = Array.isArray(state.roomSettings.pinnedMessageIds) ? state.roomSettings.pinnedMessageIds : [];
    actions.appendChild(makeAction(pinnedIds.includes(message.id) ? "UNPIN" : "PIN", () => pinMessage(message)));
  }

  if (isAdmin()) {
    if (!own) {
      actions.appendChild(makeAction(userIsCurrentMod(message.user) ? "REMOVE MOD" : "MAKE MOD", () => {
        sendSocket({ type: "admin_set_mod", username: userIsCurrentMod(message.user) ? null : message.user });
      }));
      actions.appendChild(makeAction("MODERATE", () => moderateUser(message.user)));
    }
    actions.appendChild(makeAction(message.highlightColor ? "UNHIGHLIGHT" : "HIGHLIGHT", () => highlightMessage(message)));
    if (!own) actions.appendChild(makeAction("ADMIN DELETE", () => deleteMessage(message), "danger"));
  }
  return actions;
}

function addChatLine(message, { forceBottom = false } = {}) {
  const wasBottom = isNearBottom();
  const line = document.createElement("div");
  line.className = `chat-line${message.role === "admin" ? " admin-message" : ""}${message.role === "mod" ? " mod-message" : ""}`;
  line.dataset.messageId = message.id || "";
  line.dataset.searchText = `${message.user || ""} ${message.content || ""}`.toLowerCase();
  line.addEventListener("click", (event) => {
    if (event.target.closest("button, input, select, a")) return;
    line.classList.toggle("actions-open");
  });

  if (message.highlightColor) {
    line.classList.add("message-highlighted");
    line.style.setProperty("--message-highlight", message.highlightColor);
  }
  if (!message.deleted && hasMention(message.content)) line.classList.add("mention-message");

  const replyQuote = renderReplyQuote(message);
  if (replyQuote) line.appendChild(replyQuote);

  const { button: username, profile } = buildUsername(message);
  line.appendChild(username);

  const badgeText = message.role === "admin" ? "ADMIN" : (message.role === "mod" ? "MOD" : (profile.badge || ""));
  if (badgeText) {
    const badge = document.createElement("span");
    badge.className = "user-chat-badge";
    badge.textContent = badgeText;
    line.appendChild(badge);
  }

  const timestamp = document.createElement("span");
  timestamp.className = "chat-timestamp";
  timestamp.textContent = formatTime(message.createdAt);
  line.appendChild(timestamp);

  line.appendChild(document.createTextNode(": "));

  const content = document.createElement("span");
  if (message.deleted) {
    content.className = "deleted-message";
    content.textContent = "Message removed";
  } else {
    content.textContent = message.content || "";
    applyTextFormat(content, message.format || {});
  }
  line.appendChild(content);

  if (message.updatedAt && !message.deleted) {
    const edited = document.createElement("span");
    edited.className = "message-edited";
    edited.textContent = "(edited)";
    line.appendChild(edited);
  }

  const reactions = renderReactionRow(message);
  if (reactions) line.appendChild(reactions);
  const actions = buildActions(message);
  if (actions) line.appendChild(actions);

  el("chatMessages").appendChild(line);
  applySearchFilter();

  const own = String(message.user || "").toLowerCase() === String(state.currentUser?.username || "").toLowerCase();
  if (forceBottom || wasBottom || own) scrollChatToBottom();
  else bumpUnread();
}

function renderAllMessages({ forceBottom = false } = {}) {
  const box = el("chatMessages");
  const wasBottom = isNearBottom();
  const previousTop = box.scrollTop;
  box.innerHTML = "";
  state.messages.forEach((message) => addChatLine(message, { forceBottom: false }));
  if (forceBottom || wasBottom) scrollChatToBottom();
  else box.scrollTop = previousTop;
  updatePinnedBar();
  applySearchFilter();
}

function renderOnlineUsers(users) {
  state.latestPresence = Array.isArray(users) ? users : [];
  const container = el("onlineUsers");
  container.innerHTML = "";

  if (!state.latestPresence.length) {
    container.innerHTML = '<div class="small">Nobody online.</div>';
    return;
  }

  state.latestPresence.forEach((entry) => {
    const user = typeof entry === "string" ? { username: entry, status: "online", statusText: "", nameColor: null, badge: "" } : entry;
    if (!user?.username) return;
    setProfile(user.username, { nameColor: user.nameColor, badge: user.badge });

    const row = document.createElement("div");
    row.className = "chat-user-card";

    const dot = document.createElement("span");
    dot.className = "online-dot";
    row.appendChild(dot);

    const canInteract = isAdmin() || isMod();
    const name = document.createElement(canInteract ? "button" : "span");
    if (name.tagName === "BUTTON") {
      name.type = "button";
      name.className = "online-user-button";
      if (isAdmin()) name.addEventListener("click", () => openMemberByUsername(user.username));
      else name.addEventListener("click", () => promptStaffNameColor(user.username));
    }
    name.textContent = user.username;
    if (user.nameColor) name.style.color = user.nameColor;
    row.appendChild(name);

    const roleBadge = user.role === "admin" ? "ADMIN" : (user.role === "mod" ? "MOD" : (user.badge || ""));
    if (roleBadge) {
      const badge = document.createElement("span");
      badge.className = user.role === "mod" ? "mod-badge" : "user-chat-badge";
      badge.textContent = roleBadge;
      row.appendChild(badge);
    }

    const status = document.createElement("span");
    status.className = `presence-status ${user.status || "online"}`;
    status.textContent = user.status && user.status !== "online" ? user.status.toUpperCase() : "";
    row.appendChild(status);

    container.appendChild(row);
    if (user.statusText) {
      const noteRow = document.createElement("div");
      noteRow.className = "presence-note-row";

      const note = document.createElement("span");
      note.className = "presence-note";
      note.textContent = user.statusText;
      noteRow.appendChild(note);

      if (isAdmin() && !isOwnDisplayedUsername(user.username)) {
        const clearStatus = document.createElement("button");
        clearStatus.type = "button";
        clearStatus.className = "presence-clear-button";
        clearStatus.textContent = "REMOVE";
        clearStatus.title = `Remove ${user.username}'s status update`;
        clearStatus.addEventListener("click", () => {
          sendSocket({ type: "admin_clear_status", username: user.username });
        });
        noteRow.appendChild(clearStatus);
      }

      container.appendChild(noteRow);
    } else if (isAdmin() && !isOwnDisplayedUsername(user.username) && user.status && user.status !== "online") {
      const clearStatus = document.createElement("button");
      clearStatus.type = "button";
      clearStatus.className = "presence-clear-button presence-clear-button-standalone";
      clearStatus.textContent = "RESET STATUS";
      clearStatus.title = `Reset ${user.username}'s status to Online`;
      clearStatus.addEventListener("click", () => {
        sendSocket({ type: "admin_clear_status", username: user.username });
      });
      container.appendChild(clearStatus);
    }
  });
}

function handleSystemEvent(data) {
  if (!data.username) return;
  if (data.event === "join") addSystemLine(`${data.username} has entered the room`);
  if (data.event === "leave") addSystemLine(`${data.username} has left the room`);
  if (data.event === "kick") addSystemLine(`${data.username} was removed from the room by ${data.actor || "an administrator"}`);
  if (data.event === "mute") addSystemLine(`${data.username} was muted by ${data.actor || "an administrator"}`);
  if (data.event === "unmute") addSystemLine(`${data.username} was unmuted by ${data.actor || "an administrator"}`);
  if (data.event === "mod_granted") addSystemLine(`${data.username} is now the room MOD — granted by ${data.actor || "the administrator"}`);
  if (data.event === "mod_removed") addSystemLine(`${data.username}'s MOD powers were removed${data.actor && data.actor !== "system" ? ` by ${data.actor}` : ""}`);
}

function toggleAdminChatControls() {
  const admin = isAdmin();
  const staff = isStaff();
  document.body.classList.toggle("admin-mode", admin);
  document.body.classList.toggle("mod-mode", isMod());
  document.body.classList.toggle("staff-mode", staff);
  document.querySelectorAll(".admin-chat-action").forEach((node) => node.classList.toggle("hidden", !admin));
  document.querySelectorAll(".staff-chat-action").forEach((node) => node.classList.toggle("hidden", !staff));
  el("adminModeratorButton").textContent = state.roomSettings.modUsername ? `MOD: ${state.roomSettings.modUsername}` : "MODERATOR";
}

function updatePinnedBar() {
  const bar = el("pinnedMessagesBar");
  const ids = Array.isArray(state.roomSettings.pinnedMessageIds) ? state.roomSettings.pinnedMessageIds.slice(0, 2) : [];
  const pinned = ids.map((id) => messageById(id)).filter((message) => message && !message.deleted);
  bar.innerHTML = "";
  if (!pinned.length) {
    bar.classList.add("hidden");
    return;
  }
  pinned.forEach((message) => {
    const item = document.createElement("div");
    item.className = "pinned-message-item";
    const text = document.createElement("div");
    text.innerHTML = `<span class="pinned-label">PINNED</span>`;
    text.appendChild(document.createTextNode(`${message.user}: ${String(message.content || "").slice(0, 180)}`));
    item.appendChild(text);
    if (isStaff()) {
      const unpin = makeAction("UNPIN", () => sendSocket({ type: "admin_pin", id: message.id }));
      item.appendChild(unpin);
    }
    bar.appendChild(item);
  });
  bar.classList.remove("hidden");
}

function updateRoomSettings(settings = {}) {
  state.roomSettings = { ...state.roomSettings, ...settings };
  syncRoomTheme(state.roomSettings.roomTheme, { admin: isAdmin() });
  const banner = el("roomBanner");
  if (state.roomSettings.banner) {
    banner.textContent = state.roomSettings.banner;
    banner.classList.remove("hidden");
  } else {
    banner.classList.add("hidden");
  }

  const modes = [];
  if (state.roomSettings.locked) modes.push("LOCKED");
  if (state.roomSettings.slowModeSeconds > 0) modes.push(`SLOW ${state.roomSettings.slowModeSeconds}s`);
  if (state.roomSettings.modUsername) modes.push(`MOD ${state.roomSettings.modUsername}`);
  if (state.roomSettings.roomTheme) modes.push(`THEME ${getClientName(state.roomSettings.roomTheme).toUpperCase()}`);
  el("roomModeStatus").textContent = modes.length ? `• ${modes.join(" • ")}` : "";
  el("adminLockRoomButton").textContent = state.roomSettings.locked ? "UNLOCK ROOM" : "LOCK ROOM";
  toggleAdminChatControls();
  updatePinnedBar();
  renderAllMessages();
}

function updateTypingIndicator() {
  const names = Array.from(state.typingUsers).filter((name) => !isOwnDisplayedUsername(name));
  if (!names.length) {
    el("typingIndicator").textContent = "";
    return;
  }
  if (names.length === 1) el("typingIndicator").textContent = `${names[0]} is typing…`;
  else if (names.length === 2) el("typingIndicator").textContent = `${names[0]} and ${names[1]} are typing…`;
  else el("typingIndicator").textContent = `${names.length} people are typing…`;
}

function updateMessage(message) {
  const index = state.messages.findIndex((item) => item.id === message.id);
  if (index >= 0) state.messages[index] = { ...state.messages[index], ...message };
  else state.messages.push(message);
  renderAllMessages();
}

function updateReactions(id, reactions) {
  const message = messageById(id);
  if (!message) return;
  message.reactions = reactions || {};
  renderAllMessages();
}

function applyUserStyle(data) {
  setProfile(data.username, { nameColor: data.nameColor, badge: data.badge });
  renderAllMessages();
  renderOnlineUsers(state.latestPresence.map((entry) => {
    if (typeof entry === "string" || String(entry.username).toLowerCase() !== String(data.username).toLowerCase()) return entry;
    return { ...entry, nameColor: data.nameColor || null, badge: data.badge || "" };
  }));
}

function applyTimestampsPreference() {
  document.body.classList.toggle("show-timestamps", state.timestampsEnabled);
  el("timestampsButton").textContent = `TIMESTAMPS: ${state.timestampsEnabled ? "ON" : "OFF"}`;
}

export async function enterChatroom(showScreen) {
  const token = getToken();
  if (!token) {
    showScreen("login");
    return;
  }

  try {
    const { response, data } = await apiFetch("/me", { method: "GET" }, true);
    if (!response.ok || !data.ok) {
      showScreen("login");
      return;
    }
    state.currentUser = data.user;
    localStorage.setItem("chatroom_user", JSON.stringify(data.user));
  } catch {
    return;
  }

  state.chatIntentionalClose = false;
  state.chatReconnectAttempts = 0;
  state.unreadCount = 0;
  state.messages = [];
  state.profiles = {};
  state.replyingTo = null;
  el("chatMessages").innerHTML = "";
  cancelReply();
  toggleAdminChatControls();
  applyTimestampsPreference();
  showScreen("chat");
  addSystemLine(`#${ROOM_NAME} — connecting`);
  connectChatSocket();
}

function rainConfetti(actor = "") {
  const layer = el("confettiLayer");
  if (!layer) return;
  layer.innerHTML = "";
  layer.classList.add("active");
  const colors = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#bf5af2", "#ff9f0a", "#ff2d55"];
  const count = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 28 : 130;
  for (let i = 0; i < count; i += 1) {
    const piece = document.createElement("i");
    piece.className = "confetti-piece";
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--drift", `${(Math.random() * 34 - 17).toFixed(1)}vw`);
    piece.style.setProperty("--spin", `${Math.floor(Math.random() * 1080 + 360)}deg`);
    piece.style.setProperty("--duration", `${(Math.random() * 2.2 + 2.8).toFixed(2)}s`);
    piece.style.setProperty("--delay", `${(Math.random() * 1.2).toFixed(2)}s`);
    piece.style.setProperty("--confetti", colors[i % colors.length]);
    piece.style.setProperty("--w", `${Math.floor(Math.random() * 7 + 6)}px`);
    piece.style.setProperty("--h", `${Math.floor(Math.random() * 10 + 8)}px`);
    layer.appendChild(piece);
  }
  if (actor) addSystemLine(`${actor} made it rain confetti!`);
  setTimeout(() => { layer.classList.remove("active"); layer.innerHTML = ""; }, 6500);
}

function launchConfetti() {
  if (!isAdmin()) return;
  sendSocket({ type: "admin_confetti" });
}

function connectChatSocket() {
  const token = getToken();
  if (!token || state.chatIntentionalClose) return;

  clearTimeout(state.chatReconnectTimer);
  stopChatHeartbeat();

  const status = el("chatConnectionStatus");
  status.className = state.chatReconnectAttempts > 0 ? "reconnecting" : "disconnected";
  status.textContent = state.chatReconnectAttempts > 0 ? "Reconnecting..." : "Connecting...";
  el("chatInput").disabled = true;
  el("chatSendButton").disabled = true;

  const socketUrl = `wss://${LIVE_HOST}/parties/chat/${ROOM_NAME}?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(socketUrl);
  state.chatSocket = socket;

  socket.addEventListener("open", () => {
    if (socket !== state.chatSocket) return;
    const wasReconnect = state.chatReconnectAttempts > 0;
    state.chatReconnectAttempts = 0;
    status.className = "connected";
    status.textContent = "Connected";
    el("chatInput").disabled = false;
    el("chatSendButton").disabled = false;
    el("chatInput").focus();
    addSystemLine(wasReconnect ? `Reconnected to #${ROOM_NAME}` : `Welcome to #${ROOM_NAME}, ${state.currentUser.username}`);
    startChatHeartbeat();
  });

  socket.addEventListener("message", (event) => {
    if (socket !== state.chatSocket) return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }

    if (data.type === "pong") return;

    if (data.type === "all" && Array.isArray(data.messages)) {
      state.messages = data.messages;
      state.profiles = data.profiles || {};
      state.roomSettings = { ...state.roomSettings, ...(data.settings || {}) };
      state.game = data.game || null;
      if (state.game?.type !== "werewolf") state.werewolfSecret = null;
      state.adminIdentity = { ...state.adminIdentity, ...(data.identity || {}) };
      renderAllMessages({ forceBottom: true });
      updateRoomSettings(state.roomSettings);
      renderGame(state.game);
      updateAdminIdentityButton();
      addSystemLine(`You have entered #${ROOM_NAME}`);
      return;
    }

    if (data.type === "presence") {
      renderOnlineUsers(data.users);
      return;
    }
    if (data.type === "status_removed") {
      el("presenceStatusSelect").value = "online";
      el("presenceStatusText").value = "";
      addSystemLine(`Your status was removed by ${data.actor || "an administrator"}`);
      return;
    }
    if (data.type === "system") {
      handleSystemEvent(data);
      return;
    }
    if (data.type === "typing") {
      if (data.active) state.typingUsers.add(data.username);
      else state.typingUsers.delete(data.username);
      updateTypingIndicator();
      return;
    }
    if (data.type === "add") {
      state.messages.push(data);
      if (state.messages.length > 100) state.messages = state.messages.slice(-100);
      addChatLine(data);
      updatePinnedBar();
      return;
    }
    if (data.type === "message_update") {
      updateMessage(data.message);
      return;
    }
    if (data.type === "reaction_update") {
      updateReactions(data.id, data.reactions);
      return;
    }
    if (data.type === "room_settings") {
      updateRoomSettings(data.settings || {});
      return;
    }
    if (data.type === "user_style") {
      applyUserStyle(data);
      return;
    }
    if (data.type === "game_state") {
      if (!data.game || data.game.type !== "werewolf") state.werewolfSecret = null;
      renderGame(data.game || null);
      return;
    }
    if (data.type === "werewolf_secret") {
      state.werewolfSecret = data.secret || null;
      if (state.game?.type === "werewolf") renderGame(state.game);
      return;
    }
    if (data.type === "werewolf_action") {
      addSystemLine(data.message || "Werewolf action received.");
      return;
    }
    if (data.type === "admin_announcement") {
      addAnnouncement(data);
      return;
    }
    if (data.type === "game_event") {
      addGameEvent(data);
      return;
    }
    if (data.type === "clear_room") {
      state.messages = [];
      state.roomSettings.pinnedMessageIds = [];
      el("chatMessages").innerHTML = "";
      updatePinnedBar();
      addSystemLine(`Room history was cleared by ${data.username || "an administrator"}`);
      return;
    }
    if (data.type === "room_theme") {
      state.roomSettings.roomTheme = data.theme || null;
      syncRoomTheme(state.roomSettings.roomTheme, { admin: isAdmin(), applyToAdmin: true });
      // Refresh room status without immediately overriding the admin's independent MY THEME choice.
      const banner = el("roomBanner");
      if (state.roomSettings.banner) {
        banner.textContent = state.roomSettings.banner;
        banner.classList.remove("hidden");
      } else {
        banner.classList.add("hidden");
      }
      const modes = [];
      if (state.roomSettings.locked) modes.push("LOCKED");
      if (state.roomSettings.slowModeSeconds > 0) modes.push(`SLOW ${state.roomSettings.slowModeSeconds}s`);
      if (state.roomSettings.modUsername) modes.push(`MOD ${state.roomSettings.modUsername}`);
      if (state.roomSettings.roomTheme) modes.push(`THEME ${getClientName(state.roomSettings.roomTheme).toUpperCase()}`);
      el("roomModeStatus").textContent = modes.length ? `• ${modes.join(" • ")}` : "";
      toggleAdminChatControls();
      updatePinnedBar();
      renderAllMessages();
      if (data.actor) addSystemLine(data.theme ? `${data.actor} changed the room theme to ${getClientName(data.theme)}` : `${data.actor} released the room theme`);
      return;
    }
    if (data.type === "confetti") {
      rainConfetti(data.actor || "");
      return;
    }
    if (data.type === "admin_identity") {
      state.adminIdentity = { displayName: data.displayName || state.currentUser?.username || null, hideAdminBadge: Boolean(data.hideAdminBadge) };
      updateAdminIdentityButton();
      return;
    }
    if (data.type === "error") addSystemLine(data.message || "Server error");
  });

  socket.addEventListener("close", (event) => {
    if (socket !== state.chatSocket) return;
    stopChatHeartbeat();
    el("chatInput").disabled = true;
    el("chatSendButton").disabled = true;

    if (event.code === 4001 || event.code === 4002) {
      state.chatIntentionalClose = true;
      status.className = "disconnected";
      status.textContent = event.code === 4001 ? "Removed" : "Locked";
      addSystemLine(event.reason || (event.code === 4001 ? "You were removed from the room" : "The room is locked"));
      setTimeout(() => window.dispatchEvent(new CustomEvent("drk:kicked")), 700);
      return;
    }

    if (state.chatIntentionalClose) {
      status.className = "disconnected";
      status.textContent = "Disconnected";
      return;
    }

    status.className = "reconnecting";
    status.textContent = "Reconnecting...";
    let text = `Connection lost (code ${event.code})`;
    if (event.reason) text += ` — ${event.reason}`;
    addSystemLine(`${text}. Reconnecting...`);
    scheduleChatReconnect();
  });

  socket.addEventListener("error", (error) => console.error("WebSocket error:", error));
}

function sendSocket(payload) {
  if (!state.chatSocket || state.chatSocket.readyState !== WebSocket.OPEN) return false;
  state.chatSocket.send(JSON.stringify(payload));
  return true;
}

function scheduleChatReconnect() {
  if (state.chatIntentionalClose || !getToken()) return;
  clearTimeout(state.chatReconnectTimer);
  state.chatReconnectAttempts += 1;
  const delay = Math.min(1000 * Math.pow(2, state.chatReconnectAttempts - 1), 10000);
  state.chatReconnectTimer = setTimeout(connectChatSocket, delay);
}

function startChatHeartbeat() {
  stopChatHeartbeat();
  state.chatHeartbeatTimer = setInterval(() => {
    sendSocket({ type: "ping", time: Date.now() });
  }, 20000);
}

function stopChatHeartbeat() {
  if (state.chatHeartbeatTimer) {
    clearInterval(state.chatHeartbeatTimer);
    state.chatHeartbeatTimer = null;
  }
}

function stopTyping() {
  clearTimeout(state.typingTimer);
  if (state.typingSent) sendSocket({ type: "typing", active: false });
  state.typingSent = false;
}

export function closeChatSocket() {
  state.chatIntentionalClose = true;
  clearTimeout(state.chatReconnectTimer);
  state.chatReconnectTimer = null;
  stopChatHeartbeat();
  stopTyping();
  const socket = state.chatSocket;
  state.chatSocket = null;
  if (socket) {
    try { socket.close(1000, "User left room"); } catch { /* ignore */ }
  }
  el("chatInput").disabled = true;
  el("chatSendButton").disabled = true;
  el("chatConnectionStatus").className = "disconnected";
  el("chatConnectionStatus").textContent = "Disconnected";
  state.typingUsers.clear();
  renderOnlineUsers([]);
  document.body.classList.remove("admin-mode", "mod-mode", "staff-mode");
}

function sendMessage(event) {
  event.preventDefault();
  const input = el("chatInput");
  const content = input.value.trim();
  if (!content) return;

  if (content.toLowerCase() === "/roll") {
    const sent = sendSocket({ type: "game_boss_attack" });
    if (!sent) return;
    input.value = "";
    cancelReply();
    stopTyping();
    input.focus();
    return;
  }

  const sent = sendSocket({
    type: "add",
    id: crypto.randomUUID(),
    content,
    format: { ...state.draftFormat },
    replyTo: state.replyingTo?.id || null
  });
  if (!sent) return;
  input.value = "";
  cancelReply();
  stopTyping();
  input.focus();
}

function clearMyScreen() {
  state.messages = [];
  el("chatMessages").innerHTML = "";
  el("pinnedMessagesBar").classList.add("hidden");
  addSystemLine("Your screen was cleared");
}

function clearRoomHistory() {
  if (state.currentUser?.role !== "admin") return;
  if (!confirm(`CLEAR ROOM HISTORY?\n\nThis permanently deletes all stored messages in #${ROOM_NAME} for EVERYONE.\n\nThis cannot be undone.`)) return;
  sendSocket({ type: "clear_room" });
}

function sendAdminAnnouncement() {
  if (!isStaff()) return;
  const label = isMod() ? "MOD announcement" : "Admin announcement";
  const content = prompt(`${label} to everyone in #${ROOM_NAME}:`);
  if (content?.trim()) sendSocket({ type: "admin_announcement", content: content.trim() });
}

function updateAdminIdentityButton() {
  const button = el("adminIdentityButton");
  if (!button) return;
  const masked = Boolean(state.adminIdentity?.displayName && String(state.adminIdentity.displayName).toLowerCase() !== String(state.currentUser?.username || "").toLowerCase());
  const hidden = Boolean(state.adminIdentity?.hideAdminBadge);
  button.textContent = masked || hidden ? "DISGUISE: ON" : "ADMIN IDENTITY";
}

function openAdminIdentity() {
  if (!isAdmin()) return;
  const activeDisplay = String(state.adminIdentity?.displayName || "");
  el("adminMaskNameInput").value = activeDisplay && activeDisplay.toLowerCase() !== String(state.currentUser?.username || "").toLowerCase() ? activeDisplay : "";
  el("adminHideBadgeCheckbox").checked = Boolean(state.adminIdentity?.hideAdminBadge);
  el("adminIdentityMessage").textContent = "";
  el("adminIdentityOverlay").classList.remove("hidden");
  el("adminMaskNameInput").focus();
}

function closeAdminIdentity() {
  el("adminIdentityOverlay").classList.add("hidden");
}

function applyAdminIdentity() {
  if (!isAdmin()) return;
  const maskName = el("adminMaskNameInput").value.trim();
  sendSocket({ type: "admin_identity", maskName: maskName || null, hideAdminBadge: el("adminHideBadgeCheckbox").checked });
  closeAdminIdentity();
}

function restoreAdminIdentity() {
  if (!isAdmin()) return;
  sendSocket({ type: "admin_identity", maskName: null, hideAdminBadge: false });
  closeAdminIdentity();
}

function setRoomBanner() {
  if (state.currentUser?.role !== "admin") return;
  const content = prompt("Room banner (leave blank to remove):", state.roomSettings.banner || "");
  if (content == null) return;
  sendSocket({ type: "admin_banner", content: content.trim() });
}

function setSlowMode() {
  if (state.currentUser?.role !== "admin") return;
  const input = prompt("Slow mode seconds between messages for regular users (0 disables):", String(state.roomSettings.slowModeSeconds || 0));
  if (input == null) return;
  const seconds = Math.max(0, Math.min(120, Number.parseInt(input, 10) || 0));
  sendSocket({ type: "admin_room_settings", slowModeSeconds: seconds });
}

function toggleRoomLock() {
  if (state.currentUser?.role !== "admin") return;
  const next = !state.roomSettings.locked;
  if (next && !confirm("Lock #lobby? Existing users may remain, but regular members will not be able to enter until you unlock it.")) return;
  sendSocket({ type: "admin_room_settings", locked: next });
}

function kickUserFromToolbar() {
  if (state.currentUser?.role !== "admin") return;
  const choices = state.latestPresence
    .map((entry) => typeof entry === "string" ? entry : entry.username)
    .filter((name) => !isOwnDisplayedUsername(name));
  if (!choices.length) return alert("No other users are currently online.");
  const target = prompt(`Who should be kicked from #${ROOM_NAME}?\n\nOnline: ${choices.join(", ")}`);
  if (target?.trim()) sendSocket({ type: "admin_kick", username: target.trim() });
}

function manageModerator() {
  if (!isAdmin()) return;
  const current = state.roomSettings.modUsername;
  const choices = state.latestPresence
    .map((entry) => typeof entry === "string" ? entry : entry.username)
    .filter(Boolean)
    .filter((name) => String(name).toLowerCase() !== String(state.currentUser?.username || "").toLowerCase());

  const promptText = current
    ? `Current MOD: ${current}\n\nType a different online screen name to transfer MOD powers, or type REMOVE to clear the MOD.\n\nOnline: ${choices.join(", ") || "Nobody else"}`
    : `Type the screen name of one online person to make them temporary MOD. Their powers end when they leave or you remove them.\n\nOnline: ${choices.join(", ") || "Nobody else"}`;

  const value = prompt(promptText, current || "");
  if (value == null) return;
  const clean = value.trim();
  if (!clean || clean.toLowerCase() === "remove" || clean.toLowerCase() === "off") {
    sendSocket({ type: "admin_set_mod", username: null });
    return;
  }
  sendSocket({ type: "admin_set_mod", username: clean });
}

function promptStaffNameColor(username = null) {
  if (!isStaff()) return;
  const online = state.latestPresence
    .map((entry) => typeof entry === "string" ? entry : entry.username)
    .filter(Boolean);
  const target = username || prompt(`Whose screen-name color should change?\n\nOnline: ${online.join(", ") || "Nobody"}`);
  if (!target?.trim()) return;
  const current = getProfile(target.trim()).nameColor || "#3267FF";
  const color = prompt(`Color for ${target.trim()} (six-digit hex).\nType RESET to return to default.`, current);
  if (color == null) return;
  const clean = color.trim();
  if (!clean || clean.toLowerCase() === "reset" || clean.toLowerCase() === "default") {
    sendSocket({ type: "staff_user_color", username: target.trim(), nameColor: null });
    return;
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(clean)) return alert("Use a six-digit hex color such as #FF3B30.");
  sendSocket({ type: "staff_user_color", username: target.trim(), nameColor: clean });
}

function openGameSetup() {
  if (!isStaff()) return;
  if (state.game?.status === "active") {
    el("gamePanel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  el("gameSetupMessage").textContent = "";
  el("hangmanPhraseInput").value = "";
  el("gameOverlay").classList.remove("hidden");
  el("gameTypeSelect").focus();
}

function closeGameSetup() {
  el("gameOverlay").classList.add("hidden");
}

function updateGameSetupFields() {
  const game = el("gameTypeSelect").value;
  el("hangmanSetupFields").classList.toggle("hidden", game !== "hangman");
  el("bossSetupFields").classList.toggle("hidden", game !== "boss");
  el("werewolfSetupFields").classList.toggle("hidden", game !== "werewolf");
}

function startSelectedGame() {
  if (!isStaff()) return;
  const game = el("gameTypeSelect").value;
  const message = el("gameSetupMessage");
  message.className = "message";
  if (game === "hangman") {
    const phrase = el("hangmanPhraseInput").value.trim();
    if (phrase.length < 2) {
      message.className = "message error";
      message.textContent = "Enter a word or phrase first.";
      return;
    }
    sendSocket({ type: "game_start", game: "hangman", phrase });
  } else if (game === "boss") {
    sendSocket({ type: "game_start", game: "boss", boss: el("bossSelect").value });
  } else if (game === "werewolf") {
    sendSocket({ type: "game_start", game: "werewolf" });
  }
  closeGameSetup();
}

function endCurrentGame() {
  if (!isStaff() || !state.game) return;
  const verb = state.game.status === "active" ? "End" : "Clear";
  if (confirm(`${verb} the current game for everyone?`)) sendSocket({ type: "game_end" });
}

function skipBossTurn() {
  if (!isStaff() || state.game?.type !== "boss" || state.game.status !== "active") return;
  if (confirm(`Skip ${state.game.currentTurn || "the current player"}'s turn?`)) sendSocket({ type: "game_boss_skip" });
}

function forceWerewolfPhase() {
  if (!isStaff() || state.game?.type !== "werewolf" || state.game.status !== "active") return;
  const label = state.game.phase === "night" ? "end the night with the actions currently submitted" : "close voting with the votes currently submitted";
  if (confirm(`Force the Werewolf phase now? This will ${label}.`)) sendSocket({ type: "game_werewolf_force" });
}

function gameLogNode(log = []) {
  const wrap = document.createElement("div");
  wrap.className = "game-log";
  (Array.isArray(log) ? log.slice(-10) : []).forEach((text) => {
    const line = document.createElement("div");
    line.className = "game-log-line";
    line.textContent = text;
    wrap.appendChild(line);
  });
  return wrap;
}

function effectText(effect) {
  return `${effect.name} (${effect.turns})`;
}

function updateComposerForGame() {
  const input = el("chatInput");
  if (!input) return;
  if (state.game?.type === "boss" && state.game.status === "active") {
    input.placeholder = "Type /roll to roll a d20 and attack, or type a normal message...";
  } else if (state.game?.type === "hangman" && state.game.status === "active") {
    input.placeholder = "Chat normally here — use the Hangman box above to guess...";
  } else if (state.game?.type === "werewolf" && state.game.status === "active") {
    const secret = state.werewolfSecret;
    if (!secret?.participant) input.placeholder = "Werewolf is in progress — you are observing this round.";
    else if (!secret.alive) input.placeholder = "You have been eliminated — watch the village finish the round.";
    else if (state.game.phase === "night" && secret.role === "werewolf") input.placeholder = "Night — secretly type /kill Name";
    else if (state.game.phase === "night") input.placeholder = "Night — the village is asleep. Wait for daybreak.";
    else input.placeholder = "Day — discuss, then type /vote Name when ready.";
  } else {
    input.placeholder = "Type a message...";
  }
}

function renderGame(game) {
  state.game = game || null;
  const panel = el("gamePanel");
  panel.innerHTML = "";

  if (!state.game) {
    state.werewolfSecret = null;
    panel.classList.add("hidden");
    el("startGameButton").textContent = "START GAME";
    updateComposerForGame();
    return;
  }

  panel.classList.remove("hidden");
  updateComposerForGame();
  el("startGameButton").textContent = state.game.status === "active" ? "GAME" : "START GAME";

  const header = document.createElement("div");
  header.className = "game-panel-header";
  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "game-panel-title";
  if (state.game.type === "hangman") title.textContent = "HANGMAN";
  else if (state.game.type === "boss") title.textContent = `BOSS BATTLE — ${state.game.bossName}`;
  else title.textContent = `WEREWOLF — ${String(state.game.phase || "ended").toUpperCase()} ${state.game.day || ""}`.trim();

  const subtitle = document.createElement("div");
  subtitle.className = "game-panel-subtitle";
  subtitle.textContent = `Host: ${state.game.host} • ${String(state.game.status).replaceAll("_", " ").toUpperCase()}`;
  left.append(title, subtitle);
  header.appendChild(left);

  if (isStaff()) {
    const gameControls = document.createElement("div");
    gameControls.className = "game-header-actions";
    if (state.game.type === "boss" && state.game.status === "active") {
      gameControls.appendChild(makeAction("SKIP TURN", skipBossTurn));
    }
    if (state.game.type === "werewolf" && state.game.status === "active") {
      gameControls.appendChild(makeAction("FORCE PHASE", forceWerewolfPhase));
    }
    gameControls.appendChild(makeAction(state.game.status === "active" ? "END GAME" : "CLEAR GAME", endCurrentGame, "danger"));
    header.appendChild(gameControls);
  }
  panel.appendChild(header);

  if (state.game.type === "hangman") {
    const phrase = document.createElement("div");
    phrase.className = "hangman-phrase";
    phrase.textContent = state.game.displayPhrase || "";
    panel.appendChild(phrase);

    const stats = document.createElement("div");
    stats.className = "hangman-stats";
    stats.textContent = `Wrong guesses: ${state.game.wrong}/${state.game.maxWrong} • Guessed: ${(state.game.guessed || []).join(" ") || "None"}`;
    panel.appendChild(stats);

    if (state.game.status === "active") {
      const actions = document.createElement("form");
      actions.className = "game-actions";
      const input = document.createElement("input");
      input.maxLength = 80;
      input.placeholder = "Guess a letter or the whole phrase";
      input.autocomplete = "off";
      const submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "GUESS";
      actions.append(input, submit);
      actions.addEventListener("submit", (event) => {
        event.preventDefault();
        const guess = input.value.trim();
        if (!guess) return;
        sendSocket({ type: "game_hangman_guess", guess });
        input.value = "";
        input.focus();
      });
      panel.appendChild(actions);
    } else if (state.game.winner) {
      const result = document.createElement("div");
      result.className = "success";
      result.textContent = `${state.game.winner} solved the puzzle!`;
      panel.appendChild(result);
    }

    panel.appendChild(gameLogNode(state.game.log));
    return;
  }

  if (state.game.type === "werewolf") {
    const wolf = state.game;
    const secret = state.werewolfSecret;

    const phaseCard = document.createElement("div");
    phaseCard.className = `werewolf-phase-card werewolf-${wolf.phase || "ended"}`;
    const phaseTitle = document.createElement("strong");
    if (wolf.status !== "active") {
      phaseTitle.textContent = wolf.status === "villagers_win" ? "THE VILLAGERS WIN" : (wolf.status === "werewolves_win" ? "THE WEREWOLVES WIN" : "GAME ENDED");
    } else if (wolf.phase === "night") {
      phaseTitle.textContent = `NIGHT ${wolf.day} — THE VILLAGE SLEEPS`;
    } else {
      phaseTitle.textContent = `DAY ${wolf.day} — DISCUSS AND VOTE`;
    }
    const phaseText = document.createElement("div");
    if (wolf.status !== "active") {
      phaseText.textContent = "All roles are revealed below. Staff can clear the game when everyone is ready.";
    } else if (wolf.phase === "night") {
      phaseText.textContent = `Werewolves are choosing a victim. ${wolf.actionsCast || 0}/${wolf.requiredActions || 0} required night action${wolf.requiredActions === 1 ? "" : "s"} submitted.`;
    } else {
      phaseText.textContent = `Living players should discuss in chat, then type /vote Name. ${wolf.votesCast || 0}/${wolf.requiredVotes || 0} required votes submitted.`;
    }
    phaseCard.append(phaseTitle, phaseText);
    panel.appendChild(phaseCard);

    const roleCard = document.createElement("div");
    roleCard.className = "werewolf-role-card";
    if (!secret) {
      roleCard.classList.add("spectator");
      roleCard.innerHTML = "<strong>ROLE ASSIGNMENT</strong><span>Waiting for the server to deliver your private role…</span>";
    } else if (!secret.participant) {
      roleCard.classList.add("spectator");
      roleCard.innerHTML = "<strong>OBSERVER</strong><span>You joined after this round began. You can watch, but you cannot influence the game.</span>";
    } else {
      roleCard.classList.add(secret.role === "werewolf" ? "role-werewolf" : "role-villager");
      const roleName = document.createElement("strong");
      roleName.textContent = secret.role === "werewolf" ? "YOUR ROLE: WEREWOLF" : "YOUR ROLE: VILLAGER";
      const roleInfo = document.createElement("span");
      if (!secret.alive) {
        roleInfo.textContent = "You have been eliminated. Do not influence the surviving players.";
      } else if (secret.role === "werewolf") {
        const pack = Array.isArray(secret.teammates) && secret.teammates.length ? ` Your fellow werewolf: ${secret.teammates.join(", ")}.` : "";
        roleInfo.textContent = wolf.phase === "night"
          ? `Secretly choose a living villager by typing /kill Name.${pack}`
          : `Blend in, discuss, and vote like everyone else.${pack}`;
      } else {
        roleInfo.textContent = wolf.phase === "night"
          ? "You have no night action. Wait for daybreak."
          : "Figure out who is lying. Discuss, then type /vote Name.";
      }
      roleCard.append(roleName, roleInfo);
    }
    panel.appendChild(roleCard);

    const commandHelp = document.createElement("div");
    commandHelp.className = "werewolf-command-help";
    if (wolf.status === "active" && secret?.participant && secret.alive) {
      if (wolf.phase === "night" && secret.role === "werewolf") commandHelp.textContent = "COMMAND: /kill ScreenName";
      else if (wolf.phase === "day") commandHelp.textContent = "COMMAND: /vote ScreenName";
      else commandHelp.textContent = "The village is asleep.";
    } else if (wolf.status === "active") {
      commandHelp.textContent = "Watch the round unfold.";
    } else {
      commandHelp.textContent = "Round complete.";
    }
    panel.appendChild(commandHelp);

    const roster = document.createElement("div");
    roster.className = "werewolf-roster";
    (wolf.players || []).forEach((player) => {
      const row = document.createElement("div");
      row.className = `werewolf-player${player.alive ? " alive" : " dead"}`;
      const name = document.createElement("strong");
      name.textContent = player.username;
      const stateLabel = document.createElement("span");
      stateLabel.className = "werewolf-life";
      stateLabel.textContent = player.alive ? "ALIVE" : "DEAD";
      row.append(name, stateLabel);
      if (player.role) {
        const revealed = document.createElement("span");
        revealed.className = `werewolf-revealed-role ${player.role}`;
        revealed.textContent = player.role === "werewolf" ? "WEREWOLF" : "VILLAGER";
        row.appendChild(revealed);
      }
      roster.appendChild(row);
    });
    panel.appendChild(roster);

    const counts = document.createElement("div");
    counts.className = "werewolf-counts";
    counts.textContent = `${wolf.aliveCount || 0} alive • ${wolf.wolfCount || 0} werewolf${wolf.wolfCount === 1 ? "" : "s"} began the game`;
    panel.appendChild(counts);

    panel.appendChild(gameLogNode(wolf.log));
    return;
  }

  const boss = state.game;
  const bossCard = document.createElement("div");
  bossCard.className = "boss-card";
  const bossLeft = document.createElement("div");
  const bossName = document.createElement("div");
  bossName.className = "boss-name";
  bossName.textContent = boss.bossName;
  const bossHp = document.createElement("div");
  bossHp.textContent = `Boss HP: ${boss.bossHp}/${boss.bossMaxHp}`;
  const bossTrack = document.createElement("div");
  bossTrack.className = "hp-track";
  const bossFill = document.createElement("div");
  bossFill.className = "hp-fill";
  bossFill.style.setProperty("--hp-percent", `${Math.max(0, Math.min(100, (boss.bossHp / boss.bossMaxHp) * 100))}%`);
  bossTrack.appendChild(bossFill);
  bossLeft.append(bossName, bossHp, bossTrack);

  const me = (boss.players || []).find((player) => String(player.username).toLowerCase() === currentDisplayName().toLowerCase());
  const self = document.createElement("div");
  self.className = "game-player-stats";
  self.textContent = me ? `Your HP: ${me.hp}/${me.maxHp} • Attacks: ${me.attacks} • Damage: ${me.damageDealt} • Crits: ${me.crits}` : "You have not joined the battle yet.";
  if (me?.effects?.length) {
    const effects = document.createElement("div");
    effects.className = "game-effects";
    me.effects.forEach((effect) => {
      const chip = document.createElement("span");
      chip.className = `game-effect-chip ${effect.kind}`;
      chip.textContent = effectText(effect);
      effects.appendChild(chip);
    });
    self.appendChild(document.createElement("br"));
    self.appendChild(effects);
  }
  bossCard.append(bossLeft, self);
  panel.appendChild(bossCard);

  if (boss.status === "active") {
    const turn = document.createElement("div");
    turn.className = `boss-turn-banner${String(boss.currentTurn || "").toLowerCase() === currentDisplayName().toLowerCase() ? " your-turn" : ""}`;
    turn.textContent = `ROUND ${boss.round || 1} • TURN: ${boss.currentTurn || "Waiting..."}`;
    panel.appendChild(turn);
    const actions = document.createElement("div");
    actions.className = "game-actions boss-roll-instruction";
    const instruction = document.createElement("strong");
    const myTurn = String(boss.currentTurn || "").toLowerCase() === currentDisplayName().toLowerCase();
    instruction.textContent = me?.hp === 0
      ? "You are knocked out."
      : (myTurn ? "YOUR TURN — type /roll in the chat box to roll a d20 and attack." : `Wait for ${boss.currentTurn || "the current player"} to take their turn.`);
    actions.appendChild(instruction);
    panel.appendChild(actions);
  }

  const list = document.createElement("div");
  list.className = "battle-player-list";
  (boss.players || []).forEach((player) => {
    const row = document.createElement("div");
    row.className = "battle-player-row";
    const name = document.createElement("strong");
    name.textContent = player.username;
    const hp = document.createElement("span");
    hp.textContent = `${player.hp}/${player.maxHp} HP`;
    const info = document.createElement("span");
    info.textContent = `${player.damageDealt} dmg`;
    row.append(name, hp, info);
    list.appendChild(row);
  });
  if (boss.players?.length) panel.appendChild(list);
  panel.appendChild(gameLogNode(boss.log));
}

function updatePresence() {
  const status = el("presenceStatusSelect").value;
  const statusText = el("presenceStatusText").value.trim();
  sendSocket({ type: "presence_status", status, statusText });
}

function toggleFormat(key) {
  state.draftFormat[key] = !state.draftFormat[key];
  const map = {
    bold: "formatBoldButton",
    italic: "formatItalicButton",
    underline: "formatUnderlineButton",
    strike: "formatStrikeButton"
  };
  const button = el(map[key]);
  button.classList.toggle("is-active", state.draftFormat[key]);
  button.setAttribute("aria-pressed", String(state.draftFormat[key]));
}

function resetFormat() {
  state.draftFormat = { bold: false, italic: false, underline: false, strike: false, color: null, size: "normal" };
  ["formatBoldButton", "formatItalicButton", "formatUnderlineButton", "formatStrikeButton"].forEach((id) => {
    el(id).classList.remove("is-active");
    el(id).setAttribute("aria-pressed", "false");
  });
  el("formatColorInput").value = "#111111";
  el("formatSizeSelect").value = "normal";
}

function toggleTimestamps() {
  state.timestampsEnabled = !state.timestampsEnabled;
  localStorage.setItem("chatroom_timestamps", state.timestampsEnabled ? "1" : "0");
  updateGameSetupFields();
  applyTimestampsPreference();
  updateAdminIdentityButton();
}

function toggleSearch() {
  el("chatSearchBar").classList.toggle("hidden");
  if (!el("chatSearchBar").classList.contains("hidden")) el("chatSearchInput").focus();
  else clearSearch();
}

function clearSearch() {
  state.searchQuery = "";
  el("chatSearchInput").value = "";
  el("chatSearchCount").textContent = "";
  applySearchFilter();
}

function applySearchFilter() {
  const query = String(state.searchQuery || "").trim().toLowerCase();
  let count = 0;
  document.querySelectorAll(".chat-line[data-message-id]").forEach((line) => {
    line.classList.remove("search-match", "search-nonmatch");
    if (!query) return;
    const match = String(line.dataset.searchText || "").includes(query);
    line.classList.add(match ? "search-match" : "search-nonmatch");
    if (match) count += 1;
  });
  el("chatSearchCount").textContent = query ? `${count} match${count === 1 ? "" : "es"}` : "";
}

export function initChatUI() {
  el("chatForm").addEventListener("submit", sendMessage);
  el("clearScreenButton").addEventListener("click", clearMyScreen);
  el("clearRoomButton").addEventListener("click", clearRoomHistory);
  el("adminModeratorButton").addEventListener("click", manageModerator);
  el("adminConfettiButton").addEventListener("click", launchConfetti);
  el("adminIdentityButton").addEventListener("click", openAdminIdentity);
  el("staffNameColorButton").addEventListener("click", () => promptStaffNameColor());
  el("adminAnnouncementButton").addEventListener("click", sendAdminAnnouncement);
  el("startGameButton").addEventListener("click", openGameSetup);
  el("adminBannerButton").addEventListener("click", setRoomBanner);
  el("adminSlowModeButton").addEventListener("click", setSlowMode);
  el("adminLockRoomButton").addEventListener("click", toggleRoomLock);
  el("adminKickButton").addEventListener("click", kickUserFromToolbar);
  el("updatePresenceButton").addEventListener("click", updatePresence);
  el("timestampsButton").addEventListener("click", toggleTimestamps);
  el("searchChatButton").addEventListener("click", toggleSearch);
  el("closeChatSearchButton").addEventListener("click", () => { el("chatSearchBar").classList.add("hidden"); clearSearch(); });
  el("chatSearchInput").addEventListener("input", (event) => { state.searchQuery = event.target.value; applySearchFilter(); });
  el("newMessagesButton").addEventListener("click", scrollChatToBottom);
  el("cancelReplyButton").addEventListener("click", cancelReply);
  el("gameTypeSelect").addEventListener("change", updateGameSetupFields);
  el("gameStartConfirmButton").addEventListener("click", startSelectedGame);
  el("gameDialogCancel").addEventListener("click", closeGameSetup);
  el("gameOverlay").addEventListener("click", (event) => { if (event.target === el("gameOverlay")) closeGameSetup(); });
  el("adminIdentityApplyButton").addEventListener("click", applyAdminIdentity);
  el("adminIdentityRestoreButton").addEventListener("click", restoreAdminIdentity);
  el("adminIdentityCancelButton").addEventListener("click", closeAdminIdentity);
  el("adminIdentityOverlay").addEventListener("click", (event) => { if (event.target === el("adminIdentityOverlay")) closeAdminIdentity(); });

  el("formatBoldButton").addEventListener("click", () => toggleFormat("bold"));
  el("formatItalicButton").addEventListener("click", () => toggleFormat("italic"));
  el("formatUnderlineButton").addEventListener("click", () => toggleFormat("underline"));
  el("formatStrikeButton").addEventListener("click", () => toggleFormat("strike"));
  el("formatColorInput").addEventListener("input", (event) => { state.draftFormat.color = event.target.value; });
  el("formatSizeSelect").addEventListener("change", (event) => { state.draftFormat.size = event.target.value; });
  el("resetFormatButton").addEventListener("click", resetFormat);

  el("chatMessages").addEventListener("scroll", () => { if (isNearBottom()) clearUnread(); });
  el("chatInput").addEventListener("input", () => {
    if (!state.typingSent) {
      sendSocket({ type: "typing", active: true });
      state.typingSent = true;
    }
    clearTimeout(state.typingTimer);
    state.typingTimer = setTimeout(stopTyping, 1200);
  });


  window.addEventListener("drk:set-room-theme", (event) => {
    if (!isAdmin()) return;
    const theme = event.detail?.theme || null;
    sendSocket({ type: "admin_room_theme", theme });
  });

  window.addEventListener("drk:admin-kick", (event) => {
    const username = event.detail?.username;
    if (username) sendSocket({ type: "admin_kick", username });
  });

  window.addEventListener("drk:user-style-updated", (event) => {
    const detail = event.detail || {};
    if (!detail.username) return;
    applyUserStyle({ username: detail.username, nameColor: detail.nameColor || null, badge: detail.badge || "" });
    if (state.currentUser?.role === "admin") {
      sendSocket({ type: "admin_user_style", username: detail.username, nameColor: detail.nameColor || null, badge: detail.badge || "" });
    }
  });

  updateGameSetupFields();
  applyTimestampsPreference();
}
