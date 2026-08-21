# assets

Shared art, consumed by `@village/web`. All sources are **CC0** — no attribution obligation, though the in-game About screen credits them anyway.

- **`parts/`** — Kenney Monster Builder Pack pieces (bodies, eyes, mouths, limbs, accessories), plus `parts.manifest.json`: the one-time curation pass that tags every part with the archetypes and slots it may occupy, and its skill/agent affinity. **Nothing untagged can ever be generated** — this manifest is what keeps creatures from looking cursed.
- **`village/`** — tiles, buildings, and props for the four zones (Kenney Tiny Dungeon + sparklinlabs/superpowers-asset-packs).

Consumed only by `@village/web`. `@village/core` names parts by id and never loads a file from here.
