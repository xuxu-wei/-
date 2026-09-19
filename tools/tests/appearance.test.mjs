import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getTheme,applyTheme,toggleTheme} from '../../web/shared/appearance.mjs';

const source=readFileSync(new URL('../../web/shared/boot.js',import.meta.url),'utf8');
const key='systems-science:theme:v1',legacy='systems-science:home-theme:v1';
function page({home=false,store=new Map(),blocked=false}={}){
  const listeners=new Map(),events=[];
  const sandbox={
    document:{body:{dataset:{},classList:{contains:name=>home&&name==='home-page'}},documentElement:{dataset:{},style:{}}},
    localStorage:{getItem(k){if(blocked)throw Error('blocked');return store.get(k)??null;},setItem(k,v){if(blocked)throw Error('blocked');store.set(k,v);}},
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    addEventListener(type,callback){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(callback);},
    dispatchEvent(event){events.push(event);for(const listener of listeners.get(event.type)||[])listener(event);},
    setTimeout(){},
  };
  sandbox.window=sandbox;vm.runInNewContext(source,sandbox);
  return{...sandbox,store,events,emit:(type,event)=>{for(const listener of listeners.get(type)||[])listener(event);}};
}

test('first home visit and subsequent teaching pages retain one theme',()=>{
  const store=new Map(),home=page({home:true,store});
  assert.equal(home.document.documentElement.dataset.siteTheme,'dark');
  assert.equal(home.document.body.dataset.skyTheme,'dark');
  assert.equal(page({store}).systemsScienceAppearance.getTheme(),'dark');
  home.systemsScienceAppearance.applyTheme('light');
  assert.equal(page({store}).systemsScienceAppearance.getTheme(),'light');
  assert.equal(page({home:true,store}).document.body.dataset.skyTheme,'light');
});

test('direct teaching entry defaults light and can set dark for the homepage',()=>{
  const store=new Map(),lesson=page({store});
  assert.equal(lesson.systemsScienceAppearance.getTheme(),'light');
  lesson.systemsScienceAppearance.toggleTheme();
  assert.equal(page({home:true,store}).systemsScienceAppearance.getTheme(),'dark');
});

test('legacy home preference migrates without overriding an existing site preference',()=>{
  const store=new Map([[legacy,'light']]);
  assert.equal(page({home:true,store}).systemsScienceAppearance.getTheme(),'light');
  assert.equal(store.get(key),'light');
  store.set(key,'dark');
  assert.equal(page({store}).systemsScienceAppearance.getTheme(),'dark');
});

test('blocked storage still allows local theme changes and broadcasts their value',()=>{
  const lesson=page({blocked:true});
  assert.equal(lesson.systemsScienceAppearance.applyTheme('dark'),'dark');
  assert.equal(lesson.document.documentElement.style.colorScheme,'dark');
  assert.equal(lesson.events.at(-1).type,'site-theme-change');
  assert.equal(lesson.events.at(-1).detail.theme,'dark');
});

test('storage events update another tab without rewriting the preference',()=>{
  const lesson=page();lesson.emit('storage',{key,newValue:'dark'});
  assert.equal(lesson.systemsScienceAppearance.getTheme(),'dark');
  assert.equal(lesson.store.get(key),'light');
  lesson.emit('storage',{key:'unrelated-setting',newValue:'light'});
  assert.equal(lesson.systemsScienceAppearance.getTheme(),'dark');
});

test('public module delegates to the shared controller and rejects unknown themes',t=>{
  const original=globalThis.window,lesson=page();globalThis.window=lesson;
  t.after(()=>{if(original===undefined)delete globalThis.window;else globalThis.window=original;});
  assert.equal(getTheme(),'light');assert.equal(toggleTheme(),'dark');
  assert.equal(applyTheme('light'),'light');
  assert.throws(()=>applyTheme('sepia'),/dark or light/);assert.equal(getTheme(),'light');
});
