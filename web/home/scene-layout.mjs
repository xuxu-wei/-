// All projections use the measured space between the two interface bands.
// The same transform drives drawing, hit targets, dragging and zoom anchors.
export function sceneProjection(width, top, bottom, level = 'universe') {
  const height = Math.max(1, bottom - top);
  const rx = Math.max(120, width * (level === 'universe' ? .40 : .41));
  return {cx: width / 2, cy: top + height / 2, rx,
    ry: level === 'universe' ? Math.min(rx * .29, height * .30) : height * .30,
    radius: Math.min(level === 'universe' ? 48 : 37, height / 10), top, bottom};
}
