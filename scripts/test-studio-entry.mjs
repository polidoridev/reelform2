// Browser contract test with simulated auth responses; never creates real accounts.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL || undefined});
const base = process.env.TEST_BASE_URL || 'http://localhost:5173';
const page = await browser.newPage();
const submitted=[];
await page.route(`${base}/api/**`, async route => {
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/auth/')) {
    const body=route.request().postDataJSON();
    submitted.push({path,body});
    return route.fulfill({json:{redirect:'/studio'}});
  }
  if(path==='/api/config') return route.fulfill({json:{ready:true,authenticated:false}});
  return route.fulfill({status:401,json:{error:'Sign in'}});
});
try {
  for(const name of ['Open studio','Reform your reality']) {
    await page.goto(base);
    await page.getByRole('link',{name,exact:true}).first().click();
    await page.waitForURL('**/login?next=%2Fstudio');
    await page.getByRole('heading',{name:'Welcome back.'}).waitFor();
    await page.waitForLoadState('networkidle');
  }
  // Clicking the mode switch also confirms the form has hydrated.
  await page.getByRole('button',{name:'Create an account',exact:true}).click();
  await page.getByLabel('Your name').fill('Entry Test');
  await page.getByLabel('Email address').fill('entry@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('Test-password-123!');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.waitForURL('**/studio');
  assert.equal(submitted.at(-1).body.next,'/studio');
  await page.goto(`${base}/login?next=%2Fstudio`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel('Email address').fill('entry@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('Test-password-123!');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.waitForURL('**/studio');
  assert.equal(submitted.at(-1).body.next,'/studio');
  await page.goto(`${base}/login?next=%2Fstudio`);
  await page.waitForLoadState("networkidle");
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await page.waitForURL('**/studio');
  assert.equal(submitted.at(-1).path,'/api/auth/google');
  assert.equal(submitted.at(-1).body.next,'/studio');
  console.log('PASS both homepage CTAs require login; signup, password login, and Google requests preserve the studio destination and follow successful redirects.');
} finally { await browser.close(); }
