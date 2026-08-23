# Skill Village

**Your skills folder… is alive.**

A Tamagotchi-style game where every [Claude Code](https://claude.com/claude-code) skill and agent on
your machine is a living pixel creature in a shared village. Caring for creatures is fun on its own,
but the game is also a real builder: playing it yields genuine, installable Claude Code skills
(`SKILL.md` folders) and agents (frontmatter `.md` files).

![The village, from the animation trailer](reference/animation-trailer/preview.webp)

## What works today (M3)

Run it and your real skills and agents appear as villagers — one unique creature per file, generated
deterministically from its name. They breathe, blink, look around, and fly, each on its own phase
offset so the village never moves in lockstep. Drag to pan across four zones: the Hatchery, Homes,
the Adoption Center, and the Notice Board.

- **Creatures are pixel grids, not image assets.** Six hand-authored bodies × five crowns, with
  flight undersides for agents and three dangling postures for the stilt-legged `lanky` body. No
  downloads, no licensing, no art pipeline — a creature is ~10 strings and two hex colours.
- **Deterministic DNA.** `SHA-256(kind + name)` seeds body, crown, and palette. The same skill looks
  the same on any machine, and the village has a stable geography across reloads.
- **Read-only where it matters.** The server reads `~/.claude` and never writes to it; all game
  state lives in `~/.skill-village`. Your real config cannot be corrupted by a game.

## The sky

The ambient sky animates across six palettes: a Kelvin-honest progression from dawn through dusk,
with weekdays woven from Meadow Blue and Golden Hour, rotating weekend palettes, and seeded surprise
days. Palettes blend continuously, and the UI dims after sunset. Four weather modes control the sky:
**Off** (clear skies, the default — the clock still drives time and palette), **Pick** (choose a
weather kind that stays), **Journey** (a ~45-minute curated tour of palette·time·weather), or
**Real** (opt-in geolocation, live local weather + true sunrise/sunset via Open-Meteo). The gear menu
also pins the two things the schedule would otherwise pick for you: the **palette** (auto, or any of
the six by name) and the **time of day** (auto, or one of seven presets) — so you can hold the
village in Meadow Blue at noon on a day the calendar wanted to paint Marigold. Override any sky with the dev
cheat-sheet: `?at=HH:MM&day=sat&weather=storm&palette=1e` sets time, day of week, weather mode, and
palette directly. The moon is a real lunar phase, calculated from
[`github.com/trmnmc/moon`](https://github.com/trmnmc/moon) — a port of Jean Meeus's *Astronomical Algorithms*.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. The server finds your skills in `~/.claude/skills` and
`~/.claude/agents`; if you have none, the village is an empty field waiting for M5's adoption
center.

## How it's built

| Package | Role |
|---|---|
| `packages/core` | The shared brain: types, DNA→appearance, sim rules, file-format parsers and validators. Pure functions, no I/O. |
| `packages/server` | One process, game server and daemon: state store, file bridge, simulation tick, REST + WebSocket API. |
| `packages/web` | The KAPLAY browser game: sprite compositor, motion system, the village scene. Holds no game truth. |

The architecture rule throughout: **everything that decides is a pure function; only the last inch
draws.** Grid composition, motion math, behaviour flags, layout, and protocol parsing are all
DOM-free and tested (449 tests); the KAPLAY glue is deliberately thin.

## Roadmap

M4 gives creatures their voices (chat via your existing Claude Code login — no API keys). M5 seeds
the Adoption Center from open-source skill collections. M6–M7 add hatching new skills through an
in-character interview, breeding, and training. M8–M9 wire live reactions to your real coding
sessions and autonomous village life. The full design is in
[`docs/superpowers/specs/`](docs/superpowers/specs/), and the complete execution record — including
every review finding and ruling — in [`docs/superpowers/records/`](docs/superpowers/records/).

## Credits

Built with [Claude Code](https://claude.com/claude-code), rendered with
[KAPLAY](https://github.com/kaplayjs/kaplay) (MIT). Type is Pixelify Sans and IBM Plex Mono.
