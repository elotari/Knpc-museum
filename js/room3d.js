/* الغرفة ثلاثية الأبعاد: جدار دائري تُلفّ عليه الشاشات حسب المخطط، والزائر في المنتصف.
   الوحدات بالمتر. كل شاشة تستخدم لوحة الرسم نفسها التي تظهر في المخطط المسطّح كخامة. */
(function () {
  'use strict';

  const R3 = { ok: typeof THREE !== 'undefined', dirty: true };
  let api, host, renderer, scene, camera, root, radius = 6, ray, glowTex;
  const textures = [];
  const pickables = [];
  const cam = { yaw: 0, pitch: 0.03, dist: 0, fov: 68 };
  const goal = Object.assign({}, cam);

  R3.init = function (el, a) {
    api = a; host = el;
    if (!R3.ok) { fail('تعذّر تحميل مكتبة العرض ثلاثي الأبعاد. تأكد من الاتصال بالإنترنت ثم أعد تحميل الصفحة.'); return; }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) { R3.ok = false; fail('المتصفح لا يدعم WebGL، لذلك لا يمكن عرض الغرفة ثلاثية الأبعاد.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    el.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04060a);
    camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.05, 200);
    ray = new THREE.Raycaster();
    glowTex = makeGlow();
    bindPointer(el);
    R3.resize();
  };

  function fail(msg) { host.innerHTML = '<div class="room-fallback">' + msg + '</div>'; }

  function makeGlow() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,214,150,0.9)'); g.addColorStop(0.45, 'rgba(255,200,130,0.25)'); g.addColorStop(1, 'rgba(255,200,130,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  R3.resize = function () {
    if (!renderer) return;
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };

  R3.markDirty = function () { R3.dirty = true; };

  function dispose(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  function build() {
    R3.dirty = false;
    if (root) { scene.remove(root); dispose(root); }
    textures.forEach((t) => t.dispose()); textures.length = 0; pickables.length = 0;
    root = new THREE.Group(); scene.add(root);

    const S = api.state();
    const L = S.wall.length / 100, H = S.wall.height / 100;
    const A = Math.max(30, Math.min(360, S.wall.arc)) * Math.PI / 180;
    const R = radius = L / A;
    const T0 = Math.PI - A / 2; // cylinder theta where the display wall starts

    root.add(new THREE.AmbientLight(0x8a9cc0, 0.35));
    const hemi = new THREE.HemisphereLight(0x9fc4ff, 0x1a120a, 0.2); root.add(hemi);
    const pl = new THREE.PointLight(0xbfdcff, 0.55, R * 3); pl.position.set(0, H - 0.4, 0); root.add(pl);

    // room shell
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.9, metalness: 0.05, side: THREE.BackSide });
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 160, 1, true), wallMat);
    shell.position.y = H / 2; root.add(shell);
    // display wall face, a touch lighter so the planned arc reads
    const face = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.01, R - 0.01, H, 120, 1, true, T0, A),
      new THREE.MeshStandardMaterial({ color: 0x1d2840, roughness: 0.85, metalness: 0.08, side: THREE.BackSide }));
    face.position.y = H / 2; root.add(face);
    // gold LED coves top and bottom of the display wall
    const led = new THREE.MeshBasicMaterial({ color: 0xffc777, side: THREE.BackSide });
    const cove = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.03, 160, 1, true, T0, A), led);
    cove.position.y = H - 0.38; root.add(cove);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.02, 160, 1, true, T0, A), led);
    base.position.y = 0.12; root.add(base);

    // floor + ceiling
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 128),
      new THREE.MeshStandardMaterial({ color: 0x0b1019, roughness: 0.35, metalness: 0.35 }));
    floor.rotation.x = -Math.PI / 2; root.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.62, 96),
      new THREE.MeshBasicMaterial({ color: 0x3d7fb8, transparent: true, opacity: 0.45 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.005; root.add(ring);
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(R, 128),
      new THREE.MeshStandardMaterial({ color: 0x0a0e16, roughness: 0.95 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; root.add(ceil);
    // ceiling ring lamp
    const lampR = Math.min(R * 0.32, 3);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(lampR, lampR, 0.5, 96, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x9fd2ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
    lamp.position.y = H - 0.45; root.add(lamp);
    const lamp2 = new THREE.Mesh(new THREE.TorusGeometry(lampR * 0.82, 0.035, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xe6f4ff }));
    lamp2.rotation.x = Math.PI / 2; lamp2.position.y = H - 0.72; root.add(lamp2);

    // central model table
    const table = new THREE.Group();
    const tbase = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, 0.85, 64),
      new THREE.MeshStandardMaterial({ color: 0x1b2333, roughness: 0.5, metalness: 0.4 }));
    tbase.position.y = 0.425; table.add(tbase);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.012, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffc777 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.85; table.add(rim);
    const modelMat = new THREE.MeshStandardMaterial({ color: 0x5f7896, roughness: 0.4, metalness: 0.5 });
    [[-0.4, 0.2, 0.18, 0.5], [0.1, -0.2, 0.12, 0.35], [0.35, 0.25, 0.09, 0.6], [-0.1, 0.35, 0.07, 0.8]].forEach(([x, z, r, h]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), modelMat); m.position.set(x, 0.85 + h / 2, z); table.add(m);
    });
    [[0.0, 0.0, 0.5, 0.12, 0.3], [-0.45, -0.3, 0.3, 0.1, 0.3], [0.5, -0.25, 0.25, 0.18, 0.2]].forEach(([x, z, w, h, d]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), modelMat); m.position.set(x, 0.85 + h / 2, z); table.add(m);
    });
    const stackM = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.0, 12), modelMat); stackM.position.set(-0.6, 1.35, 0.05); table.add(stackM);
    root.add(table);

    // screens
    const sel = api.selectedId();
    const bezelMat = new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.4, metalness: 0.6 });
    S.screens.forEach((sc) => {
      const cv = api.canvasFor(sc.id);
      if (!cv) return;
      const w = sc.w / 100, h = sc.h / 100;
      const cx = (sc.x + sc.w / 2) / 100, cy = (sc.y + sc.h / 2) / 100;
      const phi = (cx - L / 2) / R;
      const Rs = R - 0.06;
      const g = new THREE.Group();
      g.position.set(Rs * Math.sin(phi), cy, -Rs * Math.cos(phi));
      g.rotation.y = -phi;

      const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.1, h * 2.1),
        new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.position.z = -0.045; g.add(glow);

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, h + 0.03, 0.04), bezelMat);
      bezel.position.z = -0.022; g.add(bezel);
      if (sc.id === sel) {
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.09, h + 0.09), new THREE.MeshBasicMaterial({ color: 0xf2d394 }));
        frame.position.z = -0.0005 - 0.001; g.add(frame);
        bezel.position.z = -0.03;
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
      textures.push(tex);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      panel.position.z = 0.001; panel.userData.id = sc.id; g.add(panel);
      pickables.push(panel);

      // downlight dot in the ceiling above the screen
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
      const rr = R - 0.7;
      dot.position.set(rr * Math.sin(phi), H - 0.01, -rr * Math.cos(phi)); dot.rotation.x = Math.PI / 2;
      root.add(dot);
      root.add(g);
    });
  }

  /* ---------- camera ---------- */
  R3.preset = function (name) {
    const R = radius;
    if (name === 'visitor') Object.assign(goal, { yaw: 0, pitch: 0.03, dist: 0, fov: 72 });
    if (name === 'entrance') Object.assign(goal, { yaw: 0, pitch: -0.05, dist: R * 0.88, fov: 64 });
    if (name === 'top') Object.assign(goal, { yaw: 0, pitch: -1.05, dist: R * 1.7, fov: 52 });
  };

  function bindPointer(el) {
    let drag = null;
    el.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
      goal.yaw += dx * 0.0045; cam.yaw = goal.yaw;
      goal.pitch = Math.max(-1.35, Math.min(0.7, goal.pitch + dy * 0.0035)); cam.pitch = goal.pitch;
    });
    el.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) pick(e);
      drag = null;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      goal.dist = Math.max(0, Math.min(radius * 2.2, goal.dist + e.deltaY * 0.006));
    }, { passive: false });
  }

  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    api.onPick(hit ? hit.object.userData.id : null);
  }

  R3.render = function () {
    if (!R3.ok || !renderer) return;
    if (R3.dirty) build();
    textures.forEach((t) => { t.needsUpdate = true; });
    ['yaw', 'pitch', 'dist', 'fov'].forEach((k) => { cam[k] += (goal[k] - cam[k]) * 0.12; });
    const target = new THREE.Vector3(0, 1.65, 0);
    const f = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), -Math.cos(cam.yaw) * Math.cos(cam.pitch));
    camera.position.copy(target).addScaledVector(f, -cam.dist);
    camera.lookAt(target.clone().add(f));
    if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    renderer.render(scene, camera);
  };

  window.Room3D = R3;
})();
