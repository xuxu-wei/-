// 模块无法加载时提供可见说明，不留下看似可点击却无响应的播放按钮。
(() => {
  const message = () => {
    if (document.body.dataset.ready === 'true') return;
    const note = document.getElementById('loading-note');
    note.hidden = false;
    note.classList.add('error');
    note.textContent = '交互未能加载。请在项目目录运行 python tools/serve.py，通过 http://127.0.0.1:8000 打开页面，再刷新重试。';
  };
  window.addEventListener('error', event => {
    if (event.target?.matches?.('script[data-main]') || event.filename?.endsWith('app.mjs')) message();
  }, true);
  setTimeout(message, 8000);
})();
