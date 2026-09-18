import test from 'node:test';
import assert from 'node:assert/strict';
import {indentEdit,newlineEdit,backspaceIndentEdit} from '../../web/practice/editor.mjs';
import {summarize,questionIds} from '../../web/shared/progress.mjs';
import {createPlayback} from '../../web/shared/playback.mjs';

const apply=(text,edit)=>text.slice(0,edit.from)+edit.text+text.slice(edit.to);
test('Seeking to the end and resetting report the new timeline position',()=>{
  let rendered,notice;
  const playback=createPlayback({update:t=>{rendered=t;},changed:(status,time)=>{notice={status,time,rendered};}});
  playback.seek(20);assert.deepEqual(notice,{status:'ended',time:20,rendered:20});
  playback.seek(0);assert.deepEqual(notice,{status:'paused',time:0,rendered:0});
});
test('Tab inserts four spaces at a caret; selected lines indent and unindent together',()=>{
  assert.equal(apply('abc',indentEdit('abc',1,1)),'a    bc');
  const original='one\ntwo\nthree';
  const first=indentEdit(original,0,8);
  const indented=apply(original,first);
  assert.equal(indented,'    one\n    two\nthree');
  assert.equal(apply(indented,indentEdit(indented,first.start,first.end,true)),original);
});
test('Outdent at the first line and with partial indentation leaves valid selection',()=>{
  const text='  a\n\tb';const edit=indentEdit(text,0,text.length,true);
  assert.equal(apply(text,edit),'a\nb');assert.equal(edit.start,0);assert.equal(edit.end,3);
  assert.equal(apply('plain',indentEdit('plain',0,0,true)),'plain');
});
test('Enter keeps block indentation and replaces selected code',()=>{
  const text='    if value:';assert.equal(apply(text,newlineEdit(text,text.length,text.length)),text+'\n        ');
  assert.equal(apply('    result = 1',newlineEdit('    result = 1',14,14)),'    result = 1\n    ');
});
test('Backspace at indentation removes one visual indent, including partial spaces and tabs',()=>{
  for(const [text,cursor,expected] of [['        value',8,'    value'],['      value',6,'    value'],['    value',4,'value'],['\t    value',5,'\tvalue'],['\tvalue',1,'value'],['a\n    value',6,'a\nvalue']]){
    const edit=backspaceIndentEdit(text,cursor,cursor);assert.ok(edit);assert.equal(apply(text,edit),expected);
  }
});
test('Indent deletion does not swallow code, newlines, or selected text',()=>{
  for(const [text,start,end] of [['a =  ',5,5],['    a',5,5],['one\ntwo',4,4],['    a',0,4],['',0,0]])assert.equal(backspaceIndentEdit(text,start,end),null);
});
test('Progress has three states; an empty or unrelated formal chapter never completes',()=>{
  assert.equal(summarize(['a','b']).state,'new');
  assert.equal(summarize(['a','b'],{started:['a']}).state,'active');
  assert.equal(summarize(['a','b'],{passed:['a']}).state,'active');
  assert.equal(summarize(['a','b'],{passed:['a','b']}).state,'complete');
  assert.equal(summarize([],{passed:['a','b']}).state,'new');
  assert.equal(summarize(['formal-question'],{passed:['sample-question']}).state,'new');
  assert.deepEqual(questionIds({chapters:[{lessons:[{questions:[{id:'a'},{id:'b'}]}]}]}),['a','b']);
});
