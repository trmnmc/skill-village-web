# Creature grids — the authored art

`grids.js` holds the actual creature artwork: six bodies, five crowns, six tapered flight undersides, four `lanky` postures, the wing shape, and the palette. It is design output, not implementation — every grid in it was rendered and reviewed during the design pass, and `@village/core` should import or transcribe it rather than re-authoring from scratch.

## The shape of the system

Appearance has **two independent axes**, body and crown, because a single-axis version failed: three of the original shapes differed only in their top one to three rows, so creatures sharing a body were near-twins. Six bodies × five crowns gives 30 silhouettes from 11 authored pieces, and two creatures must now match on both axes to look alike.

Crowns are defined **parametrically from body width** — ears anchor at columns `1` and `w-2`, a crest centres on `⌊(w-1)/2⌋` — which is why one crown definition sits correctly on a 7-wide `pip` and a 12-wide `mound`. Adding a sixth crown adds six creatures, not one.

## Invariants worth testing

These held when the grids were authored and a test should keep them holding:

- Every body's rows are all `w` characters and there are exactly `h` of them.
- Only `XDWKA.` appear.
- Each `eyes` entry points at the top-left of a 2×2 block of `W`.
- Every crown, evaluated against every body width, lands within `0..w-1` and above row 0.
- Every flight underside matches its body's width.
- Every `lanky` posture is 7 wide.

## Two decisions that look like details

**`D` is a role, not a colour.** It marks foot pixels so a walk cycle can find them later, and renders in the body hue — feet read as shape, not as a darker tone. That choice is also what made "agents shouldn't have feet" a one-line rendering rule instead of new artwork.

**`trailing` is a state, not a shape.** It implies forward motion, so fixing it to a creature would look wrong on one hovering in place. As a motion state it becomes intent: lanky agents sweep into it while roaming and settle back into their own DNA-assigned resting posture.
