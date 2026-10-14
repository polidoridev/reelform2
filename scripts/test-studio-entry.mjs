// Browser contract checks with simulated APIs; no real accounts or paid generations.
// Run with node --import tsx scripts/test-studio-entry.mjs.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { quoteVideo } from '../lib/commerce/pricing.ts';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL || 'chrome'});
const base = process.env.TEST_BASE_URL || 'http://localhost:3012';
const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page = await context.newPage();
const submitted=[], errors=[], quoteBodies=[];
let signedIn=false, uploads=0, sends=0, rejectQuote=true;
page.on('pageerror', e=>errors.push(e.message));
await context.route(`${base}/api/**`, async route => {
  const path=new URL(route.request().url()).pathname;
  const json=(data,status=200)=>route.fulfill({json:data,status});
  if(path.startsWith('/api/auth/')) {
    const body=route.request().postDataJSON();
    submitted.push({path,body});
    signedIn=true;
    return json({redirect:body.next || '/studio'});
  }
  if(path==='/api/config') return json({ready:true,billingReady:true,authenticated:signedIn});
  if(path==='/api/account') return json({balance:{total:15000},isAdmin:false,account:{user_id:'entry-test',plan:'studio',paid_until:'2099-01-01T00:00:00Z'},trial:{state:'available',attemptsRemaining:3}});
  if(path==='/api/library') return json({items:[]});
  if(path==='/api/uploads') return json({uploadUrl:`${base}/__entry-upload`,headers:{},token:`upload-${++uploads}`});
  if(path==='/api/quote') {
    const body=route.request().postDataJSON();quoteBodies.push(body);
    const quote=quoteVideo({duration:5,width:1920,height:1080,bytes:0},body.resolution,body.model);
    return json({...quote,quoteToken:`quote-${quoteBodies.length}`});
  }
  if(path==='/api/generate') {
    sends++;
    if(rejectQuote) {rejectQuote=false;return json({error:'Generation pricing changed. Refresh the quote and review the new credit cost before generating.'},409);}
    return json({token:'entry-job',requestId:'12345678-1234-1234-1234-123456789abc',status:'queued',balance:13770});
  }
  if(path==='/api/jobs') return json({status:'completed',videoUrl:'/media/alpine.mp4',balance:13770});
  return json({error:`Unexpected test API: ${path}`},501);
});
await context.route(`${base}/__entry-upload`,r=>r.fulfill({status:200,body:''}));
const primary=()=>page.getByRole('radio',{name:'Motion Transfer',exact:true});
try {
  await page.goto(base);
  await page.getByRole('button',{name:'Essential only',exact:true}).click();
  await page.getByRole('link',{name:'Start motion transfer',exact:true}).first().click();
  await page.waitForURL('**/studio');
  assert.equal(await primary().getAttribute('aria-checked'),'true');
  await page.getByRole('link',{name:'Sign in',exact:true}).click();
  await page.waitForURL('**/login?next=%2Fstudio');
  await page.getByRole('button',{name:'Create an account',exact:true}).click();
  await page.getByLabel('Your name').fill('Entry Test');
  await page.getByLabel('Email address').fill('entry@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('Test-password-123!');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.waitForURL('**/studio');
  await page.getByText('15,000 credits',{exact:true}).waitFor();
  assert.equal(submitted.at(-1).body.next,'/studio');
  assert.equal(await primary().getAttribute('aria-checked'),'true','eligible trial must not override Motion Transfer');
  assert.equal(await page.locator('.chat-more-models').isDisabled(),false);
  await page.locator('.chat-trial-option summary').click();
  await page.getByRole('button',{name:'Try a free Seedance edit',exact:true}).click();
  await page.getByText(/Your first transformation is free/).waitFor();
  assert.equal(await page.locator('.chat-more-models').isDisabled(),true);
  await page.getByRole('button',{name:'Back to Motion Transfer',exact:true}).click();
  assert.equal(await primary().getAttribute('aria-checked'),'true');
  assert.equal(await page.locator('.chat-more-models').isDisabled(),false);
  // The main paid flow uses the real quote calculation and 720p even for Studio users.
  await page.getByLabel('Upload original video',{exact:true}).setInputFiles(resolve('public/media/alpine.mp4'));
  await page.getByLabel('Upload reference images',{exact:true}).setInputFiles(resolve('public/media/arrival.jpg'));
  await page.getByText('1,230 credits',{exact:true}).waitFor();
  assert.equal(quoteBodies.at(-1).model,'genjutsu-motion');
  assert.equal(quoteBodies.at(-1).resolution,'720p');
  assert.equal(quoteBodies.at(-1).trial,false);
  await page.getByRole('checkbox').check();
  const generate=page.getByRole('button',{name:'Send and generate video'});
  await generate.click();
  await page.getByText(/Generation pricing changed/).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[aria-label="Send and generate video"]').disabled);
  assert.equal(sends,1,'refreshed quote must not automatically generate');
  assert.ok(quoteBodies.length>=2,'a rejected price triggers a fresh quote');
  await generate.click();
  await page.getByText('Your video is ready.',{exact:true}).waitFor();
  assert.equal(sends,2);
  // Preserve a secondary task through password login, and the trial through Google.
  for(const destination of ['/studio?useCase=product-swap','/studio?trial=1']) {
    signedIn=false;
    await page.goto(base+destination);
    await page.getByRole('link',{name:'Sign in',exact:true}).click();
    await page.waitForURL(`${base}/login?next=${encodeURIComponent(destination)}`);
    if(destination.includes('trial')) await page.getByRole('button',{name:'Continue with Google'}).click();
    else {
      await page.getByLabel('Email address').fill('entry@example.invalid');
      await page.getByLabel('Password',{exact:true}).fill('Test-password-123!');
      await page.getByRole('button',{name:'Sign in',exact:true}).click();
    }
    await page.waitForURL(base+destination);
    assert.equal(submitted.at(-1).body.next,destination);
    if(destination.includes('trial')) await page.getByText(/Your first transformation is free/).waitFor();
    else await page.getByRole('heading',{name:'Object Swap',exact:true}).waitFor();
  }
  await page.goto(`${base}/pricing`);
  const expected=quoteVideo({duration:30,width:1920,height:1080,bytes:0},'1080p').credits;
  assert.equal(await page.getByRole('row',{name:'30s 3,440 7,360 17,630'}).count(),1);
  assert.equal(expected,17630);
  // Start layout snapshots without the previous synthetic job recovery state.
  await page.evaluate(() => sessionStorage.clear());
  for(const width of [1440,390,320]) {
    await page.setViewportSize({width,height:900});
    for(const route of ['/','/studio','/pricing']) {
      await page.goto(base+route);
      await page.waitForLoadState('networkidle');
      assert.equal(await page.getByText(/Unexpected test API/).count(),0);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route} overflow at ${width}`);
      if(width!==320) await page.screenshot({path:`outputs/motion-verified-${route.slice(1)||'home'}-${width}.png`,fullPage:true});
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS motion-first homepage, signup, trial opt-in, 720p quote, price-change review without automatic resubmission, generation, preset/trial login continuity, pricing table, desktop and mobile. No paid provider calls.');
} finally { await browser.close(); }
