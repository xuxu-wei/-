// 用同一个清除模型比较两个步长；从参数识别示例，避免手动修改后留下过期状态。
export function decayExampleKind({u,k,A0,h}) {
  if(u===0 && k===0.75 && A0===10) {
    if(h===2)return 'negative';
    if(h===1)return 'positive';
  }
  return 'custom';
}

export function nextDecayExample(parameters) {
  return {u:0,k:0.75,A0:10,h:decayExampleKind(parameters)==='negative'?1:2,time:0};
}
