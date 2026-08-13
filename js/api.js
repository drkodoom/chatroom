import { API } from "./config.js";
import { getToken } from "./state.js";

export async function apiFetch(path, options = {}, auth = false) {
  const headers = new Headers(options.headers || {});

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (auth) {
    const token = getToken();
    if (!token) throw new Error("NO_SESSION");
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(API + path, { ...options, headers });
  let data = {};

  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: "Invalid server response." };
  }

  return { response, data };
}
