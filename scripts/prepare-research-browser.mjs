// Explicit development setup; no app runtime, credentials or database access.
import {mkdtemp,mkdir,readFile,rm,cp,chmod} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {CHROME_VERSION,CHROME_URL,CHROME_ARCHIVE_SHA256,chromeRoot,chromePath,digest,verifiedChrome} from '../tests/helpers/research-browser-binary.mjs';
const exec=promisify(execFile);
if(process.platform!=='linux'||process.arch!=='x64')throw Error('Pinned browser setup requires Linux x64.');
try{await verifiedChrome();console.log('Verified cached Chrome for Testing '+CHROME_VERSION);}
catch{
  const root=await mkdtemp(join(tmpdir(),'setu-chrome-setup-'));
  try{
    const archive=join(root,'chrome.zip');
    await exec('curl',['--fail','--location','--silent','--show-error','--connect-timeout','10','--max-time','180','--output',archive,CHROME_URL],{timeout:185000,maxBuffer:8192});
    if(digest(await readFile(archive))!==CHROME_ARCHIVE_SHA256)throw Error('Official Chrome archive checksum mismatch.');
    const entries=(await exec('unzip',['-Z','-1',archive],{maxBuffer:1024*1024})).stdout.trim().split('\n');
    if(entries.some(path=>!path.startsWith('chrome-headless-shell-linux64/')||path.split('/').includes('..')))throw Error('Unexpected browser archive paths.');
    await exec('unzip',['-q',archive,'-d',root]);
    await mkdir(chromeRoot,{recursive:true});await cp(join(root,'chrome-headless-shell-linux64'),join(chromeRoot,'chrome-headless-shell-linux64'),{recursive:true});
    await chmod(chromePath,0o700);await verifiedChrome();console.log('Prepared checksum-verified Chrome for Testing '+CHROME_VERSION);
  }finally{await rm(root,{recursive:true,force:true});}
}
