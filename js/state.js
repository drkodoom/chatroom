export const state = {
  currentUser: null,
  activationToken: null,
  chatSocket: null,
  chatIntentionalClose: false,
  chatReconnectTimer: null,
  chatHeartbeatTimer: null,
  chatReconnectAttempts: 0,
  latestPresence: [],
  selectedMemberId: null
};

export function getToken() {
  return localStorage.getItem("chatroom_token");
}

export function saveSession(token, user) {
  localStorage.setItem("chatroom_token", token);
  localStorage.setItem("chatroom_user", JSON.stringify(user));
  state.currentUser = user;
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("chatroom_user"));
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem("chatroom_token");
  localStorage.removeItem("chatroom_user");
  state.currentUser = null;
}
