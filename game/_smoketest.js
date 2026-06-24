/* Headless smoke test: stubs DOM/canvas, boots a fresh game per path, and drives
 * each of the three solution paths end-to-end. Not shipped. Run: node game/_smoketest.js */
const fs = require('fs');
const vm = require('vm');
const SRC = ['sprites.js', 'world.js', 'engine.js'].map(f => ({ f, code: fs.readFileSync(__dirname + '/' + f, 'utf8') }));

const ctxProxy = () => new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient') return () => ({ addColorStop() {} });
    if (typeof t[k] === 'undefined') return () => {};
    return t[k];
  },
  set() { return true; },
});

function makeGame() {
  const registry = {}; const listeners = {}; const store = {};
  let bubbleEl = null; let rafCb = null; let fakeNow = 1000; let sawAmbient = false;
  const ctx = ctxProxy();
  class El {
    constructor(tag) {
      this.tag = tag; this.children = []; this._id = null; this._cls = new Set();
      this.style = new Proxy({}, { set: () => true, get: (t, k) => (k === 'setProperty' ? () => {} : t[k]) });
      this.classList = { add: c => this._cls.add(c), remove: c => this._cls.delete(c), toggle: (c, v) => { v ? this._cls.add(c) : this._cls.delete(c); }, contains: c => this._cls.has(c) };
      this.width = 1280; this.height = 800; this.dataset = {};
    }
    set id(v) { this._id = v; if (v) registry[v] = this; }
    get id() { return this._id; }
    _reg() { if (this._id) registry[this._id] = this; if (this._id === 'oq-bubble') bubbleEl = this; if (this._id === 'oq-ambient') sawAmbient = true; }
    appendChild(c) { this.children.push(c); if (c && c._reg) c._reg(); return c; }
    insertBefore(c) { this.children.unshift(c); if (c && c._reg) c._reg(); return c; }
    addEventListener() {} removeEventListener() {}
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 800 }; }
    getContext() { return ctx; }
    remove() { if (this._id) delete registry[this._id]; if (this === bubbleEl) bubbleEl = null; }
    closest() { return null; }
    set innerHTML(v) { this._html = v; } get innerHTML() { return this._html || ''; }
    set textContent(v) { this._txt = v; } get textContent() { return this._txt || ''; }
    querySelector() { return null; }
  }
  const body = new El('body');
  const document = {
    readyState: 'complete', documentElement: { scrollHeight: 2600 }, body,
    createElement: tag => new El(tag), getElementById: id => registry[id] || null,
    querySelector: () => null, elementFromPoint: () => registry['oq-canvas'] || null,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  };
  const win = {
    innerWidth: 1280, innerHeight: 800, scrollY: 0, pageYOffset: 0, devicePixelRatio: 1,
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener: () => {},
    scrollTo: (x, y) => { win.scrollY = y; win.pageYOffset = y; },
    requestAnimationFrame: cb => { rafCb = cb; return 1; },
    performance: { now: () => fakeNow },
    location: { search: '', reload() {} },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    setTimeout: () => 0, console,
  };
  win.window = win; win.document = document;
  const sandbox = Object.assign({}, win, { window: win, document, performance: win.performance, location: win.location, localStorage: win.localStorage, requestAnimationFrame: win.requestAnimationFrame, setTimeout: win.setTimeout, console, Math, Date, JSON, Array, Object, String, Number, Boolean });
  vm.createContext(sandbox);
  SRC.forEach(s => vm.runInContext(s.code, sandbox, { filename: s.f }));
  const OQ = sandbox.window.OfficeQuest;
  const canvas = registry['oq-canvas'];
  const dispatch = (type, ev) => (listeners[type] || []).forEach(fn => fn(ev));
  function runFrames(n) {
    for (let i = 0; i < n; i++) {
      fakeNow += 40; if (rafCb) rafCb(fakeNow);
      if (bubbleEl) dispatch('pointerdown', { target: canvas, clientX: 100, clientY: 100, closest: () => null });
    }
  }
  return { OQ, runFrames, sawAmbient: () => sawAmbient };
}

let failed = false;
function assert(c, m) { if (!c) { failed = true; console.error('  ✗ ' + m); } else console.log('  ✓ ' + m); }

function pathA() {
  console.log('Path A — Rubber Duck Crisis:');
  const { OQ, runFrames } = makeGame(); const g = OQ.g;
  runFrames(8);
  g.take('rubber_duck'); assert(g.has('rubber_duck'), 'pick up duck');
  OQ.world.useCombo('rubber_duck', 'toilet', g); assert(g.flag('duckFlushed') && !g.has('rubber_duck'), 'flush duck');
  g.take('marker'); g.take('sticky_note');
  OQ.world.useCombo('marker', 'sticky_note', g); assert(g.flag('noteWritten'), 'write note');
  OQ.world.useCombo('sticky_note', 'manager_desk', g); assert(g.flag('notePlaced'), 'place note');
  runFrames(40); OQ.talkToManager(g); runFrames(700);
  assert(g.flag('stageComplete'), 'WIN: stage complete');
}
function pathB() {
  console.log('Path B — Forgotten Anniversary:');
  const { OQ, runFrames } = makeGame(); const g = OQ.g;
  runFrames(8);
  // try phone before intel -> should NOT win
  g.take('helium_balloon');
  OQ.world.useCombo('helium_balloon', 'office_phone', g);
  assert(!g.flag('stageComplete'), 'phone w/o intel does not win (gated)');
  assert(g.has('helium_balloon'), 'balloon retained when gated');
  // learn wife, then call
  OQ.g.obj('family_photo').onInteract(g); assert(g.flag('knowWife'), 'learn wife from photo');
  runFrames(30);
  OQ.world.useCombo('helium_balloon', 'office_phone', g); runFrames(700);
  assert(g.flag('stageComplete'), 'WIN: stage complete');
}
function pathC() {
  console.log('Path C — Eternal Free-Pizza Standup:');
  const { OQ, runFrames } = makeGame(); const g = OQ.g;
  runFrames(8);
  g.take('pizza');
  OQ.world.useCombo('pizza', 'meeting_door', g); assert(g.flag('pizzaPlaced'), 'place pizza in room');
  OQ.world.useCombo('marker', 'room_sign', g); assert(g.flag('signFlipped'), 'flip sign to IN SESSION');
  runFrames(40); OQ.talkToManager(g); runFrames(800);
  assert(g.flag('stageComplete'), 'WIN: stage complete');
}
function misc() {
  console.log('Misc — refuse + look + save/load:');
  const { OQ, runFrames } = makeGame(); const g = OQ.g;
  runFrames(8);
  g.take('marker');
  const bad = OQ.world.useCombo('marker', 'fridge', g);
  assert(bad === false, 'nonsense combo returns false (engine refuses)');
  assert(typeof g.obj('toilet').look === 'string', 'objects have look text');
  assert(OQ.world.interruptions.length > 8, 'plenty of absurd interruptions');
  runFrames(8); assert(true, 'renders after actions without throwing');
}

function chase() {
  console.log('Bug #2 — non-blocking chase + ambient bubble:');
  const { OQ, runFrames, sawAmbient } = makeGame(); const g = OQ.g;
  // run idle long enough for the scheduler to fire an interruption (~17s)
  runFrames(700);
  assert(sawAmbient(), 'a colleague chased the hero and popped a NON-blocking bubble');
  assert(!g.flag('stageComplete'), 'idle interruptions do not end the stage');
  runFrames(60); assert(true, 'continues rendering after the chase without throwing');
}

[pathA, pathB, pathC, misc, chase].forEach(fn => { try { fn(); } catch (e) { assert(false, fn.name + ' threw: ' + e.stack); } });
console.log(failed ? '\nRESULT: FAILURES ABOVE ✗' : '\nRESULT: ALL SMOKE CHECKS PASSED ✓');
process.exit(failed ? 1 : 0);
