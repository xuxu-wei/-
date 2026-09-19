// Bounded local particle fields: no video, network asset, WebGL extension or
// discrete graphics card is required to explore the atlas.
const TAU = Math.PI * 2;
const clamp = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const smooth = (a, b, x) => {const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t);};
function rng(seed) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
function seedOf(value) {let seed = 2166136261; for (const c of String(value)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619); return seed >>> 0;}
function colorHex(value) {return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#9cbbdd';}
function tint(hex, alpha) {const x = colorHex(hex).slice(1); return `rgba(${parseInt(x.slice(0, 2), 16)},${parseInt(x.slice(2, 4), 16)},${parseInt(x.slice(4, 6), 16)},${clamp(alpha)})`;}
function blend(hex, target, amount) {const a = colorHex(hex), b = colorHex(target), t = clamp(amount); return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');}
function surface(width, height) {const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(width)); canvas.height = Math.max(1, Math.round(height)); return canvas;}

function galaxySprite(color, seed, dark) {
  const canvas = surface(320, 320), c = canvas.getContext('2d'), random = rng(seed);
  const arms = 2 + (seed % 3), inclination = .42 + random() * .25, winding = .043 + random() * .015;
  const ink = dark ? color : blend(color, '#153453', .37);
  c.translate(160, 160); c.scale(1, inclination); c.globalCompositeOperation = dark ? 'screen' : 'source-over';
  const mist = c.createRadialGradient(0, 0, 0, 0, 0, 151);
  mist.addColorStop(0, tint(ink, dark ? .30 : .26)); mist.addColorStop(.26, tint(ink, dark ? .16 : .12)); mist.addColorStop(1, tint(ink, 0));
  c.fillStyle = mist; c.fillRect(-160, -360, 320, 720);
  // Course nodes use different seeds, including those with the same taxonomy.
  for (let i = 0; i < 3500; i++) {
    const radius = Math.pow(random(), .78) * 144, arm = i % arms * TAU / arms;
    const angle = arm + radius * winding + (random() - .5) * (.38 + radius * .010);
    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius;
    const bright = random() < .027, size = bright ? .65 + random() * .75 : .18 + random() * .5;
    c.fillStyle = bright ? (dark ? `rgba(239,245,255,${.21 + random() * .60})` : tint(ink, .50 + random() * .4)) : tint(ink, (dark ? .035 : .08) + random() * (dark ? .27 : .48));
    c.beginPath(); c.arc(x, y, size, 0, TAU); c.fill();
  }
  const core = c.createRadialGradient(0, 0, 0, 0, 0, 28);
  core.addColorStop(0, dark ? '#fff8e5f0' : tint(ink, .98)); core.addColorStop(.07, dark ? '#ffffffd9' : tint(ink, .9)); core.addColorStop(.24, tint(ink, .65)); core.addColorStop(1, tint(ink, 0));
  c.fillStyle = core; c.fillRect(-29, -29, 58, 58);
  return canvas;
}

function planetSprite(color, seed, dark) {
  const canvas = surface(256, 256), c = canvas.getContext('2d'), random = rng(seed), radius = 88;
  const ink = blend(color, '#16314f', dark ? .08 : .24);
  c.translate(128, 128);
  const atmosphere = c.createRadialGradient(0, 0, radius * .96, 0, 0, radius * 1.16);
  atmosphere.addColorStop(0, tint(color, dark ? .35 : .18)); atmosphere.addColorStop(1, tint(color, 0));
  c.fillStyle = atmosphere; c.beginPath(); c.arc(0, 0, radius * 1.16, 0, TAU); c.fill();
  c.save(); c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.clip();
  const sphere = c.createRadialGradient(-radius * .38, -radius * .43, 1, radius * .16, radius * .19, radius * 1.19);
  sphere.addColorStop(0, blend(ink, '#f2f8ff', dark ? .66 : .77)); sphere.addColorStop(.36, blend(ink, '#f2f8ff', .20)); sphere.addColorStop(.68, ink); sphere.addColorStop(1, blend(ink, '#071221', dark ? .89 : .74));
  c.fillStyle = sphere; c.fillRect(-radius, -radius, radius * 2, radius * 2);
  // Seeded curved cloud belts: texture is unique to the chapter, while a stable
  // key light makes a recognisable sphere in either palette.
  const tilt = (random() - .5) * .36;
  c.rotate(tilt);
  for (let i = 0; i < 19; i++) {
    const y = -radius + i * radius * 2 / 18 + (random() - .5) * 8;
    c.strokeStyle = i % 3 ? tint(blend(ink, '#f2f8ff', .64), .10 + random() * .18) : tint(blend(ink, '#081a30', .55), .11 + random() * .17);
    c.lineWidth = 2 + random() * 8; c.beginPath(); c.moveTo(-radius * 1.2, y);
    c.bezierCurveTo(-radius * .43, y - 15 - random() * 7, radius * .4, y + 16 + random() * 8, radius * 1.2, y + 4); c.stroke();
  }
  for (let i = 0; i < 16; i++) {
    c.fillStyle = tint(i % 2 ? '#eef7ff' : ink, .055 + random() * .10);
    c.beginPath(); c.ellipse((random() - .5) * 150, (random() - .5) * 150, 5 + random() * 26, 2 + random() * 8, random() * .35, 0, TAU); c.fill();
  }
  c.restore();
  const shadow = c.createLinearGradient(-radius, -radius * .45, radius, radius * .35);
  shadow.addColorStop(0, '#02091300'); shadow.addColorStop(.5, '#02091300'); shadow.addColorStop(1, dark ? '#010611ce' : '#0613298f');
  c.fillStyle = shadow; c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.fill();
  c.strokeStyle = tint(dark ? blend(color, '#eaf7ff', .62) : blend(color, '#173453', .46), dark ? .34 : .68);
  c.lineWidth = dark ? 1.1 : 1.5; c.beginPath(); c.arc(0, 0, radius, 0, TAU); c.stroke();
  return canvas;
}

function conceptSprite(color, seed, dark) {
  const canvas = surface(160, 160), c = canvas.getContext('2d'), ink = dark ? color : blend(color, '#15304d', .38);
  const asteroid = seed % 6 === 0, radius = asteroid ? 21 : 10 + seed % 4;
  c.translate(80, 80);
  const halo = c.createRadialGradient(0, 0, 0, 0, 0, 68);
  halo.addColorStop(0, tint(ink, dark ? .32 : .14)); halo.addColorStop(.36, tint(ink, dark ? .09 : .05)); halo.addColorStop(1, tint(ink, 0));
  c.fillStyle = halo; c.fillRect(-70, -70, 140, 140);
  const body = c.createRadialGradient(-radius * .32, -radius * .35, 0, radius * .12, radius * .12, radius * 1.12);
  body.addColorStop(0, dark ? blend(ink, '#ffffff', asteroid ? .64 : .97) : blend(ink, '#f2f7fd', asteroid ? .62 : .12));
  body.addColorStop(.34, dark ? blend(ink, '#f0f8ff', asteroid ? .28 : .68) : ink);
  body.addColorStop(1, asteroid ? blend(ink, '#0c1d30', .72) : tint(ink, dark ? .18 : .85));
  c.fillStyle = body; c.beginPath(); c.ellipse(0, 0, radius, radius * (asteroid ? .86 : 1), asteroid ? (seed % 10) * .16 : 0, 0, TAU); c.fill();
  if (asteroid) {
    // A few quiet, rounded minor bodies add variety without polygonal jewellery.
    c.fillStyle = tint(blend(ink, '#091a2c', .63), .23);
    for (const [x, y, r] of [[-6, 3, 4.5], [7, -3, 3], [3, 10, 2]]) {c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();}
  } else {
    c.strokeStyle = tint(dark ? blend(ink, '#eaf6ff', .60) : ink, dark ? .32 : .26); c.lineWidth = .7;
    c.beginPath(); c.moveTo(-27, 0); c.lineTo(27, 0); c.moveTo(0, -27); c.lineTo(0, 27); c.stroke();
  }
  return canvas;
}

export class CosmosRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: false});
    if (!this.ctx) throw new Error('浏览器未提供画布；请使用全书目录继续学习。');
    this.sprites = new Map(); this.stars = []; this.width = 0; this.height = 0; this.dark = true; this.resize();
  }

  resize() {
    const {width, height} = this.canvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(width * dpr)); this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.width = width; this.height = height; this.dpr = dpr;
    const random = rng(42017);
    this.stars = Array.from({length: Math.min(1200, Math.round(width * height / 850))}, () => ({
      x: random(), y: random(), size: random() < .023 ? 1.15 : .16 + random() * .58,
      phase: random() * TAU, depth: .12 + random() * .88,
    }));
    this.background();
  }

  setTheme(dark) {this.dark = dark; this.background();}

  spriteFor(kind, id, color) {
    const material = kind === 'chapter' || kind === 'concept' ? kind : 'part';
    const shade = colorHex(color), key = `${this.dark ? 'dark' : 'light'}:${material}:${id}:${shade}`;
    let sprite = this.sprites.get(key);
    if (!sprite) {
      const factory = material === 'chapter' ? planetSprite : material === 'concept' ? conceptSprite : galaxySprite;
      sprite = factory(shade, seedOf(id), this.dark);
      if (this.sprites.size >= 96) this.sprites.delete(this.sprites.keys().next().value);
      this.sprites.set(key, sprite);
    }
    return sprite;
  }

  material({kind, id, color, x, y, size, time, spin = 0, opacity = 1, emphasis = 1}) {
    const c = this.ctx, seed = seedOf(id), ink = this.dark ? colorHex(color) : blend(color, '#173651', .38);
    const sprite = this.spriteFor(kind, id, color);
    c.save(); c.translate(x, y); c.globalAlpha = clamp(opacity);
    if (kind === 'chapter') {
      const tilt = -.22 + (seed % 13) * .027, orbit = size * 1.24;
      const moons = [0, 1].map(i => {
        const angle = (seed % 360) / 360 * TAU + time * (.09 + i * .018) + i * Math.PI * 1.15;
        return {x: Math.cos(angle) * orbit, y: Math.sin(angle) * orbit * .36, radius: size * (i ? .049 : .067)};
      });
      const moon = ({x: mx, y: my, radius: moonRadius}) => {
        const shade = c.createRadialGradient(mx - moonRadius * .35, my - moonRadius * .35, 0, mx, my, moonRadius);
        shade.addColorStop(0, blend(ink, '#f2f8ff', .85)); shade.addColorStop(1, blend(ink, '#071528', .55));
        c.fillStyle = shade; c.beginPath(); c.arc(mx, my, moonRadius, 0, TAU); c.fill();
      };
      c.save(); c.rotate(tilt);
      c.strokeStyle = tint(ink, this.dark ? .40 : .46); c.lineWidth = .7;
      c.beginPath(); c.ellipse(0, 0, orbit, orbit * .36, 0, Math.PI, TAU); c.stroke();
      moons.filter(item => item.y < 0).forEach(moon);
      c.restore();
      // Body illumination does not spin with the orbital plane.
      c.globalCompositeOperation = 'source-over'; c.drawImage(sprite, -size, -size, size * 2, size * 2);
      c.save(); c.rotate(tilt); c.strokeStyle = tint(ink, this.dark ? .47 : .54); c.lineWidth = .8;
      c.beginPath(); c.ellipse(0, 0, orbit, orbit * .36, 0, 0, Math.PI); c.stroke();
      moons.filter(item => item.y >= 0).forEach(moon);
      c.restore();
    } else {
      c.rotate(kind === 'concept' ? Math.sin(time * .11 + seed % 9) * .065 : spin + time * (.007 + (seed % 7) * .001));
      c.globalCompositeOperation = this.dark && kind !== 'concept' ? 'screen' : 'source-over';
      c.drawImage(sprite, -size, -size, size * 2, size * 2);
      if (kind === 'part' && emphasis > 1) {
        c.globalAlpha = clamp(opacity * (emphasis - 1));
        c.drawImage(sprite, -size, -size, size * 2, size * 2);
      }
    }
    c.restore();
  }

  background() {
    const w = Math.max(1, this.width), h = Math.max(1, this.height), random = rng(1201);
    this.bg = surface(w, h);
    const c = this.bg.getContext('2d');
    c.fillStyle = this.dark ? '#050915' : '#f1f5fc'; c.fillRect(0, 0, w, h);
    // Layer translucent clouds into an oblique galactic band; keep labels clear.
    for (let i = 0; i < 46; i++) {
      const t = random(), x = w * (.04 + .92 * t), y = h * (.69 - t * .36 + (random() - .5) * .25);
      const radius = Math.min(w, h) * (.12 + random() * .30), g = c.createRadialGradient(x, y, 0, x, y, radius);
      const colors = this.dark ? ['#39316e14', '#163f5d13', '#15505712', '#46598c0e'] : ['#9588ca09', '#668ab80a', '#51aaa108', '#9b8bbc07'];
      g.addColorStop(0, colors[i % colors.length]); g.addColorStop(.46, this.dark ? '#15224707' : '#709abd03'); g.addColorStop(1, '#00000000');
      c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    const vignette = c.createRadialGradient(w * .47, h * .49, Math.min(w, h) * .18, w * .47, h * .49, w * .66);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, this.dark ? '#01030bbb' : '#d9e5f51a');
    c.fillStyle = vignette; c.fillRect(0, 0, w, h);
  }

  blackHole(x, y, radius, time, reveal = 1) {
    const c = this.ctx, dark = this.dark;
    c.save(); c.globalAlpha = clamp(reveal); c.translate(x, y); c.rotate(-.19);
    c.globalCompositeOperation = dark ? 'screen' : 'source-over';
    let g = c.createRadialGradient(0, 0, radius * .42, 0, 0, radius * 3.3);
    g.addColorStop(0, dark ? '#6282ff1f' : '#537ecc0b'); g.addColorStop(.4, dark ? '#a689bc0b' : '#537ecc06'); g.addColorStop(1, '#00000000');
    c.fillStyle = g; c.fillRect(-radius * 3.4, -radius * 3.4, radius * 6.8, radius * 6.8);
    // A visual metaphor, not a simulation of general relativity. Back and front
    // halves of the disk give the event-horizon silhouette depth.
    for (let i = 90; i >= 0; i--) {
      const t = i / 90, r = radius * (1.12 + t * 1.18), alpha = (1 - t) * .11;
      c.strokeStyle = dark ? `rgba(${170 + Math.round(70 * (1 - t))},${146 + Math.round(84 * (1 - t))},${128 + Math.round(105 * (1 - t))},${alpha})` : `rgba(68,103,160,${alpha * .9})`;
      c.lineWidth = radius * .019; c.beginPath(); c.ellipse(0, 0, r, r * (.22 + .05 * t), 0, 0, TAU); c.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      c.strokeStyle = dark ? `rgba(219,201,186,${(1 - t) * .078})` : `rgba(62,96,145,${(1 - t) * .04})`;
      c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, -radius * .015, radius * (1.04 + t * .17), radius * (.97 + t * .08), 0, Math.PI, TAU); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    g = c.createRadialGradient(0, 0, radius * .3, 0, 0, radius * 1.06);
    g.addColorStop(0, dark ? '#010208' : '#101c33'); g.addColorStop(.91, dark ? '#010208' : '#182945'); g.addColorStop(1, dark ? '#12192a00' : '#304b7000');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, radius * 1.07, 0, TAU); c.fill();
    c.globalCompositeOperation = dark ? 'screen' : 'source-over';
    for (let i = 0; i < 60; i++) {
      const t = i / 60, r = radius * (1.04 + t * 1.15);
      c.strokeStyle = dark ? `rgba(247,217,179,${(1 - t) * .15})` : `rgba(79,115,170,${(1 - t) * .075})`;
      c.lineWidth = radius * .018; c.beginPath(); c.ellipse(0, radius * .035, r, r * .23, 0, 0, Math.PI); c.stroke();
    }
    const random = rng(84);
    for (let i = 0; i < 65; i++) {
      const a = random() * TAU + time * .09, r = radius * (1.13 + random() * .95);
      c.strokeStyle = dark ? `rgba(241,220,197,${.05 + random() * .17})` : `rgba(53,91,144,${.06 + random() * .15})`;
      c.lineWidth = .45; c.beginPath(); c.ellipse(0, 0, r, r * .24, 0, a, a + .03 + random() * .12); c.stroke();
    }
    const streak = c.createLinearGradient(-radius * 3.1, 0, radius * 3.1, 0);
    streak.addColorStop(0, '#00000000'); streak.addColorStop(.42, dark ? '#ddc6a532' : '#668bbc20'); streak.addColorStop(.5, dark ? '#fff0d356' : '#668bbc32'); streak.addColorStop(.58, dark ? '#ddc6a532' : '#668bbc20'); streak.addColorStop(1, '#00000000');
    c.fillStyle = streak; c.fillRect(-radius * 3.1, radius * .04, radius * 6.2, .8);
    c.restore();
  }

  draw({nodes, edges, center, radius, time, hovered, neighbors = new Set(), intro = 0, introProgress = null, velocity = 0, centerKind = 'universe', centerColor = '#9cbbdd', centerId = 'core'}) {
    const c = this.ctx, w = this.width, h = this.height;
    if (!w || !h) return;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    const opening = introProgress !== null, progress = opening ? clamp(introProgress) : 1;
    const offsetX = center.x - w * .48, offsetY = center.y - h * .52;
    c.drawImage(this.bg, -w * .025 + offsetX * .025, -h * .025 + offsetY * .025, w * 1.05, h * 1.05);
    for (const star of this.stars) {
      const dx = (star.x - .5) * w, dy = (star.y - .5) * h;
      const scale = 1 + intro * star.depth * .29;
      // Near stars move farther than background dust when approaching a galaxy.
      // The app remains authoritative for every selectable node's screen centre.
      const x = w * .5 + dx * scale + offsetX * star.depth * .20;
      const y = h * .5 + dy * scale + offsetY * star.depth * .20;
      const alpha = (.23 + Math.sin(time * .22 + star.phase) * .085) * star.depth;
      c.fillStyle = this.dark ? `rgba(195,215,247,${alpha + .10})` : `rgba(63,96,147,${alpha * .45})`;
      c.beginPath(); c.arc(x, y, star.size, 0, TAU); c.fill();
      if (velocity > .12 && star.depth > .55) {
        const length = .018 * velocity * star.depth, streak = c.createLinearGradient(x, y, x + dx * length, y + dy * length);
        streak.addColorStop(0, this.dark ? `rgba(201,219,255,${velocity * .26})` : `rgba(63,96,147,${velocity * .12})`); streak.addColorStop(1, '#00000000');
        c.strokeStyle = streak; c.lineWidth = star.size * .7; c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * length, y + dy * length); c.stroke();
      }
    }
    const reveal = new Map(nodes.map((node, index) => [node.id, opening ? smooth(.15 + index / Math.max(1, nodes.length) * .30, .32 + index / Math.max(1, nodes.length) * .30, progress) : 1]));
    const lookup = new Map(nodes.map(node => [node.id, node]));
    for (const edge of edges) {
      const a = lookup.get(edge.source), b = lookup.get(edge.target);
      if (!a || !b) continue;
      const direct = hovered && (a.id === hovered || b.id === hovered);
      const opacity = Math.min(reveal.get(a.id), reveal.get(b.id)) * (opening ? smooth(.30, .64, progress) : 1);
      if (opacity < .005) continue;
      const alpha = (direct ? .65 : hovered ? (this.dark ? .032 : .07) : (this.dark ? .15 : .25)) * opacity, gradient = c.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
      gradient.addColorStop(0, tint(this.dark ? a.color : blend(a.color, '#193957', .35), alpha)); gradient.addColorStop(1, tint(this.dark ? b.color : blend(b.color, '#193957', .35), alpha));
      const cx = (a.sx + b.sx) * .5 + (b.sy - a.sy) * .045, cy = (a.sy + b.sy) * .5 - (b.sx - a.sx) * .045;
      c.strokeStyle = gradient; c.lineWidth = direct ? 1.3 : .45 + Math.min(4, edge.weight || 1) * .08;
      c.beginPath(); c.moveTo(a.sx, a.sy); c.quadraticCurveTo(cx, cy, b.sx, b.sy); c.stroke();
      if (opening && progress > .36 && progress < .75) {
        const travel = clamp((progress - .36) / .39), u = 1 - travel;
        c.fillStyle = tint(a.color, Math.sin(travel * Math.PI) * .55);
        c.beginPath(); c.arc(u * u * a.sx + 2 * u * travel * cx + travel * travel * b.sx, u * u * a.sy + 2 * u * travel * cy + travel * travel * b.sy, 1.2, 0, TAU); c.fill();
      }
    }
    const centerOpacity = opening ? smooth(0, .23, progress) : 1;
    if (centerKind === 'part' || centerKind === 'chapter') {
      this.material({kind: centerKind, id: centerId, color: centerColor, x: center.x, y: center.y, size: radius * (centerKind === 'part' ? 4.9 : 2.07), time, opacity: centerOpacity, emphasis: centerKind === 'part' ? 1.7 : 1});
    } else this.blackHole(center.x, center.y, radius, time, centerOpacity);
    for (const node of nodes) {
      const isHover = node.id === hovered, neighbor = neighbors.has(node.id);
      const opacity = (hovered && !isHover && !neighbor ? .27 : 1) * reveal.get(node.id);
      if (opacity < .005) continue;
      const glow = clamp(node.glow || 0), seed = seedOf(node.id);
      const baseSize = node.kind === 'chapter' ? 24 : node.kind === 'concept' ? 26 : 73;
      const size = baseSize * (node.scale || 1) * (.94 + (seed % 13) / 100);
      const baseOpacity = node.kind === 'chapter' ? (this.dark ? .81 : .94) : node.kind === 'concept' ? (this.dark ? .65 : .91) : (this.dark ? .42 : .91);
      this.material({kind: node.kind, id: node.id, color: node.color, x: node.sx, y: node.sy, size, time, spin: node.spin || 0, opacity: clamp(baseOpacity + glow * .42 + (isHover ? .22 : neighbor ? .09 : 0)) * opacity});
      if (glow > 0) {
        c.save(); c.globalCompositeOperation = this.dark ? 'screen' : 'source-over';
        const aura = c.createRadialGradient(node.sx, node.sy, 0, node.sx, node.sy, 30 + glow * 31);
        aura.addColorStop(0, tint(node.color, .05 + glow * .19)); aura.addColorStop(.3, tint(node.color, glow * .09)); aura.addColorStop(1, tint(node.color, 0));
        c.fillStyle = aura; c.globalAlpha = opacity; c.fillRect(node.sx - 65, node.sy - 65, 130, 130);
        // Achievement is persistent radiance; hover is a separate temporary rim.
        if (glow > .45) {
          c.strokeStyle = this.dark ? tint('#fff7df', glow * .35) : tint(node.color, glow * .34); c.lineWidth = .6;
          const extent = 4 + glow * 9; c.beginPath(); c.moveTo(node.sx - extent, node.sy); c.lineTo(node.sx + extent, node.sy); c.moveTo(node.sx, node.sy - extent); c.lineTo(node.sx, node.sy + extent); c.stroke();
        }
        c.restore();
      }
      // Solid planets and small concept stars already have a meaningful centre.
      // Only spiral galaxies need a bright stellar nucleus over the texture.
      if (node.kind === 'part') {
        c.fillStyle = this.dark ? tint('#eff4ff', (.34 + glow * .66 + (isHover ? .28 : 0)) * opacity) : tint(blend(node.color, '#102944', .48), .88 * opacity);
        c.beginPath(); c.arc(node.sx, node.sy, 1.35 + glow * 1.6, 0, TAU); c.fill();
      }
      if (isHover || neighbor) {
        c.strokeStyle = this.dark ? `rgba(214,233,255,${isHover ? .8 : .30})` : `rgba(42,75,123,${isHover ? .8 : .35})`;
        const hoverRadius = node.kind === 'chapter' ? Math.max(17, size * .86) : node.kind === 'concept' ? Math.max(12, size * .54) : 17;
        c.lineWidth = isHover ? 1 : .7; c.beginPath(); c.arc(node.sx, node.sy, isHover ? hoverRadius : hoverRadius * .90, 0, TAU); c.stroke();
      }
    }
  }
}
