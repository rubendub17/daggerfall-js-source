# THE BENCHMARK — a plan (BENCH1)

*A plan for review, started. Every path and seam named below was read in the working tree
(`f4bcdcfc30`) before it was written; the modules listed under "What has landed" at the end
are built and green, and nothing else is.*

## What is being built

One unattended run of the **real game** — the real renderer, the real streamer, the
real motor, the real AI — through the kinds of play a player actually pays for, reporting
numbers that can be compared across machines and across versions:

- a character **running through the busiest city** on the map, in god mode, so it cannot die mid-run;
- **dungeons** walked and fought in;
- **combat** — the engine's own foes swinging at the player while the player swings back.

Offline by design: no relay, no account, no upload. The only thing a person needs is the
same ARENA2 folder offline play already needs, and the only thing they get is a file on
their own machine.

Two doors, one law:

| door | who it is for | what it does |
|---|---|---|
| `?world&bench&…` | **anyone** — a player in their browser, or link | runs the legs in their own game, shows the result card, offers a copy/download |
| `node tools/benchmark.mjs` | a developer, and CI | the same run headless or headed, optionally with the profiler, writing JSON + Markdown |

The in-game door is the product ("anyone can test and run"); the CLI is the same run with
a recorder attached, so there is never two definitions of what the benchmark is
(`Home.md`: ONE DFU MEMBER, ONE EXPORT — one exports, the other imports).

## Why it is needed, in one number

The report already in the tree (`cpu-report.md`, 2026-10-19) reads **11 fps** and then
splits it: **GPU 100.86 ms a frame against 21.46 ms of the game's own JS**. A benchmark
that returned "11 fps" would send the next reader into `src/` to optimise a fifth of the
frame. So the result is never one number: frame time, its GPU half (`?perf`,
`src/render/perfMeter.js`) and its JS half (`script`, `src/systems/frameClock.js`) travel
together, leg by leg.

## The instruments — all existing, each defined once

| measure | today's owner | how the benchmark takes it |
|---|---|---|
| frames a second, mean/worst, script ms, draws/binds/view/shadow | `src/ui/fpsCounter.js` (`window.__fpsStats()`) | read it as one cross-check; do **not** re-derive it |
| per-frame stamps → p50/p95/p99 and the 1 % low | `fpsStats(stamps)` — already exported, pure | the benchmark's own recorder keeps the leg's stamps and calls **the same** pure function/percentiles |
| GPU a frame, and the pass it went to | `src/render/perfMeter.js` — `?perf`, `?perf=zones`, `meterFor(gl)` | the meter's own numbers; the `[perf]` console line as the fallback the profiler already parses |
| CPU profile, allocation profile, per-function self time | `tools/cpuReport.mjs` | **the profiler itself**, invoked by the CLI (`--profile`), not a second sampler |
| the scene's census (people, foes, draws, dpr, scale, GPU name, build) | `__fpsStats()`, `__people()`, `__foes()`, `renderer.frameInfo` | recorded beside every leg, so two runs can be shown to have measured the same scene |

`tools/cpuReport.mjs` today is a script, not a library: importing it runs it. Its pure
half — `aggregate`, `aggregateAlloc`, `parsePerf`, `framePlace` — moves to
`tools/lib/cpuProfile.mjs`, and `cpuReport.mjs` imports it. That is a move, not a rewrite:
`npm run cpu` must behave identically, byte for byte, on the same page.

## The legs

Every leg is the same pinned scene on every machine and every run. The pins are the
world host's own URL doors, all read out of `src/scenes/world.js`:

```
region=Daggerfall&loc=Daggerfall      the capital — the densest place offline
&tod=<fixed>                          parseTimeOfDay
&weather=sunny&wseed=<fixed>          weatherSim, pinned so no leg measures rain by luck
&season=<fixed>
&class=<fixed>                        the headless-chargen skip (also what keeps a probe
                                      from typing into the character wizard — T2)
&bench=<legs>                         the door this plan adds; implies the world host
```

| leg | what runs | why it is in the score |
|---|---|---|
| **B1 the street run** | the player at a run along a recorded track through Daggerfall's streets: the real motor and collider, the town's own crowd, watch, lights, encounters | the everyday case, and the one players report |
| **B2 the crowd** | the same spot, standing and turning: every townsfolk in frame, the flats, the lanterns | the "busy city" number on its own, without the walk |
| **B3 the dungeon** | a dungeon's rooms walked: torches, water, the dungeon collider, its foes | the other half of play, and the one the field reports pair with the first ("fine in the interior") |
| **B4a the fight, blade** | N of the dungeon's own foes engaged, the player swinging the class kit's own blade on a fixed cadence, blows landing both ways, god mode withholding the damage | combat cost is the one nobody can read from a static scene |
| **B4b the fight, bow** | the same ring of foes, a Long Bow drawn and loosed on the same cadence: the draw, the arrow's flight, the hit | the ranged system is its own cost — the rig, the missile, the arrow's own draws |
| **B4c the fight, spell** | the same ring again, a readied missile spell cast on the same cadence: the cast frame, the flier, its light and its blast | magic is its own cost again — the cast, the missile pool, the spell effects' lights |
| **B5 the stream** | a map journey from one pixel to another, measured from the click to `__streamIdle()` — the loading the profiler deliberately excludes | players feel this one most, so it is measured, and reported separately from B1–B4 |

An interior (tavern, shop) is an optional **B6** — worth having, not worth blocking on.

### The three combat systems, and why all three

A benchmark that fights with one weapon measures one system. The port has three ways to
hurt something and they cost the frame in different places, so the fight leg is **three
sub-legs on the same foes, the same ring and the same cadence** — only the weapon changes:

| sub-leg | what the character holds | how it is armed | what it puts on the frame |
|---|---|---|---|
| **B4a blade** | the class kit's own blade | nothing to do — `?class=` already kit it | the weapon rig's swing, the hit resolution, the hit effects |
| **B4b bow** | a Long Bow and a full quiver | `testGearRows()`'s archery row through `createWeapon`/`addItem`/`equipItem` — the Test Room's own producers | the draw and the aim, the arrow entity, its flight and its hit |
| **B4c spell** | a readied missile spell | `addTestMissileSpells(playerEntity, spellsByIndex)` then `magic.setReadied(sp)` | the cast frame, the missile pool, the flier's light and blast |

**The press is the player's, not the benchmark's.** All three are driven by the *same* held
swing key, because that is the ladder the game already runs on a press:
`magic.interceptAttack(true)` first ("an armed cast eats the click"), and otherwise
`weaponRig.attackInput(dx, dy, held)`. So the bot learns nothing about weapons: it holds
SwingWeapon, and the game decides which system answers. That is the whole point — the
benchmark measures the systems as they are wired, not as a harness wishes they were.

**Nothing is minted twice.** The bow, the quiver and the missile spells come from
`src/systems/testRoom.js` (`testGearRows`, `addTestMissileSpells`), which is already the one
home for "a prebuilt character with real equipment through the real equip table"
(`Home.md`: ONE DFU MEMBER, ONE EXPORT — one exports, the other imports). The combat sub-legs
add no item table of their own.

God mode matters most here: the foes still swing, still close the distance and still land
their blows — only the subtraction is withheld. A fight leg without it would end the run.


God mode is the engine's own switch: `setStaffPowers({ god: true })`
(`src/characters/playerEntity.js`), the same line `/god` writes, read at the one damage
door (`hurtPlayer` → `playerDamageWithheld`). It is asserted at every leg start and the
run **fails** if the player's health moves.

## The honesty rules (this is most of the design)

1. **One URL per run, recorded in the result.** Place, time, weather, seed, season, class,
   and the settings fingerprint. A number without its scene is not a measurement.
2. **The benchmark forces its own quality preset and records it** (render scale, shadows,
   grass, trees, crowd, cap/vsync), then restores the player's own settings. `&bench=as-is`
   measures their settings instead — also recorded, never mixed into a stored baseline.
3. **N repetitions, median and spread.** The project's own discipline: "a run's own spread
   is about ±0.4 ms" (`07-Rendering/Performance-Updates.md`). The browser door runs once
   and says so; the CLI defaults to three and prints the spread.
4. **Headless is labelled.** A SwiftShader run is a relative number — `perfProbe.mjs`
   already labels it, and a published score refuses it.
5. **God mode is stated, not hidden.** The veto sits *before* the shield pool and the
   damage modifiers, so the AI, the animations and the swings are unchanged; what is
   skipped is the subtraction and its feedback (the hurt flash, the blood). The report
   says exactly that.
6. **Falls, the void, drowning and lethal exhaustion are not blows** — they are
   `SetHealth(0)` doors the veto does not touch. The tracks avoid them; if health moves
   the leg fails and names why, rather than healing silently into a different game.
7. **A run that cannot fail is not a probe** (`test/tooling/probehygiene.test.js` T3). No
   frames, a page error, a dead player, a census below its floor (fewer townsfolk / foes
   than the leg promises), or a leg the machine could not reach ⇒ named failure, non-zero
   exit from the CLI, a red card in the browser.
8. **Nothing leaves the machine.** No upload path exists in the code at all. A benchmark
   that phoned home would be a privacy hole in a project that keeps a `privacy/` page.

## The score

Per leg, printed as a table and exported as JSON:

```
fps mean · 1% low (1000 / p99 frame) · p50/p95/p99 frame ms · worst
script ms mean and 1% worst · GPU ms mean (from ?perf) · draws · binds
census: people, foes, lights · world/canvas, dpr, scale · GPU name · build
```

The headline is a **harmonic mean of the per-leg 1 % lows** — "the frame rate of the
worst frames", which is what a player feels — with a letter band beside it. The table is
always shown with it: a scalar invites optimising the scalar, and the whole point of the
instrument is to say *which half* of the frame the milliseconds are in.

## Where the code goes — the hosts do not grow

`01-Overview/Host-Split.md` and `Home.md` are explicit: new behaviour is a module the
host wires (`src/scenes/fishHost.js` is the shape), never code inside `bootWorld`. So:

| file | what it owns |
|---|---|
| `src/scenes/benchHost.js` | `createBenchHost({ …deps })` — the legs in order, the transitions, the census, the god switch, the overlay's data, `window.__bench`, teardown. Wired by `bootWorld` with **one line** (a create and a tick), as every sibling host is. |
| `src/systems/bench/law.js` | the legs' definitions, the pinned URL, the census floors, the score maths, the grade bands. Pure, injectable, tested. |
| `src/systems/bench/recorder.js` | per-frame stamps → percentiles; `summarise(stamps, legs)` pure. |
| `src/systems/bench/track.js` | the recorded tracks and the **steerer** that turns a track into held keys and a look heading. Pure; the motor is the game's. |
| `src/systems/bench/bot.js` | the synthetic input source: `KeyboardEvent`s carrying the registry's own codes — the idiom `src/ui/gamepadInput.js` already uses ("a button's edge is a synthetic KeyboardEvent whose code is the Unity name"), so no host learns a second vocabulary, and everything it presses it releases on teardown (`ui/touch/touch.js`'s `up()` guard). |
| `src/ui/benchOverlay.js` | the leg's name, progress, live numbers, the result card with Copy / Download. Skin-aware like every other overlay. |
| `tools/benchmark.mjs` | the CLI: builds the URL, opens it, waits for `window.__bench`, collects the result, `--reps`, `--profile`, `--zones`, `--out`, `--headed`. |
| `tools/benchTracks.mjs` | **the track author**: boots the city, reads the collider and `__doors()`, records/solves a walk loop, and writes the track data — plus a screenshot strip for a human to reject a track that walks through a wall. |
| `tools/lib/cpuProfile.mjs` | the profiler's pure half, extracted (see above). |

The bench needs the world host's own doors (settle, mode, feet, enter/exit a dungeon).
They are handed in as deps — the same list a sibling host gets — not reached for through
`window.__*`, which is the shot gate's surface and not a contract.

## Slices, in order

Each one ships, is verifiable on its own, and none of them leaves the tree red.

- **S1 — the law, the recorder, the card.** Score maths, percentiles, the overlay and its
  result card, the pure tests. Driven by `&bench=dry`, a synthetic frame source: proves the
  instrument and the maths on any machine before a single leg exists.
- **S2 — the bot and the capital.** The synthetic input, the steerer, the Daggerfall track
  authored by `tools/benchTracks.mjs`, and B1 + B2 measured and shown. This is the slice
  that can fail honestly: a track that stalls must say so.
- **S3 — god mode and the census.** The switch at each leg start, the census readings, the
  fail rules, and the health-moved check.
- **S4 — the dungeon and the three fights.** B3, then B4a/B4b/B4c on the same ring of foes
  with only the weapon swapped: the blade as booted, the bow from `testGearRows`'s archery
  row, the spell from `addTestMissileSpells` — all three pressed through the one swing key,
  so `magic.interceptAttack` and `weaponRig.attackInput` decide which system answers. The
  god veto is proven here (health unchanged, and a log line saying so).
- **S5 — the stream.** B5, on its own clock, reported apart from the frame legs.
- **S6 — the CLI and the profiler.** `tools/benchmark.mjs`, the `cpuProfile.mjs`
  extraction, `--reps`/`--profile`/`--zones`, JSON + Markdown out, T2/T3 green.
- **S7 — the door and the page.** A **Benchmark** entry beside **Test Room** in the enhanced
  menu's offline doors (`HOME_OFFLINE`), the `bible/07-Rendering/Benchmark.md` page, its
  lines in `Page-Index.md` and `Active-Arcs.md`, and the patch notes in the PR description.

## Tests

- `test/systems/bench/law.test.js` — the preset URL carries `class=` and never `online`; the
  pins are the ones the code reads; the score and grade bands (mutation-checked: a pin that
  survives a one-character mutation is not a pin).
- `test/systems/bench/recorder.test.js` — p99 and the 1 % low from known stamps; a single
  frame and an empty window answer `null`, never `0` (a zero would read as "free").
- `test/systems/bench/track.test.js` — a waypoint list yields a forward key and a bounded
  heading; a track point off the collider is refused at author time.
- `test/systems/bench/bot.test.js` — every code it presses is bound in `inputActions.js`'s
  registry, and teardown releases all of them.
- `test/systems/bench/hygiene.test.js` — a source sweep: the bench never writes
  `player.health`, never touches the online lane, never `fetch`es a result anywhere, reaches
  god mode only through `setStaffPowers`, and mints no item of its own (the combat kit is
  `testRoom.js`'s — a second bow table is how two rooms drift apart).
- The existing `test/tooling/probehygiene.test.js` picks `tools/benchmark.mjs` up on its
  own (T2: `class=` present; T3: it judges), and `test/scenes/hostceiling.test.js` holds
  `bootWorld` to its ceiling — the wiring line is all it gets.

## Acceptance — the run is done when

1. On the machine's own GPU, `?world&bench` finishes every leg unattended, shows the table,
   and exports it.
2. The same URL twice gives per-leg medians inside the stated spread, and a census inside
   its floor.
3. Every failure mode is loud: a killed player, a page error, a leg with no frames, a scene
   that is not the scene. Each names its leg and exits non-zero from the CLI.
4. `npm run lint`, `npm run types`, the bible's gates and the change's own test files are
   green; `npm run cpu` is unchanged by the extraction.
5. The first recorded run (on a real GPU — this tree's only profile is SwiftShader and says
   so) lands in the page as the baseline the next change is measured against.

## Open questions for the owner

- **The run owns the machine (owner, 2026-10-19).** "when i use that tool the game will launch and
  the character and scenes will play on their own … all in first person like im controlling the
  game and all the user input will be disabled until the benchmark end", and the tutorials
  disabled. So the tool is not a URL to play in: `npm run bench` launches the browser, the game
  boots, the bot plays, and the person's hands are OUT of it — a capture-phase lock
  (`systems/bench/lock.js`) refuses every `isTrusted` event before the hosts' own listeners see
  it, while the benchmark's synthetic presses (`isTrusted === false`) pass by construction. The
  pointer lock is released once (the one camera a listener cannot refuse), so the look stays the
  bot's. Tutorials are switched off for the run and the player's own setting is put back at the
  end, as is the lock. First person is the port's default and the lock keeps it there (the wheel,
  which is how a player swaps to third person, is among the refused events). The card and the
  report say all three: `run: the player's hands are locked out | tutorials off`.
- **Decided (owner, 2026-10-19): a health pool, not `/god`.** The engine's own god mode
  withholds the blow *before* the shield pool, the damage modifiers and the evasion roll, which
  would take all four out of what the fight legs measure; the pool leaves every one running and
  only makes the subtraction small. `BENCH_VITAL` is the pool, the host writes it once at the
  start of a run (the ONE write to the body, held by `test/systems/bench/hygiene.test.js`), and
  the report records it as `vital`. Nothing heals the body mid-run: a fight the body survives is
  still a fight measured.
- **A score: yes, but never alone.** The table is the measurement; the scalar is the harmonic
  mean of the legs' 1% lows, printed beside the table and never stored without it.
- **Which class the character is.** The kit changes the fight (a bow, a spell, a blade), so
  the class is pinned and recorded. Recommendation: the Nord Warrior, as the Test Room's
  baseline already is.
- **Is a score the owner wants at all?** The table is the measurement; the scalar is a
  convenience for "compare our machines". Recommendation: ship both, the scalar derived
  from the table and never stored without it.
- **The first GPU baseline.** Someone with a real GPU has to run S2 once for the page to
  carry a number rather than a shape.

## What has landed (2026-10-19)

S1 and most of S2/S4/S6. Everything below is written, linted, typechecked and tested; **nothing
below has been run against the game in this checkout** — there is no ARENA2 here — so the
runtime pass is the one thing still owed (see "Next").

| file | what it is | its pins |
|---|---|---|
| `src/systems/bench/law.js` | the seven legs in run order (each naming its **page**: street/crowd/stream are the streaming world's, the dungeon and its three fights the dungeon host's), the one URL per page, `parseLegs`, the harmonic mean of the legs' 1% lows and its bands, the census floor, and `BENCH_VITAL` — **the health pool** | `test/systems/bench/law.test.js` (16) |
| `src/systems/bench/recorder.js` | a leg's stamps → mean, min, p50/p95/p99, worst and the 1% low; nothing to measure answers `null`, never `0` | `test/systems/bench/recorder.test.js` (8) |
| `src/systems/bench/track.js` | a route's waypoints, the bearing in the hosts' own yaw, the turn as a rate, the forward-only cursor, and a route that cannot be walked refused with its reason | `test/systems/bench/track.test.js` (9) |
| `src/systems/bench/tracks.js` | the route the city leg replays — **shipped empty on purpose**: `tools/benchTracks.mjs` writes it, and a place with no track is a leg that reports itself unrun | `test/tooling/benchtracks.test.js` (8) |
| `src/systems/bench/bot.js` | the hands: the player's own bound codes, pressed once and released, one swing for a blade, a bow and a spell | `test/systems/bench/bot.test.js` (7) |
| `src/scenes/benchHost.js` | the leg machine and the two page factories (`createWorldBench`, `createDungeonBench`), `window.__bench` for the CLI, and the card | `test/systems/bench/benchhost.test.js` (10) |
| `src/ui/benchOverlay.js` | the card: the checklist while the legs run, the table when they end, the failures last, Copy/Download of its own text | `test/systems/bench/overlay.test.js` (7) |
| `src/scenes/world.js` | the benchmark, wired: `?bench=<legs>` is a mode of the world host, ticked once a frame on the rAF stamp | `test/scenes/hostceiling.test.js` (unchanged — the wiring fits under `bootWorld`'s ceiling) |
| `src/scenes/dungeon.js` | the same, on the dungeon host: the dungeon walked and the three fights, armed through `testRoom.js`'s producers and equipped through `equipItem` | — |
| `tools/benchmark.mjs` | the CLI (`npm run bench`): both pages, one merged report, `--reps` medians, `--profile` through the profiler's own `aggregate`, JSON + Markdown | `test/tooling/benchmarkcli.test.js` (11) |
| `tools/benchTracks.mjs` | the route author (`npm run tracks`): boots the pinned capital, plans a walkable route, **walks it** with the real W key, photographs every waypoint, writes the module, judges last | (the same file, above) |
| `tools/lib/cpuProfile.mjs` | the profiler's pure half, moved whole out of `tools/cpuReport.mjs` so the benchmark and the profiler share ONE `aggregate` | `test/tooling/benchprofile.test.js` (6) |
| `src/systems/bench/lock.js` | the player's hands off the game: a capture-phase lock that refuses every human event before the hosts' own listeners, releases the pointer lock, and lets the benchmark's synthetic presses through by construction | `test/systems/bench/lock.test.js` (5) |
| `test/systems/bench/hygiene.test.js` | the bench's own laws swept over its own source: the body is the pool written once from the law, **no `/god`**, no online lane, **no upload path at all**, no second item table, no key code spelled | (7) |

`tools/cpuReport.mjs` is +8/−137 and behaviourally identical: the moved `aggregate` was diffed
block for block against `HEAD` and run over the committed `cpu-report.cpuprofile` (107,295
samples) for a byte-identical answer.

Documentation the gates required, done in the same change: a row per new suite and the Suite
line in `09-Testing/Testing.md`; the `391 modules` line in `10-UI/UI.md` with the card's entry;
the `703 modules` line in `06-Systems/Systems.md` with the bench's four.

**Verified:** `npm run lint`, `npm run types`, every suite above, `probehygiene`, `hostceiling`,
and — on an **LF checkout** at `HEAD` with the change applied — `manifest`, `citeanchor`,
`citedrift`, `ledger` and `audit18_bible_docs`, all green. (`mutantdrift` is red on `HEAD`
itself in this checkout, naming records that no longer apply: it is not this change's.)

**Next, and the only thing missing:** the capital's track, which only a machine with the data can
author (`npm run tracks --headed`). Everything else runs today.

## The first real run (2026-10-19, the owner's machine, Opera GX on an AMD iGPU)

```
$env:ARENA2_PATH = "C:\Users\ruben\Downloads\DaggerfallGameFiles\arena2"
npm run bench -- --legs crowd,stream

leg                       1% low    fps      p95      p99    script      gpu  draws
The crowd                     30     35     33.3     33.4      19.3        —  657
The stream                     7      7    133.5    133.5      19.3        —  657
SCORE 12 (D)
```

What the run cost, and what it found:

- **THE BROWSER IS THE MACHINE'S, NOW** (`tools/lib/browser.mjs`). The first `npm run bench` failed
  with "no browser to launch" on a machine holding two perfectly good Chromiums: playwright wanted
  its own build (1194), the cache had 1217/1234, and the ladder read the CI's `/opt/pw-browsers`
  path. It is now: `CHROME=`, **the OS's default browser by its own registry answer**, playwright's
  bundled build, the installed Chrome/Edge by channel, its cache, then the known paths - every rung
  tried, and the winner printed (`bench: browser - ...opera.exe`). The number belongs to that
  browser, so the run says which one it was.
- **THE WINDOW WAS MEASURED THROTTLED.** A Chromium window that opens behind the terminal is
  *occluded*, and an occluded window's frames are throttled to about one a second: the first runs
  measured a 1 fps "game" that was the browser's own throttle, and its boot never finished. The
  launch now refuses every throttle (`--disable-backgrounding-occluded-windows`,
  `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`) and raises the
  window. 1 fps -> 60.
- **THE WIRING WAS IN A BLOCK THAT NEVER RAN.** BENCH1's `?bench` wiring had landed inside
  `if (hud) {`, so the host was never created on a machine whose HUD was not up - the run
  reported "lost window.__bench" over a game playing perfectly. Moved to the top level of the boot.
- **THE CROWD'S CENSUS WAS WRONG, AND THE TRUTH IS A FINDING.** The leg required 8 townsfolk and
  read 0. The game's own probe says why: Daggerfall's population pool is **empty** (`pool 0`,
  `maxPopulation 96`) while the street is built and drawing 657 calls. So the world legs are now
  censused by the town being built (`pixels`, the scene's structural fact) with the crowd
  **reported beside it** - `census: { pixels: 3, people: 0 }` - which is how that emptiness became
  visible instead of being a red card hiding the frame rate. **Whoever owns the population system
  should look at why a capital at noon has an empty pool**; the benchmark will keep reporting it.
- **Still owed:** the street track (`npm run tracks --headed`), the dungeon page's first real run,
  and the card's `gpu` column (the perf meter exposes no last-GPU read to a module yet - the
  number is in `--profile`).

## The first WATCH, and what it exposed (the owner, same evening)

Four things a person sees that a test does not:

- **"The stream ends too fast - I couldn't even see it."** It did: the leg measured `settle()`, and
  the settle of a journey that never left is immediately true, so it ended in three frames and
  reported 7 fps over a second and a half nobody could watch. The leg now witnesses the stream
  **busy** before an idle stream may end it, holds `STREAM_MIN_MS` (8 s) whatever else happens, and
  says which of three things went wrong: the map refused to open a journey, the journey opened no
  queue, or the queue never settled. **A journey needs a destination pick, and this build's door
  opens the map only** - so `stream` is on `BENCH_UNWIRED` until that door exists.
- **"When it goes to the fighting part it's the new character login screen."** It was: the
  standalone dungeon host never mints its character from `?class=`, reproduced **without the
  benchmark on the page**. So the run refuses to film it (a `chargenDone === true` test, because a
  wizard's flag is `null` and the first cut asked `!== false` and walked past it), and the four
  dungeon legs are on `BENCH_UNWIRED` with that reason. **Wiring the dungeon's character door is the
  next slice, and the fights are all that stand behind it.**
- **"Remove 'the real game' from the benchmark UI."** Done - the card's subtitle is "the game plays
  itself" and the console line is just the legs.
- **"Deactivate those helping messages on the right that only disappear when I click a key."** That
  is the tutorial card (`ui/tutorialPopup.js`), and switching its pref off was not enough: a card is
  read on **dismissal**, not on display, so a queued one stayed up over the whole run.
  `clearTutorialLine()` now runs at the run's start and at every leg.

`BENCH_UNWIRED` (in `law.js`) is the list of legs whose scene door is not built yet, each with a
sentence. The CLI drops them from the request, prints the sentence, and opens only the pages that
still have something to play - a run asks for what it can play and says what it left out. A leg on
that list still fails **by name** if a host is asked for it some other way.

## The second WATCH: all seven legs, each in the scene it names (2026-10-19, later)

The owner ran `npm run bench` again and reported three defects, all fair: the tutorial cards were
still there, the fighting part was a body standing still in a dungeon, and the dungeon part "just
walked forward". Every one of them was the bench asking a question the engine does not answer in the
shape the bench asked it, which is the real lesson of this tool:

- **THE TUTORIAL CARDS ARE OFF AT THE SOURCE, NOT HIDDEN LATER.** A card is read on *dismissal*, and
  `dismissTutorials()` itself re-queues the card it removes (its `onReplaced` handler fires, because
  `ActionTextBox.dispose` never sets `done`). It only stayed gone while the pref was off - and the
  pref was turned off on the run's **first tick**, minutes after the welcome tour had been queued
  350 ms into `bootWorld`. So the switch is now FORCED one line after the doors are read in
  `src/main.js` (`uiPrefs.forcePref`, a volatile force that writes nothing to the player's shelf),
  before any host is imported: nothing is queued, `tutorialDue()` answers false at every seam, and no
  card is ever built. `?notutorial` is the same door by hand. Two more switches ride with it, because
  two legs depend on them and two machines must not be compared across them: `enhancedAI` (which bakes
  the navmesh the dungeon walk uses) and `livingWorld` (which puts the crowd on the street).
- **THE DUNGEON HAD NO FOES AT ALL, AND THAT WAS A RELEASE-OLD BUG IN THE GAME.** Chasing "the
  fights take nothing off anyone" found it: `src/scenes/dungeon.js`'s opts literal began with
  `// HT1: the torch keys` and went on, on the SAME line, with `foes: !params.has('nofoes'),
  playerClass: …, playerSpell: …, playerWeapon: …`. A line comment is a line, so those four
  properties were never in the object at all: the standalone dungeon host stood **no foes** - every
  one of its enemy markers fell silently to the static-flat fallback - and `?class=` never minted a
  character there, which is exactly the "new character login screen" the owner reported two days
  earlier, and why the bench had grown a shim for it. The comment now sits on its own lines, the
  shim is deleted, and the page is a dungeon: 42 live foes out of Privateer's Hold's markers.
- **THE FIGHT NEEDED THE MOUSE'S DOOR, NOT A KEY.** `SwingWeapon` binds to `Mouse1`, the dungeon
  host's per-frame latch deliberately skips mouse codes, and a synthetic `KeyboardEvent{code:'Mouse1'}`
  reaches neither that latch nor the window's `mousedown` handler - so the press went nowhere, and
  three more things were wrong behind it: `nearestFoe` read a `pos` field a dungeon foe record has
  never had (every distance came out `NaN`, so no foe was ever found), the weapon started SHEATHED
  (so even a real press returned), and the leg stopped 4 m short of a weapon that reaches 2.5 m. Now:
  `systems/bench/fight.js` reads `foe.ai.feet` and answers the standoff the weapon needs, the run
  presses the player's own Ready Weapon binding once, holds the host's `playerAttackInput` door for
  exactly as long as the bot holds the swing (the door the window's `mousedown` calls, and the one
  that runs `magic.interceptAttack` first so a bow and a spell need no code of their own), and each
  fight leg **proves its damage**: the foes' health is read again at the leg's end, printed on the
  card, and a leg that took nothing off it is a named failure - a body flailing is not combat.
- **THE DUNGEON IS WALKED ON THE DUNGEON'S OWN MESH.** The old leg held forward and walked into the
  first wall it met, and scored the wall's frame rate. The engine already has the answer its own foes
  use: a navmesh baked from the collider (`findPath`, `ai/nav/navmesh.js`). The host hands the bench
  that query (`plan`) plus the mesh the foes path on, `systems/bench/dungeonPath.js` picks the
  furthest destination that is actually reachable and follows the route waypoint by waypoint, and the
  walk leg's settle phase waits for the bake (30 s ceiling) so a route is never asked for before the
  mesh exists.
- **BOTH PAGES PIN THEIR PLACE.** A dungeon's floor plan is DATA, not a sample: `?dungeon` reads a
  MAPS.BSA location by name. The URL now names it (`&dungeon=Privateer's Hold`, the first dungeon
  every player starts in), so two runs walk the same floor.
- **THE TOWN LEGS WERE STANDING IN THE WRONG PLACE, AND THE ROUTE KNEW IT.** The pixel key had a
  stray space and two backslashes in it (a shell edit, not a design), so the town was never found;
  `centre()` was the middle of the *grid*, which for the capital is the inside of a block; and the
  route was planned with the nav's `[x, z]` pair in `planRoute`'s `[x, y, z]` slot, so it started at
  the town's south rim. Now the centre is the town's own middle (`seatBanners.townCentreOf`, the mean
  of its buildings, the point the Seats hang their banners on) snapped to the nearest cell a walker
  may stand on (`snapToWalkable`), the route starts from the body's own cell, its dice are seeded on
  the pixel so the same town is the same walk twice, and `townPixel()` finds the town even when the
  boot landed the body in a wilderness neighbour - which is also what was emptying the crowd, since a
  living town stands its people within 150 m of the PLAYER.
- **THE STREAM LEG WAS ASKING A WINDOW TO PICK A DESTINATION.** The travel view opens the map; a
  destination needs a hand. The leg's subject is the hitch of arriving somewhere unbuilt, and the
  engine's own door for that is the pixel builder, so the leg now builds one pixel next door
  (`__pixelBuild`, through `world.build`) and measures the settle. It runs, and it reads as the
  lightest leg in the run - which is itself the finding.
- **THE CHARACTER IS WAITED FOR.** `?class=` mints the body asynchronously, and the run checked once,
  on its first frame: a machine busy with something else failed a run whose character was still
  arriving. The run now waits up to 60 s (`BODY_WAIT_MS`) and names the absence after it.

Measured on the owner's machine in that state (Opera GX, AMD iGPU, Daggerfall's centre with a live
crowd): street 14 fps 1% low, 1318 draws; crowd 14 fps 1% low, 1364 draws; stream 53 fps 1% low, 72
draws. The score is the harmonic mean of the legs' 1% lows, so a heavy town leg drags it - which is
the number a player feels, and the reason the instrument exists.

## The third WATCH: things a person sees that a number does not (2026-10-20)

Four reports, and every one of them was right:

- **"THE STREAM DIDN'T DO NOTHING."** It built the pixel next door - regularly open wild - and left the
  camera where it stood, so the window showed a town the viewer already knew. The destination is now
  the engine's own answer to *somewhere else*: `__travelNearest` (the probe behind the travel map's
  search) names a DISCOVERED place at least two map pixels away, the pixel builder builds it, and once
  it has settled the body is STOOD IN IT through the host's own warp - so the leg is an arrival, the
  arrival is watched for `STREAM_LAND_MS`, and the stream that follows is measured.
- **"IN THE BLADE COMBAT THE GUY IS HAND TO HAND."** The pins mint a Nord Warrior whose kit is not a
  swung weapon, and the leg was measuring a fist. `armGear('blade')` now takes a longsword from the
  Test Room's own rows - the table the bow already comes from, so there is still one item list.
- **"IN THE MAGE PUT A TIMEOUT BETWEEN SPELLS, IT'S SPAMMING TOO MUCH."** Right: the cadence was the
  melee's 700 ms, and a caster's is not a fighter's - a cast costs mana and its ready must be made
  again between casts. `SPELL_EVERY_MS` is 1.5 s now, so the leg reads as a caster and not as a
  machine gun. (The press has to stay HELD while the swing is: an edge-only press was tried and took
  both ranged legs down - the arrow never loosed and the cast never fired.)
- **"THE GUY ISN'T GOING THROUGH THE DUNGEON... YOU NEED TO NAVIGATE, WALK, GO INTO ROOMS, TURN
  AROUND."** Three causes. The card sat DEAD CENTRE over a dimmed page and hid the very corridor it
  was measuring - it is now a compact panel in the bottom-left corner with no page dimmer. The walker
  wore whatever pitch the last fight aimed with, so it walked the dungeon staring at the ceiling - a
  walker now looks level, along its route (`deps.level`). And the walk itself: a destination is now
  remembered (`WALK_VISITED_M`) so the leg crosses room after room instead of re-planning to the foe
  it just left, waypoints are reached at 0.6 m (the dungeon's own foe AI uses 0.45 m; 1.2 m cut
  corridor corners and walked into the walls it cut), the metres covered are printed on the card, and
  a body that stops moving for `WALK_STUCK_MS` abandons the route and plans again. A FIGHT leg now
  walks to its foe on the same mesh when the foe is out of reach, instead of being warped into a
  frozen stand ("in fighting scene char cant move place").
- **AND THE DUNGEON IS LIT.** A dungeon is dark until somebody lights something - that is the game -
  but a run nobody can see is not one the owner can judge, so the run presses the player's own
  Light-or-douse binding once at its start (`TorchToggleLight`), and a body carrying no light is
  unaffected.

The archer also keeps its range now (`BOW_STANDOFF_M` 8 m): a bow spawns its shaft at the bow, so a
blade's 1.6 m gave the arrow no room to become one - that is why the bow leg took nothing off the
foes' health while the mage's did.




