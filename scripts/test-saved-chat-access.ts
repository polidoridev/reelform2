// Temporary isolated QA accounts and private files, removed in finally.
// Does not invoke a generation provider or payment service.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { GenerationChat } from "../lib/commerce/generation-chat";
import { createClient } from "@supabase/supabase-js";
const base = process.env.TEST_APP_URL || "http://localhost:5173";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false}});
const users: string[] = [], paths: string[] = [];
const bucket = "reelform-uploads";
async function account() {
  const email=`qa-chat-${randomUUID()}@example.invalid`,password=`Aa9!${randomUUID()}`;
  const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});
  if(error)throw error;
  const id=data.user.id;users.push(id);
  const login=await fetch(`${base}/api/auth/login`,{method:"POST",headers:{Origin:base,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
  assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const initialized=await fetch(`${base}/api/account`,{headers:{Cookie:cookie}});
  assert.equal(initialized.status,200);
  return {id,cookie};
}
try {
  const owner=await account(),other=await account();
  const id=randomUUID(),otherId=randomUUID(),client=randomUUID();
  const path=`${owner.id}/job-${id}-image-1.png`;
  // Small fixture: endpoint access and byte preservation are under test, not image decoding.
  const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
  const uploaded=await db.storage.from(bucket).upload(path,bytes,{contentType:'image/png'});
  if(uploaded.error)throw uploaded.error;paths.push(path);
  const inserted=await db.from('rf_jobs').insert([
    {id:otherId,user_id:other.id,client_id:randomUUID(),credits:1,prompt:'Private other-owner prompt',resolution:'480p',status:'completed',input:{}},
    {id,user_id:owner.id,client_id:client,credits:1,prompt:'Original saved prompt',resolution:'480p',status:'queued',input:{model:'seedance-2.5-create',parentJobId:otherId,imageUrls:['https://expired.example.invalid/image.png'],savedInputs:[{slot:'image-1',name:'Reference.png',type:'image/png',bytes:bytes.length,path}],media:{duration:5}}},
  ]);
  if(inserted.error)throw inserted.error;
  const endpoint=`${base}/api/generations/${id}`;
  const response=await fetch(endpoint,{headers:{Cookie:owner.cookie}});
  assert.equal(response.status,200);
  const chat=await response.json() as GenerationChat;
  assert.equal(chat.generation.prompt,'Original saved prompt');assert.equal(chat.generation.status,'queued');
  assert.equal(chat.history.length,0,'cross-account ancestry must not be exposed');
  assert.equal(chat.generation.assets[0].name,'Reference.png');
  assert(!JSON.stringify(chat).includes('expired.example.invalid'));
  assert(!JSON.stringify(chat).includes(path));
  for(const url of [endpoint,`${base}/api/generations/${client}?lookup=client`,`${endpoint}/inputs/image-1`]){
    assert.equal((await fetch(url,{headers:{Cookie:other.cookie},redirect:'manual'})).status,404);
    assert.equal((await fetch(url,{redirect:'manual'})).status,401);
  }
  const lookup=await fetch(`${base}/api/generations/${client}?lookup=client`,{headers:{Cookie:owner.cookie}});
  assert.equal(((await lookup.json()) as GenerationChat).generation.id,id);
  const input=await fetch(`${endpoint}/inputs/image-1`,{headers:{Cookie:owner.cookie},redirect:'manual'});
  assert.equal(input.status,302);
  assert(input.headers.get('cache-control')?.includes('no-store'));
  const saved=await fetch(input.headers.get('location')!);
  assert.deepEqual(new Uint8Array(await saved.arrayBuffer()),bytes);
  assert.equal((await fetch(`${endpoint}/inputs/image-2`,{headers:{Cookie:owner.cookie},redirect:'manual'})).status,404);
  console.log('PASS live owned-chat retrieval, client-ID recovery, durable original bytes, cross-account/anonymous denial, and private ancestry filtering; no provider request submitted');
} finally {
  if(paths.length){const result=await db.storage.from(bucket).remove(paths);if(result.error)throw result.error;}
  for(const id of users){const result=await db.auth.admin.deleteUser(id);if(result.error)throw result.error;}
}
