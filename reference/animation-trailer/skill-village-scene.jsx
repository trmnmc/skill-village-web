/* Skill Village — "the village comes alive" (15s, 1920x1080) */
const { CompositionStage, useComposition, Shot, Captions, Easing, interpolate, animate, clamp,
        useTweaks, TweaksPanel, TweakSection, TweakToggle } = window;

const W = 1920, H = 1080, U = 12;
const MOTION = {
  glide: (T, a, b) => Easing.easeInOutCubic(clamp((T - a) / Math.max(0.001, b - a), 0, 1)),
  pop:   (T, at, dur) => T <= at ? 0 : Easing.easeOutBack(clamp((T - at) / (dur || 0.55), 0, 1)),
  fade:  (T, a, b) => Easing.easeOutQuad(clamp((T - a) / Math.max(0.001, b - a), 0, 1)),
};
const charsAt = (T, t0, cps) => Math.max(0, Math.floor((T - t0) * cps));

const GRIDS = {
  bean: {
    rows: ['.X...X.', '.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.DD.DD.'],
    eyes: [{ c: 1, r: 3 }, { c: 4, r: 3 }], w: 7, h: 10,
  },
  mound: {
    rows: ['...XXXXXX...', '.XXXXXXXXXX.', 'XXWWXXXXWWXX', 'XXWWXXXXWWXX', 'XXXXXKKXXXXX', 'XXXXXXXXXXXX', '.DD......DD.'],
    eyes: [{ c: 2, r: 2 }, { c: 8, r: 2 }], w: 12, h: 7,
  },
  boxy: {
    rows: ['.XXXXXX.', 'XXXXXXXX', 'XWWXXWWX', 'XWWXXWWX', 'XXXKKXXX', 'XXXXXXXX', '.DD..DD.'],
    eyes: [{ c: 1, r: 2 }, { c: 5, r: 2 }], w: 8, h: 7,
  },
};
const WING = ['XXX.', 'XXXX', '.XX.'];

const CAST = [
  { id: 'sparky',  nick: 'Sparky',  file: 'brainstorming/', arch: 'bean',  hue: '#E58C68', dark: '#C06B4B', lite: '#F2B294', x: 280,  y: 962, ph: 0.0 },
  { id: 'quill',   nick: 'Quill',   file: 'docs-writer/',   arch: 'bean',  hue: '#B79FD6', dark: '#957EB6', lite: '#D3C3E8', x: 552,  y: 928, ph: 1.3 },
  { id: 'nit',     nick: 'Nit',     file: 'code-review/',   arch: 'mound', hue: '#9DBA77', dark: '#7C9A58', lite: '#C0D6A0', x: 822,  y: 988, ph: 2.1 },
  { id: 'twig',    nick: 'Twig',    file: 'git-worktrees/', arch: 'bean',  hue: '#7FBF8A', dark: '#61A06E', lite: '#A8D8B0', x: 1092, y: 948, ph: 0.7, hopper: true },
  { id: 'checka',  nick: 'Checka',  file: 'test-writer/',   arch: 'mound', hue: '#E2B45E', dark: '#C29140', lite: '#F0CE8C', x: 1366, y: 992, ph: 2.8 },
  { id: 'deckard', nick: 'Deckard', file: 'deck-maker/',    arch: 'mound', hue: '#E0A3B2', dark: '#C07E92', lite: '#F0C2CD', x: 1662, y: 934, ph: 1.8, asleep: true },
  { id: 'scout',   nick: 'Scout',   file: 'web-research.md', arch: 'boxy', hue: '#7FB6D9', dark: '#5D93B8', lite: '#A9D2EA', ph: 0.4, fly: 'roam' },
  { id: 'gus',     nick: 'Gus',     file: 'debugger.md',     arch: 'boxy', hue: '#6FBCAD', dark: '#519D8E', lite: '#9AD6C9', x: 1210, y: 604, ph: 3.4, fly: 'hover' },
];

const signDx = (c) => (c.arch === 'mound' ? 148 : 118);
const scoutPos = (T) => ({
  x: 960 + Math.sin(T * 0.33 + 1.2) * 860,
  y: 474 + Math.sin(T * 0.9) * 34,
  flip: Math.cos(T * 0.33 + 1.2) < 0,
});
const gusPos = (T) => ({ x: 1210 + Math.sin(T * 0.5 + 2) * 26, y: 604 + Math.sin(T * 2.2 + 1) * 16, flip: false });

function hopState(T, t0) {
  if (T < t0) return { dy: 0, sy: 1, land: -1 };
  const cyc = 2.6, p = (T - t0) % cyc, k = Math.floor((T - t0) / cyc);
  let dy = 0, sy = 1;
  if (p < 0.18) sy = 1 - (p / 0.18) * 0.16;
  else if (p < 0.72) { const q = (p - 0.18) / 0.54; dy = -Math.sin(q * Math.PI) * 64; sy = 1.07; }
  else if (p < 0.95) { const q = (p - 0.72) / 0.23; sy = 0.86 + q * 0.14; }
  return { dy, sy, land: t0 + k * cyc + 0.72 };
}

function getPos(c, T, CUES) {
  if (c.fly === 'roam') return scoutPos(T);
  if (c.fly === 'hover') return gusPos(T);
  if (c.hopper) { const h = hopState(T, CUES.Village + 0.6); return { x: c.x, y: c.y + h.dy, flip: false }; }
  return { x: c.x, y: c.y, flip: false };
}

function PixelGrid({ rows, map, u }) {
  const rects = [];
  rows.forEach((row, r) => {
    for (let cIdx = 0; cIdx < row.length; cIdx++) {
      const col = map[row[cIdx]];
      if (col) rects.push(React.createElement('rect', { key: r + '-' + cIdx, x: cIdx * u, y: r * u, width: u + 0.4, height: u + 0.4, fill: col }));
    }
  });
  return React.createElement('svg', { width: rows[0].length * u, height: rows.length * u, style: { display: 'block', shapeRendering: 'crispEdges' } }, rects);
}

function PuffBurst({ T, t0, x, y }) {
  const p = (T - t0) / 0.55;
  if (p <= 0 || p >= 1) return null;
  const e = Easing.easeOutCubic(p);
  const bits = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 + 0.6;
    const d = 14 + e * 44, s = 11 * (1 - e * 0.65);
    return <div key={i} style={{ position: 'absolute', left: x + Math.cos(a) * d - s / 2, top: y - 8 + Math.sin(a) * d * 0.55 - s / 2, width: s, height: s, background: '#F4E8CE', opacity: (1 - p) * 0.9 }} />;
  });
  return <div style={{ position: 'absolute', left: 0, top: 0 }}>{bits}</div>;
}

function Creature({ T, c, CUES, popAt, lookAt }) {
  const g = GRIDS[c.arch];
  const bw = g.w * U, bh = g.h * U;
  const pos = getPos(c, T, CUES);
  const scale = MOTION.pop(T, popAt, 0.55);
  if (scale <= 0.01) return null;
  const flying = !!c.fly;
  const hop = c.hopper ? hopState(T, CUES.Village + 0.6) : null;
  const sy = flying ? 1 + Math.sin(T * 3.1 + c.ph * 5) * 0.02 : (hop ? hop.sy : 1 + Math.sin(T * 2.0 + c.ph * 5) * 0.028);
  const sx = 1 - (sy - 1) * 0.7;
  const asleep = c.asleep;
  const blink = !asleep && (((T * 1000 + c.ph * 1700) % 3400) < 130);
  let look = 0;
  if (!asleep) {
    if (lookAt != null && Math.abs(lookAt - pos.x) > 40) look = lookAt > pos.x ? 1 : -1;
    else { const lk = Math.sin(T * 0.62 + c.ph * 2.3); look = lk > 0.55 ? 1 : lk < -0.55 ? -1 : 0; }
  }
  const map = { X: c.hue, D: c.dark, W: '#FFF9EE', K: '#33241C', A: c.lite };
  const flap = Math.sin(T * 16 + c.ph * 3) * 26 - 8;
  const eyes = g.eyes.map((e, i) => {
    if (asleep || blink) {
      return <div key={'lid' + i} style={{ position: 'absolute', left: e.c * U, top: e.r * U, width: 2 * U, height: 2 * U, background: c.hue }}>
        <div style={{ position: 'absolute', left: 1, right: 1, top: U - 2, height: 3.5, background: '#33241C' }} />
      </div>;
    }
    return <div key={'pu' + i} style={{ position: 'absolute', left: e.c * U + U * 0.45 + look * 3.5, top: e.r * U + U * 0.55, width: U * 0.95, height: U * 1.15, background: '#33241C' }} />;
  });
  const wings = flying ? [0, 1].map((i) => (
    <div key={'w' + i} style={{
      position: 'absolute', top: 12, left: i === 0 ? -44 : bw - 4, zIndex: 0,
      transform: (i === 0 ? 'scaleX(-1) ' : '') + 'rotate(' + (i === 0 ? -flap : flap) + 'deg)',
      transformOrigin: i === 0 ? 'right center' : 'left center',
    }}><PixelGrid rows={WING} map={{ X: c.lite }} u={U} /></div>
  )) : null;
  const ants = flying ? [0, 1].map((i) => (
    <div key={'a' + i} style={{
      position: 'absolute', top: -U * 2.6, left: (i === 0 ? 1.2 : g.w - 1.9) * U, zIndex: 0,
      transform: 'rotate(' + (Math.sin(T * 2.3 + c.ph + i * 0.5) * 12) + 'deg)', transformOrigin: 'bottom center',
    }}>
      <div style={{ width: U * 0.55, height: U * 2.1, background: c.dark, margin: '0 auto' }} />
      <div style={{ position: 'absolute', top: -U * 1.0, left: -U * 0.3, width: U * 1.15, height: U * 1.15, background: c.lite }} />
    </div>
  )) : null;
  const shadowW = flying ? 0 : bw * 0.78;
  const shSq = hop ? clamp(1 + hop.dy / 130, 0.55, 1) : 1;
  return (
    <div style={{ position: 'absolute', left: pos.x - bw / 2, top: pos.y - bh, width: bw, height: bh }}>
      {shadowW > 0 && <div style={{ position: 'absolute', left: bw / 2 - (shadowW * shSq) / 2, top: bh - 6 - (c.hopper ? pos.y - c.y : 0) * -1 + (c.hopper ? c.y - pos.y : 0), width: shadowW * shSq, height: 13, borderRadius: 7, background: 'rgba(90,70,40,0.18)' }} />}
      <div style={{ position: 'absolute', inset: 0, transform: (pos.flip ? 'scaleX(-1) ' : '') + 'scale(' + (scale * sx) + ',' + (scale * sy) + ')', transformOrigin: '50% 100%' }}>
        {wings}{ants}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <PixelGrid rows={g.rows} map={map} u={U} />
          <div style={{ position: 'absolute', inset: 0 }}>{eyes}</div>
        </div>
      </div>
    </div>
  );
}

function Zzz({ T, x, y, at }) {
  if (T < at + 0.25) return null;
  return <div style={{ position: 'absolute', left: 0, top: 0 }}>{[0, 1, 2].map((i) => {
    const p = ((T * 0.42 + i * 0.34) % 1);
    return <div key={i} style={{ position: 'absolute', left: x + 40 + p * 36, top: y - 20 - p * 66, opacity: Math.sin(p * Math.PI) * 0.8, fontFamily: "'Pixelify Sans', monospace", fontSize: 18 + p * 16, color: '#7A6A55', transform: 'rotate(9deg)' }}>z</div>;
  })}</div>;
}

function Bubble({ T, b, pos, bodyH }) {
  let s = MOTION.pop(T, b.at, 0.38);
  if (T > b.until) s *= clamp(1 - (T - b.until) / 0.28, 0, 1);
  if (s <= 0.02) return null;
  return (
    <div style={{ position: 'absolute', left: pos.x, top: pos.y - bodyH - 26, transform: 'translate(-50%,-100%) scale(' + s + ')', transformOrigin: '50% 100%', zIndex: 6 }}>
      <div style={{ background: '#FFFDF4', border: '3px solid #3A2E22', borderRadius: 8, padding: '9px 16px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 21, fontWeight: 500, color: '#3A2E22', whiteSpace: 'nowrap' }}>{b.text}</div>
      <div style={{ width: 14, height: 14, background: '#FFFDF4', borderRight: '3px solid #3A2E22', borderBottom: '3px solid #3A2E22', transform: 'rotate(45deg)', margin: '-8px auto 0' }} />
    </div>
  );
}

function House({ x, y, body, roof, door }) {
  return (
    <div style={{ position: 'absolute', left: x - 85, top: y - 160 }}>
      <div style={{ position: 'absolute', left: -8, top: 0, width: 186, height: 20, background: roof }} />
      <div style={{ position: 'absolute', left: 14, top: -18, width: 142, height: 20, background: roof }} />
      <div style={{ position: 'absolute', left: 42, top: -34, width: 86, height: 18, background: roof }} />
      <div style={{ position: 'absolute', left: 0, top: 20, width: 170, height: 140, background: body, border: '3px solid rgba(120,90,60,0.35)' }} />
      <div style={{ position: 'absolute', left: 26, top: 84, width: 36, height: 76, background: door }} />
      <div style={{ position: 'absolute', left: 104, top: 56, width: 32, height: 32, background: '#FFF3D2', border: '4px solid #8A6B4A' }} />
    </div>
  );
}

function Tree({ x, y }) {
  return (
    <div style={{ position: 'absolute', left: x - 60, top: y - 148 }}>
      <div style={{ position: 'absolute', left: 50, top: 104, width: 20, height: 46, background: '#8A6B4A' }} />
      <div style={{ position: 'absolute', left: 5, top: 66, width: 110, height: 40, background: '#7FA85F' }} />
      <div style={{ position: 'absolute', left: 22, top: 32, width: 76, height: 36, background: '#8FB86B' }} />
      <div style={{ position: 'absolute', left: 38, top: 4, width: 44, height: 30, background: '#7FA85F' }} />
    </div>
  );
}

const TUFTS = [[140, 1042], [420, 1010], [700, 1055], [980, 1018], [1240, 1050], [1520, 1024], [1790, 1048], [340, 880], [890, 862], [1470, 878]];

function Sign({ c, T, at }) {
  const o = MOTION.fade(T, at, at + 0.35);
  if (o <= 0.01) return null;
  const dx = signDx(c);
  return (
    <div style={{ position: 'absolute', left: c.x + dx - 74, top: c.y - 112, opacity: o }}>
      <div style={{ position: 'absolute', left: 66, top: 66, width: 11, height: 48, background: '#8A6B4A' }} />
      <div style={{ position: 'absolute', left: 0, top: 0, width: 148, height: 68, background: '#F2E5C4', border: '3px solid #8A6B4A', borderRadius: 5, textAlign: 'center', paddingTop: 7, boxSizing: 'border-box' }}>
        <div style={{ fontFamily: "'Pixelify Sans', monospace", fontSize: 24, lineHeight: '24px', color: '#3A2A1E' }}>{c.nick}</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, color: '#8A6B4A', marginTop: 3 }}>{c.file}</div>
      </div>
    </div>
  );
}

function FlyerChip({ c, T, at, CUES }) {
  const o = MOTION.fade(T, at + 0.3, at + 0.7);
  if (o <= 0.01) return null;
  const pos = getPos(c, T, CUES);
  return (
    <div style={{ position: 'absolute', left: pos.x, top: pos.y + 16, transform: 'translateX(-50%)', opacity: o, background: 'rgba(255,250,238,0.9)', border: '2px solid #8A6B4A', borderRadius: 5, padding: '3px 10px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 15, color: '#5A4632', whiteSpace: 'nowrap' }}>
      <span style={{ fontFamily: "'Pixelify Sans', monospace", fontSize: 17, color: '#3A2A1E' }}>{c.nick}</span> · {c.file}
    </div>
  );
}

function Piece({ signs, bubbles }) {
  const { T, CUES, time } = useComposition();
  const CB = CUES.Bloom, CV = CUES.Village, CT = CUES.Title;

  // ---- terminal ----
  const cmd1 = 'ls skills/ agents/', cmd2 = 'npx skill-village';
  const t1 = Math.min(charsAt(T, 0.25, 22), cmd1.length);
  const t2 = Math.min(charsAt(T, 2.05, 22), cmd2.length);
  const cursorOn = ((T * 2) % 1) < 0.55;
  const termScale = 1 + 1.4 * MOTION.glide(T, CB, CB + 1.3);
  const termOp = 1 - MOTION.fade(T, CB + 0.15, CB + 1.05);
  const TERM = { x: 500, y: 205, w: 920, h: 650 };
  const termCx = TERM.x + TERM.w / 2, termCy = TERM.y + TERM.h / 2;

  // ---- camera ----
  const camT = MOTION.glide(T, CV, CT);
  const cam = { s: 1.08 - 0.08 * camT, tx: 30 - 60 * camT, ty: 10 - 10 * camT };
  const OX = 960, OY = 671;
  const camPoint = (p) => ({ x: OX + (p.x + cam.tx - OX) * cam.s, y: OY + (p.y + cam.ty - OY) * cam.s });

  // ---- seeds: filename flies from terminal line to its creature's spot ----
  const seedFrom = (i) => {
    const p = { x: TERM.x + 46, y: TERM.y + 46 + 110 + i * 38 + 14 };
    return { x: termCx + (p.x - termCx) * termScale, y: termCy + (p.y - termCy) * termScale };
  };
  const seedTargetWorld = (c, i, endT) => {
    if (c.fly) { const p = getPos(c, endT, CUES); return { x: p.x, y: p.y - 40 }; }
    return { x: c.x + signDx(c), y: c.y - 78 };
  };
  const seeds = CAST.map((c, i) => {
    const start = CB + 0.25 + i * 0.16, end = start + 1.0;
    return { c, i, start, end };
  });

  const villageOp = MOTION.fade(T, CB, CB + 0.9);
  const groundRise = (1 - MOTION.glide(T, CB + 0.1, CB + 1.1)) * 300;
  const sceneryO = (d) => MOTION.fade(T, CB + 0.3 + d, CB + 0.9 + d);

  const BUBBLES = [
    { at: CV + 0.8, until: CV + 2.6, who: 'nit', text: 'looks tidy in here!' },
    { at: CV + 2.8, until: CV + 4.4, who: 'gus', text: 'found a bug. on it!' },
    { at: CV + 4.6, until: CT + 0.4, who: 'sparky', text: 'ooh — new idea!' },
  ];
  const activeB = bubbles ? BUBBLES.find((b) => T >= b.at && T <= b.until + 0.3) : null;
  const speaker = activeB ? CAST.find((c) => c.id === activeB.who) : null;
  const speakerPos = speaker ? getPos(speaker, T, CUES) : null;

  const wmP = MOTION.pop(T, CT + 0.25, 0.7);
  const subO = MOTION.fade(T, CT + 0.85, CT + 1.35);

  const deck = CAST[5];
  const twigHop = hopState(T, CV + 0.6);

  return (
    <div data-screen-label={'t=' + Math.floor(time) + 's'} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#171310', fontFamily: "'IBM Plex Mono', monospace" }}>

      {/* ============ VILLAGE (camera space) ============ */}
      <div style={{ position: 'absolute', inset: 0, opacity: villageOp }}>
        <div style={{ position: 'absolute', inset: 0, transform: 'translate(' + cam.tx + 'px,' + cam.ty + 'px) scale(' + cam.s + ')', transformOrigin: '50% 62%' }}>
          <div style={{ position: 'absolute', left: -200, top: -200, width: W + 400, height: H + 400, background: 'linear-gradient(#FDF0D5 0%, #F9E3BC 62%, #F2D9A8 100%)' }} />
          <div style={{ position: 'absolute', left: 1548, top: 108, width: 96, height: 96, background: '#F7D274', transform: 'scale(' + (1 + Math.sin(T * 1.1) * 0.02) + ')' }}>
            <div style={{ position: 'absolute', left: 16, top: 16, width: 64, height: 64, background: '#FBE49E' }} />
          </div>
          {[[220, 150], [780, 92], [1330, 196]].map((cl, i) => (
            <div key={i} style={{ position: 'absolute', left: cl[0] - T * 7 - i * 12, top: cl[1] }}>
              <div style={{ width: 150, height: 34, background: '#FFF8E8' }} />
              <div style={{ position: 'absolute', left: 44, top: -18, width: 88, height: 22, background: '#FFF8E8' }} />
            </div>
          ))}
          {/* ground */}
          <div style={{ position: 'absolute', left: -200, top: 780 + groundRise, width: W + 400, height: 500, background: '#A9C57E' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: 14, background: '#8FB067' }} />
            <div style={{ position: 'absolute', left: 380, top: 116, width: 1560, height: 58, borderRadius: 29, background: '#E4CFA0' }} />
            {TUFTS.map((t, i) => (
              <div key={i} style={{ position: 'absolute', left: t[0] + 200, top: t[1] - 780, width: 8, height: 16, background: '#86A85C' }}>
                <div style={{ position: 'absolute', left: 10, top: 5, width: 7, height: 11, background: '#86A85C' }} />
              </div>
            ))}
          </div>
          {/* far scenery */}
          <div style={{ opacity: sceneryO(0), transform: 'translateY(' + (1 - sceneryO(0)) * 36 + 'px)' }}>
            <House x={230} y={866} body="#EAD9B4" roof="#C96F4A" door="#7A5A3E" />
            <Tree x={90} y={880} />
          </div>
          <div style={{ opacity: sceneryO(0.18), transform: 'translateY(' + (1 - sceneryO(0.18)) * 36 + 'px)' }}>
            <House x={952} y={848} body="#E3CBAF" roof="#D9985A" door="#6A4E36" />
            <Tree x={648} y={872} />
          </div>
          <div style={{ opacity: sceneryO(0.36), transform: 'translateY(' + (1 - sceneryO(0.36)) * 36 + 'px)' }}>
            <House x={1672} y={860} body="#EFDFC0" roof="#C96F4A" door="#7A5A3E" />
            <Tree x={1418} y={868} />
            <Tree x={1852} y={890} />
          </div>
          {/* signs + creatures + puffs */}
          {signs && CAST.filter((c) => !c.fly).map((c, i) => {
            const s = seeds.find((sd) => sd.c.id === c.id);
            return <Sign key={c.id} c={c} T={T} at={s.end - 0.1} />;
          })}
          {CAST.map((c) => {
            const s = seeds.find((sd) => sd.c.id === c.id);
            const lookAt = speaker && speaker.id !== c.id && speakerPos && Math.abs(speakerPos.x - c.x) < 560 && !c.fly ? speakerPos.x : null;
            return <Creature key={c.id} T={T} c={c} CUES={CUES} popAt={s.end} lookAt={lookAt} />;
          })}
          {seeds.map((s) => {
            const tw = seedTargetWorld(s.c, s.i, s.end);
            return <PuffBurst key={'pf' + s.c.id} T={T} t0={s.end} x={tw.x - (s.c.fly ? 0 : signDx(s.c))} y={s.c.fly ? tw.y + 40 : s.c.y} />;
          })}
          {twigHop.land > 0 && <PuffBurst T={T} t0={twigHop.land} x={CAST[3].x} y={CAST[3].y} />}
          {deck && <Zzz T={T} x={deck.x} y={deck.y - 84} at={seeds.find((sd) => sd.c.id === 'deckard').end} />}
          {signs && CAST.filter((c) => c.fly).map((c) => {
            const s = seeds.find((sd) => sd.c.id === c.id);
            return <FlyerChip key={c.id} c={c} T={T} at={s.end} CUES={CUES} />;
          })}
          {activeB && speaker && <Bubble T={T} b={activeB} pos={speakerPos} bodyH={GRIDS[speaker.arch].h * U + (speaker.fly ? 30 : 0)} />}
        </div>
      </div>

      {/* ============ TERMINAL ============ */}
      <Shot from={0} to={CB + 1.3}>
        <div style={{ position: 'absolute', left: TERM.x, top: TERM.y, width: TERM.w, height: TERM.h, opacity: termOp, transform: 'scale(' + termScale + ')', transformOrigin: '50% 50%', background: '#201B17', borderRadius: 14, border: '3px solid #3A3129', boxShadow: '0 30px 80px rgba(15,8,0,0.55)' }}>
          <div style={{ height: 46, background: '#2A241F', borderRadius: '11px 11px 0 0', display: 'flex', alignItems: 'center', gap: 9, padding: '0 18px' }}>
            <div style={{ width: 13, height: 13, borderRadius: 7, background: '#D97757' }} />
            <div style={{ width: 13, height: 13, borderRadius: 7, background: '#E2B45E' }} />
            <div style={{ width: 13, height: 13, borderRadius: 7, background: '#9DBA77' }} />
            <div style={{ marginLeft: 14, fontSize: 16, color: '#8A7E70' }}>~/.claude</div>
          </div>
          <div style={{ position: 'relative', fontSize: 23, lineHeight: '38px', color: '#E8E0D0' }}>
            <div style={{ position: 'absolute', left: 46, top: 20 }}>
              <span style={{ color: '#D97757' }}>$ </span>{cmd1.slice(0, t1)}
              {T < 2.05 && <span style={{ display: 'inline-block', width: 12, height: 24, background: '#E8E0D0', verticalAlign: 'middle', opacity: cursorOn ? 1 : 0 }} />}
            </div>
            {CAST.map((c, i) => (
              <div key={c.id} style={{ position: 'absolute', left: 46, top: 110 + i * 38, color: c.fly ? '#E8E0D0' : '#8FB8D9', opacity: T > 1.25 + i * 0.09 ? 1 : 0 }}>{c.file}</div>
            ))}
            {T >= 2.05 && (
              <div style={{ position: 'absolute', left: 46, top: 436 }}>
                <span style={{ color: '#D97757' }}>$ </span>{cmd2.slice(0, t2)}
                {T < 3.05 && <span style={{ display: 'inline-block', width: 12, height: 24, background: '#E8E0D0', verticalAlign: 'middle', opacity: cursorOn ? 1 : 0 }} />}
              </div>
            )}
            {T >= 3.05 && <div style={{ position: 'absolute', left: 46, top: 480, color: '#9DBA77' }}>waking the village…</div>}
          </div>
        </div>
      </Shot>

      {/* ============ SEEDS (filenames fly out) ============ */}
      <Shot from={CB} to={CV + 0.4}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {seeds.map((s) => {
            const p = MOTION.glide(T, s.start, s.end);
            if (p <= 0 || p >= 1) return null;
            const from = seedFrom(s.i);
            const to = camPoint(seedTargetWorld(s.c, s.i, s.end));
            const x = from.x + (to.x - from.x) * p;
            const y = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * 90;
            const op = p < 0.78 ? 1 : 1 - (p - 0.78) / 0.22;
            return <div key={s.c.id} style={{ position: 'absolute', left: x, top: y, transform: 'translate(0,-50%) scale(' + (1 - p * 0.25) + ')', fontSize: 23, color: p < 0.4 ? '#8FB8D9' : '#5A4632', opacity: op, textShadow: '0 1px 0 rgba(255,248,232,0.7)' }}>{s.c.file}</div>;
          })}
        </div>
      </Shot>

      <Captions
        items={[
          { at: CB + 0.6, until: CV + 0.3, text: 'your skills folder…' },
          { at: CV + 0.9, until: CV + 3.2, text: '…is alive.' },
        ]}
        style={{ font: "500 34px 'IBM Plex Mono', monospace", color: '#4A3826', textShadow: '0 2px 0 rgba(255,248,232,0.85)', bottom: 'auto', top: '6.5%' }}
      />

      {/* ============ TITLE ============ */}
      <Shot from={CT} to={CT + 60}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 150, textAlign: 'center', opacity: Math.min(1, wmP * 2), transform: 'translateY(' + (1 - wmP) * -90 + 'px) scale(' + (0.9 + wmP * 0.1) + ')' }}>
          <div style={{ fontFamily: "'Pixelify Sans', monospace", fontWeight: 700, fontSize: 118, letterSpacing: 8, color: '#3A2A1E', textShadow: '7px 7px 0 rgba(217,119,87,0.85)' }}>SKILL VILLAGE</div>
          <div style={{ marginTop: 18, fontFamily: "'IBM Plex Mono', monospace", fontSize: 28, fontWeight: 500, color: '#6A5843', opacity: subO }}>your skills folder is alive</div>
        </div>
      </Shot>
    </div>
  );
}

function SkillVillageApp() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#171310' }}>
      <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg="#171310">
        <Piece signs={t.showSigns} bubbles={t.speechBubbles} />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Village" />
        <TweakToggle label="Name signs" value={t.showSigns} onChange={(v) => setTweak('showSigns', v)} />
        <TweakToggle label="Speech bubbles" value={t.speechBubbles} onChange={(v) => setTweak('speechBubbles', v)} />
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </div>
  );
}
window.SkillVillageApp = SkillVillageApp;
