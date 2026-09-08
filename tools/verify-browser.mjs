import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(process.env.TEXTIFY_PLAYWRIGHT_FROM || import.meta.url);
const { chromium } = require('playwright');
const url = process.env.TEXTIFY_TEST_URL;
assert.ok(url?.startsWith('http://127.0.0.1:'), 'Only run this synthetic fixture driver against a local test server');
const out = process.env.TEXTIFY_EVIDENCE_DIR;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.TEXTIFY_BROWSER_CHANNEL });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); };
try {
  await page.goto(url);
  await check('locked inventory and wrong-code rejection', async () => {
    assert.equal(await page.locator('#documents option').count(), 1);
    await page.getByLabel('Access code', { exact: false }).fill('wrong-code');
    await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#access-status').textContent.includes('valid Textify access code'));
  });
  await check('unlock empty inventory and session-only code', async () => {
    await page.locator('#access-code').fill('synthetic-test-code');
    await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#access-status').textContent.includes('unlocked'));
    assert.equal(await page.evaluate(() => sessionStorage.getItem('textify-access-code')), 'synthetic-test-code');
    assert.equal(await page.evaluate(() => localStorage.getItem('textify-access-code')), null);
  });
  await check('missing selection produces an in-page actionable error', async () => {
    await page.getByLabel('Question', { exact: true }).fill('Explain the privacy boundary');
    await page.getByRole('button', { name: 'Find supported answer', exact: true }).click();
    assert.ok((await page.locator('#ask-status').innerText()).includes('Choose an indexed source'));
  });
  const source = 'Privacy keeps the private key with the learner and the server only receives encrypted values. <img src=x onerror=window.__sourceXss=1> <svg onload=window.__sourceXss=1> These strings are source text, never markup. '.repeat(14);
  const file = { name: 'study-<img src=x onerror=window.__nameXss=1>.txt', mimeType: 'text/plain', buffer: Buffer.from(source) };
  await check('TXT upload selects indexed source and renders filename as text', async () => {
    await page.locator('#file').setInputFiles(file);
    await page.getByRole('button', { name: 'Build evidence index', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#upload-status').textContent.includes('chunks indexed'));
    await page.waitForFunction(() => Boolean(document.querySelector('#documents').value));
    assert.equal(await page.locator('#documents img').count(), 0);
    assert.equal(await page.evaluate(() => window.__nameXss), undefined);
  });
  await check('duplicate upload retains one document and gives explicit feedback', async () => {
    await page.getByRole('button', { name: 'Build evidence index', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#upload-status').textContent.includes('already indexed'));
    assert.equal(await page.locator('#documents option').count(), 2);
  });
  await check('ask returns visible source evidence without executing source HTML', async () => {
    await page.getByRole('button', { name: 'Find supported answer', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#answer').classList.contains('hidden'));
    assert.ok((await page.locator('#answer-text').innerText()).includes('[S1]'));
    assert.ok((await page.locator('#citations').innerText()).includes('<img'));
    assert.equal(await page.locator('#citations img, #citations svg').count(), 0);
    assert.equal(await page.evaluate(() => window.__sourceXss), undefined);
  });
  await page.screenshot({ path: path.join(out, 'textify-cited-answer.png'), fullPage: true });
  await check('unsupported file and exhausted upload budget show recoverable errors', async () => {
    await page.locator('#file').setInputFiles({ name: 'bad.html', mimeType: 'text/html', buffer: Buffer.from('<h1>bad</h1>') });
    await page.getByRole('button', { name: 'Build evidence index', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#upload-status').textContent.includes('supports PDF'));
    await page.locator('#file').setInputFiles(file);
    await page.getByRole('button', { name: 'Build evidence index', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#upload-status').textContent.includes('Request budget reached'));
    assert.equal(await page.getByRole('button', { name: 'Build evidence index', exact: true }).isEnabled(), true);
  });
  await check('remove-source confirmation cancels then accepts and clears evidence', async () => {
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Remove source', exact: true }).click();
    assert.equal(await page.locator('#documents option').count(), 2);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Remove source', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#ask-status').textContent.includes('removed'));
    assert.equal(await page.locator('#documents option').count(), 1);
    assert.equal(await page.locator('#answer').isVisible(), false);
  });
  await check('theme toggle and mobile layout', async () => {
    await page.getByRole('button', { name: 'Toggle ground', exact: true }).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  });
  await check('lock clears session credential and hides private source state', async () => {
    await page.getByRole('button', { name: 'Lock workspace', exact: true }).click();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('textify-access-code')), null);
    assert.equal(await page.locator('#documents option').count(), 1);
    assert.equal(await page.locator('#answer').isVisible(), false);
  });
  await page.screenshot({ path: path.join(out, 'textify-mobile-locked.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(path.join(out, 'browser-results.json'), JSON.stringify({ checks, count: checks.length, errors, scope: 'Real local UI/API/Neon pgvector with isolated synthetic data and mocked model responses; no paid provider verification.' }, null, 2));
  console.log(`Textify browser: ${checks.length} workflows passed; no page errors.`);
} finally { await browser.close(); }
