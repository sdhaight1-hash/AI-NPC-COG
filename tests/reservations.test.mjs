import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const context={Frontier:{distance:(_world,a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)}};
vm.runInNewContext(readFileSync(new URL('../public/resource-reservations.js',import.meta.url),'utf8'),context);
const R=context.ResourceReservations;
function scenario(){
 const a={id:'person_1',x:0,y:0,inventory:{plank:0}};
 const b={id:'person_2',x:2,y:0,inventory:{plank:0}};
 const crate={id:'crate_1',type:'crate',x:0,y:1,capacity:8,contents:{plank:2}};
 return {state:{clock:500,npcs:[a,b],world:{structures:[crate]}},a,b,crate};
}
const claim=(actor,command,quantity=1)=>({
 actorId:actor,commandId:command,sourceId:'crate_1',kind:'plank',
 quantity,expiresAt:550
});
test('two actors cannot overreserve a finite two-plank stack',()=>{
 const {state}=scenario();
 assert.equal(R.reserve(state,claim('person_1','cmd_1',2)).ok,true);
 const blocked=R.reserve(state,claim('person_2','cmd_2',1));
 assert.equal(blocked.ok,false);
 assert.equal(blocked.reason,'INSUFFICIENT_UNRESERVED_STOCK');
 assert.equal(R.available(state,'crate_1','plank'),0);
 assert.equal(R.reserve(state,claim('person_1','cmd_1',2)).replayed,true);
 assert.equal(state.reservations.length,1);
 assert.equal(R.reserve(state,claim('person_1','cmd_1',1)).reason,'COMMAND_CONFLICT');
});
test('physical haul transfers exactly once and honors range',()=>{
 const {state,a,b,crate}=scenario();
 R.reserve(state,claim('person_2','cmd_2',2));
 assert.equal(R.collect(state,'cmd_2').reason,'SOURCE_OUT_OF_REACH');
 assert.equal(crate.contents.plank,2);
 b.x=0;b.y=1;
 assert.equal(R.collect(state,'cmd_2').ok,true);
 assert.equal(crate.contents.plank,0);
 assert.equal(b.inventory.plank,2);
 assert.equal(R.collect(state,'cmd_2').ok,false);
 assert.equal(b.inventory.plank,2);
 assert.equal(a.inventory.plank,0);
});
test('save/reload, actor death, expiry, disappearing source and stock loss clean claims',()=>{
 const {state}=scenario();
 R.reserve(state,claim('person_1','cmd_1'));
 const saved=JSON.parse(JSON.stringify(state.reservations));
 const again=scenario().state;
 R.restore(again,saved);
 assert.equal(R.available(again,'crate_1','plank'),1);
 assert.equal(R.releaseActor(again,'person_1'),1);
 assert.equal(R.available(again,'crate_1','plank'),2);
 R.restore(again,saved);
 again.clock=550;
 assert.equal(R.expire(again),1);
 assert.equal(again.reservations.length,0);
 R.restore(again,saved);
 assert.equal(again.reservations.length,0);
 again.clock=500;
 R.restore(again,saved);
 again.world.structures=[];
 assert.equal(R.reconcile(again),1);
});
test('capacity and absent inventory cannot mint materials',()=>{
 const {state,b,crate}=scenario();
 R.reserve(state,claim('person_2','cmd_2',2));
 b.x=0;b.y=1;b.inventory.plank=999;
 assert.equal(R.collect(state,'cmd_2').reason,'CARRY_CAPACITY_EXCEEDED');
 assert.equal(crate.contents.plank,2);
 crate.contents.plank=1;
 assert.equal(R.collect(state,'cmd_2').reason,'SOURCE_DEPLETED');
 assert.equal(b.inventory.plank,999);
 assert.equal(R.reconcile(state),1);
});
