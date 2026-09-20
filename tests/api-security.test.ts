import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, provider, authorize, ApiError } from '../lib/higgsfield';

process.env.HF_API_KEY_ID='test-key-id';
process.env.HF_API_KEY_SECRET='test-key-secret-never-used-for-network';

test('upload tokens are scoped to their owner and purpose',async()=>{
 const token=await sign({user:'owner',kind:'upload',url:'https://storage.example/input.mp4',exp:Date.now()+60000});
 assert.equal((await verify(token,'owner','upload')).url,'https://storage.example/input.mp4');
 await assert.rejects(verify(token,'another-user','upload'),ApiError);
 await assert.rejects(verify(token,'owner','job'),ApiError);
});
test('expired and tampered tokens are rejected',async()=>{
 const expired=await sign({user:'owner',kind:'job',exp:Date.now()-100});
 await assert.rejects(verify(expired,'owner','job'),ApiError);
 const valid=await sign({user:'owner',kind:'job',exp:Date.now()+60000});
 const [payload,sig]=valid.split('.');
 await assert.rejects(verify(`${payload}.${sig[0]==='A'?'B':'A'}${sig.slice(1)}`,'owner','job'),ApiError);
 await assert.rejects(verify('invalid','owner','job'),ApiError);
});
test('cross-origin mutations are rejected before identity lookup',async()=>{
 await assert.rejects(authorize(new Request('https://reelform.example/api/generate',{method:'POST',headers:{origin:'https://attacker.example'}})),(e:unknown)=>e instanceof ApiError&&e.status===403);
});
test('provider requests use server credentials and never automatically retry submissions',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{
  calls++;assert.equal(input,'https://api.higgsfield.ai/test-model');
  assert.equal(new Headers(init?.headers).get('Authorization'),'Key test-key-id:test-key-secret-never-used-for-network');
  throw new Error('simulated network timeout');
 };
 try{await assert.rejects(provider('test-model',{method:'POST'}),(e:unknown)=>e instanceof ApiError&&e.status===504);assert.equal(calls,1);}finally{globalThis.fetch=original;}
});
test('provider billing and authentication errors do not expose upstream secrets',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [upstream,expected] of [[402,402],[401,502],[429,429]]){
   globalThis.fetch=async()=>Response.json({detail:'sensitive upstream detail'},{status:upstream});
   await assert.rejects(provider('test-model'),(e:unknown)=>e instanceof ApiError&&e.status===expected&&!e.message.includes('sensitive'));
  }
 }finally{globalThis.fetch=original;}
});
