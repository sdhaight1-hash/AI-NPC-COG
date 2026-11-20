import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(){
 const k=vm.createContext({});
 const files=['frontier','construction','biology','crafting','cognition','agency',
  'emergence','civilization','receipts','activities','reservations','projects',
  'perception','evidence-memory','world-runtime','simulation','persistence'];
 vm.runInContext(files.map(name=>readFileSync(new URL('../public/'+name+'.js',
  import.meta.url),'utf8')).join('\n'),k);
 const s=k.Simulation.initial(379210);s.auto=false;
 const spring=s.world.nodes.find(x=>x.kind==='water'&&x.stock>=2);
 assert.ok(spring,'A real seeded spring exists');
 return {k,s,spring};
}
const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,a+' should equal '+b);

test('a spring has a finite physical aquifer and no-rain discharge conserves its combined mass',()=>{
 const {k,s,spring}=setup(),max=spring.max;
 assert.equal(spring.groundwater,max*12);
 assert.equal(spring.rainAdmitted,0);
 spring.stock=0;spring.groundwater=4;spring.regrow=0;
 s.world.weather={...s.world.weather,kind:'clear',season:'Spring'};
 const before=spring.stock+spring.groundwater;
 k.AgentWorld.regenerate(s.world,40);
 assert.equal(spring.stock,0,'Labor cannot observe a full spring before discharge threshold');
 k.AgentWorld.regenerate(s.world,10);
 assert.equal(spring.stock,1);
 assert.equal(spring.groundwater,3);
 almost(spring.stock+spring.groundwater,before);
 for(let i=0;i<6;i++){
  if(spring.stock>0)spring.stock--;
  k.AgentWorld.regenerate(s.world,90);
 }
 assert.ok(spring.groundwater<=3);
 spring.stock=0;spring.groundwater=0;spring.regrow=0;
 k.AgentWorld.regenerate(s.world,20000);
 assert.equal(spring.stock,0,'Dry no-rain springs cannot refill from nothing');
 assert.equal(spring.groundwater,0);
 assert.ok(spring.regrow<1,'Empty aquifer cannot bank unbounded imaginary recharge');
});

test('rainfall is a measured external addition to groundwater, capped without creating stock',()=>{
 const {k,s,spring}=setup(),cap=spring.max*16;
 spring.stock=spring.max;spring.groundwater=cap-.05;
 spring.rainAdmitted=3;
 s.world.weather={...s.world.weather,kind:'storm',season:'Spring'};
 const before=spring.stock+spring.groundwater;
 k.AgentWorld.regenerate(s.world,10);
 almost(spring.groundwater,cap);
 almost(spring.rainAdmitted,3+.05);
 almost((spring.stock+spring.groundwater)-before,.05);
 assert.equal(spring.stock,spring.max);
 s.world.weather={...s.world.weather,kind:'clear'};
 k.AgentWorld.regenerate(s.world,40);
 almost(spring.rainAdmitted,3+.05,'Clear skies must add no rainfall');
});

test('real direct drinking debits source stock once without secretly creating groundwater',()=>{
 const {k,s,spring}=setup(),n=s.npcs[0];
 n.x=spring.x;n.y=spring.y;n.z=spring.z||0;n.path=[];
 n.energy=100;n.needs.thirst=96;n.bio.hydrationBudgetMl=100;
 s.auto=false;s.world.weather={...s.world.weather,kind:'clear'};
 const stored=spring.stock+spring.groundwater;
 assert.equal(k.WorldRuntime.begin(s,n,'drink_source'),true);
 k.Simulation.advance(s,1);
 assert.equal(n.inventory.water,0);
 assert.equal(spring.groundwater,spring.max*12,
  'No-rain, no-inflow direct drinking must not inject aquifer water');
 almost(spring.stock+spring.groundwater,stored-1);
 const receipt=s.receipts.findLast(r=>r.action==='drink_source'&&
  r.status==='COMPLETED'&&r.actorId===n.id);
 assert.ok(receipt);
 assert.ok(receipt.delta.nodeStock.some(x=>x.key===spring.id&&x.delta===-1));
});

test('v3 aquifer migration persists and one-minute versus batched simulation are canonical',()=>{
 const a=setup(),b=setup();
 a.spring.stock-=2;b.spring.stock-=2;
 for(let i=0;i<240;i++)a.k.Simulation.advance(a.s,1);
 b.k.Simulation.advance(b.s,240);
 assert.equal(a.k.Simulation.canonical(a.k.Persistence.save(a.s)),
  b.k.Simulation.canonical(b.k.Persistence.save(b.s)));
 const saved=copy(a.k.Persistence.save(a.s));
 const restored=a.k.Simulation.initial(379210);restored.auto=false;
 assert.equal(a.k.Persistence.restore(restored,saved),true);
 const spring=restored.world.nodes.find(x=>x.id===a.spring.id);
 assert.equal(spring.groundwater,a.spring.groundwater);
 assert.equal(spring.rainAdmitted,a.spring.rainAdmitted);
 assert.equal(spring.regrow,a.spring.regrow);
 const legacy=copy(saved);
 for(const node of legacy.world.nodes){
  delete node.groundwater;delete node.rainAdmitted;
 }
 const migrated=a.k.Simulation.initial(379210);migrated.auto=false;
 assert.equal(a.k.Persistence.restore(migrated,legacy),true);
 const imported=migrated.world.nodes.find(x=>x.id===a.spring.id);
 assert.equal(imported.groundwater,imported.max*12,
  'Older v3 saves get one finite seeded initial groundwater budget');
 assert.equal(imported.rainAdmitted,0);
});
