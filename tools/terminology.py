"""Shared, conservative term annotations for teaching prose.

This is a curated phrase matcher, not a Chinese word segmenter. Protected
compounds and explicit senses prevent known substring errors; uncertain senses
are reported for review. Existing English annotations are never overwritten.
"""
from dataclasses import dataclass
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TERMS = json.loads((ROOT / 'docs/术语对照.json').read_text(encoding='utf-8'))

# These are whole ordinary phrases, not occurrences of the contained term.
PROTECTED_PHRASES = {'重复数': '复数', '系数组合': '数组', '常数组合': '数组', '参数组合': '数组'}
# Keep literal code, equations, headings and link destinations byte-for-byte.
LITERAL = re.compile(
    r'```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*`+'
    r'|\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\n])+\$'
    r'|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)'
    r'|^#{1,6}[^\n]*$|!?\[[^\]]*\]\((?:\\.|[^()\n]|\((?:\\.|[^()\n])*\))*\)'
    r'|https?://[^\s<>]+'
    r'''|</?[A-Za-z][\w:-]*(?:\s+[\w:-]+(?:=(?:"[^"]*"|'[^']*'))?)*\s*/?>''', re.M)
ANNOTATION = re.compile(r'[（(]([^（）()\n\u4e00-\u9fff\u2212+*/^=<>0-9]*[A-Za-z]{2}[^（）()\n\u4e00-\u9fff\u2212+*/^=<>0-9]*)[）)]')


@dataclass(frozen=True)
class Issue:
    kind: str
    term: str
    position: int
    message: str


class TerminologyError(ValueError):
    pass


def suffix(term):
    return '（' + term['en'] + ('，' + term['abbr'] if 'abbr' in term else '') + '）'


def _normalized(text):
    return re.sub(r'\s+', ' ', text.replace('，', ',').replace('–', '-').replace('—', '-').strip()).casefold().replace(', ', ',')


def _segments(text):
    start = 0
    for match in LITERAL.finditer(text):
        if start < match.start():
            yield start, text[start:match.start()], False
        yield match.start(), match.group(), True
        start = match.end()
    if start < len(text):
        yield start, text[start:], False


def _protected(text):
    """Detect compounds even when an erroneous annotation splits their letters."""
    clean, positions = [], []
    i = 0
    while i < len(text):
        annotation = ANNOTATION.match(text, i)
        if annotation:
            i = annotation.end()
        else:
            clean.append(text[i]); positions.append(i); i += 1
    plain = ''.join(clean)
    spans = []
    for phrase, blocked in PROTECTED_PHRASES.items():
        for found in re.finditer(re.escape(phrase), plain):
            begin = found.start() + phrase.index(blocked)
            start = positions[begin]
            end = positions[begin+len(blocked)-1] + 1
            # Include an annotation after the last letter (e.g. 重复数(...)).
            after = ANNOTATION.match(text, end)
            if after:
                end = after.end()
            spans.append((start, end, phrase, bool(after)))
    return spans


def process(text, part=99, *, seen=None, senses=None, annotate=False, require_first=True):
    """Return (text, issues, found terms); share ``seen`` within one reading unit.

    ``senses`` maps a Chinese term to a reviewed English sense. Conflicting
    existing annotations are errors; a missing required sense is left unchanged.
    All terms participate in longest-match selection, even before their scope,
    so a future long term cannot be split into an earlier short term.
    """
    seen = seen if seen is not None else set()
    senses = senses or {}
    terms = {t['zh']: t for t in TERMS}
    pattern = re.compile('|'.join(re.escape(t) for t in sorted(terms, key=len, reverse=True)))
    issues, found, result = [], set(), []
    for offset, segment, literal in _segments(text):
        if literal:
            result.append(segment); continue
        protected = _protected(segment)
        for start, end, phrase, bad in protected:
            if bad:
                issues.append(Issue('compound', phrase, offset+start, f'普通复合词被错误括注拆开：{segment[start:end]}'))
        pieces, cursor, consumed = [], 0, 0
        for match in pattern.finditer(segment):
            if match.start() < consumed or any(a <= match.start() < b for a,b,_,_ in protected):
                continue
            word = match.group(); term = terms[word]
            if int(term.get('scope', 'part00')[4:]) > part:
                continue
            found.add(word)
            # A nested English gloss is an authoring error, not an absent gloss.
            # Do not silently add a second annotation before the malformed one.
            if re.match(r'[（(][^（）()\n\u4e00-\u9fff]*[A-Za-z]{2}[^（）()\n\u4e00-\u9fff]*[（(]', segment[match.end():]):
                issues.append(Issue('nested', word, offset+match.start(), f'{word} 后的英文括注发生嵌套'))
                continue
            actual = ANNOTATION.match(segment, match.end())
            expected = term['en'] + (',' + term['abbr'] if 'abbr' in term else '')
            accepted = {_normalized(expected), _normalized(term['en']), *(_normalized(s) for s in term.get('accepted', []))}
            selected = senses.get(word)
            choices = term.get('senses')
            if choices:
                selected = selected or (actual.group(1) if actual else term['en'] if word in seen else None)
                if selected not in choices:
                    kind = 'translation' if actual else 'ambiguous'
                    issues.append(Issue(kind, word, offset+match.start(), f'请人工确认语义并显式标注：{word}；允许译名：{", ".join(choices)}'))
                    continue
                accepted = {_normalized(selected)}
                term = {**term, 'en': selected}
            if actual:
                consumed = actual.end()
                if _normalized(actual.group(1)) not in accepted:
                    issues.append(Issue('translation', word, offset+match.start(), f'{word} 的括注不符：{actual.group(1)}；应为 {term["en"]}'))
                if ANNOTATION.match(segment, actual.end()):
                    issues.append(Issue('duplicate', word, offset+match.start(), f'{word} 后有连续英文括注'))
            elif word not in seen and require_first:
                if annotate:
                    pieces.extend([segment[cursor:match.end()], suffix(term)])
                    cursor = match.end()
                else:
                    issues.append(Issue('missing', word, offset+match.start(), f'首次出现缺少英文：{word}'))
            seen.add(word)
        pieces.append(segment[cursor:]); result.append(''.join(pieces))
    return ''.join(result), issues, sorted(found)


def annotate_text(text, part=99, *, seen=None, senses=None):
    working = set(seen) if seen is not None else set()
    result, issues, _ = process(text, part, seen=working, senses=senses, annotate=True)
    if issues:
        raise TerminologyError('; '.join(issue.message for issue in issues))
    if seen is not None:
        seen.update(working)
    return result


def check_text(text, part=99, *, seen=None, senses=None, require_first=True):
    return process(text, part, seen=seen, senses=senses, require_first=require_first)[1:]
