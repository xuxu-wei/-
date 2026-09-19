import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createLayout, tickLayout, setPinned, releasePinned, edgeTargetLength} from '../../web/home/physics.mjs';
import {getView} from '../../web/home/graph-model.mjs';

const nodes = count => Array.from({length: count}, (_, index) => ({id: String(index), title: `单元 ${index + 1}`}));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const advance = (layout, frames = 240) => {for (let i = 0; i < frames; i++) tickLayout(layout, 1 / 60); return layout;};

test('Layout preserves catalogue data, is deterministic and accepts different hierarchy sizes', () => {
  for (const count of [0, 1, 4, 7, 14, 17]) {
    const input = nodes(count);
    const original = structuredClone(input);
    const edges = input.slice(1).map((node, index) => ({source: String(index), target: node.id, weight: index % 4 + 1}));
    const a = createLayout(input, edges), b = createLayout(input, edges);
    assert.deepEqual(a.nodes, b.nodes);
    assert.deepEqual(input, original);
    assert.equal(a.nodes.length, count);
    assert.ok(a.nodes.every(node => node.title.startsWith('单元')));
    advance(a);
    for (const node of a.nodes) {
      assert.ok([node.x, node.y, node.vx, node.vy].every(Number.isFinite));
      assert.ok(Math.abs(node.x) <= a.bound + 1e-8 && Math.abs(node.y) <= a.bound + 1e-8);
      assert.ok(Math.hypot(node.x, node.y) <= a.bound + 1e-8);
      assert.ok(Math.hypot(node.x, node.y) >= a.holeRadius + node.radius - 1e-7);
    }
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      assert.ok(distance(a.nodes[i], a.nodes[j]) >= a.nodes[i].radius + a.nodes[j].radius + a.gap - .0001, `${count} nodes: ${i} overlaps ${j}`);
    }
  }
});

test('Stronger direct relationships prefer, and settle at, shorter distances', () => {
  assert.ok(edgeTargetLength(8) < edgeTargetLength(3));
  assert.ok(edgeTargetLength(3) < edgeTargetLength(1));
  const input = [{id: 'a', x: -.45, y: .5}, {id: 'b', x: .45, y: .5}];
  const weak = advance(createLayout(input, [{source: 'a', target: 'b', weight: 1}]), 360);
  const strong = advance(createLayout(input, [{source: 'a', target: 'b', weight: 8}]), 360);
  assert.ok(distance(...strong.nodes) < distance(...weak.nodes) - .12);
  assert.ok(distance(...strong.nodes) >= strong.nodes[0].radius * 2);
});

test('Dragging stays pinned and moves its direct neighbour more than a distant unrelated node', () => {
  const input = [{id: 'a', x: -.65, y: .45}, {id: 'b', x: -.28, y: .65}, {id: 'c', x: .75, y: -.65}];
  const edges = [{source: 'a', target: 'b', weight: 5}];
  const moved = createLayout(input, edges), control = createLayout(input, edges);
  const a = moved.byId.get('a');
  assert.equal(setPinned(moved, 'a', a.x - .12, a.y - .3), true);
  const target = {...moved.pinned};
  advance(moved, 180); advance(control, 180);
  assert.equal(moved.byId.get('a').x, target.x);
  assert.equal(moved.byId.get('a').y, target.y);
  const neighbourMove = distance(moved.byId.get('b'), control.byId.get('b'));
  const unrelatedMove = distance(moved.byId.get('c'), control.byId.get('c'));
  assert.ok(neighbourMove > .05);
  assert.ok(neighbourMove > unrelatedMove * 2);
  releasePinned(moved, 'c'); assert.notEqual(moved.pinned, null);
  releasePinned(moved, 'a'); assert.equal(moved.pinned, null);
  assert.equal(moved.byId.get('a').vx, 0);
  assert.equal(setPinned(moved, 'missing', 0, 0), false);
});

test('The black-hole title stays clear and large or invalid timesteps cannot destabilise the scene', () => {
  const layout = createLayout(nodes(17));
  assert.equal(setPinned(layout, '0', 0, 0), true);
  const node = layout.byId.get('0');
  assert.ok(Math.hypot(node.x, node.y) >= layout.holeRadius + node.radius - 1e-8);
  setPinned(layout, '0', 10000, -10000);
  assert.ok(Math.abs(node.x - layout.bound / Math.SQRT2) < 1e-8);
  assert.ok(Math.abs(node.y + layout.bound / Math.SQRT2) < 1e-8);
  const previous = structuredClone(layout.nodes);
  tickLayout(layout, 0); tickLayout(layout, -1); tickLayout(layout, NaN);
  assert.deepEqual(layout.nodes, previous);
  releasePinned(layout);
  for (let i = 0; i < 500; i++) tickLayout(layout, i % 2 ? 86400 : Infinity);
  assert.ok(layout.nodes.every(node => [node.x, node.y, node.vx, node.vy].every(Number.isFinite)));
  assert.ok(layout.nodes.every(node => Math.abs(node.x) <= layout.bound && Math.abs(node.y) <= layout.bound));
  assert.ok(layout.nodes.every(node => Math.hypot(node.x, node.y) <= layout.bound + 1e-8));
});

test('A saved graph can contain external edges, reverse duplicates or coincident nodes without corrupting the layout', () => {
  const layout = createLayout([{id: 'a', x: .4, y: .4}, {id: 'b', x: .4, y: .4}], [
    {source: 'a', target: 'b', weight: 2}, {source: {id: 'b'}, target: 'a', weight: 3},
    {source: 'a', target: 'a', weight: 8}, {source: 'a', target: 'external', weight: 1},
  ]);
  assert.equal(layout.edges.length, 1);
  assert.equal(layout.edges[0].weight, 5);
  assert.equal(layout.edges[0].targetLength, edgeTargetLength(5));
  assert.ok(distance(...layout.nodes) > .27);
  assert.throws(() => createLayout([{id: 'a'}, {id: 'a'}]), /unique id/);
});

test('Every published atlas view fits the rotating circular stage and keeps its central concept clear', () => {
  const graph = JSON.parse(readFileSync(new URL('../../web/home/graph.json', import.meta.url), 'utf8'));
  const parents = [null, ...graph.nodes.filter(node => node.kind !== 'concept').map(node => node.id)];
  for (const parent of parents) {
    const view = getView(graph, parent);
    const layout = createLayout(view.nodes, view.edges, {radius: .18, holeRadius: .19});
    for (const node of layout.nodes) {
      const radius = Math.hypot(node.x, node.y);
      assert.ok(radius <= layout.bound + 1e-8, `${node.id} escapes the rotating stage`);
      assert.ok(radius >= layout.holeRadius + node.radius - 1e-8, `${node.id} covers the central concept`);
    }
    for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i], b = layout.nodes[j];
      assert.ok(distance(a, b) >= a.radius + b.radius + layout.gap - .001, `${parent}: ${a.id} overlaps ${b.id}`);
    }
    if (layout.nodes.length >= 3 && layout.nodes.length <= 10) {
      const centerX = layout.nodes.reduce((sum, node) => sum + node.x, 0) / layout.nodes.length;
      const centerY = layout.nodes.reduce((sum, node) => sum + node.y, 0) / layout.nodes.length;
      assert.ok(Math.hypot(centerX, centerY) < .20, `${parent}: a small hierarchy must surround its parent instead of crowding one side`);
    }
    if (parent === null) {
      const spanX = Math.max(...layout.nodes.map(node => node.x)) - Math.min(...layout.nodes.map(node => node.x));
      const spanY = Math.max(...layout.nodes.map(node => node.y)) - Math.min(...layout.nodes.map(node => node.y));
      const meanRadius = layout.nodes.reduce((sum, node) => sum + Math.hypot(node.x, node.y), 0) / layout.nodes.length;
      assert.ok(spanX > 1.5 && spanY > 1.5, 'The full book should occupy the stage rather than a small central cluster');
      assert.ok(meanRadius > .70, 'The galaxy distribution should use a broad annulus');
    }
  }
});

test('The 17-part accretion-disk annulus is balanced, clear and keeps strong links usually nearer', () => {
  const graph = JSON.parse(readFileSync(new URL('../../web/home/graph.json', import.meta.url), 'utf8'));
  const view = getView(graph);
  const layout = createLayout(view.nodes, view.edges, {radius: .105, holeRadius: .55});
  assert.equal(layout.nodes.length, 17);
  assert.equal(layout.holeRadius, .55);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const validate = () => {
    const octants = new Set();
    for (const node of layout.nodes) {
      const r = Math.hypot(node.x, node.y);
      assert.ok(r >= .655 - 1e-8 && r <= layout.bound + 1e-8, `${node.id} invades the disk or leaves the orbit`);
      octants.add(Math.floor((Math.atan2(node.y, node.x) + Math.PI) / (2 * Math.PI) * 8) % 8);
    }
    assert.equal(octants.size, 8, 'The orbit should surround the disk rather than crowd one side');
    const centroid = Math.hypot(mean(layout.nodes.map(n => n.x)), mean(layout.nodes.map(n => n.y)));
    assert.ok(centroid < .08, `The orbit centre drifted: ${centroid}`);
    const pairs = new Map(layout.edges.map(edge => [[edge.source, edge.target].sort().join('|'), edge.weight]));
    const strong = [], unrelated = [];
    for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
      const a = layout.nodes[i], b = layout.nodes[j], d = distance(a, b);
      assert.ok(d >= a.radius + b.radius + layout.gap - .0001, `${a.id} overlaps ${b.id}`);
      const weight = pairs.get([a.id, b.id].sort().join('|'));
      if (weight >= 3) strong.push(d);
      if (!weight) unrelated.push(d);
    }
    assert.ok(strong.length && unrelated.length);
    assert.ok(mean(strong) < mean(unrelated) * .8, 'Strong direct relations should usually be nearer than unrelated pairs');
  };
  validate();
  advance(layout, 1200);
  validate();
});

test('An oversized central hole is limited by the actual largest node and outer bound', () => {
  const layout = createLayout([{id:'small',radius:.12},{id:'large',radius:.19}], [],
    {holeRadius:99,bound:.65,radius:.105});
  assert.equal(layout.holeRadius, .65 - .19);
  for (const node of layout.nodes) {
    const r = Math.hypot(node.x, node.y);
    assert.ok(r >= layout.holeRadius + node.radius - 1e-8 && r <= layout.bound + 1e-8);
  }
});
