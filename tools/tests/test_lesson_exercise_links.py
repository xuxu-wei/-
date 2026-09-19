"""Exercise links must survive the Notebook's actual Markdown-to-HTML renderer."""
from html.parser import HTMLParser
from pathlib import Path
import sys
from urllib.parse import parse_qs, quote, unquote, urlsplit
import pytest
from nbconvert.filters.markdown import markdown2html_mistune

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools'))
from lesson_exercises import render_exercises

class Links(HTMLParser):
    def __init__(self):super().__init__();self.hrefs=[]
    def handle_starttag(self,tag,attributes):
        href=dict(attributes).get('href','')
        if tag=='a' and not href.startswith('#'):self.hrefs.append(href)

@pytest.mark.parametrize('practice_path,slug',[
    ('/chapters/04-05-用 Lyapunov 函数分析稳定性/practice/','p04-lyapunov'),
    ('/chapters/06-03-LTI 系统、Laplace 与 Z 变换/practice/','p06-sampled-response'),
    ('/chapters/06-01-观测、采样与滤波/practice/','采样与混叠'),
    ('/chapters/06-03-线性系统 (零状态)/practice/','输入+输出 & 相位'),
])
def test_rendered_notebook_href_preserves_complete_chapter_path_and_question(practice_path,slug):
    question=dict(id='example',lesson_id='lesson',type='choice',multiple=False,title='检查整个题目入口',statement='选择完整路径对应的题目。',options=[{'id':'A','text':'完整路径'}],slug=slug)
    text=render_exercises('lesson',[question],practice_path)
    links=Links();links.feed(markdown2html_mistune(text))
    assert len(links.hrefs)==1
    parsed=urlsplit(links.hrefs[0])
    assert parsed.scheme=='http' and parsed.netloc=='127.0.0.1:8000'
    assert unquote(parsed.path)==practice_path
    assert parse_qs(parsed.query)=={'question':[slug]}
    assert ' ' not in links.hrefs[0]

def test_rendered_notebook_link_does_not_double_encode_an_existing_escape():
    path='/chapters/06-03-LTI 系统、Laplace 与 Z 变换/practice/'
    encoded=quote(path,safe='/')
    question=dict(id='example',lesson_id='lesson',type='choice',multiple=False,title='重试入口',statement='检查已经编码的路径。',options=[{'id':'A','text':'原章节'}],slug='p06-response')
    links=Links();links.feed(markdown2html_mistune(render_exercises('lesson',[question],encoded)))
    assert len(links.hrefs)==1
    assert urlsplit(links.hrefs[0]).path==encoded
    assert '%25' not in links.hrefs[0]

def test_optional_types_remain_one_table_cell_without_changing_python_signature():
    from question_contracts import contract_markdown, signature
    class Tables(HTMLParser):
        def __init__(self):
            super().__init__();self.rows=[];self.current=None;self.cell=None
        def handle_starttag(self,tag,attributes):
            if tag=='tr':self.current=[]
            if tag in {'td','th'}:self.cell=''
        def handle_data(self,data):
            if self.cell is not None:self.cell+=data
        def handle_endtag(self,tag):
            if tag in {'td','th'}:self.current.append(self.cell);self.cell=None
            if tag=='tr':self.rows.append(self.current);self.current=None
    question=dict(parameters=[dict(name='observations',type='list[float | None]',description='缺测使用 None。',unit='U')],
                  returns=[dict(name='estimate',type='float | None',description='估计或不可计算。',unit='U')],
                  constraints=['允许缺测。'],contract='按已知观测计算。')
    question['starter_code']=signature(question)+'\n    raise NotImplementedError'
    rendered=markdown2html_mistune(contract_markdown(question))
    parsed=Tables();parsed.feed(rendered)
    assert all(len(row)==4 for row in parsed.rows)
    assert parsed.rows[1][1]=='list[float | None]'
    assert parsed.rows[3][1]=='float | None'
    assert 'observations: list[float | None]' in question['starter_code']


def test_python_power_in_rule_is_not_markdown_emphasis():
    from question_contracts import contract_markdown
    question=dict(parameters=[],returns=[dict(name='weights',type='list[float]',description='权重',unit='1')],
                  constraints=['0<forgetting<=1'],contract='返回 forgetting**count 和 forgetting**(count-1)。',
                  starter_code='def solve(count, forgetting):\n    pass')
    rendered=markdown2html_mistune(contract_markdown(question))
    assert '返回 forgetting**count 和 forgetting**(count-1)。' in rendered
