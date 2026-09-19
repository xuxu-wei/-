import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nodeProgress, chooseResumePart, mixColors, getView, directNeighborhood} from '../../web/home/graph-model.mjs';

const graph = JSON.parse(readFileSync(new URL('../../web/home/graph.json', import.meta.url), 'utf8'));
const base = {id:'1', number:'1', kind:'part', available:true, published:1, total:1, questionIds:['a','b'], assessmentIds:['a-summary']};

test('unexplored, partly learned, fully passed and assessment light are distinct', () => {
  assert.equal(nodeProgress(base).glow, 0);
  assert.equal(nodeProgress(base,{started:['a']}).state, 'active');
  const half = nodeProgress(base,{passed:['a']});
  const complete = nodeProgress(base,{passed:['a','b']});
  assert.equal(half.ratio, .5);
  assert.ok(half.glow > 0 && complete.glow > half.glow);
  assert.equal(complete.state, 'complete');
  const withScore = score => nodeProgress(base,{passed:['a','b'],assessments:{'a-summary':{attempted:2,points:100,practice_points:score}}});
  assert.ok(withScore(100).glow > withScore(40).glow);
  assert.equal(withScore(40).score, .4);
  assert.equal(nodeProgress({...base,kind:'chapter'}, {assessments:{'a-summary':{attempted:2,points:100,practice_points:100}}}).score, null);
});

test('zero questions and planned extensions never turn into completed learning', () => {
  assert.equal(nodeProgress({...base, available:false, questionIds:[]}).state, 'new');
  const partial = nodeProgress({...base,published:5,total:6},{passed:['a','b']});
  assert.equal(partial.ratio, 1);
  assert.equal(partial.state, 'active');
  assert.equal(partial.coverage, 5/6);
  assert.ok(partial.glow < nodeProgress(base,{passed:['a','b']}).glow);
  assert.equal(nodeProgress(base,{passed:['a','b'],incomplete:true}).state, 'active');
  assert.equal(nodeProgress(base,{passed:['a','b'],incomplete:true,assessments:{'a-summary':{attempted:1,points:1,practice_points:1}}}).score,null);
});

test('progress deduplicates IDs and does not count unrelated or old sample answers', () => {
  const value = nodeProgress({...base,questionIds:['a','a','b']},{passed:['a','sample-old','unknown'],started:['sample-old']});
  assert.equal(value.passed,1);assert.equal(value.total,2);assert.equal(value.ratio,.5);
  assert.equal(nodeProgress(base,{passed:['sample-old']}).glow,0);
  assert.equal(nodeProgress(base,{passed:null,started:{}}).state,'new');
});

test('resume selection uses available course order, active attempts and delivered completion', () => {
  const second={...base,id:'2',number:'2',questionIds:['c']};
  const last={...base,id:'3',number:'3',questionIds:['d'],published:5,total:6};
  const planned={...base,id:'4',number:'4',questionIds:[],available:false,published:0};
  const nodes=[last,planned,second,base];
  assert.equal(chooseResumePart(nodes).id,'1');
  assert.equal(chooseResumePart(nodes,{started:['c']}).id,'2');
  assert.equal(chooseResumePart(nodes,{passed:['a','b']}).id,'2');
  assert.equal(chooseResumePart(nodes,{passed:['a','b','c','d']}).id,'3');
  assert.equal(chooseResumePart([]),null);
});

test('five lens colors blend deterministically without dim encoded-color averaging', () => {
  const taxonomy=[{id:'a',color:'#ff0000'},{id:'b',color:'#0000ff'}];
  assert.equal(mixColors(['a'],taxonomy),'#ff0000');
  assert.equal(mixColors(['a','b'],taxonomy),'#bc00bc');
  assert.equal(mixColors(['b','a','a'],taxonomy),'#bc00bc');
  assert.equal(mixColors(['unknown'],taxonomy),'#9cbbdd');
});

test('each view selects only the requested hierarchy level and its direct edges', () => {
  const root=getView(graph);
  assert.ok(root.nodes.length>0 && root.nodes.every(n=>n.kind==='part'));
  const part=getView(graph,root.nodes[0].id);
  assert.ok(part.nodes.every(n=>n.kind==='chapter'));
  const chapter=getView(graph,part.nodes[0].id);
  assert.ok(chapter.nodes.length>0 && chapter.nodes.every(n=>n.kind==='concept'));
  for (const view of [root,part,chapter]) {
    const ids=new Set(view.nodes.map(n=>n.id));
    assert.ok(view.edges.every(e=>ids.has(e.source)&&ids.has(e.target)));
  }
  assert.deepEqual(getView(graph,'no-such-parent'),{nodes:[],edges:[]});
  assert.deepEqual([...directNeighborhood('a',[{source:'a',target:'b'},{source:'b',target:'c'}])],['a','b']);
});

test('concept radiance is explicitly the linked lesson exercise progress', () => {
  const concept=graph.nodes.find(n=>n.kind==='concept'&&n.available);
  assert.ok(concept.lessonId && concept.lessonNumber && concept.lessonTitle);
  assert.match(nodeProgress(concept).scope,/小节练习.*不等同/);
  assert.equal(nodeProgress(concept).score,null);
});
