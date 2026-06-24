/* ============================================================================
 * OFFICE QUEST — world.js
 * Stage data: map clusters, items, props, NPCs, dialogue, the three absurd
 * solution chains, win logic, and the random-interruption pool.
 * Handlers receive `g` — the engine API (see engine.js bottom for the contract).
 * ==========================================================================*/
(function () {
  const OQ = (window.OfficeQuest = window.OfficeQuest || {});
  const C = OQ.C;

  // ---- character palettes -------------------------------------------------
  const COL = {
    me:  { skin:C.skin, skinSh:C.skinSh, hair:C.hair, shirt:C.teal, shirtSh:C.tealD, pants:C.navy, shoe:C.dark, headphones:true },
    manager: { skin:C.skin, skinSh:C.skinSh, hair:C.grayHair, shirt:C.white, shirtSh:C.off, pants:C.steelD, shoe:C.dark, accent:C.red },
    dev1:  { skin:C.skin, skinSh:C.skinSh, hair:'#3a2a44', shirt:C.pink, shirtSh:C.pinkD, pants:C.dark, shoe:C.out },
    dev2:  { skin:'#e7b486', skinSh:'#c08a55', hair:'#1a1a1a', shirt:C.org, shirtSh:C.orgD, pants:C.navy, shoe:C.out },
    dev3:  { skin:C.skin, skinSh:C.skinSh, hair:'#6a4a2a', shirt:C.purple, shirtSh:'#6a3fdf', pants:C.dark, shoe:C.out },
  };
  OQ.COL = COL;

  // ---- clusters (anchored to page margins; band = vertical 0..1) ----------
  // dx = px from the anchored edge to the cluster's local origin.
  const CLUSTERS = {
    me_desk:    { anchor:'left',  dx: 95,  band: 0.17 },
    kitchen:      { anchor:'left',  dx: 90,  band: 0.46 },
    printer_nook: { anchor:'left',  dx: 70,  band: 0.66 },
    loo:          { anchor:'left',  dx: 80,  band: 0.84 },
    manager_office: { anchor:'right', dx: 110, band: 0.14 },
    duck_desk:    { anchor:'right', dx: 80,  band: 0.33 },
    meeting:      { anchor:'right', dx: 120, band: 0.55 },
    exit:         { anchor:'right', dx: 60,  band: 0.03 },
    desk_b:       { anchor:'center', dx:-120, band: 0.52 },
    desk_c:       { anchor:'center', dx: 130, band: 0.58 },
  };

  // ---- ambient decor (mostly center column = faint; some in margins = vivid;
  //      all NON-interactive). Rugs/props flesh out the rooms around interactables.
  const DECOR = [
    // rugs under the two key rooms (low band so they depth-sort UNDER the furniture)
    { prop:'rug',            anchor:'left',   dx: 95,  band:0.145, s:3 },
    { prop:'rug',            anchor:'right',  dx:110,  band:0.115, s:3 },
    // top band — open plan + lounge (people working at their desks)
    { prop:'water_cooler',   anchor:'center', dx:-215, band:0.10, s:3 },
    { prop:'couch',          anchor:'center', dx: 170, band:0.15, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:-200, band:0.19, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: -70, band:0.20, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:  70, band:0.205, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 200, band:0.21, s:3 },
    { prop:'plant',          anchor:'center', dx:  10, band:0.245, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:-130, band:0.27, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 130, band:0.275, s:3 },
    { prop:'arcade',         anchor:'center', dx: -30, band:0.31, s:3 },
    { prop:'plant',          anchor:'right',  dx:  45, band:0.24, s:3 },
    { prop:'bookshelf',      anchor:'left',   dx:  32, band:0.30, s:3 },
    { prop:'whiteboard',     anchor:'center', dx: 150, band:0.33, s:3 },
    // mid band
    { prop:'worker_desk',    anchor:'center', dx:-210, band:0.37, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: -60, band:0.375, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 210, band:0.38, s:3 },
    { prop:'whiteboard',     anchor:'center', dx: -40, band:0.41, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:  90, band:0.43, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:-225, band:0.45, s:3 },
    { prop:'plant',          anchor:'center', dx:  95, band:0.475, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:-140, band:0.515, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 200, band:0.50, s:3 },
    { prop:'box_stack',      anchor:'left',   dx: 120, band:0.62, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 130, band:0.575, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: -50, band:0.60, s:3 },
    { prop:'water_cooler',   anchor:'center', dx: 215, band:0.62, s:3 },
    { prop:'bookshelf',      anchor:'center', dx:-205, band:0.60, s:3 },
    // lower band
    { prop:'worker_desk',    anchor:'center', dx:-160, band:0.66, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 150, band:0.665, s:3 },
    { prop:'server_rack',    anchor:'center', dx:  60, band:0.70, s:3 },
    { prop:'box_stack',      anchor:'center', dx: -70, band:0.685, s:3 },
    { prop:'worker_desk',    anchor:'center', dx:-220, band:0.72, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 215, band:0.725, s:3 },
    { prop:'plant',          anchor:'center', dx: -90, band:0.75, s:3 },
    { prop:'couch',          anchor:'center', dx: 120, band:0.79, s:3 },
    { prop:'plant',          anchor:'right',  dx:  50, band:0.80, s:3 },
    { prop:'arcade',         anchor:'center', dx: 190, band:0.82, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: -40, band:0.875, s:3 },
    { prop:'worker_desk',    anchor:'center', dx: 120, band:0.88, s:3 },
    { prop:'bookshelf',      anchor:'center', dx:-160, band:0.90, s:3 },

    // ===== MARGINS (vivid, NON-interactive) — fill the side strips between the
    //       interactive clusters so the playable zone never looks empty. An "outer"
    //       row hugs the wall (small dx) and an "inner" row (larger dx) faces it. =====
    // LEFT margin
    { prop:'plant',          anchor:'left',   dx:  40, band:0.07,  s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 200, band:0.10,  s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 185, band:0.27,  s:3 },
    { prop:'water_cooler',   anchor:'left',   dx:  45, band:0.30,  s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 205, band:0.345, s:3 },
    { prop:'plant',          anchor:'left',   dx:  55, band:0.38,  s:3 },
    { prop:'box_stack',      anchor:'left',   dx: 215, band:0.40,  s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 190, band:0.535, s:3 },
    { prop:'plant',          anchor:'left',   dx:  45, band:0.555, s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 200, band:0.58,  s:3 },
    { prop:'arcade',         anchor:'left',   dx:  50, band:0.72,  s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 195, band:0.74,  s:3 },
    { prop:'plant',          anchor:'left',   dx:  60, band:0.77,  s:3 },
    { prop:'worker_desk',    anchor:'left',   dx: 185, band:0.91,  s:3 },
    { prop:'server_rack',    anchor:'left',   dx:  55, band:0.94,  s:3 },
    // RIGHT margin
    { prop:'plant',          anchor:'right',  dx:  60, band:0.07,  s:3 },
    { prop:'worker_desk',    anchor:'right',  dx: 185, band:0.205, s:3 },
    { prop:'worker_desk',    anchor:'right',  dx:  55, band:0.22,  s:3 },
    { prop:'box_stack',      anchor:'right',  dx: 200, band:0.27,  s:3 },
    { prop:'water_cooler',   anchor:'right',  dx:  55, band:0.40,  s:3 },
    { prop:'worker_desk',    anchor:'right',  dx: 195, band:0.42,  s:3 },
    { prop:'bookshelf',      anchor:'right',  dx:  45, band:0.45,  s:3 },
    { prop:'worker_desk',    anchor:'right',  dx: 200, band:0.66,  s:3 },
    { prop:'worker_desk',    anchor:'right',  dx:  55, band:0.685, s:3 },
    { prop:'plant',          anchor:'right',  dx: 190, band:0.71,  s:3 },
    { prop:'couch',          anchor:'right',  dx:  65, band:0.84,  s:3 },
    { prop:'worker_desk',    anchor:'right',  dx: 195, band:0.90,  s:3 },
    { prop:'arcade',         anchor:'right',  dx:  55, band:0.93,  s:3 },
  ];

  // ---- items (mobile) — appear on the map until collected ----------------
  // ---- props (stationary) — interactable but never picked up -------------
  // ---- npcs --------------------------------------------------------------
  // Unified object list; engine resolves world pos from cluster+dx/dy each frame.
  const OBJECTS = [
    // --- Me's desk (LEFT) ---
    { id:'me_pc',   name:'your workstation', kind:'prop', prop:'desk_pc', cluster:'me_desk', dx:0,  dy:0, s:3, w:70, h:80, verb:'Use',
      look:"My machine. 14 terminals open, all of them blank. Peak productivity.",
      onInteract(g){
        if (g.flag('stageComplete')) { g.me("FOCUS. Pure, uninterrupted focus. I can hear the electrons."); return; }
        g.me("Can't *really* dig in while Manager's circling. I need to get him off my back first.");
      } },
    { id:'chip_rig',  name:'the secret chip-fab rig', kind:'prop', prop:'chip_rig', cluster:'me_desk', dx:-44, dy:18, s:3, w:60, h:60, verb:'Work on',
      look:"My personal project: fabricating my own silicon chip. The nm count does NOT matter.",
      onInteract(g){
        if (g.flag('stageComplete')) { g.completeFocus(); return; }
        g.me("Soon, my beautiful little chip. Soon. Just need Manager to vanish for five minutes.");
      } },
    { id:'chair_g',   name:'office chair', kind:'prop', prop:'chair', cluster:'me_desk', dx:24, dy:14, s:3, w:34, h:40, verb:'Sit on',
      look:"Lumbar support is a myth told to children.",
      onInteract(g){ g.me("If I sit now, Manager appears within nine seconds. It's a law of physics."); } },
    { id:'marker',    name:'a fat blue marker', kind:'item', icon:'marker', cluster:'me_desk', dx:30, dy:-6, s:3, w:34, h:34,
      look:"A chunky permanent marker. Smells like deadlines.",
      take:"You pocket the marker. The cap is, of course, already lost." },
    { id:'sticky_note', name:'a blank sticky note', kind:'item', icon:'sticky_note', cluster:'me_desk', dx:-6, dy:-30, s:3, w:30, h:30,
      look:"A blank sticky note clinging to my monitor for dear life.",
      take:"You peel off a blank sticky note." },

    // --- Manager's glass office (RIGHT) ---
    { id:'manager_desk', name:"Manager's desk", kind:'prop', prop:'office_phone', cluster:'manager_office', dx:-30, dy:24, s:3, w:60, h:40, verb:'Use',
      look:"Manager's desk. A 'Manager of the Month' mug from a month that never specifies a year.",
      onInteract(g){ g.me("His desk. Suspiciously tidy. Suspicious in general."); } },
    { id:'family_photo', name:'a framed family photo', kind:'prop', prop:'family_photo', cluster:'manager_office', dx:8, dy:8, s:3, w:34, h:36, verb:'Look at',
      look:"The Manager and his wife, beaming. A heart-shaped plate reads 'OUR ANNIVERSARY ♥'. The cake in the photo says 'TODAY!!'. Wow, subtle.",
      onInteract(g){
        if (!g.flag('knowWife')) {
          g.setFlag('knowWife');
          g.say('me', ["So today is the Manager's wedding anniversary. And judging by his messy desk, he has absolutely forgotten.","...I could *absolutely* weaponize this."]);
        } else {
          g.me("Anniversary. Today. He forgot. Got it.");
        }
      } },
    { id:'office_phone', name:'the office VoIP phone', kind:'prop', prop:'office_phone', cluster:'manager_office', dx:-34, dy:30, s:2.4, w:40, h:30, verb:'Use',
      look:"An ancient office phone that somehow still has a dial tone and zero accountability.",
      onInteract(g){
        g.me("I can't prank-call Manager as *myself* — he'd know my voice in one syllable. I'd need to sound... different.");
      } },
    { id:'chair_y',   name:"Manager's throne", kind:'prop', prop:'chair', cluster:'manager_office', dx:-30, dy:42, s:3, w:34, h:40, verb:'Sit on',
      look:"An ergonomic chair worth more than my entire setup. The audacity.",
      onInteract(g){ g.me("If I sit in the manager's chair I become a manager. No. NO."); } },

    // --- colleague desk with the sacred rubber duck (RIGHT) ---
    { id:'rubber_duck', name:'the office rubber duck', kind:'item', icon:'rubber_duck', cluster:'duck_desk', dx:0, dy:-14, s:3.2, w:40, h:40,
      look:"THE office rubber duck. Sacred debugging tool AND demo prop for our biggest client.",
      take:"You snatch the holy debugging duck. Somewhere, a senior engineer's bug becomes unsolvable." },

    // --- kitchenette (LEFT) ---
    { id:'fridge', name:'the office fridge', kind:'prop', prop:'fridge', cluster:'kitchen', dx:-30, dy:0, s:3, w:50, h:90, verb:'Open',
      look:"A fridge containing 40 identical-looking lunches and one yogurt from the Obama administration.",
      onInteract(g){ g.me("There's a labeled sandwich in here that just says 'DO NOT. I MEAN IT.' I respect it."); } },
    { id:'coffee_machine', name:'the coffee machine', kind:'prop', prop:'coffee_machine', cluster:'kitchen', dx:20, dy:8, s:3, w:40, h:55, verb:'Use',
      look:"The machine that runs this company. The CEO is decorative.",
      onInteract(g){ g.me("If I drink more coffee I'll be able to see through time. Tempting. Later."); } },
    { id:'helium_balloon', name:'a leftover birthday balloon', kind:'item', icon:'helium_balloon', cluster:'kitchen', dx:38, dy:-30, s:3, w:36, h:50,
      look:"A sad helium balloon from someone's birthday three weeks ago. Still squeaky-full.",
      take:"You liberate the birthday balloon. Helium: nature's voice-changer." },
    { id:'pizza', name:'a box of cold pizza', kind:'item', icon:'pizza', cluster:'kitchen', dx:0, dy:30, s:3, w:46, h:36,
      look:"Leftover all-hands pizza, now at room temperature and full of potential.",
      take:"You acquire the cold pizza. It is now the most powerful object in the building." },

    // --- printer nook (LEFT) ---
    { id:'printer', name:'the office printer', kind:'prop', prop:'printer', cluster:'printer_nook', dx:0, dy:0, s:3, w:50, h:40, verb:'Use',
      look:"A printer. 7% toner forever. Default state: paper jam, existential dread.",
      onInteract(g){
        if (g.flag('invitePrinted')) { g.me("It already printed my masterpiece. And 200 blank pages, out of spite."); return; }
        g.setFlag('invitePrinted'); g.give('standup_sign');
        g.say('me', ["I print a recurring calendar invite: 'MANDATORY STANDUP — repeats every 15 min FOREVER'.","The printer also emits 40 blank pages as a tax. Worth it."]);
      } },

    // --- the loo (LEFT) ---
    { id:'toilet', name:'the office toilet', kind:'prop', prop:'toilet', cluster:'loo', dx:0, dy:0, s:3.2, w:50, h:70, verb:'Flush',
      look:"A porcelain throne with a hair-trigger flush and a vendetta against small objects.",
      onInteract(g){
        if (g.flag('duckFlushed')) { g.me("The duck is gone. I can hear it touring the municipal sewers."); return; }
        g.me("Flushing nothing just wastes water. I feel I should flush something... specific."); } },

    // --- meeting room "Synergy" (RIGHT) ---
    { id:'meeting_door', name:'the "Synergy" meeting room', kind:'prop', prop:'meeting_door', cluster:'meeting', dx:0, dy:0, s:2.6, w:60, h:95, verb:'Open',
      look:"Glass meeting room named 'Synergy'. Auto-locking door. Where focus goes to die.",
      onInteract(g){ g.me("Empty for once. A trap this perfect doesn't bait itself."); } },
    { id:'room_sign', name:'the meeting-room status sign', kind:'prop', prop:'room_sign', cluster:'meeting', dx:26, dy:-50, s:2.6, w:40, h:24, verb:'Flip', state:{flipped:false},
      look:"A little flip-sign: AVAILABLE / IN SESSION. Currently honest.",
      onInteract(g){
        const o = g.obj('room_sign');
        o.state.flipped = !o.state.flipped;
        g.setFlag('signFlipped', o.state.flipped);
        g.me(o.state.flipped ? "Flipped to 'IN SESSION'. Now it's a real meeting, legally speaking." : "Back to 'AVAILABLE'. Honesty restored, momentarily.");
      } },

    // --- NPCs ---
    { id:'manager', name:'the Manager', kind:'npc', col:'manager', cluster:'manager_office', dx:-10, dy:-6, s:3.4, w:46, h:78, verb:'Talk to',
      look:"The R&D Manager. Armed with a roadmap, a Gantt chart, and the phrase 'let's circle back'.",
      onInteract(g){ OQ.talkToManager(g); } },
    { id:'devA', name:'a colleague', kind:'npc', col:'dev1', cluster:'duck_desk', dx:34, dy:10, s:3.2, w:42, h:74, verb:'Talk to',
      look:"A coworker wearing noise-cancelling headphones that cancel everything except me.",
      onInteract(g){ g.say('devA', g.pick(["Don't talk to me, I'm in a flow state. ...okay I lost it.","Have you seen the duck? The DUCK. I can't debug without the duck.","If anyone asks, I'm 'in a meeting'."])); } },
    { id:'devB', name:'another colleague', kind:'npc', col:'dev2', cluster:'desk_b', dx:0, dy:6, s:3.2, w:42, h:74, verb:'Talk to',
      look:"Has eleven monitors and uses exactly one of them, for solitaire.",
      onInteract(g){ g.say('devB', g.pick(["Standup was 3 hours. We discussed standups.","I haven't pushed code since the merge incident. We don't talk about the merge incident.","Is it Friday? It's never Friday."])); } },
    { id:'devC', name:'yet another colleague', kind:'npc', col:'dev3', cluster:'desk_c', dx:0, dy:6, s:3.2, w:42, h:74, verb:'Talk to',
      look:"Speaks exclusively in acronyms. Even their lunch order is an acronym.",
      onInteract(g){ g.say('devC', g.pick(["Per my last Slack, re: the EOD ETA on the POC — circle back?","I rebased and now time itself has a merge conflict.","We're agile. So agile we never actually ship."])); } },
  ];

  // ---- USE combinations: "source>target" -> handler(g) returns true ------
  const COMBOS = {
    // PATH A — rubber duck crisis
    'rubber_duck>toilet'(g){
      g.consume('rubber_duck'); g.setFlag('duckFlushed');
      g.say('me', ["*FLUSH*","...","The sacred duck is gone. The biggest client, QuackCorp — a rubber-duck manufacturer — demos in an hour. With no duck.","Now Manager just needs to FIND OUT."]);
      return true;
    },
    'marker>sticky_note'(g){
      if (g.flag('noteWritten')) { g.me("Already wrote on it. Adding more would be unhinged. Restrained, even for me."); return true; }
      g.setFlag('noteWritten');
      const n = g.obj('sticky_note'); n.name = "note: 'QuackCorp demo — 1HR — BRING THE DUCK!!'";
      g.say('me', ["I scrawl: 'QUACKCORP DEMO — 1 HOUR — BRING THE DUCK!!!'","Three exclamation marks. The internationally recognized unit of panic."]);
      return true;
    },
    'sticky_note>manager_desk'(g){
      if (!g.flag('noteWritten')) { g.me("Sticking a *blank* note on his desk would just confuse him. Effective, but off-message."); return true; }
      g.consume('sticky_note'); g.setFlag('notePlaced');
      g.say('me', ["I slap the note dead-center on Manager's monitor.","Now I just casually mention the duck situation. Tick tock, Manager."]);
      return true;
    },
    // PATH B — forgotten anniversary
    'helium_balloon>office_phone'(g){
      if (!g.flag('knowWife')) { g.say('me',["I could fake a call... but I have no ammo.","Who would I even be? I need a personal detail about Manager first."]); return true; }
      g.consume('helium_balloon');
      OQ.winB(g);
      return true;
    },
    'helium_balloon>me_pc'(g){ g.me("Inhaling helium at my desk for no reason is just a Tuesday. I should save it for the phone."); return true; },
    // PATH C — eternal free-pizza standup
    'pizza>meeting_door'(g){
      g.consume('pizza'); g.setFlag('pizzaPlaced');
      g.say('me', ["I set the cold pizza on the 'Synergy' table like a sacrificial offering.","No manager in recorded history has walked past free pizza."]);
      return true;
    },
    'marker>room_sign'(g){
      const o = g.obj('room_sign'); o.state.flipped = true; g.setFlag('signFlipped', true);
      g.say('me', ["I scrawl 'MANDATORY STANDUP — 4 HRS' under 'IN SESSION'.","Now it's not a suggestion. It's policy."]);
      return true;
    },
    'standup_sign>meeting_door'(g){
      g.consume('standup_sign'); g.setFlag('signPosted', true);
      g.say('me', ["I tape the recurring-forever invite to the glass door.","The calendar gods have been invoked. There is no escape from a recurring meeting."]);
      return true;
    },
    'standup_sign>room_sign'(g){
      g.consume('standup_sign'); g.setFlag('signPosted', true); g.obj('room_sign').state.flipped = true; g.setFlag('signFlipped', true);
      g.say('me', "I staple the invite over the sign. Belt and suspenders. Bureaucratic overkill.");
      return true;
    },
  };

  // ---- Manager: nag lines + talk/branch logic ------------------------------
  const MANAGER_NAGS = [
    "Less side-projects, more synergy, yeah?",
    "What's the ETA on the thing? The main thing. You know the thing.",
    "Love the passion. Now point it at the backlog.",
    "Did you sync with the team about syncing?",
    "Let's take this offline. Then bring it back online. Then align.",
    "I'm not saying work harder. I'm saying work... more aligned-er.",
    "Quick question that will take exactly your whole afternoon —",
    "Is this on the roadmap? Everything's on the roadmap. Get on the roadmap.",
  ];

  OQ.talkToManager = function (g) {
    if (g.flag('stageComplete')) { g.say('manager', "...how are you THIS relaxed? It's unsettling. Carry on, I guess."); return; }
    // PATH A win
    if (g.flag('duckFlushed') && g.flag('notePlaced')) { OQ.winA(g); return; }
    // PATH C win
    if (g.flag('pizzaPlaced') && (g.flag('signFlipped') || g.flag('signPosted'))) { OQ.winC(g); return; }
    // partial-progress nudges
    if (g.flag('duckFlushed') && !g.flag('notePlaced')) {
      g.say('manager', ["Hey — have you seen the duck? The QuackCorp folks LOVE that duck.","Anyway. Backlog. Now."]);
      g.me("He doesn't know yet how bad it is. I should leave a note where he can't miss it.");
      return;
    }
    if (g.flag('pizzaPlaced') && !(g.flag('signFlipped')||g.flag('signPosted'))) {
      g.say('manager', "Is that... pizza in Synergy? Smells unsanctioned. Probably nothing.");
      g.me("Pizza alone won't hold him. I need the room to look like an *official mandatory* meeting.");
      return;
    }
    // default nag
    g.say('manager', g.pick(MANAGER_NAGS));
  };

  // ---- WIN cutscenes ------------------------------------------------------
  OQ.winA = function (g) {
    g.cutscene([
      ['walkNpcTo','manager','me_desk'],
      ['say','manager',"Quick refocus chat. Also where's the dem— "],
      ['fn', gg => gg.setNpcTarget && 0],
      ['say','manager',"...what's this note. 'QUACKCORP DEMO — 1 HOUR — BRING THE DUCK'??"],
      ['me',"Oh no. Is the demo duck not... on the shelf?"],
      ['say','manager',"THE DUCK IS GONE. THE DUCK IS GONE AND OUR BIGGEST CLIENT *MAKES DUCKS*."],
      ['say','manager',"I'll be back in forty minutes. Hold my calls. Hold the entire building."],
      ['walkNpcTo','manager','exit'],
      ['fn', gg => gg.hideNpc('manager')],
      ['win','THE RUBBER DUCK CRISIS'],
    ]);
  };
  OQ.winB = function (g) {
    g.cutscene([
      ['me',"*inhale* ...*dials the Manager's desk phone in a squeaky helium voice*"],
      ['say','me',"\"Hellooo?? It's your mother-in-law! WHERE are the anniversary FLOWERS?!\"",{squeak:true}],
      ['walkNpcTo','manager','me_desk'],
      ['say','manager',"Ma? How did you call my desk phone? ...The anniversary dinner is WHEN?"],
      ['say','me',"\"It is happening NOW. Your wife is CRYING into the hummus. GO!\"",{squeak:true}],
      ['say','manager',"Oh no. OH NO. I forgot the anniversary. I have to GO."],
      ['walkNpcTo','manager','exit'],
      ['fn', gg => gg.hideNpc('manager')],
      ['win','THE FORGOTTEN ANNIVERSARY'],
    ]);
  };
  OQ.winC = function (g) {
    g.cutscene([
      ['say','manager',"You said... a MANDATORY standup? In Synergy? With pizza?"],
      ['me',"Required attendance. Free food. Recurring every fifteen minutes. Forever."],
      ['say','manager',"That's... that's the most legitimate thing I've ever heard. I'm IN."],
      ['walkNpcTo','manager','meeting'],
      ['fn', gg => gg.setState && gg.obj('room_sign') && (gg.obj('room_sign').state.flipped = true)],
      ['say','manager',"Wait, where's the agenda? Why won't the door— is this thing AUTO-LOCKING—"],
      ['me',"Enjoy the synergy, Manager. Enjoy it forever."],
      ['fn', gg => gg.hideNpc('manager')],
      ['win','THE ETERNAL FREE-PIZZA STANDUP'],
    ]);
  };

  // ---- random colleague interruptions (absurd R&D requests) --------------
  const INTERRUPTIONS = [
    "Hey, can you make the logo, like, 10% more blockchain?",
    "Quick one: add AI. Anywhere. Doesn't matter where. Just... AI.",
    "Can you center this div? I've been trying for six years.",
    "Client says the app's too fast — add a loading spinner so it feels trustworthy.",
    "We need dark mode AND light mode. At the same time. By EOD.",
    "Legal needs the cookie banner to also collect the user's star sign.",
    "Can you rewrite it in Rust by lunch? It's for vibes.",
    "The intern force-pushed to main again. On purpose. As performance art.",
    "Make the button more... clickable. Clickier. You know.",
    "Is it possible to make the database, like, more cloud?",
    "Prod is down. JK. Unless? ...no. ...okay maybe check though.",
    "We need it to work offline. And online. But mostly offline-online.",
    "Marketing wants the 404 page to 'spark joy and also a little fear'.",
    "Can the app be more 'enterprise'? Add more grey. And a login no one needs.",
    "Customer wants to undo things that haven't happened yet.",
    "The CEO saw a TikTok. We're pivoting. Don't ask to what. I don't know either.",
  ];

  // ---- export -------------------------------------------------------------
  OQ.world = {
    title: "OFFICE QUEST — Stage 1: “Refocus This”",
    clusters: CLUSTERS,
    decor: DECOR,
    objects: OBJECTS,
    combos: COMBOS,
    interruptions: INTERRUPTIONS,
    heroStart: { cluster:'me_desk', dx: 36, dy: 36 },
    speakers: {
      me:  { name:'Me',  color:C.teal },
      manager: { name:'Manager', color:C.red },
      devA:  { name:'Coworker', color:C.pink },
      devB:  { name:'Coworker', color:C.org },
      devC:  { name:'Coworker', color:C.purple },
    },
    // any path's flag set completes the stage (checked by engine after combos/talks)
    useCombo(src, tgt, g) {
      const fn = COMBOS[src + '>' + tgt] || COMBOS[tgt + '>' + src];
      if (fn) return fn(g);
      return false;
    },
  };
})();
