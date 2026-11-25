// Opt-in development download. No database, API credentials or app changes.
import {mkdtemp,mkdir,readFile,rm,chmod,copyFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {POSTGREST_URL,POSTGREST_VERSION,ARCHIVE_SHA256,BINARY_SHA256,binaryPath,sha256,verifiedPostgrest} from '../tests/helpers/research-postgrest-binary.mjs';
const exec=promisify(execFile);
if(process.platform!=='linux'||process.arch!=='x64')throw Error('The pinned gateway download supports Linux x64 only.');
try {await verifiedPostgrest();console.log('Verified cached PostgREST '+POSTGREST_VERSION);}
catch {
  const temp=await mkdtemp(join(tmpdir(),'setu-pgrst-setup-'));
  try {
    const archive=join(temp,'release.tar.xz');
    await exec('curl',['--fail','--location','--silent','--show-error','--connect-timeout','10','--max-time','60','--output',archive,POSTGREST_URL],{timeout:65000,maxBuffer:8192});
    if(sha256(await readFile(archive))!==ARCHIVE_SHA256)throw Error('Official PostgREST archive checksum mismatch.');
    const listing=(await exec('tar',['-tJf',archive])).stdout.trim();
    if(listing!=='postgrest')throw Error('Unexpected gateway archive contents.');
    await exec('tar',['-xJf',archive,'-C',temp,'--no-same-owner','--no-same-permissions','postgrest']);
    const extracted=join(temp,'postgrest');
    if(sha256(await readFile(extracted))!==BINARY_SHA256)throw Error('PostgREST executable checksum mismatch.');
    await mkdir(dirname(binaryPath),{recursive:true});await copyFile(extracted,binaryPath);await chmod(binaryPath,0o700);
    await verifiedPostgrest();console.log('Prepared checksum-verified PostgREST '+POSTGREST_VERSION);
  } finally {await rm(temp,{recursive:true,force:true});}
}
