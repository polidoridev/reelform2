// Simulated API contract test: never sends a request to a generation provider.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ffmpeg = (await import('ffmpeg-static')).default;
const directory = await mkdtemp(`${tmpdir()}/reelform-trial-ui-`);
const fixture = `${directory}/clip.mp4`;
const trimmed = spawnSync(ffmpeg,['-v','error','-i',resolve('public/media/alpine.mp4'),'-t','5','-an','-c:v','libx264','-preset','ultrafast',fixture]);
assert.equal(trimmed.status,0,trimmed.stderr?.toString());
const browser = await chromium.launch({headless:true, ...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})});
const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();
const base=process.env.TEST_APP_URL || 'http://localhost:5173';
let savedGeneration = null;
let state='available', attemptsRemaining=3, fail=true, sends=0;
const quoteBodies=[], errors=[];
page.on('pageerror',error=>errors.push(error.message));
await context.route(`${base}/api/**`,async route=>{
 const path=new URL(route.request().url()).pathname;
 const json=(data,status=200)=>route.fulfill({status,json:data});
 if(path==='/api/config') return json({ready:true,authenticated:true});
 if(path==='/api/account') return json({balance:{total:0},isAdmin:false,account:{user_id:'trial-test-owner',plan:'free',paid_until:null},trial:{state,attemptsRemaining}});
 if(path==='/api/uploads') return json({uploadUrl:`${base}/__trial-test/upload`,headers:{},token:'uploaded-video'});
 if(path==='/api/quote') {
  const body=route.request().postDataJSON(); quoteBodies.push(body);
  assert.equal(body.trial,true); assert.equal(body.model,'seedance-2.5-edit'); assert.equal(body.resolution,'480p');
  return json({quoteToken:'free-quote',credits:0,duration:5});
 }
 if(path==='/api/generate') {
   sends++;state='active';const payload=route.request().postDataJSON();
   savedGeneration={id:`id-${sends}`,prompt:payload.prompt,model:payload.model,resolution:payload.resolution,trial:true,generateAudio:false,duration:5,createdAt:new Date().toISOString(),status:'queued',result:null,error:null,assets:[{slot:'video',name:payload.videoName||'Original.mp4',type:'video/mp4',url:`/api/generations/id-${sends}/inputs/video`}]};
   return json({token:`job-${sends}`,requestId:`id-${sends}`,status:'queued',balance:0});
 }
 if(path.endsWith('/inputs/video')) return route.fulfill({path:fixture,contentType:'video/mp4'});
 if(path.startsWith('/api/generations/')) return json({generation:savedGeneration,history:[],token:`job-${sends}`});
 if(path==='/api/jobs') {
   if(fail){state='available';attemptsRemaining=2;return json({status:'failed',error:'This attempt failed. Try again.',balance:0});}
   state='completed';attemptsRemaining=0;savedGeneration.status='completed';savedGeneration.result='/media/alpine.mp4';return json({status:'completed',videoUrl:'/media/alpine.mp4',balance:0});
 }
 if(path==='/api/library') return json({items:[]});
 return json({error:`Unexpected test API: ${path}`},501);
});
await context.route(`${base}/__trial-test/**`,route=>route.fulfill({status:200,body:''}));
const send=page.getByRole('button',{name:'Send and generate video'});
try {
 await page.goto(`${base}/studio?trial=1`);
 await page.getByText(/Your first transformation is free/).waitFor();
 assert(await page.locator('.chat-more-models').isDisabled());
 await page.locator('#studio-main').getByRole('button',{name:'Golden hour',exact:true}).click();
 await page.getByLabel('Upload original video',{exact:true}).setInputFiles(fixture);
 await page.locator('.chat-credit-cost').getByText('Free transformation',{exact:true}).waitFor();
 await page.getByRole('checkbox').check();
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Send and generate video"]').disabled);
 await page.screenshot({path:'/tmp/reelform-free-trial-desktop.png',fullPage:true});
 await send.click();
 await page.getByText('This attempt failed. Try again.',{exact:true}).waitFor();
 await page.getByText(/2 attempts remaining/).waitFor();
 await page.getByLabel('Describe your video transformation').fill('Give the scene warm golden-hour lighting.');
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Send and generate video"]').disabled);
 fail=false;await send.click();
 await page.getByText(/Like your result\? Keep creating/).waitFor();
 assert.equal(sends,2);
 assert(await page.getByRole('link',{name:'Keep creating',exact:true}).isVisible());
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/reelform-free-trial-mobile.png',fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile should not overflow');
 await page.reload();
 await page.getByText(/Like your result\? Keep creating/).waitFor();
 assert(await page.getByRole('link',{name:'Keep creating',exact:true}).isVisible());
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS free quote at zero balance, trial defaults, prompts, failed retry, completion upgrade, reload, desktop/mobile, and no browser errors');
} finally {await browser.close();await rm(directory,{recursive:true,force:true});}
