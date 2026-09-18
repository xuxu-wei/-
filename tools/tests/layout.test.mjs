import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLayout,sidebarBounds,splitBounds,clamp} from '../../web/shared/layout.mjs';

test('Saved layout can be missing or malformed without hiding content or disabling wrapping',()=>{
  for(const value of [null,[],42,{sidebarWidth:'500',sidebarHidden:'false',questionShare:NaN,wrapCode:null}]){
    assert.deepEqual(normalizeLayout(value),{sidebarWidth:284,sidebarHidden:false,questionShare:.48,wrapCode:true});
  }
  assert.deepEqual(normalizeLayout({sidebarWidth:900,sidebarHidden:true,questionShare:.95,wrapCode:false}),{sidebarWidth:480,sidebarHidden:true,questionShare:.70,wrapCode:false});
});

test('Restored wide sidebar leaves space for content after resizing the browser',()=>{
  for(const viewport of [860,1024,1366,1920,2560]){
    const bounds=sidebarBounds(viewport),width=clamp(480,bounds.min,bounds.max);
    assert.ok(width>=220&&width<=480);assert.ok(viewport-width>=600);
  }
});

test('Either exercise pane keeps at least 300 px when the split layout is visible',()=>{
  for(const available of [760,900,1141,1600,2500]){
    const {min,max}=splitBounds(available);
    for(const desired of [.01,.48,.99]){
      const actual=clamp(desired,min,max);
      assert.ok((available-12)*actual>=300-1e-8);
      assert.ok((available-12)*(1-actual)>=300-1e-8);
    }
  }
});
