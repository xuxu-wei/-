// Pure atlas helpers. The server has already filtered obsolete/unsaved attempts.
const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const values = value => Array.isArray(value) ? value : [];

export function nodeProgress(node, progress = {}) {
  const ids = [...new Set(values(node.questionIds))];
  const passedIds = new Set(values(progress.passed));
  const startedIds = new Set(values(progress.started));
  const total = ids.length;
  const passed = ids.filter(id => passedIds.has(id)).length;
  const touched = ids.some(id => passedIds.has(id) || startedIds.has(id));
  const ratio = total ? passed / total : 0;
  const totalUnits = Math.max(0, Number(node.total) || 0);
  const published = Math.max(0, Math.min(totalUnits, Number(node.published) || 0));
  const coverage = totalUnits ? published / totalUnits : 0;
  const incomplete = Boolean(progress.incomplete);
  const available = node.available !== false && total > 0;
  const state = !available || !touched ? 'new'
    : ratio === 1 && coverage === 1 && !incomplete ? 'complete' : 'active';

  // Only part capstones carry assessment scores. No invented chapter/concept mark.
  const assessments = node.kind === 'part' && !incomplete
    ? values(node.assessmentIds).map(id => progress.assessments?.[id]).filter(
      a => a && !a.incomplete && a.attempted > 0 && a.points > 0
        && Number.isFinite(a.practice_points) && Number.isFinite(a.points)) : [];
  const points = assessments.reduce((sum, a) => sum + a.points, 0);
  const score = points ? clamp(assessments.reduce((sum, a) => sum + a.practice_points, 0) / points) : null;
  // Achievement radiance is independent of the renderer's temporary hover outline.
  // Undelivered units lower coverage; an all-passed subset is not a finished part.
  const glow = available && touched
    ? clamp((0.06 + 0.94 * ratio) * coverage * (score === null ? 0.8 : 0.7 + 0.3 * score)) : 0;
  return {
    ratio, glow, passed, total, state,
    label: {new: '未开始', active: '进行中', complete: '已完成'}[state],
    score, scoreLabel: score === null ? null : '篇末练习成绩',
    published, totalUnits, coverage, scope: node.progressScope || '练习进度', incomplete,
  };
}

export function chooseResumePart(nodes, progress = {}) {
  const parts = nodes.filter(n => n.kind === 'part').sort((a, b) => Number(a.number ?? a.id) - Number(b.number ?? b.id));
  const available = parts.filter(n => n.available && values(n.questionIds).length > 0);
  if (!available.length) return parts[0] || null;
  const pending = available.filter(n => nodeProgress(n, progress).ratio < 1);
  // The API has no last-study timestamp. Prefer the earliest active part in course
  // order, then the first available unfinished part. Do not infer a recent visit.
  return pending.find(n => nodeProgress(n, progress).state === 'active')
    || pending[0] || available.at(-1);
}

export function categoryColor(category, theme = 'dark') {
  return theme === 'light' ? category.lightColor || category.color : category.color;
}

export function mixColors(categories, taxonomy, theme = 'dark') {
  const colorById = new Map(taxonomy.map(t => [t.id, categoryColor(t, theme)]));
  const colors = [...new Set(values(categories))].map(id => colorById.get(id))
    .filter(color => /^#[0-9a-f]{6}$/i.test(color || ''));
  if (!colors.length) return '#9cbbdd';
  if (colors.length === 1) return colors[0];
  // Blend emitted light in linear sRGB; arithmetic encoded-RGB averaging darkens it.
  const linear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const encoded = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return '#' + [1, 3, 5].map(start => Math.round(255 * encoded(colors.reduce(
    (sum, color) => sum + linear(parseInt(color.slice(start, start + 2), 16) / 255), 0) / colors.length))
    .toString(16).padStart(2, '0')).join('');
}

export function getView(graph, parentId = null) {
  const parent = parentId === null ? null : graph.nodes.find(n => n.id === parentId);
  const childIds = parent ? new Set(parent.children) : null;
  const nodes = parentId === null ? graph.nodes.filter(n => n.kind === 'part')
    : parent ? graph.nodes.filter(n => childIds.has(n.id)) : [];
  const visible = new Set(nodes.map(n => n.id));
  return {nodes, edges: graph.edges.filter(e => visible.has(e.source) && visible.has(e.target))};
}

export function directNeighborhood(id, edges) {
  const related = new Set([id]);
  for (const edge of edges) {
    if (edge.source === id) related.add(edge.target);
    if (edge.target === id) related.add(edge.source);
  }
  return related;
}
