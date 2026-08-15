import { apiFetch } from "./api.js?v=0.18.12";
import { state } from "./state.js?v=0.18.12";
import { openMemberByUsername } from "./admin.js?v=0.18.12";

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
    ["Entrance rank", String(data.entrance?.tier || "basic").toUpperCase()],
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


const ENTRANCE_TIER_RANK = { basic: 1, rare: 2, epic: 3, champion: 4 };
const ENTRANCE_COLOR_PALETTES = {
  lighting: {
    basic: ["#FFFFFF", "#3B82F6"],
    rare: ["#FFFFFF", "#3B82F6", "#EF4444", "#22C55E", "#A855F7"],
    epic: ["#FFFFFF", "#3B82F6", "#EF4444", "#22C55E", "#A855F7", "#F59E0B", "#06B6D4", "#EC4899"],
    champion: null
  },
  pyro: {
    basic: ["#FFFFFF"],
    rare: ["#FFFFFF", "#3B82F6", "#EF4444", "#22C55E", "#A855F7", "#F59E0B"],
    epic: ["#FFFFFF", "#3B82F6", "#EF4444", "#22C55E", "#A855F7", "#F59E0B", "#06B6D4", "#EC4899"],
    champion: null
  },
  atmosphere: {
    basic: ["#FFFFFF"], rare: ["#FFFFFF"],
    epic: ["#FFFFFF", "#3B82F6", "#EF4444", "#22C55E", "#A855F7", "#F59E0B", "#06B6D4", "#EC4899"],
    champion: null
  }
};


const ENTRANCE_PYRO_FLASH_STYLES = new Set(["jets","cross_jets","sparkler_lane","center_blast","dual_center","multi_burst","full_stage","finale"]);
function syncPyroFlashDefault(){ const style=el("entrancePyroStyleSelect")?.value||"jets"; el("entrancePyroFlashBurstInput").checked=ENTRANCE_PYRO_FLASH_STYLES.has(style); }

function entranceDefaults() {
  return {
    enabled: false,
    templatePreset: "custom",
    wrestlingName: "",
    subtitle: "",
    signatureEffect: "none",
    pyro: { preset:"far_jets", enabled: true, style: "jets", position: "both", color: "#FFFFFF", duration: 3.5, frequency: 1.1, height: 0.58, width: 0.9, intensity: 1, burstCount: 2, behavior: "simultaneous", flashBurst:true, layeredEffects:false },
    atmosphere: { preset:"none", type: "none", color: "#FFFFFF", density: 0.45, spread: 0.75, placement: "floor", fade: 4 },
    lighting: { enabled: true, preset:"downlights", dimming: "none", blackout: false, spotlight: false, phoneLights: false, lightning: false, branchingLightning:false, primaryColor: "#FFFFFF", secondaryColor: "#3B82F6", motion: "none", aim:"down", behavior:"steady", speed: 1, brightness: 0.6, beamWidth: 0.9, fixtureCount: 4, fixtures:[] },
    filter: { mode: "none", intensity: 0.45 },
    screenFx: { preset:"none", effect: "none", shake: 1, flash: 0.6, lingerCracks: false },
    nameplate: { enabled: true, style: "arena", glow: true, animation: "slide" },
    timing: { totalDuration: 5, entranceDelay: 0, nameplateStart: 0.6, pyroStart: 1, atmosphereStart: 0.3, screenFxStart: 0.8 }
  };
}

const ENTRANCE_LIGHTING_PRESETS = {
  center_focus:{tier:"basic",name:"Center Focus",description:"Still center-stage focus.",config:{preset:"center_focus",fixtureCount:4,motion:"none",aim:"center",behavior:"steady",brightness:.6,beamWidth:.9,speed:1}},
  wide_sweep:{tier:"basic",name:"Wide Sweep",description:"Simple opposing sweeps across center.",config:{preset:"wide_sweep",fixtureCount:4,motion:"sweep",aim:"center",behavior:"steady",brightness:.62,beamWidth:1,speed:1.2}},
  downlights:{tier:"basic",name:"Downlights",description:"Straight-down stage wash.",config:{preset:"downlights",fixtureCount:4,motion:"none",aim:"down",behavior:"steady",brightness:.58,beamWidth:1.05,speed:1}},
  crossfire:{tier:"rare",name:"Crossfire",description:"Left/right beams cross the stage.",config:{preset:"crossfire",fixtureCount:6,motion:"cross",aim:"center",behavior:"steady",brightness:.72,beamWidth:1.15,speed:.95}},
  fan_out:{tier:"rare",name:"Fan Out",description:"A wide mirrored fan across the arena.",config:{preset:"fan_out",fixtureCount:6,motion:"fan",aim:"outward",behavior:"steady",brightness:.72,beamWidth:1.2,speed:1}},
  alternating_pulse:{tier:"rare",name:"Alternating Pulse",description:"Odd/even lights trade brightness.",config:{preset:"alternating_pulse",fixtureCount:6,motion:"none",aim:"center",behavior:"alternating",brightness:.78,beamWidth:1.05,speed:.85}},
  arena_chase:{tier:"rare",name:"Arena Chase",description:"A brightness chase travels across the rig.",config:{preset:"arena_chase",fixtureCount:6,motion:"sweep",aim:"center",behavior:"chase",brightness:.78,beamWidth:1.05,speed:.75}},
  mirror_sweep:{tier:"rare",name:"Mirror Sweep",description:"Mirrored fixtures sweep toward and away from center.",config:{preset:"mirror_sweep",fixtureCount:6,motion:"sweep",aim:"center",behavior:"steady",brightness:.76,beamWidth:1.05,speed:1.05}},
  cold_impact:{tier:"epic",name:"Cold Impact",description:"White and icy-blue mirrored sweeps with alternating impact pulses.",config:{preset:"cold_impact",fixtureCount:8,motion:"sweep",aim:"ramp",behavior:"alternating",primaryColor:"#FFFFFF",secondaryColor:"#3B82F6",brightness:.95,beamWidth:1.05,speed:.72}},
  search_party:{tier:"epic",name:"Search Party",description:"Independent roaming searchlights.",config:{preset:"search_party",fixtureCount:8,motion:"search",aim:"center",behavior:"steady",brightness:.78,beamWidth:.85,speed:1.35}},
  converge:{tier:"epic",name:"Converge",description:"Beams sweep inward toward center stage.",config:{preset:"converge",fixtureCount:8,motion:"converge",aim:"center",behavior:"pulse",brightness:.82,beamWidth:1,speed:1.25}},
  spotlight_hit:{tier:"epic",name:"Spotlight Hit",description:"A tight, dramatic center-stage light cluster.",config:{preset:"spotlight_hit",fixtureCount:8,motion:"none",aim:"center",behavior:"pulse",brightness:.95,beamWidth:.65,speed:.55}},
  rolling_wave:{tier:"epic",name:"Rolling Wave",description:"Movement and brightness ripple across the rig.",config:{preset:"rolling_wave",fixtureCount:8,motion:"pendulum",aim:"center",behavior:"chase",brightness:.82,beamWidth:1.1,speed:.9}},
  figure_eight:{tier:"epic",name:"Figure Eight",description:"Offset figure-eight moving heads.",config:{preset:"figure_eight",fixtureCount:8,motion:"figure8",aim:"center",behavior:"steady",brightness:.8,beamWidth:.9,speed:1.3}},
  dark_search:{tier:"epic",name:"Dark Search",description:"Dim narrow searchlights cutting through darkness.",config:{preset:"dark_search",fixtureCount:8,motion:"search",aim:"outward",behavior:"steady",brightness:.48,beamWidth:.62,speed:1.7,dimming:"blackout"}},
  gold_shimmer:{tier:"champion",name:"Gold Shimmer",description:"Alternating gold pulses with opposing motion groups.",config:{preset:"gold_shimmer",fixtureCount:8,motion:"converge",aim:"center",behavior:"shimmer",primaryColor:"#F5C94A",secondaryColor:"#FFF0A6",brightness:1,beamWidth:1.35,speed:.85}},
  royal_convergence:{tier:"champion",name:"Royal Convergence",description:"Gold beams slowly converge and breathe together.",config:{preset:"royal_convergence",fixtureCount:8,motion:"converge",aim:"center",behavior:"pulse",primaryColor:"#F5C94A",secondaryColor:"#FFF0A6",brightness:.95,beamWidth:1.2,speed:1.35}},
  crown_chase:{tier:"champion",name:"Crown Chase",description:"A gold chase travels through a sweeping rig.",config:{preset:"crown_chase",fixtureCount:8,motion:"sweep",aim:"center",behavior:"chase",primaryColor:"#F5C94A",secondaryColor:"#FFF0A6",brightness:1,beamWidth:1.15,speed:.62}},
  controlled_chaos:{tier:"champion",name:"Controlled Chaos",description:"Mixed movement groups with synchronized pulse points.",config:{preset:"controlled_chaos",fixtureCount:8,motion:"search",aim:"center",behavior:"alternating",brightness:.95,beamWidth:1,speed:.72}},
  lightning_hit:{tier:"champion",name:"Lightning Hit",description:"Center snap and white flash on the lightning cue.",config:{preset:"lightning_hit",fixtureCount:8,motion:"converge",aim:"center",behavior:"pulse",brightness:1,beamWidth:1.25,speed:.8,lightning:true}}
};

function buildLightingPresetFixtures(preset, lighting={}) {
  const count=Math.max(2,Math.min(8,Math.round(Number(lighting.fixtureCount||4))));
  const items=[];
  for(let i=0;i<count;i+=1){
    const odd=i%2===0;
    const fixture={enabled:true,color:undefined,brightness:undefined,aim:"inherit",motion:"inherit",speed:undefined,behavior:"inherit",direction:"normal",phase:count>1?i/(count-1):0,range:1};
    if(preset==="mirror_sweep") fixture.direction=odd?"normal":"reverse";
    if(preset==="cold_impact"){fixture.direction=odd?"normal":"reverse";fixture.aim=i%4<2?"ramp":"center";fixture.motion="sweep";fixture.behavior="alternating";fixture.phase=odd?0:.5;}
    if(preset==="search_party"){fixture.motion="search";fixture.aim=["crowd_left","center","crowd_right","outward"][i%4];fixture.speed=.9+(i%4)*.22;}
    if(preset==="rolling_wave"){fixture.motion="pendulum";fixture.behavior="pulse";fixture.phase=i/count;}
    if(preset==="figure_eight"){fixture.motion="figure8";fixture.direction=odd?"normal":"reverse";fixture.phase=i/count;}
    if(preset==="gold_shimmer"){fixture.motion=odd?"converge":"diverge";fixture.behavior="shimmer";fixture.direction=odd?"normal":"reverse";fixture.phase=odd?0:.5;}
    if(preset==="controlled_chaos"){fixture.motion=["search","circle","figure8","pendulum"][i%4];fixture.aim=["center","crowd_left","crowd_right","outward"][i%4];fixture.behavior=i%3===0?"pulse":"steady";fixture.direction=odd?"normal":"reverse";fixture.phase=i/count;}
    items.push(fixture);
  }
  return items;
}


const ENTRANCE_PYRO_PRESETS = {
  far_jets:{tier:"basic",name:"Two Far-Side Jets",config:{preset:"far_jets",enabled:true,style:"jets",position:"both",color:"#FFFFFF",duration:2.5,frequency:1.2,height:.48,width:.7,intensity:1,burstCount:1,behavior:"simultaneous",flashBurst:true,layeredEffects:false}},
  inner_jets:{tier:"basic",name:"Two Near-Middle Jets",config:{preset:"inner_jets",enabled:true,style:"jets",position:"inner",color:"#FFFFFF",duration:2.5,frequency:1.2,height:.48,width:.7,intensity:1,burstCount:1,behavior:"simultaneous",flashBurst:true,layeredEffects:false}},
  side_fountains:{tier:"basic",name:"Side Fountains",config:{preset:"side_fountains",enabled:true,style:"fountain",position:"both",color:"#FFFFFF",duration:3.5,frequency:1.2,height:.58,width:.8,intensity:1,burstCount:2,behavior:"simultaneous",flashBurst:false,layeredEffects:false}},
  sparkler_walk:{tier:"rare",name:"Crackle Walk",config:{preset:"sparkler_walk",enabled:true,style:"sparkler_lane",position:"center",color:"#FFFFFF",duration:5,frequency:.55,height:.42,width:.8,intensity:2,burstCount:5,behavior:"wave",flashBurst:true,layeredEffects:false}},
  cross_x:{tier:"rare",name:"Crossing X Fireworks",config:{preset:"cross_x",enabled:true,style:"cross_jets",position:"both",color:"#FFFFFF",duration:3.6,frequency:.75,height:.78,width:1.15,intensity:2,burstCount:1,behavior:"simultaneous",flashBurst:true,layeredEffects:false}},
  center_blast:{tier:"rare",name:"Center Blast",config:{preset:"center_blast",enabled:true,style:"center_blast",position:"center",color:"#FFFFFF",duration:4,frequency:.9,height:.72,width:1.25,intensity:2,burstCount:2,behavior:"simultaneous",flashBurst:true,layeredEffects:false}},
  dual_center:{tier:"rare",name:"Dual Center Blast",config:{preset:"dual_center",enabled:true,style:"dual_center",position:"center",color:"#FFFFFF",duration:4.5,frequency:.8,height:.76,width:1.4,intensity:2,burstCount:3,behavior:"alternating",flashBurst:true,layeredEffects:false}},
  raining_pyro:{tier:"epic",name:"Raining Pyro",config:{preset:"raining_pyro",enabled:true,style:"rain",position:"overhead",color:"#FFFFFF",duration:7,frequency:1.2,height:.8,width:2.4,intensity:2,burstCount:5,behavior:"simultaneous",flashBurst:false,layeredEffects:false}},
  spark_curtain:{tier:"epic",name:"Spark Curtain",config:{preset:"spark_curtain",enabled:true,style:"curtain",position:"overhead",color:"#FFFFFF",duration:7,frequency:1.1,height:.85,width:2.6,intensity:3,burstCount:5,behavior:"simultaneous",flashBurst:false,layeredEffects:false}},
  flame_wall:{tier:"epic",name:"Flame Wall",config:{preset:"flame_wall",enabled:true,style:"flame_wall",position:"full",color:"#EF4444",duration:6,frequency:.8,height:.88,width:1.4,intensity:3,burstCount:4,behavior:"simultaneous",flashBurst:false,layeredEffects:false}},
  finale:{tier:"champion",name:"Finale Burst",config:{preset:"finale",enabled:true,style:"finale",position:"full",color:"#F59E0B",duration:7,frequency:.55,height:1,width:3,intensity:4,burstCount:7,behavior:"rapid",flashBurst:true,layeredEffects:true}}
};

const ENTRANCE_ATMOSPHERE_PRESETS = {
  none:{tier:"basic",name:"None",config:{preset:"none",type:"none",color:"#FFFFFF",density:.45,spread:.75,placement:"floor",fade:4}},
  low_fog:{tier:"epic",name:"Low Fog",config:{preset:"low_fog",type:"fog",color:"#FFFFFF",density:.42,spread:.9,placement:"floor",fade:5}},
  rolling_fog:{tier:"epic",name:"Rolling Fog",config:{preset:"rolling_fog",type:"heavy_fog",color:"#FFFFFF",density:.7,spread:1,placement:"floor",fade:7}},
  smoke_jets:{tier:"epic",name:"Smoke Jets",config:{preset:"smoke_jets",type:"smoke",color:"#FFFFFF",density:.55,spread:.7,placement:"center",fade:4}},
  side_smoke:{tier:"epic",name:"Side Smoke",config:{preset:"side_smoke",type:"smoke",color:"#FFFFFF",density:.62,spread:.85,placement:"sides",fade:4}},
  heavy_fog:{tier:"epic",name:"Heavy Fog",config:{preset:"heavy_fog",type:"heavy_fog",color:"#FFFFFF",density:.86,spread:1,placement:"full",fade:7}},
  arena_haze:{tier:"epic",name:"Arena Haze",config:{preset:"arena_haze",type:"mist",color:"#FFFFFF",density:.24,spread:1,placement:"full",fade:7}}
};

const ENTRANCE_SCREEN_PRESETS = {
  none:{tier:"basic",name:"None",filter:{mode:"none",intensity:0},screenFx:{preset:"none",effect:"none",shake:0,flash:0,lingerCracks:false}},
  cold_blue:{tier:"rare",name:"Cold Blue",filter:{mode:"cool",intensity:.42},screenFx:{preset:"cold_blue",effect:"none",shake:0,flash:0,lingerCracks:false}},
  warm_arena:{tier:"rare",name:"Warm Arena",filter:{mode:"warm",intensity:.4},screenFx:{preset:"warm_arena",effect:"none",shake:0,flash:0,lingerCracks:false}},
  purple:{tier:"rare",name:"Purple",filter:{mode:"purple",intensity:.5},screenFx:{preset:"purple",effect:"none",shake:0,flash:0,lingerCracks:false}},
  red_alert:{tier:"rare",name:"Red Alert",filter:{mode:"red",intensity:.5},screenFx:{preset:"red_alert",effect:"none",shake:0,flash:0,lingerCracks:false}},
  glass_break:{tier:"epic",name:"Glass Break",filter:{mode:"none",intensity:0},screenFx:{preset:"glass_break",effect:"glass_shatter",shake:2,flash:1,lingerCracks:true}},
  static_glitch:{tier:"epic",name:"Static Glitch",filter:{mode:"cool",intensity:.3},screenFx:{preset:"static_glitch",effect:"glitch",shake:2,flash:.55,lingerCracks:false}},
  monochrome:{tier:"epic",name:"Monochrome",filter:{mode:"mono",intensity:.82},screenFx:{preset:"monochrome",effect:"none",shake:0,flash:0,lingerCracks:false}},
  high_contrast:{tier:"epic",name:"High Contrast",filter:{mode:"high_contrast",intensity:.6},screenFx:{preset:"high_contrast",effect:"none",shake:0,flash:0,lingerCracks:false}},
  gold_grade:{tier:"champion",name:"Champion Gold Grade",filter:{mode:"gold_contrast",intensity:.55},screenFx:{preset:"gold_grade",effect:"none",shake:0,flash:0,lingerCracks:false}},
  electric_blue:{tier:"champion",name:"Electric Blue",filter:{mode:"electric_blue",intensity:.55},screenFx:{preset:"electric_blue",effect:"none",shake:0,flash:0,lingerCracks:false}}
};

function populateSubsystemPresets(selectId,presets,selected="custom"){
  const select=el(selectId); if(!select)return; select.innerHTML="";
  Object.entries(presets).forEach(([key,preset])=>{if(key==="none")return;const option=document.createElement("option"),locked=(ENTRANCE_TIER_RANK[preset.tier]||1)>currentEntranceRank(); option.value=key; option.disabled=locked; option.textContent=`${locked?"🔒 ":""}${preset.name}${locked?` — ${entranceTierText(preset.tier)}`:""}`; select.appendChild(option);});
  const valid=[...select.options].find(o=>o.value===selected&&!o.disabled)||[...select.options].find(o=>!o.disabled); if(valid)select.value=valid.value;
}
function syncEntranceCategoryModes(openAdvanced=false){
  const specs=[["Pyro","entrancePyroModeSelect","entrancePyroPresetWrap","entranceApplyPyroPresetButton","entrancePyroCustomControls"],["Atmosphere","entranceAtmosphereModeSelect","entranceAtmospherePresetWrap","entranceApplyAtmospherePresetButton","entranceAtmosphereCustomControls"],["Lighting","entranceLightingModeSelect","entranceLightingPresetWrap","entranceApplyLightingPresetButton","entranceLightingCustomControls"],["Screen","entranceScreenModeSelect","entranceScreenPresetWrap","entranceApplyScreenPresetButton","entranceScreenCustomControls"]];
  let customChosen=false;
  specs.forEach(([,modeId,presetWrapId,buttonId,customId])=>{
    const mode=el(modeId)?.value||"custom", preset=mode==="preset", custom=mode==="custom";
    el(presetWrapId)?.classList.toggle("hidden",!preset);
    el(buttonId)?.classList.toggle("hidden",!preset);
    el(customId)?.classList.toggle("hidden",!custom);
    customChosen ||= custom;
  });
  // Keep the legacy enabled fields synchronized with the new None / Preset / Custom controls.
  if(el("entrancePyroEnabledInput"))el("entrancePyroEnabledInput").checked=el("entrancePyroModeSelect")?.value!=="none";
  if(el("entranceLightingEnabledInput"))el("entranceLightingEnabledInput").checked=el("entranceLightingModeSelect")?.value!=="none";
  if(openAdvanced&&customChosen)setEntranceEditorMode("advanced");
  setEntranceControlAvailability();
}
function applyEntrancePyroPreset(){const key=el("entrancePyroPresetSelect").value,preset=ENTRANCE_PYRO_PRESETS[key];if(!preset||(ENTRANCE_TIER_RANK[preset.tier]||1)>currentEntranceRank())return;const c=currentEntranceForm();setEntranceForm({...c,pyro:{...c.pyro,...preset.config,preset:key}});el("entrancePyroModeSelect").value="preset";syncEntranceCategoryModes(false);}
function applyEntranceAtmospherePreset(){const key=el("entranceAtmospherePresetSelect").value,preset=ENTRANCE_ATMOSPHERE_PRESETS[key];if(!preset||(ENTRANCE_TIER_RANK[preset.tier]||1)>currentEntranceRank())return;const c=currentEntranceForm();setEntranceForm({...c,atmosphere:{...c.atmosphere,...preset.config,preset:key}});el("entranceAtmosphereModeSelect").value="preset";syncEntranceCategoryModes(false);}
function applyEntranceScreenPreset(){const key=el("entranceScreenPresetSelect").value,preset=ENTRANCE_SCREEN_PRESETS[key];if(!preset||(ENTRANCE_TIER_RANK[preset.tier]||1)>currentEntranceRank())return;const c=currentEntranceForm();setEntranceForm({...c,filter:{...c.filter,...preset.filter},screenFx:{...c.screenFx,...preset.screenFx,preset:key}});el("entranceScreenModeSelect").value="preset";syncEntranceCategoryModes(false);}

const ENTRANCE_TEMPLATES = {
  basic_white_heat: { tier:"basic", name:"Basic — White Heat", config:{ enabled:true, signatureEffect:"white_heat_original", pyro:{preset:"side_fountains",enabled:true,style:"fountain",position:"both",color:"#FFFFFF",duration:3.5,frequency:1.1,height:.62,width:1,intensity:1,burstCount:2,behavior:"simultaneous",flashBurst:false}, atmosphere:{preset:"none",type:"none"}, lighting:{enabled:true,preset:"custom",dimming:"blackout",blackout:true,spotlight:true,phoneLights:false,lightning:false,primaryColor:"#FFFFFF",secondaryColor:"#FFFFFF",motion:"none",aim:"center",behavior:"steady",speed:1,brightness:.72,beamWidth:1,fixtureCount:4,fixtures:buildLightingPresetFixtures("center_focus",{fixtureCount:4})}, filter:{mode:"cinematic",intensity:.3}, screenFx:{preset:"none",effect:"none"}, nameplate:{enabled:true,style:"arena",glow:true,animation:"slide"}, timing:{totalDuration:5,pyroStart:1,nameplateStart:.5,atmosphereStart:.2,screenFxStart:.7} } },
  rare_green_rebellion: { tier:"rare", name:"Rare — Green Rebellion", config:{ enabled:true, pyro:{preset:"cross_x",enabled:true,style:"cross_jets",position:"both",color:"#22C55E",duration:4.8,frequency:.62,height:.8,width:1.18,intensity:2,burstCount:3,behavior:"simultaneous",flashBurst:true}, atmosphere:{type:"none"}, lighting:{enabled:true,dimming:"strong",blackout:false,spotlight:false,phoneLights:false,lightning:false,primaryColor:"#22C55E",secondaryColor:"#FFFFFF",motion:"fan",speed:.8,brightness:.76,beamWidth:1.2,fixtureCount:6}, filter:{mode:"none",intensity:0}, screenFx:{effect:"none"}, nameplate:{enabled:true,style:"neon",glow:true,animation:"fade"}, timing:{totalDuration:7.5,pyroStart:.25,nameplateStart:.55} } },
  rare_monochrome_invasion: { tier:"rare", name:"Rare — Monochrome Invasion", config:{ enabled:true, pyro:{enabled:true,style:"wide_fountain",position:"both",color:"#FFFFFF",duration:4.5,frequency:1,height:.7,width:1.7,intensity:2,burstCount:3,behavior:"outside_in"}, atmosphere:{type:"none"}, lighting:{enabled:true,dimming:"strong",blackout:false,spotlight:false,phoneLights:false,lightning:false,primaryColor:"#FFFFFF",secondaryColor:"#FFFFFF",motion:"cross",speed:1,brightness:.7,beamWidth:1.1,fixtureCount:6}, filter:{mode:"cool",intensity:.2}, screenFx:{effect:"none"}, nameplate:{enabled:true,style:"steel",glow:false,animation:"fade"}, timing:{totalDuration:7} } },
  epic_glass_break: { tier:"epic", name:"Epic — Glass Break", config:{ enabled:true, signatureEffect:"none", pyro:{preset:"far_jets",enabled:true,style:"jets",position:"both",color:"#FFFFFF",duration:1.8,frequency:1.4,height:.38,width:.58,intensity:1,burstCount:1,behavior:"simultaneous",flashBurst:true}, atmosphere:{preset:"none",type:"none"}, lighting:{enabled:true,preset:"cold_impact",dimming:"strong",blackout:false,spotlight:false,phoneLights:false,lightning:false,primaryColor:"#FFFFFF",secondaryColor:"#3B82F6",motion:"sweep",aim:"ramp",behavior:"alternating",speed:.72,brightness:.95,beamWidth:1.05,fixtureCount:8,fixtures:buildLightingPresetFixtures("cold_impact",{fixtureCount:8})}, filter:{mode:"none",intensity:0}, screenFx:{preset:"glass_break",effect:"glass_shatter",shake:2,flash:1,lingerCracks:true}, nameplate:{enabled:true,style:"steel",glow:false,animation:"slide"}, timing:{totalDuration:7,screenFxStart:.15,pyroStart:.65,nameplateStart:.85} } },
  epic_hellfire: { tier:"epic", name:"Epic — Hellfire", config:{ enabled:true, pyro:{enabled:true,style:"flame_jets",position:"full",color:"#EF4444",duration:6,frequency:.7,height:.9,width:1.5,intensity:3,burstCount:5,behavior:"alternating"}, atmosphere:{type:"smoke",color:"#EF4444",density:.55,spread:.85,placement:"sides",fade:5}, lighting:{enabled:true,dimming:"blackout",blackout:true,spotlight:true,phoneLights:false,lightning:false,primaryColor:"#EF4444",secondaryColor:"#F59E0B",motion:"pulse",speed:.7,brightness:.9,beamWidth:1.35,fixtureCount:8}, filter:{mode:"red",intensity:.55}, screenFx:{effect:"flash",shake:1,flash:.55}, nameplate:{enabled:true,style:"arena",glow:true,animation:"pop"}, timing:{totalDuration:9} } },
  epic_dark_arrival: { tier:"epic", name:"Epic — Dark Arrival", config:{ enabled:true, signatureEffect:"dark_arrival_lightning", pyro:{enabled:true,style:"rain",position:"overhead",color:"#FFFFFF",duration:7,frequency:1.2,height:.8,width:2.4,intensity:2,burstCount:5,behavior:"simultaneous"}, atmosphere:{type:"heavy_fog",color:"#A855F7",density:.86,spread:1,placement:"full",fade:7}, lighting:{enabled:true,dimming:"blackout",blackout:true,spotlight:true,phoneLights:false,lightning:false,branchingLightning:false,primaryColor:"#A855F7",secondaryColor:"#FFFFFF",motion:"search",speed:1.4,brightness:.5,beamWidth:.85,fixtureCount:8}, filter:{mode:"purple",intensity:.6}, screenFx:{effect:"none",shake:1,flash:.8}, nameplate:{enabled:true,style:"minimal",glow:false,animation:"fade"}, timing:{totalDuration:10,screenFxStart:.65,pyroStart:1.45,nameplateStart:.9,atmosphereStart:.15} } },
  epic_electrifying: { tier:"epic", name:"Epic — Electrifying", config:{ enabled:true, pyro:{enabled:true,style:"multi_burst",position:"full",color:"#FFFFFF",duration:5,frequency:.7,height:.82,width:1.8,intensity:3,burstCount:5,behavior:"wave"}, atmosphere:{type:"none"}, lighting:{enabled:true,dimming:"strong",blackout:false,spotlight:true,phoneLights:false,lightning:false,primaryColor:"#3B82F6",secondaryColor:"#FFFFFF",motion:"search",speed:.75,brightness:.9,beamWidth:1.3,fixtureCount:8}, filter:{mode:"blue",intensity:.42}, screenFx:{effect:"glitch",shake:2,flash:.55}, nameplate:{enabled:true,style:"arena",glow:true,animation:"glitch"}, timing:{totalDuration:8} } },
  champion_thunder_crown: { tier:"champion", name:"Champion — Thunder Crown", config:{ enabled:true, pyro:{enabled:true,style:"finale",position:"full",color:"#F59E0B",duration:7,frequency:.55,height:1,width:3,intensity:4,burstCount:7,behavior:"rapid",layeredEffects:true}, atmosphere:{type:"smoke",color:"#FFFFFF",density:.6,spread:.9,placement:"full",fade:5}, lighting:{enabled:true,preset:"gold_shimmer",dimming:"blackout",blackout:true,spotlight:true,phoneLights:false,lightning:true,branchingLightning:true,primaryColor:"#F5C94A",secondaryColor:"#FFF0A6",motion:"converge",aim:"center",behavior:"shimmer",speed:.85,brightness:1,beamWidth:1.35,fixtureCount:8,fixtures:buildLightingPresetFixtures("gold_shimmer",{fixtureCount:8,primaryColor:"#F5C94A",secondaryColor:"#FFF0A6",brightness:1,speed:.85})}, filter:{mode:"gold_contrast",intensity:.55}, screenFx:{effect:"flash",shake:2,flash:1}, nameplate:{enabled:true,style:"championship",glow:true,animation:"shimmer"}, timing:{totalDuration:12,screenFxStart:.7,pyroStart:1.2,nameplateStart:.9,atmosphereStart:.2} } }
};

function mergeEntranceConfig(value) {
  const d = entranceDefaults();
  const raw = value && typeof value === "object" ? value : {};
  if (raw.templatePreset === "rare_original_white_heat") {
    return mergeEntranceConfig({ ...ENTRANCE_TEMPLATES.basic_white_heat.config, templatePreset:"basic_white_heat", wrestlingName:raw.wrestlingName||"", subtitle:raw.subtitle||"" });
  }
  const legacyDimming = raw.lighting?.dimming || (raw.lighting?.blackout ? "blackout" : d.lighting.dimming);
  const mergedPyro = { ...d.pyro, ...(raw.pyro || {}) };
  if (raw.pyro?.flashBurst == null) mergedPyro.flashBurst = ENTRANCE_PYRO_FLASH_STYLES.has(mergedPyro.style);
  return {
    ...d, ...raw,
    pyro: mergedPyro,
    atmosphere: { ...d.atmosphere, ...(raw.atmosphere || {}) },
    lighting: { ...d.lighting, ...(raw.lighting || {}), dimming: legacyDimming, phoneLights:false },
    filter: { ...d.filter, ...(raw.filter || {}) },
    screenFx: { ...d.screenFx, ...(raw.screenFx || {}) },
    nameplate: { ...d.nameplate, ...(raw.nameplate || {}) },
    timing: { ...d.timing, ...(raw.timing || {}) }
  };
}

function entranceTierText(tier) { return String(tier || "basic").toUpperCase(); }
function currentEntranceTier() { return activeProfile?.entrance?.tier || "basic"; }
function currentEntranceRank() { return ENTRANCE_TIER_RANK[currentEntranceTier()] || 1; }
function tierAtLeast(tier) { return currentEntranceRank() >= ENTRANCE_TIER_RANK[tier]; }

function fillEntranceRanges() {
  el("entrancePyroDurationValue").textContent = `${Number(el("entrancePyroDurationInput").value).toFixed(1)} sec`;
  el("entrancePyroFrequencyValue").textContent = `every ${Number(el("entrancePyroFrequencyInput").value).toFixed(2)} sec`;
  el("entrancePyroHeightValue").textContent = `${Math.round(Number(el("entrancePyroHeightInput").value) * 100)}%`;
  el("entrancePyroWidthValue").textContent = `${Number(el("entrancePyroWidthInput").value).toFixed(1)}×`;
  el("entrancePyroBurstCountValue").textContent = `${el("entrancePyroBurstCountInput").value} burst${Number(el("entrancePyroBurstCountInput").value) === 1 ? "" : "s"}`;
  el("entranceTotalDurationValue").textContent = `${Number(el("entranceTotalDurationInput").value).toFixed(1)} sec`;
  el("entrancePyroStartValue").textContent = Number(el("entrancePyroStartInput").value)===0 ? "Immediate" : `${Number(el("entrancePyroStartInput").value).toFixed(2)} sec`;
  updateEntranceSummary();
}

let entranceSignatureEffect = "none";
let entranceTemplateSelection = "custom";
let entranceFixtureOverrides = [];

function currentEntranceForm() {
  const pyroMode=el("entrancePyroModeSelect").value, atmosphereMode=el("entranceAtmosphereModeSelect").value, lightingMode=el("entranceLightingModeSelect").value, screenMode=el("entranceScreenModeSelect").value;
  const dimming = lightingMode==="none" ? "none" : el("entranceDimmingSelect").value;
  return {
    enabled: el("entranceEnabledInput").checked,
    templatePreset: entranceTemplateSelection || "custom",
    signatureEffect: entranceSignatureEffect,
    wrestlingName: el("entranceWrestlingNameInput").value.trim(), subtitle: el("entranceSubtitleInput").value.trim(),
    pyro: { preset:pyroMode==="preset"?(el("entrancePyroPresetSelect").value||"custom"):(pyroMode==="none"?"none":"custom"), enabled: pyroMode!=="none", style: el("entrancePyroStyleSelect").value, position: el("entrancePyroPositionSelect").value, color: el("entrancePyroColorInput").value, duration:+el("entrancePyroDurationInput").value, frequency:+el("entrancePyroFrequencyInput").value, height:+el("entrancePyroHeightInput").value, width:+el("entrancePyroWidthInput").value, intensity:+el("entrancePyroIntensitySelect").value, burstCount:+el("entrancePyroBurstCountInput").value, behavior:el("entrancePyroBehaviorSelect").value, flashBurst:el("entrancePyroFlashBurstInput").checked, layeredEffects:el("entranceLayeredEffectsInput").checked },
    atmosphere: { preset:atmosphereMode==="preset"?(el("entranceAtmospherePresetSelect").value||"custom"):(atmosphereMode==="none"?"none":"custom"), type:atmosphereMode==="none"?"none":el("entranceAtmosphereSelect").value, color:el("entranceAtmosphereColorInput").value, density:+el("entranceAtmosphereDensityInput").value, spread:+el("entranceAtmosphereSpreadInput").value, placement:el("entranceAtmospherePlacementSelect").value, fade:+el("entranceAtmosphereFadeInput").value },
    lighting: { enabled:lightingMode!=="none", preset:lightingMode==="preset"?(el("entranceLightingPresetSelect")?.value||"custom"):(lightingMode==="none"?"none":"custom"), dimming, blackout:lightingMode!=="none"&&dimming==="blackout", spotlight:lightingMode!=="none"&&el("entranceSpotlightInput").checked, phoneLights:false, lightning:lightingMode!=="none"&&el("entranceLightningInput").checked, branchingLightning:lightingMode!=="none"&&el("entranceBranchingLightningInput").checked, primaryColor:el("entranceLightPrimaryInput").value, secondaryColor:el("entranceLightSecondaryInput").value, motion:el("entranceLightMotionSelect").value, aim:el("entranceLightAimSelect").value, behavior:el("entranceLightBehaviorSelect").value, speed:+el("entranceLightSpeedInput").value, brightness:+el("entranceLightBrightnessInput").value, beamWidth:+el("entranceLightBeamWidthInput").value, fixtureCount:+el("entranceLightFixtureCountInput").value, fixtures:entranceFixtureOverrides.slice(0,+el("entranceLightFixtureCountInput").value).map(x=>({...x})) },
    filter: { mode:screenMode==="none"?"none":el("entranceFilterSelect").value, intensity:screenMode==="none"?0:+el("entranceFilterIntensityInput").value },
    screenFx: { preset:screenMode==="preset"?(el("entranceScreenPresetSelect").value||"custom"):(screenMode==="none"?"none":"custom"), effect:screenMode==="none"?"none":el("entranceScreenFxSelect").value, shake:screenMode==="none"?0:+el("entranceScreenShakeInput").value, flash:screenMode==="none"?0:+el("entranceScreenFlashInput").value, lingerCracks:screenMode!=="none"&&el("entranceGlassLingerInput").checked },
    nameplate: { enabled:el("entranceNameplateEnabledInput").checked, style:el("entranceNameplateStyleSelect").value, glow:el("entranceNameplateGlowInput").checked, animation:el("entranceNameplateAnimationSelect").value },
    timing: { totalDuration:+el("entranceTotalDurationInput").value, entranceDelay:+el("entranceDelayInput").value, nameplateStart:+el("entranceNameplateStartInput").value, pyroStart:+el("entrancePyroStartInput").value, atmosphereStart:+el("entranceAtmosphereStartInput").value, screenFxStart:+el("entranceScreenFxStartInput").value }
  };
}

function setEntranceForm(config) {
  const c=mergeEntranceConfig(config);
  entranceSignatureEffect = c.signatureEffect || "none";
  entranceTemplateSelection = c.templatePreset || "custom";
  el("entranceEnabledInput").checked=!!c.enabled; el("entranceWrestlingNameInput").value=c.wrestlingName||activeProfile?.user?.username||""; el("entranceSubtitleInput").value=c.subtitle||"";
  el("entrancePyroModeSelect").value=c.pyro.enabled===false?"none":(c.pyro.preset&&c.pyro.preset!=="custom"&&c.pyro.preset!=="none"?"preset":"custom"); populateSubsystemPresets("entrancePyroPresetSelect",ENTRANCE_PYRO_PRESETS,c.pyro.preset||"far_jets");
    el("entrancePyroEnabledInput").checked=c.pyro.enabled!==false; el("entrancePyroStyleSelect").value=c.pyro.style; el("entrancePyroPositionSelect").value=c.pyro.position||"both"; el("entrancePyroColorInput").value=c.pyro.color||"#FFFFFF"; el("entrancePyroDurationInput").value=c.pyro.duration; el("entrancePyroFrequencyInput").value=c.pyro.frequency; el("entrancePyroHeightInput").value=c.pyro.height; el("entrancePyroWidthInput").value=c.pyro.width; el("entrancePyroIntensitySelect").value=String(c.pyro.intensity); el("entrancePyroBurstCountInput").value=c.pyro.burstCount||3; el("entrancePyroBehaviorSelect").value=c.pyro.behavior||"simultaneous"; el("entrancePyroFlashBurstInput").checked=c.pyro.flashBurst!==false; el("entranceLayeredEffectsInput").checked=!!c.pyro.layeredEffects;
  el("entranceAtmosphereModeSelect").value=c.atmosphere.type==="none"?"none":(c.atmosphere.preset&&c.atmosphere.preset!=="custom"&&c.atmosphere.preset!=="none"?"preset":"custom"); populateSubsystemPresets("entranceAtmospherePresetSelect",ENTRANCE_ATMOSPHERE_PRESETS,c.atmosphere.preset||"low_fog");
    el("entranceAtmosphereSelect").value=c.atmosphere.type; el("entranceAtmosphereColorInput").value=c.atmosphere.color||"#FFFFFF"; el("entranceAtmosphereDensityInput").value=c.atmosphere.density; el("entranceAtmosphereSpreadInput").value=c.atmosphere.spread??.75; el("entranceAtmospherePlacementSelect").value=c.atmosphere.placement||"floor"; el("entranceAtmosphereFadeInput").value=c.atmosphere.fade||4;
  el("entranceLightingModeSelect").value=c.lighting.enabled===false?"none":(c.lighting.preset&&c.lighting.preset!=="custom"&&c.lighting.preset!=="none"?"preset":"custom");
    el("entranceLightingEnabledInput").checked=c.lighting.enabled!==false; el("entranceDimmingSelect").value=c.lighting.dimming||"moderate"; el("entranceSpotlightInput").checked=!!c.lighting.spotlight; el("entranceLightningInput").checked=!!c.lighting.lightning; el("entranceBranchingLightningInput").checked=!!c.lighting.branchingLightning; el("entranceLightPrimaryInput").value=c.lighting.primaryColor||"#FFFFFF"; el("entranceLightSecondaryInput").value=c.lighting.secondaryColor||"#3B82F6"; el("entranceLightMotionSelect").value=c.lighting.motion||"none"; el("entranceLightAimSelect").value=c.lighting.aim||"down"; el("entranceLightBehaviorSelect").value=c.lighting.behavior||"steady"; el("entranceLightSpeedInput").value=c.lighting.speed; el("entranceLightBrightnessInput").value=c.lighting.brightness??.6; el("entranceLightBeamWidthInput").value=c.lighting.beamWidth??.9; el("entranceLightFixtureCountInput").value=c.lighting.fixtureCount??4; entranceFixtureOverrides=Array.isArray(c.lighting.fixtures)?c.lighting.fixtures.map(x=>({...x})):[]; populateEntranceLightingPresets(c.lighting.preset||"custom"); renderEntranceFixtureEditor();
  el("entranceScreenModeSelect").value=(c.screenFx.effect||"none")==="none"&&(c.filter.mode||"none")==="none"?"none":(c.screenFx.preset&&c.screenFx.preset!=="custom"&&c.screenFx.preset!=="none"?"preset":"custom"); populateSubsystemPresets("entranceScreenPresetSelect",ENTRANCE_SCREEN_PRESETS,c.screenFx.preset||"cold_blue");
    el("entranceFilterSelect").value=c.filter.mode||"none"; el("entranceFilterIntensityInput").value=c.filter.intensity??.45; el("entranceScreenFxSelect").value=c.screenFx.effect||"none"; el("entranceScreenShakeInput").value=c.screenFx.shake??1; el("entranceScreenFlashInput").value=c.screenFx.flash??.6; el("entranceGlassLingerInput").checked=!!c.screenFx.lingerCracks;
  el("entranceNameplateEnabledInput").checked=c.nameplate.enabled!==false; el("entranceNameplateStyleSelect").value=c.nameplate.style; el("entranceNameplateGlowInput").checked=!!c.nameplate.glow; el("entranceNameplateAnimationSelect").value=c.nameplate.animation||"slide";
  el("entranceTotalDurationInput").value=c.timing.totalDuration||5; el("entranceDelayInput").value=c.timing.entranceDelay||0; el("entranceNameplateStartInput").value=c.timing.nameplateStart??.6; el("entrancePyroStartInput").value=c.timing.pyroStart??1; el("entranceAtmosphereStartInput").value=c.timing.atmosphereStart??.3; el("entranceScreenFxStartInput").value=c.timing.screenFxStart??.8;
  syncEntranceCategoryModes(false); fillEntranceRanges(); applyEntranceTierUI();
}

function updateEntranceSummary(){
  const target=el("entranceSummary"); if(!target)return; const c=currentEntranceForm();
  const parts=[entranceTierText(currentEntranceTier()), c.pyro.enabled?c.pyro.style.replaceAll("_"," ").toUpperCase():"NO PYRO", c.atmosphere.type!=="none"?c.atmosphere.type.replaceAll("_"," ").toUpperCase():null, c.signatureEffect==="dark_arrival_lightning"?"SIGNATURE LIGHTNING":null, c.lighting.enabled?`${c.lighting.motion.toUpperCase()} LIGHTS`:"NO RIG", c.screenFx.effect!=="none"?c.screenFx.effect.replaceAll("_"," ").toUpperCase():null].filter(Boolean); target.textContent=parts.join(" · ");
}

function populateEntranceLightingPresets(selected="custom") {
  const select=el("entranceLightingPresetSelect"); if(!select)return;
  select.innerHTML="";
  Object.entries(ENTRANCE_LIGHTING_PRESETS).forEach(([key,preset])=>{const option=document.createElement("option");const locked=(ENTRANCE_TIER_RANK[preset.tier]||1)>currentEntranceRank();option.value=key;option.disabled=locked;option.textContent=`${locked?"🔒 ":""}${preset.name}${locked?` — ${entranceTierText(preset.tier)}`:""}`;select.appendChild(option);});
  const valid=[...select.options].find(o=>o.value===selected&&!o.disabled)||[...select.options].find(o=>!o.disabled); if(valid)select.value=valid.value;
}
function applyEntranceLightingPreset(){
  const key=el("entranceLightingPresetSelect").value,preset=ENTRANCE_LIGHTING_PRESETS[key]; if(!preset||(ENTRANCE_TIER_RANK[preset.tier]||1)>currentEntranceRank())return;
  const c=currentEntranceForm(); const merged={...c.lighting,...preset.config,enabled:true}; merged.fixtures=buildLightingPresetFixtures(key,merged); entranceFixtureOverrides=merged.fixtures.map(x=>({...x}));
  el("entranceDimmingSelect").value=merged.dimming||c.lighting.dimming; el("entranceLightMotionSelect").value=merged.motion||"none"; el("entranceLightAimSelect").value=merged.aim||"center"; el("entranceLightBehaviorSelect").value=merged.behavior||"steady"; el("entranceLightPrimaryInput").value=merged.primaryColor||c.lighting.primaryColor; el("entranceLightSecondaryInput").value=merged.secondaryColor||c.lighting.secondaryColor; el("entranceLightSpeedInput").value=merged.speed??1; el("entranceLightBrightnessInput").value=merged.brightness??.65; el("entranceLightBeamWidthInput").value=merged.beamWidth??1; el("entranceLightFixtureCountInput").value=merged.fixtureCount||4; if("lightning" in merged)el("entranceLightningInput").checked=!!merged.lightning;
  el("entranceLightingModeSelect").value="preset"; el("entranceLightingEnabledInput").checked=true; syncEntranceCategoryModes(false); renderEntranceFixtureEditor(); fillEntranceRanges(); el("entranceMessage").className="message success"; el("entranceMessage").textContent=`${preset.name} lighting applied. You can now adjust individual fixtures.`;
}
function ensureFixtureOverride(index){
  const count=Math.min(8,+el("entranceLightFixtureCountInput").value||4); while(entranceFixtureOverrides.length<count){const i=entranceFixtureOverrides.length;entranceFixtureOverrides.push({enabled:true,color:undefined,brightness:undefined,aim:"inherit",motion:"inherit",speed:undefined,behavior:"inherit",direction:"normal",phase:count>1?i/(count-1):0,range:1});} return entranceFixtureOverrides[index];
}
function fixtureSelect(options,value,onchange){const select=document.createElement("select");options.forEach(([v,label,tier])=>{const o=document.createElement("option");o.value=v;o.textContent=(!tier||tierAtLeast(tier))?label:`🔒 ${label}`;o.disabled=Boolean(tier&&!tierAtLeast(tier));select.appendChild(o);});select.value=[...select.options].some(o=>o.value===value&&!o.disabled)?value:"inherit";select.addEventListener("change",onchange);return select;}
function renderEntranceFixtureEditor(){
  const host=el("entranceFixtureEditor"); if(!host)return; const count=Math.min(8,+el("entranceLightFixtureCountInput").value||4); host.innerHTML=""; entranceFixtureOverrides=entranceFixtureOverrides.slice(0,count); for(let i=0;i<count;i+=1){const f=ensureFixtureOverride(i),card=document.createElement("div");card.className="entrance-fixture-card";const effectiveColor=f.color||(i%2?(el("entranceLightSecondaryInput").value||"#FFFFFF"):(el("entranceLightPrimaryInput").value||"#FFFFFF")),effectiveBrightness=f.brightness??(+el("entranceLightBrightnessInput").value||.65),effectiveSpeed=f.speed??(+el("entranceLightSpeedInput").value||1);card.innerHTML=`<div class="entrance-fixture-card-head"><strong>LIGHT ${i+1}</strong><label class="identity-check"><input type="checkbox" data-fixture-power ${f.enabled!==false?"checked":""}> ON</label></div><div class="entrance-fixture-fields"><label>Color<input type="color" data-fixture-color value="${effectiveColor}"></label><label>Brightness<input type="range" data-fixture-brightness min="0" max="1" step="0.05" value="${Number(effectiveBrightness)}"></label><label>Speed<input type="range" data-fixture-speed min="0.3" max="3" step="0.1" value="${Number(effectiveSpeed)}"></label><label>Direction<select data-fixture-direction><option value="normal">Normal</option><option value="reverse">Reverse</option></select></label></div>`;
    const fields=card.querySelector('.entrance-fixture-fields'); const aimWrap=document.createElement('label');aimWrap.textContent='Aim';aimWrap.appendChild(fixtureSelect([["inherit","Use Rig Aim"],["center","Center Stage","basic"],["down","Straight Down","basic"],["ramp","Entrance / Ramp","rare"],["screen","Back Wall / Screen","rare"],["crowd_left","Crowd Left","rare"],["crowd_right","Crowd Right","rare"],["outward","Wide Outward","rare"]],f.aim||"inherit",e=>{f.aim=e.target.value;}));fields.appendChild(aimWrap);
    const motionWrap=document.createElement('label');motionWrap.textContent='Movement';motionWrap.appendChild(fixtureSelect([["inherit","Use Rig Movement"],["none","Still","basic"],["sweep","Horizontal Sweep","basic"],["vertical","Vertical Sweep","rare"],["diagonal","Diagonal Sweep","rare"],["pendulum","Pendulum","rare"],["search","Search","epic"],["circle","Circle","epic"],["figure8","Figure 8","epic"],["converge","Converge","epic"],["diverge","Diverge","epic"]],f.motion||"inherit",e=>{f.motion=e.target.value;}));fields.appendChild(motionWrap);
    const behaviorWrap=document.createElement('label');behaviorWrap.textContent='Behavior';behaviorWrap.appendChild(fixtureSelect([["inherit","Use Rig Behavior"],["steady","Steady","basic"],["pulse","Pulse","rare"],["blink","Blink","rare"],["alternating","Alternating Pulse","rare"],["chase","Chase","rare"],["shimmer","Gold Shimmer","champion"]],f.behavior||"inherit",e=>{f.behavior=e.target.value;}));fields.appendChild(behaviorWrap);
    card.querySelector('[data-fixture-power]').addEventListener('change',e=>{f.enabled=e.target.checked;});card.querySelector('[data-fixture-color]').addEventListener('change',e=>{const palette=ENTRANCE_COLOR_PALETTES.lighting[currentEntranceTier()];f.color=palette===null?e.target.value:nearestPaletteColor(e.target.value,palette||['#FFFFFF']);e.target.value=f.color;});card.querySelector('[data-fixture-brightness]').addEventListener('input',e=>{f.brightness=+e.target.value;});card.querySelector('[data-fixture-speed]').addEventListener('input',e=>{f.speed=+e.target.value;});const dir=card.querySelector('[data-fixture-direction]');dir.value=f.direction||'normal';dir.addEventListener('change',e=>{f.direction=e.target.value;});host.appendChild(card);
  }
}
function resetEntranceFixtures(){entranceFixtureOverrides=[];el("entranceLightingModeSelect").value="custom";syncEntranceCategoryModes(true);renderEntranceFixtureEditor();}

function populateEntranceTemplates(selected=entranceTemplateSelection||"custom") {
  const select = el("entranceTemplateSelect");
  const maxRank = currentEntranceRank();
  select.innerHTML = "";
  const customOption=document.createElement("option"); customOption.value="custom"; customOption.textContent="Custom Entrance"; select.appendChild(customOption);
  Object.entries(ENTRANCE_TEMPLATES).forEach(([key, template]) => {
    const option = document.createElement("option");
    option.value = key;
    const locked = (ENTRANCE_TIER_RANK[template.tier] || 1) > maxRank;
    option.disabled = locked;
    option.textContent = `${locked ? "🔒 " : ""}${template.name}${locked ? ` — requires ${entranceTierText(template.tier)}` : ""}`;
    select.appendChild(option);
  });
  const valid=[...select.options].find(o=>o.value===selected&&!o.disabled)||customOption;
  select.value=valid.value;
  entranceTemplateSelection=valid.value;
}

function applyEntranceTemplate() {
  const key=el("entranceTemplateSelect").value;
  if(key==="custom"){entranceTemplateSelection="custom";return;}
  const template = ENTRANCE_TEMPLATES[key];
  if (!template || (ENTRANCE_TIER_RANK[template.tier]||1)>currentEntranceRank()) return;
  entranceTemplateSelection=key;
  const current = currentEntranceForm(), base = entranceDefaults();
  const templatePyro={...base.pyro,...(template.config.pyro||{})}; if(template.config.pyro?.preset==null)templatePyro.preset="custom"; if(template.config.pyro?.flashBurst==null)templatePyro.flashBurst=ENTRANCE_PYRO_FLASH_STYLES.has(templatePyro.style);
  const templateAtmosphere={...base.atmosphere,...(template.config.atmosphere||{})}; if(template.config.atmosphere?.preset==null)templateAtmosphere.preset="custom";
  const templateScreenFx={...base.screenFx,...(template.config.screenFx||{})}; if(template.config.screenFx?.preset==null)templateScreenFx.preset="custom";
  setEntranceForm({
    ...base, ...template.config, templatePreset:key, signatureEffect: template.config.signatureEffect || "none", wrestlingName: current.wrestlingName, subtitle: current.subtitle,
    pyro: templatePyro, atmosphere: templateAtmosphere, lighting: { ...base.lighting, ...(template.config.lighting || {}), preset:template.config.lighting?.preset||"custom", fixtures:Array.isArray(template.config.lighting?.fixtures)?template.config.lighting.fixtures:[] }, filter: { ...base.filter, ...(template.config.filter || {}) }, screenFx: templateScreenFx, nameplate: { ...base.nameplate, ...(template.config.nameplate || {}) }, timing: { ...base.timing, ...(template.config.timing || {}) }
  });
  el("entranceMessage").className = "message success";
  el("entranceMessage").textContent = `${template.name} applied. Customize any unlocked controls before saving.`;
}

function setSelectLocks(id, rules) {
  const select=el(id); if(!select)return;
  [...select.options].forEach(option=>{
    if(!option.dataset.baseLabel) option.dataset.baseLabel=option.textContent.replace(/^🔒\s*/,"").replace(/\s+— requires .+$/i,"");
    const required=rules[option.value]||"basic"; const locked=!tierAtLeast(required);
    option.disabled=locked; option.textContent=`${locked?"🔒 ":""}${option.dataset.baseLabel}${locked?` — ${entranceTierText(required)}`:""}`;
  });
  if(select.selectedOptions[0]?.disabled){ const fallback=[...select.options].find(o=>!o.disabled); if(fallback) select.value=fallback.value; }
}

function setControlTierLock(id, requiredTier, lockedValue=null) {
  const control=el(id); if(!control)return;
  const locked=!tierAtLeast(requiredTier);
  control.dataset.tierLocked=locked?"true":"false";
  if(locked && lockedValue!==null){ if(control.type==="checkbox")control.checked=Boolean(lockedValue); else control.value=String(lockedValue); }
  control.disabled=locked;
  const label=control.closest("label"); if(label){label.classList.toggle("entrance-feature-locked",locked); label.dataset.lockTier=locked?entranceTierText(requiredTier):"";}
}

function setRangeTier(id, {basic,rare,epic,champion}, min=null) {
  const input=el(id); if(!input)return; const tier=currentEntranceTier(); const max={basic,rare,epic,champion}[tier];
  if(min!=null)input.min=String(min); input.max=String(max); if(Number(input.value)>max)input.value=String(max);
}

function setEntranceControlAvailability() {
  const pyroEnabled=el("entrancePyroModeSelect").value!=="none";
  ["entrancePyroStyleSelect","entrancePyroPositionSelect","entrancePyroColorInput","entrancePyroFlashBurstInput","entrancePyroDurationInput","entrancePyroFrequencyInput","entrancePyroHeightInput","entrancePyroWidthInput","entrancePyroIntensitySelect","entrancePyroBurstCountInput","entrancePyroBehaviorSelect"].forEach(id=>{const c=el(id); if(c && c.dataset.tierLocked!=="true")c.disabled=!pyroEnabled;});
  const rigEnabled=el("entranceLightingModeSelect").value!=="none";
  ["entranceDimmingSelect","entranceLightingPresetSelect","entranceApplyLightingPresetButton","entranceLightPrimaryInput","entranceLightSecondaryInput","entranceLightMotionSelect","entranceLightAimSelect","entranceLightBehaviorSelect","entranceLightSpeedInput","entranceLightBrightnessInput","entranceLightBeamWidthInput","entranceLightFixtureCountInput","entranceSpotlightInput","entranceLightningInput","entranceBranchingLightningInput"].forEach(id=>{const c=el(id); if(c && c.dataset.tierLocked!=="true")c.disabled=!rigEnabled;});
  const nameplateEnabled=el("entranceNameplateEnabledInput").checked;
  ["entranceNameplateStyleSelect","entranceNameplateGlowInput","entranceNameplateAnimationSelect"].forEach(id=>{const c=el(id); if(c && c.dataset.tierLocked!=="true")c.disabled=!nameplateEnabled;});
  const atmosphereEnabled=el("entranceAtmosphereModeSelect").value!=="none" && el("entranceAtmosphereSelect").value!=="none" && tierAtLeast("epic");
  ["entranceAtmosphereColorInput","entranceAtmosphereDensityInput","entranceAtmosphereSpreadInput","entranceAtmospherePlacementSelect","entranceAtmosphereFadeInput"].forEach(id=>{const c=el(id); if(c && c.dataset.tierLocked!=="true")c.disabled=!atmosphereEnabled;});
  updateEntranceSummary();
}

function setEntranceEditorMode(mode){
  const canAdvanced=true; const advanced=mode==="advanced";
  el("entranceForm").classList.toggle("show-advanced",advanced); el("entranceBasicModeButton").classList.toggle("is-active",!advanced); el("entranceAdvancedModeButton").classList.toggle("is-active",advanced); el("entranceAdvancedModeButton").disabled=false; el("entranceAdvancedModeButton").title="Custom controls show every option; locked effects still follow your Entrance Rank."; localStorage.setItem("chatroom_entrance_editor_mode",advanced?"advanced":"basic");
}
function resetEntranceForm(){ setEntranceForm(entranceDefaults()); el("entranceMessage").className="message"; el("entranceMessage").textContent="Entrance reset locally. Press SAVE to keep the reset."; }

function nearestPaletteColor(hex,palette){
  if(!palette||!palette.length)return hex; const toRgb=v=>{const n=parseInt(v.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255]}; const a=toRgb(hex.toUpperCase()); let best=palette[0],dist=Infinity; for(const p of palette){const b=toRgb(p),d=(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;if(d<dist){dist=d;best=p;}} return best;
}
function snapEntranceColor(id,kind){
  const input=el(id), tier=currentEntranceTier(), palette=ENTRANCE_COLOR_PALETTES[kind]?.[tier]; if(!input||palette===null)return; const snapped=nearestPaletteColor(input.value,palette||["#FFFFFF"]); if(snapped.toUpperCase()!==input.value.toUpperCase()){input.value=snapped; el("entranceMessage").className="message"; el("entranceMessage").textContent=`Custom ${kind} colors unlock at Champion. Snapped to the nearest ${entranceTierText(tier)} color.`;}
}

function applyEntranceTierUI() {
  const tier=currentEntranceTier(); const rank=currentEntranceRank(); const whiteHeatPreset=entranceTemplateSelection==="basic_white_heat"; el("entranceTierLabel").textContent=entranceTierText(tier);
  const basis=activeProfile?.entrance?.rank_basis||"achievement"; const highest=activeProfile?.entrance?.highest_achievement_rarity;
  const next=tier==="basic"?"Rare achievement":tier==="rare"?"Epic achievement":tier==="epic"?"Legendary or Secret achievement":null;
  el("entranceLockedMessage").classList.remove("hidden");
  el("entranceLockedMessage").textContent=tier==="champion" ? (basis==="admin_bypass"?"Admin bypass active: the full Champion production rig is unlocked.":"Champion production unlocked. The full entrance rig is available.") : `${entranceTierText(tier)} rank active${highest?` · highest achievement: ${String(highest).toUpperCase()}`:""}. ${next} unlocks the next production tier.`;

  setSelectLocks("entranceNameplateStyleSelect",{arena:"basic",minimal:"basic",transparent:"basic",steel:"basic",neon:"rare",championship:"champion"});
  setSelectLocks("entranceNameplateAnimationSelect",{slide:"basic",fade:"basic",pop:"epic",glitch:"epic",shimmer:"champion"});
  setSelectLocks("entrancePyroStyleSelect",{jets:"basic",fountain:"basic",cross_jets:"rare",sparkler_lane:"rare",wide_fountain:"rare",fan:"rare",center_blast:"rare",dual_center:"rare",multi_burst:"rare",full_stage:"epic",flame_jets:"epic",alternating_flames:"epic",flame_wall:"epic",rain:"epic",curtain:"epic",finale:"epic"});
  setSelectLocks("entrancePyroPositionSelect",{both:"basic",inner:"basic",left:"rare",right:"rare",center:"rare",full:"epic",overhead:"epic"});
  setSelectLocks("entrancePyroIntensitySelect",{"1":"basic","2":"basic","3":"rare","4":"champion"});
  setSelectLocks("entrancePyroBehaviorSelect",{simultaneous:"basic",alternating:"rare",outside_in:"rare",inside_out:"rare",wave:"rare",random:"epic",rapid:"epic"});
  setSelectLocks("entranceDimmingSelect",{none:"basic",light:"basic",moderate:"basic",strong:"rare",blackout:whiteHeatPreset?"basic":"epic"});
  setSelectLocks("entranceLightMotionSelect",{none:"basic",sweep:"basic",cross:"rare",fan:"rare",vertical:"rare",diagonal:"rare",pendulum:"rare",search:"epic",circle:"epic",figure8:"epic",converge:"epic",diverge:"epic",pulse:"epic",stadium:"epic",champion:"champion"});
  setSelectLocks("entranceLightAimSelect",{center:"basic",down:"basic",ramp:"rare",screen:"rare",crowd_left:"rare",crowd_right:"rare",outward:"rare"});
  setSelectLocks("entranceLightBehaviorSelect",{steady:"basic",pulse:"rare",blink:"rare",alternating:"rare",chase:"rare",shimmer:"champion"});
  setSelectLocks("entranceAtmosphereSelect",{none:"basic",fog:"epic",smoke:"epic",heavy_fog:"epic",mist:"epic"});
  setSelectLocks("entranceScreenFxSelect",{none:"basic",glass_shatter:"epic",flash:"epic",glitch:"epic",shake:"epic"});
  setSelectLocks("entranceFilterSelect",{none:"basic",cinematic:whiteHeatPreset?"basic":"epic",cool:"rare",warm:"rare",red:"rare",blue:"rare",purple:"rare",green:"epic",gold:"epic",mono:"epic",high_contrast:"epic",desaturated:"epic",gold_contrast:"champion",crimson_mono:"champion",electric_blue:"champion"});

  setControlTierLock("entrancePyroColorInput","rare","#FFFFFF"); setControlTierLock("entranceSpotlightInput",whiteHeatPreset?"basic":"epic",false); setControlTierLock("entranceLightningInput","champion",false); setControlTierLock("entranceBranchingLightningInput","champion",false); setControlTierLock("entranceLayeredEffectsInput","champion",false); setControlTierLock("entranceGlassLingerInput","epic",false);
  ["entranceAtmosphereColorInput","entranceAtmosphereDensityInput","entranceAtmosphereSpreadInput","entranceAtmospherePlacementSelect","entranceAtmosphereFadeInput"].forEach(id=>setControlTierLock(id,"epic"));
  setControlTierLock("entranceFilterIntensityInput","rare"); ["entranceScreenShakeInput","entranceScreenFlashInput"].forEach(id=>setControlTierLock(id,"epic"));
  ["entranceDelayInput","entranceNameplateStartInput","entranceAtmosphereStartInput","entranceScreenFxStartInput"].forEach(id=>setControlTierLock(id,"epic"));

  const unlockedFixtures={basic:4,rare:6,epic:8,champion:8}[tier]||4; el("entranceLightFixtureCountInput").value=String(unlockedFixtures); const fixtureNote=el("entranceLightFixtureCountValue"); if(fixtureNote)fixtureNote.textContent=`${unlockedFixtures} of 8 unlocked · all 8 fixtures stay visible`;
  setRangeTier("entranceLightBrightnessInput",{basic:.65,rare:.8,epic:1,champion:1},.2);
  setRangeTier("entranceLightBeamWidthInput",{basic:1,rare:1.3,epic:1.7,champion:2},.5);
  setRangeTier("entrancePyroHeightInput",{basic:.65,rare:.82,epic:.95,champion:1},.2);
  setRangeTier("entrancePyroWidthInput",{basic:1.1,rare:2,epic:3,champion:3},.4);
  setRangeTier("entrancePyroBurstCountInput",{basic:2,rare:5,epic:7,champion:8},1);
  setRangeTier("entrancePyroDurationInput",{basic:5,rare:7,epic:12,champion:15},1);
  setRangeTier("entranceTotalDurationInput",{basic:6,rare:8,epic:12,champion:15},3);

  el("entrancePyroFrequencyInput").min=tier==="basic"?"0.8":tier==="rare"?"0.5":"0.25"; if(Number(el("entrancePyroFrequencyInput").value)<Number(el("entrancePyroFrequencyInput").min))el("entrancePyroFrequencyInput").value=el("entrancePyroFrequencyInput").min;
  populateEntranceTemplates(); populateEntranceLightingPresets(el("entranceLightingPresetSelect")?.value||"center_focus"); populateSubsystemPresets("entrancePyroPresetSelect",ENTRANCE_PYRO_PRESETS,el("entrancePyroPresetSelect")?.value||"far_jets"); populateSubsystemPresets("entranceAtmospherePresetSelect",ENTRANCE_ATMOSPHERE_PRESETS,el("entranceAtmospherePresetSelect")?.value||"none"); populateSubsystemPresets("entranceScreenPresetSelect",ENTRANCE_SCREEN_PRESETS,el("entranceScreenPresetSelect")?.value||"none");
  setEntranceEditorMode(localStorage.getItem("chatroom_entrance_editor_mode")||"basic");
  const palette=tier==="champion"?"unrestricted custom colors":tier==="epic"?"expanded lighting, pyro, and atmosphere colors":tier==="rare"?"expanded lighting and pyro colors":"white pyro plus white/blue lighting";
  el("entrancePaletteNote").textContent=`${entranceTierText(tier)}: ${palette}. Basic = modest lights/pyro · Rare = upgraded lights/pyro/filters · Epic = atmosphere/flames/raining pyro/screen FX · Champion = lightning and maximum production.`;
  setEntranceControlAvailability(); fillEntranceRanges();
}

function openEntranceEditor(profileData) {
  activeProfile=profileData; const isAdminViewer=state.currentUser?.role==="admin";
  el("entranceMemberName").textContent=`${profileData.user.username} — Entrance`; el("entranceTriggerButton").classList.toggle("hidden",!isAdminViewer); setEntranceForm(profileData.entrance?.config||null); el("entranceMessage").textContent=""; el("entranceOverlay").classList.remove("hidden");
}
function closeEntranceEditor(){el("entranceOverlay").classList.add("hidden");}

async function saveEntrance(event) {
  event.preventDefault(); if(!activeProfile?.user?.username)return; const message=el("entranceMessage"); message.className="message"; message.textContent="Saving entrance..."; const body={entrance:currentEntranceForm()}; if(state.currentUser?.role==="admin"&&activeProfile.user.username!==state.currentUser.username)body.username=activeProfile.user.username;
  try{const{response,data}=await apiFetch("/profile/entrance",{method:"POST",body:JSON.stringify(body)},true);if(!response.ok||!data.ok)throw new Error(data.error||"Could not save entrance.");activeProfile=data;message.className="message success";message.textContent="Entrance saved. Live playback has been refreshed for this member.";setEntranceForm(data.entrance?.config||currentEntranceForm());window.dispatchEvent(new CustomEvent("drk:entrance-saved",{detail:{username:data.user?.username||activeProfile?.user?.username||state.currentUser?.username||""}}));}
  catch(error){message.className="message error";message.textContent=error.message||"Could not save entrance.";}
}

function previewEntrance(){const tier=currentEntranceTier();el("entranceOverlay").classList.add("hidden");window.dispatchEvent(new CustomEvent("drk:preview-entrance",{detail:{username:activeProfile?.user?.username||state.currentUser?.username,entrance:{tier,config:currentEntranceForm()}}}));setTimeout(()=>{if(activeProfile?.user?.username)el("entranceOverlay").classList.remove("hidden");},8200);}
function triggerEntranceNow(){if(state.currentUser?.role!=="admin"||!activeProfile?.user?.username)return;window.dispatchEvent(new CustomEvent("drk:trigger-entrance",{detail:{username:activeProfile.user.username}}));closeEntranceEditor();}

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
  el("entranceApplyTemplateButton").addEventListener("click", applyEntranceTemplate);
  el("entranceApplyPyroPresetButton").addEventListener("click", applyEntrancePyroPreset);
  el("entranceApplyAtmospherePresetButton").addEventListener("click", applyEntranceAtmospherePreset);
    el("entranceApplyLightingPresetButton").addEventListener("click", applyEntranceLightingPreset);
  el("entranceApplyScreenPresetButton").addEventListener("click", applyEntranceScreenPreset);
  el("entranceResetFixturesButton").addEventListener("click", resetEntranceFixtures);
  ["entrancePyroModeSelect","entranceAtmosphereModeSelect","entranceLightingModeSelect","entranceScreenModeSelect"].forEach(id=>el(id).addEventListener("change",()=>{syncEntranceCategoryModes(true);applyEntranceTierUI();}));
  el("entrancePyroEnabledInput").addEventListener("change", applyEntranceTierUI);
  el("entranceLightingEnabledInput").addEventListener("change", applyEntranceTierUI);
  el("entranceNameplateEnabledInput").addEventListener("change", applyEntranceTierUI);
  el("entranceBasicModeButton").addEventListener("click",()=>setEntranceEditorMode("basic"));
  el("entranceAdvancedModeButton").addEventListener("click",()=>setEntranceEditorMode("advanced"));
  el("entranceResetButton").addEventListener("click",resetEntranceForm);
  ["entrancePyroDurationInput","entrancePyroFrequencyInput","entrancePyroHeightInput","entrancePyroWidthInput","entrancePyroBurstCountInput","entrancePyroStyleSelect","entranceAtmosphereSelect","entranceLightMotionSelect","entranceLightAimSelect","entranceLightBehaviorSelect","entranceDimmingSelect","entranceScreenFxSelect","entranceTotalDurationInput","entrancePyroStartInput"].forEach((id)=>el(id).addEventListener("input",()=>{applyEntranceTierUI();fillEntranceRanges();}));
  [["entrancePyroColorInput","pyro"],["entranceAtmosphereColorInput","atmosphere"],["entranceLightPrimaryInput","lighting"],["entranceLightSecondaryInput","lighting"]].forEach(([id,kind])=>el(id).addEventListener("change",()=>snapEntranceColor(id,kind)));
  el("entrancePyroStyleSelect").addEventListener("change",()=>{syncPyroFlashDefault();fillEntranceRanges();});
  el("entranceLightFixtureCountInput").addEventListener("input",renderEntranceFixtureEditor);
}
