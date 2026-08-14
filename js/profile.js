import { apiFetch } from "./api.js?v=0.18.0";
import { state } from "./state.js?v=0.18.0";
import { openMemberByUsername } from "./admin.js?v=0.18.0";

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

function defaultMonsterAvatar() {
  return {
    skin: "#7ecf8a",
    eyes: "classic",
    ears: "round",
    horns: "curved",
    mouth: "smile",
    eyebrows: "soft",
    nose: "button",
    hair: "mohawk",
    eyeglasses: false,
    sunglasses: false,
    nosePiercing: false,
    earPiercing: "none",
    eyebrowPiercing: false,
    lipPiercing: false
  };
}

function normalizeMonsterAvatar(value) {
  const defaults = defaultMonsterAvatar();
  const raw = value && typeof value === "object" ? value : {};
  const pick = (key, allowed) => allowed.includes(String(raw[key] || "")) ? String(raw[key]) : defaults[key];
  const avatar = {
    skin: typeof raw.skin === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.skin) ? raw.skin : defaults.skin,
    eyes: pick("eyes", ["classic", "sleepy", "wide", "cyclops", "three", "four"]),
    ears: pick("ears", ["round", "pointy", "floppy", "tiny"]),
    horns: pick("horns", ["none", "curved", "spike", "nubs", "single", "ram"]),
    mouth: pick("mouth", ["smile", "fang", "grin", "tongue", "frown"]),
    eyebrows: pick("eyebrows", ["soft", "angry", "arched", "bushy"]),
    nose: pick("nose", ["button", "triangle", "snout", "flat"]),
    hair: pick("hair", ["none", "mohawk", "shaggy", "spikes", "swoop"]),
    eyeglasses: Boolean(raw.eyeglasses),
    sunglasses: Boolean(raw.sunglasses),
    nosePiercing: Boolean(raw.nosePiercing),
    earPiercing: ["none", "left", "right", "both"].includes(String(raw.earPiercing || ""))
      ? String(raw.earPiercing)
      : (raw.earPiercing === true ? "both" : defaults.earPiercing),
    eyebrowPiercing: Boolean(raw.eyebrowPiercing),
    lipPiercing: Boolean(raw.lipPiercing)
  };
  if (avatar.sunglasses) avatar.eyeglasses = false;
  return avatar;
}

function buildMonsterSvg(config, size = 112) {
  const a = normalizeMonsterAvatar(config);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 120 120");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("profile-avatar", "monster-avatar-svg");

  const add = (name, attrs) => {
    const el = document.createElementNS(ns, name);
    for (const [k,v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.appendChild(el);
    return el;
  };

  add("rect", { x: 0, y: 0, width: 120, height: 120, rx: 24, fill: "#00000000" });
  add("circle", { cx: 60, cy: 60, r: 53, fill: "#f7f8fb" });

  // ears
  if (a.ears === "round") {
    add("circle", { cx: 19, cy: 56, r: 12, fill: a.skin, stroke: "#28323d", 'stroke-width': 3 });
    add("circle", { cx: 101, cy: 56, r: 12, fill: a.skin, stroke: "#28323d", 'stroke-width': 3 });
  } else if (a.ears === "pointy") {
    add("path", { d: "M18 61 L9 44 L28 48 Z", fill: a.skin, stroke: "#28323d", 'stroke-width': 3, 'stroke-linejoin': 'round' });
    add("path", { d: "M102 61 L111 44 L92 48 Z", fill: a.skin, stroke: "#28323d", 'stroke-width': 3, 'stroke-linejoin': 'round' });
  } else if (a.ears === "floppy") {
    add("path", { d: "M18 61 Q7 66 9 81 Q18 79 24 71", fill: a.skin, stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    add("path", { d: "M102 61 Q113 66 111 81 Q102 79 96 71", fill: a.skin, stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  } else {
    add("circle", { cx: 23, cy: 58, r: 7, fill: a.skin, stroke: "#28323d", 'stroke-width': 3 });
    add("circle", { cx: 97, cy: 58, r: 7, fill: a.skin, stroke: "#28323d", 'stroke-width': 3 });
  }

  // horns
  if (a.horns === "none") {
    // intentionally hornless
  } else if (a.horns === "curved") {
    add("path", { d: "M38 20 Q28 2 18 24", fill: "none", stroke: "#8b6b4b", 'stroke-width': 8, 'stroke-linecap': 'round' });
    add("path", { d: "M82 20 Q92 2 102 24", fill: "none", stroke: "#8b6b4b", 'stroke-width': 8, 'stroke-linecap': 'round' });
  } else if (a.horns === "spike") {
    add("path", { d: "M38 26 L31 6 L48 20 Z", fill: "#b88c61", stroke: "#6c4d31", 'stroke-width': 2, 'stroke-linejoin': 'round' });
    add("path", { d: "M82 26 L89 6 L72 20 Z", fill: "#b88c61", stroke: "#6c4d31", 'stroke-width': 2, 'stroke-linejoin': 'round' });
  } else if (a.horns === "nubs") {
    add("circle", { cx: 42, cy: 21, r: 7, fill: "#b88c61", stroke: "#6c4d31", 'stroke-width': 2 });
    add("circle", { cx: 78, cy: 21, r: 7, fill: "#b88c61", stroke: "#6c4d31", 'stroke-width': 2 });
  } else if (a.horns === "single") {
    add("path", { d: "M60 24 L53 3 L67 3 Z", fill: "#b88c61", stroke: "#6c4d31", 'stroke-width': 2, 'stroke-linejoin':'round' });
  } else {
    add("path", { d: "M40 24 Q20 12 24 34 Q31 43 39 31", fill: "none", stroke: "#8b6b4b", 'stroke-width': 7, 'stroke-linecap':'round' });
    add("path", { d: "M80 24 Q100 12 96 34 Q89 43 81 31", fill: "none", stroke: "#8b6b4b", 'stroke-width': 7, 'stroke-linecap':'round' });
  }

  // hair
  if (a.hair === "mohawk") {
    add("path", { d: "M60 8 L68 26 L60 22 L52 26 Z", fill: "#442b18" });
    add("path", { d: "M60 18 L70 40 L60 36 L50 40 Z", fill: "#5a3921" });
  } else if (a.hair === "shaggy") {
    add("path", { d: "M28 32 Q40 8 60 10 Q80 8 92 32 Q84 24 76 28 Q68 21 60 27 Q52 21 44 28 Q36 23 28 32", fill: "#4e3426" });
  } else if (a.hair === "spikes") {
    add("path", { d: "M30 32 L36 12 L43 28 L50 8 L57 28 L64 6 L70 28 L79 11 L84 31", fill: "#4e3426", stroke: "#3b261b", 'stroke-width': 2, 'stroke-linejoin':'round' });
  } else if (a.hair === "swoop") {
    add("path", { d: "M30 31 Q52 5 87 20 Q67 18 50 32 Q40 39 30 31", fill: "#4e3426" });
  }

  // head
  add("circle", { cx: 60, cy: 60, r: 38, fill: a.skin, stroke: "#28323d", 'stroke-width': 3 });

  // eyebrows
  if (a.eyebrows === "soft") {
    add("path", { d: "M38 44 Q45 40 51 44", fill: "none", stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round' });
    add("path", { d: "M69 44 Q75 40 82 44", fill: "none", stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round' });
  } else if (a.eyebrows === "angry") {
    add("path", { d: "M36 46 L51 41", fill: "none", stroke: "#28323d", 'stroke-width': 3.5, 'stroke-linecap': 'round' });
    add("path", { d: "M69 41 L84 46", fill: "none", stroke: "#28323d", 'stroke-width': 3.5, 'stroke-linecap': 'round' });
  } else if (a.eyebrows === "arched") {
    add("path", { d: "M36 43 Q44 36 51 43", fill: "none", stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round' });
    add("path", { d: "M69 43 Q76 36 84 43", fill: "none", stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round' });
  } else {
    add("path", { d: "M34 43 Q44 36 53 43", fill: "none", stroke: "#28323d", 'stroke-width': 6, 'stroke-linecap':'round' });
    add("path", { d: "M67 43 Q76 36 86 43", fill: "none", stroke: "#28323d", 'stroke-width': 6, 'stroke-linecap':'round' });
  }

  // eyes
  if (a.eyes === "classic") {
    add("ellipse", { cx: 44, cy: 52, rx: 8, ry: 10, fill: "#fff", stroke: "#28323d", 'stroke-width': 2 });
    add("ellipse", { cx: 76, cy: 52, rx: 8, ry: 10, fill: "#fff", stroke: "#28323d", 'stroke-width': 2 });
    add("circle", { cx: 45, cy: 54, r: 3.4, fill: "#28323d" });
    add("circle", { cx: 77, cy: 54, r: 3.4, fill: "#28323d" });
  } else if (a.eyes === "sleepy") {
    add("path", { d: "M36 54 Q44 48 52 54", fill: "#fff", stroke: "#28323d", 'stroke-width': 2, 'stroke-linecap': 'round' });
    add("path", { d: "M68 54 Q76 48 84 54", fill: "#fff", stroke: "#28323d", 'stroke-width': 2, 'stroke-linecap': 'round' });
    add("circle", { cx: 44, cy: 54, r: 2.7, fill: "#28323d" });
    add("circle", { cx: 76, cy: 54, r: 2.7, fill: "#28323d" });
  } else if (a.eyes === "wide") {
    add("circle", { cx: 44, cy: 52, r: 10, fill: "#fff", stroke: "#28323d", 'stroke-width': 2 });
    add("circle", { cx: 76, cy: 52, r: 10, fill: "#fff", stroke: "#28323d", 'stroke-width': 2 });
    add("circle", { cx: 44, cy: 52, r: 4, fill: "#28323d" });
    add("circle", { cx: 76, cy: 52, r: 4, fill: "#28323d" });
  } else if (a.eyes === "cyclops") {
    add("ellipse", { cx: 60, cy: 51, rx: 13, ry: 11, fill: "#fff", stroke: "#28323d", 'stroke-width': 2 });
    add("circle", { cx: 60, cy: 52, r: 4.5, fill: "#28323d" });
  } else if (a.eyes === "three") {
    [[40,54],[60,47],[80,54]].forEach(([cx,cy]) => { add("circle", { cx, cy, r: 7.5, fill: "#fff", stroke: "#28323d", 'stroke-width': 2 }); add("circle", { cx, cy, r: 3, fill: "#28323d" }); });
  } else {
    [[39,49],[54,56],[66,56],[81,49]].forEach(([cx,cy]) => { add("circle", { cx, cy, r: 6.4, fill: "#fff", stroke: "#28323d", 'stroke-width': 1.8 }); add("circle", { cx, cy, r: 2.6, fill: "#28323d" }); });
  }

  // glasses
  if (a.eyeglasses || a.sunglasses) {
    const fill = a.sunglasses ? "#1d2430" : "#ffffffaa";
    add("rect", { x: 32, y: 44, width: 22, height: 18, rx: 6, fill, stroke: "#28323d", 'stroke-width': 2 });
    add("rect", { x: 66, y: 44, width: 22, height: 18, rx: 6, fill, stroke: "#28323d", 'stroke-width': 2 });
    add("path", { d: "M54 53 H66", fill: "none", stroke: "#28323d", 'stroke-width': 2 });
  }

  // nose
  if (a.nose === "button") {
    add("circle", { cx: 60, cy: 61, r: 3.5, fill: "#f2b2a4", stroke: "#28323d", 'stroke-width': 1.5 });
  } else if (a.nose === "triangle") {
    add("path", { d: "M60 57 L55 65 L65 65 Z", fill: "#f2b2a4", stroke: "#28323d", 'stroke-width': 1.5, 'stroke-linejoin':'round' });
  } else if (a.nose === "snout") {
    add("ellipse", { cx: 60, cy: 62, rx: 8, ry: 5, fill: "#f2b2a4", stroke: "#28323d", 'stroke-width': 1.5 });
  } else {
    add("path", { d: "M55 63 Q60 66 65 63", fill: "none", stroke: "#28323d", 'stroke-width': 2, 'stroke-linecap':'round' });
  }

  // mouth
  if (a.mouth === "smile") {
    add("path", { d: "M46 76 Q60 86 74 76", fill: "none", stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap': 'round' });
  } else if (a.mouth === "fang") {
    add("path", { d: "M45 75 Q60 84 75 75", fill: "#fff", stroke: "#28323d", 'stroke-width': 2, 'stroke-linejoin':'round' });
    add("path", { d: "M54 76 L57 84 L60 76", fill: "#fff", stroke: "#28323d", 'stroke-width': 1.5 });
    add("path", { d: "M60 76 L63 84 L66 76", fill: "#fff", stroke: "#28323d", 'stroke-width': 1.5 });
  } else if (a.mouth === "grin") {
    add("rect", { x: 47, y: 72, width: 26, height: 12, rx: 6, fill: "#7d2c35", stroke: "#28323d", 'stroke-width': 2 });
    for (const x of [52,58,64,70]) add("path", { d: `M${x} 72 V84`, fill:'none', stroke:'#ffffff', 'stroke-width': 1 });
  } else if (a.mouth === "tongue") {
    add("path", { d: "M47 74 Q60 84 73 74 Q70 90 60 92 Q50 90 47 74", fill: "#7d2c35", stroke: "#28323d", 'stroke-width': 2 });
    add("path", { d: "M56 84 Q60 81 64 84 L64 91 L56 91 Z", fill: "#ef7b93" });
  } else {
    add("path", { d: "M46 82 Q60 72 74 82", fill: "none", stroke: "#28323d", 'stroke-width': 3, 'stroke-linecap':'round' });
  }

  if (a.nosePiercing) add("circle", { cx: 66, cy: 64, r: 2.2, fill: "#d9dce5", stroke: "#495566", 'stroke-width': 1 });
  if (a.earPiercing === "left" || a.earPiercing === "both") add("circle", { cx: 24, cy: 65, r: 2.5, fill: "#d9dce5", stroke: "#495566", 'stroke-width': 1 });
  if (a.earPiercing === "right" || a.earPiercing === "both") add("circle", { cx: 96, cy: 65, r: 2.5, fill: "#d9dce5", stroke: "#495566", 'stroke-width': 1 });
  if (a.eyebrowPiercing) add("circle", { cx: 84, cy: 42, r: 2.2, fill: "#d9dce5", stroke: "#495566", 'stroke-width': 1 });
  if (a.lipPiercing) add("circle", { cx: 73, cy: 80, r: 2.1, fill: "#d9dce5", stroke: "#495566", 'stroke-width': 1 });

  return svg;
}

function renderMonsterAvatarInto(container, config, size = 112) {
  container.innerHTML = "";
  container.appendChild(buildMonsterSvg(config, size));
}

function createAvatar(profile) {
  const wrap = document.createElement("div");
  wrap.className = "profile-avatar-wrap";
  renderMonsterAvatarInto(wrap, profile.profile?.avatar_monster || defaultMonsterAvatar(), 112);
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
  const entranceButton = document.createElement("button");
  entranceButton.type = "button";
  entranceButton.textContent = data.can_edit ? "MY ENTRANCE" : (state.currentUser?.role === "admin" ? "EDIT ENTRANCE" : "");
  if (entranceButton.textContent) {
    entranceButton.addEventListener("click", () => openEntranceEditor(data));
    actions.appendChild(entranceButton);
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
    ["Entrance status", String(data.entrance?.tier || "none").toUpperCase()],
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
  const avatar = normalizeMonsterAvatar(p.avatar_monster);
  el("profileAvatarSkinInput").value = avatar.skin;
  el("profileAvatarEyesSelect").value = avatar.eyes;
  el("profileAvatarEarsSelect").value = avatar.ears;
  el("profileAvatarHornsSelect").value = avatar.horns;
  el("profileAvatarMouthSelect").value = avatar.mouth;
  el("profileAvatarEyebrowsSelect").value = avatar.eyebrows;
  el("profileAvatarNoseSelect").value = avatar.nose;
  el("profileAvatarHairSelect").value = avatar.hair;
  el("profileAvatarEyeglassesInput").checked = avatar.eyeglasses;
  el("profileAvatarSunglassesInput").checked = avatar.sunglasses;
  el("profileAvatarNosePiercingInput").checked = avatar.nosePiercing;
  el("profileAvatarEarPiercingSelect").value = avatar.earPiercing;
  el("profileAvatarEyebrowPiercingInput").checked = avatar.eyebrowPiercing;
  el("profileAvatarLipPiercingInput").checked = avatar.lipPiercing;
  updateAvatarEditorPreview();
  el("profileStatusInput").value = p.profile_status || "";
  el("profileAboutInput").value = p.about_me || "";
  el("profileInterestsInput").value = p.interests || "";
  el("profileFavoritesInput").value = p.favorite_things || "";
  el("profileLocationInput").value = p.profile_location || "";
  fillRewardEditor();
}


function getMonsterAvatarFromForm() {
  const avatar = normalizeMonsterAvatar({
    skin: el("profileAvatarSkinInput").value,
    eyes: el("profileAvatarEyesSelect").value,
    ears: el("profileAvatarEarsSelect").value,
    horns: el("profileAvatarHornsSelect").value,
    mouth: el("profileAvatarMouthSelect").value,
    eyebrows: el("profileAvatarEyebrowsSelect").value,
    nose: el("profileAvatarNoseSelect").value,
    hair: el("profileAvatarHairSelect").value,
    eyeglasses: el("profileAvatarEyeglassesInput").checked,
    sunglasses: el("profileAvatarSunglassesInput").checked,
    nosePiercing: el("profileAvatarNosePiercingInput").checked,
    earPiercing: el("profileAvatarEarPiercingSelect").value,
    eyebrowPiercing: el("profileAvatarEyebrowPiercingInput").checked,
    lipPiercing: el("profileAvatarLipPiercingInput").checked
  });
  if (avatar.sunglasses) el("profileAvatarEyeglassesInput").checked = false;
  return avatar;
}

function updateAvatarEditorPreview() {
  const avatar = getMonsterAvatarFromForm();
  renderMonsterAvatarInto(el("profileAvatarPreview"), avatar, 120);
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
      avatar_monster: getMonsterAvatarFromForm(),
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


const ENTRANCE_TIER_RANK = { none: 0, basic: 1, rare: 2, epic: 3, champion: 4 };

function entranceDefaults() {
  return {
    enabled: false,
    wrestlingName: "",
    subtitle: "",
    pyro: { enabled: true, style: "jets", position: "both", color: "#FFFFFF", duration: 4, frequency: 0.8, height: 0.72, width: 1, intensity: 2, burstCount: 3, behavior: "simultaneous" },
    atmosphere: { type: "none", color: "#FFFFFF", density: 0.45, spread: 0.75, placement: "floor", fade: 4 },
    lighting: { enabled: true, blackout: true, spotlight: true, phoneLights: false, lightning: false, primaryColor: "#FFFFFF", secondaryColor: "#FFFFFF", motion: "sweep", speed: 1, brightness: 0.65, beamWidth: 1, fixtureCount: 6 },
    filter: { mode: "none", intensity: 0.55 },
    screenFx: { effect: "none", shake: 1, flash: 0.6, lingerCracks: false },
    nameplate: { enabled: true, style: "arena", glow: true, animation: "slide" },
    timing: { totalDuration: 6, entranceDelay: 0, nameplateStart: 0.6, pyroStart: 1, atmosphereStart: 0.3, screenFxStart: 0.8 }
  };
}

const ENTRANCE_TEMPLATES = {
  basic_white_heat: { tier:"basic", name:"Basic — White Heat", config:{ enabled:true, pyro:{enabled:true,style:"fountain",position:"both",color:"#FFFFFF",duration:3.5,frequency:1.1,height:.62,width:1,intensity:1,burstCount:2,behavior:"simultaneous"}, atmosphere:{type:"none"}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#FFFFFF",secondaryColor:"#FFFFFF",motion:"none",speed:1}, filter:{mode:"cinematic",intensity:.3}, screenFx:{effect:"none"}, nameplate:{enabled:true,style:"arena",glow:true,animation:"slide"}, timing:{totalDuration:5,pyroStart:1,nameplateStart:.5,atmosphereStart:.2,screenFxStart:.7} } },
  rare_purple_haze: { tier:"rare", name:"Rare — Purple Haze", config:{ enabled:true, pyro:{enabled:false}, atmosphere:{type:"fog",color:"#A855F7",density:.72,spread:.9,placement:"full",fade:5}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#A855F7",secondaryColor:"#FFFFFF",motion:"sweep",speed:1.2}, filter:{mode:"purple",intensity:.55}, nameplate:{enabled:true,style:"neon",glow:true,animation:"fade"}, timing:{totalDuration:6} } },
  rare_green_rebellion: { tier:"rare", name:"Rare — Green Rebellion", config:{ enabled:true, pyro:{enabled:true,style:"wide_fountain",position:"both",color:"#22C55E",duration:5,frequency:.8,height:.72,width:2,intensity:2,burstCount:4,behavior:"alternating"}, atmosphere:{type:"smoke",color:"#22C55E",density:.5,spread:.8,placement:"sides",fade:4}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#22C55E",secondaryColor:"#FFFFFF",motion:"cross",speed:.8}, filter:{mode:"green",intensity:.45}, screenFx:{effect:"glitch",shake:1,flash:.25}, nameplate:{enabled:true,style:"neon",glow:true,animation:"glitch"} } },
  rare_monochrome_invasion: { tier:"rare", name:"Rare — Monochrome Invasion", config:{ enabled:true, pyro:{enabled:false}, atmosphere:{type:"smoke",color:"#FFFFFF",density:.45,spread:.8,placement:"full",fade:5}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#FFFFFF",secondaryColor:"#FFFFFF",motion:"none",speed:1}, filter:{mode:"mono",intensity:.95}, nameplate:{enabled:true,style:"steel",glow:false,animation:"fade"} } },
  rare_glass_break: { tier:"epic", name:"Epic — Glass Break", config:{ enabled:true, pyro:{enabled:true,style:"center_blast",position:"center",color:"#FFFFFF",duration:2.8,frequency:1.4,height:.7,width:1.2,intensity:2,burstCount:1,behavior:"simultaneous"}, atmosphere:{type:"none"}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#FFFFFF",secondaryColor:"#3B82F6",motion:"pulse",speed:.6}, filter:{mode:"cool",intensity:.45}, screenFx:{effect:"glass_shatter",shake:2,flash:.9,lingerCracks:true}, nameplate:{enabled:true,style:"steel",glow:false,animation:"slide"}, timing:{totalDuration:5,screenFxStart:.35,pyroStart:.6,nameplateStart:1.1} } },
  epic_fireflies: { tier:"epic", name:"Epic — Fireflies", config:{ enabled:true, pyro:{enabled:false}, atmosphere:{type:"fog",color:"#FFFFFF",density:.22,spread:1,placement:"floor",fade:7}, lighting:{enabled:false,blackout:true,spotlight:true,phoneLights:true,lightning:false,primaryColor:"#FFFFFF",secondaryColor:"#FFFFFF",motion:"none",speed:1}, filter:{mode:"cool",intensity:.65}, screenFx:{effect:"none"}, nameplate:{enabled:true,style:"minimal",glow:false,animation:"fade"}, timing:{totalDuration:8} } },
  epic_hellfire: { tier:"epic", name:"Epic — Hellfire", config:{ enabled:true, pyro:{enabled:true,style:"flame_jets",position:"full",color:"#EF4444",duration:6,frequency:.7,height:.9,width:1.5,intensity:3,burstCount:5,behavior:"alternating"}, atmosphere:{type:"smoke",color:"#EF4444",density:.55,spread:.85,placement:"sides",fade:5}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#EF4444",secondaryColor:"#F59E0B",motion:"pulse",speed:.7}, filter:{mode:"red",intensity:.55}, nameplate:{enabled:true,style:"arena",glow:true,animation:"pop"} } },
  epic_deadman: { tier:"epic", name:"Epic — Graveyard Walk", config:{ enabled:true, pyro:{enabled:true,style:"rain",position:"overhead",color:"#FFFFFF",duration:7,frequency:1.2,height:.8,width:2.4,intensity:2,burstCount:5,behavior:"simultaneous"}, atmosphere:{type:"heavy_fog",color:"#A855F7",density:.86,spread:1,placement:"full",fade:7}, lighting:{enabled:false,blackout:true,spotlight:true,phoneLights:false,lightning:true,primaryColor:"#A855F7",secondaryColor:"#3B82F6",motion:"none",speed:1}, filter:{mode:"purple",intensity:.6}, screenFx:{effect:"lightning",shake:1,flash:.8}, nameplate:{enabled:true,style:"steel",glow:false,animation:"fade"}, timing:{totalDuration:9} } },
  epic_electrifying: { tier:"epic", name:"Epic — Electrifying", config:{ enabled:true, pyro:{enabled:true,style:"multi_burst",position:"full",color:"#FFFFFF",duration:5,frequency:.7,height:.82,width:1.5,intensity:3,burstCount:5,behavior:"wave"}, atmosphere:{type:"none"}, lighting:{enabled:true,blackout:false,spotlight:true,primaryColor:"#3B82F6",secondaryColor:"#FFFFFF",motion:"search",speed:.75}, filter:{mode:"blue",intensity:.4}, screenFx:{effect:"lightning",shake:1,flash:.75}, nameplate:{enabled:true,style:"arena",glow:true,animation:"slide"} } },
  epic_savage_fire: { tier:"epic", name:"Epic — Savage Fire", config:{ enabled:true, pyro:{enabled:true,style:"alternating_flames",position:"full",color:"#F97316",duration:6,frequency:.45,height:.88,width:1.4,intensity:3,burstCount:6,behavior:"alternating"}, atmosphere:{type:"smoke",color:"#EF4444",density:.5,spread:.8,placement:"floor",fade:5}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#EF4444",secondaryColor:"#F97316",motion:"pulse",speed:.55}, filter:{mode:"warm",intensity:.55}, nameplate:{enabled:true,style:"steel",glow:true,animation:"pop"} } },
  epic_rainmaker: { tier:"epic", name:"Epic — Rainmaker", config:{ enabled:true, pyro:{enabled:true,style:"curtain",position:"overhead",color:"#F59E0B",duration:8,frequency:1.2,height:.9,width:2.8,intensity:3,burstCount:6,behavior:"simultaneous"}, atmosphere:{type:"mist",color:"#FFFFFF",density:.25,spread:1,placement:"full",fade:6}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#F59E0B",secondaryColor:"#FFFFFF",motion:"fan",speed:.8}, filter:{mode:"gold",intensity:.4}, nameplate:{enabled:true,style:"arena",glow:true,animation:"fade"}, timing:{totalDuration:9} } },
  champion_burst: { tier:"champion", name:"Champion — Burst", config:{ enabled:true, pyro:{enabled:true,style:"finale",position:"full",color:"#F59E0B",duration:7,frequency:.55,height:.95,width:2.4,intensity:4,burstCount:7,behavior:"wave"}, atmosphere:{type:"smoke",color:"#FFFFFF",density:.5,spread:.9,placement:"full",fade:5}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#F59E0B",secondaryColor:"#FFFFFF",motion:"champion",speed:.65,brightness:1,beamWidth:1.4,fixtureCount:8}, filter:{mode:"gold",intensity:.5}, screenFx:{effect:"flash",shake:1,flash:.8}, nameplate:{enabled:true,style:"championship",glow:true,animation:"pop"}, timing:{totalDuration:10} } },
  champion_thunder_crown: { tier:"champion", name:"Champion — Thunder Crown", config:{ enabled:true, pyro:{enabled:true,style:"dual_center",position:"center",color:"#F59E0B",duration:6,frequency:.7,height:.88,width:1.4,intensity:4,burstCount:5,behavior:"rapid"}, atmosphere:{type:"smoke",color:"#FFFFFF",density:.6,spread:.85,placement:"full",fade:5}, lighting:{enabled:true,blackout:true,spotlight:true,lightning:true,primaryColor:"#F59E0B",secondaryColor:"#FFFFFF",motion:"fan",speed:.8,brightness:1,beamWidth:1.3,fixtureCount:8}, filter:{mode:"gold",intensity:.5}, screenFx:{effect:"lightning",shake:2,flash:1}, nameplate:{enabled:true,style:"championship",glow:true,animation:"pop"}, timing:{totalDuration:9} } },
  epic_dark_arrival: { tier:"epic", name:"Epic — Dark Arrival", config:{ enabled:true, pyro:{enabled:false}, atmosphere:{type:"heavy_fog",color:"#6D28D9",density:.75,spread:1,placement:"floor",fade:8}, lighting:{enabled:true,blackout:true,spotlight:true,primaryColor:"#6D28D9",secondaryColor:"#FFFFFF",motion:"search",speed:1.5,brightness:.45,beamWidth:.8,fixtureCount:4}, filter:{mode:"desaturated",intensity:.45}, nameplate:{enabled:true,style:"minimal",glow:false,animation:"fade"}, timing:{totalDuration:9} } }
};

function mergeEntranceConfig(value) {
  const d = entranceDefaults();
  const raw = value && typeof value === "object" ? value : {};
  return {
    ...d, ...raw,
    pyro: { ...d.pyro, ...(raw.pyro || {}) },
    atmosphere: { ...d.atmosphere, ...(raw.atmosphere || {}) },
    lighting: { ...d.lighting, ...(raw.lighting || {}) },
    filter: { ...d.filter, ...(raw.filter || {}) },
    screenFx: { ...d.screenFx, ...(raw.screenFx || {}) },
    nameplate: { ...d.nameplate, ...(raw.nameplate || {}) },
    timing: { ...d.timing, ...(raw.timing || {}) }
  };
}

function entranceTierText(tier) {
  return String(tier || "none").toUpperCase();
}

function fillEntranceRanges() {
  el("entrancePyroDurationValue").textContent = `${Number(el("entrancePyroDurationInput").value).toFixed(1)} sec`;
  el("entrancePyroFrequencyValue").textContent = `every ${Number(el("entrancePyroFrequencyInput").value).toFixed(2)} sec`;
  el("entrancePyroHeightValue").textContent = `${Math.round(Number(el("entrancePyroHeightInput").value) * 100)}%`;
  el("entrancePyroWidthValue").textContent = `${Number(el("entrancePyroWidthInput").value).toFixed(1)}×`;
  el("entrancePyroBurstCountValue").textContent = `${el("entrancePyroBurstCountInput").value} burst${Number(el("entrancePyroBurstCountInput").value) === 1 ? "" : "s"}`;
  updateEntranceSummary();
}

function currentEntranceForm() {
  return {
    enabled: el("entranceEnabledInput").checked,
    wrestlingName: el("entranceWrestlingNameInput").value.trim(), subtitle: el("entranceSubtitleInput").value.trim(),
    pyro: { enabled: el("entrancePyroEnabledInput").checked, style: el("entrancePyroStyleSelect").value, position: el("entrancePyroPositionSelect").value, color: el("entrancePyroColorInput").value, duration:+el("entrancePyroDurationInput").value, frequency:+el("entrancePyroFrequencyInput").value, height:+el("entrancePyroHeightInput").value, width:+el("entrancePyroWidthInput").value, intensity:+el("entrancePyroIntensitySelect").value, burstCount:+el("entrancePyroBurstCountInput").value, behavior:el("entrancePyroBehaviorSelect").value },
    atmosphere: { type:el("entranceAtmosphereSelect").value, color:el("entranceAtmosphereColorInput").value, density:+el("entranceAtmosphereDensityInput").value, spread:+el("entranceAtmosphereSpreadInput").value, placement:el("entranceAtmospherePlacementSelect").value, fade:+el("entranceAtmosphereFadeInput").value },
    lighting: { enabled:el("entranceLightingEnabledInput").checked, blackout:el("entranceBlackoutInput").checked, spotlight:el("entranceSpotlightInput").checked, phoneLights:el("entrancePhoneLightsInput").checked, lightning:el("entranceLightningInput").checked, primaryColor:el("entranceLightPrimaryInput").value, secondaryColor:el("entranceLightSecondaryInput").value, motion:el("entranceLightMotionSelect").value, speed:+el("entranceLightSpeedInput").value, brightness:+el("entranceLightBrightnessInput").value, beamWidth:+el("entranceLightBeamWidthInput").value, fixtureCount:+el("entranceLightFixtureCountInput").value },
    filter: { mode:el("entranceFilterSelect").value, intensity:+el("entranceFilterIntensityInput").value },
    screenFx: { effect:el("entranceScreenFxSelect").value, shake:+el("entranceScreenShakeInput").value, flash:+el("entranceScreenFlashInput").value, lingerCracks:el("entranceGlassLingerInput").checked },
    nameplate: { enabled:el("entranceNameplateEnabledInput").checked, style:el("entranceNameplateStyleSelect").value, glow:el("entranceNameplateGlowInput").checked, animation:el("entranceNameplateAnimationSelect").value },
    timing: { totalDuration:+el("entranceTotalDurationInput").value, entranceDelay:+el("entranceDelayInput").value, nameplateStart:+el("entranceNameplateStartInput").value, pyroStart:+el("entrancePyroStartInput").value, atmosphereStart:+el("entranceAtmosphereStartInput").value, screenFxStart:+el("entranceScreenFxStartInput").value }
  };
}

function setEntranceForm(config) {
  const c=mergeEntranceConfig(config);
  el("entranceEnabledInput").checked=!!c.enabled; el("entranceWrestlingNameInput").value=c.wrestlingName||activeProfile?.user?.username||""; el("entranceSubtitleInput").value=c.subtitle||"";
  el("entrancePyroEnabledInput").checked=c.pyro.enabled!==false; el("entrancePyroStyleSelect").value=c.pyro.style; el("entrancePyroPositionSelect").value=c.pyro.position||"both"; el("entrancePyroColorInput").value=c.pyro.color||"#FFFFFF"; el("entrancePyroDurationInput").value=c.pyro.duration; el("entrancePyroFrequencyInput").value=c.pyro.frequency; el("entrancePyroHeightInput").value=c.pyro.height; el("entrancePyroWidthInput").value=c.pyro.width; el("entrancePyroIntensitySelect").value=String(c.pyro.intensity); el("entrancePyroBurstCountInput").value=c.pyro.burstCount||3; el("entrancePyroBehaviorSelect").value=c.pyro.behavior||"simultaneous";
  el("entranceAtmosphereSelect").value=c.atmosphere.type; el("entranceAtmosphereColorInput").value=c.atmosphere.color||"#FFFFFF"; el("entranceAtmosphereDensityInput").value=c.atmosphere.density; el("entranceAtmosphereSpreadInput").value=c.atmosphere.spread??.75; el("entranceAtmospherePlacementSelect").value=c.atmosphere.placement||"floor"; el("entranceAtmosphereFadeInput").value=c.atmosphere.fade||4;
  el("entranceLightingEnabledInput").checked=c.lighting.enabled!==false; el("entranceBlackoutInput").checked=!!c.lighting.blackout; el("entranceSpotlightInput").checked=!!c.lighting.spotlight; el("entrancePhoneLightsInput").checked=!!c.lighting.phoneLights; el("entranceLightningInput").checked=!!c.lighting.lightning; el("entranceLightPrimaryInput").value=c.lighting.primaryColor||"#FFFFFF"; el("entranceLightSecondaryInput").value=c.lighting.secondaryColor||"#FFFFFF"; el("entranceLightMotionSelect").value=c.lighting.motion; el("entranceLightSpeedInput").value=c.lighting.speed; el("entranceLightBrightnessInput").value=c.lighting.brightness??.65; el("entranceLightBeamWidthInput").value=c.lighting.beamWidth??1; el("entranceLightFixtureCountInput").value=c.lighting.fixtureCount??6;
  el("entranceFilterSelect").value=c.filter.mode||"none"; el("entranceFilterIntensityInput").value=c.filter.intensity??.55; el("entranceScreenFxSelect").value=c.screenFx.effect||"none"; el("entranceScreenShakeInput").value=c.screenFx.shake??1; el("entranceScreenFlashInput").value=c.screenFx.flash??.6; el("entranceGlassLingerInput").checked=!!c.screenFx.lingerCracks;
  el("entranceNameplateEnabledInput").checked=c.nameplate.enabled!==false; el("entranceNameplateStyleSelect").value=c.nameplate.style; el("entranceNameplateGlowInput").checked=!!c.nameplate.glow; el("entranceNameplateAnimationSelect").value=c.nameplate.animation||"slide";
  el("entranceTotalDurationInput").value=c.timing.totalDuration||6; el("entranceDelayInput").value=c.timing.entranceDelay||0; el("entranceNameplateStartInput").value=c.timing.nameplateStart??.6; el("entrancePyroStartInput").value=c.timing.pyroStart??1; el("entranceAtmosphereStartInput").value=c.timing.atmosphereStart??.3; el("entranceScreenFxStartInput").value=c.timing.screenFxStart??.8;
  fillEntranceRanges(); setEntranceControlAvailability();
}

function updateEntranceSummary(){
  const target=el("entranceSummary"); if(!target)return; const c=currentEntranceForm();
  const parts=[c.pyro.enabled?c.pyro.style.replaceAll("_"," ").toUpperCase():"NO PYRO", c.atmosphere.type!=="none"?c.atmosphere.type.replaceAll("_"," ").toUpperCase():"NO ATMOSPHERE", c.lighting.enabled?`${c.lighting.motion.toUpperCase()} LIGHTS`:"NO RIG", c.screenFx.effect!=="none"?c.screenFx.effect.replaceAll("_"," ").toUpperCase():null].filter(Boolean); target.textContent=parts.join(" · ");
}


function currentEntranceTier() {
  return state.currentUser?.role === "admin" ? el("entranceTierSelect").value : (activeProfile?.entrance?.tier || "none");
}

function populateEntranceTemplates() {
  const select = el("entranceTemplateSelect");
  const tier = currentEntranceTier();
  const maxRank = ENTRANCE_TIER_RANK[tier] || 0;
  select.innerHTML = "";
  Object.entries(ENTRANCE_TEMPLATES).forEach(([key, template]) => {
    if ((ENTRANCE_TIER_RANK[template.tier] || 0) > maxRank) return;
    const option = document.createElement("option");
    option.value = key;
    option.textContent = template.name;
    select.appendChild(option);
  });
  if (!select.options.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No templates unlocked";
    select.appendChild(option);
  }
}

function applyEntranceTemplate() {
  const template = ENTRANCE_TEMPLATES[el("entranceTemplateSelect").value];
  if (!template) return;
  const current = currentEntranceForm();
  setEntranceForm({
    ...current,
    ...template.config,
    wrestlingName: current.wrestlingName,
    subtitle: current.subtitle,
    pyro: { ...current.pyro, ...(template.config.pyro || {}) },
    atmosphere: { ...current.atmosphere, ...(template.config.atmosphere || {}) },
    lighting: { ...current.lighting, ...(template.config.lighting || {}) },
    filter: { ...current.filter, ...(template.config.filter || {}) },
    screenFx: { ...current.screenFx, ...(template.config.screenFx || {}) },
    nameplate: { ...current.nameplate, ...(template.config.nameplate || {}) },
    timing: { ...current.timing, ...(template.config.timing || {}) }
  });
  setEntranceControlAvailability();
  el("entranceMessage").className = "message success";
  el("entranceMessage").textContent = `${template.name} template applied. Customize anything you want before saving.`;
}

function setEntranceControlAvailability() {
  const pyroEnabled=el("entrancePyroEnabledInput").checked;
  ["entrancePyroStyleSelect","entrancePyroPositionSelect","entrancePyroColorInput","entrancePyroDurationInput","entrancePyroFrequencyInput","entrancePyroHeightInput","entrancePyroWidthInput","entrancePyroIntensitySelect","entrancePyroBurstCountInput","entrancePyroBehaviorSelect"].forEach(id=>el(id).disabled=!pyroEnabled);
  const rigEnabled=el("entranceLightingEnabledInput").checked;
  ["entranceLightPrimaryInput","entranceLightSecondaryInput","entranceLightMotionSelect","entranceLightSpeedInput","entranceLightBrightnessInput","entranceLightBeamWidthInput","entranceLightFixtureCountInput"].forEach(id=>el(id).disabled=!rigEnabled);
  const nameplateEnabled=el("entranceNameplateEnabledInput").checked;
  ["entranceNameplateStyleSelect","entranceNameplateGlowInput","entranceNameplateAnimationSelect"].forEach(id=>el(id).disabled=!nameplateEnabled);
  updateEntranceSummary();
}

function setEntranceEditorMode(mode){
  const advanced=mode==="advanced"; el("entranceForm").classList.toggle("show-advanced",advanced); el("entranceBasicModeButton").classList.toggle("is-active",!advanced); el("entranceAdvancedModeButton").classList.toggle("is-active",advanced); localStorage.setItem("chatroom_entrance_editor_mode",advanced?"advanced":"basic");
}
function resetEntranceForm(){ setEntranceForm(entranceDefaults()); el("entranceMessage").className="message"; el("entranceMessage").textContent="Entrance reset locally. Press SAVE to keep the reset."; }

function applyEntranceTierUI() {
  const isAdminViewer = state.currentUser?.role === "admin";
  const tier = currentEntranceTier();
  el("entranceTierLabel").textContent = entranceTierText(tier);
  const locked = tier === "none";
  el("entranceLockedMessage").classList.toggle("hidden", !locked);
  [...el("entranceForm").querySelectorAll("input,select,button")].forEach((control) => {
    if (control.id === "entranceTriggerButton" && isAdminViewer) return;
    control.disabled = locked;
  });
  const palette = tier === "champion" ? "any custom color" : tier === "epic" ? "white, blue, red, green, purple, gold, cyan, or pink" : tier === "rare" ? "white, blue, red, green, or purple" : "white only";
  el("entrancePaletteNote").textContent = `Your ${entranceTierText(tier)} status allows ${palette}. You can turn pyro and the overhead rig off entirely. Filter presets are available at every unlocked level.`;
  el("entranceNameplateStyleSelect").querySelector('option[value="championship"]').disabled = tier !== "champion";
  const rank=ENTRANCE_TIER_RANK[tier]||0;
  ["wide_fountain","fan","center_blast","dual_center","multi_burst"].forEach(v=>{const o=el("entrancePyroStyleSelect").querySelector(`option[value="${v}"]`); if(o)o.disabled=rank<2;});
  ["flame_jets","alternating_flames","rain","curtain","finale"].forEach(v=>{const o=el("entrancePyroStyleSelect").querySelector(`option[value="${v}"]`); if(o)o.disabled=rank<3;});
  ["glass_shatter","lightning"].forEach(v=>{const o=el("entranceScreenFxSelect").querySelector(`option[value="${v}"]`); if(o)o.disabled=rank<3;});
  const maxIntensity=el("entrancePyroIntensitySelect").querySelector('option[value="4"]'); if(maxIntensity)maxIntensity.disabled=tier!=="champion";
  populateEntranceTemplates();
  if (!locked) setEntranceControlAvailability();
}

function openEntranceEditor(profileData) {
  activeProfile = profileData;
  const isAdminViewer = state.currentUser?.role === "admin";
  el("entranceMemberName").textContent = `${profileData.user.username} — Entrance`;
  el("entranceAdminTierRow").classList.toggle("hidden", !isAdminViewer);
  el("entranceTriggerButton").classList.toggle("hidden", !isAdminViewer);
  el("entranceTierSelect").value = profileData.entrance?.tier || "none";
  setEntranceForm(profileData.entrance?.config || null);
  applyEntranceTierUI();
  el("entranceMessage").textContent = "";
  el("entranceOverlay").classList.remove("hidden");
  setEntranceEditorMode(localStorage.getItem("chatroom_entrance_editor_mode") || "basic");
}

function closeEntranceEditor() {
  el("entranceOverlay").classList.add("hidden");
}

async function saveEntrance(event) {
  event.preventDefault();
  if (!activeProfile?.user?.username) return;
  const message = el("entranceMessage");
  message.className = "message";
  message.textContent = "Saving entrance...";
  const body = { entrance: currentEntranceForm() };
  if (state.currentUser?.role === "admin") {
    body.username = activeProfile.user.username;
    body.tier = el("entranceTierSelect").value;
  }
  try {
    const { response, data } = await apiFetch("/profile/entrance", { method: "POST", body: JSON.stringify(body) }, true);
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save entrance.");
    activeProfile = data;
    message.className = "message success";
    message.textContent = "Entrance saved. It will play the next time this member enters the room.";
    applyEntranceTierUI();
  } catch (error) {
    message.className = "message error";
    message.textContent = error.message || "Could not save entrance.";
  }
}

function previewEntrance() {
  const tier = currentEntranceTier();
  el("entranceOverlay").classList.add("hidden");
  window.dispatchEvent(new CustomEvent("drk:preview-entrance", { detail: { username: activeProfile?.user?.username || state.currentUser?.username, entrance: { tier, config: currentEntranceForm() } } }));
  setTimeout(() => {
    if (activeProfile?.user?.username) el("entranceOverlay").classList.remove("hidden");
  }, 8200);
}

function triggerEntranceNow() {
  if (state.currentUser?.role !== "admin" || !activeProfile?.user?.username) return;
  window.dispatchEvent(new CustomEvent("drk:trigger-entrance", { detail: { username: activeProfile.user.username } }));
  closeEntranceEditor();
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
  [
    "profileAvatarSkinInput",
    "profileAvatarEyesSelect",
    "profileAvatarEarsSelect",
    "profileAvatarHornsSelect",
    "profileAvatarMouthSelect",
    "profileAvatarEyebrowsSelect",
    "profileAvatarNoseSelect",
    "profileAvatarHairSelect",
    "profileAvatarEyeglassesInput",
    "profileAvatarSunglassesInput",
    "profileAvatarNosePiercingInput",
    "profileAvatarEarPiercingSelect",
    "profileAvatarEyebrowPiercingInput",
    "profileAvatarLipPiercingInput"
  ].forEach((id) => el(id).addEventListener("input", updateAvatarEditorPreview));
  el("profileAvatarEyeglassesInput").addEventListener("change", () => { if (el("profileAvatarEyeglassesInput").checked) el("profileAvatarSunglassesInput").checked = false; updateAvatarEditorPreview(); });
  el("profileAvatarSunglassesInput").addEventListener("change", () => { if (el("profileAvatarSunglassesInput").checked) el("profileAvatarEyeglassesInput").checked = false; updateAvatarEditorPreview(); });
  el("profileEditForm").addEventListener("submit", saveProfile);
  el("profileSaveRewardsButton").addEventListener("click", saveRewardDisplay);
  el("myProfileButton").addEventListener("click", openOwnProfile);
  el("entranceCloseButton").addEventListener("click", closeEntranceEditor);
  el("entranceOverlay").addEventListener("click", (event) => { if (event.target === el("entranceOverlay")) closeEntranceEditor(); });
  el("entranceForm").addEventListener("submit", saveEntrance);
  el("entrancePreviewButton").addEventListener("click", previewEntrance);
  el("entranceTriggerButton").addEventListener("click", triggerEntranceNow);
  el("entranceTierSelect").addEventListener("change", applyEntranceTierUI);
  el("entranceApplyTemplateButton").addEventListener("click", applyEntranceTemplate);
  el("entrancePyroEnabledInput").addEventListener("change", setEntranceControlAvailability);
  el("entranceLightingEnabledInput").addEventListener("change", setEntranceControlAvailability);
  el("entranceNameplateEnabledInput").addEventListener("change", setEntranceControlAvailability);
  el("entranceBasicModeButton").addEventListener("click",()=>setEntranceEditorMode("basic"));
  el("entranceAdvancedModeButton").addEventListener("click",()=>setEntranceEditorMode("advanced"));
  el("entranceResetButton").addEventListener("click",resetEntranceForm);
  ["entrancePyroDurationInput","entrancePyroFrequencyInput","entrancePyroHeightInput","entrancePyroWidthInput","entrancePyroBurstCountInput","entrancePyroStyleSelect","entranceAtmosphereSelect","entranceLightMotionSelect","entranceScreenFxSelect"].forEach((id)=>el(id).addEventListener("input",fillEntranceRanges));
}
