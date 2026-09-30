(() => {
  "use strict";

  const SITE_BASE = "https://arctracker.io";
  const DIRECT_BASE = `${SITE_BASE}/api`;
  // Same-origin proxy (Netlify _redirects / dev-server.py). Needed for the public
  // catalog endpoints, which don't send CORS headers.
  const PROXY_BASE = "/arc-api";
  const LOCALE = "en";
  // Identifies this app to ArcTracker. Injected at deploy time from the ARC_APP_KEY
  // environment variable via config.js (see build-config.sh). Each visitor supplies their
  // own user key for their data.
  const APP_KEY = window.ARC_CONFIG?.appKey || "";
  const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;

  const STORE = {
    settings: "aqp.settings",
    collapsed: "aqp.collapsed",
    catalog: "aqp.catalog",
  };

  const MAP_NAMES = {
    dam_battlegrounds: "Dam Battlegrounds",
    buried_city: "Buried City",
    the_spaceport: "The Spaceport",
    the_blue_gate: "The Blue Gate",
    stella_montis: "Stella Montis",
    riven_tide: "Riven Tide",
  };
  const ANY_MAP = "__any__";

  // ---------- storage helpers ----------

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked; the app still works for this session.
    }
  }

  let settings = Object.assign(
    { userKey: "", showLocked: false, showAnyMap: true },
    load(STORE.settings, {})
  );
  delete settings.appKey;
  // Collapsed state keyed by element id; true = collapsed.
  const collapsed = load(STORE.collapsed, {});

  // ---------- formatting ----------

  function localized(value) {
    if (value == null) return "";
    if (typeof value === "string") return value;
    return value[LOCALE] ?? value.en ?? Object.values(value)[0] ?? "";
  }

  function humanize(id) {
    return String(id)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function mapName(id) {
    return id === ANY_MAP ? "Any Map" : MAP_NAMES[id] ?? humanize(id);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  // ---------- API ----------

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  let lastDebug = {};

  function recordDebug(label, payload) {
    lastDebug[label] = payload;
    const out = document.getElementById("debug-output");
    if (out) out.textContent = JSON.stringify(lastDebug, null, 2).slice(0, 50000);
  }

  async function parseResponse(res, label) {
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(`${label}: unexpected non-JSON response (HTTP ${res.status})`, res.status);
    }
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      const code = json?.error?.code ? ` [${json.error.code}]` : "";
      throw new ApiError(`${label}: ${msg}${code}`, res.status, json?.error?.code);
    }
    return json;
  }

  // Public catalog: try the same-origin proxy first, then direct (in case CORS gets enabled).
  async function fetchPublic(path) {
    const attempts = [PROXY_BASE + path, DIRECT_BASE + path];
    let lastErr;
    for (const url of attempts) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        return await parseResponse(res, path);
      } catch (err) {
        lastErr = err;
      }
    }
    throw new ApiError(
      `Couldn't load ${path}. The public ArcTracker endpoints need the /arc-api proxy — ` +
        `deploy to Netlify (uses _redirects) or run "python3 dev-server.py" locally. (${lastErr?.message})`
    );
  }

  // User endpoints send CORS headers, so call them directly (keys never pass through the proxy).
  async function fetchUser(path, params = {}) {
    const qs = new URLSearchParams({ locale: LOCALE, ...params }).toString();
    const url = `${DIRECT_BASE}${path}?${qs}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-App-Key": APP_KEY,
        Authorization: `Bearer ${settings.userKey}`,
      },
    });
    const json = await parseResponse(res, path);
    recordDebug(`${path}?${qs}`, json);
    return json;
  }

  // ---------- quest catalog ----------

  function slimQuest(q) {
    return {
      id: q.id,
      slug: q.slug,
      name: localized(q.name),
      description: localized(q.description),
      trader: q.trader,
      maps: Array.isArray(q.map) ? q.map : q.map ? [q.map] : [],
      objectives: (q.objectives || []).map(localized),
      oneRound: q.objectivesOneRound === true,
      requiredItems: q.requiredItemIds || [],
      otherRequirements: (q.otherRequirements || []).map(localized),
      previous: q.previousQuestIds || [],
      next: q.nextQuestIds || [],
    };
  }

  async function loadCatalog(force) {
    const cached = load(STORE.catalog, null);
    if (!force && cached && Date.now() - cached.savedAt < CATALOG_TTL_MS && cached.locale === LOCALE) {
      return cached.quests;
    }
    const json = await fetchPublic("/quests");
    const raw = json.quests ?? json.data?.quests ?? json.data ?? json;
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const quests = list.map(slimQuest);
    save(STORE.catalog, { savedAt: Date.now(), locale: LOCALE, quests });
    return quests;
  }

  // ---------- user progress ----------
  // The response shape of /v2/user/quests isn't documented, so parse defensively.

  function extractEntries(json) {
    const d = json?.data ?? json;
    const candidates = [d, d?.quests, d?.items, d?.results, d?.progress];
    for (const c of candidates) {
      if (Array.isArray(c)) return c;
    }
    for (const c of candidates) {
      if (c && typeof c === "object" && !Array.isArray(c)) {
        const values = Object.entries(c);
        if (values.length && values.every(([, v]) => v && typeof v === "object")) {
          return values.map(([k, v]) => ({ __key: k, ...v }));
        }
      }
    }
    return [];
  }

  function entryId(e) {
    if (typeof e === "string") return e;
    return e.questId ?? e.quest_id ?? e.quest?.id ?? e.id ?? e.slug ?? e.quest?.slug ?? e.__key;
  }

  function entryCompleted(e) {
    if (typeof e !== "object") return undefined;
    if (typeof e.completed === "boolean") return e.completed;
    if (typeof e.isCompleted === "boolean") return e.isCompleted;
    if (typeof e.is_completed === "boolean") return e.is_completed;
    if (typeof e.status === "string") return /complete|done|finished/i.test(e.status);
    if ("completedAt" in e || "completed_at" in e) return Boolean(e.completedAt ?? e.completed_at);
    return undefined;
  }

  // Returns an array of booleans (per objective) if the API exposes objective-level progress.
  function entryObjectiveProgress(e) {
    if (typeof e !== "object") return null;
    const src = e.objectives ?? e.objectiveProgress ?? e.objective_progress ?? e.completedObjectives ?? e.steps;
    if (!Array.isArray(src)) return null;
    if (src.every((v) => typeof v === "boolean")) return src;
    if (src.every((v) => v && typeof v === "object")) {
      return src.map((o) => Boolean(o.completed ?? o.done ?? o.isCompleted ?? o.complete));
    }
    // Array of completed objective indices.
    if (src.every((v) => Number.isInteger(v))) {
      const out = [];
      src.forEach((i) => (out[i] = true));
      return out;
    }
    return null;
  }

  async function loadProgress() {
    const [doneJson, openJson] = await Promise.all([
      fetchUser("/v2/user/quests", { filter: "completed" }),
      fetchUser("/v2/user/quests", { filter: "incomplete" }),
    ]);

    const completed = new Set();
    const incomplete = new Set();
    const objectiveProgress = new Map();

    for (const e of extractEntries(doneJson)) {
      const id = entryId(e);
      // The endpoint was filtered, but respect an explicit flag if present.
      if (id != null && entryCompleted(e) !== false) completed.add(String(id));
    }
    for (const e of extractEntries(openJson)) {
      const id = entryId(e);
      if (id == null) continue;
      if (entryCompleted(e) === true) {
        completed.add(String(id));
        continue;
      }
      incomplete.add(String(id));
      const prog = entryObjectiveProgress(e);
      if (prog) objectiveProgress.set(String(id), prog);
    }
    return { completed, incomplete, objectiveProgress };
  }

  // ---------- grouping ----------

  function buildView(quests, progress) {
    const isDone = (q) => progress.completed.has(q.id) || progress.completed.has(q.slug);
    const byId = new Map(quests.map((q) => [q.id, q]));

    const open = [];
    for (const q of quests) {
      if (isDone(q)) continue;
      const locked = q.previous.some((pid) => byId.has(pid) && !isDone(byId.get(pid)));
      if (locked && !settings.showLocked) continue;
      open.push({ ...q, locked, progress: progress.objectiveProgress.get(q.id) ?? progress.objectiveProgress.get(q.slug) });
    }

    const groups = new Map();
    for (const q of open) {
      const keys = q.maps.length ? q.maps : [ANY_MAP];
      for (const m of keys) {
        if (m === ANY_MAP && !settings.showAnyMap) continue;
        if (!groups.has(m)) groups.set(m, []);
        groups.get(m).push(q);
      }
    }

    const maps = [...groups.entries()].map(([id, qs]) => {
      qs.sort((a, b) => a.locked - b.locked || a.name.localeCompare(b.name));
      const active = qs.filter((q) => !q.locked);
      return {
        id,
        quests: qs,
        activeCount: active.length,
        exclusiveCount: active.filter((q) => q.maps.length === 1).length,
        objectiveCount: active.reduce((n, q) => n + remainingObjectives(q), 0),
      };
    });

    // Priority: most active quests, then most map-exclusive quests, then most open objectives.
    // "Any map" quests can be done anywhere, so that group always goes last.
    maps.sort(
      (a, b) =>
        (a.id === ANY_MAP) - (b.id === ANY_MAP) ||
        b.activeCount - a.activeCount ||
        b.exclusiveCount - a.exclusiveCount ||
        b.objectiveCount - a.objectiveCount ||
        mapName(a.id).localeCompare(mapName(b.id))
    );

    return { maps, totalOpen: open.filter((q) => !q.locked).length, totalLocked: open.filter((q) => q.locked).length, completedCount: quests.filter(isDone).length, totalQuests: quests.length };
  }

  function remainingObjectives(q) {
    if (!q.progress) return q.objectives.length;
    return q.objectives.filter((_, i) => !q.progress[i]).length;
  }

  // ---------- rendering ----------

  function collapsible(id, className, summaryChildren, bodyNode, defaultOpen) {
    const isCollapsed = id in collapsed ? collapsed[id] : !defaultOpen;
    const details = el("details", { class: className, id, open: !isCollapsed });
    details.append(el("summary", {}, el("span", { class: "chev", "aria-hidden": "true" }), summaryChildren), bodyNode);
    details.addEventListener("toggle", () => {
      collapsed[id] = !details.open;
      save(STORE.collapsed, collapsed);
    });
    return details;
  }

  function renderQuest(q, mapId) {
    const done = q.progress ? q.objectives.length - remainingObjectives(q) : null;
    const otherMaps = q.maps.filter((m) => m !== mapId);

    const summary = [
      el("span", { class: "quest-name" }, q.name, el("span", { class: "trader" }, q.trader)),
      q.oneRound && el("span", { class: "tag", title: "All steps must be completed in a single round" }, "One round"),
      q.locked && el("span", { class: "tag locked", title: "Prerequisite quest not completed" }, "Locked"),
      otherMaps.length > 0 && el("span", { class: "tag multi", title: "Also on: " + otherMaps.map(mapName).join(", ") }, `+${otherMaps.length} map${otherMaps.length > 1 ? "s" : ""}`),
      el("span", { class: "progress" }, done != null ? `${done}/${q.objectives.length}` : `${q.objectives.length} step${q.objectives.length === 1 ? "" : "s"}`),
    ];

    const body = el("div", { class: "quest-body" });
    if (q.description) body.append(el("p", { class: "desc" }, q.description));
    body.append(
      el(
        "ol",
        { class: "objectives" },
        q.objectives.map((text, i) => el("li", { class: q.progress?.[i] ? "done" : null }, text))
      )
    );

    const extras = el("div", { class: "extra" });
    if (q.oneRound) {
      extras.append(el("div", {}, el("b", {}, "Note: "), "all steps must be completed in a single round."));
    }
    if (q.requiredItems.length) {
      extras.append(
        el("div", {}, el("b", {}, "Items needed: "), q.requiredItems.map((r) => `${r.quantity}× ${humanize(r.itemId)}`).join(", "))
      );
    }
    if (q.otherRequirements.length) {
      extras.append(el("div", {}, el("b", {}, "Requires: "), q.otherRequirements.join(", ")));
    }
    if (q.locked) {
      extras.append(el("div", {}, el("b", {}, "Unlocks after: "), q.previous.map((id) => catalogById.get(id)?.name ?? humanize(id)).join(", ")));
    }
    if (otherMaps.length) {
      extras.append(el("div", { class: "also" }, el("b", {}, "Also on: "), otherMaps.map(mapName).join(", ")));
    }
    if (extras.childNodes.length) body.append(extras);
    const guideSearch = new URLSearchParams({ q: `Arc Raiders ${q.name} guide` });
    body.append(
      el("a", { class: "ext-link", href: `https://www.google.com/search?${guideSearch}`, target: "_blank", rel: "noopener" }, "Look up guide ↗")
    );

    return collapsible(`q-${mapId}-${q.id}`, "quest", summary, body, false);
  }

  function renderMap(group, index) {
    const metaParts = [`${group.activeCount} quest${group.activeCount === 1 ? "" : "s"} available`];
    if (group.id !== ANY_MAP) metaParts.push(`${group.exclusiveCount} only on this map`);
    const lockedCount = group.quests.length - group.activeCount;
    if (lockedCount) metaParts.push(`${lockedCount} locked`);

    const summary = [
      el("span", { class: "rank" }, group.id === ANY_MAP ? "∗" : index + 1),
      el("div", { class: "map-title" }, el("h2", {}, mapName(group.id)), el("div", { class: "meta" }, metaParts.join(" · "))),
      el("div", { class: "count" }, group.activeCount, el("small", {}, group.activeCount === 1 ? "quest" : "quests")),
    ];
    const body = el("div", { class: "quests" }, group.quests.map((q) => renderQuest(q, group.id)));
    const cls = "map" + (index === 0 && group.id !== ANY_MAP && group.activeCount > 0 ? " top" : "");
    return collapsible(`map-${group.id}`, cls, summary, body, true);
  }

  function render(view) {
    const mapsNode = document.getElementById("maps");
    const summaryNode = document.getElementById("summary");
    mapsNode.replaceChildren();

    summaryNode.hidden = false;
    summaryNode.replaceChildren(
      el("span", {}, el("strong", {}, view.totalOpen), " active quests"),
      el("span", {}, el("strong", {}, view.completedCount), ` of ${view.totalQuests} completed`),
      ...(settings.showLocked && view.totalLocked ? [el("span", {}, el("strong", {}, view.totalLocked), " locked shown")] : [])
    );

    if (!view.maps.length) {
      mapsNode.append(el("p", { class: "empty" }, "No active quests. Nice work, Raider."));
      return;
    }
    view.maps.forEach((g, i) => mapsNode.append(renderMap(g, i)));
  }

  function setStatus(message, { error = false, action } = {}) {
    const node = document.getElementById("status");
    node.className = "status" + (error ? " error" : "");
    node.replaceChildren();
    if (!message) return;
    node.append(message);
    if (action) {
      const btn = el("button", { type: "button", class: "btn" }, action.label);
      btn.addEventListener("click", action.onClick);
      node.append(btn);
    }
  }

  // ---------- main flow ----------

  let catalog = null;
  let catalogById = new Map();
  let progress = null;

  async function refresh({ forceCatalog = false } = {}) {
    const refreshBtn = document.getElementById("refresh");
    refreshBtn.disabled = true;
    setStatus("Loading…");
    try {
      if (!APP_KEY) {
        document.getElementById("maps").replaceChildren();
        document.getElementById("summary").hidden = true;
        setStatus("This site has no ArcTracker app key configured. Set the ARC_APP_KEY environment variable and redeploy (see README).", { error: true });
        return;
      }
      if (!settings.userKey) {
        document.getElementById("maps").replaceChildren();
        document.getElementById("summary").hidden = true;
        setStatus("Add your ArcTracker user key to load your quests.", {
          action: { label: "Open settings", onClick: openSettings },
        });
        return;
      }
      const [cat, prog] = await Promise.all([
        catalog && !forceCatalog ? catalog : loadCatalog(forceCatalog),
        loadProgress(),
      ]);
      catalog = cat;
      catalogById = new Map(catalog.map((q) => [q.id, q]));
      progress = prog;

      if (prog.completed.size === 0 && prog.incomplete.size === 0) {
        setStatus("The quest progress response had no recognizable quest entries — check Settings → Debug to see what the API returned.", { error: true });
      } else {
        setStatus("");
      }
      render(buildView(catalog, progress));
    } catch (err) {
      console.error(err);
      if (/app_key/.test(err.code || "")) {
        setStatus("This site's ArcTracker app key was rejected. The site owner needs to update ARC_APP_KEY and redeploy (see README).", { error: true });
        return;
      }
      const authProblem = err.status === 401 || err.status === 403;
      setStatus(err.message, {
        error: true,
        action: authProblem ? { label: "Open settings", onClick: openSettings } : { label: "Retry", onClick: () => refresh() },
      });
    } finally {
      refreshBtn.disabled = false;
    }
  }

  function rerender() {
    if (catalog && progress) render(buildView(catalog, progress));
  }

  // ---------- settings modal ----------

  const dialog = document.getElementById("settings");
  const userKeyInput = document.getElementById("user-key");
  const showKeys = document.getElementById("show-keys");
  const showLocked = document.getElementById("show-locked");
  const showAnyMap = document.getElementById("show-anymap");

  function openSettings() {
    userKeyInput.value = settings.userKey;
    showLocked.checked = settings.showLocked;
    showAnyMap.checked = settings.showAnyMap;
    showKeys.checked = false;
    userKeyInput.type = "password";
    dialog.showModal();
    userKeyInput.focus();
  }

  document.getElementById("settings-form").addEventListener("submit", () => {
    const keysChanged = userKeyInput.value.trim() !== settings.userKey;
    settings = {
      ...settings,
      userKey: userKeyInput.value.trim(),
      showLocked: showLocked.checked,
      showAnyMap: showAnyMap.checked,
    };
    save(STORE.settings, settings);
    if (keysChanged || !progress) refresh();
    else rerender();
  });

  document.getElementById("cancel-settings").addEventListener("click", () => dialog.close());
  document.getElementById("clear-keys").addEventListener("click", () => {
    userKeyInput.value = "";
    userKeyInput.focus();
  });
  showKeys.addEventListener("change", () => {
    userKeyInput.type = showKeys.checked ? "text" : "password";
  });

  document.getElementById("open-settings").addEventListener("click", openSettings);
  document.getElementById("refresh").addEventListener("click", () => refresh({ forceCatalog: true }));

  function setAll(open) {
    document.querySelectorAll("#maps details").forEach((d) => {
      // Only flip maps and their quests one level at a time: expanding all opens everything,
      // collapsing all closes just the maps (quests keep their state for next time).
      if (open || d.classList.contains("map")) d.open = open;
    });
  }
  document.getElementById("expand-all").addEventListener("click", () => setAll(true));
  document.getElementById("collapse-all").addEventListener("click", () => setAll(false));

  // iOS Safari ignores user-scalable=no, so block its pinch-zoom gestures directly.
  document.addEventListener("gesturestart", (e) => e.preventDefault());

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed", err));
  }

  refresh();
})();
