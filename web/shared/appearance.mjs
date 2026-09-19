// boot.js owns synchronous restoration; this module is the shared interaction API.
const controller = () => {
  const api = globalThis.window?.systemsScienceAppearance;
  if (!api) throw new Error('主题未初始化，请刷新页面。');
  return api;
};

export const getTheme = () => controller().getTheme();
export const applyTheme = (theme, options) => controller().applyTheme(theme, options);
export const toggleTheme = () => controller().toggleTheme();
