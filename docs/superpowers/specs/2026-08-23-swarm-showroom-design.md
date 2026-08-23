# The Swarm Showroom — Public Spectator Village

**Date:** 2026-08-23
**Status:** drafted from the monetization brainstorm; awaiting user review
**Track:** monetization sub-project **S1** of four (S1 showroom → S2 swarm feed
extensions → S3 drop system/auction → S4 delivery). This spec covers S1 only.
**Inputs:** the monetization brainstorm (this session), the Swarm-as-adoption-engine
design (session `swarm-adoption-engine`, approach A locked), the projects-village remap
(`2026-08-22-projects-village-remap-design.md`), and the visual mockups on the
[Swarm Showroom canvas](https://claude.ai/code/artifact/37c63481-71db-431d-a014-a3ebdccc2cf7)
plus their companion design brief (`swarm-showroom-design-brief.md`, session scratchpad;
the user is iterating the visuals in Claude Design — behavior specced here is stable,
visual detail defers to whichever mockup generation the user approves).

## 1. What this is

A public, hosted, spectator-mode Skill Village — working name **SWARM VILLAGE**,
suggested home `village.fenley.ai` — that renders the Swarm build-fleet's output as a
living pixel village anyone can visit. No login, no accounts, no money on this page.

It is the shop window for the monetization loop:

- Swarm starts a project → an **egg** appears in the nursery and incubates in public.
- The build completes → the egg **hatches** into a villager, on camera.
- Ordinary hatches are **commons**: they live in the village forever as proof the swarm
  ships. **Commons are never for sale.**
- A judge-scored, keeper-confirmed hatch is a **rare drop**: it stands on the pedestal
  with a countdown. The auction itself is S3; the showroom only stages and teases it.

The revenue model this serves is event-driven: the village is free to watch, and the
occasional 1-of-1 rare auction is the product. The showroom's job is to make the eggs
worth watching and the rare feel like an occasion.

## 2. What it is not (non-goals for S1)

- No auction machinery, bidding, payments, or buyer identity (S3).
- No repo transfer or creature delivery (S4).
- No changes to Swarm itself (S2 defines the feed extensions; S1 runs on today's feed).
- No chat, care verbs, petting, health, decay, or XP — spectators watch; nothing here is
  their responsibility. Showroom residents never sicken and never nag (same rule as the
  adoption-engine nursery).
- No viewer counts, fake activity, or invented stats. The chip shows real counts only.
- No multiplayer presence, comments, or notifications.

## 3. The lifecycle, inferred from today's feed

The showroom consumes `GET https://swarm.fenley.ai/api/projects` — entries carry
`slug`, `name`, `runs`, `description?`, `built_at`, `last_built_at`, and
`links { repo?, live? }`. Today's feed says nothing about eggs, judges, or tiers, so S1
infers state honestly and upgrades cleanly when S2 lands:

| State | S1 inference (today's feed) | S2 upgrade (feed extension) |
|---|---|---|
| **Egg** | entry has no `links.repo` | explicit `status: "incubating"` from lay time |
| **Hatch** | a poll observes `links.repo` appearing on a known egg | explicit `completed_at` — "the judge called it done" |
| **Common** | entry has `links.repo` | unchanged |
| **Rare** | slug listed in the keeper's config (§7) | judge proposes `tier: "rare"`; keeper confirmation stays manual |

Two honest consequences of the S1 proxies, embraced rather than hidden:

- An entry first seen already-built (e.g. discovered after a restart, or built between
  polls overnight) hatches **on the notice board** ("hatched while the lights were out")
  without a live animation. The live hatch plays only when a poll actually witnesses the
  transition.
- "Hatches when the judge calls the build done" is aspirational copy for S1 — the real
  S1 trigger is the repo link appearing. The copy stays, because S2 makes it true and
  the proxy approximates it today.

Egg liveliness maps to the feed: `runs` sets size/wobble appetite, `last_built_at`
within ~48h means an actively wobbling egg, staler means a dozing one — the same
growth-and-energy mapping the adoption-engine nursery uses.

## 4. Architecture

**Same repo, one new thin slice per package. Reuse is the whole design** — the showroom
is the game's renderer pointed at a different truth.

```
swarm feed ──poll──► showroom server ──REST+WS──► spectator web build ──► visitors
                     (droplet, one process)        (static, same KAPLAY scene)
```

### 4.1 Server: `packages/server/src/showroom.ts` (new entry point)

A second, slimmer entry point in the existing server package — **not** a fork:

- Polls the swarm feed on boot and every 5 minutes (the bridge rhythm the
  adoption-engine design already fixed). The fetch/validate/cache module is written once
  as `packages/server/src/bridge/swarm.ts` and shared verbatim with M5+'s nursery —
  per-entry validation, malformed entries skipped and logged, never poisoning the list.
- Holds showroom state in memory; persists two small JSON files on the droplet
  (`~/.swarm-showroom/`): the last good feed snapshot (outage tolerance) and the event
  log (hatches, new eggs, rare confirmations — the notice board's memory).
- Detects transitions by diffing consecutive snapshots: new slug → "egg laid" event
  (or straight to common if born with a repo); repo appeared → "hatched" event.
- Serves the spectator protocol: `GET /api/village` (full state: residents, eggs, rare,
  recent events) and a WebSocket that pushes state deltas and **hatch events** so open
  tabs see the moment live. Message shapes mirror the game's existing protocol
  (`packages/web/src/net/protocol.ts`) so the web client's parsing layer is reused.
- Is anonymous-safe: read-only, no cookies, no per-visitor state, cache headers on REST,
  and visitors never hit the swarm feed directly — the server is the shield.

### 4.2 Web: a spectator build of `packages/web`

The existing KAPLAY game with a build-time switch (`VITE_SPECTATOR=1`), not a new
package. What the switch changes:

- **Data source:** the spectator net client speaks the showroom protocol; no local
  file bridge, no `~/.claude` anywhere.
- **Removed:** chat panel, silent-movie banner, care interactions, every builder verb.
- **Added:** the side panel in read-only showroom form (§6), the nursery pen, the
  pedestal, the hatch sequence, the notice board card.
- **Kept wholesale:** sprite compositor, DNA→appearance, motion/behaviour system,
  zone layout machinery, pan/drag camera, text supersampling. Touch drag already works;
  on narrow screens the side panel overlays full-width. Nothing else responsive-special
  in v1.

The architecture rule holds: everything that decides is a pure function
(state inference, snapshot diffing, layout, panel content selection), only the last
inch draws.

### 4.3 Identity: DNA continuity is the product promise

Every showroom resident's appearance comes from the game's existing deterministic DNA
pipeline, seeded with **`swarm:<slug>`**. When S4 later delivers a purchased creature
into the buyer's own village, the same seed reproduces the same creature — "it leaves
this village and moves into yours" is literally true because appearance is derived, not
stored. The mockup cast (aphorism/pip, moon/round, prompt-spark/lanky, homeforge/boxy)
is illustrative; real bodies fall where the hash says.

Positions are deterministic too: each resident's home coordinates are seeded by slug
within its zone's bounds, so the village has stable geography across visits and
restarts, exactly like the game.

### 4.4 Deployment

Built from this repo, deployed to the user's DigitalOcean droplet beside Swarm:
the static spectator bundle plus the one showroom server process, fronted at
`village.fenley.ai` (name is the keeper's call; nothing binds to it). Config is one
JSON file on the droplet (§7). Deployment mechanics (process manager, TLS, DNS) follow
the droplet's existing conventions from the fenley.ai deploy and are implementation
detail, not spec.

## 5. The stage: zones, staging, motion

The scene is one meadow with three focal areas — nursery pen (eggs), the commons'
ground (villagers wandering), and the pedestal (the rare) — under the game's fixed
warm palette (`packages/web/src/theme.ts`). When the time-of-day palettes subsystem
(`2026-08-23-time-of-day-palettes-design.md`) ships, the showroom inherits it
unchanged — it is clock-driven and stateless, which suits an always-open public page;
until then, fixed day palette.

Two staging rules are law (they encode the keeper's standing visual review findings):

1. **Ground everything.** Contact shadows under every standing thing; houses get base
   rows, dirt aprons, and path connections; depth comes from overlap between
   background/midground/foreground layers. Nothing floats.
2. **Selective animation, never uniform.** Architecture never moves. Living things
   breathe, blink, and hop on individual phase offsets — never in lockstep, never a
   shared bob. Ambient life (drifting clouds, chimney smoke, an occasional butterfly)
   is sparse and slow. The one orchestrated set piece is the hatch.

The full visual treatment — palette tables, creature grids, staging composition, the
motion bible with timings, and the hatch sequence timeline (wobble → crack → shell
burst → pop-in with confetti in the eight creature hues → name-sign stamp) — lives in
the design brief and the approved mockup generation, which are the visual source of
truth for implementation.

## 6. Interactions

Everything clickable answers through one side panel (cream, ink border, Pixelify
header, mono body, ×-to-close — the game's chat-panel idiom, read-only). Panel content
by target:

- **Egg:** "EGG · incubating" chip; name (or "?????" for a not-yet-named entry); the
  feed description if present, else "no description yet — the swarm writes its story as
  it builds"; meta from the feed ("laid …, run N under way"); the hatch-condition box;
  "no repo yet — still growing."
- **Common:** name, description, meta ("hatched …, N runs"), links out to `repo` and
  `live` (the only external links on the page), an optional per-slug trivia line from
  the keeper config (e.g. moon: "its phase math also lights this village's night sky"),
  and the rule box: **"lives here. commons are never for sale."**
- **Rare:** "✻ RARE DROP №n" chip, description, meta with judge line
  ("judge-picked · keeper-confirmed"), links, and the auction tease box: countdown to
  `auctionOpensAt` plus the promise — "1 of 1. one buyer takes the repo, the live app,
  and the creature itself — it leaves this village and moves into yours." In S1 the box
  is informational only; when S3 exists, it gains the link through to the auction.
- **Nothing selected:** a small hint chip, "click an egg, a villager, or the rosette."

Header sign ("SWARM VILLAGE" + "every villager here was built by the swarm") and the
status chip ("● N villagers · N eggs · N rare on the block" — real counts, accent dot;
the rare clause is omitted entirely when no rare is on the block) top-left. The **notice board** card surfaces the event log's recent lines: overnight
hatches, new arrivals, rare confirmations — the away-digest role the game's notice
board already owns.

## 7. The keeper's config

One JSON file on the droplet, read on boot and on change (watch or SIGHUP —
implementer's choice), the only hand-edited surface in S1:

```json
{
  "feedUrl": "https://swarm.fenley.ai/api/projects",
  "rares": [
    { "slug": "homeforge", "number": 1, "auctionOpensAt": "2026-08-25T21:00:00Z" }
  ],
  "trivia": { "moon": "its phase math also lights this village's night sky." },
  "hidden": []
}
```

- `rares` is the S1 stand-in for judge-propose + keeper-confirm: adding an entry IS the
  confirmation. S2 moves the proposal into the feed; this file remains the veto/confirm.
- `hidden` lets the keeper delist a slug entirely (a failed experiment, and — later —
  a sold rare until S3 formalizes sold-state display).
- A rare slug must belong to a hatched entry; a config rare that is still an egg or
  missing from the feed is logged and ignored.

## 8. Failure modes

- **Feed unreachable:** serve the last good snapshot; the header chip gains a quiet
  mono line — "the swarm is napping" — and the page otherwise behaves normally.
  No snapshot at all (first boot, feed down): empty meadow with the sign and a single
  line, "the swarm hasn't sent anyone home yet."
- **Malformed feed entries:** skipped per-entry with a server log line; never crash the
  poll, never poison the list ("dinner"-style sparse entries are legal, not malformed).
- **Entry disappears from the feed:** the resident stays, flagged internally as
  `orphaned`, and the event log notes it; the keeper decides via `hidden` whether it
  leaves. The village never loses anything silently.
- **WS drop:** client falls back to REST polling every 60s and re-upgrades when it can;
  spectators lose only immediacy.

## 9. Testing

Same discipline as the game — everything that decides is pure and tested; the KAPLAY
glue stays thin:

- **Bridge:** feed validation vectors (sparse, malformed, empty, huge) shared with the
  M5 nursery test suite.
- **Lifecycle inference:** entry → egg/common state; snapshot-diff → event derivation
  (egg laid, hatched live, hatched-while-away, orphaned) as pure functions over
  snapshot pairs.
- **Rare resolution:** config × feed → pedestal state, including the illegal-config
  cases (rare-but-egg, rare-but-missing).
- **Determinism:** `swarm:<slug>` → identical appearance and position across processes;
  fixture-pinned so a refactor that changes anyone's face fails loudly.
- **Protocol:** showroom REST/WS message shapes round-trip through the web client's
  parsers.
- **Countdown:** `auctionOpensAt` rendering across time zones and the
  already-open/past edge.
- **Visual gate:** per the standing playtest rule, the keeper's eyes are the final
  review — a playtest checkpoint on the deployed page before S1 is called done,
  explicitly checking the two staging laws (nothing floats; nothing moves in lockstep).

## 10. Handed to later sub-projects

- **S2 (feed extensions, Swarm-side):** entries at lay time with `status`;
  `completed_at`; judge `tier` proposal; hatch timestamps. The S1→S2 seam is §3's
  table; S1 code should isolate the inference behind one function so S2 swaps it.
- **S3 (drop system):** the auction page/flow the pedestal links into; bidder identity;
  payment; sold-state as a first-class showroom display (plaque, "delisted — the swarm
  keeps no copy").
- **S4 (delivery):** repo transfer; the signed adoption certificate a buyer's own
  village imports (DNA continuity per §4.3 makes the creature portable by
  construction); automated delisting.
