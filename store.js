// 저장소: Supabase 가 설정돼 있으면 공유 모드, 아니면 브라우저(localStorage) 로컬 모드.
// 상태 모양: { meta: {...}, rooms: {id: room}, pins: {photoId: pin} }
(function () {
  const cfg = window.APP_CONFIG || {};
  const params = new URLSearchParams(location.search);
  const project = (params.get("p") || cfg.DEFAULT_PROJECT || "home").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "home";
  const KINDS = ["rooms", "pins", "meta"];
  let state = { meta: {}, rooms: {}, pins: {} };
  let listeners = [];
  let mode = "local";
  let sb = null;

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const emit = () => listeners.forEach((fn) => fn(clone(state)));
  const lsKey = "newhome:" + project;

  async function loadSeed() {
    const r = await fetch("seed/initial.json", { cache: "no-store" });
    if (!r.ok) throw new Error("seed load failed");
    const s = await r.json();
    return { meta: s.meta || {}, rooms: s.rooms || {}, pins: s.pins || {} };
  }

  // ---------- local ----------
  function saveLocal() {
    try { localStorage.setItem(lsKey, JSON.stringify(state)); } catch (e) { /* storage blocked: keep in memory */ }
  }
  async function initLocal() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(lsKey) || "null"); } catch (e) { saved = null; }
    state = saved || (await loadSeed());
    if (!saved) saveLocal();
    window.addEventListener("storage", (e) => {
      if (e.key === lsKey && e.newValue) { state = JSON.parse(e.newValue); emit(); }
    });
  }

  // ---------- supabase ----------
  function rowToState(rows) {
    const s = { meta: {}, rooms: {}, pins: {} };
    rows.forEach((r) => {
      if (r.kind === "meta") s.meta = { ...s.meta, ...r.data };
      else if (s[r.kind]) s[r.kind][r.id] = r.data;
    });
    return s;
  }
  async function initSupabase() {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    const { data, error } = await sb.from("items").select("kind,id,data").eq("project", project);
    if (error) throw error;
    if (!data.length) {
      const seed = await loadSeed();
      const rows = [{ project, kind: "meta", id: "site", data: seed.meta }];
      Object.entries(seed.rooms).forEach(([id, d]) => rows.push({ project, kind: "rooms", id, data: d }));
      Object.entries(seed.pins).forEach(([id, d]) => rows.push({ project, kind: "pins", id, data: d }));
      const ins = await sb.from("items").insert(rows);
      if (ins.error) throw ins.error;
      state = seed;
    } else {
      state = rowToState(data);
    }
    sb.channel("items:" + project)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: "project=eq." + project }, (p) => {
        const row = p.eventType === "DELETE" ? p.old : p.new;
        if (!row || !KINDS.includes(row.kind)) return;
        if (p.eventType === "DELETE") { if (row.kind !== "meta") delete state[row.kind][row.id]; }
        else if (row.kind === "meta") state.meta = { ...state.meta, ...row.data };
        else state[row.kind][row.id] = row.data;
        emit();
      })
      .subscribe();
  }
  const queue = {}; const busy = {};
  async function pushRow(kind, id) {
    const k = kind + "/" + id;
    if (busy[k]) { queue[k] = true; return; }
    busy[k] = true;
    try {
      const data = kind === "meta" ? state.meta : state[kind][id];
      const res = data === undefined
        ? await sb.from("items").delete().match({ project, kind, id })
        : await sb.from("items").upsert({ project, kind, id, data, updated_at: new Date().toISOString() });
      if (res.error) throw res.error;
      Store.status("저장됨");
    } catch (e) {
      Store.status("저장 실패: 인터넷 연결을 확인해 주세요");
    }
    busy[k] = false;
    if (queue[k]) { delete queue[k]; pushRow(kind, id); }
  }

  function write(kind, id) {
    if (mode === "local") { saveLocal(); Store.status("이 브라우저에 저장됨"); }
    else { Store.status("저장 중…"); pushRow(kind, id); }
    emit();
  }

  const Store = {
    project,
    get mode() { return mode; },
    status: () => {},
    async init() {
      if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && params.get("p")) {
        try { await initSupabase(); mode = "shared"; }
        catch (e) { console.error(e); Store.status("공유 저장소 연결 실패, 로컬 모드로 열었어요"); await initLocal(); mode = "local"; }
      } else {
        await initLocal();
      }
      emit();
      return { mode, project };
    },
    onChange(fn) { listeners.push(fn); },
    get() { return clone(state); },
    put(kind, id, data) {
      if (kind === "meta") state.meta = { ...data }; else state[kind][id] = { ...data };
      write(kind, id);
    },
    patch(kind, id, patch) {
      if (kind === "meta") state.meta = { ...state.meta, ...patch };
      else state[kind][id] = { ...(state[kind][id] || {}), ...patch };
      write(kind, id);
    },
    del(kind, id) { delete state[kind][id]; write(kind, id); },
    async replaceAll(next) {
      const old = state;
      state = { meta: next.meta || {}, rooms: next.rooms || {}, pins: next.pins || {} };
      if (mode === "local") { saveLocal(); emit(); return; }
      ["rooms", "pins"].forEach((k) => Object.keys(old[k]).forEach((id) => { if (!state[k][id]) pushRow(k, id); }));
      pushRow("meta", "site");
      ["rooms", "pins"].forEach((k) => Object.keys(state[k]).forEach((id) => pushRow(k, id)));
      emit();
    },
    // ---------- photos ----------
    async photoUrl(file) {
      if (mode !== "shared") return null;
      const { data, error } = await sb.storage.from(cfg.PHOTO_BUCKET || "photos").createSignedUrl(project + "/" + file, 604800);
      return error ? null : data.signedUrl;
    },
    async photoUrls(files) {
      if (mode !== "shared") return {};
      const { data, error } = await sb.storage.from(cfg.PHOTO_BUCKET || "photos").createSignedUrls(files.map((f) => project + "/" + f), 604800);
      if (error || !data) return {};
      const out = {};
      data.forEach((d, i) => { if (d.signedUrl && !d.error) out[files[i]] = d.signedUrl; });
      return out;
    },
    async uploadPhoto(file, name) {
      if (mode !== "shared") return false;
      const { error } = await sb.storage.from(cfg.PHOTO_BUCKET || "photos").upload(project + "/" + name, file, { upsert: true, contentType: file.type || "image/jpeg" });
      return !error;
    },
  };
  window.Store = Store;
})();
