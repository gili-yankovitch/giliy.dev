# 🕹️ OFFICE QUEST — a hidden point-&-click adventure living in the background of giliy.dev

> A pixelated, isometric ("isomorphic" in the brief 😉) point-and-click quest hidden in the
> background of the website. It is **always on** — it *is* the page background. It is vivid in
> the page margins and faint behind the content column. Inspired by Monkey Island / Day of the
> Tentacle. The whole point is to be **funny**.

This document is the living spec. Read it before iterating. It describes the engine, the art
pipeline, the Stage 1 design (fully built), and the roadmap for future stages.

---

## 1. Premise & tone

You play **Me**, a developer in a Tel-Aviv open-space office. You just want to work on your
secret personal project (you are *fabricating your own silicon chip at your desk* — see the
site's "Life goal: Fabricate my own chip"). But **Manager, the R&D Manager**, keeps materialising
to tell you to "refocus on work / sync with the team / circle back on the backlog." On top of
that, random colleagues keep dumping absurd R&D requests on you in comic speech bubbles, yanking
you out of flow.

Humor is the product. Puzzles must be **absurd** in classic adventure-game logic. Think:
"obviously, to make the manager leave, I flush the office rubber duck so he has to drive across
town to buy a new one before the rubber-duck-manufacturer client meeting." That is the vibe.

### Stage 1 goal
Distract / neutralise Manager long enough to get uninterrupted focus on the chip. **Three** fully
absurd, independent solution paths exist; completing **any one** wins the stage.

---

## 2. Design decisions (locked with the site owner)

| Topic | Decision |
|---|---|
| Hosting | **Standalone full-screen page** (`game.html`), linked from the main site as an **easter egg** (a near-invisible `./office_quest.sh` link in the footer terminal prompt + a `launchQuest()` console hint). The main `index.html` is the plain portfolio again — no game canvas. |
| Layout | **Full-screen.** The whole viewport is the office floor; interactive rooms are spread across the entire width (left/center/right) and the vertical scroll. A generated open-plan desk grid + edge props keep every scroll position populated. |
| Art | **Hand-authored pixel sprites** (color-indexed char grids) + procedural isometric boxes, rendered to a `<canvas>` with nearest-neighbor scaling. No external assets. |
| Code | **Split modules** in `game/`, loaded as plain (non-module) scripts attaching to `window.OfficeQuest`. Works over `file://` and `http://`. |
| Persistence | Progress + inventory + flags saved to `localStorage` (`officequest.save.v1`) so it "evolves over time" and survives reloads. |
| Mobile | Designed for desktop ≥ ~1100px (where margins are wide). On narrow screens it still renders as ambient background; a hint suggests a wider screen for full play. Documented limitation, not a bug. |

---

## 3. File layout

```
game.html       ← standalone full-screen game page (loads the scripts below)
index.html      ← the portfolio; links the game as a footer easter egg
game/
  DESIGN.md     ← this file (the iterable spec)
  game.css      ← canvas layering, inventory bar, speech bubbles, cursor, victory overlay
  sprites.js    ← global palette + pixel-art sprite data + sprite/iso-box draw helpers
  world.js      ← Stage data: map clusters, items, NPCs, dialogue, puzzles, win logic, NPC nag pool
  engine.js     ← the point-&-click engine (render loop, camera/scroll, input, movement,
                  inventory, verb/action system, dialogue runner, interruption scheduler, save)
```

`index.html` includes them in order: `game.css`, then `sprites.js → world.js → engine.js`,
then the engine boots on `DOMContentLoaded`.

---

## 4. Engine architecture (`engine.js`)

### 4.1 Layering (full-screen page)
- `#oq-canvas` — `position:fixed; inset:0;` full viewport, `z-index:1`, `pointer-events:auto`. The
  whole screen is the game; clicks land on the canvas (HUD elements at higher z-index handle their
  own clicks). The CRT scanline overlay (`body::before`, z-index 1000) sits on top for flavor.
- `game.html` contains only a `.oq-spacer` (height `300vh`) so the page is scrollable; the engine
  injects the canvas + HUD. A small back-link and title sit at z-index 1550.

### 4.2 Camera / scroll
The page is `300vh` tall (the spacer), so `camera.y = window.scrollY` **pans the office map** as you
scroll. World vertical bands are *normalized* (0..1) and mapped onto the document's scrollable
height at runtime, so the map always spans the full page. Desk rows are evenly spaced across the
bands so no scroll position lands on empty floor.

### 4.3 Coordinate systems
- **World pixels**: `(wx, wy)`. `screen = world - camera` (camera.x is 0).
- Props/items/characters live at world pixels. Clusters are **anchored** to `left`/`right`/`center`
  edges with an offset, and to a vertical band (0..1). On resize we recompute `wx` from the anchor
  so interactables stay inside the margins.
- **Isometric projection** is used for the ground plane and box props:
  `sx = (gx - gy) * TILE_W/2`, `sy = (gx + gy) * TILE_H/2`, with `TILE_W=64, TILE_H=32`.
- **Depth sort**: every drawable has a `sortY` (its "feet"/anchor world-y). Drawn back-to-front so
  the hero correctly passes behind/in front of furniture.

### 4.4 Verb / action system (satisfies the three required action types)
Status sentence bar (bottom) previews the action under the cursor, classic SCUMM style.
- **Pick up X** — left-click a *mobile* item on the map → hero walks over, item goes to inventory.
- **Talk to / Interact** — left-click an NPC (talk) or stationary object (its primary verb, e.g.
  "Flush", "Print", "Call", "Open").
- **Look at X** — right-click (or long-press) any interactable → examine flavor text.
- **Use item X with item Y** — click an inventory item to "hold" it (cursor shows it + sentence
  "Use X with…"); then click a target (map object, NPC, or another inventory item) → runs
  `use(itemId, targetId)`. Esc / click the held item again cancels.

Every interactable declares handlers; puzzle logic is data-driven via a global `flags` object and
small predicate/effect functions in `world.js`. Unknown combinations get a funny default rebuff.

### 4.5 Movement
Open-plan office ⇒ simple straight-line walk: hero lerps toward the target floor point at a fixed
speed with 2–4 frame walk animation; `sortY` updates so depth sorting works. Interacting first
walks the hero to the object's live `approach` point, then runs the handler. No pathfinding needed
for Stage 1 (no interior walls block the floor); revisit if later stages add obstacles.

**NPC state machine** (no teleporting, ever): `idle` (rests at its home anchor, stays responsive
to resize) → `goto` (scripted cutscene walk to a fixed point) → `parked` (stays exactly where the
script left it; auto-promotes back to `idle` only once it's home) → `chase` (tracks the hero's
*live* position) → `return` (walks home on foot). NPCs always reach home by walking, never by
snapping.

### 4.6 Dialogue & cutscenes
DOM speech bubbles (`.oq-bubble`) positioned at the speaker's screen coords each frame, using the
already-loaded pixel fonts. A tiny script runner plays a queue of `{speaker, text}` lines; click
advances. Cutscenes can also move characters and set flags between lines.

### 4.7 Interruption scheduler ("random absurd R&D requests")
On a randomized timer (~25–45s, paused during cutscenes/dialogue, one pest at a time), a random
colleague (or the Manager, for a nag) **chases the hero's live position** — it does NOT freeze the
hero, who stays fully controllable and can literally walk away. When the pest catches up it enters
a stationary `talk` state: it **stops, faces the hero, and holds a readable non-blocking ambient
bubble for `TALK_MS` (~3.6s)** so the text never smudges across a moving sprite, *then* walks home.
Ambient bubbles (`#oq-ambient`) are a small sequential queue (pest line → hero's deadpan reply),
never set the busy state, and need no click. Blocking, click-to-advance dialogue is reserved for
*player-initiated* talks, the intro, and win cutscenes.

### 4.8 Save state
`localStorage["officequest.save.v1"]` = `{ inventory:[ids], flags:{}, stageComplete:bool }`.
Loaded on boot. A tiny `?oqreset` query param or `OfficeQuest.reset()` console call clears it.

---

## 5. Art pipeline (`sprites.js`)

All art is **procedural** — drawn at integer-pixel scale so it stays crisp/pixelated at any zoom,
animatable, perfectly aligned, and 100% self-contained (no external assets).

- One global **palette** `C`: name → hex.
- `makePx(ctx, ox, oy, s)` returns a `px(x,y,w,h,color)` that paints `s×s`-scaled pixel rects in a
  local art grid — the building block for every icon/prop.
- **Items**: `ICON[id](px)` draws a 16×16 icon (used both on the map and in inventory slots).
- **Props**: `PROP[id](ctx, cx, baseY, s, state)` draws furniture/scenery with feet at `baseY`.
  Boxy furniture uses `drawIsoBoxSimple(...)` (shaded 3-face iso box); flat decals (rugs) use
  `isoDiamond`. Current props: desk_pc, chip_rig, chair, toilet, fridge, coffee_machine, printer,
  plant, server_rack, whiteboard, family_photo, office_phone, meeting_door, room_sign,
  colleague_desk, worker_desk (a seated, gently "typing" colleague — populates the open plan),
  glass_wall, water_cooler, couch, bookshelf, arcade, box_stack, rug.
- **Characters**: `drawPerson(ctx, cx, footY, s, colors, frame, facing)` — procedural blocky
  humanoid with walk frames, facing, optional headphones/tie accent (palette per character in
  `world.js` `COL`).
- **Floor**: `drawFloorRegion` tiles iso diamonds on a fixed screen grid keyed by the *absolute*
  world half-row (no cumulative shift → every corner is covered while scrolling), with sparse
  deterministic accent tiles for texture.
- To add art: add a `C` color and an `ICON`/`PROP` draw fn; reference its id from `world.js`.

---

## 6. STAGE 1 — "Refocus This" (fully built)

### 6.1 Map clusters (anchored; vivid in margins)
- **Me's desk** (LEFT, top band) — your PC, chair, and the secret **chip-fab rig**. Sitting here
  and reaching focus = the victory beat once Manager is gone.
- **Manager's glass office** (RIGHT, top band) — his desk, **framed family photo** (intel), **car
  keys** on a hook, his chair. Manager patrols out of here to nag you.
- **Kitchenette** (LEFT, mid band) — fridge, coffee machine, a colleague's leftover **birthday
  helium balloon**, a **cold pizza** box.
- **Meeting room "Synergy"** (RIGHT, mid band) — glass door with a flippable **"IN SESSION" sign**,
  a table, a projector.
- **The loo** (LEFT, lower band) — the cursed **toilet**.
- **Bathroom-adjacent printer** + **colleague desks** (CENTER/edges) — the **office rubber duck**
  lives on a colleague's desk; the **printer** prints signs/invites.
- Ambient open-plan desks, plants, server rack, whiteboard fill the center (faint behind content).

### 6.2 Items
**Mobile (inventory):** `rubber_duck`, `helium_balloon`, `pizza`, `sticky_note` (after writing),
`marker`, `standup_sign` (printed), `car_keys` (Manager's — only obtainable in path C twist).
**Stationary:** `me_pc`, `chip_rig`, `toilet`, `fridge`, `coffee_machine`, `office_phone`,
`manager_desk`, `family_photo`, `meeting_door`, `room_sign`, `printer`, `colleague_desk`, `whiteboard`.

### 6.3 The three absurd solutions (any ONE wins)

**A — The Rubber Duck Crisis** 🦆🚽
1. `Pick up rubber_duck` from the colleague's desk.
2. `Use rubber_duck with toilet` → flush. Plumbing gurgles; the sacred debugging/demo duck is gone.
3. `Pick up marker` (Me's desk) → `Use marker with sticky_note`? (sticky note is on Me's
   monitor) → writes **"QuackCorp demo — 1 HOUR — bring the duck!!"**.
4. `Use sticky_note with manager_desk` (stick it on the Manager's monitor).
5. `Talk to Manager` → he reads the note, checks the duck shelf (empty), realises QuackCorp (the
   company's biggest client — a *rubber-duck manufacturer*) arrives in an hour with no duck, grabs
   his car keys and bolts to buy one across town. **Path A complete.**

**B — The Forgotten Anniversary** 💐📞
1. `Look at family_photo` in the Manager's office → learn today is his wedding anniversary (date gag).
2. `Pick up helium_balloon` from the kitchenette (voice changer).
3. `Use helium_balloon with` yourself / `office_phone` → squeaky disguise armed.
4. `Use office_phone` while armed → fake-call Manager as his panicked **mother-in-law**: the
   anniversary dinner is *now*, his wife is in tears, and where are the flowers?!
5. Manager panics, grabs keys, sprints out for flowers. **Path B complete.**

**C — The Eternal Free-Pizza Standup** 🍕🔁
1. `Pick up pizza` (cold leftover, kitchenette).
2. `Use pizza with meeting_door` → place pizza inside the Synergy room as bait.
3. `Use marker with room_sign` / flip `room_sign` to **"MANDATORY STANDUP — IN SESSION (4h)"**;
   optionally `Use printer` to print the fake recurring invite for extra absurdity.
4. `Talk to Manager` → mention "free pizza standup, you're required." A manager + free food + a
   meeting = a black hole. He enters; the door's "auto-lock" + recursive calendar invite trap him
   in an infinite standup. **Path C complete.**

On any completion: short cutscene (Manager leaves/trapped) → focus is yours → Me sits at the
chip-rig, the **FOCUS** meter fills, **"STAGE 1 COMPLETE"** overlay (e.g. *"You bought yourself 4
glorious minutes of focus."*). `stageComplete` flag persists.

### 6.4 Dialogue voice
- **Manager (nags):** "Less side-projects, more synergy." / "What's the ETA on the thing — the main
  thing, you know the thing." / "Love the passion. Now point it at the backlog." / "Did you sync
  with the team about syncing?"
- **Colleague interruptions (random):** see `INTERRUPTIONS` in `world.js` — e.g. "Can you make the
  logo 10% more blockchain?", "Center this div. I've tried for six years.", "Add AI. Anywhere.
  Doesn't matter where.", "Client says the app's too fast — add a loading spinner for trust."
- **Me (wry inner voice):** examine/rebuff lines that comment on the absurdity.

---

## 7. Roadmap / how to add a stage

1. Add a new stage object to `world.js` (`STAGES[n]`) with its clusters/items/NPCs/puzzles/win
   logic, reusing the same schema as Stage 1.
2. The engine reads the active stage; bump `currentStage` on completion (persisted).
3. Future stage ideas: **Stage 2 — "Ship It Friday"** (sneak a personal-project commit into the
   prod release without QA noticing); **Stage 3 — "All-Hands Escape"** (escape a mandatory 3-hour
   all-hands to reach a hardware demo); **Stage 4 — "The Reorg"** (survive an office reorg that
   literally rearranges the furniture/map).
4. Keep every puzzle solvable by absurd logic, keep interactables in the margins, keep it funny.

---

## 8. Known limitations / TODO
- Narrow screens: ambient only; consider a dedicated mobile mini-layout later.
- Movement is straight-line (no obstacle pathfinding) — fine for open plan; revisit for walled maps.
- Sprite set is intentionally minimal-but-readable for Stage 1; expand the palette/sprites as
  stages grow.
