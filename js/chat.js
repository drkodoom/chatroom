import { LIVE_HOST, ROOM_NAME } from "./config.js";
import { apiFetch } from "./api.js";
import { getToken, state } from "./state.js";
import { openMemberByUsername } from "./admin.js";

const el = (id) => document.getElementById(id);

function scrollChatToBottom() {
  const messages = el("chatMessages");
  messages.scrollTop = messages.scrollHeight;
}

export function addSystemLine(text) {
  const line = document.createElement("div");
  line.className = "chat-line system-line";
  line.textContent = `*** ${text} ***`;
  el("chatMessages").appendChild(line);
  scrollChatToBottom();
}

function addChatLine(message) {
  const line = document.createElement("div");
  line.className = "chat-line";

  const username = document.createElement("span");
  username.className = "chat-user";
  username.textContent = `${message.user}: `;

  const content = document.createElement("span");
  content.textContent = message.content;

  line.append(username, content);
  el("chatMessages").appendChild(line);
  scrollChatToBottom();
}

function renderOnlineUsers(users) {
  state.latestPresence = Array.isArray(users) ? users : [];
  const container = el("onlineUsers");
  container.innerHTML = "";

  if (!state.latestPresence.length) {
    container.innerHTML = '<div class="small">Nobody online.</div>';
    return;
  }

  state.latestPresence.forEach((username) => {
    const row = document.createElement("div");
    row.className = "chat-user-card";

    const dot = document.createElement("span");
    dot.className = "online-dot";
    row.appendChild(dot);

    if (state.currentUser?.role === "admin") {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "online-user-button";
      button.textContent = username;
      button.title = `View information for ${username}`;
      button.addEventListener("click", () => openMemberByUsername(username));
      row.appendChild(button);
    } else {
      const text = document.createElement("span");
      text.textContent = username;
      row.appendChild(text);
    }

    container.appendChild(row);
  });
}

function handleSystemEvent(data) {
  if (!data.username) return;
  if (data.event === "join") addSystemLine(`${data.username} has entered the room`);
  if (data.event === "leave") addSystemLine(`${data.username} has left the room`);
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
  } catch {
    return;
  }

  state.chatIntentionalClose = false;
  state.chatReconnectAttempts = 0;
  el("chatMessages").innerHTML = "";
  el("clearRoomButton").classList.toggle("hidden", state.currentUser?.role !== "admin");
  showScreen("chat");
  addSystemLine(`#${ROOM_NAME} — connecting`);
  connectChatSocket();
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
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === "pong") return;

    if (data.type === "all" && Array.isArray(data.messages)) {
      el("chatMessages").innerHTML = "";
      data.messages.forEach(addChatLine);
      addSystemLine(`You have entered #${ROOM_NAME}`);
      return;
    }

    if (data.type === "presence") {
      renderOnlineUsers(data.users);
      return;
    }

    if (data.type === "system") {
      handleSystemEvent(data);
      return;
    }

    if (data.type === "add") {
      addChatLine(data);
      return;
    }

    if (data.type === "clear_room") {
      el("chatMessages").innerHTML = "";
      addSystemLine(`Room history was cleared by ${data.username || "an administrator"}`);
      return;
    }

    if (data.type === "error") {
      addSystemLine(data.message || "Server error");
    }
  });

  socket.addEventListener("close", (event) => {
    if (socket !== state.chatSocket) return;

    stopChatHeartbeat();
    el("chatInput").disabled = true;
    el("chatSendButton").disabled = true;

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

  socket.addEventListener("error", (error) => {
    console.error("WebSocket error:", error);
  });
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
    if (state.chatSocket?.readyState === WebSocket.OPEN) {
      state.chatSocket.send(JSON.stringify({ type: "ping", time: Date.now() }));
    }
  }, 20000);
}

function stopChatHeartbeat() {
  if (state.chatHeartbeatTimer) {
    clearInterval(state.chatHeartbeatTimer);
    state.chatHeartbeatTimer = null;
  }
}

export function closeChatSocket() {
  state.chatIntentionalClose = true;
  clearTimeout(state.chatReconnectTimer);
  state.chatReconnectTimer = null;
  stopChatHeartbeat();

  const socket = state.chatSocket;
  state.chatSocket = null;

  if (socket) {
    try {
      socket.close(1000, "User left room");
    } catch {
      // Ignore.
    }
  }

  el("chatInput").disabled = true;
  el("chatSendButton").disabled = true;
  el("chatConnectionStatus").className = "disconnected";
  el("chatConnectionStatus").textContent = "Disconnected";
  renderOnlineUsers([]);
}

function sendMessage(event) {
  event.preventDefault();
  if (!state.chatSocket || state.chatSocket.readyState !== WebSocket.OPEN) return;

  const input = el("chatInput");
  const content = input.value.trim();
  if (!content) return;

  state.chatSocket.send(JSON.stringify({
    type: "add",
    id: crypto.randomUUID(),
    content
  }));

  input.value = "";
  input.focus();
}

function clearMyScreen() {
  el("chatMessages").innerHTML = "";
  addSystemLine("Your screen was cleared");
}

function clearRoomHistory() {
  if (state.currentUser?.role !== "admin") return;

  if (!state.chatSocket || state.chatSocket.readyState !== WebSocket.OPEN) {
    alert("You must be connected before clearing the room history.");
    return;
  }

  if (!confirm(`CLEAR ROOM HISTORY?\n\nThis permanently deletes all stored messages in #${ROOM_NAME} for EVERYONE.\n\nThis cannot be undone.`)) return;
  state.chatSocket.send(JSON.stringify({ type: "clear_room" }));
}

export function initChatUI() {
  el("chatForm").addEventListener("submit", sendMessage);
  el("clearScreenButton").addEventListener("click", clearMyScreen);
  el("clearRoomButton").addEventListener("click", clearRoomHistory);
}
