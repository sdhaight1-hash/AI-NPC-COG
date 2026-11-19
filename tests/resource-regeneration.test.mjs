import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function kernel(){
 const root=vm.createContext({});
 const names=['frontier','construction','biology','crafting','cognition','agency','emergence'];
 vm.runInContext(names.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),root);
 return root.AgentWorld;
}
const node=(world,kind)=>world.nodes.find(n=>n.kind===kind);

test('existing resource classes preserve fractional stock recovery on save/load',()=>{
 const A=kernel(),w=A.newWorld(379210);
 for(const kind of ['water','food','fiber','wood','stone']){
  const resource=node(w,kind);
  assert.ok(resource,kind+' source exists in baseline seed');
  resource.stock=Math.max(0,resource.stock-1);
  resource.regrow=.37;
 }
 const restored=A.newWorld(379210);
 A.restoreWorld(restored,JSON.parse(JSON.stringify(w)));
 for(const kind of ['water','food','fiber','wood','stone']){
  const original=node(w,kind),copy=restored.nodes.find(n=>n.id===original.id);
  assert.equal(copy.stock,original.stock);
  assert.equal(copy.regrow,.37,kind+' fractional recovery must be checkpointed');
 }
});

test('fractional renewable growth survives saved world restore without resetting yields',()=>{
 const A=kernel(),w=A.newWorld(379210),wood=node(w,'wood');
 assert.ok(wood);
 wood.stock-=1;
 A.regenerate(w,60);
 assert.ok(wood.regrow>0&&wood.regrow<1,'Partial woody biomass recovery is tracked');
 const replica=A.newWorld(379210);
 A.restoreWorld(replica,JSON.parse(JSON.stringify(w)));
 const copy=replica.nodes.find(n=>n.id===wood.id);
 assert.equal(copy.stock,wood.stock);
 assert.equal(copy.regrow,wood.regrow,'Save/restore cannot erase partial growth');
 A.regenerate(w,70);A.regenerate(replica,70);
 assert.equal(copy.stock,wood.stock);
 assert.equal(copy.regrow,wood.regrow);
});

test('legacy or malformed source-growth fractions restore to a safe zero',()=>{
 const A=kernel(),w=A.newWorld(379210),saved=JSON.parse(JSON.stringify(w));
 const wood=node(saved,'wood'),stone=node(saved,'stone');
 wood.regrow=4.7;stone.regrow=-.91;
 const target=A.newWorld(379210);
 A.restoreWorld(target,saved);
 assert.equal(target.nodes.find(n=>n.id===wood.id).regrow,0);
 assert.equal(target.nodes.find(n=>n.id===stone.id).regrow,0);
 delete wood.regrow;
 A.restoreWorld(target,saved);
 assert.equal(target.nodes.find(n=>n.id===wood.id).regrow,0);
});
