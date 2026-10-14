/* لوحة تخطيط شاشات متحف KNPC
   - المخطط المسطّح: الجدار مفروداً بالسنتيمتر، والشاشات تُسحب وتُكبّر عليه.
   - الغرفة ثلاثية الأبعاد: الجدار نفسه ملفوفاً حول الزائر (room3d.js).
   - طرق العرض: كل شاشة لحالها، ممتد على الكل، نفس المحتوى، ينتقل بين الشاشات. */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  const LS_KEY = 'knpc-wall-planner:v1';
  const LS_SC = 'knpc-wall-planner:scenarios';
  const CANVAS_LONG = 640;
  const CENTER_Y = 190; // default screen centre height (cm) — slightly above eye level

  const ICON = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12.5-7.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>',
    restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke-linecap="round"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.5 8.5 0 0 1 0 12" stroke-linecap="round"/></svg>',
    // RTL: "back" points right, so the undo arrow is the mirrored one
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
    rotate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="11" height="13" rx="1.5"/><path d="M12 3h3a6 6 0 0 1 6 6v2"/><path d="M18.5 8.5L21 11l2.5-2.5" transform="translate(-2 0)"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2.5l8.5 4.75v9.5L12 21.5l-8.5-4.75v-9.5z"/><path d="M3.5 7.25L12 12l8.5-4.75M12 12v9.5"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  };

  const DEFAULT_G = {
    media: 'demo-film', style: 'jump', dwell: 4, whole: false, restart: false, fade: true,
    speed: 160, width: 0, others: 'dark', area: 'screens', spanFit: 'cover',
  };

  /* ---------- state ---------- */
  let seq = 0;
  const uid = () => 's' + Date.now().toString(36) + (seq++).toString(36);

  // settings that belong to the editor, not to an example
  const UI = { snap: 10, labels: true, eye: true, ghost: true, view: 'plan', zoom: 1 };
  const MODE_KEYS = ['independent', 'span', 'mirror', 'travel'];

  // each example is a full wall layout with its own playback settings
  function newExample(name, screens) {
    return { id: 'x' + uid(), name, wall: { length: 2600, height: 420, arc: 220 }, screens: screens || [], dir: 'rtl', mode: 'independent', g: Object.assign({}, DEFAULT_G) };
  }
  let examples = [];
  let ACT = null; // the example the panels are editing
  let S = null;   // the example being worked on right now (ACT, except while the render loop walks every example)
  let selected = null;
  const P = { playing: true, sound: false, clock: 0 };

  function knpcPreset(L) {
    // المخطط الحالي: 13 شاشة (10 أفقية و3 عمودية) مقروءة من اليمين لليسار
    const spec = [
      ['h', 'mid'], ['v', 'man'], ['h', 'high'], ['h', 'low'], ['h', 'mid'], ['v', 'woman'], ['h', 'high'],
      ['h', 'low'], ['h', 'mid'], ['v', 'man'], ['h', 'mid'], ['h', 'low'], ['h', 'mid'],
    ];
    const label = { mid: 'في المنتصف', high: 'أعلى قليلاً', low: 'أسفل قليلاً', man: 'متحدث (رجل)', woman: 'متحدثة (امرأة)' };
    const margin = 110, step = (L - margin * 2) / (spec.length - 1);
    let a = 0;
    return spec.map(([o, p], i) => {
      const w = o === 'h' ? 122 : 69, h = o === 'h' ? 69 : 122; // 55-inch panels
      const cx = L - margin - i * step;
      const cy = p === 'high' ? CENTER_Y + 22 : p === 'low' ? CENTER_Y - 38 : CENTER_Y;
      const media = o === 'v' ? (p === 'woman' ? 'demo-woman' : 'demo-man') : 'demo-arch-' + (a++ % 5);
      return { id: uid(), x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, label: label[p], media, fit: 'cover' };
    });
  }

  /* ---------- geometry helpers ---------- */
  const get = (id) => S.screens.find((s) => s.id === id) || null;
  const rectOf = (sc) => ({ x: sc.x, y: S.wall.height - sc.y - sc.h, w: sc.w, h: sc.h }); // top-down cm
  function orient(sc) {
    const r = sc.w / sc.h;
    if (r > 1.15) return { key: 'h', label: 'أفقية' };
    if (r < 0.87) return { key: 'v', label: 'عمودية' };
    return { key: 's', label: 'مربعة' };
  }
  const inches = (sc) => Math.sqrt(sc.w * sc.w + sc.h * sc.h) / 2.54;
  function resolution(sc) {
    const long = 1920, a = Math.max(sc.w, sc.h) / Math.min(sc.w, sc.h);
    const short = Math.round(long / a / 2) * 2;
    return sc.w >= sc.h ? [long, short] : [short, long];
  }
  function ordered() {
    return [...S.screens].sort((a, b) => {
      const ca = a.x + a.w / 2, cb = b.x + b.w / 2;
      if (Math.abs(ca - cb) > 2) return S.dir === 'rtl' ? cb - ca : ca - cb;
      return (b.y + b.h) - (a.y + a.h);
    });
  }
  function renumber() { numbers = new Map(ordered().map((s, i) => [s.id, i + 1])); if (cur) cur.numbers = numbers; }
  function bbox(list) {
    const l = list || S.screens;
    if (!l.length) return { x: 0, y: 0, w: S.wall.length, h: S.wall.height };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    l.forEach((s) => { const r = rectOf(s); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function clampScreen(sc) {
    sc.w = clamp(Math.round(sc.w), 10, S.wall.length);
    sc.h = clamp(Math.round(sc.h), 10, S.wall.height);
    sc.x = clamp(Math.round(sc.x), 0, S.wall.length - sc.w);
    sc.y = clamp(Math.round(sc.y), 0, S.wall.height - sc.h);
  }

  /* ---------- history + persistence ---------- */
  const hist = { stack: [], i: -1 };
  const snap = () => JSON.stringify({ examples, active: ACT.id });
  function commit() {
    const s = snap();
    if (hist.stack[hist.i] !== s) {
      hist.stack = hist.stack.slice(0, hist.i + 1);
      hist.stack.push(s);
      if (hist.stack.length > 100) hist.stack.shift();
      hist.i = hist.stack.length - 1;
    }
    refresh();
  }
  function applySnap(s) {
    const d = JSON.parse(s);
    examples = d.examples;
    ACT = examples.find((x) => x.id === d.active) || examples[0];
    use(ACT);
    if (selected && !get(selected)) selected = null;
    refresh(); renderDisplay();
  }
  function undo() { if (hist.i > 0) { hist.i--; applySnap(hist.stack[hist.i]); } }
  function redo() { if (hist.i < hist.stack.length - 1) { hist.i++; applySnap(hist.stack[hist.i]); } }

  const LS_V2 = 'knpc-wall-planner:v2';
  let saveT = 0;
  function persisted() {
    return { v: 2, examples, active: ACT.id, ui: { snap: UI.snap, labels: UI.labels, eye: UI.eye, ghost: UI.ghost } };
  }
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(LS_V2, JSON.stringify(persisted())); } catch (e) { /* storage off */ } }, 300);
    cloudSchedule(); // shared copy for the team, when the site runs on Vercel
  }
  // accepts one example (or a layout saved by the first version of the tool)
  function normalizeExample(d, name, keepIds) {
    if (!d || !Array.isArray(d.screens) || !d.wall) return null;
    return {
      id: keepIds && d.id ? d.id : 'x' + uid(),
      name: d.name || name || 'مثال',
      wall: Object.assign({ length: 2600, height: 420, arc: 220 }, d.wall),
      screens: d.screens.map((s) => Object.assign({ label: '', media: null, fit: 'cover' }, s, keepIds && s.id ? {} : { id: uid() })),
      dir: d.dir === 'ltr' ? 'ltr' : 'rtl',
      mode: MODE_KEYS.includes(d.mode) ? d.mode : 'independent',
      g: Object.assign({}, DEFAULT_G, d.g || {}),
    };
  }
  function examplesFrom(d) {
    if (d && d.v === 2 && Array.isArray(d.examples)) return d.examples.map((x) => normalizeExample(x)).filter(Boolean);
    const one = normalizeExample(d, 'مثال مستورد');
    return one ? [one] : [];
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(LS_V2));
      if (d && d.v === 2 && Array.isArray(d.examples)) {
        examples = d.examples.map((x) => normalizeExample(x, null, true)).filter(Boolean);
        if (examples.length) {
          ['snap', 'labels', 'eye', 'ghost'].forEach((k) => { if (d.ui && d.ui[k] !== undefined) UI[k] = d.ui[k]; });
          ACT = examples.find((x) => x.id === d.active) || examples[0];
          return true;
        }
      }
    } catch (e) { /* fall through */ }
    // first version kept one layout plus a list of saved scenarios: turn them into examples
    try {
      const old = JSON.parse(localStorage.getItem(LS_KEY));
      const first = normalizeExample(old, 'المخطط الحالي', true);
      if (!first) return false;
      examples = [first];
      ['snap', 'labels', 'eye', 'ghost'].forEach((k) => { if (old[k] !== undefined) UI[k] = old[k]; });
      let sc = [];
      try { sc = JSON.parse(localStorage.getItem(LS_SC)) || []; } catch (e) { /* none */ }
      sc.forEach((x) => { const ex = normalizeExample(x.data, x.name); if (ex) examples.push(ex); });
      ACT = first;
      return true;
    } catch (e) { return false; }
  }

  /* ---------- toast ---------- */
  let toastT = 0;
  function toast(msg) {
    let el = $('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* =====================================================================
     PLAN VIEW
     ===================================================================== */
  const RT = new Map(); // example id -> its cards, canvases and playback state
  let cur = null, views = null, wallEl = null, ghost = null, gctx = null, scale = 0.5, fitScale = 0.5, T = null;
  let numbers = new Map();

  function use(ex) {
    S = ex; cur = rtFor(ex);
    views = cur.views; wallEl = cur.wallEl; ghost = cur.ghost; gctx = cur.gctx; scale = cur.scale; T = cur.T; numbers = cur.numbers;
  }
  const exOf = (r) => examples.find((x) => x.id === r.card.dataset.ex) || null;

  function rtFor(ex) {
    let r = RT.get(ex.id);
    if (r) return r;
    const card = document.createElement('article');
    card.className = 'ex'; card.dataset.ex = ex.id;
    card.innerHTML = `
      <header class="ex-h">
        <span class="ex-n"></span>
        <input type="text" class="ex-name" maxlength="60" aria-label="اسم المثال">
        <span class="ex-sum"></span>
        <span class="ex-tools">
          <button type="button" class="btn sm" data-ex-act="addh">+ شاشة أفقية</button>
          <button type="button" class="btn sm" data-ex-act="addv">+ شاشة عمودية</button>
          <button type="button" class="btn sm" data-ex-act="dup">${ICON.copy}نسخ المثال</button>
          <button type="button" class="btn sm danger" data-ex-act="del">${ICON.trash}<span>حذف المثال</span></button>
        </span>
        <button type="button" class="btn sm room-btn" data-ex-act="room">${ICON.cube}الغرفة ثلاثية الأبعاد</button>
      </header>
      <div class="ex-body"><div class="plan-inner">
        <div class="wall"><canvas class="ghost"></canvas><div class="eye-line"><span>مستوى النظر</span></div><div class="ruler"></div><div class="vruler"></div>
          <p class="ex-empty">الجدار فارغ. اضغط مرتين على أي مكان في الجدار لإضافة شاشة، أو استخدم أزرار الإضافة بالأعلى.</p></div>
        <div class="dir-arrow"><span>اتجاه المشاهدة</span></div>
      </div></div>`;
    $('#examples').appendChild(card);
    const g = card.querySelector('.ghost');
    r = {
      card, wallEl: card.querySelector('.wall'), ghost: g, gctx: g.getContext('2d'), views: new Map(), scale: 0.5,
      numbers: new Map(), T: { idx: 0, prev: -1, fade: 1, tt: 0 },
      eye: card.querySelector('.eye-line'), ruler: card.querySelector('.ruler'), vruler: card.querySelector('.vruler'),
      arrow: card.querySelector('.dir-arrow'), name: card.querySelector('.ex-name'), sum: card.querySelector('.ex-sum'),
      num: card.querySelector('.ex-n'), empty: card.querySelector('.ex-empty'),
    };
    RT.set(ex.id, r);
    bindWall(r);
    return r;
  }

  function computeScale() {
    const sc = $('#planScroll');
    const pw = sc.clientWidth - 32 - 28 - 78, ph = sc.clientHeight - 170;
    // fit the whole wall, but never so small that a 55" screen shrinks below ~55px (phones scroll sideways instead)
    const fit = Math.min(pw / S.wall.length, ph / S.wall.height);
    fitScale = Math.max(0.05, Math.max(fit, Math.min(ph / S.wall.height, 0.45)));
    scale = fitScale * UI.zoom;
    cur.scale = scale;
  }

  function viewFor(sc) {
    let v = views.get(sc.id);
    if (v) return v;
    const el = document.createElement('div');
    el.className = 'scr'; el.dataset.id = sc.id;
    el.innerHTML = '<canvas></canvas><span class="badge"></span>'
      + `<span class="tb"><span class="tb-dim"></span><button type="button" data-t="rot" title="تدوير: أفقية ↔ عمودية" aria-label="تدوير">${ICON.rotate}</button>`
      + `<button type="button" data-t="dup" title="تكرار الشاشة" aria-label="تكرار">${ICON.copy}</button><button type="button" data-t="del" title="حذف الشاشة" aria-label="حذف">${ICON.trash}</button></span>`
      + '<span class="cap"><b></b><small></small></span><span class="handle" title="تغيير الحجم (Shift لتغيير النسبة)"></span>';
    wallEl.appendChild(el);
    const canvas = el.querySelector('canvas');
    v = { el, canvas, ctx: canvas.getContext('2d'), badge: el.querySelector('.badge'), capB: el.querySelector('.cap b'), capS: el.querySelector('.cap small'), dim: el.querySelector('.tb-dim') };
    views.set(sc.id, v);
    return v;
  }

  function layoutScreen(sc) {
    const v = viewFor(sc), r = rectOf(sc);
    v.el.style.left = r.x * scale + 'px';
    v.el.style.top = r.y * scale + 'px';
    v.el.style.width = r.w * scale + 'px';
    v.el.style.height = r.h * scale + 'px';
    const k = CANVAS_LONG / Math.max(sc.w, sc.h);
    const cw = Math.max(8, Math.round(sc.w * k)), ch = Math.max(8, Math.round(sc.h * k));
    if (v.canvas.width !== cw || v.canvas.height !== ch) { v.canvas.width = cw; v.canvas.height = ch; Room3D.markDirty(); }
    v.badge.textContent = numbers.get(sc.id) || '';
    const o = orient(sc), m = Media.get(sc.media);
    v.capB.textContent = sc.label ? `${o.label} · ${sc.label}` : o.label;
    v.capS.textContent = m ? m.name : 'بدون محتوى';
    v.dim.textContent = `${Math.round(sc.w)}×${Math.round(sc.h)} سم · ${Math.round(inches(sc))}″`;
    v.el.classList.toggle('sel', sc.id === selected);
  }
  // captions shrink to the space next to their neighbours, and hide when a screen sits right under them
  function markTight() {
    S.screens.forEach((a) => {
      const ra = rectOf(a), cxa = ra.x + ra.w / 2;
      let tight = false, room = 116;
      S.screens.forEach((b) => {
        if (b === a) return;
        const rb = rectOf(b);
        const overlapX = rb.x < ra.x + ra.w + 10 && rb.x + rb.w > ra.x - 10;
        const gap = rb.y - (ra.y + ra.h);
        if (overlapX && gap >= -1 && gap * scale < 34) tight = true;
        if (Math.abs((rb.y + rb.h) - (ra.y + ra.h)) * scale < 34) room = Math.min(room, Math.abs(rb.x + rb.w / 2 - cxa) * scale - 6);
      });
      const w = Math.max(ra.w * scale, room);
      if (w < 54) tight = true;
      const v = views.get(a.id);
      if (!v) return;
      v.el.classList.toggle('tight', tight);
      v.el.style.setProperty('--capw', w + 'px');
      v.el.title = v.capB.textContent + ' — ' + v.capS.textContent;
    });
  }

  const MODE_NAMES = { independent: 'كل شاشة لحالها', span: 'ممتد على كل الشاشات', mirror: 'نفس المحتوى على الكل', travel: 'ينتقل بين الشاشات' };
  function countText(ex) {
    let h = 0, v = 0, q = 0;
    ex.screens.forEach((s) => { const o = orient(s).key; if (o === 'h') h++; else if (o === 'v') v++; else q++; });
    const sub = [];
    if (h) sub.push(`${h} أفقية`); if (v) sub.push(`${v} عمودية`); if (q) sub.push(`${q} مربعة`);
    return [`${ex.screens.length} شاشة`].concat(sub.length ? [sub.join(' و')] : []).join(' · ');
  }

  // lays out the example currently in use()
  function layoutExample() {
    computeScale();
    wallEl.style.width = S.wall.length * scale + 'px';
    wallEl.style.height = S.wall.height * scale + 'px';
    const gw = Math.min(2400, Math.round(S.wall.length * scale)), gh = Math.max(1, Math.round(gw * S.wall.height / S.wall.length));
    if (ghost.width !== gw || ghost.height !== gh) { ghost.width = gw; ghost.height = gh; }
    const ids = new Set(S.screens.map((s) => s.id));
    views.forEach((v, id) => { if (!ids.has(id)) { v.el.remove(); views.delete(id); } });
    S.screens.forEach(layoutScreen);
    markTight();
    cur.eye.hidden = !UI.eye;
    cur.eye.style.top = (S.wall.height - 160) * scale + 'px';
    wallEl.classList.toggle('no-labels', !UI.labels);
    cur.arrow.classList.toggle('ltr', S.dir === 'ltr');
    cur.arrow.style.width = S.wall.length * scale + 'px';
    cur.empty.hidden = S.screens.length > 0;
    renderRuler();
    renderHeader();
  }
  function renderHeader() {
    cur.num.textContent = examples.indexOf(S) + 1;
    if (document.activeElement !== cur.name) cur.name.value = S.name;
    cur.name.style.width = Math.min(300, Math.max(100, S.name.length * 11 + 34)) + 'px';
    cur.sum.textContent = `${countText(S)} · ${MODE_NAMES[S.mode]}`;
    cur.card.classList.toggle('active', S === ACT);
  }

  // every example: create/remove cards, keep their order, lay them out
  function syncAll() {
    const ids = new Set(examples.map((x) => x.id));
    RT.forEach((r, id) => { if (!ids.has(id)) { r.card.remove(); RT.delete(id); } });
    const box = $('#examples');
    examples.forEach((ex, i) => { const r = rtFor(ex); if (box.children[i] !== r.card) box.insertBefore(r.card, box.children[i] || null); });
    examples.forEach((ex) => { use(ex); renumber(); layoutExample(); });
    use(ACT);
    $('#zoomOut').textContent = Math.round(UI.zoom * 100) + '%';
  }

  function renderRuler() {
    const step = scale * 100 < 34 ? 200 : 100;
    let html = '';
    for (let x = 0; x <= S.wall.length; x += step) html += `<b style="left:${x * scale}px"><span>${x / 100}م</span></b>`;
    cur.ruler.innerHTML = html;
    let v = '';
    for (let y = 0; y <= S.wall.height; y += 100) v += `<b style="top:${(S.wall.height - y) * scale}px"><span>${y / 100}م</span></b>`;
    cur.vruler.innerHTML = v;
  }

  /* ---------- drag / resize on the wall ---------- */
  let drag = null;
  const guides = [];
  function clearGuides() { guides.forEach((g) => g.remove()); guides.length = 0; }
  function addGuide(kind, pos) {
    const g = document.createElement('div'); g.className = 'guide ' + kind;
    if (kind === 'v') g.style.left = pos * scale + 'px'; else g.style.top = pos * scale + 'px';
    wallEl.appendChild(g); guides.push(g);
  }

  function bindWall(r) {
    const w = r.wallEl;
    const activateHere = () => { const ex = exOf(r); if (ex && ex !== ACT) activate(ex); return ex; };
    w.addEventListener('pointerdown', (e) => {
      if (!activateHere()) return;
      if (e.target.closest('.tb')) return;
      const el = e.target.closest('.scr');
      if (!el) { select(null); return; }
      const sc = get(el.dataset.id);
      if (!sc) return;
      select(sc.id);
      drag = { id: sc.id, resize: e.target.classList.contains('handle'), sx: e.clientX, sy: e.clientY, o: Object.assign({}, sc), moved: false, el };
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      e.preventDefault();
    });
    w.addEventListener('pointermove', onDragMove);
    w.addEventListener('pointerup', endDrag);
    w.addEventListener('pointercancel', endDrag);
    // the toolbar on the selected screen
    w.addEventListener('click', (e) => {
      const b = e.target.closest('[data-t]'); if (!b) return;
      const sc = get(b.closest('.scr').dataset.id); if (!sc) return;
      if (b.dataset.t === 'rot') rotateScreen(sc);
      else if (b.dataset.t === 'dup') duplicateScreen(sc);
      else if (b.dataset.t === 'del') deleteScreen(sc);
    });
    // double-click a screen to rotate it, or empty wall to add a screen there
    w.addEventListener('dblclick', (e) => {
      if (e.target.closest('.tb') || e.target.classList.contains('handle')) return;
      if (!activateHere()) return;
      const el = e.target.closest('.scr');
      if (el) { const sc = get(el.dataset.id); if (sc) rotateScreen(sc); return; }
      const rect = w.getBoundingClientRect();
      addScreenAt('h', (e.clientX - rect.left) / scale, S.wall.height - (e.clientY - rect.top) / scale);
    });
    // drop media from the library (or files from the desktop) onto a screen
    w.addEventListener('dragover', (e) => {
      e.preventDefault();
      $$('.scr.drop').forEach((x) => x.classList.remove('drop'));
      const el = e.target.closest('.scr'); if (el) el.classList.add('drop');
    });
    w.addEventListener('dragleave', (e) => { const el = e.target.closest('.scr'); if (el) el.classList.remove('drop'); });
    w.addEventListener('drop', async (e) => {
      e.preventDefault();
      $$('.scr.drop').forEach((x) => x.classList.remove('drop'));
      if (!activateHere()) return;
      const el = e.target.closest('.scr');
      const sc = el ? get(el.dataset.id) : null;
      const mid = e.dataTransfer.getData('text/x-media-id');
      if (mid && sc) { assign(sc.id, mid); return; }
      const files = [...(e.dataTransfer.files || [])];
      if (!files.length) return;
      const added = await addFiles(files);
      if (sc && added[0]) assign(sc.id, added[0].id);
    });
  }

  function onDragMove(e) {
    if (!drag) return;
    const sc = get(drag.id); if (!sc) return;
    const dx = (e.clientX - drag.sx) / scale, dy = (e.clientY - drag.sy) / scale;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 2 / scale) return;
    drag.moved = true;
    const sn = UI.snap, o = drag.o;
    clearGuides();
    if (drag.resize) {
      let w = Math.max(20, o.w + dx), h;
      w = Math.round(w / sn) * sn;
      if (e.shiftKey) h = Math.max(20, Math.round((o.h + dy) / sn) * sn);
      else h = Math.round(w * o.h / o.w);
      sc.w = w; sc.h = h; sc.y = o.y + o.h - h; // keep top edge
    } else {
      let x = Math.round((o.x + dx) / sn) * sn;
      let y = Math.round((o.y - dy) / sn) * sn;
      const thr = 8 / scale;
      // alignment guides against the other screens
      let bestX = null, bestY = null;
      S.screens.forEach((t) => {
        if (t.id === sc.id) return;
        [t.x, t.x + t.w / 2, t.x + t.w].forEach((tx) => {
          [x, x + sc.w / 2, x + sc.w].forEach((mx) => {
            const d = tx - mx; if (Math.abs(d) < thr && (!bestX || Math.abs(d) < Math.abs(bestX.d))) bestX = { d, at: tx };
          });
        });
        [t.y, t.y + t.h / 2, t.y + t.h].forEach((ty) => {
          [y, y + sc.h / 2, y + sc.h].forEach((my) => {
            const d = ty - my; if (Math.abs(d) < thr && (!bestY || Math.abs(d) < Math.abs(bestY.d))) bestY = { d, at: ty };
          });
        });
      });
      if (bestX) { x += bestX.d; addGuide('v', bestX.at); }
      if (bestY) { y += bestY.d; addGuide('h', S.wall.height - bestY.at); }
      sc.x = x; sc.y = y;
    }
    clampScreen(sc);
    renumber();
    S.screens.forEach((s) => { const v = views.get(s.id); if (v) v.badge.textContent = numbers.get(s.id); });
    layoutScreen(sc);
    updateInspectorValues();
  }
  function endDrag() {
    if (!drag) return;
    drag.el.classList.remove('dragging');
    clearGuides();
    const moved = drag.moved; drag = null;
    if (moved) commit();
  }

  /* =====================================================================
     RENDERING (all modes)
     ===================================================================== */
  // Places media `m` over the cm-rect `area` (cover/contain) and paints the part that falls inside `scr` onto ctx.
  function drawMedia(ctx, m, area, scr, cw, ch, fit, alpha) {
    if (!m || !m.ready()) return false;
    const sw = m.w(), sh = m.h();
    if (!sw || !sh) return false;
    const s = fit === 'contain' ? Math.min(area.w / sw, area.h / sh) : Math.max(area.w / sw, area.h / sh);
    const D = { x: area.x + (area.w - sw * s) / 2, y: area.y + (area.h - sh * s) / 2, w: sw * s, h: sh * s };
    const ix0 = Math.max(D.x, scr.x), iy0 = Math.max(D.y, scr.y);
    const ix1 = Math.min(D.x + D.w, scr.x + scr.w), iy1 = Math.min(D.y + D.h, scr.y + scr.h);
    if (ix1 <= ix0 || iy1 <= iy0) return true;
    const kx = cw / scr.w, ky = ch / scr.h;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    try {
      ctx.drawImage(m.src, (ix0 - D.x) / s, (iy0 - D.y) / s, (ix1 - ix0) / s, (iy1 - iy0) / s,
        (ix0 - scr.x) * kx, (iy0 - scr.y) * ky, (ix1 - ix0) * kx, (iy1 - iy0) * ky);
    } catch (e) { /* frame not decodable yet */ }
    ctx.globalAlpha = 1;
    return true;
  }

  function paintEmpty(ctx, cw, ch, text) {
    ctx.fillStyle = '#090c12'; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = 'rgba(217,180,106,.12)'; ctx.lineWidth = 2;
    for (let x = -ch; x < cw; x += 26) { ctx.beginPath(); ctx.moveTo(x, ch); ctx.lineTo(x + ch, 0); ctx.stroke(); }
    if (text) {
      ctx.fillStyle = 'rgba(236,229,211,.45)'; ctx.textAlign = 'center'; ctx.direction = 'rtl';
      ctx.font = `500 ${Math.round(Math.min(cw, ch) * 0.1)}px "IBM Plex Sans Arabic", Tahoma, sans-serif`;
      ctx.fillText(text, cw / 2, ch / 2 + Math.min(cw, ch) * 0.035);
    }
  }

  function areaForSpan() {
    return S.g.area === 'wall' ? { x: 0, y: 0, w: S.wall.length, h: S.wall.height } : bbox();
  }
  function glideWindow() {
    const B = bbox();
    const w = S.g.width > 0 ? S.g.width : B.h * 16 / 9;
    const travel = B.w + w;
    const p = (P.clock * S.g.speed) % travel;
    const x = S.dir === 'rtl' ? B.x + B.w - p : B.x - w + p;
    return { x, y: B.y, w, h: B.h };
  }

  function stepTravel(dt, list) {
    if (S.mode !== 'travel' || S.g.style !== 'jump' || !list.length) return;
    const m = Media.get(S.g.media);
    if (T.idx >= list.length) T.idx = 0;
    T.fade = Math.min(1, T.fade + dt / 0.6);
    if (!P.playing) return;
    let dwell = S.g.dwell;
    if (S.g.whole && m && m.kind === 'video' && m.src.duration > 0) dwell = m.src.duration;
    T.tt += dt;
    if (T.tt >= dwell) {
      T.tt = 0; T.prev = T.idx; T.idx = (T.idx + 1) % list.length; T.fade = S.g.fade ? 0 : 1;
      if (m && m.kind === 'video' && (S.g.restart || S.g.whole)) { try { m.src.currentTime = 0; } catch (e) { /* ignore */ } }
    }
  }

  function drawAll(list) {
    const gm = Media.get(S.g.media);
    const span = S.mode === 'span' ? areaForSpan() : null;
    const win = S.mode === 'travel' && S.g.style === 'glide' ? glideWindow() : null;
    list.forEach((sc, i) => {
      const v = views.get(sc.id); if (!v) return;
      const ctx = v.ctx, cw = v.canvas.width, ch = v.canvas.height, r = rectOf(sc);
      const own = Media.get(sc.media);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, cw, ch);
      let live = false;
      if (S.mode === 'independent') {
        if (!drawMedia(ctx, own, r, r, cw, ch, sc.fit)) paintEmpty(ctx, cw, ch, sc.media ? 'المحتوى غير متوفر' : 'بدون محتوى');
      } else if (!gm) {
        paintEmpty(ctx, cw, ch, 'اختر المحتوى المشترك');
      } else if (S.mode === 'mirror') {
        drawMedia(ctx, gm, r, r, cw, ch, sc.fit);
      } else if (S.mode === 'span') {
        drawMedia(ctx, gm, span, r, cw, ch, S.g.spanFit);
      } else if (S.mode === 'travel') {
        if (S.g.others === 'own' && own) drawMedia(ctx, own, r, r, cw, ch, sc.fit, 0.28);
        if (win) {
          drawMedia(ctx, gm, win, r, cw, ch, 'cover');
          live = win.x < r.x + r.w && win.x + win.w > r.x;
        } else {
          if (i === T.idx) { drawMedia(ctx, gm, r, r, cw, ch, sc.fit, T.fade); live = true; }
          else if (i === T.prev && T.fade < 1) drawMedia(ctx, gm, r, r, cw, ch, sc.fit, 1 - T.fade);
        }
      }
      if (v.live !== live) { v.live = live; v.el.classList.toggle('live', live); }
    });
  }

  function drawGhost() {
    gctx.clearRect(0, 0, ghost.width, ghost.height);
    if (!UI.ghost) return;
    const gm = Media.get(S.g.media);
    const wallR = { x: 0, y: 0, w: S.wall.length, h: S.wall.height };
    const k = ghost.width / S.wall.length;
    if (S.mode === 'span' && gm) {
      const A = areaForSpan();
      gctx.save(); gctx.beginPath(); gctx.rect(A.x * k, A.y * k, A.w * k, A.h * k); gctx.clip();
      drawMedia(gctx, gm, A, wallR, ghost.width, ghost.height, S.g.spanFit, 0.22);
      gctx.restore();
      gctx.setLineDash([6, 5]); gctx.strokeStyle = 'rgba(242,211,148,.6)'; gctx.lineWidth = 1.5;
      gctx.strokeRect(A.x * k, A.y * k, A.w * k, A.h * k); gctx.setLineDash([]);
    } else if (S.mode === 'travel' && S.g.style === 'glide' && gm) {
      const w = glideWindow();
      drawMedia(gctx, gm, w, wallR, ghost.width, ghost.height, 'cover', 0.2);
      gctx.setLineDash([6, 5]); gctx.strokeStyle = 'rgba(242,211,148,.75)'; gctx.lineWidth = 1.5;
      gctx.strokeRect(w.x * k, w.y * k, w.w * k, w.h * k); gctx.setLineDash([]);
    }
  }

  function usedMedia() {
    const ids = new Set();
    examples.forEach((ex) => {
      if (UI.view === 'room' && ex !== ACT) return;
      const addOwn = () => ex.screens.forEach((s) => s.media && ids.add(s.media));
      if (ex.mode === 'independent') addOwn();
      else { if (ex.g.media) ids.add(ex.g.media); if (ex.mode === 'travel' && ex.g.others === 'own') addOwn(); }
    });
    return ids;
  }
  function syncVideos(used) {
    Media.list().forEach((m) => {
      if (m.kind !== 'video') return;
      const v = m.src, want = P.playing && used.has(m.id);
      v.muted = !P.sound;
      if (want && v.paused) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
      else if (!want && !v.paused) v.pause();
    });
  }

  let last = performance.now(), vidT = 0, statusT = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (P.playing) P.clock += dt;
    const used = usedMedia();
    used.forEach((id) => { const m = Media.get(id); if (m && m.tick) m.tick(P.clock); });
    examples.forEach((ex) => {
      if (UI.view === 'room' && ex !== ACT) return;
      use(ex);
      const list = ordered();
      stepTravel(dt, list);
      drawAll(list);
      if (UI.view === 'plan') drawGhost();
    });
    use(ACT);
    if (UI.view === 'room') Room3D.render();
    vidT -= dt; if (vidT <= 0) { syncVideos(used); vidT = 0.35; }
    statusT -= dt; if (statusT <= 0) { renderStatus(); statusT = 0.25; }
    requestAnimationFrame(frame);
  }


  /* =====================================================================
     shared storage on Vercel (Upstash Redis for the plan, Vercel Blob for files).
     When the API isn't there (opened as a file, GitHub Pages, the hosted preview)
     nothing changes: everything stays in this browser.
     ===================================================================== */
  const Cloud = { on: false, rev: 0, dirty: false, busy: false, applying: false };
  function cloudStatus(state, text) {
    const el = $('#cloudChip'); if (!el) return;
    el.hidden = false; el.dataset.state = state; el.textContent = text;
  }
  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ cache: 'no-store', credentials: 'same-origin' }, opts));
    if (r.status === 401) { location.reload(); throw Object.assign(new Error('auth'), { status: 401 }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || String(r.status)), { status: r.status });
    return j;
  }
  const jsonBody = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  // shared files load through /media/<store>/<path> on this site (a rewrite to Vercel Blob) so canvases and 3D textures can read them
  function mediaSrc(url) {
    const m = /^https:\/\/([a-z0-9]+)\.public\.blob\.vercel-storage\.com\/(.+)$/i.exec(url || '');
    return m ? `/media/${m[1]}/${m[2]}` : url;
  }

  async function cloudInit() {
    if (location.protocol === 'file:' || window.__NO_DOWNLOADS__ || /\.github\.io$/.test(location.hostname)) return;
    let st;
    try { st = await api('/api/state'); }
    catch (e) {
      if (e.status === 503) cloudStatus('off', 'قاعدة البيانات غير مربوطة بعد · الحفظ على هذا الجهاز فقط');
      return; // no API here (GitHub Pages, local file): stay local, quietly
    }
    Cloud.on = true; Cloud.rev = st.rev || 0;
    $('#dropZone small').textContent = 'الملفات تُرفع وتُحفظ أونلاين، ويشوفها كل الفريق';
    $('#shareHint').textContent = 'كل الأمثلة والملفات محفوظة أونلاين، وأي حدا من الفريق بيفتح الرابط بيشوف آخر نسخة. تقدر كمان تنزّل نسخة احتياطية.';
    if (st.data && Array.isArray(st.data.examples) && st.data.examples.length) applyRemote(st.data);
    else { Cloud.dirty = true; await cloudPush(); } // first visit: seed the empty team storage with this browser's examples
    cloudStatus('ok', 'محفوظ أونلاين للفريق');
    await cloudMedia();
    migrateLocalMedia();
    setInterval(cloudPoll, 6000);
    setInterval(cloudMedia, 20000);
  }

  function applyRemote(data) {
    const list = data.examples.map((x) => normalizeExample(x, null, true)).filter(Boolean);
    if (!list.length) return;
    const keep = ACT && ACT.id;
    Cloud.applying = true;
    examples = list;
    ACT = examples.find((x) => x.id === keep) || examples[0];
    use(ACT);
    if (selected && !get(selected)) selected = null;
    hist.stack = hist.stack.slice(0, hist.i + 1); hist.stack.push(snap()); hist.i = hist.stack.length - 1;
    refresh(); renderDisplay();
    Cloud.applying = false;
  }

  let pushT = 0;
  function cloudSchedule() {
    if (!Cloud.on || Cloud.applying) return;
    Cloud.dirty = true;
    cloudStatus('saving', 'جارٍ الحفظ…');
    clearTimeout(pushT); pushT = setTimeout(cloudPush, 900);
  }
  async function cloudPush() {
    if (!Cloud.dirty) return;
    if (Cloud.busy) { clearTimeout(pushT); pushT = setTimeout(cloudPush, 500); return; }
    Cloud.busy = true; Cloud.dirty = false;
    try {
      const r = await api('/api/state', jsonBody('PUT', { data: { v: 2, examples }, baseRev: Cloud.rev }));
      Cloud.rev = r.rev;
      cloudStatus('ok', 'محفوظ أونلاين للفريق');
    } catch (e) {
      Cloud.dirty = true;
      cloudStatus('err', e.status === 413 ? 'المخطط أكبر من المسموح للحفظ أونلاين' : 'تعذّر الحفظ أونلاين · رح نحاول مرة ثانية');
      clearTimeout(pushT); pushT = setTimeout(cloudPush, 5000);
    } finally { Cloud.busy = false; }
  }
  // pick up teammates' changes while this person isn't in the middle of editing
  async function cloudPoll() {
    if (!Cloud.on || Cloud.dirty || Cloud.busy || drag || document.hidden) return;
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    try {
      const st = await api('/api/state?since=' + Cloud.rev);
      if (st.unchanged || st.rev === Cloud.rev || Cloud.dirty || Cloud.busy) return;
      Cloud.rev = st.rev;
      if (st.data) { applyRemote(st.data); toast('وصلت تعديلات جديدة من الفريق'); }
    } catch (e) { /* offline for a moment */ }
  }

  async function cloudMedia() {
    if (!Cloud.on) return;
    try {
      const { items } = await api('/api/media');
      for (const rec of items) if (!Media.get(rec.id)) await Media.addRemote(rec, rec.url ? mediaSrc(rec.url) : null);
      const ids = new Set(items.map((x) => x.id));
      Media.list().forEach((m) => { if (m.remote && !ids.has(m.id)) Media.remove(m.id); });
    } catch (e) { /* try again on the next round */ }
  }

  let blobLib = null;
  function loadBlobClient() {
    if (window.VercelBlobClient) return Promise.resolve(window.VercelBlobClient);
    return blobLib || (blobLib = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = 'js/vendor/blob-client.js';
      sc.onload = () => res(window.VercelBlobClient);
      sc.onerror = () => { blobLib = null; rej(new Error('blob-client')); };
      document.head.appendChild(sc);
    }));
  }
  async function cloudUpload(file, id, name, kind) {
    const { upload } = await loadBlobClient();
    const ext = (/\.[a-z0-9]{2,5}$/i.exec(name || '') || [''])[0].toLowerCase();
    const blob = await upload(`knpc/${id}${ext}`, file, {
      access: 'public', handleUploadUrl: '/api/upload', contentType: file.type || undefined,
      multipart: file.size > 50 * 1024 * 1024,
      onUploadProgress: (p) => cloudStatus('saving', `جارٍ رفع «${name}» ${Math.round(p.percentage)}%`),
    });
    const { item } = await api('/api/media', jsonBody('POST', { id, kind, name, url: blob.url }));
    cloudStatus('ok', 'محفوظ أونلاين للفريق');
    return item;
  }
  async function shareText(it) {
    await api('/api/media', jsonBody('POST', { id: it.id, kind: 'text', name: it.name, spec: it.spec }));
    it.remote = true; Media.forgetLocal(it.id);
  }
  // files added before the team storage existed: copy them up once, in the background
  async function migrateLocalMedia() {
    for (const m of Media.list().filter((x) => x.user && !x.remote)) {
      try {
        if (m.kind === 'text') await shareText(m);
        else if (m.file) { await cloudUpload(m.file, m.id, m.name, m.kind); m.remote = true; Media.forgetLocal(m.id); }
      } catch (e) { cloudStatus('ok', 'محفوظ أونلاين للفريق'); /* stays local; next visit tries again */ }
    }
  }

  /* =====================================================================
     UI: top bar, status
     ===================================================================== */
  const MODES = [
    { key: 'independent', name: 'كل شاشة لحالها', desc: 'لكل شاشة صورتها أو فيديوها الخاص',
      icon: '<rect x="2" y="9" width="14" height="9"/><rect x="20" y="5" width="8" height="15"/><rect x="32" y="9" width="14" height="9"/><rect x="50" y="11" width="2" height="2" opacity=".3"/>' },
    { key: 'span', name: 'ممتد على كل الشاشات', desc: 'فيديو أو صورة واحدة تتوزع على الجدار كأنه شاشة عملاقة',
      icon: '<rect x="2" y="7" width="50" height="16" opacity=".25"/><rect x="2" y="9" width="14" height="9"/><rect x="20" y="5" width="8" height="15"/><rect x="32" y="9" width="14" height="9"/>' },
    { key: 'mirror', name: 'نفس المحتوى على الكل', desc: 'المحتوى نفسه يتكرر كاملاً على كل شاشة',
      icon: '<rect x="2" y="9" width="14" height="9"/><rect x="20" y="9" width="14" height="9"/><rect x="38" y="9" width="14" height="9"/>' },
    { key: 'travel', name: 'ينتقل بين الشاشات', desc: 'محتوى واحد يتحرك تلقائياً على الشاشات باتجاه القراءة',
      icon: '<rect x="2" y="9" width="14" height="9" opacity=".3"/><rect x="20" y="9" width="14" height="9"/><rect x="38" y="9" width="14" height="9" opacity=".3"/><path d="M50 26H4l4-3" stroke="currentColor" fill="none" stroke-width="1.5"/>' },
  ];

  function renderStatus() {
    const m = MODES.find((x) => x.key === S.mode);
    $('#modeName').textContent = m ? m.name : '';
    $('#modePill').classList.toggle('playing', P.playing);
    let t = '';
    const gm = Media.get(S.g.media);
    if (S.mode === 'independent') t = 'كل شاشة تعرض المحتوى المسند لها. اسحب عنصراً من المكتبة إلى أي شاشة لتغييره.';
    else if (S.mode === 'span') t = `«${gm ? gm.name : '—'}» ممتد على ${S.g.area === 'wall' ? 'الجدار كاملاً' : 'حدود الشاشات'}. الفراغات بين الشاشات تُخفي أجزاءً من الصورة.`;
    else if (S.mode === 'mirror') t = `«${gm ? gm.name : '—'}» يتكرر على كل الشاشات.`;
    else if (S.g.style === 'glide') t = `«${gm ? gm.name : '—'}» ينساب عبر الجدار ${S.dir === 'rtl' ? 'من اليمين لليسار' : 'من اليسار لليمين'} بسرعة ${S.g.speed} سم/ث.`;
    else t = `«${gm ? gm.name : '—'}» الآن على الشاشة ${T.idx + 1} من ${S.screens.length}.`;
    const el = $('#modeText'); if (el.textContent !== t) el.textContent = t;
  }

  function renderTransport() {
    $('#btnPlay').innerHTML = (P.playing ? ICON.pause : ICON.play) + `<span>${P.playing ? 'إيقاف مؤقت' : 'تشغيل'}</span>`;
    $('#btnSound').innerHTML = P.sound ? ICON.soundOn : ICON.soundOff;
    $('#btnSound').title = P.sound ? 'كتم الصوت' : 'تشغيل الصوت';
    $('#btnSound').classList.toggle('on', P.sound);
    $('#btnUndo').disabled = hist.i <= 0;
    $('#btnRedo').disabled = hist.i >= hist.stack.length - 1;
  }

  function renderCounts() {
    $('#countLine').textContent = `${S.name} · ${countText(S)} · جدار ${S.wall.length / 100}×${S.wall.height / 100} م`;
    $$('[data-exname]').forEach((el) => { el.textContent = S.name; });
    const ci = $('#countInput'); if (document.activeElement !== ci) ci.value = S.screens.length;
  }

  $('#btnPlay').addEventListener('click', togglePlay);
  function togglePlay() { P.playing = !P.playing; syncVideos(usedMedia()); renderTransport(); }
  $('#btnRestart').innerHTML = ICON.restart;
  $('#btnRestart').addEventListener('click', () => {
    P.clock = 0;
    RT.forEach((r) => Object.assign(r.T, { idx: 0, prev: -1, tt: 0, fade: 1 }));
    Media.list().forEach((m) => { if (m.kind === 'video') try { m.src.currentTime = 0; } catch (e) { /* ignore */ } });
  });
  $('#btnSound').addEventListener('click', () => {
    P.sound = !P.sound;
    Media.list().forEach((m) => { if (m.kind === 'video') m.src.muted = !P.sound; });
    renderTransport();
  });
  $('#btnUndo').innerHTML = ICON.undo; $('#btnRedo').innerHTML = ICON.redo;
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnDock').addEventListener('click', () => {
    const d = $('#dock'); d.classList.toggle('collapsed');
    $('#btnDock').textContent = d.classList.contains('collapsed') ? 'إظهار اللوحات' : 'إخفاء اللوحات';
    requestAnimationFrame(() => { syncAll(); Room3D.resize(); });
  });

  $$('#viewSeg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  function setView(v) {
    UI.view = v;
    $$('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('#plan').hidden = v !== 'plan';
    $('#room').hidden = v !== 'room';
    $('#zoomBox').hidden = v !== 'plan';
    if (v === 'room') { renderRoomExamples(); Room3D.markDirty(); requestAnimationFrame(() => Room3D.resize()); }
    else requestAnimationFrame(() => { syncAll(); const r = RT.get(ACT.id); if (r) r.card.scrollIntoView({ block: 'nearest' }); });
  }
  function renderRoomExamples() {
    $('#roomEx').innerHTML = `<button type="button" class="btn sm" data-room-back>رجوع للأمثلة</button>`
      + (examples.length > 1 ? `<div class="seg sm">${examples.map((x) => `<button type="button" data-room-ex="${x.id}"${x === ACT ? ' class="on"' : ''}>${esc(x.name)}</button>`).join('')}</div>` : '');
  }
  $('#roomEx').addEventListener('click', (e) => {
    if (e.target.closest('[data-room-back]')) { setView('plan'); return; }
    const b = e.target.closest('[data-room-ex]');
    if (b) { const ex = examples.find((x) => x.id === b.dataset.roomEx); if (ex) { activate(ex); renderRoomExamples(); } }
  });
  $$('[data-cam]').forEach((b) => b.addEventListener('click', () => Room3D.preset(b.dataset.cam)));

  $('#zoom').addEventListener('input', (e) => { UI.zoom = +e.target.value / 100; syncAll(); });
  $('#zoomFit').addEventListener('click', () => { UI.zoom = 1; $('#zoom').value = 100; syncAll(); });

  // presentation
  const stage = $('#stage');
  $('#btnPresent').addEventListener('click', async () => {
    stage.classList.add('presenting'); $('#btnExitPresent').hidden = false;
    try { if (stage.requestFullscreen) await stage.requestFullscreen(); } catch (e) { /* stays as an in-page overlay */ }
    requestAnimationFrame(() => { syncAll(); Room3D.resize(); });
  });
  function exitPresent() {
    stage.classList.remove('presenting'); $('#btnExitPresent').hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    requestAnimationFrame(() => { syncAll(); Room3D.resize(); });
  }
  $('#btnExitPresent').addEventListener('click', exitPresent);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && stage.classList.contains('presenting')) exitPresent(); });

  /* =====================================================================
     UI: layout card
     ===================================================================== */
  const ARRS = [
    { key: 'knpc', name: 'المخطط الحالي (13)', icon: [[0, 8, 9, 6], [11, 5, 5, 11], [18, 4, 9, 6], [29, 12, 9, 6], [40, 8, 9, 6], [51, 5, 5, 11], [58, 4, 9, 6]] },
    { key: 'row', name: 'صف واحد', icon: [[0, 9, 9, 6], [12, 9, 9, 6], [24, 9, 9, 6], [36, 9, 9, 6], [48, 9, 9, 6], [60, 9, 9, 6]] },
    { key: 'two', name: 'صفّان', icon: [[4, 3, 10, 6], [17, 3, 10, 6], [30, 3, 10, 6], [43, 3, 10, 6], [56, 3, 10, 6], [4, 14, 10, 6], [17, 14, 10, 6], [30, 14, 10, 6], [43, 14, 10, 6], [56, 14, 10, 6]] },
    { key: 'stack2', name: 'فوق بعض (2)', icon: [[2, 4, 10, 6], [2, 11, 10, 6], [24, 4, 10, 6], [24, 11, 10, 6], [46, 4, 10, 6], [46, 11, 10, 6]] },
    { key: 'stack3', name: 'فوق بعض (3)', icon: [[8, 1, 10, 6], [8, 8, 10, 6], [8, 15, 10, 6], [40, 1, 10, 6], [40, 8, 10, 6], [40, 15, 10, 6]] },
    { key: 'zigzag', name: 'متعرّج', icon: [[0, 3, 9, 6], [12, 13, 9, 6], [24, 3, 9, 6], [36, 13, 9, 6], [48, 3, 9, 6], [60, 13, 9, 6]] },
    { key: 'grid', name: 'جدار فيديو متصل', icon: [[14, 2, 11, 6.5], [25.4, 2, 11, 6.5], [36.8, 2, 11, 6.5], [14, 8.9, 11, 6.5], [25.4, 8.9, 11, 6.5], [36.8, 8.9, 11, 6.5], [14, 15.8, 11, 6.5], [25.4, 15.8, 11, 6.5], [36.8, 15.8, 11, 6.5]] },
    { key: 'center', name: 'متجمّعة في الوسط', icon: [[18, 9, 9, 6], [29, 7, 5, 10], [36, 9, 9, 6], [47, 7, 5, 10]] },
  ];
  $('#arrGrid').innerHTML = ARRS.map((a) => `<button type="button" class="arr" data-arr="${a.key}"><svg viewBox="0 0 70 24">${a.icon.map(([x, y, w, h]) => `<rect x="${x + 1}" y="${y}" width="${w}" height="${h}" rx=".6"/>`).join('')}</svg>${a.name}</button>`).join('');
  $$('[data-arr]').forEach((b) => b.addEventListener('click', () => arrange(b.dataset.arr)));
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addScreen(b.dataset.add)));

  function dimsFor(o, base) {
    const b = base || 122;
    if (o === 'v') return [Math.round(b * 9 / 16), b];
    if (o === 's') return [Math.round(b * 0.62), Math.round(b * 0.62)];
    return [b, Math.round(b * 9 / 16)];
  }

  // place items (in reading order) as columns; each column is an array stacked top→bottom
  function placeColumns(cols, opts) {
    const L = S.wall.length, vg = opts.vgap, cy = opts.centerY || CENTER_Y;
    const colW = cols.map((c) => Math.max(...c.map((s) => s.w)));
    const total = colW.reduce((a, b) => a + b, 0);
    let gap = opts.gap;
    if (gap == null) gap = cols.length > 1 ? Math.max(8, Math.min(opts.maxGap || 9999, (L - 160 - total) / (cols.length - 1))) : 0;
    const used = total + gap * (cols.length - 1);
    let cursor = S.dir === 'rtl' ? (L + used) / 2 : (L - used) / 2;
    cols.forEach((col, ci) => {
      const cw = colW[ci];
      const left = S.dir === 'rtl' ? cursor - cw : cursor;
      const stackH = col.reduce((a, s) => a + s.h, 0) + vg * (col.length - 1);
      const colCy = typeof cy === 'function' ? cy(ci) : cy;
      let top = colCy + stackH / 2; // elevation of the column's top edge
      col.forEach((s) => { s.x = left + (cw - s.w) / 2; s.y = top - s.h; top -= s.h + vg; });
      cursor = S.dir === 'rtl' ? cursor - cw - gap : cursor + cw + gap;
    });
  }
  const chunk = (arr, n) => arr.reduce((out, s, i) => { if (i % n === 0) out.push([]); out[out.length - 1].push(s); return out; }, []);

  function arrange(kind) {
    const list = ordered();
    const n = list.length;
    switch (kind) {
      case 'knpc': S.screens = knpcPreset(S.wall.length); selected = null; break;
      case 'row': placeColumns(list.map((s) => [s]), { vgap: 0 }); break;
      case 'two': placeColumns(chunk(list, 2), { vgap: 28, gap: 36 }); break;
      case 'stack2': placeColumns(chunk(list, 2), { vgap: 5 }); break;
      case 'stack3': placeColumns(chunk(list, 3), { vgap: 5 }); break;
      case 'zigzag': placeColumns(list.map((s) => [s]), { vgap: 0, centerY: (i) => (i % 2 ? CENTER_Y - 40 : CENTER_Y + 30) }); break;
      case 'center': placeColumns(list.map((s) => [s]), { vgap: 0, gap: 22 }); break;
      case 'grid': {
        // a seamless video wall needs identical panels: use the most common orientation for all
        const hs = list.filter((s) => orient(s).key === 'h'), vs = list.filter((s) => orient(s).key === 'v');
        const ref = (hs.length >= vs.length ? hs[0] : vs[0]) || list[0];
        list.forEach((s) => { s.w = ref.w; s.h = ref.h; });
        const cols = Math.ceil(Math.sqrt(n * 2.2));
        const rows = Math.ceil(n / cols);
        const cw = Math.max(...list.map((s) => s.w)), chh = Math.max(...list.map((s) => s.h));
        const bez = 2, W = cols * cw + (cols - 1) * bez, Hh = rows * chh + (rows - 1) * bez;
        const x0 = (S.wall.length - W) / 2, top = Math.min(S.wall.height - 20, CENTER_Y + Hh / 2);
        list.forEach((s, i) => {
          const r = Math.floor(i / cols), c = i % cols;
          const cx = S.dir === 'rtl' ? x0 + W - (c + 1) * cw - c * bez : x0 + c * (cw + bez);
          s.x = cx + (cw - s.w) / 2; s.y = top - r * (chh + bez) - chh + (chh - s.h) / 2;
        });
        break;
      }
      case 'distribute': {
        const ys = new Map(list.map((s) => [s.id, s.y]));
        placeColumns(list.map((s) => [s]), { vgap: 0 });
        list.forEach((s) => { s.y = ys.get(s.id); });
        break;
      }
      case 'align': list.forEach((s) => { s.y = CENTER_Y - s.h / 2; }); break;
      case 'allh': case 'allv':
        list.forEach((s) => {
          const big = Math.max(s.w, s.h), small = Math.min(s.w, s.h);
          const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
          s.w = kind === 'allh' ? big : small; s.h = kind === 'allh' ? small : big;
          s.x = cx - s.w / 2; s.y = cy - s.h / 2;
        });
        break;
      default: return;
    }
    S.screens.forEach(clampScreen);
    commit();
    const a = ARRS.find((x) => x.key === kind);
    if (a) toast('تم الترتيب: ' + a.name);
  }

  function addScreen(o, silent) {
    const [w, h] = dimsFor(o);
    const B = S.screens.length ? bbox() : null;
    let x;
    if (!B) x = (S.wall.length - w) / 2;
    else x = S.dir === 'rtl' ? B.x - 40 - w : B.x + B.w + 40;
    if (x < 0 || x + w > S.wall.length) x = (S.wall.length - w) / 2;
    const sc = { id: uid(), x, y: CENTER_Y - h / 2, w, h, label: '', media: null, fit: 'cover' };
    clampScreen(sc);
    S.screens.push(sc);
    if (!silent) { selected = sc.id; commit(); }
    return sc;
  }
  function addScreenAt(o, cx, cy) {
    const [w, h] = dimsFor(o);
    const sc = { id: uid(), x: cx - w / 2, y: cy - h / 2, w, h, label: '', media: null, fit: 'cover' };
    clampScreen(sc);
    S.screens.push(sc); selected = sc.id; commit();
  }
  function rotateScreen(sc) {
    const cx = sc.x + sc.w / 2, cy = sc.y + sc.h / 2;
    [sc.w, sc.h] = [sc.h, sc.w];
    sc.x = cx - sc.w / 2; sc.y = cy - sc.h / 2;
    clampScreen(sc); commit();
  }
  function duplicateScreen(sc) {
    const c = Object.assign({}, sc, { id: uid() });
    c.x = S.dir === 'rtl' ? sc.x - sc.w - 30 : sc.x + sc.w + 30; clampScreen(c);
    S.screens.push(c); selected = c.id; commit();
  }
  function deleteScreen(sc) {
    S.screens = S.screens.filter((s) => s.id !== sc.id);
    if (selected === sc.id) selected = null;
    commit();
  }

  $('#countInput').addEventListener('change', (e) => {
    const n = clamp(parseInt(e.target.value, 10) || 1, 1, 40);
    while (S.screens.length < n) { const last = ordered().pop(); addScreen(last ? orient(last).key : 'h', true); }
    while (S.screens.length > n) { const last = ordered().pop(); S.screens = S.screens.filter((s) => s !== last); }
    if (selected && !get(selected)) selected = null;
    commit();
  });

  $('#snapSel').addEventListener('change', (e) => { UI.snap = +e.target.value; renderSettings(); save(); });
  function wallInput(id, key, mult) {
    $(id).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (!(v > 0)) { renderSettings(); return; }
      const old = S.wall[key];
      S.wall[key] = Math.round(v * mult);
      if (key === 'length') { const k = S.wall.length / old; S.screens.forEach((s) => { s.x = (s.x + s.w / 2) * k - s.w / 2; }); }
      S.screens.forEach(clampScreen);
      commit();
    });
  }
  wallInput('#wallLen', 'length', 100);
  wallInput('#wallH', 'height', 100);
  $('#wallArc').addEventListener('input', (e) => { S.wall.arc = +e.target.value; $('#wallArcOut').textContent = arcText(); Room3D.markDirty(); });
  $('#wallArc').addEventListener('change', commit);
  function arcText() {
    const R = S.wall.length / (S.wall.arc * Math.PI / 180) / 100;
    return `${S.wall.arc}° · قطر الغرفة ${(R * 2).toFixed(1)} م`;
  }
  $$('#dirSeg button').forEach((b) => b.addEventListener('click', () => { S.dir = b.dataset.dir; T.idx = 0; commit(); }));
  $('#optLabels').addEventListener('change', (e) => { UI.labels = e.target.checked; refresh(); });
  $('#optEye').addEventListener('change', (e) => { UI.eye = e.target.checked; refresh(); });

  function renderSettings() {
    $('#snapSel').value = String(UI.snap);
    const setv = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
    setv('#wallLen', S.wall.length / 100);
    setv('#wallH', S.wall.height / 100);
    setv('#wallArc', S.wall.arc);
    $('#wallArcOut').textContent = arcText();
    $$('#dirSeg button').forEach((b) => b.classList.toggle('on', b.dataset.dir === S.dir));
    $('#optLabels').checked = UI.labels;
    $('#optEye').checked = UI.eye;
    $('#optGhost').checked = UI.ghost;
  }

  /* ---------- examples ---------- */
  function activate(ex) {
    if (!ex || ex === ACT) return;
    ACT = ex; selected = null;
    use(ex);
    RT.forEach((r, id) => r.card.classList.toggle('active', id === ex.id));
    renumber();
    renderInspector(); renderCounts(); renderSettings(); renderDisplay(); renderLibrary(); renderStatus();
    Room3D.markDirty();
    save();
  }
  function cloneExample(ex, name) {
    const c = JSON.parse(JSON.stringify(ex));
    c.id = 'x' + uid(); c.name = name;
    c.screens.forEach((s) => { s.id = uid(); });
    return c;
  }
  function insertExample(ex, after) {
    const i = after ? examples.indexOf(after) + 1 : examples.length;
    examples.splice(i, 0, ex);
    ACT = ex; selected = null;
    use(ex);
    commit(); renderDisplay();
    requestAnimationFrame(() => { const r = RT.get(ex.id); if (r) r.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  }
  function nextName() { return `مثال ${examples.length + 1}`; }
  function deleteExample(ex) {
    if (examples.length < 2) { toast('لازم يبقى مثال واحد على الأقل'); return; }
    const i = examples.indexOf(ex);
    examples.splice(i, 1);
    if (ACT === ex) { ACT = examples[Math.max(0, i - 1)]; selected = null; }
    use(ACT);
    commit(); renderDisplay();
    toast(`حُذف «${ex.name}». تقدر ترجعه بزر التراجع`);
  }
  $('#examples').addEventListener('click', (e) => {
    const card = e.target.closest('.ex'); if (!card) return;
    const ex = examples.find((x) => x.id === card.dataset.ex); if (!ex) return;
    if (ex !== ACT) activate(ex);
    const b = e.target.closest('[data-ex-act]'); if (!b) return;
    const act = b.dataset.exAct;
    if (act === 'addh' || act === 'addv') addScreen(act === 'addh' ? 'h' : 'v');
    else if (act === 'dup') insertExample(cloneExample(ex, ex.name + ' (نسخة)'), ex);
    else if (act === 'room') setView('room');
    else if (act === 'del') {
      if (b.dataset.armed) { deleteExample(ex); return; }
      b.dataset.armed = '1'; b.querySelector('span').textContent = 'اضغط مرة ثانية للتأكيد';
      setTimeout(() => { delete b.dataset.armed; const sp = b.querySelector('span'); if (sp) sp.textContent = 'حذف المثال'; }, 3000);
    }
  });
  $('#examples').addEventListener('input', (e) => {
    if (!e.target.classList.contains('ex-name')) return;
    const ex = examples.find((x) => x.id === e.target.closest('.ex').dataset.ex); if (!ex) return;
    ex.name = e.target.value || 'مثال';
    e.target.style.width = Math.min(300, Math.max(100, ex.name.length * 11 + 34)) + 'px';
    renderCounts(); save();
  });
  $('#examples').addEventListener('change', (e) => { if (e.target.classList.contains('ex-name')) commit(); });
  $('#exAdd').addEventListener('click', (e) => {
    const b = e.target.closest('[data-new]'); if (!b) return;
    if (b.dataset.new === 'knpc') insertExample(newExample(nextName(), knpcPreset(2600)));
    else if (b.dataset.new === 'copy') insertExample(cloneExample(ACT, ACT.name + ' (نسخة)'), ACT);
    else insertExample(newExample(nextName(), []));
  });

  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (er) { /* ignore */ }
      ta.remove(); toast(ok ? okMsg : 'تعذّر النسخ. استخدم «تنزيل الملف» بدلاً منه.');
    }
  }
  $('#btnExport').addEventListener('click', () => download('knpc-screens-plan.json', JSON.stringify(persisted(), null, 2), 'application/json'));
  $('#btnCopyJson').addEventListener('click', () => copyText(JSON.stringify(persisted()), 'تم نسخ كل الأمثلة'));
  $('#btnImport').addEventListener('click', () => $('#importInput').click());
  $('#importInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const list = examplesFrom(JSON.parse(await f.text()));
      if (!list.length) { toast('الملف لا يحتوي على مخطط شاشات صالح'); return; }
      examples.push(...list); ACT = list[0]; selected = null; use(ACT);
      commit(); renderDisplay();
      toast(`أُضيف ${list.length === 1 ? 'مثال واحد' : list.length + ' أمثلة'} من الملف`);
    } catch (er) { toast('تعذّرت قراءة الملف. تأكد أنه ملف JSON صادر من هذه الأداة.'); }
  });
  $('#btnReset').addEventListener('click', () => {
    $('#resetText').textContent = Cloud.on
      ? 'ستُحذف كل الأمثلة عند كل الفريق ويبقى المخطط الأصلي فقط. الملفات المرفوعة تبقى في المكتبة.'
      : 'ستُحذف كل الأمثلة ويبقى المخطط الأصلي فقط. المحتوى المرفوع يبقى في المكتبة.';
    $('#resetConfirm').hidden = !$('#resetConfirm').hidden;
  });
  $('#btnResetYes').addEventListener('click', () => {
    examples = [newExample('المخطط الحالي', knpcPreset(2600))]; ACT = examples[0]; selected = null; use(ACT);
    $('#resetConfirm').hidden = true; commit(); renderDisplay(); toast('تمت العودة للمخطط الأصلي');
  });

  /* =====================================================================
     UI: display (playback) card
     ===================================================================== */
  $('#modes').innerHTML = MODES.map((m) => `<label class="mode"><input type="radio" name="mode" value="${m.key}">
    <svg viewBox="0 0 54 30" fill="currentColor" style="color:var(--gold)">${m.icon}</svg><b>${m.name}</b><small>${m.desc}</small></label>`).join('');
  $$('#modes input').forEach((r) => r.addEventListener('change', () => { S.mode = r.value; Object.assign(T, { idx: 0, prev: -1, tt: 0 }); renderDisplay(); renderInspector(); renderHeader(); save(); }));

  function mediaOptions(selectedId, emptyLabel) {
    const groups = { anim: [], video: [], image: [], text: [] };
    Media.list().forEach((m) => (groups[m.kind] || groups.image).push(m));
    const names = { anim: 'متحرك (تجريبي)', video: 'فيديوهات', image: 'صور', text: 'بطاقات نص' };
    let html = `<option value="">${emptyLabel || 'بدون محتوى'}</option>`;
    Object.keys(groups).forEach((k) => {
      if (!groups[k].length) return;
      html += `<optgroup label="${names[k]}">` + groups[k].map((m) => `<option value="${m.id}"${m.id === selectedId ? ' selected' : ''}>${esc(m.name)}</option>`).join('') + '</optgroup>';
    });
    return html;
  }

  function renderDisplay() {
    $$('#modes input').forEach((r) => { r.checked = r.value === S.mode; });
    $('#gBox').hidden = S.mode === 'independent';
    $('#gMedia').innerHTML = mediaOptions(S.g.media, 'اختر المحتوى…');
    $$('#gBox [data-for]').forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(S.mode); });
    $$('#travelSeg button').forEach((b) => b.classList.toggle('on', b.dataset.style === S.g.style));
    $$('[data-style-for]').forEach((el) => { el.hidden = el.dataset.styleFor !== S.g.style; });
    $$('#othersSeg button').forEach((b) => b.classList.toggle('on', b.dataset.o === S.g.others));
    $$('#spanSeg button').forEach((b) => b.classList.toggle('on', b.dataset.a === S.g.area));
    $$('#spanFitSeg button').forEach((b) => b.classList.toggle('on', b.dataset.f === S.g.spanFit));
    $('#gDwell').value = S.g.dwell; $('#gDwellOut').textContent = S.g.dwell + ' ث';
    $('#gSpeed').value = S.g.speed; $('#gSpeedOut').textContent = S.g.speed + ' سم/ث';
    $('#gWidth').value = S.g.width; $('#gWidthOut').textContent = S.g.width > 0 ? S.g.width + ' سم' : 'تلقائي (16:9)';
    $('#gWhole').checked = S.g.whole; $('#gRestart').checked = S.g.restart; $('#gFade').checked = S.g.fade;
    $('#gDwell').disabled = S.g.whole;
    $('#optGhost').checked = UI.ghost;
    renderSpanInfo();
  }
  function renderSpanInfo() {
    const A = areaForSpan();
    if (!S.screens.length) { $('#spanInfo').textContent = ''; return; }
    // pixel density of a 1920-wide horizontal screen, applied to the whole span area
    const ref = S.screens.reduce((a, s) => a + Math.max(s.w, s.h), 0) / S.screens.length;
    const ppcm = 1920 / ref;
    let pw = A.w * ppcm, ph = A.h * ppcm;
    const full = `${fmt(pw)}×${fmt(ph)}`;
    if (pw > 7680) { ph = ph * 7680 / pw; pw = 7680; }
    $('#spanInfo').innerHTML = `المساحة الممتدة <b>${(A.w / 100).toFixed(2)}×${(A.h / 100).toFixed(2)} م</b> (نسبة ${(A.w / A.h).toFixed(2)}:1).<br>
      دقة الإنتاج الكاملة <b>${full}</b> بكسل؛ مقاس عملي للمونتاج <b>${fmt(pw)}×${fmt(ph)}</b>.`;
  }
  $('#gMedia').addEventListener('change', (e) => { S.g.media = e.target.value || null; save(); renderLibrary(); });
  $$('#travelSeg button').forEach((b) => b.addEventListener('click', () => { S.g.style = b.dataset.style; T.idx = 0; renderDisplay(); save(); }));
  $$('#othersSeg button').forEach((b) => b.addEventListener('click', () => { S.g.others = b.dataset.o; renderDisplay(); save(); }));
  $$('#spanSeg button').forEach((b) => b.addEventListener('click', () => { S.g.area = b.dataset.a; renderDisplay(); save(); }));
  $$('#spanFitSeg button').forEach((b) => b.addEventListener('click', () => { S.g.spanFit = b.dataset.f; renderDisplay(); save(); }));
  [['#gDwell', 'dwell'], ['#gSpeed', 'speed'], ['#gWidth', 'width']].forEach(([id, k]) => {
    $(id).addEventListener('input', (e) => { S.g[k] = +e.target.value; renderDisplay(); save(); });
  });
  [['#gWhole', 'whole'], ['#gRestart', 'restart'], ['#gFade', 'fade']].forEach(([id, k]) => {
    $(id).addEventListener('change', (e) => { S.g[k] = e.target.checked; renderDisplay(); save(); });
  });
  $('#optGhost').addEventListener('change', (e) => { UI.ghost = e.target.checked; save(); });

  /* =====================================================================
     UI: library card
     ===================================================================== */
  function renderLibrary() {
    const used = new Set(S.screens.map((s) => s.media).concat(S.mode !== 'independent' ? [S.g.media] : []));
    const list = Media.list();
    $('#libCount').textContent = `${list.length} عنصر`;
    $('#lib').innerHTML = list.map((m) => `<div class="item${used.has(m.id) ? ' used' : ''}" draggable="true" data-mid="${m.id}" tabindex="0" role="button" aria-label="${esc(m.name)}">
      <span class="th" style="background-image:url('${m.thumb}')"></span>
      <span class="kd">${Media.kindLabel(m.kind)}</span>
      <span class="nm" title="${esc(m.name)}">${esc(m.name)}</span>
      ${m.user ? `<button type="button" class="rm" data-rm="${m.id}" aria-label="حذف ${esc(m.name)}">×</button>` : ''}
    </div>`).join('');
  }
  const lib = $('#lib');
  lib.addEventListener('dragstart', (e) => {
    const it = e.target.closest('[data-mid]'); if (!it) return;
    e.dataTransfer.setData('text/x-media-id', it.dataset.mid);
    e.dataTransfer.effectAllowed = 'copy';
  });
  function pickMedia(mid) {
    if (selected && S.mode === 'independent') assign(selected, mid);
    else if (S.mode !== 'independent') { S.g.media = mid; renderDisplay(); renderLibrary(); save(); toast('أصبح «' + Media.get(mid).name + '» المحتوى المشترك'); }
    else if (selected) assign(selected, mid);
    else toast('حدّد شاشة أولاً، أو اسحب العنصر إلى الشاشة مباشرة');
  }
  lib.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const id = rm.dataset.rm;
      const m = Media.get(id);
      if (Cloud.on && m && m.remote) api('/api/media?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => toast('تعذّر الحذف من التخزين المشترك'));
      S.screens.forEach((s) => { if (s.media === id) s.media = null; });
      if (S.g.media === id) S.g.media = null;
      Media.remove(id); commit(); renderDisplay();
      return;
    }
    const it = e.target.closest('[data-mid]'); if (it) pickMedia(it.dataset.mid);
  });
  lib.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const it = e.target.closest('[data-mid]'); if (it) { e.preventDefault(); pickMedia(it.dataset.mid); }
  });

  function assign(sid, mid) {
    const sc = get(sid); if (!sc) return;
    sc.media = mid;
    if (S.mode !== 'independent') toast(`أُسند المحتوى للشاشة ${numbers.get(sid)}. يظهر في وضع «كل شاشة لحالها».`);
    commit();
  }

  async function addFiles(files) {
    const out = [];
    for (const f of files) {
      const kind = Media.kindOf(f.type, f.name);
      let it = null;
      if (Cloud.on && kind) {
        try {
          const rec = await cloudUpload(f, Media.uid(), f.name, kind);
          it = await Media.addRemote(rec, mediaSrc(rec.url));
        } catch (e) {
          toast(`تعذّر رفع «${f.name}» أونلاين، أُضيف على هذا الجهاز فقط`);
          cloudStatus('err', 'تعذّر رفع ملف · محفوظ على هذا الجهاز');
          it = await Media.addFile(f, f.name);
        }
      } else it = await Media.addFile(f, f.name);
      if (it) out.push(it);
    }
    if (!out.length) toast('اختر ملفات صور أو فيديو فقط');
    else toast(`أُضيف ${out.length} ${out.length === 1 ? 'ملف' : 'ملفات'} إلى المكتبة`);
    return out;
  }
  $('#btnUpload').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    const added = await addFiles(files);
    if (added[0] && selected && S.mode === 'independent') assign(selected, added[0].id);
  });
  const dz = $('#dropZone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...(e.dataTransfer.files || [])]); });

  let tOrient = 'h';
  $$('#tOrient button').forEach((b) => b.addEventListener('click', () => { tOrient = b.dataset.o; $$('#tOrient button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $('#tAdd').addEventListener('click', () => {
    const spec = { title: $('#tTitle').value.trim() || 'عنوان', sub: $('#tSub').value.trim(), bg: $('#tBg').value, fg: $('#tFg').value, orient: tOrient };
    const it = Media.addText(spec);
    if (Cloud.on) shareText(it).catch(() => toast('تعذّر حفظ البطاقة أونلاين، محفوظة على هذا الجهاز'));
    if (selected && S.mode === 'independent') assign(selected, it.id);
    toast('أُضيفت بطاقة النص');
  });

  /* =====================================================================
     UI: inspector card
     ===================================================================== */
  function select(id) {
    if (selected === id) return;
    selected = id;
    S.screens.forEach((s) => { const v = views.get(s.id); if (v) v.el.classList.toggle('sel', s.id === id); });
    renderInspector();
    Room3D.markDirty();
  }

  const INCHES = [32, 43, 50, 55, 65, 75, 86, 98];
  function renderInspector() {
    const el = $('#inspector');
    const sc = get(selected);
    if (!sc) {
      const list = ordered();
      el.innerHTML = `<header class="card-h"><h2>الشاشات</h2><span class="chip">${list.length}</span></header>
        <p class="hint">اضغط على أي شاشة في المخطط أو هنا لتعديل مقاسها ومكانها ومحتواها.</p>
        <ul class="slist">${list.map((s) => {
          const m = Media.get(s.media);
          return `<li><button type="button" data-pick="${s.id}"><span class="n">${numbers.get(s.id)}</span>
            <span class="t">${orient(s).label}${s.label ? ' · ' + esc(s.label) : ''}<br><small style="color:var(--muted)">${m ? esc(m.name) : 'بدون محتوى'}</small></span>
            <span class="d">${Math.round(inches(s))}″</span></button></li>`;
        }).join('')}</ul>`;
      return;
    }
    const o = orient(sc), inch = Math.round(inches(sc));
    const nearest = INCHES.reduce((a, b) => (Math.abs(b - inch) < Math.abs(a - inch) ? b : a));
    const isStd = Math.abs(nearest - inches(sc)) < 0.8 && o.key !== 's';
    el.innerHTML = `<header class="card-h"><h2>الشاشة <span class="num">${numbers.get(sc.id)}</span></h2>
        <button type="button" class="btn sm" id="iClose">كل الشاشات</button></header>
      <div class="f"><label for="iLabel">الوصف</label><input type="text" id="iLabel" value="${esc(sc.label)}" placeholder="مثلاً: متحدث، خريطة، صورة أرشيفية"></div>
      <div class="f"><span>الاتجاه</span><div class="seg sm full" id="iOrient">
        <button type="button" data-o="h"${o.key === 'h' ? ' class="on"' : ''}>أفقية</button><button type="button" data-o="v"${o.key === 'v' ? ' class="on"' : ''}>عمودية</button><button type="button" data-o="s"${o.key === 's' ? ' class="on"' : ''}>مربعة</button></div></div>
      <div class="f"><label for="iInch">المقاس القياسي (قطر الشاشة)</label><select id="iInch">
        <option value="">مقاس مخصص (${inch}″)</option>${INCHES.map((i) => `<option value="${i}"${isStd && i === nearest ? ' selected' : ''}>${i} بوصة</option>`).join('')}</select></div>
      <div class="f2"><label>العرض (سم)<input type="number" id="iW" min="10" step="1"></label><label>الارتفاع (سم)<input type="number" id="iH" min="10" step="1"></label></div>
      <div class="f2"><label>البعد عن يسار الجدار (سم)<input type="number" id="iX" step="1"></label><label>ارتفاع الحافة السفلية عن الأرض (سم)<input type="number" id="iY" step="1"></label></div>
      <p class="meta" id="iMeta"></p>
      <div class="f"><label for="iMedia">المحتوى</label><select id="iMedia">${mediaOptions(sc.media)}</select></div>
      <div class="f"><span>ملاءمة المحتوى</span><div class="seg sm full" id="iFit">
        <button type="button" data-f="cover"${sc.fit !== 'contain' ? ' class="on"' : ''}>ملء الشاشة (قص الأطراف)</button><button type="button" data-f="contain"${sc.fit === 'contain' ? ' class="on"' : ''}>إظهار كاملاً</button></div></div>
      ${S.mode !== 'independent' && S.mode !== 'mirror' ? '<p class="note">المحتوى الخاص بالشاشة يظهر في وضع «كل شاشة لحالها»، أو خافتاً خلف المحتوى المتنقل.</p>' : ''}
      <div class="row-btns"><button type="button" class="btn sm" id="iDup">تكرار الشاشة</button><button type="button" class="btn sm danger" id="iDel">حذف الشاشة</button></div>`;
    updateInspectorValues();
    $('#iClose').addEventListener('click', () => select(null));
    $('#iLabel').addEventListener('input', (e) => { sc.label = e.target.value; layoutScreen(sc); save(); });
    $('#iLabel').addEventListener('change', commit);
    $$('#iOrient button').forEach((b) => b.addEventListener('click', () => {
      const cx = sc.x + sc.w / 2, cy = sc.y + sc.h / 2, big = Math.max(sc.w, sc.h), small = Math.min(sc.w, sc.h);
      if (b.dataset.o === 'h') { sc.w = big; sc.h = small === big ? Math.round(big * 9 / 16) : small; }
      else if (b.dataset.o === 'v') { sc.h = big; sc.w = small === big ? Math.round(big * 9 / 16) : small; }
      else { sc.w = sc.h = Math.round(Math.sqrt(big * small)); }
      sc.x = cx - sc.w / 2; sc.y = cy - sc.h / 2; clampScreen(sc); commit();
    }));
    $('#iInch').addEventListener('change', (e) => {
      const d = +e.target.value; if (!d) return;
      const diag = d * 2.54, ok = orient(sc).key;
      let w, h;
      if (ok === 's') { w = h = diag / Math.SQRT2; }
      else { const long = diag * 16 / Math.hypot(16, 9), short = long * 9 / 16; w = ok === 'h' ? long : short; h = ok === 'h' ? short : long; }
      const cx = sc.x + sc.w / 2, cy = sc.y + sc.h / 2;
      sc.w = w; sc.h = h; sc.x = cx - w / 2; sc.y = cy - h / 2; clampScreen(sc); commit();
    });
    [['#iW', 'w'], ['#iH', 'h'], ['#iX', 'x'], ['#iY', 'y']].forEach(([id, k]) => {
      $(id).addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) { sc[k] = v; clampScreen(sc); } commit(); });
    });
    $('#iMedia').addEventListener('change', (e) => assign(sc.id, e.target.value || null));
    $$('#iFit button').forEach((b) => b.addEventListener('click', () => { sc.fit = b.dataset.f; commit(); }));
    $('#iDup').addEventListener('click', () => duplicateScreen(sc));
    $('#iDel').addEventListener('click', () => deleteScreen(sc));
  }
  $('#inspector').addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (b) select(b.dataset.pick); });

  function updateInspectorValues() {
    const sc = get(selected); if (!sc || !$('#iW')) return;
    const setv = (id, v) => { const el = $(id); if (el && document.activeElement !== el) el.value = Math.round(v); };
    setv('#iW', sc.w); setv('#iH', sc.h); setv('#iX', sc.x); setv('#iY', sc.y);
    const [rw, rh] = resolution(sc);
    $('#iMeta').innerHTML = `مركز الشاشة على ارتفاع <b>${Math.round(sc.y + sc.h / 2)}</b> سم · القطر <b>${Math.round(inches(sc))}″</b><br>دقة المحتوى المقترحة <b>${rw}×${rh}</b> بكسل`;
  }

  /* =====================================================================
     production sheet
     ===================================================================== */
  function sheetRows() {
    return ordered().map((s) => {
      const [rw, rh] = resolution(s), m = Media.get(s.media);
      return { n: numbers.get(s.id), o: orient(s).label, size: `${Math.round(s.w)}×${Math.round(s.h)}`, inch: Math.round(inches(s)),
        res: `${rw}×${rh}`, center: Math.round(s.y + s.h / 2), from: Math.round(s.x), label: s.label || '', media: m ? m.name : '' };
    });
  }
  function renderSheet() {
    const rows = sheetRows();
    const A = bbox();
    const modeName = MODES.find((m) => m.key === S.mode).name;
    $('#sheetBody').innerHTML = `
      <p class="meta">الجدار <b>${S.wall.length / 100}×${S.wall.height / 100} م</b> · ${rows.length} شاشة · طريقة العرض الحالية: <b style="font-family:var(--body)">${modeName}</b> · الترقيم ${S.dir === 'rtl' ? 'من اليمين لليسار' : 'من اليسار لليمين'}</p>
      <div class="tbl-wrap"><table>
        <thead><tr><th>#</th><th>الاتجاه</th><th>المقاس (سم)</th><th>القطر</th><th>دقة المحتوى</th><th>ارتفاع المركز</th><th>من يسار الجدار</th><th>الوصف</th><th>المحتوى الحالي</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td><span class="n">${r.n}</span></td><td>${r.o}</td><td class="mono">${r.size}</td><td class="mono">${r.inch}″</td><td class="mono">${r.res}</td><td class="mono">${r.center} سم</td><td class="mono">${r.from} سم</td><td>${esc(r.label)}</td><td>${esc(r.media) || '<span style="color:var(--muted)">—</span>'}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="meta" style="margin-top:14px">للمحتوى الممتد على كل الشاشات: المساحة المحيطة بالشاشات <b>${(A.w / 100).toFixed(2)}×${(A.h / 100).toFixed(2)} م</b>. ${$('#spanInfo').innerHTML.split('<br>')[1] || ''}</p>`;
  }
  function sheetTSV(sep) {
    const head = ['رقم', 'الاتجاه', 'المقاس (سم)', 'القطر (بوصة)', 'دقة المحتوى', 'ارتفاع المركز (سم)', 'من يسار الجدار (سم)', 'الوصف', 'المحتوى'];
    const q = (v) => (sep === ',' ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return [head].concat(sheetRows().map((r) => [r.n, r.o, r.size, r.inch, r.res, r.center, r.from, r.label, r.media])).map((row) => row.map(q).join(sep)).join('\n');
  }
  $('#btnSheet').addEventListener('click', () => { renderSpanInfo(); renderSheet(); const d = $('#sheetDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });
  $('#sheetClose').addEventListener('click', () => $('#sheetDlg').close());
  $('#sheetCopy').addEventListener('click', () => copyText(sheetTSV('\t'), 'تم نسخ الجدول، الصقه في Excel'));
  $('#sheetCsv').addEventListener('click', () => download('knpc-screens-content.csv', '﻿' + sheetTSV(','), 'text/csv'));

  /* =====================================================================
     keyboard
     ===================================================================== */
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === ' ' && tag !== 'button') { e.preventDefault(); togglePlay(); return; }
    const sc = get(selected);
    if (e.key === 'Escape') { if (stage.classList.contains('presenting')) exitPresent(); else select(null); return; }
    if (!sc) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteScreen(sc); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateScreen(sc); return; }
    if (!mod && (e.key === 'r' || e.key === 'R' || e.key === 'ق')) { e.preventDefault(); rotateScreen(sc); return; }
    const step = (e.shiftKey ? 10 : 1) * Math.max(1, UI.snap);
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (mv) { e.preventDefault(); sc.x += mv[0]; sc.y += mv[1]; clampScreen(sc); commit(); }
  });

  /* =====================================================================
     refresh + boot
     ===================================================================== */
  function refresh() {
    syncAll();
    renderInspector();
    renderCounts();
    renderSettings();
    renderTransport();
    renderLibrary();
    renderSpanInfo();
    Room3D.markDirty();
    save();
  }

  new ResizeObserver(() => { if (UI.view === 'plan' && ACT) syncAll(); Room3D.resize(); }).observe(stage);

  Media.on(() => { if (!ACT) return; renderLibrary(); renderDisplay(); if (selected) { const s = $('#iMedia'); if (s) s.innerHTML = mediaOptions(get(selected) && get(selected).media); } if (ACT) syncAll(); });

  // inside a hosted preview, file downloads are blocked: keep only the copy buttons there
  if (window.__NO_DOWNLOADS__) { $('#btnExport').hidden = true; $('#sheetCsv').hidden = true; }

  async function boot() {
    const fonts = document.fonts
      ? Promise.all(['700 40px "Reem Kufi"', '500 40px "IBM Plex Sans Arabic"', '600 40px "IBM Plex Sans Arabic"'].map((f) => document.fonts.load(f).catch(() => {})))
      : Promise.resolve();
    await Promise.race([fonts, new Promise((r) => setTimeout(r, 1800))]);
    Media.initDemos();
    if (!load()) { examples = [newExample('المخطط الحالي', knpcPreset(2600))]; ACT = examples[0]; }
    use(ACT);
    Room3D.init($('#roomCanvas'), {
      state: () => ACT,
      canvasFor: (id) => { const r = RT.get(ACT.id), v = r && r.views.get(id); return v ? v.canvas : null; },
      selectedId: () => selected,
      onPick: (id) => select(id),
    });
    hist.stack = [snap()]; hist.i = 0;
    refresh();
    renderDisplay();
    if (location.hash === '#room') setView('room');
    requestAnimationFrame(frame);
    Media.restore().then(() => refresh()).then(cloudInit);
  }
  boot();
})();
