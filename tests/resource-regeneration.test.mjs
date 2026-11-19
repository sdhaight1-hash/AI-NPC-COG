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

test('geological stone deposits do not regenerate on ordinary survival timescales',()=>{
 const A=kernel(),w=A.newWorld(379210),stone=node(w,'stone');
 assert.ok(stone);
 stone.stock=0;stone.regrow=.99;
 A.regenerate(w,20000);
 assert.equal(stone.stock,0,'An exhausted mineral source must remain exhausted');
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
 wood.regrow=4.7;stone.regrow=.91;
 const target=A.newWorld(379210);
 A.restoreWorld(target,saved);
 assert.equal(target.nodes.find(n=>n.id===wood.id).regrow,0);
 assert.equal(target.nodes.find(n=>n.id===stone.id).regrow,0);
 delete wood.regrow;
 A.restoreWorld(target,saved);
 assert.equal(target.nodes.find(n=>n.id===wood.id).regrow,0);
});
