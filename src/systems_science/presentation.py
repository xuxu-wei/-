"""统一图形样式与简短结果表，不封装教学模型。"""

import matplotlib as mpl
from .theme import DATA_COLORS, THEME


def plot_style():
    """设置适合 Notebook 的可读样式；坐标采用变量与单位，避免字体依赖。"""
    mpl.rcParams.update({
        "figure.figsize": (8, 4), "figure.dpi": 110,
        "font.size": 11, "axes.spines.top": False,
        "axes.spines.right": False, "axes.grid": True,
        "grid.alpha": 0.2, "axes.axisbelow": True,
        "lines.linewidth": 2, "figure.constrained_layout.use": True,
        "figure.facecolor": "#ffffff", "axes.facecolor": "#ffffff",
        "savefig.facecolor": "#ffffff", "text.color": THEME['ui']['text'],
        "axes.labelcolor": THEME['ui']['text'], "xtick.color": THEME['ui']['text'],
        "ytick.color": THEME['ui']['text'], "axes.edgecolor": THEME['ui']['border'],
        "grid.color": THEME['ui']['border'],
        "axes.prop_cycle": mpl.cycler(color=DATA_COLORS),
    })


def show_table(headers, rows, precision=6):
    """把小型实验结果整理为 Markdown 表；返回文本以便保存或显示。"""
    from html import escape
    from numbers import Real

    def cell(value):
        if isinstance(value, Real):
            return f"{value:.{precision}g}"
        return escape(str(value)).replace("|", "&#124;").replace("\n", " ")

    headers = list(headers)
    lines = ["| " + " | ".join(map(cell, headers)) + " |",
             "| " + " | ".join(["---"] * len(headers)) + " |"]
    for row in rows:
        row = list(row)
        if len(row) != len(headers):
            raise ValueError("每行的列数必须与表头一致")
        lines.append("| " + " | ".join(map(cell, row)) + " |")
    return "\n".join(lines)
