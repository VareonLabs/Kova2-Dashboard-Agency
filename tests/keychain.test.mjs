import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeSecret,readSecret,deleteSecret } from '../server/secrets.mjs';
test('native Keychain creates, reads and updates a long OAuth-sized credential',{skip:process.env.RUN_KEYCHAIN_TESTS!=='1'},async()=>{
 const account='qa-'+randomUUID(),value=JSON.stringify({synthetic:true,data:'test-oauth-data-'.repeat(16000)});
 try{await writeSecret(account,value);assert.equal(await readSecret(account),value);await writeSecret(account,value+' ');assert.equal(await readSecret(account),value+' ');}finally{await deleteSecret(account);}
});
test('credential names cannot select arbitrary Keychain commands',async()=>{await assert.rejects(()=>writeSecret('bad name\ncommand','test'),/credential name/);assert.equal(await readSecret('bad name'),null);});
