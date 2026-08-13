import { apiFetch } from "./api.js?v=0.16.0";
import { state } from "./state.js?v=0.16.0";
import { openMemberByUsername } from "./admin.js?v=0.16.0";

const el = (id) => document.getElementById(id);
let activeProfile = null;
let rewardCatalog = [];

function escapeText(value) {
  return String(value ?? "");
}

function formatDate(value, short = false) {
  if (!value) return "—";
  const normalized = String(value).includes("T") ? String(value) : String(value).replace(" ", "T") + "Z";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);
  return short
    ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })
    : date.toLocaleString();
}

function expiryLabel(reward) {
  if (reward.revoked_at) return "No longer active";
  if (!reward.expires_at) return "Permanent";
  const end = new Date(String(reward.expires_at).replace(" ", "T") + "Z").getTime();
  const remaining = Math.max(0, end - Date.now());
  const days = Math.ceil(remaining / 86400000);
  if (days <= 0) return "Expired";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function initials(username) {
  return String(username || "?").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function createAvatar(profile) {
  const wrap = document.createElement("div");
  wrap.className = "profile-avatar-wrap";
  const url = profile.profile?.avatar_url;
  if (url) {
    const img = document.createElement("img");
    img.className = "profile-avatar";
    img.alt = `${profile.user.username}'s profile picture`;
    img.src = url;
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      wrap.innerHTML = "";
      const fallback = document.createElement("div");
      fallback.className = "profile-avatar profile-avatar-fallback";
      fallback.textContent = initials(profile.user.username);
      wrap.appendChild(fallback);
    }, { once: true });
    wrap.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "profile-avatar profile-avatar-fallback";
    fallback.textContent = initials(profile.user.username);
    wrap.appendChild(fallback);
  }
  return wrap;
}

function rewardCard(reward, compact = false) {
  const card = document.createElement("div");
  card.className = `profile-reward-card rarity-${reward.rarity || "common"}${compact ? " compact" : ""}`;
  const icon = document.createElement("span");
  icon.className = "profile-reward-icon";
  icon.textContent = reward.icon || "◆";
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = reward.name || reward.reward_key;
  const desc = document.createElement("div");
  desc.className = "small";
  desc.textContent = reward.description || "";
  const meta = document.createElement("div");
  meta.className = "profile-reward-meta";
  const type = String(reward.reward_type || "reward").toUpperCase();
  meta.textContent = `${type} • ${String(reward.rarity || "common").toUpperCase()} • ${expiryLabel(reward)}`;
  copy.append(name, desc, meta);
  card.append(icon, copy);
  return card;
}

function profileSection(title, content, empty = "Nothing here yet.") {
  const section = document.createElement("section");
  section.className = "profile-section-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const body = document.createElement("div");
  body.className = "profile-section-copy";
  body.textContent = String(content || "").trim() || empty;
  section.append(heading, body);
  return section;
}

function profileEffectClass(effect) {
  if (!effect?.reward_key) return "";
  return `profile-effect-${String(effect.reward_key).replace(/[^a-z0-9_-]/gi, "-")}`;
}

function renderProfile(data) {
  activeProfile = data;
  const view = el("profileView");
  view.innerHTML = "";
  view.className = "profile-page";
  if (data.equipped?.effect) view.classList.add(profileEffectClass(data.equipped.effect));

  const hero = document.createElement("div");
  hero.className = "profile-hero";
  const identity = document.createElement("div");
  identity.className = "profile-identity";
  identity.appendChild(createAvatar(data));
  const identityCopy = document.createElement("div");
  const eyebrow = document.createElement("div");
  eyebrow.className = "profile-kicker";
  eyebrow.textContent = "MEMBER PROFILE";
  const name = document.createElement("h1");
  name.textContent = data.user.username;
  const title = document.createElement("div");
  title.className = "profile-equipped-title";
  title.textContent = data.equipped?.title ? `${data.equipped.title.icon || ""} ${data.equipped.title.name}`.trim() : "Community Member";
  const status = document.createElement("div");
  status.className = "profile-status-line";
  status.textContent = data.profile?.profile_status || "No profile status set.";
  identityCopy.append(eyebrow, name, title, status);
  identity.appendChild(identityCopy);
  hero.appendChild(identity);

  const actions = document.createElement("div");
  actions.className = "profile-actions";
  if (data.can_edit) {
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "EDIT PROFILE";
    edit.addEventListener("click", openEditMode);
    actions.appendChild(edit);
  } else {
    const rps = document.createElement("button");
    rps.type = "button";
    rps.textContent = "CHALLENGE TO RPS";
    rps.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("drk:rps-challenge", { detail: { username: data.user.username } }));
      closeProfile();
    });
    actions.appendChild(rps);
  }
  if (state.currentUser?.role === "admin") {
    const info = document.createElement("button");
    info.type = "button";
    info.textContent = "ADMIN INFO";
    info.addEventListener("click", () => {
      closeProfile();
      openMemberByUsername(data.user.username);
    });
    actions.appendChild(info);
  }
  hero.appendChild(actions);
  view.appendChild(hero);

  const layout = document.createElement("div");
  layout.className = "profile-layout";
  const left = document.createElement("aside");
  left.className = "profile-left-column";
  const basics = document.createElement("section");
  basics.className = "profile-section-card profile-basics-card";
  const basicTitle = document.createElement("h3");
  basicTitle.textContent = "Basics";
  const rows = [
    ["Member since", formatDate(data.user.created_at, true)],
    ["Location", data.profile?.profile_location || "Not listed"],
    ["RPS record", `${data.stats?.rps_wins || 0}–${data.stats?.rps_losses || 0}`],
    ["Tournament wins", String(data.stats?.rps_tournament_wins || 0)],
    ["Longest streak", String(data.stats?.rps_longest_win_streak || 0)],
    ["Favorite throw", data.stats?.favorite_throw ? data.stats.favorite_throw.toUpperCase() : "—"]
  ];
  basics.appendChild(basicTitle);
  rows.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "profile-basic-row";
    const k = document.createElement("span");
    k.textContent = label;
    const v = document.createElement("strong");
    v.textContent = value;
    row.append(k, v);
    basics.appendChild(row);
  });
  left.appendChild(basics);

  const showcase = document.createElement("section");
  showcase.className = "profile-section-card";
  const sh = document.createElement("h3");
  sh.textContent = "Trophy Case";
  showcase.appendChild(sh);
  const shelf = document.createElement("div");
  shelf.className = "profile-trophy-shelf";
  const shown = data.equipped?.showcase || [];
  if (shown.length) shown.forEach((reward) => shelf.appendChild(rewardCard(reward, true)));
  else {
    const empty = document.createElement("div");
    empty.className = "small profile-empty";
    empty.textContent = "No showcased trophies yet.";
    shelf.appendChild(empty);
  }
  showcase.appendChild(shelf);
  left.appendChild(showcase);

  const right = document.createElement("div");
  right.className = "profile-main-column";
  right.append(
    profileSection("About Me", data.profile?.about_me, "This member hasn't written an About Me yet."),
    profileSection("Interests", data.profile?.interests),
    profileSection("Favorite Things", data.profile?.favorite_things)
  );

  const activeRewards = document.createElement("section");
  activeRewards.className = "profile-section-card";
  const arh = document.createElement("h3");
  arh.textContent = "Active Rewards";
  activeRewards.appendChild(arh);
  const grid = document.createElement("div");
  grid.className = "profile-rewards-grid";
  const rewards = data.active_rewards || [];
  if (rewards.length) rewards.slice(0, 12).forEach((reward) => grid.appendChild(rewardCard(reward)));
  else {
    const empty = document.createElement("div");
    empty.className = "small profile-empty";
    empty.textContent = "No active rewards yet. Play games and participate in the room to earn them.";
    grid.appendChild(empty);
  }
  activeRewards.appendChild(grid);
  right.appendChild(activeRewards);

  if (data.can_edit && (data.reward_history || []).length) {
    const history = document.createElement("details");
    history.className = "profile-history profile-section-card";
    const summary = document.createElement("summary");
    summary.textContent = "Achievement History";
    history.appendChild(summary);
    const list = document.createElement("div");
    list.className = "profile-history-list";
    data.reward_history.slice(0, 40).forEach((reward) => {
      const row = document.createElement("div");
      row.className = "profile-history-row";
      row.textContent = `${reward.icon || "◆"} ${reward.name} — earned ${formatDate(reward.earned_at, true)}${reward.expires_at ? ` • ${expiryLabel(reward)}` : " • Permanent"}`;
      list.appendChild(row);
    });
    history.appendChild(list);
    right.appendChild(history);
  }

  layout.append(left, right);
  view.appendChild(layout);

  if (state.currentUser?.role === "admin") {
    const adminBox = document.createElement("section");
    adminBox.className = "profile-admin-award profile-section-card";
    const h = document.createElement("h3");
    h.textContent = "Admin Reward";
    const select = document.createElement("select");
    select.id = "profileAdminRewardSelect";
    rewardCatalog.forEach((reward) => {
      const option = document.createElement("option");
      option.value = reward.reward_key;
      option.textContent = `${reward.icon || "◆"} ${reward.name} (${reward.reward_type})`;
      select.appendChild(option);
    });
    const award = document.createElement("button");
    award.type = "button";
    award.textContent = "AWARD";
    award.addEventListener("click", async () => {
      award.disabled = true;
      try {
        const { response, data: result } = await apiFetch("/admin/rewards/award", {
          method: "POST",
          body: JSON.stringify({ username: data.user.username, reward_key: select.value })
        }, true);
        if (!response.ok || !result.ok) throw new Error(result.error || "Could not award reward.");
        await openProfileByUsername(data.user.username);
      } catch (error) {
        alert(error.message || "Could not award reward.");
      } finally {
        award.disabled = false;
      }
    });
    adminBox.append(h, select, award);
    right.appendChild(adminBox);
  }
}

async function loadCatalog() {
  if (rewardCatalog.length) return rewardCatalog;
  try {
    const { response, data } = await apiFetch("/rewards/catalog", { method: "GET" }, true);
    if (response.ok && data.ok) rewardCatalog = data.rewards || [];
  } catch {}
  return rewardCatalog;
}

export async function openProfileByUsername(username) {
  const requested = String(username || state.currentUser?.username || "").trim();
  if (!requested) return;
  el("profileOverlay").classList.remove("hidden");
  el("profileLoading").classList.remove("hidden");
  el("profileView").classList.add("hidden");
  el("profileEdit").classList.add("hidden");
  await loadCatalog();
  try {
    const { response, data } = await apiFetch(`/profile?username=${encodeURIComponent(requested)}`, { method: "GET" }, true);
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load profile.");
    el("profileLoading").classList.add("hidden");
    el("profileView").classList.remove("hidden");
    renderProfile(data);
  } catch (error) {
    el("profileLoading").textContent = error.message || "Could not load profile.";
  }
}

export function openOwnProfile() {
  return openProfileByUsername(state.currentUser?.username);
}

function openEditMode() {
  if (!activeProfile?.can_edit) return;
  el("profileView").classList.add("hidden");
  el("profileEdit").classList.remove("hidden");
  const p = activeProfile.profile || {};
  el("profileAvatarInput").value = p.avatar_url || "";
  el("profileStatusInput").value = p.profile_status || "";
  el("profileAboutInput").value = p.about_me || "";
  el("profileInterestsInput").value = p.interests || "";
  el("profileFavoritesInput").value = p.favorite_things || "";
  el("profileLocationInput").value = p.profile_location || "";
  fillRewardEditor();
}

function fillRewardEditor() {
  const title = el("profileTitleSelect");
  const effect = el("profileEffectSelect");
  title.innerHTML = '<option value="">No title</option>';
  effect.innerHTML = '<option value="">No effect</option>';
  const active = activeProfile?.active_rewards || [];
  active.filter((r) => r.reward_type === "title").forEach((r) => {
    const o = document.createElement("option"); o.value = r.user_reward_id; o.textContent = `${r.icon || ""} ${r.name} — ${expiryLabel(r)}`; title.appendChild(o);
  });
  active.filter((r) => r.reward_type === "effect").forEach((r) => {
    const o = document.createElement("option"); o.value = r.user_reward_id; o.textContent = `${r.icon || ""} ${r.name} — ${expiryLabel(r)}`; effect.appendChild(o);
  });
  title.value = activeProfile?.equipped?.title?.user_reward_id || "";
  effect.value = activeProfile?.equipped?.effect?.user_reward_id || "";

  const showcase = el("profileShowcaseChoices");
  showcase.innerHTML = "";
  const equippedIds = new Set((activeProfile?.equipped?.showcase || []).map((r) => Number(r.user_reward_id)));
  active.filter((r) => ["trophy", "badge", "title"].includes(r.reward_type)).forEach((reward) => {
    const label = document.createElement("label");
    label.className = "profile-showcase-choice";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = reward.user_reward_id;
    checkbox.checked = equippedIds.has(Number(reward.user_reward_id));
    checkbox.addEventListener("change", () => {
      const checked = showcase.querySelectorAll('input[type="checkbox"]:checked');
      if (checked.length > 5) {
        checkbox.checked = false;
        alert("You can showcase up to five rewards.");
      }
    });
    const span = document.createElement("span");
    span.textContent = `${reward.icon || "◆"} ${reward.name}`;
    label.append(checkbox, span);
    showcase.appendChild(label);
  });
}

async function saveProfile(event) {
  event.preventDefault();
  const message = el("profileEditMessage");
  message.textContent = "Saving...";
  try {
    const payload = {
      avatar_url: el("profileAvatarInput").value.trim(),
      profile_status: el("profileStatusInput").value.trim(),
      about_me: el("profileAboutInput").value.trim(),
      interests: el("profileInterestsInput").value.trim(),
      favorite_things: el("profileFavoritesInput").value.trim(),
      profile_location: el("profileLocationInput").value.trim()
    };
    const { response, data } = await apiFetch("/profile", { method: "PUT", body: JSON.stringify(payload) }, true);
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save profile.");
    activeProfile = data;
    message.className = "message success";
    message.textContent = "Profile saved.";
    renderProfile(data);
    el("profileEdit").classList.add("hidden");
    el("profileView").classList.remove("hidden");
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message || "Could not save profile.";
  }
}

async function saveRewardDisplay() {
  const message = el("profileEditMessage");
  const showcase = [...el("profileShowcaseChoices").querySelectorAll('input[type="checkbox"]:checked')].map((input) => Number(input.value));
  try {
    const { response, data } = await apiFetch("/profile/equip", {
      method: "POST",
      body: JSON.stringify({
        title_user_reward_id: el("profileTitleSelect").value || null,
        effect_user_reward_id: el("profileEffectSelect").value || null,
        showcase_reward_ids: showcase
      })
    }, true);
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save display rewards.");
    activeProfile = data;
    message.className = "message success";
    message.textContent = "Profile display updated.";
    renderProfile(data);
    el("profileEdit").classList.add("hidden");
    el("profileView").classList.remove("hidden");
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message || "Could not save display rewards.";
  }
}

export function closeProfile() {
  el("profileOverlay").classList.add("hidden");
  el("profileView").innerHTML = "";
  activeProfile = null;
}

export function initProfiles() {
  el("profileCloseButton").addEventListener("click", closeProfile);
  el("profileOverlay").addEventListener("click", (event) => { if (event.target === el("profileOverlay")) closeProfile(); });
  el("profileCancelEditButton").addEventListener("click", () => {
    el("profileEdit").classList.add("hidden");
    el("profileView").classList.remove("hidden");
  });
  el("profileEditForm").addEventListener("submit", saveProfile);
  el("profileSaveRewardsButton").addEventListener("click", saveRewardDisplay);
  el("myProfileButton").addEventListener("click", openOwnProfile);
}
