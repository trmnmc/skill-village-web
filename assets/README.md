# assets

**No creature or scenery art lives here.** Every creature is a pixel grid defined in `@village/core`, and every prop is a flat rectangle drawn by `@village/web` — see §4 of the spec. That is deliberate: it removes all third-party art licensing from the project.

What this folder is for:

- **`fonts/`** — self-hosted **Pixelify Sans** and **IBM Plex Mono** (both OFL), so the game renders correctly offline rather than depending on Google Fonts at runtime.
- **`sfx/`** — short interaction sounds (hop, pop, chime), added in the polish milestone. Anything placed here must be CC0 or OFL-equivalent, with its source recorded in the About screen.

If you find yourself adding a PNG of a creature, stop: the appearance system is the wrong shape for it, and the grid approach is what keeps creatures deterministic and diffable.
