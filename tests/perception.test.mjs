import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){
 const c=vm.createContext({});
 for(const name of ['frontier','perception']){
  vm.runInContext(readFileSync(new URL('../public/'+name+'.js',import.meta.url),'utf8'),c);
 }
 const world={width:20,height:20,seed:1,
  terrain:Array(400).fill('meadow'),edits:{},nodes:[],items:[],structures:[],
  weather:{kind:'clear'}};
 const a={id:'person_1',name:'A',x:5,y:5,z:0,
  action:'rest',inventory:{food:1},needs:{hunger:20,thirst:30},energy:70};
 const b={id:'person_2',name:'B',x:7,y:5,z:0,
  action:'craft_stage',inventory:{secret:999},needs:{hunger:93,thirst:92},energy:50};
 const state={clock:720,world,npcs:[a,b]};
 return {P:c.Perception,state,a,b,world};
}
test('opaque terrain blocks another actor and activity until wall removal',()=>{
 const {P,state,a,b,world}=setup();
 assert.equal(P.snapshot(state,a).people.length,1);
 world.edits['6:5:0']='wall';
 assert.equal(P.canSee(state,a,b),false);
 assert.equal(P.snapshot(state,a).people.length,0);
 delete world.edits['6:5:0'];
 assert.equal(P.snapshot(state,a).people[0].activity,'craft_stage');
});
test('hearing requires loudness and distance; never invents an unseen identity',()=>{
 const {P,state,a,world}=setup();
 world.edits['6:5:0']='wall';
 const far={kind:'speech',x:10,y:5,z:0,loudness:'quiet',
  actorId:'person_2',words:'private password'};
 assert.equal(P.sound(state,a,far),null);
 const loud={...far,kind:'construction',loudness:'loud',x:9};
 const heard=P.sound(state,a,loud);
 assert.ok(heard);
 assert.equal(heard.kind,'construction');
 assert.equal(heard.actorId,undefined);
 assert.equal(JSON.stringify(heard).includes('password'),false);
 const packet=P.snapshot(state,a,[far,loud]);
 assert.equal(packet.heard.length,1);
 assert.equal(packet.people.length,0);
});
test('darkness and fog change visual range, never the underlying truth',()=>{
 const {P,state,a,b,world}=setup();
 b.x=10;b.y=5;
 assert.equal(P.canSee(state,a,b),true);
 state.clock=23*60;
 assert.equal(P.canSee(state,a,b),false);
 assert.equal(b.x,10);
 state.clock=720;world.weather.kind='fog';
 assert.equal(P.canSee(state,a,b),false);
 world.weather.kind='clear';
 assert.equal(P.canSee(state,a,b),true);
});
test('physical inspection reveals finite stocks locally, never another mind',()=>{
 const {P,state,a,b,world}=setup();
 world.nodes.push({id:'node_1',x:6,y:5,z:0,kind:'wood',stock:4,max:8});
 const record=P.inspect(state,a,'node_1');
 assert.equal(record.stock,4);
 assert.equal(record.maximum,8);
 assert.equal(Object.isFrozen(record),true);
 a.x=1;a.y=1;
 assert.equal(P.inspect(state,a,'node_1'),null);
 const packet=P.snapshot(state,a);
 assert.equal(JSON.stringify(packet).includes('secret'),false);
 assert.equal(JSON.stringify(packet).includes('93'),false);
 assert.equal(JSON.stringify(packet).includes('92'),false);
 assert.equal(packet.bodily.hunger,20);
 assert.equal(b.inventory.secret,999);
});
test('identical snapshots are deterministic and reference-isolated',()=>{
 const {P,state,a,b}=setup();
 const first=P.snapshot(state,a),second=P.snapshot(state,a),other=P.snapshot(state,b);
 assert.equal(JSON.stringify(first),JSON.stringify(second));
 assert.notEqual(first,second);
 assert.notEqual(first.people,second.people);
 assert.equal(Object.isFrozen(first.people),true);
 assert.equal(Object.isFrozen(first.bodily),true);
 assert.equal(other.actorId,b.id);
 assert.equal(other.bodily.thirst,92);
 assert.equal(first.bodily.thirst,30);
});

test('model options cannot disclose obscured source stocks or hidden targets',()=>{
 const {P,state,a,world}=setup();
 world.nodes.push({id:'deposit_hidden',x:7,y:5,z:0,
  kind:'wood',stock:17,max:20});
 world.edits['6:5:0']='wall';
 const options=[
  {key:'collect_wood',ref:'deposit_hidden',
   when:'Collect wood from a visible source (17 remaining, 2 tiles away)'},
  {key:'none',ref:null,when:'Observe surroundings'}
 ];
 const hidden=P.filterAffordances(state,a,options);
 assert.equal(hidden.some(x=>x.key==='collect_wood'),false);
 delete world.edits['6:5:0'];
 const visible=P.filterAffordances(state,a,options);
 assert.equal(visible.some(x=>x.key==='collect_wood'),true);
 assert.equal(JSON.stringify(visible).includes('17 remaining'),false);
 a.agency={beliefs:[{ref:'deposit_hidden',kind:'wood',status:'available'}]};
 world.edits['6:5:0']='wall';
 assert.equal(P.filterAffordances(state,a,options).some(x=>
  x.key==='collect_wood'),true,'Earlier firsthand evidence may guide retrieval');
});
