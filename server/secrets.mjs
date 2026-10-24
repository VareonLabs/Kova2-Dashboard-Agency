import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const service = 'com.vareonhq.local-dashboard';
// macOS Keychain holds credentials. Business records never contain tokens.
const helperPath=()=>process.env.VAREON_KEYCHAIN_HELPER||resolve(import.meta.dirname,'../build-resources/keychain-helper');
export async function readSecret(account) {
  if(!/^[a-z0-9_-]+$/.test(account))return null;
  const helper=helperPath();
  if(existsSync(helper))try{const {stdout}=await exec(helper,['--read',account+'-v2'],{timeout:30000,maxBuffer:8000000});return Buffer.from(stdout,'base64').toString('utf8');}catch{}
  // The failed legacy Outlook/GPT items may contain truncated JSON. A fresh OAuth
  // sign-in replaces them in the new native vault; do not try to reuse them.
  if(['outlook','chatgpt-plan'].includes(account))return null;
  try{const {stdout}=await exec('/usr/bin/security',['find-generic-password','-s',service,'-a',account,'-w'],{timeout:30000,maxBuffer:8000000});return Buffer.from(stdout.trim(),'base64').toString('utf8');}catch{return null;}
}
export async function writeSecret(account, value) {
  if (!/^[a-z0-9_-]+$/.test(account)) throw new Error('Invalid credential name');
  const encoded = Buffer.from(value).toString('base64');
  const helper=helperPath();
  if(!existsSync(helper))throw new Error('The secure Keychain writer is missing. Reopen the updated VareonHQ app.');
  await new Promise((resolveResult,reject)=>{
    const child=spawn(helper,[account+'-v2'],{stdio:['pipe','ignore','pipe']});let error='';
    child.stderr.on('data',chunk=>{error+=chunk.toString().slice(0,1000);});
    const timer=setTimeout(()=>child.kill(),30000);child.on('error',()=>reject(new Error('The secure Keychain writer could not start.')));
    child.stdin.on('error',()=>{});
    child.on('close',code=>{clearTimeout(timer);code===0?resolveResult():reject(new Error('Could not save the credential to macOS Keychain. '+(error.trim()||'Unlock your login Keychain, then reconnect.')));});
    child.stdin.end(encoded);
  });
  if(await readSecret(account)!==value)throw new Error('macOS Keychain did not save this credential. Allow Keychain access and try again.');
}
export async function deleteSecret(account) {for(const name of [account+'-v2',account])try{await exec('/usr/bin/security',['delete-generic-password','-s',service,'-a',name],{timeout:10000});}catch{}}
