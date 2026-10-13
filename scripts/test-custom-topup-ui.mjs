// Browser contract test with mocked account/payment APIs; never charges a card.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.TEST_BROWSER_CHANNEL ? {channel:process.env.TEST_BROWSER_CHANNEL} : {})});
const context = await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
const page = await context.newPage();
const base = process.env.TEST_APP_URL || 'http://localhost:5173';
await context.addCookies([{name:'rf_consent',value:'denied',url:base}]);
const errors = [], purchases = [];
let active = true;
page.on('pageerror', error => errors.push(error.message));
await context.route(`${base}/api/**`, async route => {
 const path = new URL(route.request().url()).pathname;
 if(path === '/api/account') return route.fulfill({json:{
  isAdmin:false, account:{user_id:'qa',full_name:'Test Creator',email:'test@example.invalid',plan:active?'pro':'free',
   subscription_status:active?'active':'canceled',paid_until:active?'2099-01-01':null,
   auto_reload_enabled:false,auto_reload_pack:'small',auto_reload_threshold:200,auto_reload_cap_cents:3000},
  balance:{total:5500,subscription:5500,purchased:0,nextExpiry:null},jobs:[],ledger:[],orders:[],invoices:[],paymentMethod:null,
 }});
 if(path === '/api/billing/topup') {
  purchases.push(route.request().postDataJSON());
  return route.fulfill({status:503,json:{error:'Test checkout unavailable. Please try again.'}});
 }
 return route.fulfill({json:{}});
});
try {
 await page.goto(`${base}/account?tab=credits`);
 const slider=page.getByRole('slider',{name:'Credits to purchase'});
 await slider.waitFor();
 assert.equal(await slider.inputValue(),'2400');
 await page.getByRole('button',{name:'Buy 2,400 credits',exact:true}).waitFor();
 await slider.focus();await slider.press('ArrowRight');
 assert.equal(await slider.inputValue(),'2500');
 assert.match(await slider.getAttribute('aria-valuetext'),/2,500 credits for \$25.92/);
 await slider.fill('3000');
 await page.getByRole('button',{name:'Buy 3,000 credits',exact:true}).click();
 await page.getByText('Test checkout unavailable. Please try again.',{exact:true}).waitFor();
 assert.equal(purchases[0].credits,3000);assert(purchases[0].requestId);assert(!('amount_cents' in purchases[0]));
 assert(!(await slider.isDisabled()));
 await slider.focus();await slider.press('Home');assert.equal(await slider.inputValue(),'900');
 await slider.press('End');assert.equal(await slider.inputValue(),'20000');
 assert.match(await slider.getAttribute('aria-valuetext'),/\$193.55/);
 await page.locator('.custom-topup').screenshot({path:'/tmp/reelform-custom-topup-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.locator('.custom-topup').scrollIntoViewIfNeeded();
 await page.locator('.custom-topup').screenshot({path:'/tmp/reelform-custom-topup-mobile.png'});
 assert(await page.locator('.custom-topup').evaluate(el=>
  [el,...el.querySelectorAll('*')].every(child=>child.getBoundingClientRect().right<=innerWidth && child.getBoundingClientRect().left>=0)
 ),'Custom top-up controls should fit the mobile viewport');
 active=false;await page.reload();
 await slider.waitFor();
 assert(await page.getByRole('button',{name:'Buy 2,400 credits',exact:true}).isDisabled());
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS slider keyboard/bounds, displayed prices, purchase payload, recoverable checkout error, subscriber restriction, mobile layout, and no browser errors');
} finally { await browser.close(); }
