"""Independent algebra, FFT/library references and the real local measurement judge."""
import ast
from bisect import bisect_left
from decimal import Decimal as D, localcontext
from fractions import Fraction as F
import json
import math
from pathlib import Path
import statistics
import sys
import time
import uuid
import numpy as np
import pytest

ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools'))
from practice import PracticeEngine,difference
from assessment import summarize_assessments
BANK=ROOT/'exercises/06-从测量走向模型'
Q=json.loads((BANK/'questions.json').read_text(encoding='utf-8'))
V=json.loads((BANK/'verification.json').read_text(encoding='utf-8'))
S=json.loads((BANK/'solutions.json').read_text(encoding='utf-8'))

def notebook_functions():
    scope={'np':np,'math':math}
    for lesson in json.loads((ROOT/'notebooks/06-从测量走向模型/catalog.json').read_text(encoding='utf-8')):
        book=json.loads((ROOT/lesson['path']).read_text(encoding='utf-8'))
        for cell in book['cells']:
            if cell['cell_type']=='code' and 'model' in cell.get('metadata',{}).get('tags',[]):
                tree=ast.parse(''.join(cell['source']))
                assert all(isinstance(node,ast.FunctionDef) for node in tree.body)
                exec(compile(tree,lesson['path'],'exec'),scope)
    return scope

def fractional(x):return F(str(x))
def principal(z,threshold):
    if abs(z)<=threshold:return 0.
    value=float(np.angle(z))
    return math.pi if abs(value+math.pi)<1e-12 else value
def partition(p):
    bounds=[0,bisect_left(p['times'],p['train_end']),bisect_left(p['times'],p['validation_end']),len(p['times'])]
    return [[i for i in range(a,b) if p['values'][i] is not None] for a,b in zip(bounds,bounds[1:])]
def closed_arx(p):
    a,b=map(fractional,[p['a'],p['b']]);u=list(map(fractional,p['inputs']));y=list(map(fractional,p['observed']))
    one=[a*x+b*v for x,v in zip(y,u)]
    free=[a**n*y[0]+b*sum(a**(n-j-1)*u[j] for j in range(n)) for n in range(1,len(u)+1)]
    return [list(map(float,one)),list(map(float,free))]

def independent(slug,p):
    if slug=='cosine-samples':
        return (p['amplitude']*np.exp(1j*(2*np.pi*p['frequency']*np.array(p['times'])+p['phase'])).real).tolist()
    if slug=='causal-average':
        sums=[F(0)]
        for x in p['values']:sums.append(sums[-1]+fractional(x))
        return [float((sums[i]-sums[max(0,i-p['window'])])/min(i,p['window'])) for i in range(1,len(sums))]
    if slug=='linear-convolution':return np.convolve(p['signal'],p['kernel']).tolist()
    if slug=='one-sided-spectrum':
        values=np.array(p['values']);n=len(values);z=np.fft.rfft(values)/n;threshold=1e-12*max(1.,max(abs(values)))
        amplitude=np.abs(z);amplitude[amplitude<=threshold]=0
        amplitude[1:(-1 if n%2==0 else None)]*=2
        return [np.fft.rfftfreq(n,d=1/p['sample_rate']).tolist(),amplitude.tolist(),[principal(x,threshold) for x in z]]
    if slug=='fir-response':
        z=np.polynomial.polynomial.polyval(np.exp(-2j*np.pi*np.array(p['frequencies'])/p['sample_rate']),p['kernel'])
        threshold=1e-12*max(1.,sum(abs(x) for x in p['kernel']))
        return [[0. if abs(x)<=threshold else float(abs(x)) for x in z],[principal(x,threshold) for x in z]]
    if slug=='response-components':
        with localcontext() as context:
            context.prec=50;k,u,initial=map(lambda x:D(str(x)),[p['k'],p['input_rate'],p['initial']]);zero=[];forced=[]
            for t in map(lambda x:D(str(x)),p['times']):
                decay=(-k*t).exp();zero.append(float(initial*decay));forced.append(float(u*t if k==0 else u*(1-decay)/k))
            return [zero,forced]
    if slug in {'sampled-response','cap-discrete'}:
        with localcontext() as context:
            context.prec=50;k,h,initial=map(lambda x:D(str(x)),[p['k'],p['step'],p['initial']]);u=list(map(lambda x:D(str(x)),p['inputs']))
            a=(-k*h).exp();b=h if k==0 else (1-a)/k;ae=1-k*h
            # Closed forced-response sums, independent of the reference's state recurrence.
            power=lambda value,n:D(1) if n==0 else value**n
            exact=[float(power(a,n)*initial+b*sum((power(a,n-j-1)*u[j] for j in range(n)),D(0))) for n in range(len(u)+1)]
            euler=[float(power(ae,n)*initial+h*sum((power(ae,n-j-1)*u[j] for j in range(n)),D(0))) for n in range(len(u)+1)]
            return [exact,euler]
    if slug in {'line-fit','slope-interval'}:
        design=np.column_stack([np.ones(len(p['xs'])),p['xs']]);coef=np.linalg.lstsq(design,p['ys'],rcond=None)[0]
        if slug=='line-fit':return [*coef.tolist(),(np.array(p['ys'])-design@coef).tolist()]
        covariance=np.linalg.inv(design.T@design)*p['sigma']**2;margin=p['z']*math.sqrt(covariance[1,1]);slope=coef[1]
        return [float(slope),float(slope-margin),float(slope+margin)]
    if slug in {'clearance-grid','cap-fit'}:
        candidates=np.array(sorted(set(p['candidates'])));predicted=p['initial']*np.exp(-candidates[:,None]*np.array(p['times']))
        residuals=np.array(p['observed'])-predicted;cost=(residuals**2)@np.array(p['weights']);i=int(np.argmin(cost))
        return [float(candidates[i]),predicted[i].tolist(),residuals[i].tolist(),float(cost[i])]
    if slug in {'arx-predictions','cap-prediction'}:
        one,free=closed_arx(p)
        if slug=='arx-predictions':return [one,free]
        target=np.array(p['observed'][1:]);n=len(target)
        return [one,free,float(np.linalg.norm(np.array(one)-target)/math.sqrt(n)),float(np.linalg.norm(np.array(free)-target)/math.sqrt(n))]
    if slug=='excitation-rank':
        rows=list(zip(p['states'],p['inputs']))
        if not any(x or y for x,y in rows):return 0
        # All two-by-two minors, rather than a Gram determinant or floating rank threshold.
        return 2 if any(a*d-b*c for a,b in rows for c,d in rows) else 1
    if slug=='time-partition':return partition(p)
    if slug=='group-partition':
        groups=[set(p['training_groups']),set(p['validation_groups'])]
        groups.append(set(p['individuals'])-set.union(*groups))
        return [[i for i,label in enumerate(p['individuals']) if label in group] for group in groups]
    if slug=='cap-preprocess':
        parts=partition(p);training=[p['values'][i] for i in parts[0]];mean=statistics.fmean(training);scale=statistics.pstdev(training) or 1.
        return [*parts,mean,scale,[None if x is None else (x-mean)/scale for x in p['values']]]
    raise AssertionError(slug)

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_vectors_against_independent_oracles(q):
    for case in V[q['id']]['cases']:
        assert difference(independent(q['slug'][4:],case['arguments']),case['expected'],q['tolerance']) is None,(q['id'],case)

def typical_wrong(q):
    """Mutate one teaching assumption; each result remains executable Python."""
    slug=q['slug'][4:];source=S[q['id']]
    edits={
        'cosine-samples':('+phase','+0'),
        'causal-average':('/min(n+1,window)','/window'),
        'linear-convolution':('range(len(signal)+len(kernel)-1)','range(len(signal))'),
        'one-sided-spectrum':('elif k!=0 and not(size%2==0 and k==size//2):','elif k!=0:'),
        'fir-response':('imag=-sum(','imag=sum('),
        'response-components':('initial*math.exp(-k*t)','0.*math.exp(-k*t)'),
        'sampled-response':('exact.append(a*exact[-1]+b*u)','exact.append((1-k*step)*exact[-1]+step*u)'),
        'line-fit':('intercept=ybar-slope*xbar','intercept=0.'),
        'clearance-grid':('candidates=sorted(set(candidates))','candidates=candidates[:1]'),
        'slope-interval':('margin=z*sigma/math.sqrt(sxx)','margin=z*sigma'),
        'arx-predictions':('current=a*current+b*u;free.append(current)','current=a*observed[len(free)]+b*u;free.append(current)'),
        'excitation-rank':('return 2 if yy*uu-yu*yu>0 else 1','return 2'),
        'time-partition':('if t<train_end:','if t<=train_end:'),
        'group-partition':("if g in training_groups]","if g in training_groups and i==individuals.index(g)]"),
        'cap-discrete':('exact.append(a*exact[-1]+b*u)','exact.append((1-k*step)*exact[-1]+step*u)'),
        'cap-fit':('candidates=sorted(set(candidates))','candidates=candidates[:1]'),
        'cap-preprocess':('mean=sum(values[i] for i in train)/len(train)','mean=sum(x for x in values if x is not None)/sum(x is not None for x in values)'),
        'cap-prediction':('targets=observed[1:]','targets=observed[:-1]'),
    }
    before,after=edits[slug];assert before in source,(slug,before)
    return source.replace(before,after)

@pytest.mark.parametrize('q',[q for q in Q if q['type']=='python'],ids=lambda q:q['slug'])
def test_local_judge_samples_full_and_typical_wrong(tmp_path,q):
    engine=PracticeEngine(tmp_path/'learning')
    def submit(mode,source):
        result=engine.submit(dict(exercise_id=q['id'],exercise_version=q['version'],request_id=str(uuid.uuid4()),source=source,mode=mode),'python');deadline=time.monotonic()+25
        while result['state']!='FINISHED' and time.monotonic()<deadline:
            time.sleep(.01);result=engine.get(result['id'])
        assert result['state']=='FINISHED'
        return result
    try:
        assert submit('samples',S[q['id']])['verdict']=='AC'
        assert q['id'] not in engine.progress()['passed']
        assert submit('full',S[q['id']])['verdict']=='AC'
        assert q['id'] in engine.progress()['passed']
        assert submit('full',typical_wrong(q))['verdict']=='WA'
    finally:engine.close()

def test_notebook_boundaries_and_distinct_measurement_contracts():
    f=notebook_functions()
    np.testing.assert_allclose(f['sample_cosine']([0,1,2],.8,1,0),f['sample_cosine']([0,1,2],.2,1,0),atol=1e-12)
    assert f['causal_average']([2,4,8],3)==[2,3,14/3]
    assert f['linear_convolution']([2,4,8],[1/3]*3)[:3]!=f['causal_average']([2,4,8],3)
    assert f['regressor_rank']([2,2,2],[1,1,1])==1
    assert f['regressor_rank']([0,1,2],[1,1,1])==2
    np.testing.assert_allclose(f['sampled_response'](0,2,1,[3,0,1]),[[1,7,7,9],[1,7,7,9]])
    assert f['sampled_response'](.8,3,10,[0,0])[1][1]<0
    before=f['train_standardize']([0,1,2,3],[1,3,5,7],2,3)
    future=f['train_standardize']([0,1,2,3],[1,3,-100,100],2,3)
    assert before[3:5]==future[3:5] and before[5][:2]==future[5][:2]
    assert f['time_partition']([0,1,2,3],[1,None,3,4],2,3)==([0],[2],[3])

def test_capstone_four_levels_first_scores_and_retry(tmp_path):
    spec=json.loads((BANK/'assessment.json').read_text(encoding='utf-8'))
    assert len(spec['items'])==8 and sum(item['points'] for item in spec['items'])==100
    assert {item['objective'] for item in spec['items']}=={'T1','T2','T3','T4'}
    assert [sum(item['points'] for item in spec['items'] if item['level']==level) for level in range(1,5)]==[20,30,30,20]
    assert [q['id'] for q in Q if q['lesson_id']=='P06-SUMMARY']==[item['question_id'] for item in spec['items']]
    engine=PracticeEngine(tmp_path/'learning')
    try:
        rows=[]
        for i,item in enumerate(spec['items']):
            q=engine.questions[item['question_id']]
            rows.append(dict(id=str(i),created_at=f'2026-09-19T00:{i:02}:00+00:00',exercise_id=q['id'],exercise_version=q['version'],assessment_version=spec['version'],saved=True,state='FINISHED',mode='full',verdict='WA' if i==0 else 'AC'))
        initial=summarize_assessments(engine.assessments,engine.questions,rows)['P06-SUMMARY']
        assert initial['first_points']==90 and initial['first_grade']=='基础环节待补齐'
        retried=dict(rows[0],id='retry',created_at='2026-09-19T01:00:00+00:00',verdict='AC')
        final=summarize_assessments(engine.assessments,engine.questions,[retried,*rows])['P06-SUMMARY']
        assert final['first_points']==90 and final['practice_points']==100 and final['complete']
    finally:engine.close()
