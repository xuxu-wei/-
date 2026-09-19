import * as THREE from '../vendor/three/three.module.js';
import {planeVertex, backgroundFragment, pointVertex, pointFragment, galaxyFragment, sphereVertex, planetFragment, atmosphereFragment, haloFragment, blackHoleFragment, edgeVertex, edgeFragment} from './gpu-materials.mjs';

const TAU = Math.PI * 2;
const clamp = n => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
const smooth = (a, b, x) => {const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t);};
const colorHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#94b7cf';
function hash(value) {let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0;}
function random(seed) {return () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};}
function uniform(value) {return {value};}

function starGeometry(count, galaxy = false) {
  const rnd = random(galaxy ? 52063 : 72719), position = [], sizes = [], opacity = [], warmth = [];
  for (let i = 0; i < count; i++) {
    if (galaxy) {
      const radius = Math.pow(rnd(), .75) * .47, arm = i % 3 * TAU / 3;
      const spread = Math.sqrt(-2 * Math.log(Math.max(.0001, rnd()))) * Math.cos(TAU * rnd());
      const angle = arm + Math.log(radius + .057) * 5.1 + spread * (.17 + radius * .32);
      position.push(Math.cos(angle) * radius, Math.sin(angle) * radius * .58, (rnd() - .5) * .015);
      sizes.push(.6 + rnd() * 1.05 + (rnd() > .99 ? .9 : 0)); opacity.push(.15 + rnd() * .67); warmth.push(clamp(1 - radius * 2) * rnd());
    } else {
      position.push(rnd() - .5, rnd() - .5, rnd()); sizes.push(.45 + rnd() * .8 + (rnd() > .989 ? 1.4 : 0)); opacity.push(.16 + rnd() * .64); warmth.push(rnd() * .28);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(opacity, 1)); geometry.setAttribute('aWarm', new THREE.Float32BufferAttribute(warmth, 1));
  return geometry;
}

function distantGalaxyGeometry(seed) {
  const rnd = random(seed), position = [], sizes = [], opacity = [], warmth = [], morphology = seed % 5;
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(.0001, rnd()))) * Math.cos(TAU * rnd());
  const count = 90 + seed % 75;
  for (let i = 0; i < count; i++) {
    let x, y;
    if (morphology === 0) {x = gaussian() * .14; y = gaussian() * .084;}
    else if (morphology === 1) {x = gaussian() * .16; y = gaussian() * .026;}
    else if (morphology === 2) {const radius = rnd() < .72 ? .041 : .115; x = gaussian() * radius; y = gaussian() * radius;}
    else if (morphology === 3) {const side = rnd() < .5 ? -1 : 1; x = side * .10 + gaussian() * .063; y = -side * .045 + gaussian() * .058;}
    else {const side = rnd() < .61 ? -1 : 1; x = side * .12 + gaussian() * .047; y = -side * .025 + gaussian() * .036;}
    position.push(Math.max(-.44, Math.min(.44, x)), Math.max(-.44, Math.min(.44, y)), (rnd() - .5) * .012);
    sizes.push(.6 + rnd() * .65); opacity.push(.07 + rnd() * .27); warmth.push(0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3)); geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1)); geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(opacity, 1)); geometry.setAttribute('aWarm', new THREE.Float32BufferAttribute(warmth, 1));
  return geometry;
}

/** High quality WebGL atlas; CosmosRenderer remains a separate Canvas fallback. */
export class GPURenderer {
  constructor(canvas) {
    this.canvas = canvas; this.dark = true; this.disposed = false; this.width = 1; this.height = 1; this.dpr = 1;
    this.entries = new Map(); this.colorCache = new Map(); this.centerEntry = null; this.centerKey = ''; this.textureReady = false; this.blackHoleTextureReady = false;
    this.renderer = new THREE.WebGLRenderer({canvas, alpha: false, antialias: true, powerPreference: 'high-performance'});
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
    this.renderer.debug.onShaderError = (_gl, _program, _vertex, _fragment) => {throw new Error('WebGL 材质无法运行，将切换兼容星图。');};
    this.scene = new THREE.Scene(); this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000); this.camera.position.z = 1000;
    this.quad = new THREE.PlaneGeometry(1, 1); this.sphere = new THREE.SphereGeometry(1, 40, 28); this.moonSphere = new THREE.SphereGeometry(1, 12, 8);
    this.galaxyStars = starGeometry(1450, true); this.backgroundStars = starGeometry(1500, false);
    this.blankTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat); this.blankTexture.needsUpdate = true; this.galaxyTexture = this.blankTexture; this.blackHoleTexture = this.blankTexture;
    this.background = new THREE.Mesh(this.quad, this.shader(planeVertex, backgroundFragment, {uDark: uniform(1), uAspect: uniform(1)}, {transparent: false, depthWrite: false, depthTest: false})); this.background.position.z = -400; this.background.renderOrder = -100; this.scene.add(this.background);
    this.starfield = new THREE.Points(this.backgroundStars, this.pointsMaterial('#9bb9e4', 1.8, .74)); this.starfield.position.z = -300; this.starfield.renderOrder = -90; this.scene.add(this.starfield);
    this.blackHole = new THREE.Mesh(this.quad, this.shader(planeVertex, blackHoleFragment, {uTime: uniform(0), uDark: uniform(1), uOpacity: uniform(1), uMap: uniform(this.blackHoleTexture), uReady: uniform(0)})); this.blackHole.renderOrder = 2; this.scene.add(this.blackHole);
    this.edgeGeometry = new THREE.BufferGeometry(); this.edgeMesh = new THREE.LineSegments(this.edgeGeometry, this.shader(edgeVertex, edgeFragment, {}, {depthTest: false})); this.edgeMesh.renderOrder = -10; this.scene.add(this.edgeMesh); this.edgeCapacity = 0;
    this.scene.add(new THREE.HemisphereLight(0xbddeff, 0x060b18, .45)); const sun = new THREE.DirectionalLight(0xf2f5ff, 2.5); sun.position.set(-400, 400, 600); this.scene.add(sun);
    this.resize();
    new THREE.TextureLoader().load('/web/home/assets/galaxy-premium.png', texture => {
      if (this.disposed) {texture.dispose(); return;}
      texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.galaxyTexture = texture; this.textureReady = true;
    }, undefined, () => {this.textureReady = false;});
    new THREE.TextureLoader().load('/web/home/assets/black-hole-premium.png', texture => {
      if (this.disposed) {texture.dispose(); return;}
      texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter; texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.blackHoleTexture = texture; this.blackHoleTextureReady = true;
    }, undefined, () => {this.blackHoleTextureReady = false;});
  }

  shader(vertexShader, fragmentShader, uniforms, options = {}) {return new THREE.ShaderMaterial({vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, depthTest: true, ...options});}
  color(value) {const hex = colorHex(value); if (!this.colorCache.has(hex)) this.colorCache.set(hex, new THREE.Color(hex)); return this.colorCache.get(hex);}
  pointsMaterial(tint, size, opacity, taxonomy = false) {
    return this.shader(pointVertex, pointFragment, {uPixelRatio: uniform(this.dpr), uSize: uniform(size), uOpacity: uniform(opacity), uTint: uniform(this.color(tint).clone()), uDark: uniform(this.dark ? 1 : 0), uTaxonomy: uniform(taxonomy ? 1 : 0)}, {depthWrite: false});
  }

  makeEntry(kind, id) {
    const group = new THREE.Group(), seed = hash(id), entry = {kind, id, group, seed, ownGeometry: [], materials: []};
    const tint = this.color('#94b7cf').clone();
    const haloMaterial = this.shader(planeVertex, haloFragment, {uTint: uniform(tint.clone()), uDark: uniform(1), uGlow: uniform(0), uHover: uniform(0), uOpacity: uniform(1)}, {depthTest: false});
    entry.halo = new THREE.Mesh(this.quad, haloMaterial); entry.halo.renderOrder = 12; entry.halo.position.z = 12; group.add(entry.halo); entry.materials.push(haloMaterial);
    if (kind === 'part') {
      const material = this.shader(planeVertex, galaxyFragment, {uMap: uniform(this.galaxyTexture), uReady: uniform(this.textureReady ? 1 : 0), uDark: uniform(1), uTime: uniform(0), uSeed: uniform(seed % 1000 / 71), uOpacity: uniform(1), uTint: uniform(tint.clone()), uCentral: uniform(0), uMorphology: uniform(seed % 5)});
      entry.body = new THREE.Mesh(this.quad, material); entry.body.renderOrder = 3; group.add(entry.body); entry.materials.push(material);
      entry.farGeometry = distantGalaxyGeometry(seed); entry.ownGeometry.push(entry.farGeometry);
      entry.stars = new THREE.Points(entry.farGeometry, this.pointsMaterial('#94b7cf', 1.1, .45, true)); entry.stars.renderOrder = 4; entry.stars.position.z = 1; group.add(entry.stars); entry.materials.push(entry.stars.material);
    } else if (kind === 'chapter') {
      const material = this.shader(sphereVertex, planetFragment, {uTint: uniform(tint.clone()), uParentTint: uniform(tint.clone()), uLightDirection: uniform(new THREE.Vector3(-.62, .61, 1).normalize()), uCentral: uniform(0), uTime: uniform(0), uSeed: uniform(seed % 100000 / 1137), uDark: uniform(1), uOpacity: uniform(1), uLearned: uniform(0)}, {depthWrite: true});
      entry.body = new THREE.Mesh(this.sphere, material); entry.body.renderOrder = 5; group.add(entry.body); entry.materials.push(material);
      const atmosphere = this.shader(sphereVertex, atmosphereFragment, {uTint: uniform(tint.clone()), uParentTint: uniform(tint.clone()), uLightDirection: uniform(new THREE.Vector3(-.62, .61, 1).normalize()), uCentral: uniform(0), uDark: uniform(1), uOpacity: uniform(1)}, {side: THREE.FrontSide});
      entry.atmosphere = new THREE.Mesh(this.sphere, atmosphere); entry.atmosphere.renderOrder = 6; group.add(entry.atmosphere); entry.materials.push(atmosphere);
      entry.moon = new THREE.Mesh(this.moonSphere, new THREE.MeshStandardMaterial({color: 0x7e91a8, roughness: .91, metalness: 0})); entry.moon.renderOrder = 5; group.add(entry.moon); entry.materials.push(entry.moon.material);
    } else {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3)); geometry.setAttribute('aSize', new THREE.Float32BufferAttribute([1], 1)); geometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute([1], 1)); geometry.setAttribute('aWarm', new THREE.Float32BufferAttribute([.16], 1));
      entry.body = new THREE.Points(geometry, this.pointsMaterial('#94b7cf', 15 + seed % 4 * 1.7, .95, true)); entry.body.renderOrder = 7; group.add(entry.body); entry.materials.push(entry.body.material); entry.ownGeometry.push(geometry);
    }
    // Classification colours are display-referred; filmic exposure remains for
    // the black hole, not for data-bearing category materials.
    for (const material of entry.materials) material.toneMapped = false;
    this.scene.add(group); return entry;
  }

  removeEntry(entry) {if (!entry) return; this.scene.remove(entry.group); for (const material of entry.materials) material.dispose(); for (const geometry of entry.ownGeometry) geometry.dispose();}

  updateEntry(entry, data, time, opacity, isHover = false, neighbor = false, central = false, centerRadius = 37, parentTint = null, lightCenter = null) {
    const dark = this.dark ? 1 : 0, scale = Number.isFinite(data.scale) ? data.scale : 1, tint = this.color(data.color), glow = clamp(data.glow || 0), kind = entry.kind;
    entry.group.position.set(data.sx - this.width / 2, this.height / 2 - data.sy, central ? -3 : 5);
    const bodyUniforms = entry.body.material.uniforms;
    for (const material of entry.materials) {
      const uniforms = material.uniforms; if (!uniforms) continue;
      if (uniforms.uDark) uniforms.uDark.value = dark; if (uniforms.uTime) uniforms.uTime.value = time; if (uniforms.uTint) uniforms.uTint.value.copy(tint); if (uniforms.uPixelRatio) uniforms.uPixelRatio.value = this.dpr;
      if (uniforms.uCentral) uniforms.uCentral.value = central ? 1 : 0; if (uniforms.uParentTint) uniforms.uParentTint.value.copy(parentTint ? this.color(parentTint) : tint);
      if (uniforms.uLightDirection) {
        if (!central && lightCenter) uniforms.uLightDirection.value.set(lightCenter.x - data.sx, data.sy - lightCenter.y, 120).normalize();
        else uniforms.uLightDirection.value.set(-.62, .61, 1).normalize();
      }
    }
    let haloDiameter;
    if (kind === 'part') {
      const diameter = central ? centerRadius * 8.6 : (45 + entry.seed % 26) * scale;
      const turn = entry.seed % 628 / 100 + time * (central ? .038 : .052 + (entry.seed % 5) * .006);
      entry.body.scale.set(diameter, diameter, 1); entry.body.rotation.z = turn; entry.stars.scale.set(diameter, diameter, diameter); entry.stars.rotation.z = turn; entry.stars.geometry = central ? this.galaxyStars : entry.farGeometry;
      bodyUniforms.uMap.value = this.galaxyTexture; bodyUniforms.uReady.value = this.textureReady ? 1 : 0;
      bodyUniforms.uOpacity.value = clamp(opacity * (central ? 1 : this.dark ? .72 + glow * .17 + (isHover ? .13 : neighbor ? .06 : 0) : .96));
      entry.stars.material.uniforms.uOpacity.value = opacity * (central ? (this.textureReady ? .20 : .61) : .34 + glow * .22);
      entry.stars.material.uniforms.uSize.value = central ? 2.15 : 1.1; haloDiameter = central ? diameter * .9 : Math.max(40, diameter * .74);
    } else if (kind === 'chapter') {
      const radius = central ? centerRadius * 1.62 : (14.5 + entry.seed % 4 * .8) * scale;
      entry.body.scale.setScalar(radius); entry.atmosphere.scale.setScalar(radius * 1.065);
      bodyUniforms.uOpacity.value = opacity; bodyUniforms.uLearned.value = glow; entry.atmosphere.material.uniforms.uOpacity.value = opacity;
      const angle = time * .043 + entry.seed % 628 / 100, orbit = radius * (central ? 2.0 : 1.9);
      entry.moon.position.set(Math.cos(angle) * orbit, Math.sin(angle) * orbit * .35, Math.sin(angle) * orbit * .86); entry.moon.scale.setScalar(radius * (central ? .086 : .09)); entry.moon.material.opacity = opacity; entry.moon.material.transparent = opacity < .99;
      if (central) entry.moon.material.color.setHex(0x7e91a8); else entry.moon.material.color.copy(tint).lerp(parentTint ? this.color(parentTint) : tint, .72).multiplyScalar(.55);
      haloDiameter = radius * 3.8;
    } else {
      bodyUniforms.uOpacity.value = opacity * (.7 + glow * .3 + (isHover ? .15 : 0)); bodyUniforms.uSize.value = (15 + entry.seed % 4 * 1.7) * scale; haloDiameter = 34 * scale;
    }
    entry.halo.scale.set(haloDiameter, haloDiameter, 1); const halo = entry.halo.material.uniforms;
    halo.uGlow.value = central ? 0 : glow; halo.uHover.value = central ? 0 : isHover ? 1 : neighbor ? .32 : 0; halo.uOpacity.value = opacity;
    entry.halo.visible = !central && (glow > 0 || isHover || neighbor);
  }

  resize() {
    if (this.disposed) return; const box = this.canvas.getBoundingClientRect(); this.width = Math.max(1, box.width); this.height = Math.max(1, box.height); this.dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.dpr); this.renderer.setSize(this.width, this.height, false);
    this.camera.left = -this.width / 2; this.camera.right = this.width / 2; this.camera.top = this.height / 2; this.camera.bottom = -this.height / 2; this.camera.updateProjectionMatrix();
    this.background.scale.set(this.width * 1.01, this.height * 1.01, 1); this.background.material.uniforms.uAspect.value = this.width / this.height;
    this.starfield.scale.set(this.width * 1.12, this.height * 1.12, 1); this.starfield.material.uniforms.uPixelRatio.value = this.dpr;
  }

  setTheme(dark) {this.dark = Boolean(dark); this.background.material.uniforms.uDark.value = this.dark ? 1 : 0; this.starfield.material.uniforms.uDark.value = this.dark ? 1 : 0; this.renderer.setClearColor(this.dark ? 0x040814 : 0xe5effb, 1);}

  getDiameter(id = null) {const entry=id?this.entries.get(id):this.centerEntry;return entry?(entry.kind==='chapter'?entry.body.scale.x*2:entry.kind==='part'?entry.body.scale.x:18):1;}

  updateEdges(nodes, edges, hovered, reveal) {
    const lookup = new Map(nodes.map(node => [node.id, node])), segments = 12, count = edges.length * segments * 2;
    if (count > this.edgeCapacity) {
      this.edgeCapacity = Math.max(count, 128);
      this.edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.edgeCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage)); this.edgeGeometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(this.edgeCapacity * 3), 3).setUsage(THREE.DynamicDrawUsage)); this.edgeGeometry.setAttribute('aOpacity', new THREE.BufferAttribute(new Float32Array(this.edgeCapacity), 1).setUsage(THREE.DynamicDrawUsage));
    }
    if (!this.edgeCapacity) {this.edgeMesh.visible = false; return;} this.edgeMesh.visible = true;
    const positions = this.edgeGeometry.attributes.position.array, colors = this.edgeGeometry.attributes.aColor.array, alpha = this.edgeGeometry.attributes.aOpacity.array; let cursor = 0;
    for (const edge of edges) {
      const a = lookup.get(edge.source), b = lookup.get(edge.target); if (!a || !b) continue;
      const direct = hovered && (a.id === hovered || b.id === hovered), opacity = (direct ? .64 : hovered ? .01 : this.dark ? .05 : .075) * Math.min(reveal.get(a.id) ?? 1, reveal.get(b.id) ?? 1);
      const ca = this.color(a.color), cb = this.color(b.color), cx = (a.sx + b.sx) / 2 + (b.sy - a.sy) * .045, cy = (a.sy + b.sy) / 2 - (b.sx - a.sx) * .045;
      for (let i = 0; i < segments; i++) for (let end = 0; end < 2; end++) {
        const t = (i + end) / segments, u = 1 - t, j = cursor * 3;
        positions[j] = u * u * a.sx + 2 * u * t * cx + t * t * b.sx - this.width / 2; positions[j + 1] = this.height / 2 - (u * u * a.sy + 2 * u * t * cy + t * t * b.sy); positions[j + 2] = -35;
        const ink = this.dark ? 1 : .43; colors[j] = (ca.r * u + cb.r * t) * ink; colors[j + 1] = (ca.g * u + cb.g * t) * ink; colors[j + 2] = (ca.b * u + cb.b * t) * ink; alpha[cursor++] = opacity;
      }
    }
    this.edgeGeometry.setDrawRange(0, cursor); for (const attribute of Object.values(this.edgeGeometry.attributes)) attribute.needsUpdate = true;
  }

  draw({nodes = [], edges = [], center, radius = 48, time = 0, hovered = null, selected = null, neighbors = new Set(), intro = 0, introProgress = null, velocity = 0, centerKind = 'universe', centerColor = '#94b7cf', centerId = 'core'}) {
    if (this.disposed) return; if (this.renderer.getContext().isContextLost()) throw new Error('WebGL 上下文已丢失。');
    const opening = introProgress !== null, progress = opening ? clamp(introProgress) : 1;
    const reveal = new Map(nodes.map((node, index) => [node.id, opening ? smooth(.15 + index / Math.max(1, nodes.length) * .30, .32 + index / Math.max(1, nodes.length) * .30, progress) : 1]));
    const visible = new Set(nodes.map(node => node.id));
    for (const [id, entry] of this.entries) if (!visible.has(id)) {this.removeEntry(entry); this.entries.delete(id);}
    for (const node of nodes) {
      let entry = this.entries.get(node.id); if (!entry || entry.kind !== node.kind) {if (entry) this.removeEntry(entry); entry = this.makeEntry(node.kind, node.id); this.entries.set(node.id, entry);}
      const focus = node.id === hovered, neighbor = neighbors.has(node.id), fade = hovered && !focus && !neighbor ? .27 : 1;
      const opacity = reveal.get(node.id) * fade; entry.group.visible = opacity > .008;
      this.updateEntry(entry, node, time, opacity, focus || node.id === selected, neighbor, false, 37, centerKind === 'part' ? centerColor : node.color, centerKind === 'part' ? center : null);
    }
    this.updateEdges(nodes, edges, hovered, reveal);
    const opacity = opening ? smooth(0, .23, progress) : 1;
    if (centerKind === 'part' || centerKind === 'chapter') {
      const key = `${centerKind}:${centerId}`; if (key !== this.centerKey) {this.removeEntry(this.centerEntry); this.centerEntry = this.makeEntry(centerKind, centerId); this.centerKey = key;}
      this.blackHole.visible = false; this.centerEntry.group.visible = true;
      this.updateEntry(this.centerEntry, {sx: center.x, sy: center.y, color: centerColor, scale: 1, glow: 0}, time, opacity, false, false, true, radius, centerColor);
    } else {
      if (this.centerEntry) this.centerEntry.group.visible = false;
      this.blackHole.visible = opacity > .001; this.blackHole.position.set(center.x - this.width / 2, this.height / 2 - center.y, 0); this.blackHole.scale.set(radius * 9.2, radius * 9.2, 1); this.blackHole.material.uniforms.uTime.value = time; this.blackHole.material.uniforms.uDark.value = this.dark ? 1 : 0; this.blackHole.material.uniforms.uOpacity.value = opacity; this.blackHole.material.uniforms.uMap.value = this.blackHoleTexture; this.blackHole.material.uniforms.uReady.value = this.blackHoleTextureReady ? 1 : 0;
    }
    const cameraX = center.x - this.width * .5, cameraY = this.height * .5 - center.y;
    this.starfield.position.x = cameraX * .075; this.starfield.position.y = cameraY * .075; this.starfield.scale.set(this.width * (1.12 + intro * .055), this.height * (1.12 + intro * .055), 1); this.starfield.material.uniforms.uSize.value = 1.8 + Math.min(.5, Math.abs(velocity) * .35);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    for (const entry of this.entries.values()) this.removeEntry(entry); this.entries.clear(); this.removeEntry(this.centerEntry);
    for (const object of [this.background, this.starfield, this.blackHole, this.edgeMesh]) object.material.dispose();
    for (const geometry of [this.quad, this.sphere, this.moonSphere, this.galaxyStars, this.backgroundStars, this.edgeGeometry]) geometry.dispose();
    this.blankTexture.dispose(); if (this.galaxyTexture !== this.blankTexture) this.galaxyTexture.dispose(); if (this.blackHoleTexture !== this.blankTexture) this.blackHoleTexture.dispose(); this.renderer.dispose();
  }
}
