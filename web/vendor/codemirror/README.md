# 本地代码编辑器

使用 [CodeMirror 5](https://github.com/codemirror/codemirror5) 的 5.65.20 版本（MIT）。源文件保持发布包原样，版本、npm 完整性值及逐文件 SHA-256 见 [manifest.json](manifest.json)，授权见 [LICENSE](LICENSE)。仅包含核心、Python 模式、Monokai 主题、括号配对与匹配插件。

这些静态资源随教材提供，浏览器从本机加载，无 CDN、遥测或运行时安装步骤。项目集成与缩进删除在 `web/practice/editor.mjs`；主题可读性调整在 `web/practice/style.css`，不改供应文件。升级时核验发布包完整性，替换同一组文件与清单，重新验收 Python 高亮、括号、缩进、撤销、输入法、换行、拖动布局和草稿保存。
