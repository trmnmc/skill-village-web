/**
 * Skill Village — authored creature art, as data.
 *
 * This is the output of the design pass, not implementation. `@village/core`
 * should import or transcribe these definitions rather than re-authoring them;
 * every grid here has been rendered and reviewed. See spec §4.
 *
 * Colour roles, one character per pixel:
 *   X  body (hue)          W  eye white (#FFF9EE, fixed)
 *   D  feet — see below    K  mouth (#33241C, fixed)
 *   A  light accent (lite) .  transparent
 *
 * `D` is a *semantic* role, not a colour: it marks which pixels are feet so a
 * future walk cycle can find them. It renders in the body hue for skills (feet
 * read as shape, not as a darker tone) and is replaced entirely for agents.
 *
 * Eyes are NOT baked in. Each body's `eyes` gives the top-left of a 2x2 `W`
 * block; the renderer overlays a pupil there so it can blink and track.
 */

export const BODIES = {
  pip: {
    note: 'tiny and round',
    rows: ['..XXX..', '.XXXXX.', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', '.XXXXX.', '..DDD..'],
    eyes: [{ c: 1, r: 2 }, { c: 4, r: 2 }], w: 7, h: 7,
  },
  round: {
    note: 'the classic',
    rows: ['.XXXXXXX.', 'XXXXXXXXX', 'XXWWXWWXX', 'XXWWXWWXX', 'XXXXKXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..DD.DD..'],
    eyes: [{ c: 2, r: 2 }, { c: 5, r: 2 }], w: 9, h: 8,
  },
  lanky: {
    note: 'stilt legs — the only body with real legs, so the only one that can dangle',
    rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '..X.X..', '..X.X..', '..X.X..', '.DD.DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 4, r: 2 }], w: 7, h: 12,
  },
  bean: {
    note: 'upright oval',
    rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.DD.DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 4, r: 2 }], w: 7, h: 9,
  },
  mound: {
    note: 'wide and low',
    rows: ['...XXXXXX...', '.XXXXXXXXXX.', 'XXWWXXXXWWXX', 'XXWWXXXXWWXX', 'XXXXXKKXXXXX', 'XXXXXXXXXXXX', '.DD......DD.'],
    eyes: [{ c: 2, r: 2 }, { c: 8, r: 2 }], w: 12, h: 7,
  },
  boxy: {
    note: 'angular',
    rows: ['.XXXXXX.', 'XXXXXXXX', 'XWWXXWWX', 'XWWXXWWX', 'XXXKKXXX', 'XXXXXXXX', '.DD..DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 5, r: 2 }], w: 8, h: 7,
  },
};

/**
 * Tapered flight undersides. For an agent, the body's foot row (the first row
 * containing `D`) and everything after it is replaced by these, so the body
 * ends on a deliberate curve rather than a flat cut. Width must equal body `w`.
 * `lanky` uses POSTURES instead.
 */
export const FLIGHT_UNDERSIDE = {
  pip:   ['..XXX..'],
  round: ['..XXXXX..'],
  lanky: ['..X.X..'],        // fallback; POSTURES is preferred
  bean:  ['..XXX..'],
  mound: ['..XXXXXXXX..'],
  boxy:  ['.XXXXXX.'],
};

/**
 * `lanky` flight postures — everything below the hips (from row 8 down).
 * Three are resting postures assigned per creature by DNA, so two lanky agents
 * hovering side by side hang differently and each always hangs the same way.
 * `trailing` is a motion state, not an identity: any lanky agent sweeps into it
 * while roaming and settles back into its own resting posture when it stops.
 *
 * Detached feet are legible only because these are pixel creatures — at this
 * scale a one-row gap reads as "tucked up", where in smooth art it would read
 * as severed.
 */
export const POSTURES = {
  stubs:    { kind: 'rest',   rows: ['..X.X..'] },
  splayed:  { kind: 'rest',   rows: ['..X.X..', '.X...X.'] },
  floating: { kind: 'rest',   rows: ['..X.X..', '.......', '.X...X.'] },
  trailing: { kind: 'motion', rows: ['..X.X..', '.......', '...X.X.', '....X.X'] },
};

/**
 * Crowns — head features, drawn in the body hue in the rows immediately above
 * the grid. Defined *parametrically from body width* rather than as fixed
 * columns, so one definition sits correctly on a 7-wide `pip` and a 12-wide
 * `mound` alike. `cells(w)` returns [column, row] pairs with negative rows.
 */
export const CROWNS = {
  none:  { h: 0, cells: () => [] },
  ears:  { h: 3, cells: (w) => { const L = 1, R = w - 2;
             return [[L,-3],[R,-3],[L,-2],[R,-2],[L,-1],[L+1,-1],[R-1,-1],[R,-1]]; } },
  crest: { h: 3, cells: (w) => { const c = Math.floor((w - 1) / 2);
             return [[c,-3],[c-1,-2],[c,-2],[c+1,-2],[c-2,-1],[c-1,-1],[c,-1],[c+1,-1],[c+2,-1]]; } },
  tuft:  { h: 1, cells: (w) => { const c = Math.floor((w - 1) / 2); return [[c-1,-1],[c+1,-1]]; } },
  horns: { h: 2, cells: (w) => { const L = 1, R = w - 2;
             return [[L,-2],[R,-2],[L,-1],[L+1,-1],[R-1,-1],[R,-1]]; } },
};

/** Wings — agents only, mounted at both sides in `lite`, mirrored, flapping. */
export const WING = ['XXX.', 'XXXX', '.XX.'];

/**
 * Body+crown pairs the generator must never emit. Individually fine, ugly
 * together. Populated from the golden-set review (spec §4, rule 4) — empty
 * until that review runs, and expected to stay short.
 */
export const INCOMPATIBLE = [
  // e.g. ['mound', 'ears'],
];

/** Fixed inks, shared by every creature and never varied. */
export const INK = { eyeWhite: '#FFF9EE', pupil: '#33241C', mouth: '#33241C' };

/**
 * Creature hues. `lite` derives at +14% lightness, `dark` at -14%. `dark` is
 * currently drawn nowhere — feet share the body hue and antennae were dropped —
 * but stays defined for future shading, wing undersides, or a night variant.
 */
export const HUES = [
  '#E58C68', '#B79FD6', '#9DBA77', '#7FBF8A',
  '#E2B45E', '#E0A3B2', '#7FB6D9', '#6FBCAD',
];
