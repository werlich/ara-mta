import http from 'node:http';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {hashPassword,verifyPassword,allowed,validDate} from './security.mjs';
import {createStudy} from './study.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createApp(config){
 const dbPath=resolve(config.dataDir,'users.json');mkdirSync(config.dataDir,{recursive:true,mode:0o700});
 let db=JSON.parse(readFileSync(dbPath,'utf8')); const sessions=new Map(),attempts=new Map();
 const catalog=JSON.parse(readFileSync(join(root,'private/catalog.json'),'utf8'));
 const media=new Map(catalog.map(x=>[x.id,x]));
 const study=createStudy(config.dataDir,catalog.map(x=>x.id));
 const dummy={salt:'00'.repeat(16),hash:'00'.repeat(64)};
 const save=()=>{const tmp=dbPath+'.tmp';writeFileSync(tmp,JSON.stringify(db,null,2),{mode:0o600});renameSync(tmp,dbPath);};
 const cleanUser=u=>({id:u.id,name:u.name,username:u.username,role:u.role,expiresOn:u.expiresOn,active:u.active});
 const revoke=id=>{for(const [key,s]of sessions)if(s.id===id)sessions.delete(key);study.forget(id);};
 const json=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));};
 const cookie=(value,maxAge)=>`ara_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookies!==false?'; Secure':''}`;
 async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Envie dados JSON.');let raw='';for await(const b of req){raw+=b;if(Buffer.byteLength(raw)>16384)throw Error('Pedido muito grande.');}return JSON.parse(raw||'{}');}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  try{
   const url=new URL(req.url,'http://localhost'),path=url.pathname;
   if(req.method==='POST'){
    const expected=config.origin||`http://${req.headers.host}`;
    if(req.headers.origin!==expected){json(res,403,{error:'Origem não autorizada.'});return;}
   }
   const sid=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ara_session='))?.slice(12);
   const session=sessions.get(sid);let user=session&&session.until>Date.now()?db.users.find(x=>x.id===session.id):null;
   if(!allowed(user)){user=null;if(sid)sessions.delete(sid);}
   if(path==='/api/login'&&req.method==='POST'){
    const ip=config.trustProxy?(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
    const now=Date.now();for(const [k,v]of attempts)if(v.reset<now)attempts.delete(k);
    if(attempts.size>10000){json(res,429,{error:'Tente novamente mais tarde.'});return;}
    const rate=attempts.get(ip)||{count:0,reset:now+15*60e3};
    if(rate.count>=10){json(res,429,{error:'Muitas tentativas. Aguarde 15 minutos.'});return;}
    rate.count++;attempts.set(ip,rate);
    const b=await body(req);const username=String(b.username||'').trim().toLowerCase();const password=String(b.password||'');
    const found=db.users.find(x=>x.username===username);
    if(password.length>256||!await verifyPassword(password,found?.password||dummy)||!allowed(found)){
     json(res,401,{error:'Dados incorretos ou acesso encerrado. Consulte seu instrutor.'});return;
    }
    attempts.delete(ip);revoke(found.id);const token=randomBytes(32).toString('hex');sessions.set(token,{id:found.id,until:Date.now()+12*3600e3});
    res.setHeader('Set-Cookie',cookie(token,12*3600));json(res,200,cleanUser(found));return;
   }
   if(path==='/api/logout'&&req.method==='POST'){sessions.delete(sid);res.setHeader('Set-Cookie',cookie('',0));json(res,200,{ok:true});return;}
   if(path.startsWith('/api/')){
    if(!user){json(res,401,{error:'Sua sessão ou seu acesso terminou. Entre novamente ou consulte o instrutor.'});return;}
    if(path==='/api/me'&&req.method==='GET'){json(res,200,cleanUser(user));return;}
    if(path==='/api/whiteboard'&&req.method==='GET'){
     if(user.role!=='admin'){json(res,403,{error:'Lousa exclusiva do instrutor.'});return;}
     const bytes=await readFile(join(root,'public/whiteboard.png'));res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length});res.end(bytes);return;
    }
    if(path==='/api/catalog'&&req.method==='GET'){json(res,200,catalog.map(({file,...x})=>x));return;}
    if(path==='/api/study'&&req.method==='GET'){json(res,200,study.summary(user.id));return;}
    if(path.startsWith('/api/study/student/')&&req.method==='GET'){
     if(user.role!=='admin'){json(res,403,{error:'Acesso exclusivo do instrutor.'});return;}
     const id=path.slice('/api/study/student/'.length);
     if(!db.users.some(x=>x.id===id&&x.role==='student')){json(res,404,{error:'Aluno não encontrado.'});return;}
     json(res,200,study.summary(id));return;
    }
    if((path==='/api/study/open'||path==='/api/study/pulse')&&req.method==='POST'){
     if(user.role!=='student'){json(res,403,{error:'Somente o estudo do aluno é contabilizado.'});return;}
     const b=await body(req);
     const result=path.endsWith('/open')?study.open(user.id,b.id,b.eventId):study.pulse(user.id,b.token,b.totalMs,b.closed===true);
     if(!result){json(res,409,{error:'Registro de estudo inválido ou substituído por outra ficha aberta.'});return;}
     json(res,200,result);return;
    }
    if(path.startsWith('/api/media/')&&req.method==='GET'){
     const item=media.get(path.slice(11));if(!item){json(res,404,{error:'Ficha não encontrada.'});return;}
     const bytes=await readFile(join(root,'private',url.searchParams.get('thumb')==='1'?'thumbs':'media',item.file));
     res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Content-Disposition':'inline'});res.end(bytes);return;
    }
    if(path.startsWith('/api/students')){
     if(user.role!=='admin'){json(res,403,{error:'Acesso exclusivo do instrutor.'});return;}
     if(path==='/api/students'&&req.method==='GET'){json(res,200,db.users.filter(x=>x.role==='student').map(cleanUser));return;}
     const deletion=path.match(/^\/api\/students\/([^/]+)\/delete$/);
     if(deletion&&req.method==='POST'){
      const index=db.users.findIndex(x=>x.id===deletion[1]&&x.role==='student');
      if(index<0){json(res,404,{error:'Aluno não encontrado.'});return;}
      const removed=db.users[index];db.users.splice(index,1);
      try{save();}catch(error){db.users.splice(index,0,removed);throw error;}
      revoke(removed.id);study.remove(removed.id);
      json(res,200,{ok:true});return;
     }
     if(req.method==='POST'){
      const id=path==='/api/students'?null:path.slice('/api/students/'.length);
      const old=id&&db.users.find(x=>x.id===id&&x.role==='student');if(id&&!old){json(res,404,{error:'Aluno não encontrado.'});return;}
      const b=await body(req);const name=String(b.name||'').trim(),username=String(b.username||'').trim().toLowerCase();
      if(name.length<2||name.length>100||! /^[a-z0-9._-]{3,64}$/.test(username)||!validDate(b.expiresOn)||typeof b.active!=='boolean'){
       json(res,400,{error:'Preencha nome, usuário (3–64 letras/números sem espaços) e uma data válida.'});return;
      }
      if(db.users.some(x=>x.username===username&&x.id!==id)){json(res,409,{error:'Esse usuário já existe.'});return;}
      const password=String(b.password||'');if((!old||password)&& (password.length<10||password.length>128)){json(res,400,{error:'Use uma senha de 10 a 128 caracteres.'});return;}
      const record={id:id||randomUUID(),role:'student',name,username,active:b.active,expiresOn:b.expiresOn,password:password?await hashPassword(password):old.password};
      // Recheck after asynchronous password derivation to prevent duplicate simultaneous requests.
      if(db.users.some(x=>x.username===username&&x.id!==id)){json(res,409,{error:'Esse usuário já existe.'});return;}
      if(old)db.users[db.users.findIndex(x=>x.id===id)]=record;else db.users.push(record);save();if(old)revoke(id);
      json(res,200,cleanUser(record));return;
     }
    }
    json(res,404,{error:'Recurso não encontrado.'});return;
   }
   const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/annotations.js':'annotations.js','/annotation-state.js':'annotation-state.js','/starboard-banner.png':'starboard-banner.png'};
   if(req.method==='GET'&&Object.hasOwn(files,path)){
    const types={'index.html':'text/html; charset=utf-8','app.js':'text/javascript; charset=utf-8','styles.css':'text/css; charset=utf-8','annotations.js':'text/javascript; charset=utf-8','annotation-state.js':'text/javascript; charset=utf-8','starboard-banner.png':'image/png'};
    const bytes=await readFile(join(root,'public',files[path]));res.writeHead(200,{'Content-Type':types[files[path]]});res.end(bytes);return;
   }
   json(res,404,{error:'Página não encontrada.'});
  }catch(error){json(res,error instanceof SyntaxError?400:500,{error:error instanceof SyntaxError?'Dados inválidos.':'Não foi possível concluir. Tente novamente.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 const cleanup=setInterval(()=>{for(const[k,s]of sessions)if(s.until<Date.now())sessions.delete(k);},60000);cleanup.unref();server.on('close',()=>clearInterval(cleanup));
 return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const path=process.env.APP_CONFIG||join(root,'data/config.json');
 if(!existsSync(path)){console.error('Configure antes com: npm run setup');process.exit(1);}
 const config=JSON.parse(readFileSync(path,'utf8'));createApp(config).listen(Number(process.env.PORT)||config.port||3000,process.env.HOST||config.host||'127.0.0.1',()=>console.log(`ARA · MTA em http://${config.host||'127.0.0.1'}:${config.port||3000}`));
}
