import { LIVE_HOST, ROOM_NAME } from "./config.js?v=0.17.3";
import { apiFetch } from "./api.js?v=0.17.3";
import { getToken, state } from "./state.js?v=0.17.3";
import { openMemberByUsername } from "./admin.js?v=0.17.3";
import { openProfileByUsername } from "./profile.js?v=0.17.3";
import { syncRoomTheme, getClientName } from "./themes.js?v=0.17.3";

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

function stopEntranceLocal({ keepPending = false } = {}) {
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

function entranceParticle(layer, side, color, height, style, intensity, width = 1, sourceOffset = 0) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const burst = document.createElement("div");
  burst.className = `entrance-pyro-burst entrance-pyro-${style} entrance-pyro-${side}`;
  burst.style.setProperty("--pyro-color", color);
  burst.style.setProperty("--pyro-height", `${Math.round(height * 100)}vh`);
  burst.style.setProperty("--pyro-intensity", String(intensity));
  burst.style.setProperty("--pyro-width", String(width));
  if (side === "left") burst.style.left = `${5.5 + sourceOffset}%`;
  if (side === "right") burst.style.right = `${5.5 + sourceOffset}%`;
  if (side === "center") burst.style.left = "50%";

  const flash = document.createElement("i");
  flash.className = "entrance-pyro-flash";
  burst.appendChild(flash);
  const core = document.createElement("i");
  core.className = "entrance-pyro-core";
  burst.appendChild(core);

  const baseCount = style === "bursts" || style === "center_blast" ? 38 : style === "wide_fountain" || style === "fan" ? 34 : style === "fountain" ? 28 : 22;
  const particleCount = reduced ? 8 : baseCount + intensity * 7;
  for (let i = 0; i < particleCount; i += 1) {
    const spark = document.createElement("i");
    spark.className = "entrance-pyro-spark";
    let baseSpread = 42;
    if (style === "bursts") baseSpread = 115;
    if (style === "fountain") baseSpread = 58;
    if (style === "wide_fountain") baseSpread = 86;
    if (style === "fan") baseSpread = 135;
    if (style === "center_blast") baseSpread = 150;
    const spread = Math.min(175, baseSpread * Math.max(.5, width));
    const angle = (-90 + (Math.random() - .5) * spread) * Math.PI / 180;
    const distanceFactor = ["bursts","center_blast"].includes(style) ? (.45 + Math.random() * .55) : (.55 + Math.random() * .45);
    const distance = Math.max(90, window.innerHeight * height * distanceFactor);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const drift = (Math.random() - .5) * ((style === "bursts" || style === "center_blast") ? 120 : 50) * Math.max(.7, width);
    const size = 2 + Math.random() * (intensity + 2.5);
    const duration = .58 + Math.random() * .58;
    const delay = Math.random() * .08;
    spark.style.setProperty("--spark-x", `${(dx + drift).toFixed(1)}px`);
    spark.style.setProperty("--spark-y", `${dy.toFixed(1)}px`);
    spark.style.setProperty("--spark-size", `${size.toFixed(1)}px`);
    spark.style.setProperty("--spark-duration", `${duration.toFixed(2)}s`);
    spark.style.setProperty("--spark-delay", `${delay.toFixed(2)}s`);
    burst.appendChild(spark);
  }

  const cometCount = reduced ? 1 : Math.max(2, intensity + (["fountain","wide_fountain","fan"].includes(style) ? 3 : 0));
  for (let i = 0; i < cometCount; i += 1) {
    const comet = document.createElement("i");
    comet.className = "entrance-pyro-comet";
    comet.style.setProperty("--comet-offset", `${(i - (cometCount - 1) / 2) * 11 * Math.max(.7,width)}px`);
    comet.style.setProperty("--comet-tilt", `${(Math.random() - .5) * (["bursts","fan","center_blast"].includes(style) ? 28 : 12)}deg`);
    comet.style.setProperty("--comet-duration", `${(.5 + Math.random() * .25).toFixed(2)}s`);
    burst.appendChild(comet);
  }

  layer.appendChild(burst);
  setTimeout(() => burst.remove(), 1500);
}

function entrancePyroRain(layer, color, intensity, width = 1, curtain = false) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const field = document.createElement("div");
  field.className = `entrance-pyro-rain${curtain ? " entrance-pyro-curtain" : ""}`;
  field.style.setProperty("--pyro-color", color || "#FFFFFF");
  const span = Math.min(100, 38 + Math.max(.5, width) * 30);
  const start = (100 - span) / 2;
  const count = reduced ? 14 : Math.round((curtain ? 70 : 48) * Math.max(.65, width) + intensity * 12);
  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement("i");
    spark.className = "entrance-pyro-rain-spark";
    spark.style.setProperty("--rain-x", `${(start + Math.random() * span).toFixed(2)}%`);
    spark.style.setProperty("--rain-delay", `${(Math.random() * .42).toFixed(2)}s`);
    spark.style.setProperty("--rain-duration", `${(.55 + Math.random() * .65).toFixed(2)}s`);
    spark.style.setProperty("--rain-length", `${Math.round((curtain ? 35 : 18) + Math.random() * (curtain ? 80 : 55))}px`);
    spark.style.setProperty("--rain-drift", `${((Math.random() - .5) * 80).toFixed(1)}px`);
    field.appendChild(spark);
  }
  layer.appendChild(field);
  setTimeout(() => field.remove(), 1800);
}

function applyEntranceScreenFilter(filter) {
  const app = el("appWindow");
  if (!app || !filter || filter.mode === "none" || Number(filter.intensity || 0) <= 0) return;
  if (entrancePreviousAppFilter === null) entrancePreviousAppFilter = app.style.filter || "";
  const i = Math.max(0, Math.min(1, Number(filter.intensity || .55)));
  const mode = String(filter.mode || "none");
  const map = {
    cinematic: `contrast(${1 + .22*i}) saturate(${1 + .18*i}) brightness(${1 - .08*i})`,
    cool: `sepia(${.15*i}) saturate(${1 + .65*i}) hue-rotate(${185*i}deg) brightness(${1 - .05*i})`,
    warm: `sepia(${.45*i}) saturate(${1 + .6*i}) hue-rotate(${-15*i}deg)`,
    red: `sepia(${.55*i}) saturate(${1 + 1.7*i}) hue-rotate(${-35*i}deg)`,
    blue: `sepia(${.35*i}) saturate(${1 + 1.6*i}) hue-rotate(${170*i}deg)`,
    purple: `sepia(${.38*i}) saturate(${1 + 1.7*i}) hue-rotate(${225*i}deg)`,
    green: `sepia(${.35*i}) saturate(${1 + 1.7*i}) hue-rotate(${78*i}deg)`,
    gold: `sepia(${.65*i}) saturate(${1 + 1.25*i}) hue-rotate(${-8*i}deg)`,
    mono: `grayscale(${i}) contrast(${1 + .25*i}) brightness(${1 - .05*i})`
  };
  app.style.filter = map[mode] || "";
}

function addEntranceAtmosphere(layer, atmosphere) {
  if (!atmosphere || atmosphere.type === "none") return;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const total = reduced ? 6 : Math.max(8, Math.round(28 * Number(atmosphere.density || .45)));
  for (let i = 0; i < total; i += 1) {
    const puff = document.createElement("i");
    puff.className = `entrance-atmosphere entrance-${atmosphere.type}`;
    puff.style.setProperty("--fog-color", atmosphere.color || "#FFFFFF");
    puff.style.setProperty("--fog-x", `${Math.random() * 100}%`);
    puff.style.setProperty("--fog-delay", `${(Math.random() * 1.8).toFixed(2)}s`);
    puff.style.setProperty("--fog-size", `${Math.round(80 + Math.random() * 150)}px`);
    layer.appendChild(puff);
  }
}

function addEntranceRig(layer, lighting) {
  if (lighting?.enabled === false) return;
  const rig = document.createElement("div");
  rig.className = "entrance-rig";
  const truss = document.createElement("div");
  truss.className = "entrance-truss";
  rig.appendChild(truss);
  for (let i = 0; i < 6; i += 1) {
    const fixture = document.createElement("div");
    fixture.className = "entrance-light-fixture";
    fixture.style.setProperty("--fixture-i", String(i));
    fixture.style.setProperty("--beam-color", i % 2 ? (lighting.secondaryColor || "#FFFFFF") : (lighting.primaryColor || "#FFFFFF"));
    const yoke = document.createElement("i");
    yoke.className = "entrance-light-yoke";
    const head = document.createElement("i");
    head.className = "entrance-light-head";
    const lens = document.createElement("i");
    lens.className = "entrance-light-lens";
    const beam = document.createElement("i");
    beam.className = "entrance-light-beam";
    head.append(lens, beam);
    fixture.append(yoke, head);
    rig.appendChild(fixture);
  }
  layer.appendChild(rig);
}

function addPhoneLights(layer) {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const field = document.createElement("div");
  field.className = "entrance-phone-lights";
  const count = reduced ? 36 : 110;
  for (let i = 0; i < count; i += 1) {
    const light = document.createElement("i");
    light.className = "entrance-phone-light";
    light.style.setProperty("--phone-x", `${2 + Math.random() * 96}%`);
    light.style.setProperty("--phone-y", `${30 + Math.random() * 65}%`);
    light.style.setProperty("--phone-delay", `${(Math.random() * 2.4).toFixed(2)}s`);
    light.style.setProperty("--phone-scale", `${(.55 + Math.random() * 1.2).toFixed(2)}`);
    field.appendChild(light);
  }
  layer.appendChild(field);
}

function addLightningStrike(layer) {
  const wrapper = document.createElement("div");
  wrapper.className = "entrance-lightning-wrap";
  wrapper.innerHTML = `<div class="entrance-lightning-flash"></div><svg class="entrance-lightning-bolt" viewBox="0 0 120 520" aria-hidden="true"><polyline points="72,0 44,125 70,125 35,255 61,255 26,390 57,390 42,520"/></svg>`;
  layer.appendChild(wrapper);
  requestAnimationFrame(() => wrapper.classList.add("strike"));
  setTimeout(() => wrapper.remove(), 900);
}

function addEntranceFilter(layer, filter) {
  if (!filter || filter.mode === "none" || Number(filter.intensity || 0) <= 0) return;
  const overlay = document.createElement("div");
  overlay.className = `entrance-color-filter entrance-filter-${filter.mode}`;
  overlay.style.setProperty("--filter-intensity", String(Math.max(0, Math.min(1, Number(filter.intensity || .55)))));
  layer.appendChild(overlay);
}

function addEntranceNameplate(layer, username, tier, config) {
  const plate = config.nameplate || {};
  if (plate.enabled === false) return null;
  const nameplate = document.createElement("div");
  nameplate.className = `entrance-nameplate entrance-nameplate-${plate.style || "arena"}${plate.glow ? " glow" : ""}`;
  const name = document.createElement("strong");
  name.textContent = config.wrestlingName || username || "ENTRANCE";
  const sub = document.createElement("span");
  sub.textContent = config.subtitle || (tier === "champion" ? "CHAMPION" : username || "");
  nameplate.append(name, sub);
  layer.appendChild(nameplate);
  requestAnimationFrame(() => nameplate.classList.add("show"));
  setTimeout(() => nameplate.classList.add("leaving"), 2800);
  setTimeout(() => nameplate.remove(), 3500);
  return nameplate;
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
  const tier = String(entrance?.tier || "none");
  const config = entrance?.config || {};
  if (tier === "none" || !config.enabled) {
    if (preview) addSystemLine("This entrance is disabled or has no Entrance Status.");
    return;
  }
  stopRoomEffectsLocal();
  stopEntranceLocal();
  const layer = el("entranceLayer");
  if (!layer) return;
  const pyro = config.pyro || {};
  const lighting = config.lighting || {};
  const filter = config.filter || {};
  const duration = Math.max(2, Math.min(10, Number(pyro.duration || 4)));
  const frequency = Math.max(.35, Math.min(2.5, Number(pyro.frequency || .8)));
  const height = Math.max(.3, Math.min(.95, Number(pyro.height || .72)));
  const intensity = Math.max(1, Math.min(3, Number(pyro.intensity || 2)));
  const width = Math.max(.5, Math.min(2.4, Number(pyro.width || 1)));
  const primary = lighting.primaryColor || "#FFFFFF";
  const secondary = lighting.secondaryColor || primary;

  layer.className = `entrance-layer active entrance-tier-${tier} entrance-motion-${lighting.motion || "none"}${lighting.blackout ? " entrance-blackout" : ""}`;
  layer.style.setProperty("--entrance-primary", primary);
  layer.style.setProperty("--entrance-secondary", secondary);
  layer.style.setProperty("--entrance-speed", `${Math.max(.4, Math.min(2.2, Number(lighting.speed || 1)))}s`);

  const blackout = document.createElement("div");
  blackout.className = "entrance-blackout-screen";
  if (lighting.blackout) layer.appendChild(blackout);
  addEntranceFilter(layer, filter);
  applyEntranceScreenFilter(filter);

  setTimeout(() => addEntranceRig(layer, lighting), 180);
  if (lighting.phoneLights) setTimeout(() => addPhoneLights(layer), 500);
  setTimeout(() => addEntranceAtmosphere(layer, config.atmosphere || {}), 450);
  addEntranceNameplate(layer, username, tier, config);
  if (lighting.lightning) setTimeout(() => addLightningStrike(layer), 1350);

  if (pyro.enabled !== false) {
    const fireBurst = () => {
      const style = pyro.style || "jets";
      if (style === "rain" || style === "curtain") {
        entrancePyroRain(layer, pyro.color || "#FFFFFF", intensity, width, style === "curtain");
        return;
      }
      if (style === "center_blast") {
        for (let n = 0; n < intensity; n += 1) setTimeout(() => entranceParticle(layer, "center", pyro.color || "#FFFFFF", height, style, intensity, width), n * 85);
        return;
      }
      const offsets = style === "wide_fountain" ? [0, 10, 20] : style === "fan" ? [0, 14] : [0];
      offsets.forEach((offset, idx) => {
        for (let n = 0; n < intensity; n += 1) {
          setTimeout(() => entranceParticle(layer, "left", pyro.color || "#FFFFFF", height, style, intensity, width, offset), n * 85 + idx * 55);
          setTimeout(() => entranceParticle(layer, "right", pyro.color || "#FFFFFF", height, style, intensity, width, offset), n * 85 + idx * 55);
        }
      });
    };
    setTimeout(fireBurst, 900);
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      setTimeout(() => { entranceBurstTimer = setInterval(fireBurst, frequency * 1000); }, 900);
    }
  }

  registerEntranceSpotlight(username, config, { preview });
  const stageDuration = Math.max(5, pyro.enabled === false ? 5 : duration);
  entranceTimer = setTimeout(() => stopEntranceLocal({ keepPending: !preview && Boolean(config.lighting?.spotlight) }), stageDuration * 1000);
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
