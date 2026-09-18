"""按已交付目录发现正式课节和题库。"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def notebooks(root=ROOT):
    entries = [item for path in sorted((root / 'notebooks').rglob('catalog.json'))
               for item in read_json(path)]
    if len({item['id'] for item in entries}) != len(entries):
        raise ValueError('Notebook 身份重复。')
    return entries


def question_banks(root=ROOT):
    questions, verification = [], {}
    for path in sorted((root / 'exercises').rglob('questions.json')):
        bank = read_json(path)
        answers = read_json(path.with_name('verification.json'))
        ids = {q['id'] for q in bank}
        if len(ids) != len(bank) or ids & verification.keys() or ids != answers.keys():
            raise ValueError(f'题目身份或核验表不一致：{path}')
        questions.extend(bank)
        verification.update(answers)
    return questions, verification
