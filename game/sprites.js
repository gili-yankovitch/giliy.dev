/* ============================================================================
 * OFFICE QUEST — sprites.js
 * Procedural pixel-art: everything is drawn with integer-pixel rects so it stays
 * crisp & pixelated at any scale. Exposes draw helpers + icon/prop/character
 * registries on window.OfficeQuest.art.
 * ==========================================================================*/
(function () {
  const OQ = (window.OfficeQuest = window.OfficeQuest || {});

  // ---- palette ------------------------------------------------------------
  const C = {
    out:   '#0b0b16', // outline / near-black
    dark:  '#15152a',
    navy:  '#232342',
    sh:    '#33334e', // shadow
    gray:  '#6a6a82',
    gray2: '#9a9ab2',
    white: '#ececf4',
    off:   '#c2c2d4',
    skin:  '#f3c79a', skinSh: '#cf9a68',
    hair:  '#2a1d12', grayHair: '#b9b9c4',
    blue:  '#00f3ff', blueD: '#0a8fb0',
    pink:  '#ff4df0', pinkD: '#b81fae',
    green: '#39ff14', greenD: '#1f8a16',
    red:   '#ff4d5e', redD:  '#b8273a',
    org:   '#ff9b3d', orgD:  '#d2701f',
    yel:   '#ffe14d', yelD:  '#d6a81f',
    card:  '#c89b5e', cardD: '#8a6536',
    plant: '#3fae5a', plantD:'#237a3a',
    teal:  '#1fb6a6', tealD: '#128276',
    glass: '#bfe9ff', glassD:'#6fb6d8',
    wood:  '#a9763f', woodD: '#7a4f24',
    steel: '#8a93a6', steelD:'#5b6273',
    purple:'#9a6cff',
    floorA:'#1d2236', floorB:'#222a44', floorEdge:'#2f3a5e',
    wall:  '#272f4e', wallTop:'#39456f',
  };
  OQ.C = C;

  // px helper bound to an origin + scale; draws in local "art pixels"
  function makePx(ctx, ox, oy, s) {
    return function (x, y, w, h, color) {
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect((ox + x * s) | 0, (oy + y * s) | 0, Math.ceil(w * s), Math.ceil(h * s));
    };
  }

  // ---- isometric primitives ----------------------------------------------
  const TILE_W = 64, TILE_H = 32;

  function isoDiamond(ctx, cx, cy, w, h, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  // robust iso box: footprint half-widths in screen px (ex along +x/-y, dy along +x/+y)
  function drawIsoBoxSimple(ctx, cx, baseY, ex, ey, hh, top, left, right) {
    // ground rhombus corners (baseY is the front-bottom vertex)
    const back  = { x: cx,        y: baseY - ey - ex };
    const rightP= { x: cx + ex,   y: baseY - ex };
    const front = { x: cx,        y: baseY };
    const leftP = { x: cx - ex,   y: baseY - ex };
    // shift so ey controls depth properly: use separate
    const topShift = hh;
    const t = (p) => ({ x: p.x, y: p.y - topShift });
    // left face
    ctx.fillStyle = left;
    poly(ctx, [leftP, front, t(front), t(leftP)]);
    // right face
    ctx.fillStyle = right;
    poly(ctx, [front, rightP, t(rightP), t(front)]);
    // top face
    ctx.fillStyle = top;
    poly(ctx, [t(back), t(rightP), t(front), t(leftP)]);
  }
  function poly(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  // soft shadow ellipse under feet
  function shadow(ctx, cx, cy, rx, ry) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- characters (procedural blocky humanoid) ----------------------------
  // colors: {skin, hair, shirt, shirtSh, pants, shoe, accent}
  // frame: 0 idle, walk frames cycle; facing: -1 left, 1 right
  function drawPerson(ctx, cx, footY, s, col, frame, facing) {
    facing = facing || 1;
    const px = makePx(ctx, cx - 6 * s, footY - 20 * s, s); // 12x20 grid, feet at bottom-center
    const bob = (frame === 1 || frame === 3) ? 1 : 0;
    const o = bob; // vertical bob
    shadow(ctx, cx, footY, 7 * s, 2.6 * s);
    // legs (animate)
    const legSwing = frame === 1 ? 1 : frame === 3 ? -1 : 0;
    px(4, 15 + o, 2, 5, col.pants);          // left leg
    px(6, 15 + o, 2, 5, col.pants);          // right leg
    px(4 - (legSwing > 0 ? 1 : 0), 19 + o, 2.5, 1.5, col.shoe);
    px(6 + (legSwing < 0 ? 1 : 0), 19 + o, 2.5, 1.5, col.shoe);
    // torso
    px(3, 9 + o, 6, 6, col.shirt);
    px(3, 9 + o, 2, 6, col.shirtSh);         // shaded side
    px(3, 9 + o, 6, 1, col.shirtSh);
    // accent (tie / hoodie strings)
    if (col.accent) px(5, 9 + o, 2, 4, col.accent);
    // arms
    px(2, 9 + o, 1.5, 5, col.shirtSh);
    px(8.5, 9 + o, 1.5, 5, col.shirt);
    px(2, 13.5 + o, 1.5, 1.5, col.skin);     // hands
    px(8.5, 13.5 + o, 1.5, 1.5, col.skin);
    // head
    px(3.5, 2 + o, 5, 6, col.skin);
    px(3.5, 2 + o, 1.5, 6, col.skinSh);
    // eyes (toward facing)
    const ex = facing > 0 ? 6.2 : 4.3;
    px(ex, 4.5 + o, 0.9, 1.1, C.out);
    px(facing > 0 ? 5 : 6.1, 4.5 + o, 0.9, 1.1, C.out);
    // hair
    px(3, 1 + o, 6, 2.2, col.hair);
    px(3, 1 + o, 1.5, 4, col.hair);
    px(7.5, 1 + o, 1.5, 3, col.hair);
    // optional headphones
    if (col.headphones) {
      px(2.6, 2 + o, 1.3, 3, C.out);
      px(8.1, 2 + o, 1.3, 3, C.out);
      px(3, 0.4 + o, 6, 1, C.out);
    }
  }

  // worker palettes for the ambient open-plan crowd
  const WORKER_COLS = [
    { skin:'#f3c79a', skinSh:'#cf9a68', hair:'#2a1d12', shirt:C.teal,  shirtSh:C.tealD,  pants:C.navy, shoe:C.out },
    { skin:'#e7b486', skinSh:'#c08a55', hair:'#1a1a1a', shirt:C.org,   shirtSh:C.orgD,   pants:C.dark, shoe:C.out },
    { skin:'#f3c79a', skinSh:'#cf9a68', hair:'#3a2a44', shirt:C.pink,  shirtSh:C.pinkD,  pants:C.dark, shoe:C.out },
    { skin:'#d9a06a', skinSh:'#b07840', hair:'#101010', shirt:C.green, shirtSh:C.greenD, pants:C.navy, shoe:C.out },
    { skin:'#f3c79a', skinSh:'#cf9a68', hair:'#6a4a2a', shirt:C.purple,shirtSh:'#6a3fdf', pants:C.dark, shoe:C.out },
    { skin:'#e7b486', skinSh:'#c08a55', hair:'#5a3a1a', shirt:C.blue,  shirtSh:C.blueD,  pants:C.steelD, shoe:C.out },
    { skin:'#f0c0a0', skinSh:'#cf9a68', hair:'#7a2a2a', shirt:C.yel,   shirtSh:C.yelD,   pants:C.navy, shoe:C.out },
  ];

  // ---- item icons (drawn in a 16x16 logical box) --------------------------
  const ICON = {
    rubber_duck(px) {
      px(4, 9, 8, 4, C.yel); px(5, 12, 7, 2, C.yelD);     // body
      px(9, 4, 5, 5, C.yel); px(9, 4, 5, 1, C.yelD);      // head
      px(13, 6, 3, 2, C.org);                              // beak
      px(11, 6, 1.2, 1.4, C.out);                          // eye
      px(4, 9, 2, 3, C.yelD);                              // tail
    },
    helium_balloon(px) {
      px(4, 1, 8, 9, C.red); px(4, 1, 3, 9, '#ff7d8a');    // balloon
      px(9, 2, 2, 4, '#ffd0d6');                            // shine
      px(7.5, 9.5, 1, 1.5, C.redD);                         // knot
      px(8, 11, 0.6, 5, C.gray2);                           // string
    },
    pizza(px) {
      px(2, 11, 12, 4, C.card); px(2, 11, 12, 1, C.cardD); // box
      px(3, 6, 10, 6, C.org); px(3, 11, 10, 1, C.orgD);    // pizza
      px(5, 8, 1.4, 1.4, C.red); px(9, 7.4, 1.4, 1.4, C.red);
      px(7, 10, 1.4, 1.4, C.red); px(10.5, 9.5, 1.2, 1.2, C.red);
    },
    car_keys(px) {
      px(3, 3, 5, 5, C.steel); px(4, 4, 3, 3, C.dark);      // fob ring
      px(7, 5, 6, 2, C.steelD);                              // shaft
      px(11, 4, 2, 1.5, C.steelD); px(11, 7, 1.5, 1.5, C.steelD);
    },
    marker(px) {
      px(3, 11, 9, 3, C.blue); px(3, 11, 9, 1, '#7df6ff');  // body
      px(11, 11, 3, 3, C.dark);                              // cap/tip end
      px(2, 11.5, 1.5, 2, C.gray);                           // nib
    },
    sticky_note(px) {
      px(3, 3, 10, 10, C.yel); px(3, 3, 10, 1.4, C.yelD);
      px(5, 6, 6, 0.9, C.cardD); px(5, 8, 6, 0.9, C.cardD); px(5, 10, 4, 0.9, C.cardD);
    },
    standup_sign(px) {
      px(2, 2, 12, 9, C.white); px(2, 2, 12, 2, C.red);     // header
      px(4, 5, 8, 1, C.out); px(4, 7, 8, 1, C.out); px(4, 9, 5, 1, C.out);
      px(7, 11, 1, 4, C.gray);                               // stick
    },
  };

  // ---- props (stationary; drawn around an anchor in world px, scale s) -----
  // Each gets (ctx, cx, baseY, s) where baseY is the on-floor anchor (feet).
  const PROP = {
    desk_pc(ctx, cx, by, s) {
      shadow(ctx, cx, by, 22 * s, 6 * s);
      drawIsoBoxSimple(ctx, cx, by, 22 * s, 11 * s, 9 * s, C.wood, C.woodD, '#8c5e30');
      // monitor
      const mx = cx, mtop = by - 9 * s;
      const p = makePx(ctx, mx - 9 * s, mtop - 13 * s, s);
      p(2, 0, 14, 9, C.dark); p(3, 1, 12, 7, C.blue); p(3, 1, 12, 2, '#9ff7ff');
      p(8, 9, 2, 3, C.gray); p(5, 12, 8, 1.5, C.gray2); // stand
      // keyboard on desk
      const k = makePx(ctx, cx - 6 * s, by - 9 * s - 2 * s, s);
      k(0, 0, 12, 3, C.steelD);
    },
    chip_rig(ctx, cx, by, s) {
      shadow(ctx, cx, by, 16 * s, 5 * s);
      drawIsoBoxSimple(ctx, cx, by, 14 * s, 8 * s, 6 * s, C.navy, C.dark, '#1a1a30');
      const p = makePx(ctx, cx - 7 * s, by - 6 * s - 12 * s, s);
      p(1, 6, 12, 6, C.steelD);                  // breadboard base
      p(2, 7, 10, 1, C.green); p(2, 9, 10, 1, C.green); // traces
      p(4, 4, 6, 3, C.dark); p(5, 4.5, 4, 2, C.purple); // chip die under microscope
      p(6, 0, 2, 4, C.steel); p(5, 0, 4, 1.5, C.steel); // microscope arm
      p(3, 8, 1.5, 1.5, C.red); p(9, 8, 1.5, 1.5, C.yel); // blinky LEDs
    },
    chair(ctx, cx, by, s) {
      shadow(ctx, cx, by, 9 * s, 3 * s);
      drawIsoBoxSimple(ctx, cx, by, 9 * s, 9 * s, 4 * s, C.sh, C.dark, C.navy);
      const p = makePx(ctx, cx - 5 * s, by - 4 * s - 9 * s, s);
      p(0, 0, 10, 9, C.sh); p(0, 0, 2, 9, C.dark); // backrest
    },
    toilet(ctx, cx, by, s) {
      shadow(ctx, cx, by, 11 * s, 4 * s);
      const p = makePx(ctx, cx - 8 * s, by - 18 * s, s);
      p(2, 12, 12, 6, C.white); p(2, 17, 12, 1, C.off);  // bowl base
      p(3, 10, 10, 3, C.white);                           // seat
      p(4, 11, 8, 1.5, C.glass);                          // water
      p(11, 0, 5, 11, C.white); p(11, 0, 5, 1, C.off);    // tank
      p(13, 1, 1.5, 1.5, C.gray);                         // flush button
    },
    fridge(ctx, cx, by, s) {
      shadow(ctx, cx, by, 12 * s, 4 * s);
      const p = makePx(ctx, cx - 8 * s, by - 30 * s, s);
      p(1, 0, 14, 30, C.off); p(1, 0, 3, 30, C.gray2);
      p(1, 13, 14, 1, C.gray);                            // door split
      p(11, 5, 1.5, 5, C.steelD); p(11, 16, 1.5, 5, C.steelD); // handles
      p(3, 2, 4, 3, C.pink);                              // magnet/sticker
    },
    coffee_machine(ctx, cx, by, s) {
      shadow(ctx, cx, by, 9 * s, 3 * s);
      const p = makePx(ctx, cx - 6 * s, by - 18 * s, s);
      p(1, 0, 11, 18, C.dark); p(1, 0, 11, 2, C.steelD);
      p(3, 3, 7, 4, C.blue); p(3, 3, 7, 1, '#9ff7ff'); // screen
      p(3, 9, 6, 1, C.red); p(4, 12, 4, 4, C.steel);   // spout + cup
      p(4, 15, 4, 1.5, C.white);
    },
    printer(ctx, cx, by, s) {
      shadow(ctx, cx, by, 11 * s, 3 * s);
      const p = makePx(ctx, cx - 8 * s, by - 12 * s, s);
      p(0, 2, 16, 10, C.gray2); p(0, 2, 16, 2, C.gray);
      p(3, 0, 10, 3, C.white);                           // paper out
      p(2, 5, 4, 1.5, C.green); p(12, 5, 2, 1.5, C.red); // lights
    },
    plant(ctx, cx, by, s) {
      shadow(ctx, cx, by, 7 * s, 2.5 * s);
      const p = makePx(ctx, cx - 6 * s, by - 18 * s, s);
      p(3, 12, 6, 6, C.org); p(3, 12, 6, 1, C.yel);      // pot
      p(4, 3, 4, 9, C.plantD);                            // stalk
      p(1, 0, 5, 6, C.plant); p(6, 1, 5, 6, C.plant); p(3, 5, 6, 6, C.plant);
    },
    server_rack(ctx, cx, by, s) {
      shadow(ctx, cx, by, 12 * s, 4 * s);
      const p = makePx(ctx, cx - 8 * s, by - 34 * s, s);
      p(0, 0, 16, 34, C.dark); p(0, 0, 16, 34, C.dark);
      for (let i = 0; i < 8; i++) {
        p(2, 2 + i * 4, 12, 2.4, C.navy);
        p(3, 2.6 + i * 4, 1.2, 1.2, (i % 2 ? C.green : C.blue));
        p(11, 2.6 + i * 4, 1.2, 1.2, C.green);
      }
    },
    whiteboard(ctx, cx, by, s) {
      const p = makePx(ctx, cx - 14 * s, by - 22 * s, s);
      p(0, 0, 28, 18, C.white); p(0, 0, 28, 18, C.white);
      p(0, 0, 28, 1.5, C.gray2); p(0, 16.5, 28, 1.5, C.gray2);
      p(3, 4, 10, 1, C.blue); p(3, 7, 16, 1, C.red); p(3, 10, 8, 1, C.green);
      p(16, 4, 8, 6, C.pink);                            // a "chart"
      p(2, 18, 24, 2, C.steelD);                         // tray
    },
    family_photo(ctx, cx, by, s) {
      const p = makePx(ctx, cx - 6 * s, by - 12 * s, s);
      p(0, 0, 12, 11, C.wood); p(1, 1, 10, 9, C.glass);
      p(4, 4, 2, 5, C.teal); p(7, 4, 2, 5, C.pink);      // two figures
      p(4, 2.5, 2, 2, C.skin); p(7, 2.5, 2, 2, C.skin);
    },
    office_phone(ctx, cx, by, s) {
      const p = makePx(ctx, cx - 7 * s, by - 8 * s, s);
      p(0, 3, 14, 6, C.dark); p(0, 3, 14, 1, C.steelD); // base
      p(1, 4, 5, 4, C.steelD);                           // keypad
      p(8, 1, 6, 2.4, C.dark); p(7, 0.5, 1.6, 3, C.dark); p(13.5, 0.5, 1.6, 3, C.dark); // handset
    },
    meeting_door(ctx, cx, by, s) {
      const p = makePx(ctx, cx - 10 * s, by - 34 * s, s);
      p(0, 0, 20, 34, C.glassD);                          // glass door (translucent look)
      p(2, 1, 16, 32, C.glass);
      p(9, 1, 2, 32, C.steelD);                           // frame mullion
      p(13, 16, 2.4, 4, C.steel);                         // handle
    },
    room_sign(ctx, cx, by, s, state) {
      const p = makePx(ctx, cx - 7 * s, by - 8 * s, s);
      const on = state && state.flipped;
      p(0, 0, 14, 7, on ? C.red : C.green);
      p(0, 0, 14, 1.5, C.white);
      p(2, 3, 10, 1, C.white); p(2, 5, on ? 10 : 6, 1, C.white);
    },
    colleague_desk(ctx, cx, by, s) {
      shadow(ctx, cx, by, 20 * s, 6 * s);
      drawIsoBoxSimple(ctx, cx, by, 20 * s, 10 * s, 8 * s, '#7a5230', C.woodD, '#6b4828');
      const p = makePx(ctx, cx - 8 * s, by - 8 * s - 12 * s, s);
      p(2, 1, 12, 8, C.dark); p(3, 2, 10, 6, C.green); p(3, 2, 10, 1.5, '#a8ff9b'); // monitor
      p(7, 9, 2, 3, C.gray);
    },
    // a colleague seated at a desk, gently "typing" — populates the open plan
    worker_desk(ctx, cx, by, s) {
      const i = (Math.abs(Math.round(cx)) * 2654435761) >>> 0;
      const col = WORKER_COLS[i % WORKER_COLS.length];
      const typing = (Math.sin(performance.now() / 320 + (i % 9)) > 0.25) ? 1 : 0;
      const face = (i & 2) ? 1 : -1;
      // seated worker BEHIND the desk; desk + monitor (drawn after) occlude the legs/torso
      // so the head/shoulders clearly poke above the monitor.
      drawPerson(ctx, cx, by - 7 * s, s * 0.9, col, typing, face);
      shadow(ctx, cx, by, 20 * s, 6 * s);
      drawIsoBoxSimple(ctx, cx, by, 20 * s, 10 * s, 8 * s, '#7a5230', C.woodD, '#6b4828');
      const p = makePx(ctx, cx - 8 * s, by - 8 * s - 12 * s, s);
      const screens = [C.green, C.blue, C.pink, C.yel];
      const sc = screens[i % screens.length];
      p(2, 1, 12, 8, C.dark); p(3, 2, 10, 6, sc); p(3, 2, 10, 1.5, '#ffffff'); // monitor (back to us)
      p(7, 9, 2, 3, C.gray);
    },
    glass_wall(ctx, cx, by, s, len) {
      // a run of glass partition; len in art px
      const L = (len || 40);
      const p = makePx(ctx, cx - (L / 2) * s, by - 28 * s, s);
      p(0, 0, L, 28, 'rgba(120,200,240,0.10)');
      p(0, 0, L, 1.5, C.glassD);
      for (let x = 0; x <= L; x += 10) p(x, 0, 1, 28, C.glassD);
      p(0, 26.5, L, 1.5, C.steelD);
    },
    water_cooler(ctx, cx, by, s) {
      shadow(ctx, cx, by, 8 * s, 3 * s);
      const p = makePx(ctx, cx - 6 * s, by - 26 * s, s);
      p(2, 9, 8, 17, C.off); p(2, 9, 3, 17, C.gray2);     // stand
      p(1, 0, 10, 9, 'rgba(120,200,240,0.55)');           // jug
      p(2, 1, 8, 7, C.glass); p(7, 2, 1.5, 4, C.white);   // shine
      p(4, 12, 4, 3, C.blue);                              // tap
    },
    couch(ctx, cx, by, s) {
      shadow(ctx, cx, by, 24 * s, 7 * s);
      drawIsoBoxSimple(ctx, cx, by, 24 * s, 13 * s, 6 * s, '#7a5cff', '#5a32c0', '#4d2aa8');
      const p = makePx(ctx, cx - 13 * s, by - 6 * s - 11 * s, s);
      p(0, 0, 26, 11, '#8f74ff'); p(0, 0, 26, 3, '#a48cff'); // backrest
      p(3, 4, 9, 6, '#9a82ff'); p(14, 4, 9, 6, '#9a82ff');   // cushions
    },
    bookshelf(ctx, cx, by, s) {
      shadow(ctx, cx, by, 11 * s, 4 * s);
      const p = makePx(ctx, cx - 9 * s, by - 34 * s, s);
      p(0, 0, 18, 34, C.woodD);
      const cols = [C.red, C.blue, C.green, C.yel, C.pink, C.org, C.teal];
      for (let shelf = 0; shelf < 5; shelf++) {
        const yy = 1.5 + shelf * 6.4;
        for (let bx = 1.5; bx < 16; bx += 2) p(bx, yy, 1.6, 5, cols[((bx | 0) + shelf) % cols.length]);
        p(1, yy + 5, 16, 1, C.wood);
      }
    },
    arcade(ctx, cx, by, s) {
      shadow(ctx, cx, by, 9 * s, 3 * s);
      const p = makePx(ctx, cx - 7 * s, by - 30 * s, s);
      p(0, 0, 14, 30, C.dark);
      p(2, 3, 10, 8, C.blue); p(2, 3, 10, 2, '#9ff7ff');  // screen
      p(3, 5, 2, 2, C.pink); p(8, 7, 2, 2, C.green); p(5, 9, 2, 1.5, C.yel); // game pixels
      p(2, 13, 10, 4, C.red); p(4, 14, 1.5, 1.5, C.yel); p(7, 14, 1.5, 1.5, C.blue); // panel
      p(1, 18, 12, 1, C.pink);                             // marquee glow
    },
    box_stack(ctx, cx, by, s) {
      shadow(ctx, cx, by, 12 * s, 4 * s);
      drawIsoBoxSimple(ctx, cx, by, 15 * s, 11 * s, 8 * s, C.card, C.cardD, '#7a5a30');
      drawIsoBoxSimple(ctx, cx + 2 * s, by - 8 * s, 10 * s, 7 * s, 7 * s, C.card, C.cardD, '#7a5a30');
      const p = makePx(ctx, cx - 1 * s, by - 16 * s, s); p(0, 0, 1, 6, C.woodD); // tape
    },
    rug(ctx, cx, by, s) {
      isoDiamond(ctx, cx, by - 2 * s, 50 * s, 26 * s, 'rgba(255,0,255,0.10)', 'rgba(255,0,255,0.22)');
      isoDiamond(ctx, cx, by - 2 * s, 32 * s, 17 * s, 'rgba(0,243,255,0.09)', null);
    },
  };

  // ---- floor (isometric tiling) ------------------------------------------
  // Diamonds are placed on a fixed screen grid (rows every hh, alternate rows
  // offset by hw). Row parity comes from the *absolute* world half-row index k,
  // so there is NO cumulative per-row shift — the whole rect (incl. the bottom
  // -right corner) is always covered, and the checker stays stable while scrolling.
  function drawFloorRegion(ctx, x0, y0, x1, y1, camY) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    const hw = TILE_W / 2, hh = TILE_H / 2;
    const kStart = Math.floor((camY + y0) / hh) - 2;
    const kEnd = Math.ceil((camY + y1) / hh) + 2;
    for (let k = kStart; k <= kEnd; k++) {
      const sy = k * hh - camY;
      const offset = (k & 1) ? hw : 0;
      for (let sx = x0 - TILE_W; sx < x1 + TILE_W; sx += TILE_W) {
        const x = sx + offset;
        const ci = Math.round((x) / hw);
        const fill = ((ci + k) & 1) ? C.floorA : C.floorB;
        isoDiamond(ctx, x, sy, TILE_W, TILE_H, fill, 'rgba(0,243,255,0.045)');
        // sparse deterministic detail so the floor isn't flat & empty
        const h = ((ci * 73856093) ^ (k * 19349663)) >>> 0;
        if (h % 23 === 0) isoDiamond(ctx, x, sy, TILE_W * 0.32, TILE_H * 0.32, 'rgba(0,243,255,0.10)', null);
        else if (h % 37 === 0) isoDiamond(ctx, x, sy, TILE_W * 0.5, TILE_H * 0.5, 'rgba(255,0,255,0.05)', null);
      }
    }
    ctx.restore();
  }

  OQ.art = {
    C, makePx, isoDiamond, drawIsoBoxSimple, shadow, poly,
    drawPerson, ICON, PROP, drawFloorRegion, TILE_W, TILE_H,
  };

  // sanity: warn on missing icon fns referenced later (filled by world.js usage)
})();
