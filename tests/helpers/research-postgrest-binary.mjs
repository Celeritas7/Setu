import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Official Linux x64 release asset; both archive and executable are pinned.
export const POSTGREST_VERSION='16.6';
export const POSTGREST_URL='https://github.com/PostgREST/postgrest/releases/download/v16.6/postgrest-v16.6-linux-static-x86-64.tar.xz';
export const ARCHIVE_SHA256='335ea29f00145705fb569b1268b9c8e53d062f8f6f9188192e92ea3781d2dca1';
export const BINARY_SHA256='b8ce4b8e51df68feb73d6b848a2798b76aaf0b15aee83a257a3c4acc9e228768';
export const binaryPath=fileURLToPath(new URL('../../node_modules/.cache/setu-research-api/postgrest',import.meta.url));
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifiedPostgrest(){
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('This pinned API rehearsal requires Linux x64. No external gateway fallback is allowed.');
  let bytes;
  try {bytes=await readFile(binaryPath);}catch{throw Error('Run npm run setup:research-api first to download the pinned local gateway.');}
  if(sha256(bytes)!==BINARY_SHA256)throw Error('PostgREST executable checksum mismatch. Run the setup command again.');
  return binaryPath;
}
