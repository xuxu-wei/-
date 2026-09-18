// 返回选区编辑结果，键盘与工具按钮使用同一逻辑。
export function indentEdit(text,start,end,outdent=false){
  if(start===end&&!outdent)return {from:start,to:end,text:'    ',start:start+4,end:start+4};
  const from=start===0?0:text.lastIndexOf('\n',start-1)+1;
  const to=end>start&&text[end-1]==='\n'?end-1:end;
  const lines=text.slice(from,to).split('\n');
  const changes=lines.map(line=>outdent?-(line.match(/^( {1,4}|\t)/)?.[0].length||0):4);
  const result=lines.map((line,i)=>outdent?line.slice(-changes[i]):'    '+line).join('\n');
  return {from,to,text:result,start:Math.max(from,start+changes[0]),end:Math.max(from,end+changes.reduce((a,b)=>a+b,0))};
}
export function newlineEdit(text,start,end){
  const line=text.slice(start===0?0:text.lastIndexOf('\n',start-1)+1,start);
  const indent=(line.match(/^\s*/)?.[0]||'')+(line.trimEnd().endsWith(':')?'    ':'');
  return {from:start,to:end,text:'\n'+indent,start:start+1+indent.length,end:start+1+indent.length};
}
// 只在行首缩进内退到上一个四列制表位；普通文本和选区继续使用标准删除。
export function backspaceIndentEdit(text,start,end){
  if(start!==end||start===0)return null;
  const from=text.lastIndexOf('\n',start-1)+1,prefix=text.slice(from,start);
  if(!/^[ \t]+$/.test(prefix))return null;
  let column=0;const columns=[0];
  for(const char of prefix){column=char==='\t'?column+4-column%4:column+1;columns.push(column);}
  const target=column-(column%4||4);let keep=prefix.length;
  while(keep>0&&columns[keep]>target)keep--;
  return {from:from+keep,to:start,text:'',start:from+keep,end:from+keep};
}
export function attachEditor(area){
  let release=false;
  const apply=edit=>{area.setRangeText(edit.text,edit.from,edit.to,'preserve');area.setSelectionRange(edit.start,edit.end);area.dispatchEvent(new Event('input',{bubbles:true}));};
  area.addEventListener('keydown',event=>{
    if(event.key==='Escape'){release=true;return;}
    if(event.key==='Tab'){
      if(release){release=false;return;}
      event.preventDefault();apply(indentEdit(area.value,area.selectionStart,area.selectionEnd,event.shiftKey));
    }else if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey){event.preventDefault();apply(newlineEdit(area.value,area.selectionStart,area.selectionEnd));}
    else if(event.key==='Backspace'&&!event.ctrlKey&&!event.metaKey&&!event.altKey){const edit=backspaceIndentEdit(area.value,area.selectionStart,area.selectionEnd);if(edit){event.preventDefault();apply(edit);}}
    else release=false;
  });
  area.addEventListener('blur',()=>{release=false;});
  return ()=>{apply(indentEdit(area.value,area.selectionStart,area.selectionEnd));area.focus();};
}

export function createEditor(area){
  const CodeMirror=window.CodeMirror;
  if(!CodeMirror?.modes.python){
    document.getElementById('editor-status').textContent='编辑器组件未能加载，已切换为普通文本编辑，仍可提交；刷新页面可重试。';
    const indent=attachEditor(area);
    return {indent,setValue:value=>{area.value=value;},focus:()=>area.focus(),isFocused:()=>document.activeElement===area,markError:()=>{},goToLine:line=>{const start=area.value.split('\n').slice(0,line-1).join('\n').length+(line>1?1:0);area.focus();area.setSelectionRange(start,start);}};
  }
  let silent=false,release=false,errorLine=null;
  const cm=CodeMirror.fromTextArea(area,{
    mode:{name:'python',version:3},theme:'monokai',lineNumbers:true,
    indentUnit:4,tabSize:4,indentWithTabs:false,smartIndent:true,
    lineWrapping:area.wrap!=='off',matchBrackets:true,autoCloseBrackets:true,
    inputStyle:'contenteditable',screenReaderLabel:'你的 Python 解答',
    extraKeys:{
      Tab:instance=>{if(instance.somethingSelected())instance.indentSelection('add');else instance.replaceSelection(' '.repeat(4-instance.getCursor().ch%4),'end','+input');},
      'Shift-Tab':instance=>instance.indentSelection('subtract'),
      Backspace:instance=>{
        if(instance.somethingSelected()||instance.listSelections().length!==1)return CodeMirror.Pass;
        const cursor=instance.indexFromPos(instance.getCursor()),edit=backspaceIndentEdit(instance.getValue(),cursor,cursor);
        if(!edit)return CodeMirror.Pass;
        instance.replaceRange('',instance.posFromIndex(edit.from),instance.posFromIndex(edit.to),'+delete');
      },
    },
  });
  cm.getInputField().setAttribute('role','textbox');
  cm.getInputField().setAttribute('aria-describedby','editor-help draft-note');
  cm.getInputField().setAttribute('aria-multiline','true');
  cm.on('keydown',(_instance,event)=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){release=true;return;}
    if(release&&event.key==='Tab'){release=false;event.codemirrorIgnore=true;return;}
    release=false;
  });
  cm.on('blur',()=>{release=false;});
  function markError(line){
    if(errorLine!==null)cm.removeLineClass(errorLine,'background','editor-error-line');
    errorLine=null;
    if(Number.isInteger(line)&&line>=1&&line<=cm.lineCount()){errorLine=line-1;cm.addLineClass(errorLine,'background','editor-error-line');}
  }
  cm.on('change',()=>{area.value=cm.getValue();if(!silent){markError(null);area.dispatchEvent(new Event('input',{bubbles:true}));}});
  area.addEventListener('editor-wrap',()=>cm.setOption('lineWrapping',area.wrap!=='off'));
  document.querySelector('label[for=source]').addEventListener('click',event=>{event.preventDefault();cm.focus();});
  let width=0,height=0;
  new ResizeObserver(entries=>{
    const r=entries[0].contentRect;if(width!==r.width||height!==r.height){width=r.width;height=r.height;cm.refresh();}
  }).observe(document.getElementById('editor-surface'));
  return {
    indent:()=>{cm.indentSelection('add');cm.focus();},
    setValue(value){silent=true;try{markError(null);cm.setValue(value);area.value=value;cm.clearHistory();}finally{silent=false;}cm.refresh();},
    focus:()=>cm.focus(),isFocused:()=>cm.hasFocus(),markError,
    goToLine(line,column=1){cm.focus();cm.setCursor({line:Math.max(0,Math.min(cm.lineCount()-1,line-1)),ch:Math.max(0,column-1)});cm.scrollIntoView(cm.getCursor(),70);markError(line);},
  };
}
