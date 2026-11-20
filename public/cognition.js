// Lightweight personal cognition: instincts and indexed episodic recall.
// The simulation is authoritative; no remembered event can mutate inventory.
(function(root){
 'use strict';
 const STOP=new Set(['the','and','with','from','some','that','this','was','for','into','are','has','have','your','where','near','what','when','then','very','there']);
 const terms=text=>[...new Set(String(text||'').toLowerCase().match(/[a-z][a-z0-9_]{2,}/g)||[])]
  .filter(t=>!STOP.has(t));
 const bound=(x,a,b)=>Math.max(a,Math.min(b,x));
 function memoryEntry(n,text,clock,meta){
  const time=Number.isFinite(clock)?clock:0;
  const kind=['event','success','failure','observation','conversation','need'].includes(meta.kind)?
   meta.kind:'event';
  return {text:String(text).slice(0,180),at:time,kind,
   action:String(meta.action||'').slice(0,40),ref:String(meta.ref||'').slice(0,80),
   x:Number.isInteger(n.x)?n.x:0,y:Number.isInteger(n.y)?n.y:0,
   salience:bound(Number(meta.salience)||1,1,5)};
 }
 function record(n,text,clock,meta={}){
  if(!Array.isArray(n.memories))n.memories=[];
  const entry=memoryEntry(n,text,clock,meta);
  const last=n.memories[n.memories.length-1];
  if(last&&last.text===entry.text&&last.action===entry.action&&
   last.ref===entry.ref&&entry.at>=last.at&&entry.at-last.at<12){
   last.at=entry.at;last.salience=Math.max(last.salience,entry.salience);
   return last;
  }
  n.memories.push(entry);
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
   const dx=Math.abs((n.x||0)-(m.x||0))%root.Frontier.WIDTH;
   const dy=Math.abs((n.y||0)-(m.y||0))%root.Frontier.HEIGHT;
   const distance=Math.min(dx,root.Frontier.WIDTH-dx)+
    Math.min(dy,root.Frontier.HEIGHT-dy);
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
   const item=memoryEntry(n,m.text,m.at,m);
   if(Number.isInteger(m.x))item.x=m.x;
   if(Number.isInteger(m.y))item.y=m.y;
   if(typeof m.time==='string')item.time=m.time.slice(0,80);
   n.memories.push(item);
  }
 }
 // Fast involuntary responses. A threat overrides low-priority jobs, never
 // fabricates resources. The caller checks reachable legal actions first.
 function instinct(n,options){
  const keys=new Set(options.map(o=>o.key));
  const choose=(...actions)=>actions.find(k=>keys.has(k))||null;
  const hydration=n.bio?.hydrationBudgetMl??2400;
  // Stock and drink early enough to survive travel, gathering and sleep.
  // No water is created: every choice must still be a legal world affordance.
  if(n.needs.thirst>=62||hydration<1200){
   const water=choose(n.inventory.water>0?'drink':'drink_source',
    'drink_source','fill_water','drink');
   if(water)return water;
   if(n.energy>=18&&keys.has('explore'))return 'explore';
  }
  if(n.inventory.water<2&&hydration<1600){
   const reserve=choose('fill_water');
   if(reserve)return reserve;
  }
  if(n.needs.hunger>=85||n.bio?.longTermKcal<150){
   const food=choose(n.inventory.food>0?'eat':'forage','forage','eat');
   if(food)return food;
   // If all arms are occupied, put down raw burden rather than starving
   // despite having a nearby physical food source.
   const drop=choose('drop_fiber','drop_stone','drop_wood');
   if(drop)return drop;
  }
  if(n.energy<=18)return choose('rest');
  return null;
 }

 const ATTENTION_COOLDOWN=30,ATTENTION_LIFETIME=180,MAX_CUES=8;
 function attentionState(n){
  return n.attention ||= {reviewedThrough:0,reviewedAt:null,requestedAt:null};
 }
 function restoreAttention(n,saved,clock){
  if(!saved)return;
  const sequence=n.evidenceMemory?.sequence||0;
  const time=value=>Number.isFinite(value)&&value>=0&&value<=clock?value:null;
  n.attention={
   reviewedThrough:Number.isSafeInteger(saved.reviewedThrough)&&saved.reviewedThrough>=0?
    Math.min(saved.reviewedThrough,sequence):0,
   reviewedAt:time(saved.reviewedAt),requestedAt:time(saved.requestedAt)
  };
 }
 function attentionCue(n,clock,checkCooldown=true){
  const a=n.attention,seen=a?.reviewedThrough||0;
  if(checkCooldown&&a?.requestedAt!=null&&clock-a.requestedAt<ATTENTION_COOLDOWN)return null;
  const m=n.evidenceMemory;
  if(m?.sequence>seen){
   const episodes=new Map(m.episodes.map(e=>[e.id,e]));
   const inbox=new Map();
   const add=(kind,key,sourceId,subject)=>{
    const source=episodes.get(sourceId);
    if(!source||source.at>clock||clock-source.at>=ATTENTION_LIFETIME)return;
    const sequence=Number(sourceId.slice(3));
    if(sequence<=seen)return;
    inbox.set(key,{kind,sourceId,subject,at:source.at,sequence});
    if(inbox.size>MAX_CUES){
     const oldest=[...inbox].reduce((a,b)=>a[1].sequence<=b[1].sequence?a:b);
     inbox.delete(oldest[0]);
    }
   };
   const lastStock=new Map(),lastInspection=new Map();
   for(const fact of m.facts){
    if(fact.key!=='stock'||fact.certainty!=='observed')continue;
    const source=episodes.get(fact.sourceEpisodeId);
    if(source?.type!=='inspection'||source.certainty!=='observed')continue;
    const available=Number(fact.value)>0;
    const ref=fact.entityId;
    const sequence=Number(source.id.slice(3));
    lastInspection.set(ref,Math.max(sequence,lastInspection.get(ref)??0));
    const previous=lastStock.get(ref);
    lastStock.set(ref,available);
    if(previous===available)continue;
    const key='stock:'+ref;
    inbox.delete(key);
    add(available?'source found':'source depleted',key,source.id,ref);
   }
   const reports=new Set();
   for(const claim of m.claims){
    const key='report:'+claim.sourceId;
    // A witnessed result supersedes rumors of the same source. Repeating a
    // report without a new firsthand observation is one cue, not a new call.
    const speech=episodes.get(claim.speechEpisodeId);
    if(claim.status!=='unverified'||reports.has(key)||speech?.type!=='interaction'||
     speech.certainty!=='reported'||speech.at>clock||
     clock-speech.at>=ATTENTION_LIFETIME||
     (lastInspection.get(claim.sourceId)??0)>=Number(speech.id.slice(3)))continue;
    reports.add(key);
    add('unverified resource report',key,speech.id,claim.sourceId);
   }
   for(const method of m.methods)
    add(method.provenance==='instruction'?'method taught':'method discovered',
     'method:'+method.method,method.sourceEpisodeId,method.method);
   const cue=[...inbox.values()].sort((x,y)=>y.sequence-x.sequence)[0];
   if(cue)return cue;
  }
  return a?.reviewedAt!=null?null:{kind:'initial review',sourceId:null,subject:null,sequence:0};
 }
 function attentionReviewed(n,clock,sequence){
  const a=attentionState(n);
  a.reviewedAt=clock;
  a.reviewedThrough=Math.max(a.reviewedThrough,sequence);
 }
 root.Cognition={record,recall,recentFailure,restore,instinct,attentionState,restoreAttention,attentionCue,attentionReviewed};
})(globalThis);
