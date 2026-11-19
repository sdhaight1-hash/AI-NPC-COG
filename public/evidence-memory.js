// G2.2: private, source-backed experience ledger and bounded semantic summaries.
// It never changes world state, procedures, inventory or physical authority.
(function(root){
 'use strict';
 const MAX_EPISODES=240,MAX_FACTS=120,MAX_SUMMARIES=36;
 const words=s=>String(s||'').toLowerCase().match(/[a-z][a-z0-9_]{2,}/g)||[];
 const unique=s=>[...new Set(words(s))];
 const empty=()=>({sequence:0,episodes:[],facts:[],summaries:[],methods:[],social:[],lastDay:0});
 const state=n=>n.evidenceMemory ||=empty();
 const clone=x=>JSON.parse(JSON.stringify(x));
 const kinds=new Set(['action','inspection','interaction','sound','personal']);
 function sourceReceipt(sim,n,receiptId){
  if(typeof receiptId!=='string')return null;
  return (sim.receipts||[]).find(x=>x.id===receiptId&&
   x.actorId===n.id&&x.status==='COMPLETED')||null;
 }
 function record(sim,n,{type='action',text='',receiptId=null,ref=null,
  salience=2,fact=null}={}){
  if(!kinds.has(type)||typeof text!=='string'||!text.trim())return null;
  const receipt=sourceReceipt(sim,n,receiptId);
  // Evidence is captured at physical commitment, not replayed from an old
  // receipt after the actor or target may have moved or changed.
  if(receipt&&(receipt.clock!==sim.clock||
   state(n).episodes.some(e=>e.receiptId===receipt.id)))return null;
  if((type==='action'||type==='inspection'||fact)&&!receipt)return null;
  if(receipt&&(type==='action'||type==='inspection')){
   if(type==='inspection'){
    if(receipt.action!=='inspect'||receipt.targetId!==ref)return null;
    const observed=root.Perception?.inspect(sim,n,ref);
    if(!observed)return null;
    // Caller-supplied descriptions and facts never become witnessed truth.
    text='Inspected '+observed.kind+' at '+observed.x+','+observed.y;
    fact=Number.isInteger(observed.stock)?{key:'stock',value:observed.stock}:null;
   }else{
    if(receipt.action==='inspect')return null;
    text='Completed '+String(receipt.action||'').slice(0,48);
    fact=null;
    ref=receipt.targetId??null;
   }
  }else if(fact)return null;
  const memory=state(n);
  const entry={id:'ev_'+(++memory.sequence),type,text:text.slice(0,180),
   at:sim.clock,ref:typeof ref==='string'?ref.slice(0,100):null,
   receiptId:receipt?.id||null,certainty:receipt&&
    (type==='action'||type==='inspection')?'observed':'reported',
   salience:Math.max(1,Math.min(5,Number(salience)||2)),
   location:{x:n.x,y:n.y,z:n.z||0}};
  memory.episodes.push(entry);
  memory.episodes=memory.episodes.slice(-MAX_EPISODES);
  if(fact&&typeof fact.key==='string'&&
   ['stock','condition','material','location'].includes(fact.key)&&
   typeof fact.value!=='object'){
   const val=String(fact.value).slice(0,80);
   // Never overwrite conflicting firsthand evidence: keep separate
   // observations, timestamps, entity and source-receipt identities.
   memory.facts.push({id:'fact_'+entry.id,entityId:entry.ref,key:fact.key,
    value:val,at:entry.at,sourceEpisodeId:entry.id,
    receiptId:entry.receiptId,certainty:'observed'});
   memory.facts=memory.facts.slice(-MAX_FACTS);
  }
  return clone(entry);
 }
 function fromReceipt(sim,n,receipt){
  if(!receipt||receipt.actorId!==n.id||receipt.status!=='COMPLETED')return null;
  // Idempotency: replays or repeated hook execution cannot create evidence twice.
  if(state(n).episodes.some(e=>e.receiptId===receipt.id))return null;
  const action=String(receipt.action||'').slice(0,48);
  let fact=null;
  let text='Completed '+action;
  if(action==='inspect'){
   const observed=root.Perception?.inspect(sim,n,receipt.targetId);
   if(observed){
    text='Inspected '+observed.kind+' at '+observed.x+','+observed.y;
    if(Number.isInteger(observed.stock))fact={key:'stock',value:observed.stock};
   }
  }
  const entry=record(sim,n,{type:action==='inspect'?'inspection':'action',
   text,receiptId:receipt.id,ref:receipt.targetId,
   salience:action==='inspect'?4:2,fact});
  if(!entry)return null;
  const m=state(n);
  for(const method of receipt.delta?.knowledge?.learnedMethods||[]){
   if(typeof method!=='string'||!n.knowledge?.recipes?.includes(method)||
    m.methods.some(x=>x.method===method))continue;
   m.methods.push({method:method.slice(0,64),sourceEpisodeId:entry.id,
    receiptId:receipt.id,at:sim.clock});
  }
  m.methods=m.methods.slice(-80);
  if(['share_food','socialize'].includes(action)&&
   typeof receipt.targetId==='string'){
   m.social.push({actorId:receipt.targetId,
    action,at:sim.clock,sourceEpisodeId:entry.id,receiptId:receipt.id});
   m.social=m.social.slice(-80);
  }
  return entry;
 }
 function recall(n,query,clock,limit=5){
  const items=state(n).episodes;
  if(!items.length)return [];
  const q=unique(query),docCount=items.length;
  const documents=items.map(e=>unique(e.text+' '+(e.ref||'')+' '+e.type));
  const freq=new Map();
  for(const doc of documents)for(const word of doc)freq.set(word,(freq.get(word)||0)+1);
  const results=items.map((e,i)=>{
   const doc=documents[i];
   const overlap=q.reduce((sum,term)=>{
    if(!doc.includes(term))return sum;
    const df=freq.get(term)||0;
    return sum+Math.log(1+(docCount-df+.5)/(df+.5))*9;
   },0);
   const entity=q.some(term=>e.ref&&words(e.ref).includes(term))?12:0;
   const age=Math.max(0,clock-e.at);
   const recency=1/(1+age/1440);
   return {entry:e,score:overlap+entity+e.salience*.8+recency};
  });
  results.sort((a,b)=>b.score-a.score||b.entry.at-a.entry.at||
   a.entry.id.localeCompare(b.entry.id));
  return results.slice(0,Math.max(0,Math.min(8,limit)))
   .map(row=>({...clone(row.entry),relevance:Math.round(row.score*100)/100}));
 }
 function consolidate(sim,n){
  const m=state(n),day=Math.floor(sim.clock/1440);
  if(day<=m.lastDay)return 0;
  let count=0;
  // At most one factual, evidence-linked summary per elapsed day.
  const start=Math.max(m.lastDay,day-1)*1440;
  const daily=m.episodes.filter(e=>e.at>=start&&e.at<day*1440&&e.receiptId);
  if(daily.length){
   const important=[...daily].sort((a,b)=>b.salience-a.salience||
    b.at-a.at).slice(0,4);
   const id='summary_'+day;
   if(!m.summaries.some(s=>s.id===id)){
    m.summaries.push({id,at:day*1440,
     text:'Remembered physical work: '+important.map(e=>e.text).join('; ').slice(0,400),
     sourceEpisodeIds:important.map(e=>e.id),
     certainty:'inferred'});
    count++;
   }
  }
  m.summaries=m.summaries.slice(-MAX_SUMMARIES);
  m.lastDay=day;
  return count;
 }
 function restore(n,saved,clock,legacyMemories=null){
  const result=empty();
  if(saved&&typeof saved==='object'){
   const entries=Array.isArray(saved.episodes)?saved.episodes.slice(-MAX_EPISODES):[];
   const seen=new Set();
   for(const e of entries){
    if(!e||typeof e.id!=='string'||!/^ev_[1-9]\d*$/.test(e.id)||
     seen.has(e.id)||!kinds.has(e.type)||typeof e.text!=='string'||
     !Number.isFinite(e.at)||e.at>clock||e.at<0||
     !['observed','reported'].includes(e.certainty))continue;
    seen.add(e.id);
    result.episodes.push({id:e.id,type:e.type,text:e.text.slice(0,180),
     at:e.at,ref:typeof e.ref==='string'?e.ref.slice(0,100):null,
     receiptId:typeof e.receiptId==='string'?e.receiptId:null,
     certainty:e.certainty,salience:Math.max(1,Math.min(5,Number(e.salience)||2)),
     location:{x:Number.isInteger(e.location?.x)?e.location.x:n.x,
      y:Number.isInteger(e.location?.y)?e.location.y:n.y,
      z:Number.isInteger(e.location?.z)?e.location.z:(n.z||0)}});
   }
   result.sequence=Math.max(0,...result.episodes.map(e=>Number(e.id.slice(3))),
    Number.isSafeInteger(saved.sequence)?saved.sequence:0);
   const episodeIds=new Set(result.episodes.map(e=>e.id));
   result.facts=(Array.isArray(saved.facts)?saved.facts:[]).filter(f=>
    f&&typeof f.id==='string'&&typeof f.entityId==='string'&&
    ['stock','condition','material','location'].includes(f.key)&&
    typeof f.value==='string'&&episodeIds.has(f.sourceEpisodeId)&&
    typeof f.receiptId==='string'&&Number.isFinite(f.at)&&f.at<=clock)
    .slice(-MAX_FACTS).map(f=>({id:f.id,entityId:f.entityId.slice(0,100),
     key:f.key,value:f.value.slice(0,80),at:f.at,
     sourceEpisodeId:f.sourceEpisodeId,receiptId:f.receiptId,certainty:'observed'}));
   result.summaries=(Array.isArray(saved.summaries)?saved.summaries:[])
    .filter(s=>s&&typeof s.id==='string'&&typeof s.text==='string'&&
     Number.isFinite(s.at)&&s.at<=clock&&Array.isArray(s.sourceEpisodeIds)&&
     s.sourceEpisodeIds.length>0&&
     s.sourceEpisodeIds.every(id=>episodeIds.has(id)))
    .slice(-MAX_SUMMARIES).map(s=>({id:s.id,at:s.at,
     text:s.text.slice(0,400),sourceEpisodeIds:s.sourceEpisodeIds.slice(0,4),
     certainty:'inferred'}));
   result.methods=(Array.isArray(saved.methods)?saved.methods:[])
    .filter(x=>x&&typeof x.method==='string'&&
     typeof x.receiptId==='string'&&episodeIds.has(x.sourceEpisodeId)&&
     Number.isFinite(x.at)&&x.at<=clock)
    .slice(-80).map(x=>({method:x.method.slice(0,64),
     sourceEpisodeId:x.sourceEpisodeId,receiptId:x.receiptId,at:x.at}));
   result.social=(Array.isArray(saved.social)?saved.social:[])
    .filter(x=>x&&typeof x.actorId==='string'&&
     ['share_food','socialize'].includes(x.action)&&
     typeof x.receiptId==='string'&&episodeIds.has(x.sourceEpisodeId)&&
     Number.isFinite(x.at)&&x.at<=clock)
    .slice(-80).map(x=>({actorId:x.actorId.slice(0,100),
     action:x.action,at:x.at,sourceEpisodeId:x.sourceEpisodeId,
     receiptId:x.receiptId}));
   result.lastDay=Number.isSafeInteger(saved.lastDay)?
    Math.max(0,Math.min(Math.floor(clock/1440),saved.lastDay)):0;
  }
  // Legacy v3 memories have no verified receipt provenance. Keep their
  // recollections useful but mark them reported; never derive factual claims.
  if(!saved&&Array.isArray(legacyMemories)){
   for(const m of legacyMemories.slice(-MAX_EPISODES)){
    if(!m||typeof m.text!=='string'||!Number.isFinite(m.at)||
     m.at<0||m.at>clock)continue;
    result.episodes.push({id:'ev_'+(++result.sequence),type:'personal',
     text:m.text.slice(0,180),at:m.at,
     ref:typeof m.ref==='string'?m.ref.slice(0,100):null,
     receiptId:null,certainty:'reported',
     salience:Math.max(1,Math.min(5,Number(m.salience)||1)),
     location:{x:Number.isInteger(m.x)?m.x:n.x,
      y:Number.isInteger(m.y)?m.y:n.y,z:n.z||0}});
   }
   result.episodes=result.episodes.slice(-MAX_EPISODES);
  }
  n.evidenceMemory=result;
  return result;
 }
 function working(n){
  return {task:n.task?.key||null,commandId:n.task?.commandId||null,
   goal:n.project?.goal||n.plan?.key||n.agency?.goal?.key||null,
   remainingMinutes:n.currentActivity?
    Math.max(0,n.currentActivity.workRequired-n.currentActivity.workDone):null};
 }
 root.EvidenceMemory={state,record,fromReceipt,recall,consolidate,restore,working,
  MAX_EPISODES,MAX_FACTS,MAX_SUMMARIES};
})(globalThis);
