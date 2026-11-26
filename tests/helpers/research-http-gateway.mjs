// Real PostgREST + signed test JWTs. The small identity route is a fixture,
// not a Supabase Auth/GoTrue server or a production reverse proxy.
import assert from 'node:assert/strict';
import {createServer as httpServer} from 'node:http';
import {createServer as tcpServer} from 'node:net';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT,jwtVerify} from 'jose';
import {createClient} from '@supabase/supabase-js';
import {freshPostgres} from './research-native-postgres.mjs';
import {verifiedPostgrest,sha256} from './research-postgrest-binary.mjs';
import {A,B,cloud,Store} from './research-cloud-fixture.mjs';

async function port(){const s=tcpServer();await new Promise((yes,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',yes);});const p=s.address().port;await new Promise(yes=>s.close(yes));return p;}
async function stop(child){
  if(!child?.pid||child.exitCode!==null||child.signalCode!==null)return;
  const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
  const timer=setTimeout(()=>child.kill('SIGKILL'),3000);try{await done;}finally{clearTimeout(timer);}
}

export async function freshResearchApi({prepareDatabase}={}){
  const binary=await verifiedPostgrest(),db=await freshPostgres();
  const logs=[],requests=[],control={dropCommitResponses:false,swapCommitToken:null,identityFailure:false,afterCommit:null};
  let root,pgrstPort,child,front,connection,privateKey,publicKey,kid,jwk,spawnFailure;
  const clients=[];
  let issuer;
  async function token(owner=A,overrides={},key=privateKey){
    const now=Math.floor(Date.now()/1000);
    return new SignJWT({sub:owner,role:'authenticated',is_anonymous:false,aud:'authenticated',iss:issuer,
      iat:now,exp:now+600,...overrides}).setProtectedHeader({alg:'ES256',kid,typ:'JWT'}).sign(key);
  }
  async function close(){
    for(const sb of clients)await sb.auth.stopAutoRefresh();
    if(front?.listening){const done=new Promise((yes,no)=>front.close(e=>e?no(e):yes()));front.closeAllConnections();await done;}
    await stop(child);await db.close();if(root)await rm(root,{recursive:true,force:true});
  }
  try {
    root=await mkdtemp(join(tmpdir(),'setu-r4-api-'));pgrstPort=await port();
    ({privateKey,publicKey}=await generateKeyPair('ES256'));
    kid=randomUUID();jwk={...await exportJWK(publicKey),kid,alg:'ES256',use:'sig'};
    await db.admin.query('insert into auth.users values($1),($2)',[A,B]);
    await db.admin.query(await readFile(new URL('../../supabase/migrations/20261122065058_research_import_cloud.sql',import.meta.url),'utf8'));
    await db.admin.query(`create table public.akatsuki_places(id text primary key,user_id uuid not null,label text,aliases text[],retired_at timestamptz);
      create table public.akatsuki_shops(id bigint primary key,user_id uuid not null,name text);
      alter table public.akatsuki_places enable row level security;alter table public.akatsuki_shops enable row level security;
      revoke all on public.akatsuki_places,public.akatsuki_shops from anon,authenticated;
      grant select on public.akatsuki_places,public.akatsuki_shops to authenticated;
      create policy owner_read on public.akatsuki_places for select to authenticated using(user_id=auth.uid());
      create policy owner_read on public.akatsuki_shops for select to authenticated using(user_id=auth.uid());`);
    if (prepareDatabase) await prepareDatabase(db.admin);
    connection=await db.gatewayConnection();assert.equal(connection.host,'127.0.0.1');
    const uri=new URL('postgresql://127.0.0.1:'+connection.port+'/'+connection.database);
    uri.username=connection.user;uri.password=connection.password;
    const jwksFile=join(root,'jwks.json'),configFile=join(root,'postgrest.conf');
    await writeFile(jwksFile,JSON.stringify({keys:[jwk]}),{mode:0o600});
    await writeFile(configFile,[
      'db-uri = '+JSON.stringify(uri.href),'db-schemas = "public"','db-anon-role = "anon"',
      'db-config = false','db-max-rows = 2','db-pool = 4',
      'jwt-secret = '+JSON.stringify('@'+jwksFile),'jwt-aud = "authenticated"',
      'server-host = "127.0.0.1"','server-port = '+pgrstPort,'log-level = "error"',
    ].join('\n')+'\n',{mode:0o600});
    // Parent settings cannot replace this local URI, listener or signing keys.
    const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PGRST_')&&!/^PG[A-Z_]/.test(k)&&k!=='DATABASE_URL'));
    child=spawn(binary,[configFile],{env:{...env,GHCRTS:'-N1'},stdio:['ignore','pipe','pipe']});
    child.once('error',error=>{spawnFailure=error;logs.push(error.message);});
    for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{logs.push(bytes.toString());if(logs.length>30)logs.shift();});
    front=httpServer(async(req,res)=>{
      try {
        const path=new URL(req.url,'http://127.0.0.1').pathname;
        if(path==='/auth/v1/user'&&req.method==='GET'){
          if(control.identityFailure){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({message:'Identity fixture unavailable'}));return;}
          try {
            const bearer=req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
            const {payload}=await jwtVerify(bearer||'',publicKey,{algorithms:['ES256'],issuer,audience:'authenticated'});
            if(![A,B].includes(payload.sub))throw Error('Unknown fictional owner');
            res.writeHead(200,{'content-type':'application/json'});
            res.end(JSON.stringify({id:payload.sub,aud:'authenticated',role:payload.role,is_anonymous:payload.is_anonymous===true,
              app_metadata:{},user_metadata:{},created_at:'2026-11-25T00:00:00Z'}));
          }catch{res.writeHead(401,{'content-type':'application/json'});res.end(JSON.stringify({message:'Invalid test access token'}));}
          return;
        }
        if(!req.url.startsWith('/rest/v1/')){res.writeHead(404);res.end();return;}
        let size=0;const chunks=[];for await(const part of req){size+=part.length;if(size>27*1024*1024)throw Error('Test request too large');chunks.push(part);}
        const body=Buffer.concat(chunks),headers=new Headers();
        for(const [key,value] of Object.entries(req.headers))if(!['host','connection','content-length','transfer-encoding'].includes(key)&&value!==undefined)headers.set(key,String(value));
        const commit=path==='/rest/v1/rpc/setu_research_commit';
        if(commit&&control.swapCommitToken)headers.set('authorization','Bearer '+control.swapCommitToken);
        const entry={path:req.url,method:req.method,bodyHash:sha256(body),status:null,dropped:false};requests.push(entry);
        const response=await fetch('http://127.0.0.1:'+pgrstPort+req.url.slice('/rest/v1'.length),{
          method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body,signal:AbortSignal.timeout(15000),
        });
        const bytes=Buffer.from(await response.arrayBuffer());entry.status=response.status;
        if(commit&&response.ok&&control.afterCommit){const callback=control.afterCommit;control.afterCommit=null;await callback();}
        if(commit&&response.ok&&control.dropCommitResponses){entry.dropped=true;res.destroy();return;}
        for(const [key,value] of response.headers)if(!['connection','content-length','transfer-encoding','content-encoding'].includes(key))res.setHeader(key,value);
        res.statusCode=response.status;res.end(bytes);
      }catch{if(!res.destroyed){res.writeHead(502,{'content-type':'application/json'});res.end(JSON.stringify({message:'Local rehearsal proxy failure'}));}}
    });
    await new Promise((yes,no)=>{front.once('error',no);front.listen(0,'127.0.0.1',yes);});
    const url='http://127.0.0.1:'+front.address().port;issuer=url+'/auth/v1';
    const access=await token();let ready=false;
    const deadline=Date.now()+10000;
    while(Date.now()<deadline){
      if(spawnFailure)throw spawnFailure;
      if(child.exitCode!==null||child.signalCode!==null)throw Error('Local PostgREST exited before readiness.');
      try {const r=await fetch(url+'/rest/v1/rpc/setu_research_capabilities',{headers:{authorization:'Bearer '+access},signal:AbortSignal.timeout(700)});if(r.ok&&await r.json()==='4.0.0'){ready=true;break;}}catch{}
      await delay(40);
    }
    if(!ready)throw Error('Local PostgREST did not expose the R4 capability endpoint.');
    return {db,url,issuer,control,requests,token,
      async sdk(owner=A,claims={}){
        const sb=createClient(url,'synthetic-public-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'setu-rehearsal-'+randomUUID()},
          global:{fetch:(input,init)=>{assert.equal(new URL(input).origin,url,'Refuse any non-rehearsal API destination.');return fetch(input,init);}}});
        clients.push(sb);const jwt=await token(owner,claims);
        const {error}=await sb.auth.setSession({access_token:jwt,refresh_token:'synthetic-refresh-not-used'});assert.equal(error,null,error?.message);
        return {sb,jwt};
      },
      async client(payload,owner=A,publishEnabled=true){
        const {sb,jwt}=await this.sdk(owner),localStore=new Store(),outbox=new Store();
        const record=await localStore.write(payload.id,0,payload);let current=owner;
        const api=cloud.create({sb,owner,isCurrent:()=>current===owner,localStore,outbox,enabled:publishEnabled});
        return {api,sb,jwt,localStore,outbox,record,switchOwner:value=>{current=value;}};
      },
      async close(){await close();},
    };
  }catch(error){
    await close();
    const detail=logs.slice(-5).join('').replaceAll(connection?.password||'__no_password__','[temporary credential]');
    throw new Error('Isolated API setup failed: '+error.message+'\n'+detail,{cause:error});
  }
}
