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

test('residents show authoritative timed work and visible rest without changing state',()=>{
 const labels=[],rects=[];
 const canvas=new Proxy({measureText:t=>({width:String(t).length*5}),
  fillText:t=>labels.push(t),fillRect:(...args)=>rects.push(args),
  drawImage(){}},{get:(obj,key)=>obj[key]??(()=>{}),
  set:(obj,key,value)=>{obj[key]=value;return true;}});
 const sandbox={document:{createElement:()=>({width:16,height:24,getContext:()=>canvas})}};
 vm.runInNewContext(readFileSync(new URL('../public/pixel-art.js',import.meta.url),'utf8'),sandbox);
 const art=sandbox.VillageArt;
 const resident={id:'person_6',name:'Builder',x:10,y:10,motion:0,
  path:[],task:{key:'collect_wood'},currentActivity:{workRequired:10,workDone:5}};
 const before=JSON.stringify(resident);
 art.drawActor(canvas,resident,false,{x:10,y:10},false,720);
 assert.ok(labels.includes('WOOD'),'Current work must be visible over the person');
 const px=Math.round((10+.5)*16),py=Math.round((10+1)*16);
 assert.ok(rects.some(r=>r[0]===px-12&&r[1]===py-37&&
  r[2]===12&&r[3]===2),'Progress bar must reflect the real 50% activity');
 assert.equal(JSON.stringify(resident),before,'Rendering is never authorized to mutate tasks');
 const sleeping={...resident,task:null,currentActivity:null,action:'rest'};
 labels.length=0;
 art.drawActor(canvas,sleeping,false,{x:10,y:10},false,720);
 assert.ok(labels.includes('Zz'),'Stationary recovery must be legible');
});
