export const state = {
  currentUser: null,
  activationToken: null,
  chatSocket: null,
  chatIntentionalClose: false,
  chatReconnectTimer: null,
  chatHeartbeatTimer: null,
  chatReconnectAttempts: 0,
  latestPresence: [],
  selectedMemberId: null,
  selectedMemberUsername: null,
  messages: [],
  profiles: {},
  roomSettings: {
    pinnedMessageIds: [],
    slowModeSeconds: 0,
    locked: false,
    banner: "",
    modUsername: null,
    roomTheme: null
  },
  game: null,
  werewolfSecret: null,
  adminIdentity: { displayName: null, hideAdminBadge: false },
  replyingTo: null,
  draftFormat: {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    color: null,
    size: "normal"
  },
  typingUsers: new Set(),
  typingTimer: null,
  typingSent: false,
  unreadCount: 0,
  timestampsEnabled: localStorage.getItem("chatroom_timestamps") === "1",
  searchQuery: ""
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
