import assert from 'node:assert/strict';
import {test} from 'node:test';
import {decayExampleKind,nextDecayExample} from '../../web/single-compartment/examples.mjs';
import {euler,exactAmount} from '../../web/single-compartment/model.mjs';

test('negative and positive presets can be revisited without changing the continuous model',()=>{
  let state={u:1,k:.5,A0:0,h:.1,time:12};
  for(let turn=0;turn<6;turn++){
    state=nextDecayExample(state);
    const negative=turn%2===0;
    assert.equal(decayExampleKind(state),negative?'negative':'positive');
    const amounts=euler(state,state.h).amounts;
    assert.equal(amounts[1],negative?-5:2.5);
    assert.equal(amounts.some(value=>value<0),negative);
    assert.equal(exactAmount(1,state),10*Math.exp(-.75));
    assert.equal(state.time,0);
  }
});

test('manual changes and reset are recognized from actual parameters',()=>{
  const negative=nextDecayExample({u:1,k:.5,A0:0,h:.1});
  const smaller={...negative,h:1};
  assert.equal(decayExampleKind(smaller),'positive');
  assert.equal(nextDecayExample(smaller).h,2);
  for(const state of [{...negative,k:.5},{...negative,A0:0},{...negative,u:1},{...negative,h:.5},{u:1,k:.5,A0:0,h:.1}]){
    assert.equal(decayExampleKind(state),'custom');
    assert.equal(decayExampleKind(nextDecayExample(state)),'negative');
  }
});
