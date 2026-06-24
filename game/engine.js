/* ============================================================================
 * OFFICE QUEST — engine.js
 * Point-&-click engine: render loop, scroll-camera, input, hero/NPC movement,
 * inventory + verb/use system, dialogue & cutscene runner, interruption
 * scheduler, save/load. Boots on DOMContentLoaded.
 * ==========================================================================*/
(function () {
  const OQ = (window.OfficeQuest = window.OfficeQuest || {});
  const SAVE_KEY = 'officequest.save.v1';
  const NAMES = { standup_sign: 'a recurring-forever standup invite' };

  let art, C, W, canvas, ctx, DPR = 1;
  let objById = {};
  const cam = { y: 0 };
  const npcs = {};
  const hero = { x: 0, worldY: 0, facing: 1, frame: 0, animT: 0, target: null, onArrive: null, moving: false, sitting: false };
  const removed = new Set();
  const inv = [];                 // item ids
  const flags = {};
  let held = null;                // item id currently "in hand"
  let hover = null;               // hovered object id
  let mouse = { x: 0, y: 0, onCanvas: false };
  let busy = false;               // dialogue/cutscene active
  let bubbleQueue = [];           // [{speaker,text,opts}]
  let curBubble = null;
  let cutscene = null;            // {steps,i,await} ; await: {type:'walk',npc}|{type:'timer',until}
  let focus = 100, focusLow = false;
  let ambient = null;             // current non-blocking bubble {speaker,text,until}
  const ambientQueue = [];        // queued non-blocking bubbles
  const TALK_MS = 3600;           // how long a pest stands still holding its (readable) bubble
  let done = false;
  let lastUserScroll = 0;
  let nextInterrupt = 0, nextManager = 0;
  let lastT = 0;
  const SPEED = 245;              // px/sec

  // ---------- metrics / coordinate resolution ----------
  function metrics() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const colW = Math.min(vw, 840), colLeft = (vw - colW) / 2, colRight = colLeft + colW;
    const docH = Math.max(document.documentElement.scrollHeight, vh + 10);
    const maxScroll = Math.max(0, docH - vh);
    return { vw, vh, colW, colLeft, colRight, docH, maxScroll };
  }
  function anchorX(clId, m) {
    const cl = W.clusters[clId];
    if (cl.anchor === 'left') return cl.dx;
    if (cl.anchor === 'right') return m.vw - cl.dx;
    return m.vw / 2 + cl.dx;
  }
  function clusterY(clId, m) { return W.clusters[clId].band * m.docH; }
  function objPos(o, m) {
    return { x: anchorX(o.cluster, m) + (o.dx || 0), worldY: clusterY(o.cluster, m) + (o.dy || 0) };
  }
  function clusterPoint(clId, m) { return { x: anchorX(clId, m), worldY: clusterY(clId, m) }; }

  // ---------- save / load ----------
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        inv: inv.slice(), removed: [...removed], flags, done, focus,
      }));
    } catch (e) {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (!s) return false;
      (s.inv || []).forEach(id => inv.push(id));
      (s.removed || []).forEach(id => removed.add(id));
      Object.assign(flags, s.flags || {});
      done = !!s.done; focus = typeof s.focus === 'number' ? s.focus : 100;
      if (flags.noteWritten && objById.sticky_note) objById.sticky_note.name = "note: 'QuackCorp demo — 1HR — BRING THE DUCK!!'";
      if (flags.signFlipped && objById.room_sign) objById.room_sign.state.flipped = true;
      if (done && objById.manager) { npcs.manager.visible = false; }
      return true;
    } catch (e) { return false; }
  }

  // ---------- the handler API ("g") ----------
  const g = {
    pick: (a) => a[(Math.random() * a.length) | 0],
    has: (id) => inv.includes(id),
    flag: (n) => !!flags[n],
    setFlag: (n, v = true) => { flags[n] = v; save(); },
    obj: (id) => objById[id],
    setState: () => true,
    take(id) {
      const o = objById[id];
      if (!inv.includes(id)) inv.push(id);
      removed.add(id);
      renderInv(); save();
      sayLines('me', (o && o.take) || "Got it.");
    },
    give(id) { if (!inv.includes(id)) inv.push(id); renderInv(); save(); },
    consume(id) {
      const i = inv.indexOf(id); if (i >= 0) inv.splice(i, 1);
      removed.add(id);
      if (held === id) held = null;
      renderInv(); save();
    },
    me: (t) => sayLines('me', t),
    say: (sp, t, opts) => sayLines(sp, t, opts),
    refuse() {
      sayLines('me', g.pick([
        "That accomplishes nothing, which is at least on-brand for this company.",
        "Nope. Even by adventure-game logic, that's a stretch.",
        "I tried. The universe declined.",
        "Hmm. Satisfying, but pointless.",
        "Let's not. I have a reputation to almost protect.",
      ]));
    },
    cutscene: (steps) => startCutscene(steps),
    hideNpc(id) { if (npcs[id]) npcs[id].visible = false; },
    completeStage(path) { winStage(path); },
    completeFocus() { if (done) showOverlay(flags.lastPath || ''); },
    toast(t) { toast(t); },
  };
  OQ.g = g;

  // ---------- dialogue ----------
  function speakerInfo(id) {
    const sp = (W.speakers && W.speakers[id]);
    if (sp) return sp;
    const o = objById[id];
    if (o && o.col && OQ.COL[o.col]) return { name: o.name.replace(/^a /, '').replace(/,.*$/, ''), color: OQ.COL[o.col].shirt };
    return { name: '???', color: C.pink };
  }
  function sayLines(sp, t, opts) {
    const arr = Array.isArray(t) ? t : [t];
    arr.forEach((line) => bubbleQueue.push({ speaker: sp, text: line, opts: opts || {} }));
    pumpBubble();
  }
  function pumpBubble() {
    if (curBubble) return;
    if (!bubbleQueue.length) { if (!cutscene) setBusy(false); return; }
    curBubble = bubbleQueue.shift();
    setBusy(true);
    renderBubble();
  }
  function dismissBubble() {
    curBubble = null;
    const el = document.getElementById('oq-bubble'); if (el) el.remove();
    pumpBubble();
  }

  // ---------- cutscene runner ----------
  function startCutscene(steps) { cutscene = { steps: steps.slice(), i: 0, await: null }; setBusy(true); }
  function tickCutscene() {
    if (!cutscene) return;
    if (curBubble || bubbleQueue.length) return;          // wait for player to read
    if (cutscene.await) {
      const a = cutscene.await;
      if (a.type === 'timer') { if (performance.now() >= a.until) cutscene.await = null; else return; }
      else if (a.type === 'walk') { if (npcs[a.npc] && !npcs[a.npc].moving) cutscene.await = null; else return; }
    }
    if (cutscene.i >= cutscene.steps.length) { cutscene = null; if (!bubbleQueue.length) setBusy(false); return; }
    const step = cutscene.steps[cutscene.i++];
    const [op, a, b, c] = step;
    if (op === 'say') sayLines(a, b, c);
    else if (op === 'me') sayLines('me', a, b);
    else if (op === 'wait') cutscene.await = { type: 'timer', until: performance.now() + a };
    else if (op === 'fn') { try { a(g); } catch (e) {} tickCutscene(); }
    else if (op === 'walkNpcTo') { walkNpcToCluster(a, b); cutscene.await = { type: 'walk', npc: a }; }
    else if (op === 'win') { winStage(a); cutscene = null; }
    else tickCutscene();
  }

  // ---------- movement ----------
  function walkHeroTo(x, worldY, onArrive) {
    hero.target = { x, worldY }; hero.onArrive = onArrive || null; hero.moving = true; hero.sitting = false;
  }
  function approachOf(o, m) {
    const x = (o._x !== undefined) ? o._x : objPos(o, m).x;     // use live pos for moving NPCs
    const wy = (o._wy !== undefined) ? o._wy : objPos(o, m).worldY;
    const side = x < m.vw / 2 ? 1 : -1;       // stand toward the open center
    return { x: x + side * 34, worldY: wy + 4 };
  }
  function walkNpcToCluster(id, clId) {
    const n = npcs[id]; if (!n) return;
    const m = metrics(); const p = clusterPoint(clId, m);
    const off = clId === 'me_desk' ? 70 : 0;
    n.target = { x: p.x + (p.x < m.vw / 2 ? off : -off), worldY: p.worldY + 10 };
    n.moving = true; n.state = 'goto';
    n.onArrive = () => { n.state = 'parked'; };  // stay put where the script left us
  }
  // move e toward (tx,ty) without nulling target or firing callbacks; returns remaining dist
  function moveToward(e, tx, ty, dt) {
    const dx = tx - e.x, dy = ty - e.worldY, d = Math.hypot(dx, dy);
    if (d > 0.001) {
      const v = SPEED * dt, k = Math.min(1, v / d);
      e.x += dx * k; e.worldY += dy * k; e.facing = dx < 0 ? -1 : 1; e.moving = true;
      e.animT += dt; if (e.animT > 0.14) { e.animT = 0; e.frame = e.frame === 1 ? 3 : 1; }
    }
    return d;
  }
  function stepMover(e, dt) {
    if (!e.target) { e.moving = false; return; }
    const dx = e.target.x - e.x, dy = e.target.worldY - e.worldY;
    const d = Math.hypot(dx, dy);
    if (d < 4) {
      e.x = e.target.x; e.worldY = e.target.worldY; e.target = null; e.moving = false; e.frame = 0;
      const cb = e.onArrive; e.onArrive = null; if (cb) cb();
      return;
    }
    const v = SPEED * dt, k = Math.min(1, v / d);
    e.x += dx * k; e.worldY += dy * k;
    e.facing = dx < 0 ? -1 : 1;
    e.animT += dt; if (e.animT > 0.14) { e.animT = 0; e.frame = e.frame === 1 ? 3 : 1; }
  }

  // ---------- interaction ----------
  function interactiveObjects() {
    return W.objects.filter(o => {
      if (o.kind === 'item' && removed.has(o.id)) return false;
      if (o.kind === 'npc' && npcs[o.id] && !npcs[o.id].visible) return false;
      return true;
    });
  }
  function hitTest(mx, my, m) {
    let best = null, bestY = -Infinity;
    for (const o of interactiveObjects()) {
      let p;
      if (o.kind === 'npc' && npcs[o.id]) p = { x: npcs[o.id].x, worldY: npcs[o.id].worldY };
      else p = objPos(o, m);
      const sy = p.worldY - cam.y;
      if (sy < -60 || sy > m.vh + 60) continue;
      const w = o.w || 40, h = o.h || 40;
      const top = o.kind === 'item' ? sy - h / 2 : sy - h;
      const bot = o.kind === 'item' ? sy + h / 2 : sy + 10;
      if (mx >= p.x - w / 2 && mx <= p.x + w / 2 && my >= top && my <= bot) {
        if (p.worldY > bestY) { bestY = p.worldY; best = Object.assign({}, o, { _x: p.x, _wy: p.worldY }); }
      }
    }
    return best;
  }
  function doInteract(o) {
    const m = metrics();
    if (o.kind === 'item') { hero.facing = (o._x < hero.x ? -1 : 1); g.take(o.id); return; }
    hero.facing = (o._x < hero.x ? -1 : 1);
    if (o.onInteract) o.onInteract(g);
  }
  function doUse(src, o) {
    hero.facing = (o._x < hero.x ? -1 : 1);
    const ok = W.useCombo(src, o.id, g);
    if (!ok) g.refuse();
    if (!inv.includes(src)) held = null;
    if (held && !inv.includes(held)) held = null;
    renderInv();
  }
  function worldClick(mx, my) {
    const m = metrics();
    const hit = hitTest(mx, my, m);
    if (held) {
      if (hit) walkHeroTo(approachOf(hit, m).x, approachOf(hit, m).worldY, () => doUse(held, hit));
      else walkHeroTo(mx, my + cam.y);    // walk while holding
      return;
    }
    if (hit) {
      const ap = approachOf(hit, m);
      walkHeroTo(ap.x, ap.worldY, () => doInteract(hit));
    } else {
      walkHeroTo(mx, my + cam.y);
    }
  }

  // ---------- win ----------
  function winStage(path) {
    flags.lastPath = path; done = true; setFlag_internal('stageComplete'); save();
    const m = metrics();
    const rig = objById.chip_rig ? objPos(objById.chip_rig, m) : { x: hero.x, worldY: hero.worldY };
    walkHeroTo(rig.x + 22, rig.worldY + 24, () => {
      hero.sitting = true; hero.facing = -1;
      focus = 100; renderFocus();
      sayLines('me', ["Silence. Glorious, productive silence.", "Just me and my chip. Let's make some silicon history."]);
      setTimeout(() => showOverlay(path), 1400);
    });
  }
  function setFlag_internal(n) { flags[n] = true; }
  function showOverlay(path) {
    const ov = document.getElementById('oq-overlay');
    document.getElementById('oq-path').textContent = '✦ ' + (path || 'VICTORY') + ' ✦';
    ov.classList.add('on');
  }

  // ---------- focus / interruptions ----------
  function lowerFocus(n) { focus = Math.max(4, focus - n); renderFocus(); }
  function anyApproaching() {
    if (ambient) return true;
    for (const id in npcs) if (npcs[id].state === 'chase') return true;
    return false;
  }
  function maybeSchedule(now) {
    if (busy || done) return;
    if (anyApproaching()) return;          // one pest at a time
    if (now >= nextInterrupt) {
      nextInterrupt = now + 26000 + Math.random() * 16000;
      doInterruption(now);
    } else if (now >= nextManager) {
      nextManager = now + 34000 + Math.random() * 18000;
      doManagerNag(now);
    }
  }
  // A pest CHASES the hero (tracking their live position) and only speaks once it
  // catches up. The hero is never frozen and can keep walking / playing.
  function startChase(id, now, onCatch) {
    const n = npcs[id]; if (!n || !n.visible) return;
    n.state = 'chase'; n.chaseUntil = now + 13000; n.onCatch = onCatch;
  }
  function doInterruption(now) {
    const pool = ['devA', 'devB', 'devC'].filter(id => objById[id] && npcs[id] && npcs[id].visible && npcs[id].state === 'idle');
    if (!pool.length) return;
    const id = g.pick(pool);
    const line = g.pick(W.interruptions);
    const reply = g.pick(["...sure. Adding it to the pile.", "Cool cool cool. Totally not derailing my real work.", "Sure. Right after I finish ignoring it.", "Mm. Straight onto the backlog where dreams go to die."]);
    startChase(id, now, () => {
      ambientSay(id, line, TALK_MS);            // pest holds still while this is readable...
      ambientSay('me', reply, 2600);            // ...then the hero's reply (queued, non-blocking)
      lowerFocus(13);
    });
  }
  function doManagerNag(now) {
    if (!npcs.manager || !npcs.manager.visible || npcs.manager.state !== 'idle') return;
    const line = g.pick([
      "Less side-projects, more synergy, yeah?",
      "What's the ETA on the thing? The main thing. You know the thing.",
      "Love the passion. Now point it at the backlog.",
      "Did you sync with the team about syncing?",
    ]);
    startChase('manager', now, () => { ambientSay('manager', line, TALK_MS); lowerFocus(10); });
  }

  // ---------- ambient (non-blocking) bubbles — a small sequential queue ----------
  function ambientSay(sp, text, ms) { ambientQueue.push({ speaker: sp, text, ms }); if (!ambient) startNextAmbient(); }
  function startNextAmbient() {
    const e = document.getElementById('oq-ambient'); if (e) e.remove();
    if (!ambientQueue.length) { ambient = null; return; }
    const it = ambientQueue.shift();
    ambient = { speaker: it.speaker, text: it.text, until: performance.now() + it.ms };
    const info = speakerInfo(ambient.speaker);
    const b = document.createElement('div');
    b.id = 'oq-ambient'; b.className = 'oq-bubble';
    b.style.setProperty('--oq-col', info.color || C.blue);
    b.innerHTML = '<span class="oq-name">' + info.name + '</span>' + escapeHtml(ambient.text);
    document.body.appendChild(b);
    positionAmbient();
  }
  function positionAmbient() {
    if (!ambient) return;
    if (performance.now() > ambient.until) { startNextAmbient(); if (!ambient) return; }
    const b = document.getElementById('oq-ambient'); if (!b) return;
    const m = metrics();
    let sx, sy;
    if (ambient.speaker === 'me') { sx = hero.x; sy = hero.worldY - cam.y - 78; }
    else { const n = npcs[ambient.speaker]; sx = n ? n.x : m.vw / 2; sy = n ? n.worldY - cam.y - 78 : 90; }
    sx = Math.max(120, Math.min(m.vw - 120, sx));
    sy = Math.max(70, Math.min(m.vh - 30, sy));
    b.style.left = sx + 'px'; b.style.top = sy + 'px';
  }

  // ---------- rendering ----------
  function bgGradient(m) {
    const grd = ctx.createLinearGradient(0, 0, 0, m.vh);
    grd.addColorStop(0, '#0a0c1c'); grd.addColorStop(1, '#050510');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, m.vw, m.vh);
  }
  function drawIconAt(id, sx, sy, s) {
    const fn = art.ICON[id]; if (!fn) return;
    fn(art.makePx(ctx, sx - 8 * s, sy - 8 * s, s));
  }
  function drawItemOnMap(o, sx, sy) {
    const s = o.s || 3;
    const bob = Math.sin(performance.now() / 400 + o.dx) * 3;
    // glow disc
    ctx.save();
    ctx.globalAlpha = 0.25 + 0.15 * (1 + Math.sin(performance.now() / 350));
    ctx.fillStyle = C.blue;
    ctx.beginPath(); ctx.ellipse(sx, sy, 16, 7, 0, 0, 7); ctx.fill();
    ctx.restore();
    drawIconAt(o.icon, sx, sy + bob, s);
  }
  function renderWorld(m) {
    bgGradient(m);
    art.drawFloorRegion(ctx, 0, 0, m.vw, m.vh, cam.y);

    // collect drawables
    const draw = [];
    for (const d of W.decor) {
      const ax = d.anchor === 'left' ? d.dx : d.anchor === 'right' ? m.vw - d.dx : m.vw / 2 + d.dx;
      const wy = d.band * m.docH;
      draw.push({ kind: 'prop', prop: d.prop, x: ax, sy: wy - cam.y, wy, s: d.s || 3, faint: true });
    }
    for (const o of interactiveObjects()) {
      if (o.kind === 'npc') continue;
      const p = objPos(o, m);
      draw.push({ kind: o.kind, o, x: p.x, sy: p.worldY - cam.y, wy: p.worldY, s: o.s || 3 });
    }
    for (const id in npcs) {
      const n = npcs[id]; if (!n.visible) continue;
      draw.push({ kind: 'npc', id, x: n.x, sy: n.worldY - cam.y, wy: n.worldY, n });
    }
    draw.push({ kind: 'hero', x: hero.x, sy: hero.worldY - cam.y, wy: hero.worldY });

    draw.sort((a, b) => a.wy - b.wy);
    for (const d of draw) {
      if (d.sy < -120 || d.sy > m.vh + 80) continue;
      if (d.kind === 'prop') {
        if (d.faint) ctx.globalAlpha = 0.9;
        const fn = art.PROP[d.prop || (d.o && d.o.prop)];
        if (fn) fn(ctx, d.x, d.sy, d.s, d.o && d.o.state);
        ctx.globalAlpha = 1;
      } else if (d.kind === 'item') {
        drawItemOnMap(d.o, d.x, d.sy);
      } else if (d.kind === 'npc') {
        const col = OQ.COL[objById[d.id].col] || OQ.COL.dev1;
        art.drawPerson(ctx, d.x, d.sy, objById[d.id].s ? objById[d.id].s / 1.05 : 3.2, col, d.n.frame, d.n.facing);
      } else if (d.kind === 'hero') {
        const fr = hero.sitting ? 0 : hero.frame;
        art.drawPerson(ctx, d.x, d.sy, 3.3, OQ.COL.me, fr, hero.facing);
      }
    }

    // dim the content column so the map is faint there, vivid in margins
    ctx.fillStyle = 'rgba(5,6,18,0.6)';
    ctx.fillRect(m.colLeft, 0, m.colW, m.vh);

    // held item follows cursor (only meaningful over the canvas/margins)
    if (held && mouse.onCanvas) drawIconAt(held, mouse.x, mouse.y, 3);

    // hover ring on interactable
    if (hover && !held) {
      const o = objById[hover];
      if (o) {
        let p = (o.kind === 'npc' && npcs[o.id]) ? { x: npcs[o.id].x, worldY: npcs[o.id].worldY } : objPos(o, m);
        const sx = p.x, sy = p.worldY - cam.y;
        ctx.strokeStyle = C.pink; ctx.lineWidth = 1; ctx.globalAlpha = 0.6;
        const h = (o.w || 40);
        ctx.strokeRect(sx - h / 2, sy - (o.kind === 'item' ? h / 2 : (o.h || 40)), h, o.kind === 'item' ? h : (o.h || 40) + 8);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ---------- HUD ----------
  function renderInv() {
    const el = document.getElementById('oq-inv'); if (!el) return;
    el.innerHTML = '';
    document.getElementById('oq-invlabel').style.display = inv.length ? 'block' : 'none';
    for (const id of inv) {
      const slot = document.createElement('div');
      slot.className = 'oq-slot' + (held === id ? ' held' : '');
      const cv = document.createElement('canvas'); cv.width = 46; cv.height = 46;
      const c2 = cv.getContext('2d');
      const fn = art.ICON[id]; if (fn) fn(art.makePx(c2, 23 - 8 * 2.5, 23 - 8 * 2.5, 2.5));
      slot.appendChild(cv);
      slot.title = itemName(id);
      slot.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (busy) { if (curBubble) dismissBubble(); return; }
        if (held && held !== id) { const ok = W.useCombo(held, id, g); if (!ok) g.refuse(); if (!inv.includes(held)) held = null; renderInv(); return; }
        held = (held === id) ? null : id; renderInv();
      });
      slot.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); sayLines('me', lookText(id)); });
      el.appendChild(slot);
    }
  }
  function itemName(id) { const o = objById[id]; return (o && o.name) || NAMES[id] || id; }
  function lookText(id) { const o = objById[id]; return (o && o.look) || "It's " + itemName(id) + ". It exists. Profound."; }
  function renderFocus() {
    const f = document.getElementById('oq-focusfill'); if (f) f.style.width = focus + '%';
  }
  function renderBubble() {
    const old = document.getElementById('oq-bubble'); if (old) old.remove();
    if (!curBubble) return;
    const sp = speakerInfo(curBubble.speaker);
    const b = document.createElement('div');
    b.id = 'oq-bubble'; b.className = 'oq-bubble' + (curBubble.opts && curBubble.opts.squeak ? ' squeak' : '');
    b.style.setProperty('--oq-col', sp.color || C.blue);
    b.innerHTML = '<span class="oq-name">' + sp.name + '</span>' + escapeHtml(curBubble.text) +
      ((bubbleQueue.length || cutscene) ? '<span class="oq-more">▸</span>' : '');
    document.body.appendChild(b);
    positionBubble();
  }
  function positionBubble() {
    const b = document.getElementById('oq-bubble'); if (!b || !curBubble) return;
    const m = metrics();
    let sx = m.vw / 2, sy = 90;
    const sid = curBubble.speaker;
    if (sid === 'me') { sx = hero.x; sy = hero.worldY - cam.y - 78; }
    else if (npcs[sid] && npcs[sid].visible) { sx = npcs[sid].x; sy = npcs[sid].worldY - cam.y - 78; }
    else if (objById[sid]) { const p = objPos(objById[sid], m); sx = p.x; sy = p.worldY - cam.y - 78; }
    sx = Math.max(120, Math.min(m.vw - 120, sx));
    sy = Math.max(70, Math.min(m.vh - 30, sy));
    b.style.left = sx + 'px'; b.style.top = sy + 'px';
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  function renderStatus() {
    const el = document.getElementById('oq-status'); if (!el) return;
    if (busy) { el.innerHTML = ''; return; }
    if (held) {
      const tgt = hover ? itemName(hover) : '…';
      el.innerHTML = '<span class="oq-verb">Use</span> ' + escapeHtml(itemName(held)) + ' <span class="oq-verb">with</span> ' + escapeHtml(tgt);
    } else if (hover) {
      const o = objById[hover];
      const verb = o.kind === 'item' ? 'Pick up' : o.kind === 'npc' ? (o.verb || 'Talk to') : (o.verb || 'Use');
      el.innerHTML = '<span class="oq-verb">' + verb + '</span> ' + escapeHtml(o.name);
    } else { el.innerHTML = ''; }
  }

  // ---------- toast ----------
  function toast(text, ms) {
    const t = document.createElement('div'); t.className = 'oq-toast'; t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 600); }, ms || 5200);
  }

  // ---------- main loop ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    const m = metrics();
    cam.y = window.scrollY || window.pageYOffset || 0;

    // movers
    if (!busy || hero.target) stepMover(hero, dt);
    for (const id in npcs) {
      const n = npcs[id];
      const home = objPos(objById[id], m);
      if (n.state === 'goto') {
        stepMover(n, dt);                                  // scripted cutscene walk
      } else if (n.state === 'parked') {
        // stay exactly where the script left us; only "wake up" once we're home
        if (Math.hypot(home.x - n.x, home.worldY - n.worldY) <= 6) { n.x = home.x; n.worldY = home.worldY; n.state = 'idle'; }
      } else if (n.state === 'chase') {
        // keep walking toward the (possibly moving) hero — never force the hero to stop
        const d = moveToward(n, hero.x, hero.worldY, dt);
        if (d < 46) {                                      // caught up → stop, face hero, deliver
          n.moving = false; n.frame = 0; n.facing = hero.x < n.x ? -1 : 1;
          n.state = 'talk'; n.talkUntil = now + TALK_MS;
          const cb = n.onCatch; n.onCatch = null; if (cb) cb();
        } else if (now > n.chaseUntil) { n.state = 'return'; }
      } else if (n.state === 'talk') {
        // stand still, bubble readable; face the hero; only return once the hold elapses
        n.moving = false; n.frame = 0; n.facing = hero.x < n.x ? -1 : 1;
        if (now > n.talkUntil) n.state = 'return';
      } else if (n.state === 'return') {
        const d = moveToward(n, home.x, home.worldY, dt);  // walk back home (no teleport)
        if (d < 4) { n.x = home.x; n.worldY = home.worldY; n.moving = false; n.frame = 0; n.state = 'idle'; }
      } else {                                             // idle
        if (Math.hypot(home.x - n.x, home.worldY - n.worldY) > 6) { n.state = 'return'; }
        else { n.x = home.x; n.worldY = home.worldY; n.moving = false; n.frame = 0; }
      }
    }

    // camera follow while hero auto-walks (unless user just scrolled)
    if (hero.moving && now - lastUserScroll > 1000) {
      const want = Math.max(0, Math.min(m.maxScroll, hero.worldY - m.vh * 0.5));
      const cur = window.scrollY;
      if (Math.abs(want - cur) > 2) window.scrollTo(0, cur + (want - cur) * 0.09);
    }

    // focus regen
    if (!busy && !done && focus < 100) { focus = Math.min(100, focus + dt * 3.5); renderFocus(); }

    tickCutscene();
    maybeSchedule(now);

    renderWorld(m);
    positionBubble();
    positionAmbient();
    canvas.style.cursor = held ? 'crosshair' : (hover ? 'pointer' : 'default');
    requestAnimationFrame(frame);
  }

  function setBusy(v) {
    busy = v;
    const cat = document.getElementById('oq-catcher');
    if (cat) cat.classList.toggle('on', v);
    if (v) hover = null;
  }

  // ---------- input ----------
  function relMouse(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }
  function onMove(ev) {
    const p = relMouse(ev); mouse.x = p.x; mouse.y = p.y;
    mouse.onCanvas = (document.elementFromPoint(ev.clientX, ev.clientY) === canvas);
    if (busy) { hover = null; return; }
    if (mouse.onCanvas) { const h = hitTest(p.x, p.y, metrics()); hover = h ? h.id : null; }
    else hover = null;
    renderStatus();
  }
  function onDown(ev) {
    if (ev.target && ev.target.closest && ev.target.closest('#oq-inv,#oq-overlay')) return;
    if (busy) { if (curBubble) dismissBubble(); return; }
    if (ev.target !== canvas) return;        // only margins/gaps reach the game
    const p = relMouse(ev); worldClick(p.x, p.y);
  }
  function onContext(ev) {
    if (busy || ev.target !== canvas) return;
    const p = relMouse(ev); const h = hitTest(p.x, p.y, metrics());
    if (h) { ev.preventDefault(); hero.facing = (h._x < hero.x ? -1 : 1); sayLines('me', h.look || lookText(h.id)); }
  }
  function onScrollIntent() { lastUserScroll = performance.now(); }

  // ---------- resize ----------
  function resize() {
    const m = metrics();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = m.vw * DPR; canvas.height = m.vh * DPR;
    canvas.style.width = m.vw + 'px'; canvas.style.height = m.vh + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  // ---------- boot ----------
  function boot() {
    art = OQ.art; C = OQ.C; W = OQ.world;
    if (!art || !W) { console.warn('[OfficeQuest] assets missing'); return; }
    W.objects.forEach(o => { objById[o.id] = o; if (o.state === undefined && o.kind === 'prop') o.state = {}; });

    if (location.search.indexOf('oqreset') >= 0) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

    // DOM scaffold
    canvas = document.createElement('canvas'); canvas.id = 'oq-canvas';
    document.body.insertBefore(canvas, document.body.firstChild);
    ctx = canvas.getContext('2d');
    const mk = (id, cls) => { const d = document.createElement('div'); d.id = id; if (cls) d.className = cls; document.body.appendChild(d); return d; };
    mk('oq-catcher');
    mk('oq-status');
    const invl = mk('oq-invlabel'); invl.textContent = 'INVENTORY';
    mk('oq-inv');
    const fw = mk('oq-focuswrap'); fw.innerHTML = 'FOCUS<div id="oq-focusbar"><div id="oq-focusfill"></div></div>';
    const ov = mk('oq-overlay');
    ov.innerHTML = '<div class="oq-card"><h2>STAGE 1 COMPLETE</h2><div class="oq-path" id="oq-path"></div>' +
      '<p>You bought yourself <b>four glorious minutes</b> of uninterrupted focus.<br><br>' +
      'The chip hums. The office holds its breath.<br><span style="opacity:.6">(the office always resets eventually…)</span></p>' +
      '<button id="oq-close">BACK TO THE GRIND</button></div>';
    ov.addEventListener('click', e => { if (e.target.id === 'oq-close' || e.target === ov) ov.classList.remove('on'); });

    resize();

    // init NPCs
    const m0 = metrics();
    W.objects.filter(o => o.kind === 'npc').forEach(o => {
      const p = objPos(o, m0);
      npcs[o.id] = { x: p.x, worldY: p.worldY, facing: -1, frame: 0, animT: 0, target: null, onArrive: null, moving: false, state: 'idle', onCatch: null, chaseUntil: 0, talkUntil: 0, visible: true };
    });
    // hero start
    const hs = W.heroStart; const hp = clusterPoint(hs.cluster, m0);
    hero.x = hp.x + (hs.dx || 0); hero.worldY = hp.worldY + (hs.dy || 0);

    const hadSave = load();
    renderInv(); renderFocus();

    // listeners
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('contextmenu', onContext);
    window.addEventListener('wheel', onScrollIntent, { passive: true });
    window.addEventListener('touchmove', onScrollIntent, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && held) { held = null; renderInv(); }
      if ([' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) onScrollIntent();
    });

    nextInterrupt = performance.now() + 17000;
    nextManager = performance.now() + 999999;   // first nag comes from the intro

    // intro (first visit only, and not already solved)
    if (!hadSave && !done) {
      setTimeout(() => {
        toast("psst… something stirs in the background. poke around the edges of the page. (right-click = look, click items to use)", 8000);
      }, 900);
      setTimeout(introScene, 4200);
    } else {
      nextManager = performance.now() + 30000;
      if (done) toast("Stage 1 already solved. (add ?oqreset to the URL to replay)", 6000);
    }

    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  function introScene() {
    if (done) return;
    startCutscene([
      ['walkNpcTo', 'manager', 'me_desk'],
      ['say', 'manager', "Morning! Quick refocus: less personal projects, more synergy. Mkay? Mkay."],
      ['me', ["He does this every nine minutes. My chip will never get built.", "I need to get Manager OFF MY BACK. I can think of three ways… all of them deeply stupid. Perfect."]],
      ['walkNpcTo', 'manager', 'manager_office'],
      ['fn', () => { nextManager = performance.now() + 30000; }],
    ]);
  }

  OQ.reset = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} location.reload(); };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
