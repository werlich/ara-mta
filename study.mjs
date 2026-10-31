import {existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
export function createStudy(dataDir,ids,clock=Date.now){
 const path=join(dataDir,'progress.json');
 const db=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{users:{}};
 const views=new Map();
 function save(){writeFileSync(path+'.tmp',JSON.stringify(db),{mode:0o600});renameSync(path+'.tmp',path);}
 function summary(userId){return Object.fromEntries(ids.map(id=>[id,{opens:0,totalMs:0,...db.users[userId]?.[id]}]));}
 function open(userId,id,eventId){
  if(!ids.includes(id)||typeof eventId!=='string'||! /^[a-zA-Z0-9-]{16,64}$/.test(eventId))return null;
  const existing=views.get(userId);
  if(existing?.eventId===eventId)return{token:existing.token,stats:summary(userId)};
  const now=clock(),token=randomBytes(24).toString('hex');
  const user=db.users[userId]??=(Object.create(null));
  const stat=user[id]??={opens:0,totalMs:0};stat.opens++;stat.lastOpenedAt=new Date(now).toISOString();save();
  views.set(userId,{id,eventId,token,reported:0,lastSeen:now});
  return{token,stats:summary(userId)};
 }
 function pulse(userId,token,totalMs,closed=false){
  const v=views.get(userId);if(!v||v.token!==token)return null;
  if(!Number.isSafeInteger(totalMs)||totalMs<0||totalMs>86400000)return null;
  if(totalMs>=v.reported){
   const now=clock();const delta=Math.max(0,Math.min(totalMs-v.reported,now-v.lastSeen,30000));
   const stat=db.users[userId][v.id];stat.totalMs+=delta;v.reported=totalMs;v.lastSeen=now;
   if(delta)save();
  }
  if(closed)views.delete(userId);
  return summary(userId);
 }
 function remove(userId){const previous=db.users[userId];delete db.users[userId];try{save();}catch(error){if(previous)db.users[userId]=previous;throw error;}views.delete(userId);}
 return{summary,open,pulse,remove,forget:userId=>views.delete(userId)};
}
