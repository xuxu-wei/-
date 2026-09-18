// 与 S04、S05 的显式实现对照；不依赖教学包或任何外部服务。
export function validate({u = 1, k = 0.5, A0 = 0} = {}) {
  if (![u, k, A0].every(x => Number.isFinite(x) && x >= 0)) {
    throw new RangeError('流入、清除系数与初始物质量必须有限且非负');
  }
  return {u, k, A0};
}

export function exactAmount(t, parameters = {}) {
  const {u, k, A0} = validate(parameters);
  if (!Number.isFinite(t) || t < 0) throw new RangeError('时间必须有限且非负');
  if (k === 0) return A0 + u * t;
  return A0 * Math.exp(-k * t) + u * (-Math.expm1(-k * t) / k);
}

export function euler(parameters = {}, h = 0.1, duration = 20) {
  const {u, k, A0} = validate(parameters);
  if (![h, duration].every(x => Number.isFinite(x) && x > 0)) {
    throw new RangeError('步长与观察时长必须有限且为正');
  }
  const n = Math.round(duration / h);
  if (n < 1 || n > 100000 || Math.abs(n * h - duration) > 1e-10) {
    throw new RangeError('步长需整除观察时长，且计算不超过十万步');
  }
  const times = Array.from({length: n + 1}, (_, i) => duration * i / n);
  const amounts = [A0];
  for (let i = 0; i < n; i++) {
    const dt = times[i + 1] - times[i];
    const next = amounts[i] + dt * u - dt * k * amounts[i];
    if (!Number.isFinite(next)) throw new RangeError('出现非有限数值，已停止计算；请减小步长');
    amounts.push(next); // 不裁剪负值，不把数值失败伪装成正常模型。
  }
  return {times, amounts};
}

export function diagnose(parameters, h, amounts) {
  const {k} = validate(parameters);
  const kh = k * h;
  const stable = k === 0 ? null : kh > 0 && kh < 2;
  const positivity = kh <= 1;
  const hasNegative = amounts.some(x => x < 0);
  const stabilityText = k === 0 ? 'k = 0：线性积累，不讨论吸引平衡'
    : kh === 2 ? 'kh = 2：平衡偏差不衰减'
    : stable ? '0 < kh < 2：平衡偏差收敛' : 'kh > 2：一般初值的偏差会放大';
  const positivityText = positivity ? 'kh ≤ 1：对所有非负输入与初值保持非负'
    : hasNegative ? 'kh > 1：当前轨迹已经出现负物质量'
    : 'kh > 1：当前轨迹虽非负，方法不保证非负';
  return {kh, stable, positivity, hasNegative, stabilityText, positivityText};
}
