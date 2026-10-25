#!/usr/bin/env node
// Prove every planted pain and Keep still exists in the seeded apps.
// Usage: node benchmarks/tools/verify-seeds.mjs [s1|s2|s3]
// Run it after any edit to a seeded app. A failing check means the answer key no longer matches the app.
// Needs Node 18+ and Playwright with Chromium. Exit 0 all pass, 1 any fail, 2 missing Playwright.
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
for (const name of ['playwright', 'playwright-core']) { try { ({ chromium } = require(name)); break; } catch {} }
if (!chromium) { console.error('verify-seeds: Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const here = dirname(fileURLToPath(import.meta.url));
const caseDir = id => resolve(here, '..', 'cases', id, 'app');
const only = process.argv[2];
const results = [];
const check = (id, ok, note = '') => results.push({ id, ok: !!ok, note });

// Contrast ratio of an element's text against its own (or nearest) background.
const contrastJs = `(el) => {
  const rgb = s => (s.match(/[\\d.]+/g) || [0,0,0]).slice(0,3).map(Number);
  const lum = c => { const [r,g,b] = c.map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }); return 0.2126*r + 0.7152*g + 0.0722*b; };
  let bgEl = el, bg = 'rgba(0, 0, 0, 0)';
  while (bgEl && (bg = getComputedStyle(bgEl).backgroundColor) === 'rgba(0, 0, 0, 0)') bgEl = bgEl.parentElement;
  const a = lum(rgb(getComputedStyle(el).color)), b = lum(rgb(bg === 'rgba(0, 0, 0, 0)' ? 'rgb(255,255,255)' : bg));
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}`;

async function s1(browser) {
  const url = pathToFileURL(resolve(caseDir('s1-pawsh-grooming'), 'index.html')).href;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const go = async h => { await page.goto(url + h); await page.waitForTimeout(80); };
  const text = () => page.locator('#app').innerText();

  await go('#/');
  check('S1-P02', (await page.locator('.site-nav').innerText()).includes('Reserve') && (await text()).includes('Book now'), 'Reserve + Book now');
  check('S1-P03', (await page.locator('.btn').first().evaluate(new Function('return ' + contrastJs)())) < 4.5, 'button contrast');
  check('S1-P09', (await text()).includes('1,284 happy dogs'), 'proof counter');
  check('S1-P14', await page.evaluate(() => { const b = document.querySelector('.btn'); b.focus(); return getComputedStyle(b).outlineStyle === 'none'; }), 'outline none on focus');
  check('S1-P17', statSync(resolve(caseDir('s1-pawsh-grooming'), 'hero.jpg')).size > 1_000_000, 'hero over 1 MB');

  await go('#/services');
  check('S1-P02b', (await text()).includes('Schedule'), 'Schedule label');
  check('S1-K1', (await page.locator('thead th').allInnerTexts()).join(',').includes('Small,Medium,Large'), 'price table by size');

  await go('#/book');
  check('S1-P19', (await text()).includes('SVC-'), 'service codes');
  check('S1-K4', (await text()).includes('Step 1 of 4'), 'step indicator');
  await page.click('#next');
  check('S1-P07a', (await text()).includes('Invalid input'), 'generic error');
  await page.check('input[value=large]'); await page.check('input[value=SVC-FULL-L]'); await page.click('#next');
  const step2 = await text();
  check('S1-P01a', !/2-hour/i.test(step2), 'no 2-hour rule at step 2');
  check('S1-K2', await page.locator('button.day[disabled]').count() === 2, 'closed days disabled');
  check('S1-P06', !/\bBack\b/.test(step2), 'no Back button');
  check('S1-P15', (await page.locator('.slot').first().boundingBox()).height < 24, 'slot under 24px');
  await page.click('[data-day="Nov 3"]'); await page.click('[data-slot="10:00"]'); await page.click('#next');
  check('S1-P16', await page.evaluate(() => [...document.querySelectorAll('input.field')].every(i => !i.labels.length && !i.getAttribute('aria-label'))), 'placeholder-only fields');
  await page.fill('input[name=pet]', 'Rex'); await page.click('#next');
  check('S1-P07b', (await text()).includes('Invalid input') && (await page.inputValue('input[name=pet]')) === '', 'error wipes fields');
  for (const [n, v] of [['pet', 'Rex'], ['breed', 'Lab'], ['owner', 'Ana'], ['phone', '5125550100'], ['email', 'ana@example.com']]) await page.fill(`input[name=${n}]`, v);
  await page.click('#next');
  const step4 = await text();
  check('S1-P01', /Large dogs need a 2-hour slot/.test(step4), '2-hour rule only at review');
  check('S1-P08', await page.locator('input[name=phone2]').count() === 1, 'phone asked again');
  check('S1-P10', !step4.includes('$') && step4.includes('Final price confirmed by email'), 'no price before confirm');
  const [cbg, kbg] = await Promise.all(['#cancel', '#confirm'].map(s => page.locator(s).evaluate(e => getComputedStyle(e).backgroundColor)));
  check('S1-P18', cbg === kbg, 'cancel and confirm same style');
  await page.click('#confirm'); await page.waitForTimeout(150);
  check('S1-P20', (await page.evaluate(() => location.hash)) === '#/' && !/confirm|thank|booked/i.test(await text()), 'no confirmation');

  await go('#/bookings');
  check('S1-K5', await page.locator('.badge').count() >= 2, 'status badges');
  check('S1-P11', !/cancel|reschedule/i.test(await page.locator('#app button, #app a').allInnerTexts().then(t => t.join(' '))), 'no cancel or reschedule');
  await go('#/bookings/past');
  check('S1-P13', await page.locator('tbody tr').count() === 0 && !/no (past )?bookings/i.test(await text()), 'empty Past tab');
  await go('#/contact');
  check('S1-K3', await page.locator('a[href^="tel:"]').count() === 1, 'tap to call');
  await go('#/does-not-exist');
  check('S1-P12', (await text()).trim() === '', 'blank unknown route');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(url + '#/'); await phone.waitForTimeout(80);
  check('S1-P04', (await phone.locator('#app .btn').boundingBox()).y > 844, 'Book now below the fold');
  check('S1-P05', await phone.evaluate(() => getComputedStyle(document.querySelector('.site-nav')).display === 'none' && !document.querySelector('header button')), 'no phone nav');
}

async function s2(browser) {
  const url = pathToFileURL(resolve(caseDir('s2-harvest-volunteers'), 'index.html')).href;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });
  const go = async h => { await page.goto(url + h); await page.waitForTimeout(80); };
  const text = () => page.locator('#app').innerText();

  await go('#/dashboard');
  check('S2-P01', (await page.locator('h1').innerText()) === 'Dashboard' && !/warehouse/i.test(await page.locator('h1').innerText()), 'heading is a label');
  check('S2-P02', (await text()).includes('14%') && !/usually|target|last month/i.test(await page.locator('.tiles').innerText()), 'no normal value');
  check('S2-P03', await page.locator('tr:has(.b-under) button, tr:has(.b-under) a').count() === 0, 'understaffed row has no action');
  check('S2-P04', await page.locator('#debug').isVisible() && await page.locator('#viewas').isVisible(), 'dev controls visible');
  check('S2-P13b', (await page.locator('.small').first().evaluate(new Function('return ' + contrastJs)())) < 4.5, 'faint filled counts');
  check('S2-P19', await page.locator('.tips').count() === 1, 'tip card');
  check('S2-P15', await page.evaluate(() => { const b = getComputedStyle(document.querySelector('.beta-banner')); return b.position === 'fixed' && parseInt(b.height) >= 72; }), 'fixed banner');
  check('S2-K3', await page.locator('#nav a.current').count() === 1 && (await page.locator('#nav .count').allInnerTexts()).some(t => t.trim()), 'nav counts and current');

  await go('#/shifts');
  check('S2-K1', /of 12 filled/.test(await text()) && await page.locator('.bar').count() >= 6, 'filled bar');
  check('S2-K2', await page.locator('#app h2').count() === 4, 'grouped by day');
  check('S2-K4', await page.locator('[data-dup]').count() >= 6, 'duplicate shift');
  check('S2-P13', (await page.locator('.time').first().evaluate(new Function('return ' + contrastJs)())) < 4.5, 'faint shift times');
  check('S2-P14', await page.locator('tr[draggable=true]').count() >= 6 && !/move up|move down/i.test(await text()), 'drag only');
  check('S2-P03b', await page.locator('tr:has(.b-under) button:not([data-dup])').count() === 0, 'no fix action on shift row');

  await go('#/shifts/s4');
  const detail = await text();
  check('S2-P16', detail.includes('T08:00') && detail.includes('slot_capacity'), 'raw values');
  check('S2-P10', detail.includes('Volunteer ID (e.g. V-0193)'), 'ID entry');
  check('S2-P07a', detail.includes('Remove'), 'Remove label');
  const greenConfirmed = await page.locator('.badge', { hasText: 'Confirmed' }).first().evaluate(e => getComputedStyle(e).backgroundColor);
  await page.click('[data-add]');
  check('S2-P17', (await text()).includes('Validation failed (code 3)'), 'coded error');

  await go('#/volunteers');
  check('S2-P05', (await page.locator('.panel').innerText()).includes('Select a volunteer to see details'), 'empty panel');
  check('S2-P09', await page.locator('#app table input[type=checkbox]').count() === 0, 'no bulk select');
  const blueConfirmed = await page.locator('.badge', { hasText: 'Confirmed' }).first().evaluate(e => getComputedStyle(e).backgroundColor);
  check('S2-P06', greenConfirmed !== blueConfirmed, 'Confirmed has two colors');
  await page.fill('#q', 'Maya Chen');
  const byName = await page.locator('tbody tr').count();
  await page.fill('#q', 'maya.chen');
  check('S2-P11', byName === 0 && await page.locator('tbody tr').count() === 1, 'email-only search');
  await page.fill('#q', '');
  await page.click('tr[data-vol="V-0193"] td');
  const panel = await page.locator('.panel').innerText();
  check('S2-K5', /Total hours/.test(panel) && /Last shift/.test(panel), 'hours and last shift');
  check('S2-P07b', panel.includes('Unassign'), 'Unassign label');
  const before = await page.locator('tbody tr').count();
  await page.click('[data-delvol]');
  check('S2-P08', dialogs === 0 && await page.locator('tbody tr').count() === before - 1, 'instant delete, no confirm');

  await go('#/settings');
  const s = await text(); await page.click('#save-settings');
  check('S2-P18', (await text()) === s, 'no save feedback');
  await go('#/reports');
  check('S2-P20', (await text()).includes('Lorem ipsum'), 'placeholder report');

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const r of ['#/shifts', '#/volunteers']) {
    await phone.goto(url + r); await phone.waitForTimeout(80);
    check('S2-P12' + (r.includes('vol') ? 'b' : ''), (await phone.evaluate(() => document.documentElement.scrollWidth)) > 390, 'sideways scroll ' + r);
  }
}

async function s3(browser) {
  const url = pathToFileURL(resolve(caseDir('s3-northwind-maintenance'), 'index.html')).href;
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const go = async h => { await page.goto(url + h); await page.waitForTimeout(80); };
  const text = () => page.locator('#app').innerText();

  await go('#/requests');
  const pillTexts = await page.locator('.pill').allInnerTexts();
  check('S3-P01', pillTexts.some(t => t.split(' ').length > 4), 'sentence pill');
  check('S3-P02', await page.evaluate(() => Math.max(...[...document.querySelectorAll('.card .pills')].map(p => p.children.length))) >= 7, '7 pills on a card');
  const nums = await page.evaluate(() => [...document.querySelectorAll('.card')].slice(0, 3).map(c => { const d = c.querySelector('.date').getBoundingClientRect(); return d.top; }));
  check('S3-P04', Math.max(...nums) - Math.min(...nums) > 6, 'dates at different heights in row 1');
  check('S3-P06', await page.evaluate(() => [...document.querySelectorAll('.card')].every(c => c.lastElementChild.textContent.includes('Assign vendor'))), 'Assign vendor is last in every card');
  check('S3-P07', await page.locator('.card').first().locator('.facts > div').count() >= 7, '7 detail lines per card');
  check('S3-P11', (await page.locator('.date').first().evaluate(new Function('return ' + contrastJs)())) < 4.5, 'faint dates');
  check('S3-P12', await page.evaluate(() => [...document.querySelectorAll('.iconbtn')].every(b => !b.getAttribute('aria-label') && !b.title && !/[a-z]/i.test(b.textContent))), 'icon buttons without names');
  check('S3-P13', await page.locator('.bulkbar').isVisible() && await page.locator('#app input[type=checkbox]').count() === 0, 'bulk bar, nothing to select');
  const openReq = await page.locator('.pill.open-req').first().evaluate(e => getComputedStyle(e).backgroundColor);
  check('S3-K1', /\d+ open requests · \d+ overdue/.test(await text()), 'situation line');
  check('S3-K4', await page.locator('#nav a.current').count() === 1, 'current nav item');

  await page.click('#filter'); await page.waitForTimeout(100);
  const m = await page.evaluate(() => {
    const el = document.getElementById('filter-menu'), r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.bottom - 6);
    return { radius: parseFloat(getComputedStyle(el).borderTopLeftRadius), covered: !!top && !el.contains(top) };
  });
  check('S3-P08', m.radius === 0, 'square filter menu');
  check('S3-P09', m.covered, 'menu covered by the bottom bar');

  check('S3-P03a', (await page.locator('#nav a', { hasText: 'Urgent' }).innerText()).includes('5'), 'Urgent shows 5');
  await go('#/urgent');
  check('S3-P03', /no urgent requests/i.test(await text()), 'Urgent page is empty');

  await go('#/properties');
  const openProp = await page.locator('.pill.open-prop').first().evaluate(e => getComputedStyle(e).backgroundColor);
  check('S3-P10', openReq !== openProp, 'Open has two colors');
  check('S3-P05', await page.evaluate(() => { const c = document.querySelector('.prop'); const a = c.querySelector('.addr').getBoundingClientRect(), b = c.querySelector('.bar').getBoundingClientRect(); return b.top - a.bottom; }) > 60, 'big gap in property card');
  check('S3-K3', /\d+ of \d+ units leased/.test(await text()) && await page.locator('.bar').count() >= 3, 'occupancy bars');
  check('S3-P13b', await page.locator('.bulkbar').isVisible(), 'bulk bar on Properties');

  await go('#/vendors');
  check('S3-K2', await page.locator('a[href^="tel:"]').count() >= 4, 'tap-to-call vendors');
}

const browser = await chromium.launch();
try {
  if (!only || only === 's1') await s1(browser);
  if (!only || only === 's2') await s2(browser);
  if (!only || only === 's3') await s3(browser);
} finally { await browser.close(); }

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(9)} ${r.note}`);
console.log(`\n${results.length - failed.length} of ${results.length} checks pass`);
process.exit(failed.length ? 1 : 0);
