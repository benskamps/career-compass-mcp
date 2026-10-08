// Career Compass brand dial. Draws a brass compass whose needle points at a
// three-mark verdict scale (LONG SHOT · STRETCH · STRONG FIT). Pure SVG, no deps.
// drawCompass(svg, { r, theme: 'light'|'dark', bearing, scale: true, labelSize })
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const rad = (b) => ((b - 90) * Math.PI) / 180; // bearing (0 = up, clockwise) -> radians
  const pt = (r, b) => [r * Math.cos(rad(b)), r * Math.sin(rad(b))];
  const f = (n) => n.toFixed(2);
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function arc(r, b0, b1) {
    const [x0, y0] = pt(r, b0), [x1, y1] = pt(r, b1);
    const large = Math.abs(b1 - b0) > 180 ? 1 : 0;
    return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
  }

  const THEMES = {
    light: {
      faceA: '#fbf8f1', faceB: '#efe7d6', ink: '#2b2218', inkSoft: '#5a4a39', rule: '#cdbfa5',
      brassA: '#d9c48e', brassB: '#a2894f', brassC: '#6f5b2e', tick: '#5a4a39',
      roseLight: '#f6f2ea', roseDark: '#5a4a39', clay: '#c2603c', clayDeep: '#8a3b1f',
      sage: '#5a6b3c', label: '#5a4a39', active: '#5a6b3c', shadow: 'rgba(60,40,20,.28)', glass: 'rgba(255,255,255,.55)',
      seg: ['#c2603c', '#a2894f', '#5a6b3c'],
    },
    dark: {
      faceA: '#33291f', faceB: '#241c15', ink: '#ece1cc', inkSoft: '#bfae90', rule: '#4a3d2f',
      brassA: '#e3cf98', brassB: '#b39a5c', brassC: '#6a5629', tick: '#cdb98f',
      roseLight: '#3a2f24', roseDark: '#cdb98f', clay: '#d9744e', clayDeep: '#a04a28',
      sage: '#9aae74', label: '#cdb98f', active: '#a9bd82', shadow: 'rgba(0,0,0,.55)', glass: 'rgba(255,240,210,.10)',
      seg: ['#d9744e', '#c2a866', '#9aae74'],
    },
  };

  window.drawCompass = function (svg, o) {
    const R = o.r || 200;
    const T = THEMES[o.theme || 'light'];
    const bearing = o.bearing == null ? 44 : o.bearing;
    const id = 'cc' + Math.random().toString(36).slice(2, 7);
    const defs = el('defs', {}, svg);

    const bz = el('linearGradient', { id: id + 'bz', x1: '0', y1: '0', x2: '1', y2: '1' }, defs);
    el('stop', { offset: '0', 'stop-color': T.brassA }, bz);
    el('stop', { offset: '.45', 'stop-color': T.brassB }, bz);
    el('stop', { offset: '1', 'stop-color': T.brassC }, bz);
    const bz2 = el('linearGradient', { id: id + 'bz2', x1: '1', y1: '1', x2: '0', y2: '0' }, defs);
    el('stop', { offset: '0', 'stop-color': T.brassA }, bz2);
    el('stop', { offset: '.5', 'stop-color': T.brassB }, bz2);
    el('stop', { offset: '1', 'stop-color': T.brassC }, bz2);
    const face = el('radialGradient', { id: id + 'face', cx: '.42', cy: '.36', r: '.75' }, defs);
    el('stop', { offset: '0', 'stop-color': T.faceA }, face);
    el('stop', { offset: '1', 'stop-color': T.faceB }, face);
    const sh = el('filter', { id: id + 'sh', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feGaussianBlur', { stdDeviation: R * 0.07 }, sh);
    const nsh = el('filter', { id: id + 'nsh', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
    el('feDropShadow', { dx: R * 0.012, dy: R * 0.02, stdDeviation: R * 0.012, 'flood-color': '#1a120a', 'flood-opacity': o.theme === 'dark' ? .6 : .35 }, nsh);

    const g = el('g', {}, svg);
    // cast shadow (lamp is upper-left, so shadow falls lower-right)
    el('ellipse', { cx: R * 0.07, cy: R * 0.1, rx: R * 1.0, ry: R * 1.0, fill: T.shadow, filter: `url(#${id}sh)` }, g);

    // ---- verdict scale, outside the bezel -------------------------------
    if (o.scale !== false) {
      const sr = R * 1.13; // scale arc radius
      const segs = [
        { a: -72, b: -26, t: 'LONG SHOT' },
        { a: -22, b: 22, t: 'STRETCH' },
        { a: 26, b: 72, t: 'STRONG FIT' },
      ];
      const sg = el('g', {}, g);
      // fine hairline continuous track
      el('path', { d: arc(sr, -76, 76), fill: 'none', stroke: T.tick, 'stroke-width': R * 0.004, opacity: .45 }, sg);
      // minor graduations across the scale
      for (let b = -76; b <= 76; b += 2) {
        const major = b % 10 === 0;
        const [x0, y0] = pt(sr, b), [x1, y1] = pt(sr + R * (major ? 0.035 : 0.018), b);
        el('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), stroke: T.tick, 'stroke-width': R * (major ? 0.006 : 0.004), opacity: major ? .7 : .45 }, sg);
      }
      segs.forEach((s, i) => {
        const active = bearing >= s.a && bearing <= s.b;
        el('path', { d: arc(sr - R * 0.03, s.a, s.b), fill: 'none', stroke: T.seg[i], 'stroke-width': R * (active ? 0.026 : 0.012), 'stroke-linecap': 'round', opacity: active ? 1 : .7 }, sg);
        // label on a curved path
        const lr = sr + R * 0.1;
        const pid = id + 'lp' + i;
        el('path', { id: pid, d: arc(lr, s.a - 20, s.b + 20), fill: 'none' }, defs);
        const tx = el('text', {
          'font-family': '"JetBrains Mono", monospace', 'font-size': o.labelSize || R * 0.068, 'letter-spacing': (o.labelSize || R * 0.068) * 0.2,
          'font-weight': active ? 700 : 500, fill: active ? T.active : T.label, opacity: active ? 1 : .85,
        }, sg);
        const tp = el('textPath', { href: '#' + pid, startOffset: '50%', 'text-anchor': 'middle' }, tx);
        tp.textContent = s.t;
      });
      // pointer chevron on the scale at the needle bearing
      const [px, py] = pt(sr - R * 0.075, bearing);
      const cg = el('g', { transform: `translate(${f(px)} ${f(py)}) rotate(${bearing})` }, sg);
      el('path', { d: `M0 ${-R * 0.02} L${R * 0.022} ${R * 0.02} L${-R * 0.022} ${R * 0.02} Z`, fill: T.clay }, cg);
    }

    // ---- bezel -----------------------------------------------------------
    el('circle', { r: R, fill: `url(#${id}bz)` }, g);
    el('circle', { r: R * 0.985, fill: 'none', stroke: T.brassA, 'stroke-width': R * 0.006, opacity: .8 }, g);
    el('circle', { r: R * 0.915, fill: `url(#${id}bz2)` }, g);
    // knurled edge
    for (let b = 0; b < 360; b += 3) {
      const [x0, y0] = pt(R * 0.94, b), [x1, y1] = pt(R * 0.975, b);
      el('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), stroke: T.brassC, 'stroke-width': R * 0.005, opacity: .5 }, g);
    }
    // face
    el('circle', { r: R * 0.89, fill: `url(#${id}face)` }, g);
    el('circle', { r: R * 0.89, fill: 'none', stroke: T.brassC, 'stroke-width': R * 0.008, opacity: .6 }, g);

    // degree ring
    const ring = el('g', {}, g);
    el('circle', { r: R * 0.74, fill: 'none', stroke: T.tick, 'stroke-width': R * 0.004, opacity: .55 }, ring);
    el('circle', { r: R * 0.86, fill: 'none', stroke: T.tick, 'stroke-width': R * 0.003, opacity: .35 }, ring);
    for (let b = 0; b < 360; b += 2) {
      const len = b % 30 === 0 ? 0.075 : b % 10 === 0 ? 0.05 : 0.026;
      const [x0, y0] = pt(R * 0.86, b), [x1, y1] = pt(R * (0.86 - len), b);
      el('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), stroke: T.tick, 'stroke-width': R * (b % 30 === 0 ? 0.008 : 0.004), opacity: b % 10 === 0 ? .85 : .55 }, ring);
    }
    // cardinal letters
    [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([t, b]) => {
      const [x, y] = pt(R * 0.655, b);
      const tx = el('text', {
        x: f(x), y: f(y), 'text-anchor': 'middle', 'dominant-baseline': 'central',
        'font-family': 'Fraunces, serif', 'font-style': 'italic', 'font-size': R * (t === 'N' ? 0.12 : 0.095),
        'font-variation-settings': '"opsz" 144', 'font-weight': 420, fill: t === 'N' ? T.clayDeep : T.inkSoft,
      }, ring);
      tx.textContent = t;
    });

    // ---- rose (faceted 16-point star, quiet so the needle leads) ----------
    const rose = el('g', { opacity: o.theme === 'dark' ? .85 : .9 }, g);
    function point(b, len, w, op) {
      const [tx, ty] = pt(len, b), [lx, ly] = pt(w, b - 90), [rx, ry] = pt(w, b + 90);
      el('path', { d: `M0 0 L${f(lx)} ${f(ly)} L${f(tx)} ${f(ty)} Z`, fill: T.roseDark, opacity: op }, rose);
      el('path', { d: `M0 0 L${f(rx)} ${f(ry)} L${f(tx)} ${f(ty)} Z`, fill: T.roseLight, stroke: T.roseDark, 'stroke-width': R * 0.004, 'stroke-linejoin': 'round', opacity: 1 }, rose);
      el('path', { d: `M0 0 L${f(lx)} ${f(ly)} L${f(tx)} ${f(ty)} Z`, fill: 'none', stroke: T.roseDark, 'stroke-width': R * 0.004, 'stroke-linejoin': 'round' }, rose);
    }
    for (let b = 22.5; b < 360; b += 45) point(b, R * 0.34, R * 0.032, .18);
    for (let b = 45; b < 360; b += 90) point(b, R * 0.46, R * 0.05, .28);
    for (let b = 0; b < 360; b += 90) point(b, R * 0.6, R * 0.07, .5);
    el('circle', { r: R * 0.2, fill: 'none', stroke: T.roseDark, 'stroke-width': R * 0.004, opacity: .5 }, rose);
    el('circle', { r: R * 0.215, fill: 'none', stroke: T.roseDark, 'stroke-width': R * 0.003, opacity: .35, 'stroke-dasharray': `${R * 0.006} ${R * 0.014}` }, rose);

    // ---- needle (same lozenge as the favicon mark) ------------------------
    const ng = el('g', { transform: `rotate(${bearing})`, filter: `url(#${id}nsh)` }, g);
    const L = R * 0.78, Ls = R * 0.5, W = R * 0.072;
    el('path', { d: `M0 ${-L} L${W} 0 L0 0 Z`, fill: T.clay }, ng);
    el('path', { d: `M0 ${-L} L${-W} 0 L0 0 Z`, fill: T.clayDeep }, ng);
    el('path', { d: `M0 ${Ls} L${W} 0 L0 0 Z`, fill: o.theme === 'dark' ? '#d8cbb0' : '#3b3024' }, ng);
    el('path', { d: `M0 ${Ls} L${-W} 0 L0 0 Z`, fill: o.theme === 'dark' ? '#a8987a' : '#1f1811' }, ng);
    // pivot
    el('circle', { r: R * 0.06, fill: `url(#${id}bz)`, stroke: T.brassC, 'stroke-width': R * 0.006 }, g);
    el('circle', { r: R * 0.022, fill: T.brassC }, g);

    // glass highlight
    const hl = el('path', {
      d: `${arc(R * 0.83, -62, 18)} Q ${f(pt(R * 0.45, -22)[0])} ${f(pt(R * 0.45, -22)[1])} ${f(pt(R * 0.83, -62)[0])} ${f(pt(R * 0.83, -62)[1])} Z`,
      fill: T.glass,
    }, g);
    hl.setAttribute('opacity', '.55');
    return svg;
  };
})();
