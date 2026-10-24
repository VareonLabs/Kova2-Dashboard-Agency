import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateAccess} from '../server/private-access.mjs';
test('private Serve access requires configured host, owner, TLS and loopback proxy',()=>{
 const access=privateAccess(4320,{origin:'https://example.tail123.ts.net',login:'owner@example.com'});
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{host:'example.tail123.ts.net','tailscale-user-login':'owner@example.com','x-forwarded-proto':'https'}};
 assert.equal(access.allowed(req),true);assert.equal(access.originAllowed(req,'https://example.tail123.ts.net'),true);
 for(const [key,value] of [['host','evil.ts.net'],['tailscale-user-login','other@example.com'],['x-forwarded-proto','http']])assert.equal(access.allowed({...req,headers:{...req.headers,[key]:value}}),false);
 assert.equal(access.allowed({...req,socket:{remoteAddress:'100.1.2.3'}}),false);
 assert.equal(access.originAllowed(req,'https://evil.example'),false);
 assert.equal(privateAccess(4320).allowed(req),false);
 assert.equal(access.allowed({headers:{host:'localhost:4320'}}),true);
});
