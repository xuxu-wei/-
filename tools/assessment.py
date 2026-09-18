"""篇末综合的分层计分；成绩从现有作答记录派生，不另存成绩真值。"""
import json
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEVELS = (
    ('基础辨析', 20), ('方法应用', 30), ('综合验证', 30), ('迁移挑战', 20),
)
SCORED_VERDICTS = {'AC', 'WA', 'CE', 'RE', 'TLE', 'OLE'}


def load_assessments(questions, root=ROOT):
    questions = {q['id']: q for q in questions}
    assessments = {}
    used = set()
    for path in sorted((root / 'exercises').glob('*/assessment.json')):
        spec = json.loads(path.read_text(encoding='utf-8'))
        lesson = spec['lesson_id']
        if lesson in assessments or not lesson.endswith('-SUMMARY'):
            raise ValueError(f'综合题组身份无效：{path}')
        items = spec['items']
        objectives = {o['id'] for o in spec['objectives']}
        ids = [i['question_id'] for i in items]
        expected = {q['id'] for q in questions.values() if q['lesson_id'] == lesson}
        if len(ids) != len(set(ids)) or set(ids) != expected or used.intersection(ids):
            raise ValueError(f'综合计分必须恰好覆盖本篇综合题：{path}')
        if {i['objective'] for i in items} != objectives:
            raise ValueError(f'综合计分未覆盖全部学习目标：{path}')
        if [i['level'] for i in items] != sorted(i['level'] for i in items):
            raise ValueError(f'综合题必须按难度递进：{path}')
        for item in items:
            if type(item['points']) is not int or item['points'] <= 0 or item['level'] not in range(1, 5):
                raise ValueError(f'综合分值或层次无效：{path}')
            if questions[item['question_id']]['chapter'] != spec['part'] + '.summary':
                raise ValueError(f'不能给章内习题配置综合分数：{path}')
            if item['objective'] not in questions[item['question_id']]['learning_targets']:
                raise ValueError(f'主要计分目标与题目目标不一致：{path}')
        for level, (_, maximum) in enumerate(LEVELS, 1):
            members = [i for i in items if i['level'] == level]
            if len(members) < 2 or sum(i['points'] for i in members) != maximum:
                raise ValueError(f'综合题层次缺项或分值不符：{path}')
        assessments[lesson] = spec
        used.update(ids)
    return assessments


def item_metadata(assessments):
    return {item['question_id']: {**item, 'level_title': LEVELS[item['level'] - 1][0],
            'assessment_version': spec['version']}
            for spec in assessments.values() for item in spec['items']}


def grade(score, levels):
    if score < 60:
        return '需巩固基础'
    if levels[0] < 20 or levels[1] < 15:
        return '基础环节待补齐'
    if score < 80:
        return '基本达标'
    if score < 90:
        return '掌握良好'
    return '综合表现扎实'


def summarize_assessments(assessments, questions, records, incomplete=False):
    """仅完整且已保存的当前题目版本参与；重试不改写首次成绩。"""
    records = list(records)
    summaries = {}
    for lesson, spec in assessments.items():
        rows = []
        for item in spec['items']:
            q = questions[item['question_id']]
            attempts = sorted((r for r in records
                if r.get('exercise_id') == q['id'] and r.get('exercise_version') == q['version']
                and r.get('saved') and r.get('state') == 'FINISHED' and r.get('mode') == 'full'
                and r.get('verdict') in SCORED_VERDICTS), key=lambda r: (datetime.fromisoformat(r['created_at']).timestamp(), r['id']))
            first = attempts[0] if attempts else None
            passed = any(r['verdict'] == 'AC' for r in attempts)
            rows.append({**item, 'title': q['title'], 'slug': q['slug'], 'type': q['type'],
                'level_title': LEVELS[item['level'] - 1][0], 'attempted': bool(first),
                'first_points': item['points'] if first and first['verdict'] == 'AC' else 0,
                'practice_points': item['points'] if passed else 0, 'passed': passed,
                'first_attempt_id': first['id'] if first else None,
                'latest_verdict': attempts[-1]['verdict'] if attempts else None,
                'attempt_count': len(attempts),
                'historical_first': bool(first and first.get('assessment_version') != spec['version'])})
        def subtotal(members):
            return {key: sum(r[key] for r in members) for key in ('points', 'first_points', 'practice_points')}
        levels = [{'level': i, 'title': title, **subtotal([r for r in rows if r['level'] == i])}
                  for i, (title, _) in enumerate(LEVELS, 1)]
        objectives = [{**o, **subtotal([r for r in rows if r['objective'] == o['id']])}
                      for o in spec['objectives']]
        total = subtotal(rows)
        attempted = sum(r['attempted'] for r in rows)
        summaries[lesson] = {'title': spec['title'], 'version': spec['version'], 'part': spec['part'],
            **total, 'attempted': attempted, 'count': len(rows), 'passed': sum(r['passed'] for r in rows),
            'first_complete': attempted == len(rows), 'incomplete': incomplete,
            'first_grade': None if attempted != len(rows) or incomplete else grade(total['first_points'], [l['first_points'] for l in levels]),
            'practice_grade': None if incomplete else grade(total['practice_points'], [l['practice_points'] for l in levels]),
            'complete': all(r['passed'] for r in rows) and not incomplete,
            'historical_first': any(r['historical_first'] for r in rows),
            'levels': levels, 'objectives': objectives, 'items': rows,
            'review': [r['question_id'] for r in rows if not r['passed']]}
    return summaries
