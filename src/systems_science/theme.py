"""网页与 Notebook 共用的颜色定义。"""
import json
from importlib.resources import files

THEME = json.loads(files(__package__).joinpath('theme.json').read_text(encoding='utf-8'))
DATA_COLORS = tuple(THEME['data'][str(index)] for index in range(1, 6))
SERIES_COLORS = {name: THEME['data'][key] for name, key in THEME['series'].items()}
