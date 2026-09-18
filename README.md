# 动手学系统科学

以人体与生命系统为贯穿案例，通过数学解释、可运行代码和计算实验，学习系统科学从基础到前沿的知识与方法。

**Jupyter Notebook 是完整教学入口；网页提供配套可视化、按需 playground 和交互练习；轻量 Python 包支持公共教学需求。** 面向掌握基础 Python 和中学数学的读者，大学数学随课程逐步引入，目标是能够独立建模、验证和解释结果。

## 当前状态

- 已完成十二篇、55 章的课程设计，以及六节 Notebook、可视化和 22 道练习组成的制作样章。
- 正式教材尚未编写。样章独立于正式课程，可复制改编；正式内容完成且不再依赖样章后将删除样章。
- 支持本机交互练习、Python 判题与学习记录，代码编辑器提供高亮、缩进和 traceback 调试。

<a id="run-m1"></a>
## 开始使用

在项目根目录运行（已验证 Windows / Python 3.13）：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[learn,dev]"
Invoke-Item .\notebooks\samples\accumulation-clearance\01-boundaries-units.ipynb
.\.venv\Scripts\python.exe tools/serve.py
```

在默认 IDE 中选择项目 `.venv` 作为 Notebook 内核，从[六节样章目录](notebooks/samples/accumulation-clearance/README.md)学习。启动本机程序后可打开[网页目录](http://127.0.0.1:8000/)；环境、操作与故障处理见[学习指南](docs/学习指南.md)。

项目面向 PC 本机学习，基础实验无需 GPU。教学运行独立于外部数据制备工具；模拟数据、本地环境、个人作答记录和临时文件不纳入 Git 同步。

## 项目文档

| 入口 | 内容 |
|---|---|
| [ROADMAP](ROADMAP.md) | 阶段规划、进度与验收证据 |
| [教材设计](docs/教材设计.md) | 课程目录、先修关系、案例与教学规范 |
| [网页规范](docs/网页设计规范.md) / [判题设计](docs/交互练习与判题系统设计.md) | 页面交互、题目契约与本机运行 |
| [制作检查表](docs/教材制作检查表.md) | 教材与功能的具体验收要求 |
| [AGENTS](AGENTS.md) | 总体协作原则 |

仓库：[xuxu-wei/-](https://github.com/xuxu-wei/-)。
