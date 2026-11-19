// Lightweight personal cognition: instincts and indexed episodic recall.
// The simulation is authoritative; no remembered event can mutate inventory.
(function(root){
 'use strict';
 const STOP=new Set(['the','and','with','from','some','that','this','was','for','into','are','has','have','your','where','near','what','when','then','very','there']);
 const terms=text=>[...new Set(String(text||'').toLowerCase().match(/[a-z][a-z0-9_]{2,}/g)||[])]
  .filter(t=>!STOP.has(t));
 const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
 function record(n,text,clock,meta={}){
  if(!Array.isArray(n.memories))n.memories=[];
  const time=Number.isFinite(clock)?clock:0;
  const kind=['event','success','failure','observation','conversation','need'].includes(meta.kind)?
   meta.kind:'event';
  const entry={text:String(text).slice(0,180),at:time,kind,
   action:String(meta.action||'').slice(0,40),ref:String(meta.ref||'').slice(0,80),
   x:Number.isInteger(n.x)?n.x:0,y:Number.isInteger(n.y)?n.y:0,
   salience:bound(Number(meta.salience)||1,1,5)};
  const last=n.memories[n.memories.length-1];
  if(last&&last.text===entry.text&&last.action===entry.action&&
   last.ref===entry.ref&&time-last.at<12){
   last.at=time;last.salience=Math.max(last.salience,entry.salience);
  }else n.memories.push(entry);
  // Retain distinct experiences beyond the 24-entry recent-event buffer.
  if(n.memories.length>160){
   const recent=n.memories.slice(-100),older=n.memories.slice(0,-100)
    .sort((a,b)=>(b.salience||1)-(a.salience||1)||(b.at||0)-(a.at||0))
    .slice(0,60).sort((a,b)=>(a.at||0)-(b.at||0));
   n.memories=[...older,...recent];
  }
  return entry;
 }
 function recall(n,query,clock,limit=5){
  const needles=terms(query),now=Number.isFinite(clock)?clock:0;
  return (n.memories||[]).map((m,i)=>{
   const words=terms(m.text+' '+(m.action||'')+' '+(m.kind||''));
   const overlap=needles.filter(t=>words.some(w=>w===t||w.startsWith(t)||t.startsWith(w))).length;
   const age=Math.max(0,now-(m.at||0));
   const recency=3/(1+age/240);
   const distance=Math.abs((n.x||0)-(m.x||0))+Math.abs((n.y||0)-(m.y||0));
   const locality=distance<8?1:0;
   return {m,score:overlap*5+(m.salience||1)*1.5+recency+locality+i*.000001};
  }).sort((a,b)=>b.score-a.score).slice(0,Math.max(0,Math.min(8,limit)))
   .map(v=>v.m);
 }
 function recentFailure(n,action,clock){
  return (n.memories||[]).some(m=>m.kind==='failure'&&m.action===action&&
   Number.isFinite(m.at)&&clock-m.at>=0&&clock-m.at<30);
 }
 function restore(n,saved){
  n.memories=[];
  if(!Array.isArray(saved))return;
  for(const m of saved.slice(-160)){
   if(!m||typeof m.text!=='string')continue;
   const at=Number.isFinite(m.at)?m.at:0;
   record(n,m.text,at,{kind:m.kind,action:m.action,ref:m.ref,
    salience:Number(m.salience)||1});
   const item=n.memories[n.memories.length-1];
   if(Number.isInteger(m.x))item.x=m.x;
   if(Number.isInteger(m.y))item.y=m.y;
   if(typeof m.time==='string')item.time=m.time.slice(0,80);
  }
 }
 // Fast involuntary responses. A threat overrides low-priority jobs, never
 // fabricates resources. The caller checks reachable legal actions first.
 function instinct(n,options){
  const keys=new Set(options.map(o=>o.key));
  const choose=(...actions)=>actions.find(k=>keys.has(k))||null;
  if(n.needs.thirst>=85||n.bio?.hydrationBudgetMl<350)
   return choose(n.inventory.water>0?'drink':'fill_water','fill_water','drink');
  if(n.needs.hunger>=85||n.bio?.longTermKcal<150)
   return choose(n.inventory.food>0?'eat':'forage','forage','eat');
  if(n.energy<=18)return choose('rest');
  return null;
 }
 root.Cognition={record,recall,recentFailure,restore,instinct};
})(globalThis);
