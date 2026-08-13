import { APP_VERSION } from "./config.js?v=0.13.3";
import { state } from "./state.js?v=0.13.3";
import {
  loginUser,
  restoreSession,
  logoutUser,
  submitAccessRequest,
  submitNameChangeRequest,
  getMyNameChangeStatus,
  getActivationInfo,
  activateAccount
} from "./auth.js?v=0.13.3";
import {
  initAdminUI,
  loadMembers,
  loadPendingRequests,
  loadNameChangeRequests,
  closeMemberDialog
} from "./admin.js?v=0.13.3";
import {
  initChatUI,
  enterChatroom,
  closeChatSocket
} from "./chat.js?v=0.13.3";
import { initThemeSystem } from "./themes.js?v=0.13.3";

const el = (id) => document.getElementById(id);

const screens = {
  login: el("loginScreen"),
  request: el("requestScreen"),
  submitted: el("submittedScreen"),
  activation: el("activationScreen"),
  admin: el("adminScreen"),
  member: el("memberScreen"),
  namechange: el("nameChangeScreen"),
  chat: el("chatScreen")
};

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function routeLoggedInUser(user) {
  state.currentUser = user;

  if (user?.role === "admin") {
    el("adminWelcome").textContent = `Logged in as ${user.username} (administrator)`;
    showScreen("admin");
    loadPendingRequests();
    loadNameChangeRequests();
    loadMembers();
    return;
  }

  el("memberWelcome").textContent = `Welcome, ${user?.username || "member"}.`;
  showScreen("member");
}

async function handleLogin(event) {
  event.preventDefault();
  const message = el("loginMessage");
  message.className = "message";
  message.textContent = "Connecting...";

  const login = el("login").value.trim();
  const password = el("password").value;

  try {
    const { response, data } = await loginUser(login, password);

    if (!response.ok || !data.ok) {
      message.className = "message error";
      message.textContent = data.error || "Login failed.";
      return;
    }

    message.className = "message success";
    message.textContent = `ACCESS GRANTED. Welcome, ${data.user.username}.`;
    setTimeout(() => routeLoggedInUser(data.user), 120);
  } catch (error) {
    console.error(error);
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  }
}

async function handleRequest(event) {
  event.preventDefault();
  const button = el("submitRequestButton");
  const message = el("requestMessage");
  button.disabled = true;
  message.className = "message";
  message.textContent = "Submitting request...";

  const payload = {
    real_name: el("realName").value.trim(),
    desired_username: el("desiredUsername").value.trim(),
    email: el("requestEmail").value.trim(),
    how_known: el("howKnown").value.trim()
  };

  try {
    const { response, data } = await submitAccessRequest(payload);

    if (!response.ok || !data.ok) {
      message.className = "message error";
      message.textContent = data.error || "Request failed.";
      return;
    }

    event.target.reset();
    showScreen("submitted");
  } catch (error) {
    console.error(error);
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  } finally {
    button.disabled = false;
  }
}

async function openNameChangeScreen() {
  if (!state.currentUser) return;
  el("currentScreenName").textContent = state.currentUser.username;
  el("requestedScreenName").value = "";
  el("nameChangeReason").value = "";
  el("nameChangeMessage").textContent = "";
  el("nameChangeStatus").textContent = "Checking your latest request...";
  showScreen("namechange");

  try {
    const { response, data } = await getMyNameChangeStatus();
    if (!response.ok || !data.ok || !data.request) {
      el("nameChangeStatus").textContent = "No previous name-change request found.";
      return;
    }

    const request = data.request;
    el("nameChangeStatus").textContent = `Latest request: ${request.requested_username} — ${String(request.status).toUpperCase()}`;
  } catch {
    el("nameChangeStatus").textContent = "";
  }
}

async function handleNameChangeRequest(event) {
  event.preventDefault();
  const button = el("submitNameChangeButton");
  const message = el("nameChangeMessage");
  button.disabled = true;
  message.className = "message";
  message.textContent = "Submitting name-change request...";

  const payload = {
    requested_username: el("requestedScreenName").value.trim(),
    reason: el("nameChangeReason").value.trim()
  };

  try {
    const { response, data } = await submitNameChangeRequest(payload);

    if (!response.ok || !data.ok) {
      message.className = "message error";
      message.textContent = data.error || "Could not submit name-change request.";
      return;
    }

    message.className = "message success";
    message.textContent = data.message || "Name-change request submitted.";
    el("nameChangeStatus").textContent = `Latest request: ${payload.requested_username} — PENDING`;
    event.target.reset();
  } catch (error) {
    console.error(error);
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  } finally {
    button.disabled = false;
  }
}

async function startActivation(token) {
  state.activationToken = token;
  showScreen("activation");
  const intro = el("activationIntro");
  const form = el("activationForm");
  intro.textContent = "Checking activation link...";
  form.classList.add("hidden");

  try {
    const { response, data } = await getActivationInfo(token);

    if (!response.ok || !data.ok) {
      intro.textContent = data.error || "Invalid activation link.";
      return;
    }

    intro.textContent = `ACCOUNT APPROVED — Screen name: ${data.username}. Choose your password below.`;
    form.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    intro.textContent = "Could not connect to the server.";
  }
}

async function handleActivation(event) {
  event.preventDefault();
  const message = el("activationMessage");
  const button = el("activateButton");
  const password = el("activationPassword").value;
  const confirmation = el("activationPasswordConfirm").value;

  if (password !== confirmation) {
    message.className = "message error";
    message.textContent = "Passwords do not match.";
    return;
  }

  if (password.length < 12 || password.length > 128) {
    message.className = "message error";
    message.textContent = "Password must be between 12 and 128 characters.";
    return;
  }

  button.disabled = true;
  message.className = "message";
  message.textContent = "Activating account...";

  try {
    const { response, data } = await activateAccount(state.activationToken, password);

    if (!response.ok || !data.ok) {
      message.className = "message error";
      message.textContent = data.error || "Activation failed.";
      return;
    }

    message.className = "message success";
    message.textContent = "ACCOUNT ACTIVATED. You may now log in.";
    event.target.reset();
    event.target.classList.add("hidden");
    history.replaceState({}, "", window.location.pathname);
  } catch (error) {
    console.error(error);
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  } finally {
    button.disabled = false;
  }
}

async function doLogout() {
  closeChatSocket();
  closeMemberDialog();
  await logoutUser();
  el("loginForm").reset();
  el("loginMessage").textContent = "";
  showScreen("login");
}

function leaveChatroom() {
  closeChatSocket();
  routeLoggedInUser(state.currentUser);
}

function initNavigation() {
  el("loginForm").addEventListener("submit", handleLogin);
  el("requestForm").addEventListener("submit", handleRequest);
  el("activationForm").addEventListener("submit", handleActivation);
  el("nameChangeForm").addEventListener("submit", handleNameChangeRequest);

  el("requestButton").addEventListener("click", () => {
    el("requestMessage").textContent = "";
    showScreen("request");
  });
  el("backButton").addEventListener("click", () => showScreen("login"));
  el("returnLoginButton").addEventListener("click", () => showScreen("login"));
  el("activationBackButton").addEventListener("click", () => {
    history.replaceState({}, "", window.location.pathname);
    showScreen("login");
  });

  el("memberNameChangeButton").addEventListener("click", openNameChangeScreen);
  el("nameChangeBackButton").addEventListener("click", () => routeLoggedInUser(state.currentUser));

  el("adminEnterChatButton").addEventListener("click", () => enterChatroom(showScreen));
  el("memberEnterChatButton").addEventListener("click", () => enterChatroom(showScreen));
  el("leaveChatButton").addEventListener("click", leaveChatroom);

  ["adminLogoutButton", "memberLogoutButton", "chatLogoutButton"].forEach((id) => {
    el(id).addEventListener("click", doLogout);
  });

  window.addEventListener("drk:kicked", () => {
    closeChatSocket();
    routeLoggedInUser(state.currentUser);
  });
}

async function init() {
  console.log(`DRKODOOM CHATROOM v${APP_VERSION}`);
  initThemeSystem();
  initAdminUI();
  initChatUI();
  initNavigation();

  const params = new URLSearchParams(window.location.search);
  const activation = params.get("activate");

  if (activation) {
    await startActivation(activation);
    return;
  }

  const restored = await restoreSession();
  if (restored.ok) {
    routeLoggedInUser(restored.user);
  } else {
    showScreen("login");
  }
}

init();
