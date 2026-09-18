// 在 Node 中运行与网页完全相同的数学模块，对照 Notebook 导出的独立 Python 结果。
import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {euler, exactAmount} from '../web/single-compartment/model.mjs';

const vectors=JSON.parse(await readFile('.work/m1/reference-vectors.json','utf8'));
let worst=0;
for (const vector of vectors) {
  const actual=euler(vector.parameters,vector.h);
  assert.equal(actual.times.length,vector.times.length);
  const scale=Math.max(1,...vector.exact.map(Math.abs));
  for (let i=0;i<actual.times.length;i++) {
    assert.ok(Math.abs(actual.times[i]-vector.times[i])<=1e-12);
    worst=Math.max(worst,Math.abs(actual.amounts[i]-vector.euler[i])/scale,
      Math.abs(exactAmount(actual.times[i],vector.parameters)-vector.exact[i])/scale);
  }
}
assert.ok(worst<=1e-10,`JavaScript/Python mismatch: ${worst}`);
const report={cases:vectors.length,maximum_normalized_difference:worst,tolerance:1e-10,passed:true};
await writeFile('.work/m1/model-parity.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
