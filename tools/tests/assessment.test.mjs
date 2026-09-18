import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreText} from '../../web/shared/assessment.mjs';
test('partial first rounds never claim a completed assessment',()=>{
  assert.match(scoreText({attempted:0}),/尚未开始/);
  assert.match(scoreText({attempted:3,count:8,first_complete:false}),/3\/8/);
  assert.match(scoreText({attempted:8,first_complete:true,first_grade:'基本达标'}),/基本达标/);
  assert.match(scoreText({attempted:8,incomplete:true,first_complete:true}),/不完整/);
});
