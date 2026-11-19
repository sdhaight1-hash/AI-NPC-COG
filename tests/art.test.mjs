import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function scene(){
 const context={};
 vm.runInNewContext(readFileSync(new URL('../public/pixel-art.js',import.meta.url),'utf8'),context);
 return context.VillageArt;
}
function context(){
 const drawn=[];
 const canvas=new Proxy({measureText:()=>({width:24}),drawImage:(...args)=>drawn.push(args)},{
  get(obj,key){return key in obj?obj[key]:()=>{};},
  set(obj,key,value){obj[key]=value;return true;}
 });
 return {canvas,drawn};
}
test('CC0 tileset must be exactly a packed 192x176 16x16 atlas',()=>{
 const art=scene();
 assert.equal(art.setAtlas({width:100,height:100}),false);
 assert.equal(art.setAtlas({width:192,height:176}),true);
 assert.equal(art.setAtlas(null),true);
});
test('all tilemap art is cached, switching tile treatment does not alter world rules',()=>{
 const art=scene(),{canvas,drawn}=context();
 const map={height:26,width:40},buildings=[],trees=[[1,2],[12,3],[26,4]];
 art.drawWorld(canvas,map,buildings,trees);
 assert.equal(drawn.length,0,'No atlas draw calls without licensed asset');
 assert.equal(art.setAtlas({width:192,height:176}),true);
 art.drawWorld(canvas,map,buildings,trees);
 assert.ok(drawn.length>1000,'CC0 atlas is actually applied across terrain');
 assert.ok(drawn.some(a=>a.length===9),'Source atlas coordinates should use drawImage clipping');
 const count=drawn.length;
 art.setAtlas(null);
 art.drawWorld(canvas,map,buildings,trees);
 assert.equal(drawn.length,count,'Returning to original art does not access the atlas');
});
test('lighting and campfire effects support dusk, dawn and daytime without changing state',()=>{
 const art=scene(),{canvas}=context();
 const world={structures:[{type:'campfire',x:12,y:12}],nodes:[]};
 const before=JSON.stringify(world);
 for(const time of [60,360,720,1080,1400])art.drawAmbient(canvas,world,time,5000);
 assert.equal(JSON.stringify(world),before,'Rendering cannot mutate world state');
});
