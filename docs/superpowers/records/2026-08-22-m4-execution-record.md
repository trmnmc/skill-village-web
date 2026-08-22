# SDD ledger — plan: docs/superpowers/plans/2026-08-22-m4-voice.md
Branch: m4-voice (worktree .claude/worktrees/m4-voice), base 6b9f839. Spec: docs/superpowers/specs/2026-08-21-skill-village-web-design.md (§2.4, §3, §5, §4.2, §6.1).
Baseline: 450/450 tests green at 6b9f839.

## Pre-flight conflict scan (table)
Pairs sharing files/interfaces:
| Pair | Produces vs consumes | Found |
|---|---|---|
| T1×T2 | card-prompt JSON fields vs fake 'card' reply | consistent (all 7 fields, 20 lines) |
| T1×T5 | prompt contract vs parsePersona validation | consistent |
| T2×T4 | CliResult reasons + fake behaviours vs service tests | **F1: serialization test broken as written** |
| T3×store.ts | plan says extend loadState with `now` + names loadOrCreateState | **F2: already `loadState(paths, now)`; use that name** |
| T3×T6 | LlmState commits via hooks vs chat commit | note F4 (live-state read) |
| T3×T7 | remaining/LlmConfig imports | consistent |
| T4×T5 | probe/marker choreography in retry test | consistent (plan Step-2 amendment) |
| T5×T6 | generatePersona null-graceful vs ensurePersona | consistent |
| T6×T7 | chat/llmMode/setLlmConfig vs routes; care route still 409s chat | consistent |
| T6×T8 | llmFactory (T6) + probeLlm (T8) both edit village.ts | sequential, consistent |
| T7×T12 | route shapes vs e2e asserts | consistent (canned index math checked: (bond+xp)%20) |
| T9×T10×T11 | LlmView/meter; bubble fns vs scene | consistent; view.llm mode-always-'full' quirk is plan-acknowledged |
| T10×T11 | onBubble→sayFor; main.ts decl order | consistent (order note in plan) |

Per-task self-consistency: T1 ok (prompt contains "twenty"); T2 ok (garbage→malformed, exit-2→error, hang→timeout all trace through the given cli.ts); T3 ok (ledger math + rollover verified by hand); T4 **F1**; T5 ok; T6 ok (setLlm write-count math: probe 1, chat#1 +2, chat#2 +1); T7 ok; T8 ok; T9 ok (bubbleScale boundary t=0.38 falls to sustain branch=1, matches test); T10 ok; T11 ok (bubbleShownAt=-1 convention explained); T12 ok.

Hedges verified against code pre-dispatch: loadState(paths,now) exists w/ 'newer version' note strings; THEME.ink/signCream/bubbleWhite exist; displayName in web/src/render/label.ts; boot() in app.test.ts; createApp(village); village.ts has live `let state` + `commit`; KAPLAY TextComp.width is a mutable number.

## Pre-flight rulings
Ruling: F1 (Task 4) — the plan's serialization test probes with 'hang', which times out and flips mode to 'silent', so both requests short-circuit before the queue and the ≥450ms assert fails against the plan's own implementation. Decided: use the 'slow' behaviour (fake docstring says it exists "for queue-serialization tests"): probe succeeds → mode full; concurrency 1; two concurrent requests must take ≥750ms (two 400ms children serialized). Keep the timeoutMs option seam. — Why: preserves the test's intent (prove the second call waited) without new seams. — Cost if wrong: a queue regression could hide behind timing slack; e2e still covers the path.
Ruling: F2 (Task 3) — store entry point is `loadState(paths, now)` (already takes now; returns LoadResult{state,note,...}). Decided: tests and migration use loadState; the plan's "extend the signature" step is already satisfied. — Cost if wrong: compile error, immediately visible.
Note F4 (Task 6, carried in dispatch): the post-chat commit must build from the live `state` (updated by the service's setLlm commit during request), never a pre-request snapshot, or the ledger spend is silently overwritten.

## Task log
Task 1: minor (deferred): cannedLines optionality test is compile-time-only (plan-mandated verbatim test).
Task 1: complete (commits 6b9f839..7a40714, review clean)
Task 2: Ruling: reviewer Important (plan-mandated shell condition vs never-throw contract) — the plan mandates shell:true only for bare 'claude', so a SKILL_VILLAGE_CLAUDE .cmd/.bat override makes spawn throw synchronously (EINVAL) and runCli REJECTS, breaching the plan's own never-throw rule; the contract outranks the condition. Decided: (a) try/catch around spawn, settling typed {ok:false,reason:'missing'} on synchronous throw; (b) extend shell:true to win32 command[0] ending .cmd/.bat so the documented shim shape actually works (args still carry no user content); (c) add a test that a .cmd target resolves typed instead of rejecting. — Cost if wrong: slightly wider shell surface on Windows, still no user content in argv.
Task 2: fix round 1/5 (1 addressed, 0 open — never-throw on .cmd override fixed per ruling; commits feec618..f79fac3)
Task 2: minor (deferred): try/catch catch-branch not independently exercised by any test (shell:true now prevents the sync throw the catch guards).
Task 2: minor (deferred): Node DEP0190 deprecation warning (args + shell:true) appears in test output on win32 shell paths; args are fixed constants, no user content.
Task 2: minor (deferred): .gitignore lacks an entry for packages/server/src/llm/testing/.broken-once (scratch marker, first exercised by Tasks 4-5).
Task 2: complete (commits 7a40714..f79fac3, review clean after round 1)
Task 3: Ruling: brief self-contradicts on migrateState signature (Interfaces: unknown -> VillageState|null; Step 6 code: pre-validated VillageState -> VillageState). Implementer followed Step 6's concrete code; the call site pre-validates. Stands. — Cost if wrong: a future external caller gets no runtime defense; final review can revisit.
Task 3: minor (deferred): no test for v2-file-missing-llm rejection (code verified correct; plan-mandated gap).
Task 3: minor (deferred): migration test uses empty creatures and never asserts creature survival (plan-mandated; code verified).
Task 3: minor (deferred): migrateState hardcodes version===2 instead of STATE_VERSION.
Task 3: complete (commits f79fac3..96724a3, review clean)
Task 4: Ruling: second plan contradiction (implementer-found, controller-confirmed) — plan's probe() records spend on success (its own Step 3 code + global constraint), but two Step 1 tests assert ledger totals as if probe wrote nothing (120 vs actual 240; writes.length 0 vs 1). Decided: amend the two assertions to account for probe's recorded spend, preserving each test's intent (request records real usage; refused request adds no write). service.ts untouched. — Cost if wrong: none foreseeable; e2e re-checks ledger flow.
Task 4: minor (deferred): probe() bypasses the queue — a re-probe on a live queue could exceed concurrency (plan-mandated; probe runs once at boot today).
Task 4: minor (deferred): ruling-2 amendments hard-code the fake's 120/45 usage as absolute totals; delta-style would be more resilient.
Task 4: complete (commits 96724a3..5841e5a, review clean)
Task 5: minor (deferred): retry cap is a bare literal 2; MAX_ATTEMPTS constant would self-document.
Task 5: complete (commits 5841e5a..f7a10d5, review clean)
Task 6: Ruling: brief's afterEach resetFakeCli wiring NOT applied — implementer showed it deletes a marker shared across parallel vitest workers and flaked persona.test.ts; village.test.ts uses only the stateless 'card' behaviour. Deviation accepted. — Cost if wrong: a future village test using card-broken-once must add its own reset.
Task 6: Ruling: reviewer's Important (refresh() stale read-modify-write can revert mid-flight commits incl. the ledger) is pre-existing but load-bearing for M4's budget guarantee — chat holds the race window open for seconds. Decided: fix now in round 1 (recompute reconcile against live state right before commit), plus two same-discipline minors: chat try/catches llm.request (graceful-fallback constraint), close() joins the write queue. Minors 4-6 deferred. — Cost if wrong: a wider refresh change could disturb M2/M3 bridge behaviour; suite + e2e guard it.
Task 6: fix round 1/5 (3 addressed, 0 open — refresh stale RMW reordered; chat try/catch; close joins queue; commits e451127..80d6406)
Task 6: minor (deferred): archive skipped if commit fails after reorder (error-path only; no production readArchived caller yet).
Task 6: minor (deferred): overlapping-refresh race is noisier (spurious auto-released event possible); same class as pre-existing stale-scan race.
Task 6: minor (deferred): silent mode re-attempts persona (readFile + one refused request) on every chat; negative cache would avoid.
Task 6: minor (deferred): commit queue writes same latest state repeatedly on bursts; log can lag state on crash between slots.
Task 6: minor (deferred): test stubs key on prompt wording ('The player says to you'); req.kind would be sturdier.
Task 6: complete (commits f7a10d5..80d6406, review clean after round 1)
Task 7: Ruling: reviewer's Important (no error handling around village.chat; departed-creature-during-ensurePersona window derefs undefined -> 500, breaching the always-200 constraint) is plan-mandated (brief's own sample) but real. Decided: guard in village.chat after ensurePersona (missing creature -> the documented 'not found' throw) + route try/catch mapping 'not found' -> 404, other errors rethrow (a vanished creature is honestly 404; always-200 governs LLM failures, which chat handles internally). — Cost if wrong: a 404 mid-conversation where a stock 200 might feel softer; UI treats both gracefully.
Task 7: fix round 1/5 (1 addressed, 0 open — vanished-creature 500 -> 404 with guard + route catch + deterministic test; commits 98fc0f5..19c04f8)
Task 7: minor (deferred): route catch casts (error as Error) unchecked; all current throw surfaces are Errors.
Task 7: minor (deferred): no HTTP-level end-to-end test of the mid-flight-departure 404 (unit-level covered per ruling).
Task 7: minor (deferred): boundary coverage thin (4000-exact accept, whitespace-only reject, float cap reject verified by reading, not tests).
Task 7: complete (commits 80d6406..19c04f8, review clean after round 1)
Task 8: fix round 1/5 (1 addressed, 0 open — .catch added to probe chain; commits f54e242..96639c1)
Task 8: complete (commits 19c04f8..96639c1, review clean after round 1; real boot check: silent-movie line verbatim, /api/llm mode silent cap 500000, chat skill:autoplan 200 canned, port freed)
Task 9: Ruling: reviewer's Important was a report-text inaccuracy (claimed 46 new tests; actually 6 new, 18/28 file totals) — code fully compliant, so the fix was a report correction, not a code round; re-review skipped (empty code diff). — Cost if wrong: none; record now accurate.
Task 9: complete (commits 96639c1..0f33ad4, review clean; report corrected)
Task 10: complete (commits 0f33ad4..869e125, review clean)
Task 11: Ruling: brief's bubble snippet (k.text width: 180*TEXT_SS) would report the wrap CONSTRAINT as .width (KAPLAY formatText: if (opt.width) tw = opt.width), boxing every quip at 180px — violating the binding boxes-hug-text playtest policy the plan itself restates. Implementer's deviation accepted: no width option; say() greedy-wraps by measuring assign-.text-read-.width, joins with newlines, sizes bg from rendered dims (hi! -> 43px, 45-char reply -> 3 lines 176px). — Cost if wrong: wrap math drift from KAPLAY's own wrapping; user playtest is the visual gate.
Task 11: Ruling: reviewer's lineSpacing minor (multi-line bubbles render with zero leading — formatText adds no default lineSpacing) ruled INTO round 1 alongside the two Importants: it is arithmetic not taste, the fix is one option (lineSpacing: 4*TEXT_SS), and the user's playtest attention should not be spent on a known defect. Banner-over-HUD stays deferred to playtest (brief-prescribed positions on both sides). — Cost if wrong: 4px leading might not match taste; trivially tunable at playtest.
Task 11: fix round 1/5 (3 addressed, 0 open — sync canvas mousedown + client-coord slop + button-0 gate; panel z-index 11; bubble lineSpacing; commits b64cc41..cc794a2)
Task 11: minor (deferred): pressedAt has no blur/pointercancel disarm (one line in stopPanning).
Task 11: minor (deferred): open panel covers the banner's own dismiss x (right trade; banner dismissible when panel closed).
Task 11: minor (deferred, PLAYTEST): banner overlaps canvas HUD lines y=12/32; bubble occlusion by nearer villagers; meter bar granularity 50k/cell reads full until ~25k spent; playtest must include a trackpad TAP and a double-click (sub-frame click fix unverifiable here).
Task 11: minor (deferred): pre-existing hover-plate width timing bug (onLoad race, plate ~2x wide for a creature spawning alone post-startup) — pre-dates M4, own ticket.
Task 11: complete (commits 869e125..cc794a2, review clean after round 1)
Task 12: complete (commits cc794a2..d3f25a9, review clean; e2e passed first try, boundary greps clean, reviewer independently reproduced all claims)
FINAL REVIEW (fable, 6b9f839..d3f25a9): With fixes. Critical: e2e date-coupled assert (remaining < 500k breaks after UTC midnight — plan bug, its sample froze the village clock at the writing date while /api/llm uses Date.now()). Important: cli.ts child.stdin lacks an 'error' handler — EPIPE on a child dying pre-drain is an uncaught exception (process death; fake always drains so no test sees it). Ruled into the wave (reviewer-recommended batch): chat wired with a tighter timeout than the 90s default (plan added the seam, main.ts never used it); stale care-route message ('needs the language model (M4)') reworded. Deferred stays deferred incl. the PLAYTEST bundle; reviewer agreed with all 12 controller rulings. Ruling: fix wave = these 4; minors 5,6,7,9,10 deferred. — Cost if wrong: timeout number is a judgment call (30s chosen); message wording trivial.
FINAL fix wave: 4/4 addressed (date-proof e2e assert, stdin error guard, 30s chat timeout, care message reworded), re-review clean (commits d3f25a9..57ff8e7)
M4 EXECUTION COMPLETE: 12/12 tasks, final review clean after one fix wave. 518/518 tests + 1 e2e = suite green, typecheck clean, boundary greps clean. HEAD 57ff8e7.
