import test from 'node:test';
import assert from 'node:assert/strict';
import {CosmosRenderer} from '../../web/home/renderer.mjs';

class Gradient {
  constructor() {this.stops = [];}
  addColorStop(offset, color) {
    assert.ok(Number.isFinite(offset) && offset >= 0 && offset <= 1);
    assert.equal(typeof color, 'string'); assert.ok(!/NaN|undefined|Infinity/.test(color), `Invalid colour: ${color}`);
    this.stops.push([offset, color]);
  }
}
class Context {
  constructor() {this.calls = []; this.styles = []; this.alpha = 1; this.composite = 'source-over'; this.stack = [];}
  set globalAlpha(value) {assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `Invalid alpha: ${value}`); this.alpha = value;}
  get globalAlpha() {return this.alpha;}
  set globalCompositeOperation(value) {this.composite = value; this.calls.push(['composite', value]);}
  get globalCompositeOperation() {return this.composite;}
  set fillStyle(value) {this.styles.push(value);}
  set strokeStyle(value) {this.styles.push(value);}
  createRadialGradient(...args) {this.record('radialGradient', args); assert.ok(args[2] >= 0 && args[5] >= 0); return new Gradient();}
  createLinearGradient(...args) {this.record('linearGradient', args); return new Gradient();}
  record(name, args) {assert.ok(args.every(value => typeof value !== 'number' || Number.isFinite(value)), `${name} received non-finite geometry`); this.calls.push([name, ...args]);}
  save() {this.stack.push([this.alpha, this.composite]); this.calls.push(['save']);}
  restore() {[this.alpha, this.composite] = this.stack.pop(); this.calls.push(['restore']);}
}
for (const name of ['setTransform', 'translate', 'scale', 'rotate', 'fillRect', 'beginPath', 'arc', 'ellipse', 'fill', 'stroke', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'closePath', 'clip', 'drawImage']) {
  Context.prototype[name] = function (...args) {this.record(name, args);};
}
class Canvas {
  constructor() {this.context = new Context(); this.width = 1440; this.height = 900;}
  getContext() {return this.context;}
  getBoundingClientRect() {return {width: 1440, height: 900};}
}
function renderer() {
  globalThis.document = {createElement(tag) {assert.equal(tag, 'canvas'); return new Canvas();}};
  globalThis.window = {devicePixelRatio: 1};
  return new CosmosRenderer(new Canvas());
}
const scene = {nodes: [], edges: [], center: {x: 650, y: 440}, radius: 48, time: 3, hovered: null};

test('Parts, chapters and concepts use genuinely different geometry and cache identities', () => {
  const r = renderer(), galaxy = r.spriteFor('part', '1', '#b469c8'), planet = r.spriteFor('chapter', '1', '#b469c8'), concept = r.spriteFor('concept', '1', '#b469c8');
  assert.notEqual(galaxy, planet); assert.notEqual(planet, concept);
  assert.ok(galaxy.context.calls.filter(call => call[0] === 'arc').length > 1000, 'Galaxy should contain a resolved spiral star field');
  assert.ok(planet.context.calls.some(call => call[0] === 'clip'), 'Planet texture must be clipped to a sphere');
  assert.ok(planet.context.calls.some(call => call[0] === 'bezierCurveTo'), 'Planet has curved cloud belts');
  assert.ok(concept.context.calls.some(call => call[0] === 'ellipse'), 'Concept is a natural star or rounded minor body');
  assert.ok(!concept.context.calls.some(call => call[0] === 'closePath'), 'Concepts must not return to faceted crystal geometry');
  assert.ok(!concept.context.calls.some(call => call[0] === 'clip'));
  assert.equal(r.spriteFor('part', '1', '#b469c8'), galaxy, 'Repeated frames reuse their material');
});

test('Chapter identity determines its texture, while light mode gets separately authored contrasting materials', () => {
  const r = renderer(), a = r.spriteFor('chapter', '2.1', '#60b8c8'), b = r.spriteFor('chapter', '2.2', '#60b8c8');
  assert.notDeepEqual(a.context.calls.filter(call => call[0] === 'bezierCurveTo'), b.context.calls.filter(call => call[0] === 'bezierCurveTo'));
  const darkPart = r.spriteFor('part', '2', '#60b8c8');
  r.setTheme(false);
  const lightPart = r.spriteFor('part', '2', '#60b8c8'), lightPlanet = r.spriteFor('chapter', '2.1', '#60b8c8');
  assert.notEqual(darkPart, lightPart); assert.notEqual(a, lightPlanet);
  assert.notDeepEqual(darkPart.context.styles, lightPart.context.styles);
  assert.ok(lightPart.context.calls.every(call => call[0] !== 'composite' || call[1] !== 'multiply'));
  assert.ok(lightPlanet.context.styles.some(value => typeof value === 'string' && value.startsWith('rgba(')), 'Light planet retains a coloured limb');
});

test('The hierarchy changes the central object and renders orbital satellites only for chapters', () => {
  const r = renderer(), materials = [], holes = [];
  const material = r.material.bind(r), blackHole = r.blackHole.bind(r);
  r.material = args => {materials.push(args); material(args);};
  r.blackHole = (...args) => {holes.push(args); blackHole(...args);};
  r.draw(scene); assert.equal(holes.length, 1); assert.equal(materials.length, 0);
  r.draw({...scene, centerKind: 'part', centerId: '4', centerColor: '#9b85d5'});
  assert.equal(materials.at(-1).kind, 'part'); assert.equal(materials.at(-1).id, '4'); assert.equal(holes.length, 1);
  r.draw({...scene, centerKind: 'chapter', centerId: '4.2', centerColor: '#9b85d5'});
  assert.equal(materials.at(-1).kind, 'chapter'); assert.equal(holes.length, 1);
  assert.ok(r.ctx.calls.some(call => call[0] === 'ellipse'), 'Chapter system has orbital geometry');
});

test('A part galaxy dominates its small chapter satellites; entering a chapter enlarges that planet', () => {
  const r = renderer(), materials = [];
  r.material = args => materials.push(args);
  const chapter = {id: '1.1', kind: 'chapter', color: '#78aacc', sx: 220, sy: 340, scale: 1};
  r.draw({...scene, radius: 37, centerKind: 'part', centerId: '1', nodes: [chapter]});
  const centralGalaxy = materials.find(item => item.id === '1'), chapterSatellite = materials.find(item => item.id === '1.1');
  assert.ok(centralGalaxy.size >= 37 * 4.9 - 1e-8);
  assert.ok(centralGalaxy.size > chapterSatellite.size * 6);
  assert.ok(chapterSatellite.size >= 22 && chapterSatellite.size <= 26);
  assert.ok(centralGalaxy.emphasis > 1);
  materials.length = 0;
  r.draw({...scene, radius: 37, centerKind: 'chapter', centerId: '1.1', nodes: [{...chapter, id: 'concept', kind: 'concept'}]});
  assert.ok(materials.find(item => item.id === '1.1').size >= 37 * 2.07 - 1e-8);
});

test('Both themes render full achievement, hover, invalid colours and all hierarchy materials without invalid Canvas values', () => {
  const r = renderer();
  const nodes = ['part', 'chapter', 'concept'].map((kind, index) => ({id: String(index), kind, color: index === 1 ? 'bad' : '#78aacc', sx: 340 + index * 290, sy: 380, glow: 1, scale: 1.3}));
  for (const dark of [true, false]) {
    r.setTheme(dark);
    r.draw({...scene, nodes, edges: [{source: '0', target: '1', weight: 4}, {source: '1', target: '2', weight: 2}], hovered: '1', neighbors: new Set(['0', '1', '2']), centerKind: 'chapter', centerColor: undefined});
    r.draw({...scene, nodes, introProgress: .48, intro: .52, velocity: .7});
    assert.ok(r.ctx.calls.every(call => call[0] !== 'composite' || call[1] !== 'multiply'));
  }
});
