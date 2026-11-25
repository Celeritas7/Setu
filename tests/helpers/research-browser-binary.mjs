import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const CHROME_VERSION='151.0.7922.34';
export const CHROME_URL='https://storage.googleapis.com/chrome-for-testing-public/'+CHROME_VERSION+'/linux64/chrome-headless-shell-linux64.zip';
export const CHROME_ARCHIVE_SHA256='3cfc2bd00d1bafcf8a68dc74c9c92bb7150ddc8d26ade948a776316e1cec4f14';
export const CHROME_BINARY_SHA256='e11fc9ce65c96313476f7ee9844b6fb6a9220fb048693cfe9eee00acf4170a9f';
export const chromeRoot=fileURLToPath(new URL('../../node_modules/.cache/setu-research-browser/',import.meta.url));
export const chromePath=fileURLToPath(new URL('../../node_modules/.cache/setu-research-browser/chrome-headless-shell-linux64/chrome-headless-shell',import.meta.url));
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifiedChrome(){
  if(process.platform!=='linux'||process.arch!=='x64')throw Error('The pinned browser rehearsal supports Linux x64 only.');
  let bytes;try{bytes=await readFile(chromePath);}catch{throw Error('Run npm run setup:research-browser to prepare the pinned local browser.');}
  if(digest(bytes)!==CHROME_BINARY_SHA256)throw Error('Local browser checksum mismatch. Run its setup again.');
  return chromePath;
}
