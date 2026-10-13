import test from "node:test";
import assert from "node:assert/strict";
import { archiveGenerationInputs, inputAssets, sourceInputs, type InputJob } from "../lib/commerce/generation-inputs";

const job: InputJob = {
  id: "12345678-1234-1234-1234-123456789abc", user_id: "owner",
  input: { videoUrl: "https://provider.example/video", imageUrls: ["https://provider.example/photo"], sourceNames: {video:"My footage.mp4",images:["Person.png"]}, sourceTypes: {video:"video/mp4",images:["image/png"]}, sourceBytes: {video:4,images:[4]} },
};
process.env.NEXT_PUBLIC_SUPABASE_URL="https://private.example";
process.env.SUPABASE_SERVICE_ROLE_KEY="test-service-key";

test("input descriptions retain photo order and expose owned application URLs", () => {
  assert.deepEqual(sourceInputs(job.input).map(s=>s.slot),["video","image-1"]);
  const assets=inputAssets(job);
  assert.equal(assets[0].name,"My footage.mp4");
  assert.equal(assets[1].name,"Person.png");
  assert.equal(assets[1].url,`/api/generations/${job.id}/inputs/image-1`);
  assert(!JSON.stringify(assets).includes("provider.example"));
});

test("generation originals are streamed to separate private paths before storing their manifest", async () => {
  const original=globalThis.fetch, calls:string[]=[];
  let storedInput: unknown;
  globalThis.fetch=async (url,init)=>{
    const href=String(url); calls.push(href);
    if(href.startsWith("https://provider.example/")) return new Response(new Uint8Array([1,2,3,4]),{headers:{"content-length":"4","content-type":href.endsWith("photo")?"image/png":"video/mp4"}});
    if(href.includes("/storage/v1/object/")) {
      assert.equal(init?.method,"POST");
      assert.equal((await new Response(init?.body).arrayBuffer()).byteLength,4);
      assert(href.includes(`/owner/job-${job.id}-`));
      return new Response('{}',{status:200});
    }
    assert(href.includes("/rest/v1/rf_jobs?"));
    assert(href.includes("user_id=eq.owner"));
    storedInput=JSON.parse(String(init?.body)).input;
    return new Response(null,{status:204});
  };
  try {
    const input=await archiveGenerationInputs(job);
    assert.equal(input.savedInputs?.length,2);
    assert.equal(input.savedInputs?.[1].path,`owner/job-${job.id}-image-1.png`);
    assert.deepEqual(storedInput,input);
    const count=calls.length;
    await archiveGenerationInputs({...job,input});
    assert.equal(calls.length,count,"saved originals must not be copied again");
  } finally {globalThis.fetch=original;}
});

test("mismatched or missing sources never produce a saved manifest", async () => {
  const original=globalThis.fetch;
  let writes=0;
  globalThis.fetch=async (_url,init)=>{if(init?.method==='POST'||init?.method==='PATCH')writes++;return new Response('bad',{headers:{'content-length':'3'}});};
  try {
    await assert.rejects(archiveGenerationInputs(job),/size or type/);
    assert.equal(writes,0);
    await assert.rejects(archiveGenerationInputs({...job,input:{videoUrl:'http://provider.example/video'}}),/Invalid input URL/);
  } finally {globalThis.fetch=original;}
});

test("legacy originals are recovered from the private library when the provider copy expired", async () => {
  const original=globalThis.fetch;
  let copied=false;
  globalThis.fetch=async (url,init)=>{
    const href=String(url);
    if(href.startsWith('https://provider.example/'))return new Response(null,{status:404});
    if(href.includes('/rest/v1/rf_library'))return Response.json({storage_path:'owner/legacy.png'});
    if(href.includes('/storage/v1/object/sign/') && init?.method==='POST')return Response.json({signedURL:'/object/sign/reelform-uploads/owner/legacy.png?token=test'});
    if(href.includes('/object/sign/') && !init?.method)return new Response(new Uint8Array([1,2,3,4]),{headers:{'content-type':'image/png','content-length':'4'}});
    if(href.includes('/storage/v1/object/reelform-uploads/')){
      copied=true;assert.equal((await new Response(init?.body).arrayBuffer()).byteLength,4);return Response.json({});
    }
    if(href.includes('/rest/v1/rf_jobs'))return new Response(null,{status:204});
    throw new Error(`Unexpected request ${href}`);
  };
  try {
    const input=await archiveGenerationInputs({...job,input:{imageUrls:['https://provider.example/expired.png']}});
    assert(copied);
    assert.equal(input.savedInputs?.[0].type,'image/png');
  } finally {globalThis.fetch=original;}
});
