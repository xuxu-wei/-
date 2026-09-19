/**
 * Deterministic, dependency-free layout for the knowledge atlas.
 *
 * Coordinates are normalised, with a quiet hole at the origin for the central
 * concept. These are visual layout forces, not a gravitational model. Rotation
 * belongs to the renderer: stopping it must not stop a dragged node's neighbours
 * from finding their new positions.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const endpoint = value => String(typeof value === 'object' && value !== null ? value.id : value);

function hash(text) {
  let result = 2166136261;
  for (const character of String(text)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** A stronger direct relationship has a strictly shorter preferred distance. */
export function edgeTargetLength(weight = 1) {
  const strength = Math.max(0, finite(Number(weight), 1));
  return .30 + .44 / (1 + .55 * strength);
}

function confine(layout, node) {
  node.x = finite(node.x, .5);
  node.y = finite(node.y, 0);
  let distance = Math.hypot(node.x, node.y);
  // A circular boundary can rotate freely without escaping the visible stage.
  if (distance > layout.bound) {
    node.x *= layout.bound / distance;
    node.y *= layout.bound / distance;
    distance = layout.bound;
  }
  const inner = layout.holeRadius + node.radius;
  if (distance < inner) {
    const angle = distance > 1e-9 ? Math.atan2(node.y, node.x) : hash(node.id) / 4294967296 * Math.PI * 2;
    node.x = Math.cos(angle) * inner;
    node.y = Math.sin(angle) * inner;
  }
}

function separate(layout, pinnedId) {
  // Projection prevents transient overlap even during an abrupt pointer move.
  // Repeating the small local correction also handles three-node collisions.
  for (let pass = 0; pass < 18; pass++) {
    let collided = false;
    for (let i = 0; i < layout.nodes.length; i++) {
      const a = layout.nodes[i];
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const b = layout.nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let distance = Math.hypot(dx, dy);
        const minimum = a.radius + b.radius + layout.gap;
        if (distance >= minimum - 1e-7) continue;
        collided = true;
        if (distance < 1e-9) {
          const angle = hash(`${a.id}:${b.id}`) / 4294967296 * Math.PI * 2;
          dx = Math.cos(angle) * 1e-6;
          dy = Math.sin(angle) * 1e-6;
          distance = 1e-6;
        }
        const correction = minimum - distance + 1e-7;
        const aShare = a.id === pinnedId ? 0 : b.id === pinnedId ? 1 : .5;
        const bShare = 1 - aShare;
        a.x -= dx / distance * correction * aShare;
        a.y -= dy / distance * correction * aShare;
        b.x += dx / distance * correction * bShare;
        b.y += dy / distance * correction * bShare;
        if (a.id !== pinnedId) confine(layout, a);
        if (b.id !== pinnedId) confine(layout, b);
      }
    }
    if (!collided) break;
  }
}

function seedAnnulus(layout, seedAngle) {
  // With a wide central hole, particles cannot exchange angular order by passing
  // through the middle. Start from a balanced ring and swap slots to put stronger
  // direct relationships nearer before the continuous forces settle the radii.
  const count = layout.nodes.length;
  const indices = new Map(layout.nodes.map((node, index) => [node.id, index]));
  const slots = Array.from({length: count}, (_, index) => index);
  const chords = slots.map(a => slots.map(b => 2 - 2 * Math.cos((a - b) * 2 * Math.PI / count)));
  const relations = layout.edges.map(edge => ({a: indices.get(edge.source), b: indices.get(edge.target), weight: edge.weight}));
  const cost = () => relations.reduce((sum, edge) => sum + edge.weight * chords[slots[edge.a]][slots[edge.b]], 0);
  let current = cost();
  for (let pass = 0; pass < count * 2; pass++) {
    let best = current, bestPair = null;
    for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) {
      [slots[a], slots[b]] = [slots[b], slots[a]];
      const candidate = cost();
      if (candidate < best - 1e-9) {best = candidate; bestPair = [a, b];}
      [slots[a], slots[b]] = [slots[b], slots[a]];
    }
    if (!bestPair) break;
    const [a, b] = bestPair;
    [slots[a], slots[b]] = [slots[b], slots[a]];
    current = best;
  }
  for (let index = 0; index < count; index++) {
    const node = layout.nodes[index];
    const radius = clamp(.78, layout.holeRadius + node.radius, layout.bound);
    const angle = seedAngle + slots[index] * Math.PI * 2 / count;
    node.x = Math.cos(angle) * radius;
    node.y = Math.sin(angle) * radius;
  }
}

/**
 * Clone catalogue nodes and settle their layout without mutating learning data.
 * Each node keeps its original metadata; x/y/vx/vy/radius are layout properties.
 * Edges expose string source/target IDs and their preferred targetLength.
 */
export function createLayout(nodes = [], edges = [], options = {}) {
  const count = nodes.length;
  const nodeRadius = node => clamp(finite(node.radius, finite(options.radius, count > 12 ? .185 : .18)), .06, .19);
  const bound = clamp(finite(options.bound, .94), .65, 1.2);
  const largestRadius = nodes.reduce((largest, node) => Math.max(largest, nodeRadius(node)), 0);
  const layout = {
    nodes: [], edges: [], byId: new Map(), pinned: null, elapsed: 0,
    bound,
    // The root atlas reserves a larger centre for its accretion disk. Honour that
    // request while keeping the largest node's centre within the outer boundary.
    holeRadius: clamp(finite(options.holeRadius, .18), 0, Math.max(0, bound - largestRadius)),
    gap: clamp(finite(options.gap, .014), 0, .05),
  };
  const seedAngle = hash(options.seed ?? 'systems-science') / 4294967296 * Math.PI * 2;
  for (let index = 0; index < count; index++) {
    const original = nodes[index];
    const id = String(original.id);
    if (original.id === undefined || layout.byId.has(id)) throw new Error(`A layout node needs a unique id: ${id}`);
    const angle = seedAngle + index * GOLDEN_ANGLE;
    const distance = .43 + .42 * Math.sqrt((index + .5) / Math.max(1, count));
    const node = {
      ...original, id,
      x: finite(original.x, Math.cos(angle) * distance),
      y: finite(original.y, Math.sin(angle) * distance),
      vx: 0, vy: 0,
      radius: nodeRadius(original),
    };
    confine(layout, node);
    layout.nodes.push(node);
    layout.byId.set(id, node);
  }
  const pairs = new Map();
  for (const original of edges) {
    const source = endpoint(original.source), target = endpoint(original.target);
    if (source === target || !layout.byId.has(source) || !layout.byId.has(target)) continue;
    const key = JSON.stringify([source, target].sort());
    const weight = Math.max(0, finite(Number(original.weight), 1));
    if (weight === 0) continue;
    if (pairs.has(key)) pairs.get(key).weight += weight;
    else pairs.set(key, {...original, source, target, weight});
  }
  const degree = new Map(layout.nodes.map(node => [node.id, 0]));
  for (const edge of pairs.values()) {
    degree.set(edge.source, degree.get(edge.source) + 1);
    degree.set(edge.target, degree.get(edge.target) + 1);
  }
  layout.edges = [...pairs.values()].map(edge => ({
    ...edge, targetLength: edgeTargetLength(edge.weight),
    // Dense prerequisite graphs must not multiply spring pressure until the
    // entire book collapses into a central ball. Relative weight still controls
    // distance; degree compensation controls the total pressure per node.
    stiffness: (3.0 + .65 * Math.log1p(edge.weight)) / Math.sqrt(Math.max(1, degree.get(edge.source) * degree.get(edge.target))),
  }));
  if (layout.holeRadius >= .4 && count >= 3 && nodes.every(node => !Number.isFinite(node.x) && !Number.isFinite(node.y))) {
    seedAnnulus(layout, seedAngle);
  }
  separate(layout, null);
  const warmup = clamp(Math.round(finite(options.warmup, 240)), 0, 1000);
  for (let index = 0; index < warmup; index++) tickLayout(layout, 1 / 30);
  layout.elapsed = 0;
  for (const node of layout.nodes) node.vx = node.vy = 0;
  return layout;
}

/** Pin a node to a pointer's normalised location; the central hole stays clear. */
export function setPinned(layout, id, x, y) {
  const node = layout.byId.get(String(id));
  if (!node) return false;
  node.x = finite(x, node.x);
  node.y = finite(y, node.y);
  node.vx = node.vy = 0;
  confine(layout, node);
  layout.pinned = {id: node.id, x: node.x, y: node.y};
  separate(layout, node.id);
  return true;
}

/** Release without a fling: this is deliberate exploration, not an arcade game. */
export function releasePinned(layout, id = null) {
  if (!layout.pinned || (id !== null && String(id) !== layout.pinned.id)) return;
  const node = layout.byId.get(layout.pinned.id);
  if (node) node.vx = node.vy = 0;
  layout.pinned = null;
}

/** Advance by seconds. A resumed background tab cannot inject a giant step. */
export function tickLayout(layout, dt = 1 / 60, draggedId = null) {
  const duration = clamp(finite(dt, 0), 0, .05);
  if (!duration || !layout.nodes.length) return layout;
  const pinnedId = layout.pinned?.id ?? (draggedId === null ? null : String(draggedId));
  const steps = Math.max(1, Math.ceil(duration / (1 / 120)));
  const step = duration / steps;
  for (let iteration = 0; iteration < steps; iteration++) {
    const forces = layout.nodes.map(() => ({x: 0, y: 0}));
    const indices = new Map(layout.nodes.map((node, index) => [node.id, index]));
    // Keep a small hierarchy around its parent rather than allowing all of its
    // springs to form an off-centre crescent. This common force recentres the
    // whole constellation; pairwise relationships still decide its local shape.
    // One/two-node diagnostics have no meaningful surrounding constellation.
    const centering = layout.nodes.length >= 3 ? 12 * (pinnedId === null ? 1 : .16) : 0;
    const centroid = layout.nodes.reduce((sum, node) => ({x: sum.x + node.x, y: sum.y + node.y}), {x: 0, y: 0});
    const centerX = centroid.x / layout.nodes.length, centerY = centroid.y / layout.nodes.length;
    for (let i = 0; i < layout.nodes.length; i++) {
      const a = layout.nodes[i];
      const radius = Math.max(.001, Math.hypot(a.x, a.y));
      // A broad annulus leaves breathing room around the central concept.
      const radial = -8 * (radius - .78);
      forces[i].x += radial * a.x / radius - centering * centerX;
      forces[i].y += radial * a.y / radius - centering * centerY;
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const b = layout.nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.max(.01, Math.hypot(dx, dy));
        const magnitude = Math.min(2, .050 / (distance * distance));
        const fx = magnitude * dx / distance, fy = magnitude * dy / distance;
        forces[i].x -= fx; forces[i].y -= fy;
        forces[j].x += fx; forces[j].y += fy;
      }
    }
    for (const edge of layout.edges) {
      const i = indices.get(edge.source), j = indices.get(edge.target);
      const a = layout.nodes[i], b = layout.nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.max(.001, Math.hypot(dx, dy));
      const stiffness = edge.stiffness;
      const magnitude = stiffness * (distance - edge.targetLength);
      const fx = magnitude * dx / distance, fy = magnitude * dy / distance;
      forces[i].x += fx; forces[i].y += fy;
      forces[j].x -= fx; forces[j].y -= fy;
    }
    const damping = Math.exp(-5.5 * step);
    for (let index = 0; index < layout.nodes.length; index++) {
      const node = layout.nodes[index];
      if (node.id === pinnedId) {
        if (layout.pinned) {node.x = layout.pinned.x; node.y = layout.pinned.y;}
        node.vx = node.vy = 0;
        continue;
      }
      node.vx = clamp((node.vx + forces[index].x * step) * damping, -.65, .65);
      node.vy = clamp((node.vy + forces[index].y * step) * damping, -.65, .65);
      node.x += node.vx * step;
      node.y += node.vy * step;
      confine(layout, node);
    }
    separate(layout, pinnedId);
  }
  layout.elapsed += duration;
  return layout;
}
