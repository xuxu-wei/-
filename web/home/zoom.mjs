// Wheel navigation uses explicit event time: no clock, DOM, camera, or IDE effects.
export const ZOOM_LIMITS = Object.freeze({
  min: .55, max: 2.4, enter: 1.8, leave: .66, cooldownMs: 700, sensitivity: .0015,
});

export function zoomStep(state = {}, deltaY = 0, options = {}) {
  const {level, hasChildren = false, hasParent = false, now, reducedMotion = false} = options;
  const previousScale = Number.isFinite(state.scale) && state.scale > 0 ? state.scale : 1;
  const scale = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, previousScale));
  const lastTransitionAt = Number.isFinite(state.lastTransitionAt) ? state.lastTransitionAt : null;
  const unchanged = {scale, action: null, lastTransitionAt};
  if (!Number.isFinite(deltaY) || deltaY === 0 || !Number.isFinite(now)) return unchanged;

  // Both directions share this lock; a trackpad's trailing events cannot undo or
  // repeat a just-completed navigation. Animation duration is handled by the UI.
  if (lastTransitionAt !== null && now - lastTransitionAt < ZOOM_LIMITS.cooldownMs) {
    return {...unchanged, scale: 1};
  }
  const next = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max,
    scale * Math.exp(-deltaY * ZOOM_LIMITS.sensitivity)));
  const atConceptLevel = level === 'chapter' || level === 'concept'
    || (typeof level === 'number' && level >= 2);
  const action = deltaY < 0 && next >= ZOOM_LIMITS.enter && hasChildren && !atConceptLevel
    ? 'enter' : deltaY > 0 && next <= ZOOM_LIMITS.leave && hasParent ? 'leave' : null;
  // Reduced motion keeps the same navigation thresholds. The caller performs an
  // immediate camera update instead of a tween; it must not disable navigation.
  void reducedMotion;
  return action ? {scale: 1, action, lastTransitionAt: now}
    : {scale: next, action: null, lastTransitionAt};
}
