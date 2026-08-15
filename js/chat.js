import { LIVE_HOST, ROOM_NAME } from "./config.js?v=0.18.13";
import { apiFetch } from "./api.js?v=0.18.13";
import { getToken, state } from "./state.js?v=0.18.13";
import { openMemberByUsername } from "./admin.js?v=0.18.13";
import { openProfileByUsername } from "./profile.js?v=0.18.13";
import { syncRoomTheme, getClientName } from "./themes.js?v=0.18.13";

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
  button.dataset.username = message.user;
  button.textContent = message.user;
  if (profile.nameColor) button.style.color = profile.nameColor;
  button.title = `View ${message.user}'s profile`;
  button.addEventListener("click", () => openProfileByUsername(isOwnDisplayedUsername(message.user) ? state.currentUser.username : message.user));
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

function addChatLine(message, { forceBottom = false, suppressEntranceSpotlight = false } = {}) {
  const wasBottom = isNearBottom();
  const line = document.createElement("div");
  line.className = `chat-line${message.role === "admin" ? " admin-message" : ""}${message.role === "mod" ? " mod-message" : ""}`;
  line.dataset.messageId = message.id || "";
  line.dataset.username = String(message.user || "");
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
  if (!suppressEntranceSpotlight) maybeSpotlightEntranceMessage(message, line);

  const own = String(message.user || "").toLowerCase() === String(state.currentUser?.username || "").toLowerCase();
  if (forceBottom || wasBottom || own) scrollChatToBottom();
  else bumpUnread();
}

function renderAllMessages({ forceBottom = false } = {}) {
  const box = el("chatMessages");
  const wasBottom = isNearBottom();
  const previousTop = box.scrollTop;
  box.innerHTML = "";
  state.messages.forEach((message) => addChatLine(message, { forceBottom: false, suppressEntranceSpotlight: true }));
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

    const name = document.createElement("button");
    name.type = "button";
    name.className = "online-user-button";
    name.addEventListener("click", () => openProfileByUsername(isOwnDisplayedUsername(user.username) ? state.currentUser.username : user.username));
    name.dataset.username = user.username;
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
  if (isAdmin()) populateEffectsTargets();
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

function closeStaffToolsMenu() {
  const menu = el("staffToolsMenu");
  if (menu) menu.classList.add("hidden");
  const button = el("staffToolsButton");
  if (button) button.setAttribute("aria-expanded", "false");
}

function toggleStaffToolsMenu() {
  if (!isStaff()) return;
  const menu = el("staffToolsMenu");
  if (!menu) return;
  const opening = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !opening);
  el("staffToolsButton")?.setAttribute("aria-expanded", String(opening));
}

function toggleAdminChatControls() {
  const admin = isAdmin();
  const staff = isStaff();
  document.body.classList.toggle("admin-mode", admin);
  document.body.classList.toggle("mod-mode", isMod());
  document.body.classList.toggle("staff-mode", staff);
  document.querySelectorAll(".admin-chat-action").forEach((node) => node.classList.toggle("hidden", !admin));
  document.querySelectorAll(".staff-chat-action").forEach((node) => node.classList.toggle("hidden", !staff));
  const toolsButton = el("staffToolsButton");
  if (toolsButton) {
    toolsButton.classList.toggle("hidden", !staff);
    toolsButton.textContent = admin ? "ADMIN MENU" : "MOD TOOLS";
    toolsButton.setAttribute("aria-expanded", "false");
    toolsButton.setAttribute("aria-controls", "staffToolsMenu");
  }
  const toolsTitle = el("staffToolsTitle");
  if (toolsTitle) toolsTitle.textContent = admin ? "ADMIN CONTROLS" : "MOD CONTROLS";
  if (!staff) closeStaffToolsMenu();
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
  state.chatManualEntry = true;
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

const TARGETED_EFFECTS = new Set(["spotlight", "boo", "victory", "wanted", "jail"]);
const MESSAGE_EFFECTS = new Set(["emergency", "news"]);
let roomEffectTimer = null;

function populateEffectsTargets() {
  const select = el("effectsTargetSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Choose someone...</option>';
  (state.latestPresence || []).forEach((entry) => {
    const username = typeof entry === "string" ? entry : entry?.username;
    if (!username) return;
    const option = document.createElement("option");
    option.value = username;
    option.textContent = username;
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === current)) select.value = current;
}

function initializeEffectsDock() {
  if (!isAdmin()) return;
  populateEffectsTargets();
  el("effectsMessage").textContent = "";
}

function toggleEffectsDock() {
  const body = el("effectsMenu");
  const collapsed = body.classList.toggle("hidden");
  el("effectsDialogCancel").textContent = collapsed ? "+" : "−";
  el("effectsDialogCancel").setAttribute("aria-label", collapsed ? "Expand room effects" : "Collapse room effects");
}

function stopRoomEffectsLocal() {
  clearTimeout(roomEffectTimer);
  roomEffectTimer = null;
  document.body.classList.remove("room-earthquake");
  document.querySelectorAll(".room-effect-target").forEach((node) => {
    node.classList.remove("room-effect-target", "target-victory", "target-wanted", "target-jail", "target-spotlight", "target-boo");
  });
  const layer = el("roomEffectLayer");
  if (layer) {
    layer.className = "room-effect-layer";
    layer.innerHTML = "";
  }
}

function addEffectCopy(layer, text) {
  if (!text) return;
  const copy = document.createElement("div");
  copy.className = "effect-copy";
  copy.textContent = text;
  layer.appendChild(copy);
}

function addFallingParticles(layer, glyphs, count = 60) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const total = reduced ? Math.min(18, count) : count;
  for (let i = 0; i < total; i += 1) {
    const node = document.createElement("span");
    node.className = "effect-particle";
    node.textContent = glyphs[i % glyphs.length];
    node.style.setProperty("--x", `${Math.random() * 100}vw`);
    node.style.setProperty("--drift", `${(Math.random() * 30 - 15).toFixed(1)}vw`);
    node.style.setProperty("--spin", `${Math.floor(Math.random() * 720 - 360)}deg`);
    node.style.setProperty("--duration", `${(Math.random() * 2.4 + 2.6).toFixed(2)}s`);
    node.style.setProperty("--delay", `${(Math.random() * .9).toFixed(2)}s`);
    node.style.setProperty("--size", `${Math.floor(Math.random() * 20 + 18)}px`);
    layer.appendChild(node);
  }
}

function markRoomEffectTarget(target, effect) {
  if (!target) return;
  document.querySelectorAll("[data-username]").forEach((node) => {
    if (String(node.dataset.username || "").toLowerCase() !== String(target).toLowerCase()) return;
    node.classList.add("room-effect-target", `target-${effect}`);
  });
}

function renderRoomEffect(effect, target = "", message = "", actor = "") {
  stopRoomEffectsLocal();
  const layer = el("roomEffectLayer");
  if (!layer) return;
  const label = target ? `${target}` : "";
  const copyText = message || ({
    spotlight: label ? `${label} is in the spotlight.` : "Spotlight!",
    boo: label ? `BOOO! Shame on ${label}.` : "BOOO!",
    victory: label ? `${label} gets the victory aura!` : "VICTORY!",
    wanted: label || "WANTED",
    jail: label ? `${label} has been sent to chat jail.` : "CHAT JAIL",
    police_lights: "ROOM ALERT",
    glitch: "",
    earthquake: "",
    fireworks: actor ? `${actor} launched fireworks!` : "FIREWORKS!",
    hearts: actor ? `${actor} sent some love.` : "",
    disco: "DISCO MODE",
    godzilla: "EVACUATE THE CHATROOM",
    emergency: "ATTENTION",
    news: "BREAKING NEWS"
  }[effect] || "");

  layer.className = `room-effect-layer active effect-${effect}`;
  markRoomEffectTarget(target, effect);

  if (effect === "earthquake") {
    document.body.classList.add("room-earthquake");
    setTimeout(() => document.body.classList.remove("room-earthquake"), 2200);
  } else if (effect === "fireworks") {
    const colors = ["#ff375f", "#ffd60a", "#64d2ff", "#bf5af2", "#30d158"];
    for (let i = 0; i < 24; i += 1) {
      const burst = document.createElement("i");
      burst.className = "effect-firework";
      burst.style.setProperty("--x", `${10 + Math.random() * 80}%`);
      burst.style.setProperty("--y", `${8 + Math.random() * 54}%`);
      burst.style.setProperty("--c", colors[i % colors.length]);
      burst.style.setProperty("--delay", `${(Math.random() * 2.8).toFixed(2)}s`);
      layer.appendChild(burst);
    }
  } else if (effect === "hearts") {
    addFallingParticles(layer, ["♥", "♡", "💗"], 72);
  } else if (effect === "boo") {
    addFallingParticles(layer, ["BOO!", "👎", "🍅"], 38);
  } else if (effect === "victory") {
    addFallingParticles(layer, ["★", "✦", "🏆"], 45);
  }

  addEffectCopy(layer, copyText);
  const duration = ["disco"].includes(effect) ? 10000 : ["emergency", "news", "wanted", "jail", "spotlight", "victory"].includes(effect) ? 8000 : 5500;
  roomEffectTimer = setTimeout(stopRoomEffectsLocal, duration);
}

function sendAdminEffect(effect) {
  if (!isAdmin()) return;
  if (effect === "confetti") {
    sendSocket({ type: "admin_confetti" });
    return;
  }
  const target = el("effectsTargetSelect").value.trim();
  const message = el("effectsMessageInput").value.trim();
  const messageBox = el("effectsMessage");
  if (TARGETED_EFFECTS.has(effect) && !target) {
    messageBox.className = "message error";
    messageBox.textContent = "Choose a target member for that effect.";
    return;
  }
  if (MESSAGE_EFFECTS.has(effect) && !message) {
    messageBox.className = "message error";
    messageBox.textContent = "Type a broadcast message first.";
    return;
  }
  messageBox.textContent = "";
  sendSocket({ type: "admin_effect", effect, target: target || null, message: message || null });
}

function stopRoomEffectsForEveryone() {
  if (!isAdmin()) return;
  sendSocket({ type: "admin_effect", effect: "stop" });
}


let entranceTimer = null;
let entranceBurstTimer = null;
let entranceWaitTimer = null;
let entrancePendingSpotlight = null;
let entrancePreviousAppFilter = null;


const ENTRANCE_QUALITY_KEY = "chatroom_entrance_quality";
const ENTRANCE_QUALITY_PROFILES = {
  performance:{particleCap:72,smokeCap:12,particleScale:.58,dpr:1},
  standard:{particleCap:132,smokeCap:20,particleScale:.88,dpr:1.5},
  high:{particleCap:220,smokeCap:32,particleScale:1.18,dpr:2}
};
let entranceParticleEngine = null;

function entranceQualityName(){
  const saved=String(localStorage.getItem(ENTRANCE_QUALITY_KEY)||"");
  if(ENTRANCE_QUALITY_PROFILES[saved])return saved;
  const weakCpu=Number(navigator.hardwareConcurrency||8)<=4;
  const weakMemory=Number(navigator.deviceMemory||8)<=4;
  return weakCpu||weakMemory?"performance":"standard";
}
function entranceQualityProfile(){return ENTRANCE_QUALITY_PROFILES[entranceQualityName()]||ENTRANCE_QUALITY_PROFILES.standard;}
document.documentElement.dataset.entranceQuality=entranceQualityName();
function entranceHexRgb(color){
  const raw=String(color||"#FFFFFF").trim();
  const m=/^#([0-9a-f]{6})$/i.exec(raw); if(!m)return [255,255,255];
  const n=parseInt(m[1],16); return [(n>>16)&255,(n>>8)&255,n&255];
}
function entranceSmokeSprite(color){
  const key=String(color||"#FFFFFF");
  entranceSmokeSprite.cache ||= new Map();
  if(entranceSmokeSprite.cache.has(key))return entranceSmokeSprite.cache.get(key);
  const c=document.createElement("canvas"); c.width=96;c.height=96; const cx=c.getContext("2d");
  const [r,g,b]=entranceHexRgb(key); const grad=cx.createRadialGradient(48,48,4,48,48,46);
  grad.addColorStop(0,`rgba(${r},${g},${b},.48)`);grad.addColorStop(.46,`rgba(${r},${g},${b},.25)`);grad.addColorStop(1,`rgba(${r},${g},${b},0)`);
  cx.fillStyle=grad;cx.fillRect(0,0,96,96);entranceSmokeSprite.cache.set(key,c);return c;
}
function ensureEntranceParticleEngine(layer){
  if(entranceParticleEngine?.layer===layer&&!entranceParticleEngine.destroyed)return entranceParticleEngine;
  entranceParticleEngine?.destroy?.();
  const canvas=document.createElement("canvas");canvas.className="entrance-particle-canvas";layer.appendChild(canvas);
  const ctx=canvas.getContext("2d",{alpha:true}); if(!ctx)return null;
  const q=entranceQualityProfile(); const rect=layer.getBoundingClientRect(); const width=Math.max(320,rect.width||window.innerWidth||1280),height=Math.max(240,rect.height||window.innerHeight||720); const dpr=Math.min(Number(window.devicePixelRatio||1),q.dpr);
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;ctx.setTransform(dpr,0,0,dpr,0,0);
  const engine={layer,canvas,ctx,width,height,q,particles:[],emitters:[],raf:0,last:performance.now(),destroyed:false};
  engine.spawn=(p)=>{
    if(engine.destroyed)return false;
    const smokeCount=engine.particles.reduce((n,x)=>n+(x.type==="smoke"?1:0),0);
    if(p.type==="smoke"&&smokeCount>=engine.q.smokeCap)return false;
    if(engine.particles.length>=engine.q.particleCap){
      const low=engine.particles.findIndex(x=>x.priority===0||x.type==="smoke");
      if((p.priority||0)>0&&low>=0)engine.particles.splice(low,1);else return false;
    }
    p.age=0;p.life=Math.max(.08,Number(p.life||.8));p.maxLife=p.life;engine.particles.push(p);engine.start();return true;
  };
  engine.addEmitter=(e)=>{e.age=0;engine.emitters.push(e);engine.start();};
  engine.start=()=>{if(!engine.raf&&!engine.destroyed){engine.last=performance.now();engine.raf=requestAnimationFrame(engine.frame);}};
  engine.frame=(now)=>{
    if(engine.destroyed)return;engine.raf=0;const dt=Math.min(.034,Math.max(.001,(now-engine.last)/1000));engine.last=now;ctx.clearRect(0,0,width,height);
    for(let i=engine.emitters.length-1;i>=0;i--){const e=engine.emitters[i];e.age+=dt;e.update?.(engine,dt);e.draw?.(engine,ctx);if(e.age>=e.life)engine.emitters.splice(i,1);}
    for(let i=engine.particles.length-1;i>=0;i--){const p=engine.particles[i];p.age+=dt;p.life-=dt;if(p.life<=0){engine.particles.splice(i,1);continue;} const t=p.life/p.maxLife;
      p.vx=(p.vx||0)*Math.pow(p.drag??.992,dt*60);p.vy=(p.vy||0)+(p.gravity||0)*dt;p.x+=(p.vx||0)*dt;p.y+=(p.vy||0)*dt;
      ctx.save();
      if(p.type==="smoke"){
        const grow=1+(1-t)*(p.grow||.45),size=(p.size||60)*grow;ctx.globalAlpha=(p.alpha??.45)*Math.min(1,(1-t)*4)*Math.min(1,t*2.4);ctx.drawImage(entranceSmokeSprite(p.color||"#D0D0D0"),p.x-size/2,p.y-size/2,size,size);
      }else if(p.type==="flash"){
        const radius=(p.size||50)*(1+(1-t)*.75),[r,green,b]=entranceHexRgb(p.color);const grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,radius);grad.addColorStop(0,`rgba(255,255,255,${.9*t})`);grad.addColorStop(.25,`rgba(${r},${green},${b},${.55*t})`);grad.addColorStop(1,`rgba(${r},${green},${b},0)`);ctx.fillStyle=grad;ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.fill();
      }else{
        const alpha=Math.min(1,t*2.2)*(p.alpha??1);ctx.globalAlpha=alpha;ctx.strokeStyle=p.color||"#FFFFFF";ctx.fillStyle=p.color||"#FFFFFF";ctx.lineWidth=Math.max(.8,(p.size||2));ctx.lineCap="round";
        const trail=Math.max(3,Math.min(30,p.trail||Math.hypot(p.vx||0,p.vy||0)*.018));ctx.beginPath();ctx.moveTo(p.x-(p.vx||0)*.018,p.y-(p.vy||0)*.018);ctx.lineTo(p.x,p.y);ctx.stroke();
        if(p.head){ctx.globalAlpha=Math.min(1,alpha*1.2);ctx.beginPath();ctx.arc(p.x,p.y,Math.max(1.5,(p.size||2)*1.35),0,Math.PI*2);ctx.fill();}
      }
      ctx.restore();
    }
    if(engine.particles.length||engine.emitters.length)engine.raf=requestAnimationFrame(engine.frame);
  };
  engine.destroy=()=>{engine.destroyed=true;if(engine.raf)cancelAnimationFrame(engine.raf);engine.raf=0;engine.particles.length=0;engine.emitters.length=0;canvas.remove();if(entranceParticleEngine===engine)entranceParticleEngine=null;};
  entranceParticleEngine=engine;return engine;
}
function entranceCanvasFlash(engine,x,y,color,size=54,life=.28){engine?.spawn({type:"flash",x,y,color,size,life,priority:3});}
function entranceCanvasSpark(engine,x,y,vx,vy,color,{life=.75,size=2,gravity=360,drag=.988,priority=2,head=false,alpha=1}={}){engine?.spawn({type:"spark",x,y,vx,vy,color,life,size,gravity,drag,priority,head,alpha});}
function entranceCanvasSmoke(engine,x,y,color,{life=2.2,size=72,vx=0,vy=-12,alpha=.4,grow=.55,priority=0}={}){engine?.spawn({type:"smoke",x,y,vx,vy,color,life,size,gravity:-2,drag:.995,alpha,grow,priority});}

function stopEntranceLocal({ keepPending = false } = {}) {
  entranceParticleEngine?.destroy?.();
  clearTimeout(entranceTimer);
  clearInterval(entranceBurstTimer);
  entranceTimer = null;
  entranceBurstTimer = null;
  const layer = el("entranceLayer");
  if (layer) {
    layer.className = "entrance-layer";
    layer.innerHTML = "";
    layer.removeAttribute("style");
  }
  const app = el("appWindow");
  if (app && entrancePreviousAppFilter !== null) {
    app.style.filter = entrancePreviousAppFilter;
    entrancePreviousAppFilter = null;
  }
  if (!keepPending) {
    clearTimeout(entranceWaitTimer);
    entranceWaitTimer = null;
    entrancePendingSpotlight = null;
  }
}

function entranceParticle(layer, side, color, height, style, intensity, width = 1, sourceOffset = 0, flashBurst = true) {
  const engine=ensureEntranceParticleEngine(layer); if(!engine)return;
  const q=engine.q, w=engine.width,h=engine.height;
  const x=side==="left"?w*((5.5+Number(sourceOffset||0))/100):side==="right"?w*((94.5-Number(sourceOffset||0))/100):w*((50+Number(sourceOffset||0))/100);
  const y=h*.965, strength=Math.max(.2,Math.min(1,Number(height||.72))), spread=Math.max(.5,Math.min(3,Number(width||1))), power=Math.max(1,Math.min(4,Number(intensity||2)));
  const isSparkler=style==="sparkler",isFountain=["fountain","wide_fountain","fan"].includes(style),isBurst=["bursts","center_blast"].includes(style),isJet=style==="jets";
  if(flashBurst)entranceCanvasFlash(engine,x,y,color,isSparkler?28:isBurst?68:52,isSparkler?.2:.28);
  const spawnOne=()=>{
    let angle=-Math.PI/2, speed=h*(.34+.3*strength);
    if(isSparkler){angle=(-Math.PI)+(Math.random()*Math.PI);speed=h*(.08+Math.random()*.12);}
    else if(isBurst){angle=(-Math.PI)+(Math.random()*Math.PI);speed=h*(.28+Math.random()*.28)*strength;}
    else if(isJet){angle=-Math.PI/2+(Math.random()-.5)*(Math.PI*.95*Math.min(1.35,spread));speed=h*(.32+Math.random()*.28)*strength;}
    else if(style==="fan"){angle=-Math.PI/2+(Math.random()-.5)*(Math.PI*.72*Math.min(1.5,spread));speed=h*(.3+Math.random()*.33)*strength;}
    else {const base=style==="wide_fountain"?.5:.28;angle=-Math.PI/2+(Math.random()-.5)*(Math.PI*base*Math.min(1.5,spread));speed=h*(.3+Math.random()*.3)*strength;}
    const vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
    entranceCanvasSpark(engine,x+(Math.random()-.5)*8*spread,y-2,vx,vy,color,{life:isSparkler?.42+Math.random()*.28:.65+Math.random()*.5,size:isSparkler?1.4+Math.random()*1.6:1.8+Math.random()*(1.2+power*.6),gravity:isSparkler?260:360,drag:.99,priority:2,head:isBurst&&Math.random()<.14});
  };
  if(isFountain){
    const emitter={life:.82,acc:0,update(e,dt){this.acc+=dt;const rate=(18+power*8)*q.particleScale;const n=Math.min(5,Math.floor(this.acc*rate));if(n>0)this.acc-=n/rate;for(let i=0;i<n;i++)spawnOne();}};engine.addEmitter(emitter);
  }else{
    const base=isSparkler?8:isBurst?28:isJet?22:18;const count=Math.max(4,Math.round((base+power*5)*q.particleScale));for(let i=0;i<count;i++)spawnOne();
  }
}

function entranceCrossJets(layer, color, height = .78, intensity = 2, width = 1.2, flashBurst = true) {
  const engine=ensureEntranceParticleEngine(layer); if(!engine)return;
  const w=engine.width,h=engine.height,rise=Math.min(h*.72,Math.max(h*.52,h*Number(height||.78)*.88)),duration=.82;
  const specs=[{sx:w*.1,sy:h*.965,ex:w*.84,ey:h*.965-rise},{sx:w*.9,sy:h*.965,ex:w*.16,ey:h*.965-rise}];
  specs.forEach(spec=>{
    if(flashBurst)entranceCanvasFlash(engine,spec.sx,spec.sy,color,48,.24);
    const emitter={life:duration,smokeTick:0,sparkTick:0,lastX:spec.sx,lastY:spec.sy,update(e,dt){
      const progress=Math.min(1,this.age/this.life),ease=1-Math.pow(1-progress,2.15),x=spec.sx+(spec.ex-spec.sx)*ease,y=spec.sy+(spec.ey-spec.sy)*ease;
      this.smokeTick+=dt;this.sparkTick+=dt;
      const smokeInterval=entranceQualityName()==="performance"?.075:.045;
      while(this.smokeTick>=smokeInterval){this.smokeTick-=smokeInterval;entranceCanvasSmoke(e,x+(Math.random()-.5)*8,y+(Math.random()-.5)*8,"#C9D1C9",{life:1.25+Math.random()*.55,size:(30+Math.random()*26)*Math.max(.8,width),vx:(Math.random()-.5)*10,vy:-7-Math.random()*7,alpha:.34,grow:.7,priority:0});}
      const sparkInterval=entranceQualityName()==="performance"?.055:.032;
      while(this.sparkTick>=sparkInterval){this.sparkTick-=sparkInterval;for(let i=0;i<(entranceQualityName()==="high"?2:1);i++)entranceCanvasSpark(e,x,y,(Math.random()-.5)*70,30+Math.random()*90,color,{life:.34+Math.random()*.3,size:1.5+Math.random()*2.2,gravity:300,drag:.99,priority:2});}
      this.lastX=x;this.lastY=y;
    },draw(e,ctx){const progress=Math.min(1,this.age/this.life),ease=1-Math.pow(1-progress,2.15),x=spec.sx+(spec.ex-spec.sx)*ease,y=spec.sy+(spec.ey-spec.sy)*ease;ctx.save();ctx.fillStyle="#FFFFFF";ctx.globalAlpha=.96;ctx.beginPath();ctx.arc(x,y,5.2*Math.max(.85,width),0,Math.PI*2);ctx.fill();ctx.fillStyle=color||"#22C55E";ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(x,y,9.5*Math.max(.85,width),0,Math.PI*2);ctx.fill();ctx.restore();}};
    engine.addEmitter(emitter);
  });
  setTimeout(()=>{if(entranceParticleEngine===engine&&!engine.destroyed)entranceCanvasFlash(engine,w*.5,h*.965-rise*.5,color,44,.22);},Math.round(duration*500));
}

function entrancePyroRain(layer, color, intensity, width = 1, curtain = false) {
  const engine=ensureEntranceParticleEngine(layer); if(!engine)return;
  const w=engine.width,h=engine.height,span=Math.min(1,.38+Math.max(.5,width)*.3),start=(1-span)/2;
  const base=curtain?54:36,count=Math.max(10,Math.round((base+Number(intensity||2)*8)*engine.q.particleScale));
  for(let i=0;i<count;i+=1){const x=w*(start+Math.random()*span),y=-20-Math.random()*h*.18;entranceCanvasSpark(engine,x,y,(Math.random()-.5)*48,h*(.55+Math.random()*.42),color,{life:.9+Math.random()*.6,size:curtain?2.2+Math.random()*2.2:1.7+Math.random()*1.8,gravity:80,drag:.998,priority:2,alpha:.94});}
}

function applyEntranceScreenFilter() {
  // v0.18.4: filters are now a true top-layer post-process inside entranceLayer.
  // Keeping this function as a compatibility no-op avoids filtering only appWindow beneath the entrance.
}

function addEntranceAtmosphere(layer, atmosphere) {
  if (!atmosphere || atmosphere.type === "none") return;
  const engine=ensureEntranceParticleEngine(layer); if(!engine)return;
  const density=Math.max(.1,Math.min(1,Number(atmosphere.density||.45))),spread=Math.max(.2,Math.min(1,Number(atmosphere.spread||.75))),heavy=atmosphere.type==="heavy_fog",smoke=atmosphere.type==="smoke",mist=atmosphere.type==="mist";
  const desired=Math.max(4,Math.round((heavy?18:smoke?13:mist?10:14)*density*engine.q.particleScale));
  const placement=atmosphere.placement||"floor",fade=Math.max(2,Math.min(8,Number(atmosphere.fade||4))),baseColor=atmosphere.color||"#FFFFFF";
  for(let i=0;i<desired;i+=1){
    let x=engine.width*(.5+(Math.random()-.5)*spread);if(placement==="sides")x=engine.width*(Math.random()<.5?Math.random()*.2:.8+Math.random()*.2);if(placement==="center")x=engine.width*(.35+Math.random()*.3);
    let y=engine.height*(smoke?.87:mist?.45:.91); if(heavy)y=engine.height*(.84+Math.random()*.1);
    entranceCanvasSmoke(engine,x,y,baseColor,{life:fade*(.72+Math.random()*.45),size:(mist?95:heavy?150:smoke?105:120)*( .75+Math.random()*.55),vx:(Math.random()-.5)*(smoke?14:22),vy:smoke?(-28-Math.random()*24):mist?(-5+Math.random()*10):(-6-Math.random()*8),alpha:mist?.16:heavy?.38:smoke?.34:.28,grow:smoke?.9:.6,priority:0});
  }
}

function normalizeEntranceLighting(lighting, tier = "basic") {
  const source=lighting&&typeof lighting==="object"?lighting:{};
  const maxFixtures=tier==="basic"?4:tier==="rare"?6:8;
  const fixtureCount=Math.max(2,Math.min(maxFixtures,Math.round(Number(source.fixtureCount||4))));
  return {
    enabled:source.enabled!==false, preset:String(source.preset||"custom"), dimming:String(source.dimming||(source.blackout?"blackout":"none")),
    blackout:Boolean(source.blackout), spotlight:Boolean(source.spotlight), lightning:Boolean(source.lightning), branchingLightning:Boolean(source.branchingLightning),
    primaryColor:source.primaryColor||"#FFFFFF", secondaryColor:source.secondaryColor||source.primaryColor||"#3B82F6",
    motion:source.motion||"none", aim:source.aim||"down", behavior:source.behavior||"steady", speed:Number.isFinite(Number(source.speed))?Number(source.speed):1,
    brightness:Number.isFinite(Number(source.brightness))?Number(source.brightness):.6, beamWidth:Number.isFinite(Number(source.beamWidth))?Number(source.beamWidth):.9,
    fixtureCount, fixtures:Array.isArray(source.fixtures)?source.fixtures.slice(0,fixtureCount):[]
  };
}

function entranceFixtureAimAngle(aim, x) {
  const mode=String(aim||"center");
  if(mode==="down")return 0;
  if(mode==="crowd_left")return -34;
  if(mode==="crowd_right")return 34;
  if(mode==="outward")return x<50?-31:31;
  if(mode==="ramp")return x<50?12:-12;
  if(mode==="screen")return x<50?7:-7;
  return Math.max(-28,Math.min(28,(50-x)*.42));
}
function resolvedFixtureSettings(lighting,index,count,x){
  const custom=Array.isArray(lighting.fixtures)?lighting.fixtures[index]||{}:{};
  let motion=custom.motion&&custom.motion!=="inherit"?custom.motion:(lighting.motion||"none");
  let behavior=custom.behavior&&custom.behavior!=="inherit"?custom.behavior:(lighting.behavior||"steady");
  if(motion==="pulse"){motion="none";if(behavior==="steady")behavior="pulse";}
  let aim=custom.aim&&custom.aim!=="inherit"?custom.aim:(lighting.aim||"center");
  let direction=custom.direction||"normal";
  if(lighting.preset==="gold_shimmer"&&!custom.motion){motion=index%2===0?"converge":"diverge";behavior="shimmer";direction=index%2===0?"normal":"reverse";}
  if(lighting.preset==="mirror_sweep"&&!custom.direction)direction=index%2===0?"normal":"reverse";
  const phase=Number.isFinite(Number(custom.phase))?Number(custom.phase):(count>1?index/(count-1):0);
  return {enabled:custom.enabled!==false,color:custom.color||(index%2?(lighting.secondaryColor||lighting.primaryColor||"#FFFFFF"):(lighting.primaryColor||"#FFFFFF")),brightness:Math.max(0,Math.min(1,Number(custom.brightness??lighting.brightness??.65))),aim,motion,behavior,speed:Math.max(.3,Math.min(3,Number(custom.speed||lighting.speed||1))),direction,phase,range:Math.max(.3,Math.min(2,Number(custom.range||1))),angle:entranceFixtureAimAngle(aim,x)};
}
function addEntranceRig(layer, lighting) {
  const safe=lighting&&typeof lighting==="object"?lighting:normalizeEntranceLighting({},"basic");
  if (safe.enabled === false) return;
  const rig=document.createElement("div");
  rig.className=`entrance-rig entrance-rig-behavior-${safe.behavior||"steady"}`;
  rig.style.setProperty("--rig-brightness",String(Number.isFinite(Number(safe.brightness))?Number(safe.brightness):.6));
  rig.style.setProperty("--beam-width",String(Number.isFinite(Number(safe.beamWidth))?Number(safe.beamWidth):.9));
  const truss=document.createElement("div"); truss.className="entrance-truss"; rig.appendChild(truss);

  const physicalCount=8;
  const activeCount=Math.max(2,Math.min(8,Math.round(Number(safe.fixtureCount||4))));
  const activeIndices=activeCount>=8?[0,1,2,3,4,5,6,7]:activeCount>=6?[0,1,2,5,6,7]:[0,2,5,7];

  for(let i=0;i<physicalCount;i+=1){
    const x=8+(84*i/(physicalCount-1));
    const activeOrdinal=activeIndices.indexOf(i);
    const isUnlocked=activeOrdinal>=0;
    const settings=isUnlocked?resolvedFixtureSettings(safe,activeOrdinal,activeCount,x):{enabled:false,color:"#4B5563",brightness:0,aim:"down",motion:"none",behavior:"steady",speed:1,direction:"normal",phase:0,range:1,angle:0};
    const fixture=document.createElement("div");
    fixture.className=`entrance-light-fixture entrance-fixture-motion-${settings.motion} entrance-fixture-behavior-${settings.behavior}${settings.enabled&&isUnlocked?"":" is-off"}${isUnlocked?"":" is-locked"}${settings.direction==="reverse"?" reverse":""}`;
    fixture.style.setProperty("--fixture-i",String(i));
    fixture.style.setProperty("--fixture-count",String(physicalCount));
    fixture.style.left=`${x}%`;
    fixture.style.setProperty("--beam-color",settings.color||"#FFFFFF");
    fixture.style.setProperty("--aim-angle",`${Number(settings.angle)||0}deg`);
    fixture.style.setProperty("--fixture-speed",`${Math.max(.3,Number(settings.speed)||1)}s`);
    fixture.style.setProperty("--fixture-brightness",String(Math.max(0,Math.min(1,Number(settings.brightness)||0))));
    fixture.style.setProperty("--fixture-phase",String(Number(settings.phase)||0));
    fixture.style.setProperty("--fixture-delay",`${(-(Number(settings.phase)||0)*Math.max(.3,Number(settings.speed)||1)).toFixed(2)}s`);
    fixture.style.setProperty("--fixture-range",String(Math.max(.3,Number(settings.range)||1)));
    fixture.style.setProperty("--fixture-sweep-angle",`${(24*Math.max(.3,Number(settings.range)||1)).toFixed(1)}deg`);
    fixture.style.setProperty("--fixture-offset-angle",`${((i-(physicalCount-1)/2)*4).toFixed(1)}deg`);
    const yoke=document.createElement("i"); yoke.className="entrance-light-yoke";
    const head=document.createElement("i"); head.className="entrance-light-head";
    const lens=document.createElement("i"); lens.className="entrance-light-lens";
    const beam=document.createElement("i"); beam.className="entrance-light-beam";
    head.append(lens,beam); fixture.append(yoke,head); rig.appendChild(fixture);
  }
  layer.appendChild(rig);
}

function addLightningStrike(layer, branching = false) {
  const wrapper = document.createElement("div"); wrapper.className = `entrance-lightning-wrap${branching ? " branching" : ""}`;
  const branches = branching ? `<polyline class="entrance-lightning-branch" points="58,210 22,270 38,270 12,350"/><polyline class="entrance-lightning-branch" points="54,300 91,346 76,346 104,420"/>` : "";
  wrapper.innerHTML = `<svg class="entrance-lightning-bolt" viewBox="0 0 120 520" aria-hidden="true"><polyline points="72,0 44,125 70,125 35,255 61,255 26,390 57,390 42,520"/>${branches}</svg>`;
  const flash=document.createElement("div"); flash.className="entrance-lightning-flash entrance-post-flash"; layer.append(wrapper,flash);
  const rig=layer.querySelector('.entrance-rig'); if(rig)rig.classList.add('lightning-hit');
  requestAnimationFrame(() => { wrapper.classList.add("strike"); flash.classList.add("strike"); });
  setTimeout(() => { wrapper.remove(); flash.remove(); if(rig)rig.classList.remove('lightning-hit'); }, 900);
}

function entranceFilterCss(filter={}) {
  const i=Math.max(0,Math.min(1,Number(filter.intensity||.55))),mode=String(filter.mode||"none");
  const map={
    cinematic:`contrast(${1+.28*i}) saturate(${1+.24*i}) brightness(${1-.07*i})`,
    cool:`contrast(${1+.10*i}) saturate(${1+.22*i}) brightness(${1-.035*i})`,
    warm:`sepia(${.34*i}) saturate(${1+.38*i}) brightness(${1+.015*i})`,
    red:`contrast(${1+.08*i}) saturate(${1+.32*i})`,
    blue:`contrast(${1+.08*i}) saturate(${1+.32*i})`,
    purple:`contrast(${1+.08*i}) saturate(${1+.32*i})`,
    green:`contrast(${1+.08*i}) saturate(${1+.30*i})`,
    gold:`sepia(${.48*i}) saturate(${1+.62*i}) contrast(${1+.06*i})`,
    mono:`grayscale(${i}) contrast(${1+.22*i})`,
    high_contrast:`contrast(${1+.9*i}) saturate(${1+.35*i})`,
    desaturated:`grayscale(${.7*i}) saturate(${1-.72*i}) contrast(${1+.15*i})`,
    gold_contrast:`sepia(${.82*i}) saturate(${1+1.7*i}) hue-rotate(${-10*i}deg) contrast(${1+.55*i})`,
    crimson_mono:`grayscale(${.55*i}) sepia(${.55*i}) saturate(${1+1.55*i}) hue-rotate(${-35*i}deg) contrast(${1+.38*i})`,
    electric_blue:`sepia(${.32*i}) saturate(${1+2.35*i}) hue-rotate(${174*i}deg) contrast(${1+.42*i}) brightness(${1+.08*i})`
  }; return map[mode]||"none";
}
function addEntranceFilter(layer, filter) {
  if (!filter || filter.mode === "none" || Number(filter.intensity || 0) <= 0) return;
  const overlay = document.createElement("div"); overlay.className = `entrance-color-filter entrance-filter-${filter.mode}`;
  const intensity=Math.max(0,Math.min(1,Number(filter.intensity||.55))); overlay.style.setProperty("--filter-intensity",String(intensity)); overlay.style.backdropFilter=entranceFilterCss(filter); overlay.style.webkitBackdropFilter=entranceFilterCss(filter); layer.appendChild(overlay);
}

function addEntranceNameplate(layer, username, tier, config, timing = {}) {
  const plate=config.nameplate||{}; if(plate.enabled===false)return null;
  const nameplate=document.createElement("div"); nameplate.className=`entrance-nameplate entrance-nameplate-${plate.style||"arena"} entrance-nameplate-anim-${plate.animation||"slide"}${plate.glow?" glow":""}`;
  const name=document.createElement("strong"); name.textContent=config.wrestlingName||username||"ENTRANCE"; const sub=document.createElement("span"); sub.textContent=config.subtitle||(username||""); nameplate.append(name,sub); layer.appendChild(nameplate); requestAnimationFrame(()=>nameplate.classList.add("show"));
  const leaveAt=Math.max(1800,Math.min(6000,(Number(timing.totalDuration||6)-1.2)*1000)); setTimeout(()=>nameplate.classList.add("leaving"),leaveAt); setTimeout(()=>nameplate.remove(),leaveAt+700); return nameplate;
}

function entranceFlameBurst(layer, color, height, width, intensity, positions = ["left","right"]) {
  positions.forEach((side,idx)=>{ const flame=document.createElement("div"); flame.className=`entrance-flame entrance-flame-${typeof side==="number"?"wall":side}`; flame.style.setProperty("--flame-color",color||"#F97316"); flame.style.setProperty("--flame-height",`${Math.max(100,window.innerHeight*height)}px`); flame.style.setProperty("--flame-width",`${Math.max(.6,width)}`); flame.style.setProperty("--flame-intensity",String(intensity)); if(typeof side==="number")flame.style.left=`${side}%`; else if(side.startsWith("center"))flame.style.left=side==="center-left"?"46%":"54%"; layer.appendChild(flame); setTimeout(()=>flame.remove(),1100); });
}

function addGlassShatter(layer, fx={}) {
  const wrap=document.createElement("div"); wrap.className=`entrance-glass-shatter${fx.lingerCracks?" linger":""}`; const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"); svg.setAttribute("viewBox","0 0 100 100"); svg.classList.add("entrance-glass-svg"); const centerX=48+Math.random()*4,centerY=42+Math.random()*12;
  for(let i=0;i<18;i+=1){ const a=(Math.PI*2*i/18)+(Math.random()-.5)*.18; const r=45+Math.random()*35; const x=centerX+Math.cos(a)*r,y=centerY+Math.sin(a)*r; const line=document.createElementNS(svg.namespaceURI,"path"); const mx=centerX+Math.cos(a)*r*.35+(Math.random()-.5)*8,my=centerY+Math.sin(a)*r*.35+(Math.random()-.5)*8; line.setAttribute("d",`M ${centerX} ${centerY} L ${mx} ${my} L ${x} ${y}`); svg.appendChild(line); }
  wrap.appendChild(svg); layer.appendChild(wrap); if(Number(fx.flash||0)>0){ const flash=document.createElement("div"); flash.className="entrance-screen-flash"; flash.style.opacity=String(Math.min(1,Number(fx.flash||.6))); layer.appendChild(flash); setTimeout(()=>flash.remove(),320); } if(Number(fx.shake||0)>0) el("appWindow")?.classList.add(`entrance-shake-${Math.min(3,Math.round(Number(fx.shake)))}`); setTimeout(()=>{ el("appWindow")?.classList.remove("entrance-shake-1","entrance-shake-2","entrance-shake-3"); if(!fx.lingerCracks)wrap.remove(); },fx.lingerCracks?3500:1500); if(fx.lingerCracks)setTimeout(()=>wrap.remove(),3500);
}

function addEntranceScreenFx(layer, fx={}) {
  const effect=fx.effect||"none"; if(effect==="none")return; if(effect==="glass_shatter")return addGlassShatter(layer,fx); if(effect==="lightning")return addLightningStrike(layer);
  if(effect==="flash"){ const flash=document.createElement("div"); flash.className="entrance-screen-flash"; flash.style.opacity=String(Math.min(1,Number(fx.flash||.7))); layer.appendChild(flash); setTimeout(()=>flash.remove(),500); }
  if(effect==="glitch"){ const glitch=document.createElement("div"); glitch.className="entrance-screen-glitch"; layer.appendChild(glitch); setTimeout(()=>glitch.remove(),1100); }
  if(effect==="shake"){ const app=el("appWindow"); const n=Math.max(1,Math.min(3,Math.round(Number(fx.shake||1)))); app?.classList.add(`entrance-shake-${n}`); setTimeout(()=>app?.classList.remove(`entrance-shake-${n}`),900); }
}

function spotlightChatMessage(line, pending) {
  if (!line || !document.body.contains(line)) return;
  stopEntranceLocal({ keepPending: true });
  const layer = el("entranceLayer");
  if (!layer) return;
  const rect = line.getBoundingClientRect();
  layer.className = `entrance-layer active entrance-message-focus entrance-filter-${pending.filter?.mode || "none"}`;
  layer.style.setProperty("--filter-intensity", String(Math.max(0, Math.min(1, Number(pending.filter?.intensity || .55)))));
  addEntranceFilter(layer, pending.filter || {});
  applyEntranceScreenFilter(pending.filter || {});
  const focus = document.createElement("div");
  focus.className = "entrance-message-spotlight";
  const padX = 18;
  const padY = 12;
  focus.style.left = `${Math.max(8, rect.left - padX)}px`;
  focus.style.top = `${Math.max(8, rect.top - padY)}px`;
  focus.style.width = `${Math.min(window.innerWidth - 16, rect.width + padX * 2)}px`;
  focus.style.height = `${Math.max(54, rect.height + padY * 2)}px`;
  focus.style.setProperty("--spot-color", pending.primaryColor || "#FFFFFF");
  const cone = document.createElement("div");
  cone.className = "entrance-message-cone";
  const centerX = rect.left + rect.width / 2;
  const targetTop = Math.max(60, rect.top - 8);
  cone.style.left = `${centerX}px`;
  cone.style.height = `${targetTop}px`;
  cone.style.setProperty("--spot-color", pending.primaryColor || "#FFFFFF");
  layer.append(cone, focus);
  line.classList.add("entrance-first-message");
  setTimeout(() => line.classList.remove("entrance-first-message"), 4500);
  clearTimeout(entranceWaitTimer);
  entrancePendingSpotlight = null;
  entranceWaitTimer = null;
  entranceTimer = setTimeout(() => stopEntranceLocal(), 4300);
}

function maybeSpotlightEntranceMessage(message, line) {
  const pending = entrancePendingSpotlight;
  if (!pending || Date.now() > pending.expiresAt) return;
  if (String(message.user || "").toLowerCase() !== pending.username.toLowerCase()) return;
  if (message.deleted || !String(message.content || "").trim()) return;
  spotlightChatMessage(line, pending);
}

function registerEntranceSpotlight(username, config, { preview = false } = {}) {
  if (!config?.lighting?.spotlight) return;
  const pending = {
    username: String(username || ""),
    primaryColor: config.lighting?.primaryColor || "#FFFFFF",
    filter: config.filter || { mode: "none", intensity: 0 },
    expiresAt: Date.now() + 30000
  };
  if (preview) {
    setTimeout(() => {
      const lines = [...document.querySelectorAll('.chat-line[data-username]')];
      const target = [...lines].reverse().find((node) => String(node.dataset.username || "").toLowerCase() === pending.username.toLowerCase()) || lines.at(-1);
      if (target) spotlightChatMessage(target, pending);
    }, 3600);
    return;
  }
  entrancePendingSpotlight = pending;
  clearTimeout(entranceWaitTimer);
  entranceWaitTimer = setTimeout(() => { entrancePendingSpotlight = null; entranceWaitTimer = null; }, 30000);
}

function renderEntrance(username, entrance, { preview = false } = {}) {
  const tier=String(entrance?.tier||"none"), config=entrance?.config||{}; if(tier==="none"||!config.enabled){if(preview)addSystemLine("This entrance is disabled or has no Entrance Status.");return;}
  stopRoomEffectsLocal(); stopEntranceLocal(); const layer=el("entranceLayer"); if(!layer)return;
  const pyro=config.pyro||{}, lighting=normalizeEntranceLighting(config.lighting,tier), filter=config.filter||{}, timing=config.timing||{}, fx=config.screenFx||{};
  const duration=Math.max(1,Math.min(15,Number(pyro.duration||4))), frequency=Math.max(.25,Math.min(3,Number(pyro.frequency||.8))), height=Math.max(.2,Math.min(1,Number(pyro.height||.72))), intensity=Math.max(1,Math.min(4,Number(pyro.intensity||2))), width=Math.max(.4,Math.min(3,Number(pyro.width||1))), burstCount=Math.max(1,Math.min(8,Math.round(Number(pyro.burstCount||3))));
  const primary=lighting.primaryColor||"#FFFFFF", secondary=lighting.secondaryColor||primary, delay=Math.max(0,Number(timing.entranceDelay||0))*1000, total=Math.max(3,Math.min(15,Number(timing.totalDuration||Math.max(6,duration))))*1000;
  const dimming=String(lighting.dimming||(lighting.blackout?"blackout":"none"));
  layer.className=`entrance-layer active entrance-tier-${tier} entrance-motion-${lighting.motion||"none"}`; layer.style.setProperty("--entrance-primary",primary); layer.style.setProperty("--entrance-secondary",secondary); layer.style.setProperty("--entrance-speed",`${Math.max(.3,Math.min(3,Number(lighting.speed||1)))}s`);
  const dimOpacity={none:0,light:.24,moderate:.42,strong:.62,blackout:.88}[dimming]??0; const blackout=document.createElement("div"); blackout.className="entrance-blackout-screen"; blackout.style.setProperty("--entrance-dim-opacity",String(dimOpacity)); layer.appendChild(blackout); addEntranceFilter(layer,filter);
  const at=(seconds,fn)=>setTimeout(fn,delay+Math.max(0,Number(seconds||0))*1000);
  at(.15,()=>addEntranceRig(layer,lighting)); at(timing.atmosphereStart??.3,()=>addEntranceAtmosphere(layer,config.atmosphere||{})); at(timing.nameplateStart??.6,()=>addEntranceNameplate(layer,username,tier,config,timing)); if(lighting.lightning||config.signatureEffect==="dark_arrival_lightning")at(timing.screenFxStart??1.2,()=>addLightningStrike(layer,Boolean(lighting.branchingLightning))); at(timing.screenFxStart??.8,()=>addEntranceScreenFx(layer,fx));
  const fireBurst=(burstIndex=0)=>{ if(pyro.enabled===false)return; const style=pyro.style||"jets",color=pyro.color||"#FFFFFF",pos=pyro.position||"both"; const defaultFlash=["jets","cross_jets","sparkler_lane","center_blast","dual_center","multi_burst","full_stage","finale"].includes(style), flashBurst=pyro.flashBurst==null?defaultFlash:Boolean(pyro.flashBurst);
    if(pyro.layeredEffects && !["flame_jets","alternating_flames","flame_wall"].includes(style)){ entranceFlameBurst(layer,"#F97316",Math.min(1,height*.9),Math.min(1.4,width),intensity,[12,28,72,88]); setTimeout(()=>entranceParticle(layer,"center",color,Math.min(1,height*.92),"center_blast",Math.max(2,intensity),Math.min(2,width),0,true),90); }
    if(style==="rain"||style==="curtain"){entrancePyroRain(layer,color,intensity,width,style==="curtain");return;}
    if(style==="cross_jets"){
      entranceCrossJets(layer,color,height,intensity,width,flashBurst);
      if(config.templatePreset==="rare_green_rebellion"){
        setTimeout(()=>{
          entranceParticle(layer,"left",color,Math.min(.64,height*.82),"wide_fountain",Math.max(1,Math.min(2,intensity)),Math.min(1.35,width*1.08),0,false);
          entranceParticle(layer,"right",color,Math.min(.64,height*.82),"wide_fountain",Math.max(1,Math.min(2,intensity)),Math.min(1.35,width*1.08),0,false);
        },55);
      }
      return;
    }
    if(style==="sparkler_lane"){const lane=[-16,-11,-6,-2,2,6,11,16]; lane.forEach((off,i)=>setTimeout(()=>entranceParticle(layer,"center",color,Math.min(.42,height*.62),"sparkler",Math.min(2,intensity),Math.min(.85,width),off,flashBurst),i*55));return;}
    if(style==="flame_jets"||style==="alternating_flames"||style==="flame_wall"){ let positions=style==="flame_wall"?[8,20,32,44,56,68,80,92]:(pos==="center"?["center-left","center-right"]:(pos==="left"?["left"]:(pos==="right"?["right"]:["left","right"]))); if(style==="alternating_flames"&&positions.length>1)positions=[positions[burstIndex%positions.length]]; entranceFlameBurst(layer,color,height,width,intensity,positions); return; }
    if(style==="center_blast"||style==="dual_center"){ if(style==="dual_center"){ entranceParticle(layer,"center",color,height,"center_blast",intensity,width,-4,flashBurst); entranceParticle(layer,"center",color,height,"center_blast",intensity,width,4,flashBurst); } else entranceParticle(layer,"center",color,height,"center_blast",intensity,width,0,flashBurst); return; }
    if(style==="full_stage"){[-42,-28,-14,0,14,28,42].forEach((off,i)=>setTimeout(()=>entranceParticle(layer,"center",color,height,"bursts",intensity,width,off,flashBurst),i*45));return;}
    if(style==="multi_burst"||style==="finale"){ [0,12,24].forEach((off,i)=>{setTimeout(()=>entranceParticle(layer,"left",color,height,"bursts",intensity,width,off,flashBurst),i*70);setTimeout(()=>entranceParticle(layer,"right",color,height,"bursts",intensity,width,off,flashBurst),i*70);}); if(style==="finale")setTimeout(()=>entranceParticle(layer,"center",color,height,"center_blast",intensity,width*1.2,0,flashBurst),120); return; }
    const sides=pos==="left"?["left"]:(pos==="right"?["right"]:(pos==="center"?["center"]:["left","right"])); const baseInner=pos==="inner"?34.5:0; const offsets=style==="wide_fountain"?[baseInner,baseInner+10,baseInner+20]:style==="fan"?[baseInner,baseInner+14]:[baseInner]; sides.forEach(side=>offsets.forEach((offset,idx)=>setTimeout(()=>entranceParticle(layer,side,color,height,style,intensity,width,offset,flashBurst),idx*55)));
  };
  if(pyro.enabled!==false){ at(timing.pyroStart??1,()=>{ for(let i=0;i<burstCount;i+=1)setTimeout(()=>fireBurst(i),i*(pyro.behavior==="rapid"?180:frequency*1000)); }); }
  registerEntranceSpotlight(username,config,{preview}); entranceTimer=setTimeout(()=>stopEntranceLocal({keepPending:!preview&&Boolean(config.lighting?.spotlight)}),delay+total);
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

  const entryFlag = state.chatManualEntry ? "&entry=1" : "";
  const socketUrl = `wss://${LIVE_HOST}/parties/chat/${ROOM_NAME}?token=${encodeURIComponent(token)}${entryFlag}`;
  const socket = new WebSocket(socketUrl);
  state.chatSocket = socket;

  socket.addEventListener("open", () => {
    if (socket !== state.chatSocket) return;
    const wasReconnect = state.chatReconnectAttempts > 0;
    state.chatManualEntry = false;
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
    if (data.type === "rps_private") {
      addSystemLine(data.message || "RPS choice locked.");
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
    if (data.type === "room_effect") {
      if (data.effect === "stop") stopRoomEffectsLocal();
      else renderRoomEffect(data.effect || "", data.target || "", data.message || "", data.actor || "");
      return;
    }
    if (data.type === "entrance") {
      renderEntrance(data.username || "", data.entrance || {});
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
  closeStaffToolsMenu();
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
  if (state.game && !["won", "lost", "villagers_win", "werewolves_win", "complete", "declined", "ended"].includes(String(state.game.status))) {
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
  el("rpsTournamentSetupFields").classList.toggle("hidden", game !== "rps_tournament");
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
  } else if (game === "rps_tournament") {
    sendSocket({ type: "game_start", game: "rps_tournament" });
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
  } else if (state.game?.type === "rps_duel" && ["challenged", "active"].includes(state.game.status)) {
    input.placeholder = "RPS: use /rps accept, /rps decline, or /rps rock|paper|scissors";
  } else if (state.game?.type === "rps_tournament" && ["registration", "active"].includes(state.game.status)) {
    input.placeholder = state.game.status === "registration" ? "RPS Tournament: type /rps join" : "RPS Tournament: when it is your match, type /rps rock|paper|scissors";
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
  el("startGameButton").textContent = ["active", "registration", "challenged"].includes(String(state.game.status)) ? "GAME" : "START GAME";

  const header = document.createElement("div");
  header.className = "game-panel-header";
  const left = document.createElement("div");
  const title = document.createElement("div");
  title.className = "game-panel-title";
  if (state.game.type === "hangman") title.textContent = "HANGMAN";
  else if (state.game.type === "boss") title.textContent = `BOSS BATTLE — ${state.game.bossName}`;
  else if (state.game.type === "werewolf") title.textContent = `WEREWOLF — ${String(state.game.phase || "ended").toUpperCase()} ${state.game.day || ""}`.trim();
  else if (state.game.type === "rps_duel") title.textContent = "ROCK PAPER SCISSORS — CHALLENGE";
  else if (state.game.type === "rps_tournament") title.textContent = "ROCK PAPER SCISSORS — TOURNAMENT";
  else title.textContent = "CHAT GAME";

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


  if (state.game.type === "rps_duel") {
    const game = state.game;
    const myUser = String(state.currentUser?.username || "").toLowerCase();
    const aKey = String(game.challenger?.username || "").toLowerCase();
    const bKey = String(game.opponent?.username || "").toLowerCase();
    const card = document.createElement("div");
    card.className = "rps-match-card";
    const players = document.createElement("div");
    players.className = "rps-versus";
    const a = document.createElement("div");
    a.className = "rps-player-card";
    a.innerHTML = `<strong>${game.challenger?.displayName || "Player 1"}</strong><span>${game.score?.[aKey] || 0}</span>`;
    const vs = document.createElement("div");
    vs.className = "rps-vs";
    vs.textContent = "VS";
    const b = document.createElement("div");
    b.className = "rps-player-card";
    b.innerHTML = `<strong>${game.opponent?.displayName || "Player 2"}</strong><span>${game.score?.[bKey] || 0}</span>`;
    players.append(a, vs, b);
    card.appendChild(players);

    const status = document.createElement("div");
    status.className = "rps-status";
    if (game.status === "challenged") status.textContent = `${game.opponent?.displayName} has been challenged. Best of ${game.bestOf}.`;
    else if (game.status === "active") status.textContent = `Round ${game.round} • First to ${game.requiredWins} wins.`;
    else if (game.status === "complete") status.textContent = `🏆 ${game.winner?.displayName || "Winner"} wins the match.`;
    else status.textContent = String(game.status || "").toUpperCase();
    card.appendChild(status);

    if (game.status === "challenged" && myUser === bKey) {
      const actions = document.createElement("div");
      actions.className = "rps-choice-row";
      actions.append(
        makeAction("ACCEPT", () => sendSocket({ type: "rps_accept" })),
        makeAction("DECLINE", () => sendSocket({ type: "rps_decline" }), "danger")
      );
      card.appendChild(actions);
    }

    if (game.status === "active" && [aKey, bKey].includes(myUser)) {
      const locked = Boolean(game.locked?.[myUser]);
      const choices = document.createElement("div");
      choices.className = "rps-choice-row";
      if (locked) {
        const wait = document.createElement("strong");
        wait.textContent = "CHOICE LOCKED — waiting for the other player…";
        choices.appendChild(wait);
      } else {
        [["✊", "ROCK", "rock"], ["✋", "PAPER", "paper"], ["✌️", "SCISSORS", "scissors"]].forEach(([icon, label, choice]) => {
          choices.appendChild(makeAction(`${icon} ${label}`, () => sendSocket({ type: "rps_pick", choice })));
        });
      }
      card.appendChild(choices);
    }
    panel.appendChild(card);
    panel.appendChild(gameLogNode(game.log));
    return;
  }

  if (state.game.type === "rps_tournament") {
    const game = state.game;
    const myUser = String(state.currentUser?.username || "").toLowerCase();
    const intro = document.createElement("div");
    intro.className = "rps-tournament-head";
    if (game.status === "registration") {
      const text = document.createElement("div");
      text.innerHTML = `<strong>REGISTRATION OPEN</strong><span>${(game.participants || []).length} player${(game.participants || []).length === 1 ? "" : "s"} joined</span>`;
      intro.appendChild(text);
      const joined = (game.participants || []).some((p) => String(p.username).toLowerCase() === myUser);
      if (!joined) intro.appendChild(makeAction("JOIN TOURNAMENT", () => sendSocket({ type: "rps_tournament_join" })));
      if (isStaff() && (game.participants || []).length >= 2) intro.appendChild(makeAction("START BRACKET", () => sendSocket({ type: "rps_tournament_start" })));
    } else if (game.status === "complete") {
      intro.innerHTML = `<strong>🏆 ${game.champion?.displayName || "Champion"}</strong><span>RPS CHAMPION — reigning title awarded for up to 30 days</span>`;
    } else {
      intro.innerHTML = `<strong>BRACKET IN PROGRESS</strong><span>Selections stay hidden until both players lock in.</span>`;
    }
    panel.appendChild(intro);

    if (game.status === "registration") {
      const roster = document.createElement("div");
      roster.className = "rps-registration-roster";
      (game.participants || []).forEach((player, index) => {
        const chip = document.createElement("span");
        chip.textContent = `${index + 1}. ${player.displayName}`;
        roster.appendChild(chip);
      });
      panel.appendChild(roster);
    }

    if ((game.rounds || []).length) {
      const bracket = document.createElement("div");
      bracket.className = "rps-bracket";
      (game.rounds || []).forEach((round, roundIndex) => {
        const col = document.createElement("div");
        col.className = "rps-bracket-round";
        const heading = document.createElement("strong");
        const isFinal = round.length === 1;
        heading.textContent = isFinal ? "FINAL" : `ROUND ${roundIndex + 1}`;
        col.appendChild(heading);
        round.forEach((match, matchIndex) => {
          const node = document.createElement("div");
          node.className = `rps-bracket-match ${match.status}${roundIndex === game.currentRound && matchIndex === game.currentMatch ? " current" : ""}`;
          const p1 = document.createElement("div");
          p1.className = match.winner?.username === match.playerA?.username ? "winner" : "";
          p1.textContent = `${match.playerA?.displayName || "BYE"} ${match.playerA ? match.scoreA : ""}`;
          const p2 = document.createElement("div");
          p2.className = match.winner?.username === match.playerB?.username ? "winner" : "";
          p2.textContent = `${match.playerB?.displayName || "BYE"} ${match.playerB ? match.scoreB : ""}`;
          node.append(p1, p2);
          col.appendChild(node);
        });
        bracket.appendChild(col);
      });
      panel.appendChild(bracket);
    }

    if (game.status === "active") {
      const currentRound = game.rounds?.[game.currentRound] || [];
      const match = currentRound?.[game.currentMatch] || null;
      if (match?.playerA && match?.playerB) {
        const aKey = String(match.playerA.username).toLowerCase();
        const bKey = String(match.playerB.username).toLowerCase();
        const current = document.createElement("div");
        current.className = "rps-current-match";
        current.innerHTML = `<strong>${match.playerA.displayName} vs ${match.playerB.displayName}</strong><span>First to ${match.requiredWins} • ${match.scoreA}-${match.scoreB}</span>`;
        panel.appendChild(current);
        if ([aKey, bKey].includes(myUser)) {
          const locked = Boolean(game.locked?.[myUser]);
          const choices = document.createElement("div");
          choices.className = "rps-choice-row";
          if (locked) {
            const wait = document.createElement("strong");
            wait.textContent = "YOUR THROW IS LOCKED — waiting for your opponent…";
            choices.appendChild(wait);
          } else {
            [["✊", "ROCK", "rock"], ["✋", "PAPER", "paper"], ["✌️", "SCISSORS", "scissors"]].forEach(([icon, label, choice]) => {
              choices.appendChild(makeAction(`${icon} ${label}`, () => sendSocket({ type: "rps_pick", choice })));
            });
          }
          panel.appendChild(choices);
        }
      }
    }
    panel.appendChild(gameLogNode(game.log));
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

function applyFormatToolbarPreference() {
  const open = localStorage.getItem("chatroom_formatbar_open") === "1";
  const toolbar = el("formatToolbar");
  const button = el("formatToggleButton");
  toolbar.classList.toggle("hidden", !open);
  button.classList.toggle("is-active", open);
  button.textContent = open ? "FORMAT: ON" : "FORMAT";
}

function toggleFormatToolbar() {
  const nextOpen = el("formatToolbar").classList.contains("hidden");
  localStorage.setItem("chatroom_formatbar_open", nextOpen ? "1" : "0");
  applyFormatToolbarPreference();
}

function applyPresenceControlsPreference() {
  const open = localStorage.getItem("chatroom_presence_open") === "1";
  const panel = el("presenceControls");
  const button = el("presenceToggleButton");
  panel.classList.toggle("hidden", !open);
  button.classList.toggle("is-active", open);
  button.textContent = open ? "HIDE STATUS" : "MY STATUS";
}

function togglePresenceControls() {
  const nextOpen = el("presenceControls").classList.contains("hidden");
  localStorage.setItem("chatroom_presence_open", nextOpen ? "1" : "0");
  applyPresenceControlsPreference();
  initializeEffectsDock();
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
  el("staffToolsButton").addEventListener("click", toggleStaffToolsMenu);
  el("staffToolsCloseButton").addEventListener("click", closeStaffToolsMenu);
  el("staffToolsMenu").addEventListener("click", (event) => {
    const control = event.target.closest("button");
    if (control && control.id !== "staffToolsCloseButton") setTimeout(closeStaffToolsMenu, 0);
  });
  el("clearScreenButton").addEventListener("click", clearMyScreen);
  el("clearRoomButton").addEventListener("click", clearRoomHistory);
  el("adminModeratorButton").addEventListener("click", manageModerator);
  el("adminConfettiButton").addEventListener("click", launchConfetti);
  el("effectsDialogCancel").addEventListener("click", toggleEffectsDock);
  el("effectsMenu").querySelectorAll("[data-room-effect]").forEach((button) => button.addEventListener("click", () => sendAdminEffect(button.dataset.roomEffect)));
  el("stopEffectsButton").addEventListener("click", stopRoomEffectsForEveryone);
  el("adminIdentityButton").addEventListener("click", openAdminIdentity);
  el("staffNameColorButton").addEventListener("click", () => promptStaffNameColor());
  el("adminAnnouncementButton").addEventListener("click", sendAdminAnnouncement);
  el("startGameButton").addEventListener("click", openGameSetup);
  el("adminBannerButton").addEventListener("click", setRoomBanner);
  el("adminSlowModeButton").addEventListener("click", setSlowMode);
  el("adminLockRoomButton").addEventListener("click", toggleRoomLock);
  el("adminKickButton").addEventListener("click", kickUserFromToolbar);
  el("updatePresenceButton").addEventListener("click", updatePresence);
  el("presenceToggleButton").addEventListener("click", togglePresenceControls);
  el("timestampsButton").addEventListener("click", toggleTimestamps);
  el("searchChatButton").addEventListener("click", toggleSearch);
  el("formatToggleButton").addEventListener("click", toggleFormatToolbar);
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

  window.addEventListener("drk:rps-challenge", (event) => {
    const username = event.detail?.username;
    if (username) sendSocket({ type: "rps_challenge", username });
  });

  window.addEventListener("drk:admin-kick", (event) => {
    const username = event.detail?.username;
    if (username) sendSocket({ type: "admin_kick", username });
  });

  window.addEventListener("drk:preview-entrance", (event) => {
    renderEntrance(event.detail?.username || state.currentUser?.username || "", event.detail?.entrance || {}, { preview: true });
  });

  window.addEventListener("drk:trigger-entrance", (event) => {
    if (!isAdmin()) return;
    const username = event.detail?.username;
    if (username) sendSocket({ type: "admin_trigger_entrance", username });
  });

  window.addEventListener("drk:entrance-saved", (event) => {
    const username=String(event.detail?.username||state.currentUser?.username||"").trim();
    if(username) sendSocket({type:"sync_entrance",username});
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
  applyFormatToolbarPreference();
  applyPresenceControlsPreference();
  initializeEffectsDock();
}
