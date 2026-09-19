# 动手学系统科学

以人体与生命系统为贯穿案例，通过数学解释、可运行代码和计算实验，学习系统科学从基础到前沿的知识与方法。

**Jupyter Notebook 是完整教学入口；网页提供配套可视化、按需 playground 和交互练习；轻量 Python 包支持公共教学需求。** 面向掌握基础 Python 和中学数学的读者，大学数学随课程逐步引入，目标是核心方法能够推导、实现和验证，精选现代方法能够完成小规模研究复现并解释失败原因。

## 当前状态

- 全书按 17 篇、85 章规划；前九篇的 44 章已交付，共 113 本正式 Notebook（含篇末综合）、35 张探索页与 538 道练习。
- M0—M10 已完成；第 10—17 篇的 41 章为设计导览，下一步实施 M11《反馈与最优控制》。
- 制作样章已在 M3 验收后清理，历史记录与正式学习进度分开保留；进展见 [ROADMAP](ROADMAP.md)。
- 支持本机交互练习、Python 判题与学习记录，代码编辑器提供高亮、缩进和 traceback 调试。
- “开始”首页提供篇—章—概念的交互星图，支持拖动、滚轮进入层级及全站深浅主题。
- 前九篇篇末综合提供难度递进、首次/练习成绩及分层复习入口；评价规则见[教材设计](docs/教材设计.md#capstone-assessment)。

<a id="run-m1"></a>
## 开始使用

在项目根目录运行（已验证 Windows / Python 3.13）：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[learn,dev]"
Invoke-Item .\notebooks\01-看见系统\01-从生理现象提出系统问题\01-边界状态与观测.ipynb
.\.venv\Scripts\python.exe tools/serve.py
```

在默认 IDE 中选择项目 `.venv` 作为 Notebook 内核，从[第 1 篇：看见系统](notebooks/01-看见系统/README.md)按目录顺序学习，当前已交付至[第 9 篇：概率建模与近似推断](notebooks/09-概率建模与近似推断/README.md)。启动本机程序后可打开[开始首页](http://127.0.0.1:8000/)或[全书目录](http://127.0.0.1:8000/catalog/)；环境、操作与故障处理见[学习指南](docs/学习指南.md)。

项目面向 PC 本机学习，基础实验无需 GPU。教学运行独立于外部数据制备工具；模拟数据、本地环境、个人作答记录和临时文件不纳入 Git 同步。

## 项目文档

| 入口 | 内容 |
|---|---|
| [ROADMAP](ROADMAP.md) | 阶段规划、进度与验收证据 |
| [教材设计](docs/教材设计.md) | 课程目录、先修关系、案例与教学规范 |
| [网页规范](docs/网页设计规范.md) / [判题设计](docs/交互练习与判题系统设计.md) | 页面交互、题目契约与本机运行 |
| [制作检查表](docs/教材制作检查表.md) | 教材与功能的具体验收要求 |
| [AGENTS](AGENTS.md) | 总体协作原则 |

仓库：[xuxu-wei/dive-2-systems-science](https://github.com/xuxu-wei/dive-2-systems-science)。
