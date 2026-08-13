import { apiFetch } from "./api.js";
import { clearSession, getToken, saveSession, state } from "./state.js";

export async function loginUser(login, password) {
  const { response, data } = await apiFetch("/login", {
    method: "POST",
    body: JSON.stringify({ login, password })
  });

  if (response.ok && data.ok) {
    saveSession(data.token, data.user);
  }

  return { response, data };
}

export async function restoreSession() {
  if (!getToken()) return { ok: false };

  try {
    const { response, data } = await apiFetch("/me", { method: "GET" }, true);

    if (!response.ok || !data.ok) {
      clearSession();
      return { ok: false };
    }

    state.currentUser = data.user;
    localStorage.setItem("chatroom_user", JSON.stringify(data.user));
    return { ok: true, user: data.user };
  } catch {
    clearSession();
    return { ok: false };
  }
}

export async function logoutUser() {
  try {
    if (getToken()) {
      await apiFetch("/logout", { method: "POST" }, true);
    }
  } catch {
    // Local logout still succeeds.
  } finally {
    clearSession();
  }
}

export async function submitAccessRequest(payload) {
  return apiFetch("/apply", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getActivationInfo(token) {
  return apiFetch(`/activation-info?token=${encodeURIComponent(token)}`, { method: "GET" });
}

export async function activateAccount(token, password) {
  return apiFetch("/activate", {
    method: "POST",
    body: JSON.stringify({ token, password })
  });
}
