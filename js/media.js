/* مكتبة المحتوى: مصادر تجريبية تُرسم على الجهاز + الصور والفيديوهات التي يرفعها المستخدم.
   الملفات المرفوعة تُحفظ في IndexedDB داخل المتصفح فقط ولا تُرسل لأي مكان. */
(function () {
  'use strict';

  const items = new Map();
  const listeners = [];
  const emit = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

  /* ---------- helpers ---------- */
  function rng(seed) {
    let s = (seed * 2654435761) >>> 0 || 7;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const AR = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
  const KUFI = '"Reem Kufi", "IBM Plex Sans Arabic", Tahoma, sans-serif';

  function makeThumb(src, sw, sh) {
    const c = canvas(176, 110), ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.width, c.height);
    if (sw && sh) {
      const s = Math.max(c.width / sw, c.height / sh);
      try { ctx.drawImage(src, (c.width - sw * s) / 2, (c.height - sh * s) / 2, sw * s, sh * s); } catch (e) { /* not ready */ }
    }
    try { return c.toDataURL('image/jpeg', 0.72); } catch (e) { return ''; }
  }

  function sky(ctx, w, h, stops) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    stops.forEach(([p, c]) => g.addColorStop(p, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }
  function haze(ctx, w, h, r, n, color) {
    for (let i = 0; i < n; i++) {
      const x = r() * w, y = r() * h * 0.6, rad = (0.15 + r() * 0.35) * Math.max(w, h) * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }
  function grain(ctx, w, h, r, density) {
    const n = Math.round((w * h) / (density || 160));
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(40,28,14,.10)' : 'rgba(255,246,222,.08)';
      ctx.fillRect(r() * w, r() * h, 1.6, 1.6);
    }
  }
  function vignette(ctx, w, h, a) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(28,18,6,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  /* ---------- industrial silhouettes (refinery skyline) ---------- */
  function tank(ctx, x, gy, w, h) {
    ctx.fillRect(x, gy - h, w, h);
    ctx.beginPath(); ctx.ellipse(x + w / 2, gy - h, w / 2, h * 0.12, 0, Math.PI, 0); ctx.fill();
  }
  function column(ctx, x, gy, w, h) {
    ctx.fillRect(x, gy - h, w, h);
    ctx.beginPath(); ctx.arc(x + w / 2, gy - h, w / 2, Math.PI, 0); ctx.fill();
    for (let y = gy - h * 0.22; y > gy - h; y -= h * 0.2) ctx.fillRect(x - w * 0.35, y, w * 1.7, Math.max(1.5, w * 0.08));
  }
  function derrick(ctx, x, gy, w, h, lw) {
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = lw; ctx.beginPath();
    const ax = x + w / 2, ay = gy - h, top = w * 0.06;
    ctx.moveTo(x, gy); ctx.lineTo(ax - top, ay); ctx.moveTo(x + w, gy); ctx.lineTo(ax + top, ay);
    const steps = 7;
    const at = (t) => [x + (w / 2 - top) * t, x + w - (w / 2 - top) * t, gy - h * t];
    for (let i = 1; i < steps; i++) {
      const [xl, xr, y] = at(i / steps);
      ctx.moveTo(xl, y); ctx.lineTo(xr, y);
      const [xl2, xr2, y2] = at((i + 1) / steps);
      if (i < steps - 1) { ctx.moveTo(xl, y); ctx.lineTo(xr2, y2); ctx.moveTo(xr, y); ctx.lineTo(xl2, y2); }
    }
    const [xl0, xr0, y0] = at(1 / steps);
    ctx.moveTo(x, gy); ctx.lineTo(xr0, y0); ctx.moveTo(x + w, gy); ctx.lineTo(xl0, y0);
    ctx.stroke();
    ctx.fillRect(ax - w * 0.1, ay - h * 0.04, w * 0.2, h * 0.04);
    ctx.restore();
  }
  function flare(ctx, x, gy, w, h, f) {
    ctx.fillRect(x, gy - h, w, h);
    if (!f) return;
    const fx = x + w / 2, fy = gy - h - w * 1.6;
    ctx.save();
    const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, w * 4.2 * f);
    g.addColorStop(0, 'rgba(255,226,160,.95)'); g.addColorStop(0.4, 'rgba(255,190,110,.55)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(fx, fy, w * 1.5 * f, w * 2.8 * f, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function tpole(ctx, x, gy, h, s, lw) {
    ctx.fillRect(x - lw / 2, gy - h, lw, h);
    ctx.save(); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = lw * 0.9; ctx.beginPath();
    ctx.moveTo(x - s * 0.55, gy - h + s * 0.32); ctx.quadraticCurveTo(x, gy - h - s * 0.18, x + s * 0.55, gy - h + s * 0.32);
    ctx.stroke(); ctx.restore();
  }
  function pipes(ctx, x0, x1, y, n, gap, lw) { for (let i = 0; i < n; i++) ctx.fillRect(x0, y - i * gap, x1 - x0, lw); }
  function ship(ctx, x, wy, len) {
    const h = len * 0.09;
    ctx.beginPath();
    ctx.moveTo(x, wy - h); ctx.lineTo(x + len, wy - h); ctx.lineTo(x + len * 0.94, wy); ctx.lineTo(x + len * 0.05, wy); ctx.closePath(); ctx.fill();
    ctx.fillRect(x + len * 0.72, wy - h * 2.6, len * 0.16, h * 1.7);
    ctx.fillRect(x + len * 0.79, wy - h * 3.6, len * 0.035, h * 1.1);
    ctx.fillRect(x + len * 0.1, wy - h * 1.4, len * 0.55, h * 0.4);
  }

  function skyline(ctx, x0, x1, gy, unit, r, mix) {
    const m = mix || 'refinery';
    let x = x0 + r() * unit * 2;
    while (x < x1) {
      const k = r();
      if (m === 'oilfield') {
        if (k < 0.55) { const w = unit * (1.8 + r() * 1.2), h = unit * (6 + r() * 5); derrick(ctx, x, gy, w, h, Math.max(1, unit * 0.13)); x += w + unit * (2 + r() * 5); }
        else if (k < 0.8) { tpole(ctx, x + unit, gy, unit * (4 + r() * 3), unit * 3.2, Math.max(1.4, unit * 0.18)); x += unit * (4 + r() * 4); }
        else { const w = unit * (2 + r() * 2), h = unit * (1 + r()); tank(ctx, x, gy, w, h); x += w + unit * (2 + r() * 3); }
        continue;
      }
      if (k < 0.28) { const w = unit * (2 + r() * 3), h = unit * (1.2 + r() * 1.6); tank(ctx, x, gy, w, h); x += w + unit * (0.3 + r()); }
      else if (k < 0.45) { const w = unit * (0.5 + r() * 0.5), h = unit * (5 + r() * 5); column(ctx, x, gy, w, h); x += w + unit * (0.6 + r() * 1.2); }
      else if (k < 0.6) { const w = unit * (1.6 + r() * 1.4), h = unit * (5 + r() * 6); derrick(ctx, x, gy, w, h, Math.max(1, unit * 0.12)); x += w + unit * (0.8 + r() * 2); }
      else if (k < 0.72) { const w = unit * (0.35 + r() * 0.3), h = unit * (7 + r() * 5); flare(ctx, x, gy, w, h, 0.7 + r() * 0.6); x += w + unit * (1 + r() * 1.5); }
      else if (k < 0.83) { tpole(ctx, x + unit, gy, unit * (4 + r() * 3), unit * 3, Math.max(1.4, unit * 0.16)); x += unit * (2.5 + r() * 2); }
      else {
        const w = unit * (3 + r() * 5);
        pipes(ctx, x, x + w, gy - unit * 0.5, 3, unit * 0.35, Math.max(1, unit * 0.1));
        ctx.fillRect(x, gy - unit * 1.4, unit * 0.15, unit * 1.4); ctx.fillRect(x + w, gy - unit * 1.4, unit * 0.15, unit * 1.4);
        x += w + unit * 0.5;
      }
    }
  }

  const SEPIA_SKY = [[0, '#978469'], [0.55, '#d6c6a3'], [1, '#e4d6b6']];
  const INK = '#3a2e20';

  function paintArchive(c, seed, mix) {
    const ctx = c.getContext('2d'), w = c.width, h = c.height, r = rng(seed);
    sky(ctx, w, h, SEPIA_SKY);
    haze(ctx, w, h, r, 6, 'rgba(255,244,214,.18)');
    const gy = h * (0.7 + r() * 0.06), unit = h / 22;
    if (mix === 'port') {
      const wy = gy;
      ctx.fillStyle = 'rgba(80,64,44,.55)'; skyline(ctx, 0, w, wy - unit * 0.6, unit * 0.55, r, 'refinery');
      const g = ctx.createLinearGradient(0, wy, 0, h); g.addColorStop(0, '#a99674'); g.addColorStop(1, '#7c6a4f');
      ctx.fillStyle = g; ctx.fillRect(0, wy - unit * 0.6, w, h);
      ctx.fillStyle = 'rgba(255,240,210,.18)';
      for (let i = 0; i < 40; i++) ctx.fillRect(r() * w, wy + r() * (h - wy), unit * (1 + r() * 4), 1.5);
      ctx.fillStyle = INK;
      ship(ctx, w * (0.08 + r() * 0.1), wy + unit * 2.2, w * 0.42);
      ship(ctx, w * 0.6, wy + unit * 0.9, w * 0.26);
    } else {
      ctx.fillStyle = 'rgba(80,64,44,.45)'; skyline(ctx, 0, w, gy - unit * 0.3, unit * 0.6, r, mix);
      ctx.fillStyle = INK; skyline(ctx, 0, w, gy, unit, r, mix);
      const g = ctx.createLinearGradient(0, gy, 0, h); g.addColorStop(0, '#6f5c44'); g.addColorStop(1, '#4f4030');
      ctx.fillStyle = g; ctx.fillRect(0, gy, w, h - gy);
      ctx.fillStyle = 'rgba(30,22,12,.6)'; ctx.fillRect(0, gy + unit * 1.2, w, Math.max(1.5, unit * 0.08));
      for (let x = r() * unit * 3; x < w; x += unit * 2.6) ctx.fillRect(x, gy + unit * 0.6, Math.max(1.2, unit * 0.07), unit * 0.6);
    }
    grain(ctx, w, h, r); vignette(ctx, w, h, 0.55);
  }

  function paintPanorama(c) {
    const ctx = c.getContext('2d'), w = c.width, h = c.height, r = rng(1960);
    sky(ctx, w, h, SEPIA_SKY);
    haze(ctx, w, h, r, 14, 'rgba(255,244,214,.16)');
    const gy = h * 0.74, unit = h / 24;
    // sea on the left third (the port), refinery to the right
    ctx.fillStyle = 'rgba(80,64,44,.45)'; skyline(ctx, 0, w, gy - unit * 0.4, unit * 0.6, r, 'refinery');
    ctx.fillStyle = INK; skyline(ctx, w * 0.36, w, gy, unit, r, 'refinery');
    ctx.fillStyle = INK; skyline(ctx, w * 0.2, w * 0.36, gy, unit * 0.9, r, 'oilfield');
    const sea = ctx.createLinearGradient(0, gy, 0, h); sea.addColorStop(0, '#a89573'); sea.addColorStop(1, '#7b694e');
    ctx.fillStyle = sea; ctx.fillRect(0, gy - unit * 0.4, w * 0.2, h);
    const gr = ctx.createLinearGradient(0, gy, 0, h); gr.addColorStop(0, '#6f5c44'); gr.addColorStop(1, '#4f4030');
    ctx.fillStyle = gr; ctx.fillRect(w * 0.2, gy, w * 0.8, h - gy);
    ctx.fillStyle = INK; ship(ctx, w * 0.03, gy + unit * 2.4, w * 0.12);
    // title, readable across the span
    ctx.save();
    ctx.direction = 'rtl'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(42,30,14,.85)';
    ctx.font = `700 ${Math.round(h * 0.12)}px ${KUFI}`;
    ctx.fillText('من حقول النفط إلى المصافي', w * 0.5, h * 0.24);
    ctx.font = `500 ${Math.round(h * 0.055)}px ${AR}`;
    ctx.fillText('KNPC · منذ 1960', w * 0.5, h * 0.33);
    ctx.restore();
    grain(ctx, w, h, r, 120); vignette(ctx, w, h, 0.45);
  }

  function paintSpeaker(c, who) {
    const ctx = c.getContext('2d'), w = c.width, h = c.height, r = rng(who === 'woman' ? 77 : 41);
    if (who === 'woman') sky(ctx, w, h, [[0, '#1d2a3c'], [1, '#3e5068']]);
    else sky(ctx, w, h, [[0, '#2a2622'], [1, '#5a4a38']]);
    const key = ctx.createRadialGradient(w * 0.3, h * 0.3, 0, w * 0.3, h * 0.3, w * 0.9);
    key.addColorStop(0, 'rgba(255,236,200,.22)'); key.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = key; ctx.fillRect(0, 0, w, h);
    const cx = w * 0.52, hy = h * 0.42, hr = w * 0.15;
    const skin = '#c39470';
    if (who === 'woman') {
      ctx.fillStyle = '#1f2c44';
      ctx.beginPath(); ctx.moveTo(cx - w * 0.48, h); ctx.quadraticCurveTo(cx - w * 0.42, h * 0.6, cx, h * 0.58); ctx.quadraticCurveTo(cx + w * 0.42, h * 0.6, cx + w * 0.48, h); ctx.fill();
      ctx.fillStyle = '#3a6194';
      ctx.beginPath(); ctx.ellipse(cx, hy + hr * 0.15, hr * 1.42, hr * 1.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - hr * 1.4, hy + hr * 0.4); ctx.quadraticCurveTo(cx - hr * 1.8, h * 0.66, cx - w * 0.3, h * 0.7);
      ctx.lineTo(cx + w * 0.3, h * 0.7); ctx.quadraticCurveTo(cx + hr * 1.8, h * 0.66, cx + hr * 1.4, hy + hr * 0.4); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(cx, hy + hr * 0.2, hr * 0.78, hr * 1.0, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#e8e2d6';
      ctx.beginPath(); ctx.moveTo(cx - w * 0.5, h); ctx.quadraticCurveTo(cx - w * 0.44, h * 0.6, cx, h * 0.57); ctx.quadraticCurveTo(cx + w * 0.44, h * 0.6, cx + w * 0.5, h); ctx.fill();
      ctx.fillStyle = '#f3efe8';
      ctx.beginPath(); ctx.moveTo(cx - hr * 1.15, hy - hr * 0.7); ctx.quadraticCurveTo(cx - hr * 1.9, h * 0.6, cx - w * 0.36, h * 0.72);
      ctx.lineTo(cx + w * 0.36, h * 0.72); ctx.quadraticCurveTo(cx + hr * 1.9, h * 0.6, cx + hr * 1.15, hy - hr * 0.7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx, hy - hr * 0.35, hr * 1.2, hr * 0.95, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(cx, hy + hr * 0.25, hr * 0.74, hr * 0.98, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4b3a2c'; ctx.beginPath(); ctx.ellipse(cx, hy + hr * 0.95, hr * 0.5, hr * 0.32, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = '#151210'; ctx.lineWidth = hr * 0.13;
      ctx.beginPath(); ctx.ellipse(cx, hy - hr * 0.72, hr * 1.04, hr * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, hy - hr * 0.55, hr * 1.1, hr * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    }
    // lower third
    ctx.fillStyle = 'rgba(8,10,14,.55)'; ctx.fillRect(0, h * 0.8, w, h * 0.11);
    ctx.fillStyle = '#d9b46a'; ctx.fillRect(w * 0.08, h * 0.8, w * 0.84, h * 0.004);
    ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillStyle = '#f2ead8';
    ctx.font = `600 ${Math.round(w * 0.055)}px ${AR}`;
    ctx.fillText(who === 'woman' ? 'متحدثة · شهادة شخصية' : 'متحدث · شهادة شخصية', w * 0.92, h * 0.848);
    ctx.fillStyle = '#d9b46a'; ctx.font = `400 ${Math.round(w * 0.038)}px ${AR}`;
    ctx.fillText('الاسم والمسمّى الوظيفي', w * 0.92, h * 0.885);
    ctx.restore();
    grain(ctx, w, h, r, 220); vignette(ctx, w, h, 0.5);
  }

  function paintText(c, spec) {
    const ctx = c.getContext('2d'), w = c.width, h = c.height;
    ctx.fillStyle = spec.bg || '#0f1622'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255,255,255,.07)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const base = Math.min(w, h);
    ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = spec.fg || '#f2d394';
    const lines = wrap(ctx, spec.title || '', `700 ${Math.round(base * 0.13)}px ${KUFI}`, w * 0.84);
    const lh = base * 0.17;
    const subLines = spec.sub ? wrap(ctx, spec.sub, `400 ${Math.round(base * 0.055)}px ${AR}`, w * 0.8) : [];
    const total = lines.length * lh + (subLines.length ? base * 0.06 + subLines.length * base * 0.08 : 0);
    let y = h / 2 - total / 2 + lh * 0.75;
    ctx.font = `700 ${Math.round(base * 0.13)}px ${KUFI}`;
    lines.forEach((l) => { ctx.fillText(l, w / 2, y); y += lh; });
    if (subLines.length) {
      ctx.globalAlpha = 0.8; ctx.font = `400 ${Math.round(base * 0.055)}px ${AR}`; y += base * 0.02;
      subLines.forEach((l) => { ctx.fillText(l, w / 2, y); y += base * 0.08; });
    }
    ctx.restore();
  }
  function wrap(ctx, text, font, maxW) {
    ctx.font = font;
    const out = [];
    text.split('\n').forEach((para) => {
      let line = '';
      para.split(/\s+/).forEach((word) => {
        const t = line ? line + ' ' + word : word;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = word; } else line = t;
      });
      out.push(line);
    });
    return out;
  }

  /* ---------- animated sources ---------- */
  function makeFilm() {
    const W = 1920, H = 640, c = canvas(W, H), ctx = c.getContext('2d');
    const tileW = 2400;
    const far = canvas(tileW, H), near = canvas(tileW, H);
    { const x = far.getContext('2d'); x.fillStyle = 'rgba(78,62,42,.5)'; skyline(x, 0, tileW - 60, H * 0.72, H / 34, rng(11)); }
    { const x = near.getContext('2d'); x.fillStyle = INK; skyline(x, 0, tileW - 60, H * 0.76, H / 20, rng(23));
      x.fillStyle = '#5b4a36'; x.fillRect(0, H * 0.76, tileW, H); }
    const grainTile = canvas(512, 512); grain(grainTile.getContext('2d'), 512, 512, rng(5), 60);
    let lastT = -1;
    function tick(t) {
      if (t === lastT) return; lastT = t;
      const loop = 24, p = (t % loop) / loop;
      sky(ctx, W, H, [[0, mix('#6f6a74', '#978469', p)], [0.6, mix('#c9a982', '#d6c6a3', p)], [1, '#e2d2b0']]);
      const sx = W * (0.15 + 0.7 * p), sy = H * (0.62 - 0.35 * Math.sin(p * Math.PI));
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, H * 0.3);
      sg.addColorStop(0, 'rgba(255,240,205,.95)'); sg.addColorStop(0.15, 'rgba(255,226,170,.6)'); sg.addColorStop(1, 'rgba(255,220,160,0)');
      ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
      const of = (t * 22) % tileW, on = (t * 70) % tileW;
      ctx.drawImage(far, of - tileW, 0); ctx.drawImage(far, of, 0);
      ctx.drawImage(near, on - tileW, 0); ctx.drawImage(near, on, 0);
      // gold streak travelling right → left, like the arrow in the room render
      const lx = W * (1.15 - ((t % 6) / 6) * 1.4);
      const lg = ctx.createLinearGradient(lx, 0, lx + W * 0.35, 0);
      lg.addColorStop(0, 'rgba(255,214,140,0)'); lg.addColorStop(0.15, 'rgba(255,214,140,.95)'); lg.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = lg; ctx.fillRect(lx, H * 0.45, W * 0.35, H * 0.012);
      const year = 1960 + Math.floor(p * 66);
      ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(36,26,12,.82)';
      ctx.font = `700 ${Math.round(H * 0.2)}px ${KUFI}`; ctx.fillText(String(year), W * 0.95, H * 0.25);
      ctx.font = `500 ${Math.round(H * 0.06)}px ${AR}`; ctx.fillText('رحلة الصناعة النفطية في الكويت', W * 0.95, H * 0.34);
      ctx.restore();
      ctx.globalAlpha = 0.5;
      for (let y = 0; y < H; y += 512) for (let x = 0; x < W; x += 512) ctx.drawImage(grainTile, x, y);
      ctx.globalAlpha = 1;
      vignette(ctx, W, H, 0.45);
    }
    tick(0.01);
    return { c, tick };
  }
  function mix(a, b, p) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), q = Math.min(1, p * 2.2);
    const ch = (s) => Math.round(((pa >> s) & 255) * (1 - q) + ((pb >> s) & 255) * q);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  function makeTestPattern() {
    const W = 2400, H = 800, c = canvas(W, H), ctx = c.getContext('2d');
    let lastT = -1;
    function tick(t) {
      if (t === lastT) return; lastT = t;
      ctx.fillStyle = '#0d1524'; ctx.fillRect(0, 0, W, H);
      const off = (t * 120) % 160;
      ctx.save(); ctx.translate(-160 + off, 0);
      for (let x = -H; x < W + 320; x += 160) {
        ctx.fillStyle = 'rgba(217,180,106,.07)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 80, 0); ctx.lineTo(x + 80 - H, H); ctx.lineTo(x - H, H); ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(217,180,106,.35)'; ctx.lineWidth = 2;
      for (let x = 0; x <= W; x += 100) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.strokeStyle = '#f2d394'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.lineWidth = 4;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(W * (i + 0.5) / 6, H / 2, H * 0.32, 0, Math.PI * 2); ctx.stroke(); }
      const bx = W - ((t * 400) % (W + 200)) + 100, by = H / 2 + Math.sin(t * 2.2) * H * 0.3;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, 70);
      g.addColorStop(0, '#fff3d6'); g.addColorStop(0.5, '#f2b85a'); g.addColorStop(1, 'rgba(242,184,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, 70, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#ece5d3';
      ctx.font = `600 54px ${AR}`; ctx.fillText('نمط اختبار المحاذاة', W / 2, 90);
      ctx.restore();
    }
    tick(0.01);
    return { c, tick };
  }

  /* ---------- registry ---------- */
  function addDemo(id, name, kind, c, extra) {
    const it = Object.assign({ id, name, kind, src: c, w: () => c.width, h: () => c.height, ready: () => true, demo: true }, extra || {});
    it.thumb = makeThumb(c, c.width, c.height);
    items.set(id, it);
  }

  function initDemos() {
    const film = makeFilm();
    addDemo('demo-film', 'فيلم تجريبي متحرك', 'anim', film.c, { tick: film.tick });
    const pan = canvas(4096, 880); paintPanorama(pan);
    addDemo('demo-pan', 'بانوراما أرشيفية عريضة', 'image', pan);
    const test = makeTestPattern();
    addDemo('demo-test', 'نمط اختبار المحاذاة', 'anim', test.c, { tick: test.tick });
    const mixes = ['refinery', 'oilfield', 'port', 'refinery', 'oilfield'];
    mixes.forEach((m, i) => {
      const c = canvas(1280, 720); paintArchive(c, 101 + i * 37, m);
      addDemo('demo-arch-' + i, 'صورة أرشيفية ' + (i + 1), 'image', c);
    });
    const man = canvas(720, 1280); paintSpeaker(man, 'man');
    addDemo('demo-man', 'متحدث (رجل)', 'image', man);
    const woman = canvas(720, 1280); paintSpeaker(woman, 'woman');
    addDemo('demo-woman', 'متحدثة (امرأة)', 'image', woman);
    emit();
  }

  /* ---------- user media + IndexedDB ---------- */
  const DB_NAME = 'knpc-wall-planner', STORE = 'media';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      try {
        const rq = indexedDB.open(DB_NAME, 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore(STORE, { keyPath: 'id' });
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  async function dbDo(mode, fn) {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const tx = d.transaction(STORE, mode), st = tx.objectStore(STORE);
        const rq = fn(st);
        tx.oncomplete = () => res(rq && rq.result);
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { return null; }
  }

  const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const kindOf = (type, name) => {
    if ((type || '').startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)$/i.test(name || '')) return 'video';
    if ((type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(name || '')) return 'image';
    return null;
  };

  // builds a library item around a URL (a local blob: URL or the shared cloud copy)
  // `alt` is a second address to try if the first fails (the file straight from storage)
  function fallbackTo(el, alt) {
    if (!alt) return;
    el.addEventListener('error', () => { if (el.dataset.alt) return; el.dataset.alt = '1'; el.crossOrigin = 'anonymous'; el.src = alt; });
  }
  async function makeItem(id, name, kind, url, alt) {
    let it;
    if (kind === 'video') {
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto'; fallbackTo(v, alt); v.src = url;
      it = { id, name, kind, src: v, url, user: true, thumb: '',
        w: () => v.videoWidth, h: () => v.videoHeight, ready: () => v.readyState >= 2 };
      v.addEventListener('loadeddata', () => {
        it.thumb = makeThumb(v, v.videoWidth, v.videoHeight); emit();
        if (v.duration > 2) {
          const back = v.currentTime;
          v.addEventListener('seeked', () => { it.thumb = makeThumb(v, v.videoWidth, v.videoHeight); v.currentTime = back; emit(); }, { once: true });
          v.currentTime = Math.min(2, v.duration * 0.25);
        }
      }, { once: true });
      v.load();
    } else {
      const img = new Image(); fallbackTo(img, alt); img.src = url;
      try { await img.decode(); } catch (e) { if (alt) { try { await new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 8000); }); } catch (er) { /* ignore */ } } }
      it = { id, name, kind: 'image', src: img, url, user: true,
        w: () => img.naturalWidth, h: () => img.naturalHeight, ready: () => img.complete && img.naturalWidth > 0 };
      it.thumb = makeThumb(img, img.naturalWidth, img.naturalHeight);
    }
    return it;
  }

  async function addFile(blob, name, id, persist) {
    const type = blob.type || '';
    const kind = kindOf(type, name);
    if (!kind) return null;
    id = id || uid();
    const it = await makeItem(id, name, kind, URL.createObjectURL(blob));
    it.file = blob;
    items.set(id, it);
    if (persist !== false) dbDo('readwrite', (st) => st.put({ id, name, kind, type, blob }));
    emit();
    return it;
  }

  // a file that lives in the team's shared storage; `src` is the address to load it from
  async function addRemote(rec, src) {
    const have = items.get(rec.id);
    if (have) { have.remote = true; return have; }
    let it;
    if (rec.kind === 'text') it = addText(rec.spec || {}, rec.id, false);
    else { it = await makeItem(rec.id, rec.name, rec.kind, src, rec.url !== src ? rec.url : null); items.set(rec.id, it); }
    it.remote = true;
    emit();
    return it;
  }
  // after a local file has been copied to shared storage, stop keeping the browser copy
  function forgetLocal(id) { dbDo('readwrite', (st) => st.delete(id)); }

  function addText(spec, id, persist) {
    id = id || uid();
    const vertical = spec.orient === 'v';
    const c = canvas(vertical ? 1080 : 1920, vertical ? 1920 : 1080);
    paintText(c, spec);
    const it = { id, name: spec.title ? spec.title.split('\n')[0].slice(0, 40) : 'بطاقة نص', kind: 'text', src: c, spec, user: true,
      w: () => c.width, h: () => c.height, ready: () => true };
    it.thumb = makeThumb(c, c.width, c.height);
    items.set(id, it);
    if (persist !== false) dbDo('readwrite', (st) => st.put({ id, kind: 'text', spec }));
    emit();
    return it;
  }

  function remove(id) {
    const it = items.get(id);
    if (!it || it.demo) return;
    if (it.kind === 'video') { try { it.src.pause(); it.src.removeAttribute('src'); it.src.load(); } catch (e) { /* ignore */ } }
    if (it.url && it.url.startsWith('blob:')) URL.revokeObjectURL(it.url);
    items.delete(id);
    dbDo('readwrite', (st) => st.delete(id));
    emit();
  }

  async function restore() {
    const all = await dbDo('readonly', (st) => st.getAll());
    if (!all || !all.length) return;
    for (const rec of all) {
      if (items.has(rec.id)) continue;
      if (rec.kind === 'text') addText(rec.spec, rec.id, false);
      else if (rec.blob) await addFile(rec.blob, rec.name, rec.id, false);
    }
  }

  const KIND_LABEL = { video: 'فيديو', image: 'صورة', anim: 'متحرك', text: 'نص' };

  window.Media = {
    items,
    get: (id) => (id ? items.get(id) : null),
    list: () => [...items.values()],
    on: (f) => listeners.push(f),
    initDemos, addFile, addText, addRemote, forgetLocal, remove, restore, kindOf, uid,
    kindLabel: (k) => KIND_LABEL[k] || k,
    isMoving: (it) => !!it && (it.kind === 'video' || it.kind === 'anim'),
  };
})();
