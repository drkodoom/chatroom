import { apiFetch } from "./api.js";
import { state } from "./state.js";

const el = (id) => document.getElementById(id);

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusPill(status) {
  const span = document.createElement("span");
  span.className = `status-pill ${status || ""}`;
  span.textContent = status || "unknown";
  return span;
}

export async function loadPendingRequests() {
  const message = el("adminMessage");
  const list = el("requestList");
  message.className = "message";
  message.textContent = "Loading pending requests...";
  list.innerHTML = "";

  try {
    const { response, data } = await apiFetch("/admin/requests", { method: "GET" }, true);

    if (!response.ok || !data.ok) {
      message.className = "message error";
      message.textContent = data.error || "Unable to load requests.";
      return;
    }

    const requests = Array.isArray(data.requests) ? data.requests : [];
    el("pendingCountBadge").textContent = String(requests.length);
    message.textContent = "";

    if (!requests.length) {
      list.innerHTML = '<div class="empty-state">No pending access requests.</div>';
      return;
    }

    requests.forEach((item) => list.appendChild(renderRequestCard(item)));
  } catch (error) {
    console.error(error);
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  }
}

function renderRequestCard(item) {
  const card = document.createElement("article");
  card.className = "request-card";

  const title = document.createElement("h3");
  title.textContent = `${item.real_name} (${item.desired_username})`;

  const email = document.createElement("p");
  email.textContent = `Email: ${item.email}`;

  const reason = document.createElement("p");
  reason.textContent = `How they know you: ${item.how_known}`;

  const meta = document.createElement("p");
  meta.className = "request-meta";
  meta.textContent = `Submitted: ${formatDate(item.created_at)}`;

  const actions = document.createElement("div");
  actions.className = "request-actions";

  const approve = document.createElement("button");
  approve.type = "button";
  approve.textContent = "APPROVE";
  approve.addEventListener("click", () => approveRequest(item, card, approve));

  const deny = document.createElement("button");
  deny.type = "button";
  deny.textContent = "DENY";
  deny.addEventListener("click", () => denyRequest(item, card, deny));

  actions.append(approve, deny);
  card.append(title, email, reason, meta, actions);
  return card;
}

async function approveRequest(item, card, button) {
  button.disabled = true;
  const message = el("adminMessage");

  try {
    const { response, data } = await apiFetch(`/admin/requests/${item.id}/approve`, { method: "POST" }, true);

    if (!response.ok || !data.ok) {
      button.disabled = false;
      message.className = "message error";
      message.textContent = data.error || "Approval failed.";
      return;
    }

    card.innerHTML = "";
    const heading = document.createElement("h3");
    heading.textContent = `${item.desired_username} APPROVED`;

    const text = document.createElement("p");
    text.textContent = "Send this one-time activation link to your friend:";

    const link = document.createElement("input");
    link.readOnly = true;
    link.value = data.activation_url;

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "COPY ACTIVATION LINK";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(data.activation_url);
        copy.textContent = "COPIED!";
      } catch {
        link.focus();
        link.select();
        copy.textContent = "LINK SELECTED";
      }
      setTimeout(() => { copy.textContent = "COPY ACTIVATION LINK"; }, 1500);
    });

    card.append(heading, text, link, copy);
    message.className = "message success";
    message.textContent = `Approved ${item.desired_username}.`;
    loadMembers();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  }
}

async function denyRequest(item, card, button) {
  if (!confirm(`Deny access for ${item.desired_username}?`)) return;
  button.disabled = true;
  const message = el("adminMessage");

  try {
    const { response, data } = await apiFetch(`/admin/requests/${item.id}/deny`, { method: "POST" }, true);

    if (!response.ok || !data.ok) {
      button.disabled = false;
      message.className = "message error";
      message.textContent = data.error || "Denial failed.";
      return;
    }

    card.remove();
    message.className = "message success";
    message.textContent = `Denied ${item.desired_username}.`;
    loadPendingRequests();
  } catch (error) {
    console.error(error);
    button.disabled = false;
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  }
}

export async function loadMembers() {
  const body = el("memberTableBody");
  const message = el("adminMessage");
  body.innerHTML = '<tr><td colspan="4">Loading members...</td></tr>';

  try {
    const { response, data } = await apiFetch("/admin/members", { method: "GET" }, true);

    if (!response.ok || !data.ok) {
      body.innerHTML = "";
      message.className = "message error";
      message.textContent = data.error || "Unable to load members.";
      return;
    }

    const members = Array.isArray(data.members) ? data.members : [];
    el("memberCountBadge").textContent = String(members.length);
    body.innerHTML = "";

    if (!members.length) {
      body.innerHTML = '<tr><td colspan="4">No members.</td></tr>';
      return;
    }

    members.forEach((member) => {
      const tr = document.createElement("tr");

      const nameCell = document.createElement("td");
      const nameButton = document.createElement("button");
      nameButton.type = "button";
      nameButton.className = "member-link";
      nameButton.textContent = member.username;
      nameButton.addEventListener("click", () => openMemberDetails(member.id));
      nameCell.appendChild(nameButton);

      const statusCell = document.createElement("td");
      statusCell.appendChild(statusPill(member.status));

      const roleCell = document.createElement("td");
      roleCell.textContent = member.role;

      const joinedCell = document.createElement("td");
      joinedCell.textContent = formatDate(member.created_at);

      tr.append(nameCell, statusCell, roleCell, joinedCell);
      body.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
    body.innerHTML = "";
    message.className = "message error";
    message.textContent = "Could not connect to the server.";
  }
}

export async function openMemberByUsername(username) {
  if (state.currentUser?.role !== "admin" || !username) return;

  try {
    const { response, data } = await apiFetch(`/admin/member-by-username?username=${encodeURIComponent(username)}`, { method: "GET" }, true);
    if (!response.ok || !data.ok || !data.member?.id) {
      alert(data.error || "Member not found.");
      return;
    }
    await openMemberDetails(data.member.id, data.member);
  } catch (error) {
    console.error(error);
    alert("Could not load member information.");
  }
}

export async function openMemberDetails(memberId, prefetched = null) {
  if (state.currentUser?.role !== "admin") return;

  state.selectedMemberId = Number(memberId);
  el("memberOverlay").classList.remove("hidden");
  el("memberDetailLoading").classList.remove("hidden");
  el("memberDetailContent").classList.add("hidden");
  el("memberDetailMessage").textContent = "";

  try {
    let member = prefetched;

    if (!member || !member.real_name) {
      const { response, data } = await apiFetch(`/admin/members/${memberId}`, { method: "GET" }, true);
      if (!response.ok || !data.ok) {
        el("memberDetailLoading").textContent = data.error || "Unable to load member.";
        return;
      }
      member = data.member;
    }

    renderMemberDetails(member);
  } catch (error) {
    console.error(error);
    el("memberDetailLoading").textContent = "Could not load member information.";
  }
}

function renderMemberDetails(member) {
  el("memberDialogTitle").textContent = `${member.username} — Member Information`;
  el("memberDetailLoading").classList.add("hidden");
  const content = el("memberDetailContent");
  content.classList.remove("hidden");
  content.innerHTML = "";

  const dl = document.createElement("dl");
  dl.className = "member-detail-grid";

  const fields = [
    ["Screen name", member.username],
    ["Real name", member.real_name || "—"],
    ["Email", member.email],
    ["Role", member.role],
    ["Status", member.status],
    ["Account created", formatDate(member.created_at)],
    ["Application submitted", formatDate(member.requested_at)],
    ["Application reviewed", formatDate(member.reviewed_at)],
    ["Active sessions", String(member.active_sessions ?? 0)],
    ["Latest session", formatDate(member.last_session_created_at)],
    ["Latest expiry", formatDate(member.latest_session_expires_at)]
  ];

  fields.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value || "—";
    dl.append(dt, dd);
  });

  content.appendChild(dl);

  if (member.how_known) {
    const note = document.createElement("div");
    note.className = "member-detail-note";
    const strong = document.createElement("strong");
    strong.textContent = "How they know you";
    const p = document.createElement("p");
    p.textContent = member.how_known;
    note.append(strong, p);
    content.appendChild(note);
  }

  const isSelf = String(member.username).toLowerCase() === String(state.currentUser?.username || "").toLowerCase();
  const restore = el("memberRestoreButton");
  const suspend = el("memberSuspendButton");
  const ban = el("memberBanButton");
  const revoke = el("memberRevokeSessionsButton");

  restore.classList.toggle("hidden", member.status === "approved");
  suspend.classList.toggle("hidden", isSelf || member.status === "suspended");
  ban.classList.toggle("hidden", isSelf || member.status === "banned");
  revoke.classList.toggle("hidden", isSelf);

  restore.dataset.memberId = member.id;
  suspend.dataset.memberId = member.id;
  ban.dataset.memberId = member.id;
  revoke.dataset.memberId = member.id;
}

async function updateMemberStatus(memberId, status) {
  const message = el("memberDetailMessage");
  message.className = "message";
  message.textContent = `Updating status to ${status}...`;

  const { response, data } = await apiFetch(`/admin/members/${memberId}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  }, true);

  if (!response.ok || !data.ok) {
    message.className = "message error";
    message.textContent = data.error || "Update failed.";
    return;
  }

  message.className = "message success";
  message.textContent = `Member status changed to ${status}.`;
  await openMemberDetails(memberId);
  loadMembers();
}

async function revokeMemberSessions(memberId) {
  if (!confirm("Revoke all active login sessions for this member?")) return;

  const message = el("memberDetailMessage");
  message.className = "message";
  message.textContent = "Revoking sessions...";

  const { response, data } = await apiFetch(`/admin/members/${memberId}/revoke-sessions`, { method: "POST" }, true);

  if (!response.ok || !data.ok) {
    message.className = "message error";
    message.textContent = data.error || "Could not revoke sessions.";
    return;
  }

  message.className = "message success";
  message.textContent = `Revoked ${data.revoked_sessions ?? 0} session(s).`;
  await openMemberDetails(memberId);
  loadMembers();
}

export function closeMemberDialog() {
  state.selectedMemberId = null;
  el("memberOverlay").classList.add("hidden");
}

export function initAdminUI() {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      const tab = button.dataset.adminTab;
      el("adminRequestsPanel").classList.toggle("hidden", tab !== "requests");
      el("adminMembersPanel").classList.toggle("hidden", tab !== "members");
      if (tab === "members") loadMembers();
      if (tab === "requests") loadPendingRequests();
    });
  });

  el("refreshRequestsButton").addEventListener("click", loadPendingRequests);
  el("refreshMembersButton").addEventListener("click", loadMembers);
  el("memberDialogClose").addEventListener("click", closeMemberDialog);
  el("memberOverlay").addEventListener("click", (event) => {
    if (event.target === el("memberOverlay")) closeMemberDialog();
  });

  el("memberRestoreButton").addEventListener("click", (event) => updateMemberStatus(event.currentTarget.dataset.memberId, "approved"));
  el("memberSuspendButton").addEventListener("click", (event) => updateMemberStatus(event.currentTarget.dataset.memberId, "suspended"));
  el("memberBanButton").addEventListener("click", (event) => {
    if (confirm("Ban this member? They will be unable to sign in until restored.")) {
      updateMemberStatus(event.currentTarget.dataset.memberId, "banned");
    }
  });
  el("memberRevokeSessionsButton").addEventListener("click", (event) => revokeMemberSessions(event.currentTarget.dataset.memberId));
}
