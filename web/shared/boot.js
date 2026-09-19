// 所有页面在模块初始化前同步恢复同一主题，避免跨页切回默认配色。
(() => {
  const key = 'systems-science:theme:v1';
  const legacyKey = 'systems-science:home-theme:v1';
  const valid = theme => theme === 'dark' || theme === 'light';
  const read = name => {try {return localStorage.getItem(name);} catch {return null;}};
  const preferred = () => {
    const saved = read(key), legacy = read(legacyKey);
    return valid(saved) ? saved : valid(legacy) ? legacy : document.body.classList.contains('home-page') ? 'dark' : 'light';
  };
  const getTheme = () => document.documentElement.dataset.siteTheme || preferred();
  const applyTheme = (theme, {persist = true} = {}) => {
    if (!valid(theme)) throw new TypeError('Theme must be dark or light.');
    document.documentElement.dataset.siteTheme = theme;
    document.documentElement.style.colorScheme = theme;
    if (document.body.classList.contains('home-page')) document.body.dataset.skyTheme = theme;
    if (persist) {try {localStorage.setItem(key, theme);} catch {}}
    window.dispatchEvent(new CustomEvent('site-theme-change', {detail: {theme}}));
    return theme;
  };
  window.systemsScienceAppearance = {key, getTheme, applyTheme, toggleTheme: () => applyTheme(getTheme() === 'dark' ? 'light' : 'dark')};
  applyTheme(preferred());
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) applyTheme(valid(event.newValue) ? event.newValue : preferred(), {persist: false});
  });
})();

// 模块无法加载时提供可见说明，不留下看似可点击却无响应的播放按钮。
(() => {
  const message = () => {
    if (document.body.dataset.ready === 'true') return;
    const note = document.getElementById('loading-note');
    if (!note) return;
    note.hidden = false;
    note.classList.add('error');
    note.textContent = '交互未能加载。请在项目目录运行 python tools/serve.py，通过 http://127.0.0.1:8000 打开页面，再刷新重试。';
  };
  window.addEventListener('error', event => {
    if (event.target?.matches?.('script[data-main]') || event.filename?.endsWith('app.mjs')) message();
  }, true);
  setTimeout(message, 8000);
})();
