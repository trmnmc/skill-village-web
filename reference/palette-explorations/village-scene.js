/* Vendored verbatim from Claude Design project 96ec9409 — visual source of truth for the theme system. Do not edit. */
/* Skill Village palette-exploration scene painter + weather engine.
   Geometry + creature grids lifted verbatim from packages/core grids.ts and
   packages/web village.ts (scaled U=4). */
(function () {
  var U = 4;
  var HUES = ['#e58c68', '#b79fd6', '#9dba77', '#7fbf8a', '#e2b45e', '#e0a3b2', '#7fb6d9', '#6fbcad'];
  var EYE = '#FFF9EE', PUPIL = '#33241C';

  var BODIES = {
    pip: { rows: ['..XXX..', '.XXXXX.', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', '.XXXXX.', '..DDD..'], eyes: [[1, 2], [4, 2]], w: 7 },
    round: { rows: ['.XXXXXXX.', 'XXXXXXXXX', 'XXWWXWWXX', 'XXWWXWWXX', 'XXXXKXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..DD.DD..'], eyes: [[2, 2], [5, 2]], w: 9 },
    lanky: { rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '..X.X..', '..X.X..', '..X.X..', '.DD.DD.'], eyes: [[1, 2], [4, 2]], w: 7 },
    bean: { rows: ['.XXXXX.', 'XXXXXXX', 'XWWXWWX', 'XWWXWWX', 'XXXKXXX', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '.DD.DD.'], eyes: [[1, 2], [4, 2]], w: 7 },
    mound: { rows: ['...XXXXXX...', '.XXXXXXXXXX.', 'XXWWXXXXWWXX', 'XXWWXXXXWWXX', 'XXXXXKKXXXXX', 'XXXXXXXXXXXX', '.DD......DD.'], eyes: [[2, 2], [8, 2]], w: 12 },
    boxy: { rows: ['.XXXXXX.', 'XXXXXXXX', 'XWWXXWWX', 'XWWXXWWX', 'XXXKKXXX', 'XXXXXXXX', '.DD..DD.'], eyes: [[1, 2], [5, 2]], w: 8 },
  };
  var UNDERSIDE = { pip: ['..XXX..'], round: ['..XXXXX..'], lanky: ['..X.X..'], bean: ['..XXX..'], mound: ['..XXXXXXXX..'], boxy: ['.XXXXXX.'] };
  var WING = ['XXX.', 'XXXX', '.XX.'];
  var CROWNS = {
    none: { h: 0, cells: function () { return []; } },
    ears: { h: 3, cells: function (w) { var L = 1, R = w - 2; return [[L, -3], [R, -3], [L, -2], [R, -2], [L, -1], [L + 1, -1], [R - 1, -1], [R, -1]]; } },
    crest: { h: 3, cells: function (w) { var c = Math.floor((w - 1) / 2); return [[c, -3], [c - 1, -2], [c, -2], [c + 1, -2], [c - 2, -1], [c - 1, -1], [c, -1], [c + 1, -1], [c + 2, -1]]; } },
    tuft: { h: 1, cells: function (w) { var c = Math.floor((w - 1) / 2); return [[c - 1, -1], [c + 1, -1]]; } },
    horns: { h: 2, cells: function (w) { var L = 1, R = w - 2; return [[L, -2], [R, -2], [L, -1], [L + 1, -1], [R - 1, -1], [R, -1]]; } },
  };

  function hx(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function hex2(v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }
  function mix(a, b, k) { var A = hx(a), B = hx(b); return '#' + hex2(A[0] + (B[0] - A[0]) * k) + hex2(A[1] + (B[1] - A[1]) * k) + hex2(A[2] + (B[2] - A[2]) * k); }
  function frac(x) { return x - Math.floor(x); }
  function lite(hue) { return mix(hue, '#ffffff', 0.32); }

  var DIRS = {
    '1a': {
      name: 'Meadow Blue', ink: '#3A2E22', cream: '#F2E5C4', bubble: '#FFFDF4', wood: '#8A6B4A', accent: '#D97757',
      foliage: '#7FA85F', foliageLite: '#8FB86B', ground: '#A8C68D', groundDark: '#8FB075',
      houseA: ['#F2E5C4', '#D97757'], houseB: ['#E8D3EE', '#B39DDB'],
      skies: { dawn: ['#F4D9C0', '#F8E4CC', '#FBEEDD'], day: ['#C4E4F4', '#CFE9F5', '#DFF0EC'], dusk: ['#E9A87C', '#F0C08A', '#EDCFA2'], night: ['#1C2130', '#232A3C', '#2C3446'] },
    },
    '1b': {
      name: 'Golden Hour', ink: '#3A2E22', cream: '#F6E8C8', bubble: '#FFFDF4', wood: '#8A6B4A', accent: '#D97757',
      foliage: '#7FA85F', foliageLite: '#8FB86B', ground: '#A9C481', groundDark: '#92AF6C',
      houseA: ['#F6E8C8', '#D97757'], houseB: ['#F2D8A7', '#D96C57'],
      skies: { dawn: ['#F6CBA6', '#FADDBC', '#FCEAD2'], day: ['#F3DDB7', '#F7E6C6', '#FAEED6'], dusk: ['#DE8E63', '#EBAF7B', '#F0C896'], night: ['#241F2E', '#2C2739', '#352F45'] },
    },
    '1c': {
      name: 'Spring Tonic', ink: '#33382C', cream: '#F1F0DC', bubble: '#FDFDF2', wood: '#7E6A4E', accent: '#D97757',
      foliage: '#6FA868', foliageLite: '#85BC77', ground: '#9CC98F', groundDark: '#83B378',
      houseA: ['#F1F0DC', '#D97757'], houseB: ['#E4E9F2', '#8FA6C8'],
      skies: { dawn: ['#F2E3C2', '#EDEBCC', '#E4EED8'], day: ['#C9EDDD', '#D8F0E4', '#E7F4E7'], dusk: ['#E8B07E', '#E5C490', '#D8D2A2'], night: ['#17262A', '#1E3034', '#273B3E'] },
    },
    '1d': {
      name: 'Toasted Oat', ink: '#40342A', cream: '#F7EDD6', bubble: '#FFFCF0', wood: '#8A6B4A', accent: '#C96A4A',
      foliage: '#8A9A5B', foliageLite: '#9FAE6B', ground: '#B5B87E', groundDark: '#9CA067',
      houseA: ['#F7EDD6', '#C96A4A'], houseB: ['#E9DFC4', '#A6773F'],
      skies: { dawn: ['#F4D3AE', '#F6E0C0', '#F8EAD2'], day: ['#EDE3CB', '#F1E9D4', '#F5EFDE'], dusk: ['#D98F5E', '#E3AC74', '#E5C48C'], night: ['#221E19', '#2A2620', '#332E27'] },
    },
    '1e': {
      name: 'Berry Dusk', ink: '#3B3040', cream: '#F3E7E4', bubble: '#FFFBF8', wood: '#866A5E', accent: '#B5729F',
      foliage: '#74A876', foliageLite: '#8ABC84', ground: '#9FC494', groundDark: '#86AC7C',
      houseA: ['#F3E7E4', '#B5729F'], houseB: ['#E4D6F0', '#9C86C8'],
      skies: { dawn: ['#F0CFD8', '#F2DDE2', '#F1E8E4'], day: ['#DCD8F0', '#E4E0F4', '#EBE7EF'], dusk: ['#B87FA6', '#CC9DB4', '#DEBDBE'], night: ['#201C33', '#282341', '#322C4E'] },
    },
    '1f': {
      name: 'Marigold', ink: '#4A3A20', cream: '#FFF3CF', bubble: '#FFFDF2', wood: '#8F6E42', accent: '#E29435',
      foliage: '#7FAB53', foliageLite: '#93BE62', ground: '#AFC96F', groundDark: '#97B159',
      houseA: ['#FFF3CF', '#D97757'], houseB: ['#F2D8A7', '#C9803E'],
      skies: { dawn: ['#F9DCA4', '#FBE7B8', '#FCEFC9'], day: ['#F7EBB4', '#FAF0C4', '#FBF4D4'], dusk: ['#E9A155', '#F1BC6A', '#F3D285'], night: ['#1E2126', '#262A31', '#30343C'] },
    },
  };

  /* Weather: sky-graying tone + strength, and whether the sky is hidden. */
  var GRAYS = {
    rain: ['#93A2AC', 0.50], storm: ['#59636C', 0.68], snow: ['#BFC9D2', 0.50],
    fog: ['#C6C3B6', 0.55], cloudy: ['#A8AFB4', 0.35], heat: ['#FFD98A', 0.18],
  };
  var OVERCAST = { rain: 1, storm: 1, snow: 1, fog: 1, cloudy: 1 };

  function compose(bodyId, crownId, flying) {
    var body = BODIES[bodyId], crown = CROWNS[crownId];
    var rows = body.rows.slice();
    if (flying) {
      var feet = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].indexOf('D') >= 0) { feet = i; break; }
      rows = rows.slice(0, feet === -1 ? rows.length : feet).concat(UNDERSIDE[bodyId]);
    }
    var crownRows = [];
    if (crown.h > 0) {
      var cells = crown.cells(body.w);
      for (var r = -crown.h; r < 0; r++) {
        var chars = []; for (var c = 0; c < body.w; c++) chars.push('.');
        for (var j = 0; j < cells.length; j++) if (cells[j][1] === r) chars[cells[j][0]] = 'X';
        crownRows.push(chars.join(''));
      }
    }
    return { rows: crownRows.concat(rows), w: body.w, eyes: [[body.eyes[0][0], body.eyes[0][1] + crown.h], [body.eyes[1][0], body.eyes[1][1] + crown.h]] };
  }

  function drawGrid(ctx, grid, left, top, hue) {
    var l = lite(hue);
    for (var r = 0; r < grid.rows.length; r++) {
      for (var c = 0; c < grid.w; c++) {
        var ch = grid.rows[r][c];
        if (!ch || ch === '.') continue;
        ctx.fillStyle = ch === 'W' ? EYE : ch === 'K' ? PUPIL : ch === 'A' ? l : hue;
        ctx.fillRect(left + c * U, top + r * U, U, U);
      }
    }
    ctx.fillStyle = PUPIL;
    for (var e = 0; e < 2; e++) ctx.fillRect(left + (grid.eyes[e][0] + 1) * U, top + (grid.eyes[e][1] + 1) * U, U, U);
  }

  function drawCreature(ctx, spec, tintFn, shadowColor, shadowAlpha) {
    var grid = compose(spec.body, spec.crown, !!spec.fly);
    var h = grid.rows.length * U, w = grid.w * U;
    var left = Math.round(spec.x - w / 2), top = spec.y - h;
    if (!spec.fly) {
      ctx.globalAlpha = shadowAlpha;
      ctx.fillStyle = shadowColor;
      ctx.fillRect(left + 3, spec.y, w - 6, 4);
      ctx.globalAlpha = 1;
    }
    var hue = tintFn(spec.hue);
    if (spec.fly) {
      var wl = lite(hue), wy = top + U * 3;
      for (var r = 0; r < WING.length; r++) for (var c = 0; c < 4; c++) {
        if (WING[r][c] !== 'X') continue;
        ctx.fillStyle = wl;
        ctx.fillRect(left - (c + 1) * U, wy + r * U, U, U);
        ctx.fillRect(left + w + c * U, wy + r * U, U, U);
      }
    }
    drawGrid(ctx, grid, left, top, hue);
    return { left: left, top: top, w: w };
  }

  function drawUmbrella(ctx, cx, topY, canopy, stick) {
    var yB = topY - 8;
    ctx.fillStyle = stick; ctx.fillRect(cx + 6, yB, 4, 20);
    ctx.fillStyle = canopy;
    ctx.fillRect(cx - 10, yB - 4, 36, 5);
    ctx.fillRect(cx - 5, yB - 9, 26, 5);
    ctx.fillRect(cx + 1, yB - 13, 14, 4);
    ctx.fillRect(cx + 6, yB - 17, 4, 4);
  }

  function house(ctx, x, baseY, wall, roof, wood, windowFill, glow) {
    ctx.fillStyle = wall; ctx.fillRect(x, baseY - 44, 57, 44);
    ctx.fillStyle = wood; ctx.fillRect(x + 20, baseY - 23, 15, 23);
    if (glow) { ctx.globalAlpha = 0.22; ctx.fillStyle = '#FFD98A'; ctx.fillRect(x + 3, baseY - 41, 22, 20); ctx.globalAlpha = 0.12; ctx.fillRect(x - 6, baseY, 38, 8); ctx.globalAlpha = 1; }
    ctx.fillStyle = windowFill; ctx.fillRect(x + 7, baseY - 37, 11, 9);
    ctx.fillStyle = roof;
    ctx.fillRect(x - 5, baseY - 53, 68, 9);
    ctx.fillRect(x + 4, baseY - 61, 50, 8);
    ctx.fillRect(x + 15, baseY - 68, 28, 7);
  }

  function snowCaps(ctx, x, baseY, snow) {
    ctx.fillStyle = snow;
    ctx.fillRect(x - 5, baseY - 56, 68, 3);
    ctx.fillRect(x + 4, baseY - 64, 50, 3);
    ctx.fillRect(x + 15, baseY - 71, 28, 3);
  }

  function tree(ctx, x, baseY, wood, foliage, foliageLite) {
    ctx.fillStyle = wood; ctx.fillRect(x + 9, baseY - 28, 8, 28);
    ctx.fillStyle = foliage; ctx.fillRect(x, baseY - 62, 26, 36);
    ctx.fillStyle = foliageLite; ctx.fillRect(x + 5, baseY - 71, 16, 12);
  }

  function drawScene(canvas, dir, time, o) {
    var d = DIRS[dir]; if (!d) return;
    var opts = o || {};
    var weather = opts.weather || 'clear';
    var t = typeof opts.t === 'number' ? opts.t : 1.3;
    var staticFrame = !!opts.staticFrame;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 480, 270);

    var night = time === 'night', dusk = time === 'dusk', dawn = time === 'dawn';
    var overcast = !!OVERCAST[weather];

    var sky = d.skies[time].slice();
    var gr = GRAYS[weather];
    if (gr) {
      var tone = night ? mix(gr[0], '#10141A', 0.5) : gr[0];
      sky = [mix(sky[0], tone, gr[1]), mix(sky[1], tone, gr[1]), mix(sky[2], tone, gr[1])];
    }

    var tintCol = night ? sky[0] : dusk ? d.skies.dusk[0] : dawn ? d.skies.dawn[2] : null;
    var tintK = night ? 0.55 : dusk ? 0.18 : dawn ? 0.10 : 0;
    var creatureK = night ? 0.28 : dusk ? 0.10 : dawn ? 0.06 : 0;
    var sc = function (c) { return tintK ? mix(c, tintCol, tintK) : c; };
    var cc = function (c) { return creatureK ? mix(c, tintCol, creatureK) : c; };

    ctx.fillStyle = sky[0]; ctx.fillRect(0, 0, 480, 80);
    ctx.fillStyle = sky[1]; ctx.fillRect(0, 80, 480, 60);
    ctx.fillStyle = sky[2]; ctx.fillRect(0, 140, 480, 42);

    if ((night || dusk) && !overcast) {
      var starN = night ? 24 : 7;
      ctx.fillStyle = '#FFFFFF';
      for (var s = 0; s < starN; s++) {
        var sxp = (s * 167 + 9) % 470, syp = (s * 59 + 7) % 148;
        ctx.globalAlpha = night ? (s % 3 === 0 ? 0.9 : 0.5) : 0.3;
        ctx.fillRect(sxp, syp, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (night && !overcast && opts.shootingStar !== false && weather === 'clear') {
      for (var q = 0; q < 9; q++) {
        ctx.globalAlpha = 0.12 + q * 0.09;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(300 + q * 8, 24 + q * 4, q > 6 ? 3 : 2, q > 6 ? 3 : 2);
      }
      ctx.globalAlpha = 1;
    }

    if (!overcast) {
      if (time === 'day') {
        var sunW = weather === 'heat' ? 34 : 26, sunX = weather === 'heat' ? 386 : 392, sunY = weather === 'heat' ? 26 : 30;
        ctx.fillStyle = '#F5D66B'; ctx.fillRect(sunX, sunY, sunW, sunW);
        ctx.fillStyle = '#FBE9A5'; ctx.fillRect(sunX + 5, sunY + 5, sunW - 10, sunW - 10);
      } else if (dawn) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#FFE9B8'; ctx.fillRect(64, 116, 24, 24);
        ctx.fillStyle = '#FFF6DC'; ctx.fillRect(69, 121, 14, 14); ctx.globalAlpha = 1;
      } else if (dusk) {
        ctx.fillStyle = '#F2A45C'; ctx.fillRect(30, 96, 24, 24);
        ctx.fillStyle = '#F8C88A'; ctx.fillRect(35, 101, 14, 14);
      } else {
        ctx.globalAlpha = 0.10; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(384, 26, 34, 34); ctx.globalAlpha = 1;
        ctx.fillStyle = '#EEEADB'; ctx.fillRect(390, 32, 22, 22);
        ctx.fillStyle = mix('#EEEADB', sky[0], 0.4);
        ctx.fillRect(396, 38, 5, 5); ctx.fillRect(404, 46, 4, 4);
      }
    }

    if (weather === 'rainbow' && !night) {
      var bands = HUES.slice(0, 5).map(function (h, i) { return [h, 150 + i * 6]; });
      ctx.globalAlpha = night ? 0.35 : 0.72;
      for (var b = 0; b < 5; b++) {
        ctx.fillStyle = [HUES[0], HUES[4], HUES[2], HUES[6], HUES[1]][b];
        var rr = 170 - b * 6;
        for (var a = Math.PI; a <= Math.PI * 2; a += 0.025) {
          var ax = 240 + Math.cos(a) * rr, ay = 265 + Math.sin(a) * rr;
          if (ay < 0) continue;
          ctx.fillRect(Math.round(ax / 4) * 4, Math.round(ay / 4) * 4, 4, 4);
        }
      }
      ctx.globalAlpha = 1;
    }

    if (overcast && weather === 'storm') {
      /* layered storm sky: far deck, distant rain shafts, in-cloud flicker, near deck with lit rims */
      var deckFar = night ? '#2C343C' : '#68727A';
      var deckNear = night ? '#20272E' : '#4A545C';
      var deckRim = night ? '#39424B' : '#7E888F';
      var drift1 = (t * 3) % 520, drift2 = (t * 6) % 520;
      ctx.fillStyle = deckFar;
      for (var cf = 0; cf < 3; cf++) {
        var cfx = ((cf * 190 + drift1) % 660) - 90;
        ctx.fillRect(cfx, 2, 168, 20);
        ctx.fillRect(cfx + 24, 20, 120, 8);
      }
      /* distant rain shafts hanging from the far deck */
      ctx.fillStyle = night ? '#4A5862' : '#8C9AA4';
      for (var sh = 0; sh < 3; sh++) {
        var shx = ((sh * 176 + drift1 * 0.6) % 520) - 20;
        for (var sk = 0; sk < 5; sk++) {
          ctx.globalAlpha = 0.10 - sk * 0.016;
          ctx.fillRect(shx + sk * 3, 30, 30 - sk * 4, 150);
        }
      }
      ctx.globalAlpha = 1;
      /* in-cloud flicker on its own beat, offset from the bolt */
      var ph2 = t % 4.5;
      if (!staticFrame && ph2 > 1.7 && ph2 < 1.88) {
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#E8DFA8';
        ctx.fillRect(96, 12, 84, 34); ctx.globalAlpha = 1;
      }
      /* near deck: heavier, lower, lit rims on top */
      for (var cn = 0; cn < 4; cn++) {
        var cnx = ((cn * 150 + drift2) % 640) - 100;
        var cny = 24 + (cn % 2) * 12;
        ctx.fillStyle = deckRim; ctx.fillRect(cnx + 8, cny - 3, 118, 3);
        ctx.fillStyle = deckNear;
        ctx.fillRect(cnx, cny, 134, 24);
        ctx.fillRect(cnx + 18, cny + 24, 96, 9);
      }
      /* low ground mist whipped up by the rain */
      ctx.globalAlpha = 0.08; ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 172, 480, 16); ctx.globalAlpha = 1;
    } else if (overcast) {
      var cTone = weather === 'storm' ? '#6E767E' : weather === 'snow' ? '#C8D0D6' : weather === 'fog' ? '#CFCCC0' : weather === 'rain' ? '#9AA6AE' : '#B4BABE';
      if (night) cTone = mix(cTone, '#1A2028', 0.5);
      ctx.globalAlpha = 0.85; ctx.fillStyle = cTone;
      ctx.fillRect(14, 18, 96, 14); ctx.fillRect(32, 10, 52, 10);
      ctx.fillRect(150, 40, 74, 12);
      ctx.fillRect(248, 14, 112, 16); ctx.fillRect(270, 6, 62, 10);
      ctx.fillRect(384, 42, 82, 12);
      ctx.globalAlpha = 1;
    } else if (time === 'day' || dawn) {
      ctx.globalAlpha = 0.75; ctx.fillStyle = dawn ? '#FFF3E0' : '#FFFFFF';
      ctx.fillRect(70, 42, 40, 10); ctx.fillRect(80, 34, 24, 8);
      if (time === 'day') { ctx.fillRect(270, 66, 34, 9); ctx.fillRect(278, 59, 20, 7); }
      ctx.globalAlpha = 1;
    }

    var ground = d.ground, groundDark = d.groundDark;
    if (weather === 'snow') { ground = '#EBF1F2'; groundDark = '#D5E0E3'; }
    else if (weather === 'rain') { ground = mix(ground, '#5F7A70', 0.15); groundDark = mix(groundDark, '#5F7A70', 0.15); }
    else if (weather === 'storm') { ground = mix(ground, '#4E6660', 0.25); groundDark = mix(groundDark, '#4E6660', 0.25); }
    else if (weather === 'fog') { ground = mix(ground, '#B8B8A8', 0.25); groundDark = mix(groundDark, '#B8B8A8', 0.25); }

    ctx.fillStyle = sc(groundDark); ctx.fillRect(0, 182, 480, 8);
    ctx.fillStyle = sc(ground); ctx.fillRect(0, 190, 480, 80);
    ctx.fillStyle = weather === 'snow' ? sc('#C9D6DC') : sc(groundDark);
    for (var g = 0; g < 24; g++) {
      var gx = (g * 97 + 13) % 470, gy = 196 + ((g * 57 + 29) % 66);
      ctx.fillRect(gx, gy, 3, 2);
    }

    var glowWin = night || dusk || weather === 'storm';
    var windowFill = glowWin ? '#FFDF9E' : sky[1];
    house(ctx, 30, 224, sc(d.houseA[0]), sc(d.houseA[1]), sc(d.wood), windowFill, glowWin);
    house(ctx, 336, 218, sc(d.houseB[0]), sc(d.houseB[1]), sc(d.wood), windowFill, glowWin);
    tree(ctx, 152, 222, sc(d.wood), sc(d.foliage), sc(d.foliageLite));
    tree(ctx, 258, 214, sc(d.wood), sc(d.foliage), sc(d.foliageLite));
    if (weather === 'snow') {
      var snowC = sc('#F4F8F9');
      snowCaps(ctx, 30, 224, snowC);
      snowCaps(ctx, 336, 218, snowC);
      ctx.fillStyle = snowC;
      ctx.fillRect(152 + 5, 222 - 74, 16, 4); ctx.fillRect(152, 222 - 63, 26, 3);
      ctx.fillRect(258 + 5, 214 - 74, 16, 4); ctx.fillRect(258, 214 - 63, 26, 3);
    }

    ctx.fillStyle = sc(d.wood); ctx.fillRect(52, 244, 7, 22);
    ctx.fillStyle = sc(d.cream); ctx.fillRect(23, 226, 66, 20);
    ctx.fillStyle = sc(d.ink);
    ctx.font = '700 11px "Pixelify Sans"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Homes', 56, 237);

    if (night || dusk) {
      ctx.fillStyle = sc(d.wood); ctx.fillRect(104, 232, 4, 28);
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#FFD98A'; ctx.fillRect(96, 216, 20, 20); ctx.globalAlpha = 1;
      ctx.fillStyle = '#FFDF9E'; ctx.fillRect(101, 221, 10, 10);
      if (opts.moths !== false && !overcast) {
        ctx.fillStyle = '#E8E3D2';
        ctx.fillRect(93, 214, 2, 2); ctx.fillRect(118, 220, 2, 2); ctx.fillRect(112, 209, 2, 2);
      }
    }

    /* --- weather layers, drawn BEHIND the creatures so the pixel art stays legible --- */
    var fogTone = night ? '#8E8C80' : '#EDEBDF';
    var rainOn = weather === 'rain' || weather === 'storm';
    var flashNow = false;
    if (rainOn) {
      var heavy = weather === 'storm';
      var rn = heavy ? 100 : 70;
      ctx.fillStyle = night ? '#AEC2D2' : mix(sky[1], '#FFFFFF', 0.45);
      for (var ri = 0; ri < rn; ri++) {
        var r1 = frac(ri * 0.6180339), r2 = frac(ri * 0.7548776), r3 = frac(ri * 0.5698402);
        var rsp = (heavy ? 200 : 115) * (0.7 + r3 * 0.6);
        var rlen = (heavy ? 7 : 5) + r2 * 4;
        var rpy = (((r1 * 900) + t * rsp) % 290) - 12;
        var rpx = (r2 * 500) + (heavy ? -rpy * 0.28 : -rpy * 0.08);
        ctx.globalAlpha = 0.14 + r3 * 0.18;
        ctx.fillRect(rpx, rpy, 2, rlen);
      }
      ctx.globalAlpha = 1;
      /* splash ticks where drops land */
      ctx.fillStyle = night ? '#C3D4E2' : mix(sky[1], '#FFFFFF', 0.55);
      var sn = heavy ? 14 : 8;
      for (var pi = 0; pi < sn; pi++) {
        var cyc = frac(t * 1.3 + pi * 0.37);
        if (cyc > 0.28 && !staticFrame) continue;
        var sx2 = frac(pi * 0.6180339) * 466 + 4;
        var sy2 = 194 + frac(pi * 0.7548776) * 70;
        ctx.globalAlpha = staticFrame ? 0.35 : 0.4 * (1 - cyc / 0.28);
        ctx.fillRect(sx2 - 3, sy2, 2, 2); ctx.fillRect(sx2 + 3, sy2, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    if (weather === 'storm') {
      var ph = t % 4.5;
      flashNow = !staticFrame && ph < 0.14;
      var boltOn = staticFrame || flashNow || (ph > 0.22 && ph < 0.3);
      if (boltOn) {
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#FFEFA0';
        ctx.fillRect(312, 14, 16, 110); ctx.globalAlpha = 1;
        ctx.fillStyle = '#FFE896';
        ctx.fillRect(318, 14, 5, 28); ctx.fillRect(312, 40, 5, 22); ctx.fillRect(320, 60, 5, 26);
        ctx.fillRect(315, 84, 4, 18); ctx.fillRect(326, 46, 8, 4);
      }
    }
    if (weather === 'snow') {
      ctx.fillStyle = '#FFFFFF';
      for (var si = 0; si < 60; si++) {
        var s1 = frac(si * 0.6180339), s2 = frac(si * 0.7548776), s3 = frac(si * 0.5698402);
        var fall = 13 + s3 * 17;
        var spy = (((s1 * 900) + t * fall) % 285) - 5;
        var spx = (s2 * 480) + Math.sin(t * (0.35 + s3 * 0.5) + si) * (6 + s1 * 10);
        ctx.globalAlpha = 0.3 + s3 * 0.5;
        var ss2 = s1 < 0.15 ? 3 : 2;
        ctx.fillRect(spx, spy, ss2, ss2);
      }
      ctx.globalAlpha = 1;
    }
    if (weather === 'fog') {
      for (var fb = 0; fb < 3; fb++) {
        var fsp = 6 + fb * 4;
        var fby = 132 + fb * 38;
        var fbx = (((t * fsp) + fb * 210) % 760) - 260;
        for (var fs = 0; fs < 5; fs++) {
          ctx.globalAlpha = [0.09, 0.18, 0.24, 0.18, 0.09][fs];
          ctx.fillStyle = fogTone;
          ctx.fillRect(fbx + Math.sin(fb * 3 + fs * 1.7) * 14, fby + fs * 5, 500, 6);
        }
      }
      ctx.globalAlpha = 0.13; ctx.fillStyle = fogTone;
      ctx.fillRect(0, 60, 480, 210);
      ctx.globalAlpha = 1;
    }
    if (weather === 'wind') {
      for (var wi = 0; wi < 20; wi++) {
        var w1 = frac(wi * 0.6180339), w2 = frac(wi * 0.7548776);
        ctx.fillStyle = wi % 2 ? sc(d.foliageLite) : sc(d.foliage);
        ctx.globalAlpha = 0.85;
        var wx = (((w1 * 560) + t * (120 + w2 * 70)) % 560) - 40;
        var wy2 = 54 + w2 * 170 + Math.sin(t * 2 + wi) * 6;
        ctx.fillRect(wx, wy2, 6, 3);
      }
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#FFFFFF';
      ctx.fillRect((t * 150) % 480, 90, 70, 3); ctx.fillRect(((t * 150) + 200) % 480, 140, 54, 3); ctx.fillRect(((t * 150) + 340) % 480, 200, 60, 3);
      ctx.globalAlpha = 1;
    }
    if (weather === 'leaves') {
      var lc = ['#D97757', '#E2B45E', '#C96A4A', '#E58C68'];
      for (var li = 0; li < 20; li++) {
        var l1 = frac(li * 0.6180339), l2 = frac(li * 0.7548776);
        ctx.fillStyle = cc(lc[li % 4]);
        ctx.globalAlpha = 0.9;
        var lx = (l1 * 480) + Math.sin(t * (0.5 + l2 * 0.4) + li) * 18;
        var ly = (((l2 * 900) + t * (18 + l1 * 22)) % 300) - 10;
        ctx.fillRect(lx, ly, li % 3 ? 6 : 5, 3);
      }
      ctx.globalAlpha = 1;
    }
    if (weather === 'heat' && !night) {
      ctx.fillStyle = '#FFF6D8';
      for (var hl = 0; hl < 3; hl++) {
        for (var hxp = 0; hxp < 480; hxp += 12) {
          var hy = 170 - hl * 13 + Math.sin(hxp * 0.08 + t * 2.5 + hl * 2) * 3;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(hxp, hy, 7, 2);
        }
      }
      ctx.globalAlpha = 1;
    }

    var shadow = mix(groundDark, '#000000', 0.4);
    var shadowAlpha = night ? 0.28 : 0.42;
    var rainOn = weather === 'rain' || weather === 'storm';
    var cast = [
      { body: 'pip', crown: 'horns', hue: HUES[5], x: 146, y: 230 },
      { body: 'lanky', crown: 'tuft', hue: HUES[1], x: 200, y: 240, plate: ['Quill', 'doc-writer.md'] },
      { body: 'bean', crown: 'crest', hue: HUES[3], x: 306, y: 246, umbrella: true },
      { body: 'round', crown: 'ears', hue: HUES[0], x: 118, y: 256, umbrella: true },
      { body: 'mound', crown: 'none', hue: HUES[4], x: 264, y: 260 },
      { body: 'boxy', crown: 'none', hue: HUES[7], x: 442, y: 252 },
      { body: 'round', crown: 'ears', hue: HUES[6], x: 372, y: 132, fly: true },
    ];
    var tintFn = function (h) { return cc(h); };
    for (var ci = 0; ci < cast.length; ci++) {
      var spec = cast[ci];
      if (spec.fly && rainOn) continue; /* nobody flies in the rain */
      var box = drawCreature(ctx, spec, tintFn, shadow, shadowAlpha);
      if (rainOn && spec.umbrella) drawUmbrella(ctx, spec.x, box.top, cc(d.accent), sc(d.wood));
      if (spec.plate) {
        var px = spec.x, py = box.top - 30;
        ctx.font = '700 10px "Pixelify Sans"';
        var nw = ctx.measureText(spec.plate[0]).width;
        ctx.font = '8px "IBM Plex Mono"';
        var fw = ctx.measureText(spec.plate[1]).width;
        var pw = Math.ceil(Math.max(nw, fw)) + 14;
        ctx.fillStyle = sc(d.ink); ctx.fillRect(px - pw / 2 - 1.5, py - 1.5, pw + 3, 27);
        ctx.fillStyle = sc(d.bubble); ctx.fillRect(px - pw / 2, py, pw, 24);
        ctx.fillRect(px - 2, py + 24, 4, 4);
        ctx.fillStyle = sc(d.ink);
        ctx.font = '700 10px "Pixelify Sans"'; ctx.fillText(spec.plate[0], px, py + 8);
        ctx.fillStyle = sc(d.wood);
        ctx.font = '8px "IBM Plex Mono"'; ctx.fillText(spec.plate[1], px, py + 18);
      }
    }

    /* --- only the lightest touches sit in front of the creatures --- */
    if (flashNow) {
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, 480, 270); ctx.globalAlpha = 1;
    }
    if (weather === 'fog') {
      ctx.globalAlpha = night ? 0.1 : 0.08; ctx.fillStyle = fogTone;
      ctx.fillRect(0, 150, 480, 120); ctx.globalAlpha = 1;
    }

    var clearNight = weather === 'clear' || weather === 'heat' || weather === 'wind' || weather === 'leaves' || weather === 'rainbow';
    var flyCount = night && clearNight ? (typeof opts.fireflies === 'number' ? opts.fireflies : 9) : dusk && clearNight ? Math.min(4, typeof opts.fireflies === 'number' ? opts.fireflies : 9) : 0;
    for (var f = 0; f < flyCount; f++) {
      var fx = (f * 131 + 40) % 440 + 20, fy = 150 + ((f * 83) % 96);
      var tw = staticFrame ? 0.95 : Math.max(0.15, 0.5 + 0.5 * Math.sin(t * 2.4 + f * 1.9));
      ctx.globalAlpha = 0.22 * tw; ctx.fillStyle = '#FFE896'; ctx.fillRect(fx - 2, fy - 2, 6, 6);
      ctx.globalAlpha = tw; ctx.fillRect(fx, fy, 2, 2);
      ctx.globalAlpha = 1;
    }
  }

  function paintAll(opts) {
    var o = opts || {};
    var run = function () {
      var canvases = document.querySelectorAll('canvas[data-scene]');
      for (var i = 0; i < canvases.length; i++) {
        var cv = canvases[i];
        drawScene(cv, cv.getAttribute('data-dir'), cv.getAttribute('data-time'), {
          fireflies: typeof o.fireflies === 'number' ? o.fireflies : 9,
          moths: o.moths !== false,
          shootingStar: o.shootingStar !== false,
          weather: cv.getAttribute('data-weather') || 'clear',
          t: 1.3,
          staticFrame: true,
        });
      }
    };
    Promise.all([
      document.fonts.load('700 11px "Pixelify Sans"'),
      document.fonts.load('8px "IBM Plex Mono"'),
    ]).then(run, run);
  }

  function startLive(canvas, getState) {
    var raf = 0, running = true;
    var loop = function () {
      if (!running) return;
      var s = getState() || {};
      drawScene(canvas, s.dir || '1a', s.time || 'day', {
        fireflies: s.fireflies, moths: s.moths, shootingStar: s.shootingStar,
        weather: s.weather || 'clear', t: performance.now() / 1000, staticFrame: false,
      });
      raf = requestAnimationFrame(loop);
    };
    Promise.all([
      document.fonts.load('700 11px "Pixelify Sans"'),
      document.fonts.load('8px "IBM Plex Mono"'),
    ]).then(loop, loop);
    return function () { running = false; cancelAnimationFrame(raf); };
  }

  window.VillageScene = { paintAll: paintAll, drawScene: drawScene, startLive: startLive, DIRS: DIRS, HUES: HUES };
})();
