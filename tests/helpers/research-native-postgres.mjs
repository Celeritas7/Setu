// A fresh, owned cluster only. There is deliberately no external connection URL.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {randomBytes} from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';

async function freePort() {
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const {port}=server.address();
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}

export async function freshPostgres() {
  assert.notEqual(process.getuid?.(),0,'Run the rehearsal as a normal user; it never creates a system user.');
  const root=await mkdtemp(join(tmpdir(),'setu-r4-')), directory=join(root,'data');
  const port=await freePort(), password=randomBytes(24).toString('hex');
  const database='setu_research_rehearsal', clients=new Set();
  const logs=[];
  const server=new EmbeddedPostgres({databaseDir:directory,port,user:'postgres',password,
    authMethod:'scram-sha-256',persistent:true,createPostgresUser:false,autoRehydrateSymlinks:true,
    initdbFlags:['--encoding=UTF8','--locale=C'],
    postgresFlags:['-h','127.0.0.1','-c','unix_socket_directories='],
    onLog:message=>{logs.push(String(message));if(logs.length>40)logs.shift();},
    onError:message=>{logs.push(String(message));if(logs.length>40)logs.shift();},
  });
  let started=false, admin;
  async function connect(user='postgres',db=database) {
    // Explicit parameters prevent PGHOST/PGDATABASE/PGOPTIONS/PGSSLMODE defaults.
    const client=new pg.Client({host:'127.0.0.1',port,user,password,database:db,ssl:false,
      options:'-c search_path=public',client_encoding:'UTF8',application_name:'setu-r4-rehearsal',
      connectionTimeoutMillis:5000,statement_timeout:10000,lock_timeout:7000,
      idle_in_transaction_session_timeout:15000});
    client.on('error',()=>{});await client.connect();clients.add(client);
    client.rehearsalPid=(await client.query('select pg_backend_pid() as pid')).rows[0].pid;
    return client;
  }
  async function owned(client) {
    const {rows:[row]}=await client.query("select current_setting('data_directory') as directory,current_database() as database,current_setting('server_version_num')::int as version");
    assert.equal(await realpath(row.directory),await realpath(directory),'Refuse a cluster we did not create.');
    assert.equal(Math.floor(row.version/10000),17,'The rehearsal requires PostgreSQL 17.');
    return row;
  }
  async function close() {
    await Promise.allSettled([...clients].map(client=>client.end()));clients.clear();
    // Never remove a live cluster's files if stopping it fails.
    if(started){await server.stop();started=false;}
    await rm(root,{recursive:true,force:true});
  }
  try {
    await server.initialise();await server.start();started=true;
    const bootstrap=await connect('postgres','postgres');await owned(bootstrap);
    await bootstrap.query('create database '+database);
    await bootstrap.end();clients.delete(bootstrap);
    admin=await connect();await owned(admin);
    await admin.query(await readFile(new URL('./research-native-baseline.sql',import.meta.url),'utf8'));
    for(const [name,role] of [['setu_actor','authenticated'],['setu_guest','anon']]) {
      // name/role are fixed and the generated password is hexadecimal.
      await admin.query(`create role ${name} login noinherit nosuperuser nobypassrls password '${password}'`);
      await admin.query(`grant ${role} to ${name}`);
    }
    const info=(await admin.query("select version() as version,current_setting('listen_addresses') as listen")).rows[0];
    assert.equal(info.listen,'127.0.0.1');
    return {admin,info,connect,close,
      async gatewayConnection(){
        // The URI is generated only from this cluster; no external URI is read.
        await admin.query(`create role setu_gateway login noinherit nocreatedb nocreaterole nosuperuser nobypassrls password '${password}'`);
        await admin.query('grant authenticated,anon to setu_gateway');
        return Object.freeze({host:'127.0.0.1',port,user:'setu_gateway',password,database});
      },
      async actor(owner,anonymous=false,role='authenticated') {
        assert.ok(['authenticated','anon'].includes(role));
        const client=await connect(role==='anon'?'setu_guest':'setu_actor');
        await client.query('set role '+role);
        await client.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[owner||'',JSON.stringify({is_anonymous:anonymous})]);
        return client;
      },
      async closeActors(){for(const client of [...clients])if(client!==admin){await client.end();clients.delete(client);}},
    };
  } catch(error) {
    // stop() needs a live process: handle failed start without deleting live files.
    if(!started && server.process && server.process.exitCode===null)started=true;
    await close();
    throw new Error('Disposable PostgreSQL setup failed: '+String(error?.message||error)+'\n'+logs.slice(-8).join(''),{cause:error});
  }
}
