// Browser contract test with simulated APIs. Never submits a paid generation.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_APP_URL||'http://localhost:5173';
const ffmpeg=(await import('ffmpeg-static')).default;
const dir=await mkdtemp(`${tmpdir()}/reelform-saved-chat-`),clip=`${dir}/original.mp4`;
assert.equal(spawnSync(ffmpeg,['-v','error','-i',resolve('public/media/alpine.mp4'),'-t','5','-an','-c:v','libx264','-preset','ultrafast',clip]).status,0);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();
const owner=randomUUID(),jobs=new Map(),submissions=[],errors=[];
let complete=false, disconnect=false;
page.on('pageerror',error=>errors.push(error.message));
const account=()=>({isAdmin:false,account:{user_id:owner,full_name:'Chat test',email:'test@example.invalid',plan:'studio',paid_until:'2099-01-01T00:00:00Z',subscription_status:'active'},balance:{total:10000,subscription:10000,purchased:0,nextExpiryCredits:0},jobs:[...jobs.values()].reverse().map(j=>({id:j.id,prompt:j.prompt,status:j.status,resolution:j.resolution,result_url:j.result,credits:240,created_at:j.createdAt})),ledger:[],orders:[],invoices:[],paymentMethod:null,pendingChange:null,billingReady:true,billingError:false,testMode:true});
await context.route(`${base}/api/**`,async route=>{
 const url=new URL(route.request().url()),path=url.pathname;
 const json=(data,status=200)=>route.fulfill({status,json:data});
 if(path==='/api/config')return json({ready:true,authenticated:true});
 if(path==='/api/account')return json(account());
 if(path==='/api/uploads')return json({uploadUrl:`${base}/__chat-test/upload`,headers:{},token:randomUUID()});
 if(path==='/api/library')return json({items:[]});
 if(path==='/api/quote')return json({quoteToken:randomUUID(),credits:240,duration:5});
 if(path==='/api/generate'){
  const body=route.request().postDataJSON();submissions.push(body);
  const id=randomUUID();
  jobs.set(id,{id,clientId:body.requestId,parent:body.parentJobId,prompt:body.prompt,model:body.model,resolution:body.resolution,generateAudio:body.generateAudio,trial:false,duration:5,createdAt:new Date().toISOString(),status:'queued',result:null,error:null,assets:[{slot:'video',name:body.videoName,type:'video/mp4',bytes:1,url:`/api/generations/${id}/inputs/video`},...body.imageNames.map((name,i)=>({slot:`image-${i+1}`,name,type:'image/jpeg',bytes:1,url:`/api/generations/${id}/inputs/image-${i+1}`}))]});
  if(disconnect)return route.abort('failed');
  return json({token:id,requestId:id,status:'queued',balance:10000});
 }
 if(path==='/api/jobs'){
  const j=jobs.get(url.searchParams.get('token'));
  if(!j)return json({error:'Missing job'},404);
  if(complete){j.status='completed';j.result='/media/alpine.mp4';}
  return json({status:j.status,videoUrl:j.result,balance:10000});
 }
 if(path.match(/^\/api\/generations\/[^/]+\/inputs\//))return route.fulfill({path:path.endsWith('/video')?clip:resolve('public/media/arrival.jpg'),contentType:path.endsWith('/video')?'video/mp4':'image/jpeg'});
 if(path.startsWith('/api/generations/')){
  const id=path.split('/').at(-1);
  const j=url.searchParams.get('lookup')==='client'?[...jobs.values()].find(j=>j.clientId===id):jobs.get(id);
  if(!j)return json({error:'Chat not found'},404);
  const history=[];let parent=j.parent;
  while(parent){const previous=jobs.get(parent);history.unshift(previous);parent=previous.parent;}
  return json({generation:j,history,token:j.id});
 }
 return json({error:`Unexpected API ${path}`},501);
});
await context.route(`${base}/__chat-test/**`,route=>route.fulfill({body:''}));
const prompt=page.getByLabel('Describe your video transformation');
const send=page.getByRole('button',{name:'Send and generate video'});
const text='Use @image1 and @image2 to change the surroundings in @video.';
const waitReady=()=>page.waitForFunction(()=>!document.querySelector('[aria-label="Send and generate video"]').disabled);
async function restored(expected){
 await page.waitForFunction(value=>document.querySelector('#studio-prompt')?.value===value,expected);
 await page.getByText('Opening your saved chat and original uploads…',{exact:true}).waitFor({state:'hidden'});
 assert.equal(await page.locator('.chat-attachment-previews .chat-image-attachment').count(),2);
 assert(await page.locator('.chat-edit-button').isVisible());
}
try{
 await page.goto(`${base}/studio`);
 await page.getByText('10,000 credits',{exact:true}).waitFor();
 await page.locator('.chat-more-models').click();await page.getByRole('button',{name:/^Seedance 2.5 Edit Up to/}).click();
 await page.getByLabel('Upload original video',{exact:true}).setInputFiles(clip);
 await page.getByLabel('Upload reference images',{exact:true}).setInputFiles([resolve('public/media/arrival.jpg'),resolve('public/media/escape.jpg')]);
 await prompt.fill(text);await page.getByRole('checkbox').check();await waitReady();await send.click();
 await page.waitForURL(/generation=/);
 assert.equal(await prompt.inputValue(),text,'sending must keep the composer prompt');
 const first=[...jobs.keys()][0];
 await page.reload();await restored(text);
 assert.equal(submissions.length,1,'refresh must never resubmit');
 assert(await send.isDisabled(),'active job cannot be duplicated');
 complete=true;
 await page.getByText('Your video is ready.',{exact:true}).waitFor({timeout:20000});
 const secondText='Keep @image1 and @image2 and give @video warmer lighting.';
 await prompt.fill(secondText);await page.getByRole('checkbox').check();await waitReady();await send.click();
 await page.waitForFunction(()=>document.querySelectorAll('.chat-result').length>=2).catch(()=>{});
 const second=[...jobs.keys()][1];
 assert.equal(submissions[1].parentJobId,first);
 await page.reload();await restored(secondText);
 assert.equal(await page.locator('.chat-user-message').count(),2,'conversation history survives reload');
 await page.goto(`${base}/account?tab=creations`);
 await page.getByRole('link',{name:`Open chat: ${secondText}`,exact:true}).click();
 await page.waitForURL(`**/studio?generation=${second}`);await restored(secondText);
 assert.equal(await page.locator('.chat-user-message').count(),2);
 await page.screenshot({path:'/tmp/reelform-saved-chat-desktop.png',fullPage:true});
 // Start a separate request whose HTTP response is lost; restore by client ID.
 await page.getByRole('button',{name:'New video',exact:true}).click();
 await page.getByLabel('Upload original video',{exact:true}).setInputFiles(clip);
 await prompt.fill('Give this footage warm cinematic lighting.');await page.getByRole('checkbox').check();await waitReady();
 complete=false;disconnect=true;await send.click();
 await page.getByRole('button',{name:'Check request',exact:true}).waitFor();
 assert(new URL(page.url()).searchParams.has('request'));
 await page.reload();
 await page.waitForURL(/generation=/);
 await page.getByText('Opening your saved chat and original uploads…',{exact:true}).waitFor({state:'hidden'});
 assert.equal(submissions.length,3,'recovery must load the existing job without another POST');
 assert.equal(await prompt.inputValue(),'Give this footage warm cinematic lighting.');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/reelform-saved-chat-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS composer retention, original video and photo restoration, refresh during generation, multi-turn history, My creations reopening, lost-response recovery, mobile layout, and no duplicate submissions');
}catch(error){console.error('UI state:',page.url(),(await page.locator('body').innerText()).slice(-6500),errors);await page.screenshot({path:'/tmp/reelform-saved-chat-error.png',fullPage:true});throw error;}finally{await browser.close();await rm(dir,{recursive:true,force:true});}
