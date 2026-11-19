// Deterministic, browser-free orchestration of one authoritative simulation interval.
// Side effects (UI, decision policy, movement and activity execution) are supplied
// explicitly so the same ordering runs in browsers and headless Node.
// Existing game-time semantics are preserved: elapsed is in simulated minutes.
(function(root){
 'use strict';
 function advance(state,elapsed,ports={}){
  if(state.paused||!Number.isFinite(elapsed)||elapsed<=0)
   return {advanced:false,arrivals:[],deaths:[]};
  const {Frontier,AgentWorld,Civilization}=root;
  if(!Frontier||!AgentWorld||!Civilization)
   throw Error('Simulation kernels unavailable');
  const runtime=root.WorldRuntime;
  const move=ports.move||(runtime&&((n,dt)=>runtime.move(state,n,dt)));
  const complete=ports.complete||(runtime&&(n=>runtime.complete(state,n)));
  const plan=ports.advancePlan||(runtime&&(n=>runtime.advancePlan(state,n)));
  const schedule=ports.schedule||(runtime&&(()=>runtime.scheduleOffline(state)));
  const before=state.clock;
  state.clock+=elapsed;state.world.now=state.clock;
  state.day=Math.floor(state.clock/1440)+1;
  state.world.weather=Frontier.weather(state.world,state.clock);
  AgentWorld.regenerate(state.world,elapsed);
  const arrivals=Civilization.advanceArrivals(state,before,state.clock);
  for(const n of arrivals)ports.onArrival?.(n);
  const deaths=[];
  for(const n of [...state.npcs]){
   if(n.peerReservedFor&&!state.npcs.some(peer=>peer.id===n.peerReservedFor&&
    peer.task?.key==='socialize'&&peer.task.ref===n.id))delete n.peerReservedFor;
   if(!n.peerPending&&!n.peerReservedFor)move?.(n,elapsed);
   const recovered=AgentWorld.stepNeeds(n,state.world,elapsed);
   if(recovered==='Recovered')ports.onRecovery?.(n);
   const death=Civilization.updateHealth(state,n,elapsed);
   if(death){deaths.push({id:n.id,cause:death});ports.onDeath?.(n,death);continue;}
   if(!n.peerPending){
    if(n.task&&!n.path.length){
     root.Activities?.progress(state,n);
     complete?.(n);
    }
    else if(n.plan&&!n.task&&!n.path.length)plan?.(n);
   }
  }
  ports.afterActors?.(state);
  schedule?.(state);
  return {advanced:true,arrivals:arrivals.map(n=>n.id),deaths};
 }
 function initial(seed){
  const world=root.AgentWorld.newWorld(seed);
  const npcs=root.Civilization.founders(world,490);
  return {clock:490,day:1,paused:false,auto:true,npcs,dead:[],
   nextPersonId:6,world,events:[],selected:npcs[0]?.id||null,
   commandSeq:0,receiptSeq:0,effectRevision:0,receipts:[]};
 }
 // Canonical key ordering handles property insertion differences across
 // saves and VM realms. Non-finite numbers and cycles are invalid state.
 function canonical(value){
  const seen=new Set();
  const visit=v=>{
   if(v===null||typeof v==='string'||typeof v==='boolean')return v;
   if(typeof v==='number'){
    if(!Number.isFinite(v))throw Error('Nonfinite state');
    return v;
   }
   if(Array.isArray(v))return v.map(visit);
   if(typeof v!=='object')throw Error('Nonserializable state');
   if(seen.has(v))throw Error('Cyclic world state');
   seen.add(v);
   const result={};
   for(const key of Object.keys(v).sort()){
    if(v[key]!==undefined&&typeof v[key]!=='function')result[key]=visit(v[key]);
   }
   seen.delete(v);
   return result;
  };
  return JSON.stringify(visit(value));
 }
 root.Simulation={advance,initial,canonical};
})(globalThis);
