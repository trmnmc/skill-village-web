# Session Handoff: Projects-Village Remap (brainstorm)
**Date:** 2026-08-22 at 14:04
**Repo:** C:/Users/truman/OneDrive/Documents/Claude-Projects/skill-village-web/.claude/worktrees/skills-projects-agents-mechanics-36973e
**Branch:** claude/skills-projects-agents-mechanics-36973e
**Uncommitted changes:** no (this handoff file is the only new file)
**Stale if:** branch `claude/skills-projects-agents-mechanics-36973e` moves past `02ebc0a` · `packages/core/src/types.ts` no longer defines `CreatureKind = 'skill' | 'agent'` · `docs/superpowers/specs/` already contains a projects-remap design doc
**Transcript:** (current session)

## What Was Accomplished
Pure brainstorming session (superpowers:brainstorming, architectural path) — no code was written. The user's idea was refined into a settled concept and a staging approach was approved. Feasibility was verified against real on-disk data:

- `~/.claude/projects/` has one folder per project (21 on this machine), session `.jsonl` transcripts inside, mtimes usable as a work-recency signal. Worktree checkouts appear as separate entries (suffix `--claude-worktrees-...`) and must be folded into their parent project.
- Transcripts record helper usage verbatim: skill invocations as `"name":"Skill","input":{"skill":"<name>"}` and agent spawns as `"subagent_type":"<name>"`. So the helper↔project linkage exists on disk, read-only — same safety rule as today (never write to `~/.claude`).

## Decisions Made
1. **The project is the tamagotchi.** Projects become the grounded, living villagers of the village — they're the things that need decisions and are never finished. This *replaces* the current skills-as-villagers model ("switching", not an added view).
2. **Skills + agents fold into one winged "helper" role** that hovers around the projects they're used in. The `kind` field stays in the data (the file bridge needs it: SKILL.md folder vs agent .md), and DNA already keys on kind so agents keep a subtle free visual tell. User explicitly chose folding after asking what the real difference is (skill = inline know-how, agent = dispatched worker).
3. **Real work is the only health lever; care builds bond.** Hybrid model: real sessions heal a project's health/mood; in-game petting builds bond only (shapes greetings, later M4 chat voice). Care can't substitute for work.
4. **Neglect = mood + status surfacing** by default: a neglected project droops AND says why ("last worked 12 days ago", which helpers it misses). The village doubles as a gentle dashboard of real work.
5. **Hard mode (toggle): full consequence sim** — health decays through stages down to abandoned/hibernating until the user returns to the project. Off by default.
6. **Approach A approved — staged pivot**, three shippable stages: (1) the remap (project discovery, activity signal, project creatures + helpers hovering near their projects); (2) the care loop (status surfacing, mood-from-recency, bond); (3) hard mode toggle. Reuses existing Creature/DNA/motion machinery; projects become a new creature kind. Big-bang rewrite and cosmetic reskin were rejected.

## Files Created or Modified
| File | Action | Why |
|------|--------|-----|
| docs/summaries/pause-2026-08-22-projects-village-remap.md | created | this handoff |
| docs/summaries/CHECKLIST.md | created | durable checklist mirror |

## Git State
```
(clean — nothing uncommitted at handoff time except the handoff files themselves)
```

## Checklist
<!-- snapshot of brainstorming-path progress — resume rebuilds TodoWrite from these boxes -->
- [x] Explore project context (README, types.ts, ~/.claude/projects feasibility probes)
- [x] Ask clarifying questions (project role, agents, care loop, levers — all answered)
- [x] Propose 2-3 approaches (A staged pivot / B big-bang / C reskin)
- [x] Get approach approval (user chose A)
- [ ] Present design in sections, approval after each: data model → file bridge & transcript parsing → village layout & motion → care loop & hard mode → testing
- [ ] Write design doc to `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md` and commit
- [ ] Spec self-review (placeholders, contradictions, scope, ambiguity)
- [ ] User reviews written spec
- [ ] Invoke writing-plans skill (the ONLY next skill after spec approval)

## Self-Critique
- **Least confident:** (a) transcript-parsing cost at scale — some `.jsonl` files are large and there are many; needs incremental parsing with cached per-file results in `~/.skill-village`. (b) Mapping transcript skill names to on-disk helper files — transcripts contain plugin-prefixed names (`anthropic-skills:xlsx`) and built-in subagent types (`general-purpose`) that have no file in `~/.claude/skills`/`agents`; a name-resolution + filtering rule is needed and was NOT designed. (c) Worktree-folding rule — the `--claude-worktrees-` suffix convention was observed, not verified as universal.
- **Biggest thing being missed:** "the more you work on the project" only counts *Claude Code* work — commits made outside Claude sessions don't move the signal, so a hand-edited project will look neglected. Decide in the design whether that's acceptable framing ("the village sees what Claude sees") or whether git mtime/commits should supplement.
- **If it breaks in 3 months:** Claude Code changes its transcript JSONL shape or projects-dir encoding — the parser keys on exact strings (`"subagent_type"`, `"name":"Skill"`, path-encoded folder names) that are an internal format, not an API.
- **Did NOT do:** no design sections presented, no spec written, no code, no tests, no perf measurement of a full transcript scan; hard-mode thresholds and the bond/greeting mechanics are unspecified; what happens to the four existing zones (Hatchery, Homes, Adoption Center, Notice Board) and the M4-M9 roadmap under the new model was never discussed with the user.
- **How to check:** parse cost → time a full scan: `find ~/.claude/projects -name '*.jsonl' | xargs wc -c` then a prototype scan script. Name mapping → `grep -ho '"skill":"[^"]*"' ~/.claude/projects/*/*.jsonl | sort -u` vs `ls ~/.claude/skills ~/.claude/agents`. Worktree rule → `ls ~/.claude/projects | grep -c 'claude-worktrees'` and confirm every such entry has a parent entry. Transcript-shape fragility → pin a fixture transcript in the test suite.

## Remaining Work
1. Present the design in sections (get approval after each): data model (Creature kind `'project'`, health/activity fields, helper linkage), file bridge & transcript parsing (incremental, cached, worktree folding, name resolution), village layout & motion (helpers orbit their projects; multi-project helpers need a rule), care loop & hard mode, testing strategy. Address the Self-Critique gaps inside these sections — especially name resolution and the outside-Claude-work question.
2. Write the spec to `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md`, self-review, commit.
3. User review gate on the spec, then invoke **writing-plans** (no other skill).

## Open Questions
- Should non-Claude work (plain git commits) count toward project health, or is "the village sees what Claude sees" the intended framing?
- What happens to the existing four zones and the M4-M9 roadmap items (adoption center, hatching, breeding) under the project-centric model?
- Where does a helper used in many projects live/hover — primary project by usage, or split time?

## Coordinate Closet
<!-- Verbatim ids/paths from this session, newest-first, deduped. -->
- `docs/superpowers/specs/2026-08-22-projects-village-remap-design.md` (planned spec path)
- `C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web--claude-worktrees-skills-projects-agents-mechanics-36973e` (this worktree's ~/.claude/projects entry)
- `C--Users-truman-OneDrive-Documents-Claude-Projects-skill-village-web` (parent project's ~/.claude/projects entry)
- `316b0f90-db44-4d0c-a778-6d2e86798814` (sample session jsonl id in parent project's transcript dir)
- `"name":"Skill","input":{"skill":"<name>"}` (transcript marker: skill invocation)
- `"subagent_type":"<name>"` (transcript marker: agent spawn)
- `packages/core/src/types.ts` (CreatureKind / Creature definitions to extend)
- `docs/superpowers/specs/2026-08-21-skill-village-web-design.md` (existing M1-M9 design doc)
- `02ebc0a` (HEAD at handoff)
- `claude/skills-projects-agents-mechanics-36973e` (branch)

## Instructions
Resume this work. **First, re-create the TodoWrite list** from the `## Checklist`
section above (one TodoWrite entry per `- [ ]` unchecked item; mark `- [x]` items
done or omit them) — if `docs/summaries/CHECKLIST.md` exists and is newer, prefer
it. Then summarize the above for the user and run `git status` /
`git branch --show-current` to confirm state matches this handoff (warn on any
mismatch — different branch, unexpected changes). **Evaluate each "Stale if"
condition in the header**: if any holds, say which, treat the claims it covers as
stale, and re-verify them against the live artifact before acting on them.
Present the rebuilt checklist + Remaining Work and ask whether to continue or do
something else. This session was mid-brainstorm (superpowers:brainstorming,
architectural path, approach A approved) — continue with the design sections, one
at a time with user approval, before writing any spec or code.
