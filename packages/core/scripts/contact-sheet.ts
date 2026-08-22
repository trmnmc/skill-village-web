/**
 * Renders every body+crown combination, for both species, plus a sample of
 * generated creatures, to a single HTML page for human review.
 *
 * This is the spec's golden-set eyeball test (§4, rule 4). Its output is not
 * asserted — a person looks at it and decides which pairs belong in INCOMPATIBLE.
 *
 * Run: npm run contact-sheet
 */
import { writeFileSync } from 'node:fs';
import {
  BODIES, CROWNS, FLIGHT_UNDERSIDE, POSTURES, WING, INK,
  BODY_IDS, CROWN_IDS, generateAppearance,
  type BodyId, type CreatureAppearance,
} from '../src/index.js';

const UNIT = 7;

function bodyRows(body: BodyId, appearance: CreatureAppearance): string[] {
  const grid = BODIES[body];
  if (!appearance.winged) return grid.rows;
  if (body === 'lanky') {
    return grid.rows.slice(0, 8).concat(POSTURES[appearance.restPosture ?? 'floating'].rows);
  }
  const cut = grid.rows.findIndex((row) => row.includes('D'));
  return grid.rows.slice(0, cut).concat(FLIGHT_UNDERSIDE[body]);
}

function svg(appearance: CreatureAppearance): string {
  const grid = BODIES[appearance.body];
  const crown = CROWNS[appearance.crown];
  const rows = bodyRows(appearance.body, appearance);
  const { hue, lite } = appearance.palette;
  const roleColor: Record<string, string | null> = {
    X: hue, D: hue, W: INK.eyeWhite, K: INK.mouth, A: lite, '.': null,
  };

  const padX = appearance.winged ? UNIT * 5 : UNIT;
  const padTop = (crown.h + 1) * UNIT;
  const width = grid.w * UNIT + padX * 2;
  const height = rows.length * UNIT + padTop + UNIT;
  const parts: string[] = [];
  const rect = (x: number, y: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${UNIT + 0.3}" height="${UNIT + 0.3}" fill="${fill}"/>`;

  if (appearance.winged) {
    for (const side of [-1, 1] as const) {
      const originX = side === -1 ? padX - UNIT * 4.2 : padX + grid.w * UNIT + UNIT * 0.3;
      WING.forEach((row, r) => {
        [...row].forEach((ch, c) => {
          if (ch === 'X') {
            const col = side === -1 ? WING[0]!.length - 1 - c : c;
            parts.push(rect(originX + col * UNIT, padTop + (r + 1.2) * UNIT, lite));
          }
        });
      });
    }
  }

  for (const [c, r] of crown.cells(grid.w)) {
    parts.push(rect(padX + c * UNIT, padTop + r * UNIT, hue));
  }

  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      const fill = roleColor[ch];
      if (fill) parts.push(rect(padX + c * UNIT, padTop + r * UNIT, fill));
    });
  });

  for (const eye of grid.eyes) {
    parts.push(
      `<rect x="${padX + eye.c * UNIT + UNIT * 0.45}" y="${padTop + eye.r * UNIT + UNIT * 0.55}" ` +
      `width="${UNIT * 0.95}" height="${UNIT * 1.15}" fill="${INK.pupil}"/>`,
    );
  }

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
    `style="shape-rendering:crispEdges">${parts.join('')}</svg>`;
}

function cell(label: string, appearance: CreatureAppearance): string {
  return `<figure><div class="art">${svg(appearance)}</div><figcaption>${label}</figcaption></figure>`;
}

const sections: string[] = [];

for (const winged of [false, true]) {
  const kind = winged ? 'agent' : 'skill';
  const cells: string[] = [];
  for (const body of BODY_IDS) {
    for (const crown of CROWN_IDS) {
      const appearance: CreatureAppearance = {
        body,
        crown,
        palette: { hue: '#b9ae9b', lite: '#d2c9b8', dark: '#9a8f7c' },
        winged,
        restPosture: winged && body === 'lanky' ? 'floating' : null,
      };
      cells.push(cell(`${body} + ${crown}`, appearance));
    }
  }
  sections.push(`<h2>Every combination — ${kind}</h2><div class="grid">${cells.join('')}</div>`);
}

const sampled = Array.from({ length: 120 }, (_, i) => {
  const kind = i % 4 === 0 ? 'agent' : 'skill';
  const name = `sample-${i}`;
  return cell(`${name}`, generateAppearance({ kind, name }));
});
sections.push(`<h2>120 generated names</h2><div class="grid">${sampled.join('')}</div>`);

const html = `<!doctype html>
<meta charset="utf-8">
<title>Skill Village — contact sheet</title>
<style>
  body { background:#171310; color:#f4e8ce; font:14px system-ui, sans-serif; margin:24px; }
  h2 { font-weight:600; margin:32px 0 12px; }
  .grid { display:flex; flex-wrap:wrap; gap:10px; }
  figure { margin:0; background:#f4e8ce; border-radius:8px; padding:8px; text-align:center; width:132px;
           display:flex; flex-direction:column; justify-content:flex-end; }
  .art { min-height:110px; display:flex; align-items:flex-end; justify-content:center; }
  figcaption { color:#5a4632; font:11px ui-monospace, monospace; margin-top:6px; }
</style>
${sections.join('\n')}
`;

const out = process.argv[2] ?? 'contact-sheet.html';
writeFileSync(out, html, 'utf8');
console.log(`Wrote ${out} — open it and add any ugly pairs to INCOMPATIBLE in grids.ts`);
