/* Swarm Village — showroom trailer v2 (≈33s, 1920×1080). Night→dawn→day→dusk→night cycle, one grounded village band. */
const { CompositionStage, useComposition, Shot, Captions, Easing, interpolate, animate, clamp,
        useTweaks, TweaksPanel, TweakSection, TweakToggle } = window;

const W = 1920, H = 1080, U = 12, HOR = 620;
const C = { night:'#171310', ink:'#3A2E22', cream:'#F2E5C4', white:'#FFFDF4', wood:'#8A6B4A',
  dwood:'#5A4628', accent:'#D97757', link:'#B4552F', fol:'#7FA85F', folHi:'#8FB86B',
  eyeW:'#FFF9EE', pupil:'#33241C' };
const HUES = ['#e58c68','#b79fd6','#9dba77','#7fbf8a','#e2b45e','#e0a3b2','#7fb6d9','#6fbcad'];
const PX = "'Pixelify Sans', monospace", MO = "'IBM Plex Mono', monospace";

const MOTION = {
  glide: (T,a,b) => Easing.easeInOutCubic(clamp((T-a)/Math.max(0.001,b-a),0,1)),
  pop:   (T,at,d) => T<=at ? 0 : Easing.easeOutBack(clamp((T-at)/(d||0.55),0,1)),
  fade:  (T,a,b) => Easing.easeOutQuad(clamp((T-a)/Math.max(0.001,b-a),0,1)),
};

/* ---- day/night palette cycle (flat bands, no gradients) ---- */
function hexMix(a, b, p) {
  const A = parseInt(a.slice(1),16), B = parseInt(b.slice(1),16);
  const r = Math.round((A>>16)+(((B>>16)-(A>>16))*p)), g = Math.round(((A>>8)&255)+((((B>>8)&255)-((A>>8)&255))*p)), bl = Math.round((A&255)+(((B&255)-(A&255))*p));
  return 'rgb('+r+','+g+','+bl+')';
}
const PAL = {
  night:{ sky:'#262E4A', band:'#333C5C', cloud:'#3C4666', tree:'#3F573D', grass:'#56714E', line:'#47603F', dark:0.38, glow:1,    stars:1,    sun:0    },
  dawn: { sky:'#97ACC8', band:'#EFC69C', cloud:'#E4D0C0', tree:'#6E9459', grass:'#93B07D', line:'#7C9C68', dark:0.10, glow:0.35, stars:0.06, sun:0.3  },
  day:  { sky:'#CFE9F5', band:'#CFE9F5', cloud:'#FFFDF4', tree:'#7FA85F', grass:'#A8C68D', line:'#8FB075', dark:0,    glow:0,    stars:0,    sun:1    },
  dusk: { sky:'#5D6C93', band:'#E2A87E', cloud:'#6F7BA0', tree:'#5A7850', grass:'#7E9A6E', line:'#6B8760', dark:0.22, glow:0.75, stars:0.3,  sun:0.1  },
};
function blendPal(a, b, p) {
  const o = {};
  for (const k in a) o[k] = typeof a[k]==='number' ? a[k]+(b[k]-a[k])*p : hexMix(a[k], b[k], p);
  return o;
}

/* ---- creature grids ---- */
const BODIES = {
  pip:   { rows:['..XXX..','.XXXXX.','XWWXWWX','XWWXWWX','XXXKXXX','.XXXXX.','..DDD..'], eyes:[{c:1,r:2},{c:4,r:2}], w:7, h:7 },
  round: { rows:['.XXXXXXX.','XXXXXXXXX','XXWWXWWXX','XXWWXWWXX','XXXXKXXXX','XXXXXXXXX','.XXXXXXX.','..DD.DD..'], eyes:[{c:2,r:2},{c:5,r:2}], w:9, h:8 },
  lanky: { rows:['.XXXXX.','XXXXXXX','XWWXWWX','XWWXWWX','XXXKXXX','XXXXXXX','.XXXXX.','..XXX..','..X.X..','..X.X..','..X.X..','.DD.DD.'], eyes:[{c:1,r:2},{c:4,r:2}], w:7, h:12 },
  boxy:  { rows:['.XXXXXX.','XXXXXXXX','XWWXXWWX','XWWXXWWX','XXXKKXXX','XXXXXXXX','.DD..DD.'], eyes:[{c:1,r:2},{c:5,r:2}], w:8, h:7 },
};
const CROWNS = {
  none:  { h:0, cells:() => [] },
  tuft:  { h:1, cells:(w) => { const c=Math.floor((w-1)/2); return [[c-1,-1],[c+1,-1]]; } },
  ears:  { h:3, cells:(w) => { const L=1,R=w-2; return [[L,-3],[R,-3],[L,-2],[R,-2],[L,-1],[L+1,-1],[R-1,-1],[R,-1]]; } },
  horns: { h:2, cells:(w) => { const L=1,R=w-2; return [[L,-2],[R,-2],[L,-1],[L+1,-1],[R-1,-1],[R,-1]]; } },
};
function composeGrid(bodyKey, crownKey) {
  const b = BODIES[bodyKey], cr = CROWNS[crownKey];
  const pre = [];
  for (let r=0;r<cr.h;r++) pre.push('.'.repeat(b.w).split(''));
  cr.cells(b.w).forEach(([c,rr]) => { pre[cr.h+rr][c] = 'X'; });
  return { rows: pre.map(a=>a.join('')).concat(b.rows), w:b.w, h:b.h+cr.h,
           eyes: b.eyes.map(e=>({c:e.c, r:e.r+cr.h})) };
}
const CAST = [
  { id:'aphorism',    body:'pip',   crown:'tuft',  hue:'#e2b45e', x:1050, y:962, ph:0.6, per:2.5, pupil:0.2 },
  { id:'moon',        body:'round', crown:'none',  hue:'#7fb6d9', x:1230, y:934, ph:1.9, per:3.1, pupil:0.8 },
  { id:'prompt-spark',body:'lanky', crown:'ears',  hue:'#b79fd6', x:690,  y:914, ph:2.7, per:2.2, pupil:0.3, hatch:true },
  { id:'homeforge',   body:'boxy',  crown:'horns', hue:'#e58c68', x:1440, y:884, ph:1.2, per:2.9, pupil:0.75, rare:true },
];
const HOUSES = [
  { x:300,  y:762, wall:'#F2E5C4', roof:'#D96C57' },
  { x:900,  y:742, wall:'#E8D3EE', roof:'#B39DDB' },
  { x:1560, y:772, wall:'#F2D8A7', roof:'#D96C57' },
];

function PixelGrid({ rows, map, u }) {
  const rects = [];
  rows.forEach((row,r) => { for (let i=0;i<row.length;i++) {
    const col = map[row[i]]; if (col) rects.push(React.createElement('rect',{key:r+'-'+i,x:i*u,y:r*u,width:u+0.4,height:u+0.4,fill:col}));
  }});
  return React.createElement('svg',{width:rows[0].length*u,height:rows.length*u,style:{display:'block',shapeRendering:'crispEdges'}},rects);
}
function Shadow({ cx, y, w, sq, op }) {
  return <div style={{ position:'absolute', left:cx-(w*(sq||1))/2, top:y-6, width:w*(sq||1), height:12, borderRadius:6, background:'rgba(90,70,40,0.28)', opacity: op==null?1:op }} />;
}
function PuffBurst({ T, t0, x, y }) {
  const p = (T-t0)/0.55;
  if (p<=0 || p>=1) return null;
  const e = Easing.easeOutCubic(p);
  return <div style={{position:'absolute',left:0,top:0}}>{[0,1,2,3,4].map(i => {
    const a = (i/5)*Math.PI*2+0.6, d = 12+e*40, s = 10*(1-e*0.65);
    return <div key={i} style={{position:'absolute',left:x+Math.cos(a)*d-s/2,top:y-8+Math.sin(a)*d*0.5-s/2,width:s,height:s,background:C.cream,opacity:(1-p)*0.9}} />;
  })}</div>;
}
function hopPose(T, at) {
  if (T<at || T>at+0.9) return { dy:0, sy:1, land:-1 };
  const q = (T-at)/0.9;
  if (q<0.15) return { dy:0, sy:1-(q/0.15)*0.16, land:-1 };
  if (q<0.8) { const j=(q-0.15)/0.65; return { dy:-Math.sin(j*Math.PI)*54, sy:1.06, land:at+0.72 }; }
  return { dy:0, sy:0.88+((q-0.8)/0.2)*0.12, land:at+0.72 };
}

function Creature({ T, c, popAt, leaveAt, wakeAt, hopAt, airDy }) {
  const g = composeGrid(c.body, c.crown);
  const bw = g.w*U, bh = g.h*U;
  const scale = popAt==null ? 1 : (T<=popAt ? 0 : Easing.easeOutBack(clamp((T-popAt)/0.55,0,1)));
  if (scale<=0.01) return null;
  let lx=0, ly=0, lo=1, lsc=1;
  if (leaveAt!=null && T>leaveAt) {              /* sold: floats up into the night sky */
    const p = MOTION.glide(T, leaveAt, leaveAt+2.4);
    ly = -p*660; lx = Math.sin(p*5.5)*26; lsc = 1-p*0.35;
    lo = p<0.65 ? 1 : clamp(1-(p-0.65)/0.3, 0, 1);
    if (lo<=0.01) return null;
  }
  const asleep = wakeAt!=null && T<wakeAt;
  const hop = hopAt!=null ? hopPose(T, hopAt) : null;
  const hopping = hop && (hop.dy!==0 || hop.sy!==1);
  const breath = 1 - (asleep?0.02:0.03)*(0.5+0.5*Math.sin(T*(Math.PI*2)/(c.per*(asleep?1.6:1)) + c.ph*3));
  const sy = hopping ? hop.sy : breath, sx = 1-(sy-1)*0.7;
  const dy = hopping ? hop.dy : (airDy||0);
  const blink = !asleep && ((T*1000 + c.ph*1700) % (3400+c.ph*900)) < 130;
  const lk = Math.sin(T*0.55 + c.ph*2.3);
  const look = asleep ? 0 : (lk>0.6 ? 1 : lk<-0.6 ? -1 : 0);
  const map = { X:c.hue, D:c.hue, W:C.eyeW, K:C.pupil };
  const eyes = g.eyes.map((e,i) => {
    if (asleep || blink) return <div key={'l'+i} style={{position:'absolute',left:e.c*U,top:e.r*U,width:2*U,height:2*U,background:c.hue}}>
      <div style={{position:'absolute',left:1,right:1,top:U-2,height:3.5,background:C.pupil}} /></div>;
    const bx = e.c*U + clamp(c.pupil + look*0.3, 0, 1)*U;
    return <div key={'p'+i} style={{position:'absolute',left:bx,top:e.r*U+U*0.5,width:U,height:U*1.2,background:C.pupil}} />;
  });
  const shSq = (hopping||airDy) ? clamp(1+dy/120, 0.55, 1) : 1;
  return (
    <div style={{ position:'absolute', left:c.x-bw/2+lx, top:c.y-bh+dy+ly, width:bw, height:bh, opacity:lo }}>
      {ly>-4 && <Shadow cx={bw/2} y={bh-dy} w={bw*0.78} sq={shSq} op={lo} />}
      <div style={{ position:'absolute', inset:0, transform:'scale('+(scale*sx*lsc)+','+(scale*sy*lsc)+')', transformOrigin:'50% 100%' }}>
        <PixelGrid rows={g.rows} map={map} u={U} />
        <div style={{position:'absolute',inset:0}}>{eyes}</div>
      </div>
    </div>
  );
}
function Zzz({ T, x, y, show }) {
  if (!show) return null;
  return <div style={{position:'absolute',left:0,top:0}}>{[0,1,2].map(i => {
    const p = ((T*0.4 + i*0.34) % 1);
    return <div key={i} style={{position:'absolute',left:x+26+p*30,top:y-p*56,opacity:Math.sin(p*Math.PI)*0.7,fontFamily:PX,fontSize:16+p*13,color:C.cream,transform:'rotate(9deg)'}}>z</div>;
  })}</div>;
}

/* ---- eggs ---- */
const EGG_ROWS = ['...EEE...','..EEEEE..','.EEEEEEE.','.EEEEEEE.','EEEEEEEEE','EEEEEEEEE','EEEEEEEEE','EEEEEEEEE','.EEEEEEE.','.EEEEEEE.','..EEEEE..'];
const EGG_TOP = EGG_ROWS.slice(0,5), EGG_BOT = EGG_ROWS.slice(5);
const CRACKS = [ [[4,4],[5,5]], [[3,5],[6,4]], [[2,6],[7,5],[4,6]] ];
function Egg({ T, x, y, u, spots, hue, wobble, shiver, hatchT }) {
  const h = hatchT!=null ? T-hatchT : -1;
  const ew = 9*u, eh = 11*u;
  let rot = 0, dx = 0;
  if (h>=0 && h<2.1) { const b = h%1.3; if (b<0.75) rot = Math.sin((b/0.75)*Math.PI*6)*6*(h>1.4?1.3:1); }
  else if (wobble) { const b = (T*1000+400)%6500/1000; if (b<1.1) rot = Math.sin((b/1.1)*Math.PI*6)*6; }
  else if (shiver) { const b = (T*1000+2600)%12000/1000; if (b<0.35) dx = Math.sin((b/0.35)*Math.PI*4)*2; }
  const split = h>=2.1;
  const sp = split ? Easing.easeOutCubic(clamp((h-2.1)/0.5,0,1)) : 0;
  if (split && sp>=1) return null;
  const spotEls = (spots||[]).map((s,i) => <div key={i} style={{position:'absolute',left:s[0]*u,top:s[1]*u,width:u+0.4,height:u+0.4,background:hue}} />);
  const crackEls = [];
  if (h>=1.4 && !split) CRACKS.forEach((step,si) => { if (h>=1.4+si*0.25) step.forEach((p,i) =>
    crackEls.push(<div key={si+'-'+i} style={{position:'absolute',left:p[0]*u,top:p[1]*u,width:u*0.6,height:u*0.6,background:C.dwood}} />)); });
  return (
    <div style={{ position:'absolute', left:x-ew/2+dx, top:y-eh, width:ew, height:eh }}>
      {!split && <Shadow cx={ew/2} y={eh} w={ew*0.8} />}
      <div style={{ position:'absolute', inset:0, transform:'rotate('+rot+'deg)', transformOrigin:'50% 100%', opacity:split?1-sp:1 }}>
        <div style={{ position:'absolute', left:split?-sp*40:0, top:split?-sp*90:0, transform:'rotate('+(-sp*20)+'deg)' }}>
          <PixelGrid rows={EGG_TOP} map={{E:C.cream}} u={u} />
        </div>
        <div style={{ position:'absolute', left:split?sp*30:0, top:5*u+(split?sp*36:0), transform:'rotate('+(sp*9)+'deg)' }}>
          <PixelGrid rows={EGG_BOT} map={{E:C.cream}} u={u} />
        </div>
        {!split && <div style={{position:'absolute',inset:0}}>{spotEls}{crackEls}</div>}
      </div>
    </div>
  );
}
function Confetti({ T, t0, x, y }) {
  const p = (T-t0)/0.9;
  if (p<=0 || p>=1) return null;
  const e = Easing.easeOutCubic(p);
  return <div style={{position:'absolute',left:0,top:0}}>{HUES.map((hue,i) => {
    const a = (i/8)*Math.PI*2 + 0.4, d = 20+e*95;
    return <div key={i} style={{position:'absolute',left:x+Math.cos(a)*d-5,top:y+Math.sin(a)*d*0.8+p*p*46-5,width:10,height:10,background:hue,opacity:1-p*0.85}} />;
  })}</div>;
}

/* ---- scenery ---- */
function House({ h, pal }) {
  const w = 170, hh = 120, x = h.x, y = h.y;
  return (
    <div style={{ position:'absolute', left:x-w/2, top:y-hh }}>
      <Shadow cx={w/2} y={hh+2} w={w*1.02} />
      <div style={{position:'absolute',left:-12,top:-18,width:w+24,height:20,background:h.roof}} />
      <div style={{position:'absolute',left:14,top:-36,width:w-28,height:18,background:h.roof}} />
      <div style={{position:'absolute',left:42,top:-52,width:w-84,height:16,background:h.roof}} />
      <div style={{position:'absolute',left:112,top:-66,width:22,height:32,background:C.wood}} />
      <div style={{position:'absolute',left:110,top:-70,width:26,height:6,background:C.dwood}} />
      <div style={{position:'absolute',left:0,top:2,width:w,height:hh-2,background:h.wall,border:'3px solid rgba(58,46,34,0.35)',boxSizing:'border-box'}} />
      <div style={{position:'absolute',left:26,top:hh-64,width:34,height:64,background:C.dwood}} />
      <div style={{position:'absolute',left:106,top:32,width:32,height:32,background:'#FFFDF4',border:'4px solid '+C.wood}} />
      <div style={{position:'absolute',left:0,top:hh-8,width:w,height:8,background:'rgba(90,70,40,0.35)'}} />
      <div style={{position:'absolute',left:14,top:hh,width:58,height:10,background:pal.line}} />
    </div>
  );
}
function Smoke({ T, x, y, op }) {
  if (op<=0.02) return null;
  return <div style={{position:'absolute',left:0,top:0}}>{[0,1,2].map(i => {
    const p = ((T*0.22 + i*0.33) % 1);
    const s = 8+p*9;
    return <div key={i} style={{position:'absolute',left:x+Math.sin(p*5+i)*9-s/2,top:y-p*74-s/2,width:s,height:s,background:'#FFFDF4',opacity:Math.sin(p*Math.PI)*0.5*op}} />;
  })}</div>;
}
function Tree({ x, y, pal }) {
  return (
    <div style={{position:'absolute',left:x-52,top:y-128}}>
      <Shadow cx={52} y={130} w={70} />
      <div style={{position:'absolute',left:44,top:92,width:16,height:36,background:C.wood}} />
      <div style={{position:'absolute',left:4,top:58,width:96,height:36,background:pal.tree}} />
      <div style={{position:'absolute',left:18,top:28,width:68,height:32,background:hexMix(pal.tree==='string'?pal.tree:'#8FB86B','#8FB86B',0)}} />
      <div style={{position:'absolute',left:32,top:4,width:40,height:26,background:pal.tree}} />
    </div>
  );
}
const TUFTS = [[180,900],[420,1000],[760,1020],[950,880],[1140,1015],[1330,960],[1610,990],[1790,930],[240,760],[1710,880],[560,1040],[1470,1040]];
const FLOWERS = [[350,940,'#e0a3b2'],[880,1000,'#e2b45e'],[1350,1005,'#e0a3b2'],[1680,930,'#e2b45e']];
const STARS = [[120,90],[340,180],[520,60],[700,150],[880,90],[1060,200],[1240,60],[1420,160],[1650,90],[1800,190],[240,320],[620,300],[1000,330],[1330,300],[1720,330],[440,420],[1160,430],[1560,430]];

function SignBoard({ x, y, w, h, postH, children }) {
  return (
    <div style={{position:'absolute',left:x,top:y}}>
      <Shadow cx={w*0.28} y={h+postH+4} w={30} />
      <Shadow cx={w*0.72} y={h+postH+4} w={30} />
      <div style={{position:'absolute',left:w*0.28-6,top:h-4,width:12,height:postH+4,background:C.wood}} />
      <div style={{position:'absolute',left:w*0.72-6,top:h-4,width:12,height:postH+4,background:C.wood}} />
      <div style={{position:'absolute',left:0,top:0,width:w,height:h,background:C.cream,border:'3px solid '+C.ink,boxSizing:'border-box',textAlign:'center'}}>{children}</div>
    </div>
  );
}

function Piece() {
  const { T, CUES, time } = useComposition();
  const CHt = CUES.Hatch, CD = CUES.Dawn, CSh = CUES.Showroom, CA = CUES.Auction, CSo = CUES.Sold, CT = CUES.Title;
  const hatchT = CHt + 0.5, popT = hatchT + 2.15, signT = hatchT + 2.85;
  const newBidT = CA + 3.4, leaveT = CSo + 0.9, plaqueT = CSo + 2.3;

  /* palette across the sky cycle */
  const stops = [
    { t:0, k:'night' }, { t:CD+0.3, k:'night' }, { t:CD+2.0, k:'dawn' }, { t:CD+4.2, k:'day' },
    { t:CA-0.8, k:'day' }, { t:CA+1.0, k:'dusk' }, { t:CSo+0.6, k:'dusk' }, { t:CSo+2.4, k:'night' }, { t:9999, k:'night' },
  ];
  let pal = PAL.night;
  for (let i=0;i<stops.length-1;i++) if (T < stops[i+1].t) {
    pal = blendPal(PAL[stops[i].k], PAL[stops[i+1].k], MOTION.glide(T, stops[i].t, stops[i+1].t)); break;
  }

  /* camera */
  const keys = [
    { t:0,       cx:960,  cy:640, s:1.0  }, { t:3.6,     cx:950,  cy:672, s:1.1  },
    { t:CHt+0.4, cx:690,  cy:876, s:2.0  }, { t:CD,      cx:696,  cy:868, s:2.12 },
    { t:CD+1.7,  cx:960,  cy:650, s:1.04 }, { t:CSh,     cx:960,  cy:650, s:1.04 },
    { t:CSh+2.6, cx:1140, cy:706, s:1.16 }, { t:CA,      cx:1140, cy:706, s:1.16 },
    { t:CA+1.2,  cx:1450, cy:786, s:1.62 }, { t:CSo,     cx:1450, cy:786, s:1.62 },
    { t:CSo+2.6, cx:1420, cy:716, s:1.4  }, { t:CT,      cx:1420, cy:716, s:1.4  },
    { t:CT+1.3,  cx:960,  cy:640, s:1.0  },
  ];
  let cam = keys[keys.length-1];
  for (let i=0;i<keys.length-1;i++) if (T < keys[i+1].t) {
    const p = MOTION.glide(T, keys[i].t, keys[i+1].t);
    cam = { cx:keys[i].cx+(keys[i+1].cx-keys[i].cx)*p, cy:keys[i].cy+(keys[i+1].cy-keys[i].cy)*p, s:keys[i].s+(keys[i+1].s-keys[i].s)*p };
    break;
  }
  const camStyle = { position:'absolute', inset:0, transform:'translate('+(W/2-cam.cx*cam.s)+'px,'+(H/2-cam.cy*cam.s)+'px) scale('+cam.s+')', transformOrigin:'0 0' };

  const dot = 0.45 + 0.55*(0.5+0.5*Math.sin(T*(Math.PI*2)/1.6));
  const secs = Math.max(0, 27682 - Math.floor(Math.max(0, T-CA)));
  const cd = String(Math.floor(secs/3600)).padStart(2,'0')+':'+String(Math.floor(secs%3600/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0');
  const bidFlash = T>=newBidT && T<newBidT+0.35;
  const newBid = T>=newBidT;
  const sold = T >= CSo + 0.3;

  const wakes = { aphorism:CD+1.8, moon:CD+2.3, homeforge:CD+2.7 };
  const hops = { aphorism:CSh+1.4 };
  const aphHop = hopPose(T, CSh+1.4);
  const butterX = ((T*105) % 2600) - 260;
  const butterY = 830 + Math.sin(T*1.8)*40 + Math.sin(T*0.5)*26;
  const flap = ((T*8)%1) < 0.5;

  const wmP = MOTION.pop(T, CT+1.2, 0.7);
  const subO = MOTION.fade(T, CT+1.9, CT+2.4);
  const signO = MOTION.fade(T, 0.3, 0.9);
  const chipO = MOTION.fade(T, CD+2.6, CD+3.2);

  /* shooting stars: one in the night open, one over the title */
  const shoot = (t0) => {
    const p = (T-t0)/0.8;
    if (p<=0 || p>=1) return null;
    const hx = 1150 + p*340, hy = 90 + p*160;
    return [0,1,2,3,4].map(i => <div key={t0+'-'+i} style={{position:'absolute',left:hx-i*16,top:hy-i*7,width:i?4:6,height:i?4:6,background:C.cream,opacity:(1-p)*(1-i*0.18)*pal.stars}} />);
  };
  const capCol = hexMix('#F2E5C4','#3A2E22', clamp(pal.sun*1.3,0,1));
  const capShadow = pal.sun>0.5 ? '0 2px 0 rgba(255,253,244,0.85)' : '0 2px 0 rgba(23,19,16,0.7)';

  return (
    <div data-screen-label={'t='+Math.floor(time)+'s'} style={{ position:'absolute', inset:0, overflow:'hidden', background:C.night, fontFamily:MO }}>
      <div style={camStyle}>
        {/* sky + dawn/dusk bands */}
        <div style={{position:'absolute',left:-400,top:-400,width:W+800,height:HOR+400,background:pal.sky}} />
        <div style={{position:'absolute',left:-400,top:HOR-150,width:W+800,height:60,background:pal.band,opacity:0.55}} />
        <div style={{position:'absolute',left:-400,top:HOR-90,width:W+800,height:90,background:pal.band}} />
        {/* sun + moon */}
        <div style={{position:'absolute',left:1600,top:200,width:84,height:84,background:'#E2B45E',opacity:pal.sun}}>
          <div style={{position:'absolute',left:14,top:14,width:56,height:56,background:'#F0CE8C'}} /></div>
        <div style={{position:'absolute',left:1490,top:150,width:70,height:70,background:C.cream,opacity:pal.stars}}>
          <div style={{position:'absolute',left:12,top:12,width:46,height:46,background:'#FFFDF4'}} />
          <div style={{position:'absolute',left:20,top:36,width:12,height:12,background:C.cream}} /></div>
        {/* flat cloud decks */}
        {[[220,150,190],[760,80,150],[1160,210,170],[1560,60,130]].map((cl,i) => (
          <div key={i} style={{position:'absolute',left:cl[0]-T*(5+i*2),top:cl[1]}}>
            <div style={{width:cl[2],height:28,background:pal.cloud}} />
            <div style={{position:'absolute',left:cl[2]*0.28,top:-14,width:cl[2]*0.55,height:18,background:pal.cloud}} />
          </div>
        ))}
        {/* treeline + ground */}
        {[[-380,52],[-150,40],[90,60],[360,46],[620,58],[900,42],[1150,56],[1400,44],[1660,60],[1900,48],[2140,56]].map((t,i) => (
          <div key={'tl'+i} style={{position:'absolute',left:t[0],top:HOR-t[1],width:250,height:t[1],background:pal.tree}} />
        ))}
        <div style={{position:'absolute',left:-400,top:HOR,width:W+800,height:1000,background:pal.grass}}>
          <div style={{position:'absolute',left:0,top:0,width:'100%',height:12,background:pal.line}} />
          <div style={{position:'absolute',left:340,top:250,width:520,height:60,background:pal.line,opacity:0.45}} />
          <div style={{position:'absolute',left:1200,top:320,width:560,height:64,background:pal.line,opacity:0.45}} />
          <div style={{position:'absolute',left:60,top:400,width:380,height:52,background:pal.line,opacity:0.35}} />
        </div>
        {TUFTS.map((t,i) => (
          <div key={'tf'+i} style={{position:'absolute',left:t[0],top:t[1],transform:'rotate('+Math.sin(T*0.8+i)*2+'deg)',transformOrigin:'50% 100%'}}>
            <div style={{width:7,height:14,background:pal.line}} />
            <div style={{position:'absolute',left:9,top:4,width:6,height:10,background:pal.line}} />
          </div>
        ))}
        {FLOWERS.map((f,i) => (
          <div key={'fl'+i} style={{position:'absolute',left:f[0],top:f[1]}}>
            <div style={{position:'absolute',left:2,top:8,width:5,height:12,background:pal.line}} />
            <div style={{position:'absolute',left:-1,top:0,width:10,height:10,background:f[2]}} />
          </div>
        ))}
        {/* houses + trees */}
        {HOUSES.map((h,i) => <House key={'h'+i} h={h} pal={pal} />)}
        <Tree x={80} y={880} pal={pal} /><Tree x={470} y={824} pal={pal} />
        <Tree x={1330} y={800} pal={pal} /><Tree x={1830} y={870} pal={pal} />
        {HOUSES.map((h,i) => <Smoke key={'s'+i} T={T+i*1.3} x={h.x-85+123} y={h.y-120-66} op={0.3+pal.sun*0.7} />)}
        {/* nursery pen + lantern */}
        <div style={{position:'absolute',left:0,top:0}}>
          {[540,838].map((px,i) => (<div key={'fp'+i}>
            <Shadow cx={px+7} y={946} w={26} />
            <div style={{position:'absolute',left:px,top:860,width:14,height:86,background:C.wood}} />
            <div style={{position:'absolute',left:px-2,top:856,width:18,height:8,background:C.dwood}} /></div>))}
          <div style={{position:'absolute',left:546,top:874,width:290,height:11,background:C.wood}} />
          <div style={{position:'absolute',left:546,top:908,width:290,height:11,background:C.wood}} />
          <div style={{position:'absolute',left:572,top:924,width:240,height:22,background:'#e2b45e'}} />
          <div style={{position:'absolute',left:586,top:918,width:66,height:10,background:C.wood}} />
          <div style={{position:'absolute',left:726,top:918,width:62,height:10,background:C.wood}} />
          <div style={{position:'absolute',left:554,top:942,width:276,height:8,background:C.wood,opacity:0.6}} />
          {/* lantern on the near post */}
          <div style={{position:'absolute',left:830,top:812,width:30,height:34,background:C.dwood}} />
          <div style={{position:'absolute',left:835,top:817,width:20,height:24,background:'#F0CE8C'}} />
        </div>
        <Egg T={T} x={612} y={936} u={7} spots={[[3,3],[6,5],[2,6],[5,8]]} hue="#e0a3b2" wobble />
        <Egg T={T} x={772} y={938} u={7} spots={[[4,2],[2,5],[6,6],[4,9],[7,4]]} hue="#9dba77" shiver />
        <Egg T={T} x={690} y={944} u={10} spots={[[3,3],[6,4],[2,7],[5,8],[7,6]]} hue="#b79fd6" hatchT={hatchT} />
        {/* rare pedestal */}
        <div style={{position:'absolute',left:0,top:0}}>
          <Shadow cx={1440} y={952} w={190} />
          <div style={{position:'absolute',left:1440-75,top:908,width:150,height:42,background:C.dwood}} />
          <div style={{position:'absolute',left:1440-95,top:884,width:190,height:26,background:C.wood}} />
          <div style={{position:'absolute',left:1440-95,top:906,width:190,height:5,background:C.dwood}} />
          <div style={{position:'absolute',left:1440-17,top:912}}>
            {['.XXX.','XXXXX','XXXXX','.XXX.','.X.X.'].map((row,r) => row.split('').map((ch,i) => ch==='X' &&
              <div key={r+'-'+i} style={{position:'absolute',left:i*7,top:r*7,width:7.3,height:7.3,background:C.accent}} />))}
          </div>
        </div>
        {/* creatures */}
        {CAST.map(c => {
          let cc = c, air = 0;
          if (c.hatch) {                       /* hops out of the pen at dawn */
            const wp = MOTION.glide(T, CD+2.0, CD+3.2);
            cc = { ...c, x:690+wp*240, y:914+wp*44 };
            air = -Math.abs(Math.sin(wp*Math.PI*2))*44;
          }
          return <Creature key={c.id} T={T} c={cc}
            popAt={c.hatch ? popT : null} leaveAt={c.rare ? leaveT : null}
            wakeAt={wakes[c.id]} hopAt={hops[c.id]} airDy={air} />;
        })}
        <PuffBurst T={T} t0={CD+2.6} x={810} y={936} />
        <PuffBurst T={T} t0={CD+3.2} x={930} y={958} />
        {aphHop.land>0 && <PuffBurst T={T} t0={aphHop.land} x={1050} y={962} />}
        <PuffBurst T={T} t0={leaveT} x={1440} y={884} />
        {/* butterfly (day only) */}
        <div style={{position:'absolute',left:butterX,top:butterY,opacity:pal.sun}}>
          <div style={{position:'absolute',left:0,top:0,width:8,height:8,background:'#e0a3b2',transform:flap?'translateY(-3px)':'none'}} />
          <div style={{position:'absolute',left:8,top:2,width:7,height:7,background:'#FFFDF4',transform:flap?'none':'translateY(-3px)'}} />
        </div>

        {/* ===== night tint over the world ===== */}
        <div style={{position:'absolute',left:-400,top:-400,width:W+800,height:H+800,background:'#232B42',opacity:pal.dark,pointerEvents:'none'}} />

        {/* ===== lights & sky life above the tint ===== */}
        {STARS.map((s,i) => (
          <div key={'st'+i} style={{position:'absolute',left:s[0],top:s[1],width:i%3===0?5:3.5,height:i%3===0?5:3.5,background:C.cream,opacity:pal.stars*(0.45+0.55*Math.abs(Math.sin(T*1.4+i*1.7)))}} />
        ))}
        {shoot(2.1)}{shoot(CT+1.6)}
        {HOUSES.map((h,i) => (
          <div key={'wg'+i} style={{position:'absolute',left:h.x-85+106,top:h.y-120+32,width:32,height:32,background:'#FFE9A6',opacity:pal.glow*(0.85+0.15*Math.sin(T*1.3+i*2))}} />
        ))}
        {/* lantern glow (stepped pixel halo) */}
        {[ [70,0.2],[130,0.12],[210,0.06] ].map(([sz,op],i) => (
          <div key={'lg'+i} style={{position:'absolute',left:845-sz/2,top:829-sz/2,width:sz,height:sz,background:'#F0CE8C',opacity:pal.glow*op}} />
        ))}
        <div style={{position:'absolute',left:835,top:817,width:20,height:24,background:'#F0CE8C',opacity:pal.glow}} />
        {/* fireflies */}
        {[0,1,2,3,4,5,6].map(i => {
          const fx = 260+i*250 + Math.sin(T*0.7+i*2.1)*70, fy = 780+((i*97)%140) + Math.cos(T*0.5+i)*30;
          return <div key={'ff'+i} style={{position:'absolute',left:fx,top:fy,width:5,height:5,background:'#e2b45e',opacity:pal.stars*(0.25+0.75*Math.abs(Math.sin(T*2.4+i*1.9)))}} />;
        })}
        {/* sleep z's */}
        <Zzz T={T} x={1050} y={880} show={T<wakes.aphorism-0.2 && pal.stars>0.5} />
        <Zzz T={T} x={1230} y={846} show={T<wakes.moon-0.2 && pal.stars>0.5} />
        {/* auction spotlight (the one allowed gradient) */}
        <div style={{position:'absolute',left:1440-340,top:560,width:680,height:470,background:'radial-gradient(ellipse at 50% 64%, rgba(255,233,166,0.5), rgba(255,233,166,0) 68%)',opacity:MOTION.fade(T,CA+0.4,CA+1.3)*(1-MOTION.fade(T,CT+0.3,CT+1.2))}} />

        {/* ===== signage (cream UI reads at any hour) ===== */}
        <div style={{opacity:signO, transform:'translateY('+(1-signO)*-26+'px)'}}>
          <SignBoard x={90} y={620} w={410} h={112} postH={96}>
            <div style={{fontFamily:PX,fontSize:41,lineHeight:'46px',color:C.ink,paddingTop:12}}>SWARM VILLAGE</div>
            <div style={{fontFamily:MO,fontSize:15,color:C.dwood,marginTop:4}}>every villager here was built by the swarm</div>
          </SignBoard>
        </div>
        <div style={{position:'absolute',left:110,top:754,background:C.cream,border:'2px solid '+C.ink,padding:'5px 12px',fontFamily:MO,fontSize:14.5,color:C.ink,display:'flex',alignItems:'center',gap:8,opacity:chipO}}>
          <span style={{width:9,height:9,background:C.accent,opacity:dot,display:'inline-block'}} />4 villagers · 2 eggs · 1 rare on the block
        </div>
        <div style={{position:'absolute',left:556,top:838,background:C.cream,border:'2px solid '+C.ink,padding:'3px 9px',fontFamily:PX,fontSize:16,color:C.ink}}>NURSERY</div>
        {[['dinner',612],['?????',772]].map(([nm,ex],i) => (
          <div key={'ec'+i} style={{position:'absolute',left:ex,top:952,transform:'translateX(-50%)',background:C.cream,border:'2px solid '+C.ink,padding:'2px 8px',fontFamily:MO,fontSize:12.5,color:C.ink}}>{nm}</div>
        ))}
        {[['aphorism',1050,966],['moon',1230,938]].map(([nm,x,y],i) => (
          <div key={'nc'+i} style={{position:'absolute',left:x,top:y+6,transform:'translateX(-50%)',background:C.cream,border:'2px solid '+C.ink,padding:'2px 9px',fontFamily:MO,fontSize:13,color:C.ink,opacity:MOTION.fade(T,CD+2.2,CD+2.8)}}>{nm}</div>
        ))}
        {T>CD+3.4 && <div style={{position:'absolute',left:930,top:964,transform:'translateX(-50%)',background:C.cream,border:'2px solid '+C.ink,padding:'2px 9px',fontFamily:MO,fontSize:13,color:C.ink,opacity:MOTION.fade(T,CD+3.4,CD+3.9)}}>prompt-spark</div>}
        {/* pre-auction pedestal sign */}
        <Shot from={0} to={CA+0.6}>
          <div style={{opacity:signO*(1-MOTION.fade(T,CA,CA+0.6))}}>
            <SignBoard x={1580} y={800} w={214} h={74} postH={72}>
              <div style={{fontFamily:PX,fontSize:22,color:C.accent,paddingTop:9}}>RARE DROP</div>
              <div style={{fontFamily:MO,fontSize:13.5,color:C.ink,marginTop:2}}>auction in 2d 4h</div>
            </SignBoard>
          </div>
        </Shot>
        <Shot from={CA+0.8} to={CT+60}>
          <div style={{position:'absolute',left:1440,top:958,transform:'translateX(-50%)',background:C.cream,border:'2px solid '+C.ink,padding:'3px 10px',fontFamily:PX,fontSize:16,color:C.ink}}>HOMEFORGE</div>
        </Shot>
        {/* hatch confetti + stamped sign */}
        <Confetti T={T} t0={popT} x={690} y={870} />
        <div style={{position:'absolute',left:690-152,top:712,width:304,opacity:(T>signT?1:0)*(1-MOTION.fade(T,CD+0.3,CD+0.9)),transform:'scale('+Math.max(0.01,MOTION.pop(T,signT,0.45))+')',transformOrigin:'50% 100%'}}>
          <div style={{background:C.cream,border:'3px solid '+C.ink,padding:'8px 10px',textAlign:'center'}}>
            <div style={{fontFamily:PX,fontSize:23,color:C.ink}}>PROMPT-SPARK</div>
            <div style={{fontFamily:MO,fontSize:11.5,color:C.dwood,marginTop:2}}>hatched at 3:12am · run 4 was the one</div>
          </div>
          <div style={{width:9,height:42,background:C.wood,margin:'0 auto'}} />
        </div>
        {/* ADOPTED plaque */}
        <div style={{position:'absolute',left:1440-128,top:790,width:256,opacity:Math.min(1,MOTION.pop(T,plaqueT,0.5)*1.4),transform:'scale('+Math.max(0.01,MOTION.pop(T,plaqueT,0.5))+')',transformOrigin:'50% 100%'}}>
          <div style={{background:C.cream,border:'3px solid '+C.ink,padding:'10px 12px',textAlign:'center'}}>
            <div style={{fontFamily:PX,fontSize:24,color:C.ink}}>ADOPTED</div>
            <div style={{fontFamily:MO,fontSize:13,color:C.ink,marginTop:3}}>by @maker_jane · $340</div>
            <div style={{fontFamily:MO,fontSize:11.5,color:C.dwood,marginTop:3}}>it lives in her village now</div>
          </div>
          <div style={{width:10,height:56,background:C.wood,margin:'0 auto'}} />
        </div>
        {/* auction board */}
        <Shot from={CA+0.5} to={CT+60}>
          <div style={{position:'absolute',left:1640,top:560,width:300,opacity:MOTION.fade(T,CA+0.5,CA+0.75)*(1-MOTION.fade(T,CT+0.2,CT+0.9)),transform:'translateX('+(1-MOTION.fade(T,CA+0.5,CA+0.75))*60+'px)'}}>
            <div style={{background:C.white,border:'3px solid '+C.ink,padding:'14px 16px'}}>
              {!sold ? (<div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{width:9,height:9,background:C.accent,opacity:dot}} />
                  <span style={{fontFamily:MO,fontSize:14,color:C.ink}}>live</span>
                  <span style={{fontFamily:PX,fontSize:16,color:C.accent,marginLeft:'auto'}}>RARE DROP №1</span>
                </div>
                <div style={{fontFamily:MO,fontSize:12.5,color:C.dwood,marginTop:12}}>ends in</div>
                <div style={{fontFamily:PX,fontSize:42,lineHeight:'44px',color:C.ink}}>{cd}</div>
                <div style={{marginTop:10,border:'2px solid '+C.ink,background:bidFlash?'#FFFDF4':C.cream,padding:'8px 12px'}}>
                  <div style={{fontFamily:PX,fontSize:30,color:C.ink}}>{newBid?'$260':'$240'}</div>
                  <div style={{fontFamily:MO,fontSize:12.5,color:C.ink}}>{newBid?'@you · just now':'@maker_jane · 2m ago'}</div>
                </div>
                <div style={{fontFamily:MO,fontSize:12,color:C.dwood,marginTop:10,lineHeight:'19px'}}>
                  {newBid && <div>$240 @maker_jane · 2m ago</div>}
                  <div>$220 @pixelfond · 19m ago</div>
                  <div>$180 @gardn · 1h ago</div>
                </div>
                <div style={{marginTop:10,border:'2px solid '+C.ink,padding:'7px 10px',fontFamily:MO,fontSize:11.5,color:C.ink,lineHeight:'17px'}}>1 of 1. the winner takes the repo, the live app, and the creature itself.</div>
              </div>) : (<div>
                <div style={{fontFamily:PX,fontSize:36,color:C.ink}}>sold.</div>
                <div style={{marginTop:10,border:'2px solid '+C.ink,background:C.cream,padding:'8px 12px'}}>
                  <div style={{fontFamily:PX,fontSize:30,color:C.ink}}>$340</div>
                  <div style={{fontFamily:MO,fontSize:12.5,color:C.ink}}>@maker_jane · aug 25, 9:04pm</div>
                </div>
                <div style={{fontFamily:MO,fontSize:12,color:C.dwood,marginTop:10,lineHeight:'18px'}}>the repo is hers, the live app is hers, and the creature has moved into her village. delisted — the swarm keeps no copy.</div>
                <div style={{marginTop:10,borderTop:'2px solid '+C.ink,paddingTop:8,fontFamily:MO,fontSize:11.5,color:C.ink}}>next: the judge is watching dinner, still on the nest.</div>
              </div>)}
            </div>
          </div>
        </Shot>
      </div>

      <Captions items={[
        { at:0.9,        until:CHt-0.2, text:'3:12am — the lights are out. the swarm is not.' },
        { at:CHt+1.1,    until:hatchT+2.0, text:'the judge just called a build done…' },
        { at:hatchT+3.1, until:CD-0.2,  text:'…and a new common hatches. never for sale.' },
        { at:CD+2.6,     until:CSh+0.8, text:'every villager here was built by the swarm' },
        { at:CSh+1.6,    until:CA-0.4,  text:'commons live here forever — proof the machine ships' },
        { at:CA+1.5,     until:CA+3.4,  text:'judge-picked, keeper-confirmed: a rare drop' },
        { at:CA+3.7,     until:CSo-0.2, text:'one buyer takes the repo, the live app, and the creature' },
        { at:CSo+1.8,    until:CT-0.3,  text:'it leaves this village and moves into yours' },
      ]} style={{ font:'500 31px '+MO, color:capCol, textShadow:capShadow, bottom:'5%' }} />

      <Shot from={CT} to={CT+60}>
        <div style={{position:'absolute',left:0,right:0,top:120,textAlign:'center',opacity:Math.min(1,wmP*2),transform:'translateY('+(1-wmP)*-80+'px) scale('+(0.9+wmP*0.1)+')'}}>
          <div style={{fontFamily:PX,fontWeight:700,fontSize:112,letterSpacing:8,color:C.cream,textShadow:'6px 6px 0 rgba(23,19,16,0.6)'}}>SWARM VILLAGE</div>
          <div style={{marginTop:14,fontFamily:MO,fontSize:26,fontWeight:500,color:C.cream,opacity:subO*0.85}}>watch eggs wobble · meet the villagers · catch the rare</div>
          <div style={{marginTop:10,fontFamily:MO,fontSize:22,fontWeight:600,color:C.accent,opacity:subO}}>village.fenley.ai</div>
        </div>
      </Shot>
    </div>
  );
}

function SwarmVillageApp() {
  const [t, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  return (
    <div style={{ position:'fixed', inset:0, background:'#171310' }}>
      <CompositionStage width={W} height={H} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg="#171310">
        <Piece />
      </CompositionStage>
      <TweaksPanel>
        <TweakSection label="Editor" />
        <TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak('motionEditor', v)} />
      </TweaksPanel>
    </div>
  );
}
window.SwarmVillageApp = SwarmVillageApp;
