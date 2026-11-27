// Takes every docs/screenshots image from the harness at 2x, dark theme, generic data.
// Usage: node shots.mjs [Name,Name...] to take all or only the named ones. Each PNG goes to docs/screenshots/.
import { fileURLToPath } from 'node:url';
import { open } from './shoot.mjs';
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const only = process.argv[2];
const PAD = 8;

// Saves the box of one element, with a little room around it.
async function element(p, handle, file, pad = PAD) {
  const r = await p.evaluate((el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top + scrollY, w: b.width, h: b.height }; }, handle);
  const width = await p.evaluate(() => document.documentElement.clientWidth);
  const x = Math.max(0, r.x - pad);
  await p.screenshot({ path: OUT + file, fullPage: true, clip: { x, y: Math.max(0, r.y - pad), width: Math.min(width - x, r.w + 2 * pad), height: r.h + 2 * pad } });
}
const $ = (p, selector) => p.evaluateHandle((s) => document.querySelector(s), selector);
// The page's content from its title down.
async function content(p, file) { await element(p, await $(p, '.content-primary'), file); }
// The page's content from its title down to the bottom of one element.
async function contentTo(p, selector, file) {
  const r = await p.evaluate((s) => {
    const top = document.querySelector('.content-primary').getBoundingClientRect();
    const end = document.querySelector(s).getBoundingClientRect();
    return { x: top.left, y: top.top + scrollY, w: top.width, h: end.bottom - top.top };
  }, selector);
  await p.screenshot({ path: OUT + file, fullPage: true, clip: { x: Math.max(0, r.x - PAD), y: Math.max(0, r.y - PAD), width: r.w + 2 * PAD, height: r.h + 3 * PAD } });
}
// The box from the top of one element to the bottom of another.
async function span(p, from, to, file) {
  const r = await p.evaluate(([a, b]) => {
    const top = document.querySelector(a).getBoundingClientRect();
    const end = document.querySelector(b).getBoundingClientRect();
    const box = document.querySelector(a).parentElement.getBoundingClientRect();
    return { x: box.left, y: top.top + scrollY, w: box.width, h: end.bottom - top.top };
  }, [from, to]);
  await p.screenshot({ path: OUT + file, fullPage: true, clip: { x: Math.max(0, r.x - PAD), y: Math.max(0, r.y - PAD), width: r.w + 2 * PAD, height: r.h + 2 * PAD } });
}
// Opens the collapsible section whose header targets an id, or whose title reads a text, and returns the section.
async function section(p, target) {
  const h = await p.evaluateHandle((t) => {
    const header = document.querySelector(`.stolon-collapsible-header[data-target="${t}"]`)
      || [...document.querySelectorAll('.stolon-collapsible-header')].find((x) => x.querySelector('.stolon-collapsible-title')?.textContent.trim() === t && x.offsetParent);
    if (header.classList.contains('collapsed') || header.classList.contains('stolon-collapsed')) header.click();
    return header.closest('.stolon-collapsible-section');
  }, target);
  await p.waitForTimeout(600);
  return h;
}
// Waits for a sync type tool's table to fill.
async function table(p) {
  await p.waitForTimeout(2500);
}
// Opens a row of a sync type tool's table whose name reads a text, and returns its sidecar's panel.
async function row(p, name, sidecar) {
  await table(p);
  await p.evaluate((n) => [...document.querySelectorAll('.zooid-item-name')].find((e) => (n === null || e.textContent === n) && e.offsetParent).click(), name);
  await p.waitForTimeout(1200);
  return p.evaluateHandle((id) => document.querySelector('#' + id + ' .stolon-sidecar-panel'), sidecar);
}
// Opens the first server's card on Servers.
async function firstServer(p) {
  await p.evaluate(() => {
    const card = document.querySelector('#serverList .stolon-card-item');
    (card.querySelector('.stolon-card-item-head, [role=button], .stolon-card-item-header') || card).click();
  });
  await p.waitForTimeout(800);
}
// The sidecar's panel at the window's full height, cropped to the panel.
async function sidecar(p, panel, file) {
  await element(p, panel, file, 0);
}

const shots = {
  'Dashboard': { page: 'dashboard', vp: { width: 800, height: 1400 }, act: (p) => content(p, 'Dashboard.png') },
  'Dashboard Phone': { page: 'dashboard', vp: { width: 375, height: 1500 }, act: (p) => content(p, 'Dashboard Phone.png') },
  'settings/Servers': { page: 'servers', act: (p) => contentTo(p, '#btnAddServer', 'settings/Servers.png') },
  'settings/Connection': { page: 'servers', act: async (p) => { await firstServer(p); await element(p, await section(p, 'serverStepConnection'), 'settings/Connection.png'); } },
  'settings/Authentication': { page: 'servers', act: async (p) => { await firstServer(p); await element(p, await section(p, 'serverStepAuthentication'), 'settings/Authentication.png'); } },
  'settings/Check Link': { page: 'servers', act: async (p) => {
      await firstServer(p);
      await section(p, 'serverStepAuthentication');
      await p.evaluate(() => { document.getElementById('peerCheckArea').classList.remove('stolon-hidden'); document.getElementById('btnCheckPeer').click(); });
      await p.waitForTimeout(1500);
      await element(p, await $(p, '#peerCheckArea'), 'settings/Check Link.png');
    } },
  'settings/Linking': { page: 'servers', act: async (p) => { await firstServer(p); await element(p, await section(p, 'serverStepStream'), 'settings/Linking.png'); } },
  'settings/Library Mapping': { page: 'servers', act: async (p) => { await firstServer(p); await element(p, await section(p, 'serverStepLibraries'), 'settings/Library Mapping.png'); } },
  'settings/User Mapping': { page: 'servers', act: async (p) => { await firstServer(p); await element(p, await section(p, 'serverStepUsers'), 'settings/User Mapping.png'); } },
  'settings/Storage': { page: 'storage', vp: { width: 800, height: 2600 }, act: async (p) => { await p.waitForTimeout(1500); await content(p, 'settings/Storage.png'); } },
  'settings/Storage Phone': { page: 'storage', vp: { width: 375, height: 1400 }, act: async (p) => { await p.waitForTimeout(800); await contentTo(p, '#storageLibrariesSection', 'settings/Storage Phone.png'); } },
  'settings/Storage Library': { page: 'storage', vp: { width: 800, height: 1300 }, act: async (p) => {
      await p.waitForTimeout(800);
      await p.evaluate(() => [...document.querySelectorAll('#storageLibraryList .stolon-media-card')].find((c) => c.offsetParent && /TV Shows/.test(c.textContent)).click());
      await p.waitForTimeout(1500);
      await sidecar(p, await p.evaluateHandle(() => document.querySelector('.zooid-storage-editor').closest('.stolon-sidecar-panel, .stolon-dialog-content')), 'settings/Storage Library.png');
    } },
  'Statistics': { page: 'statistics', vp: { width: 800, height: 3000 }, act: (p) => content(p, 'Statistics.png') },
  'settings/Settings': { page: 'settings', act: (p) => content(p, 'settings/Settings.png') },
  'settings/Metadata': { page: 'settings', act: async (p) => element(p, await section(p, 'Metadata'), 'settings/Metadata.png') },
  'settings/People': { page: 'settings', act: async (p) => element(p, await section(p, 'People'), 'settings/People.png') },
  'settings/Several Servers': { page: 'settings', act: async (p) => {
      await section(p, 'Users');
      await span(p, '#userSyncOptions > .stolon-subsection-title', '#userSyncOptions > .zooid-settings-group', 'settings/Several Servers.png');
    } },
  'Troubleshooting': { page: 'troubleshooting', act: (p) => content(p, 'Troubleshooting.png') },
  'Queue': { page: 'queue', vp: { width: 800, height: 1400 }, act: (p) => content(p, 'Queue.png') },
  'Queue Phone': { page: 'queue', vp: { width: 375, height: 1400 }, act: (p) => content(p, 'Queue Phone.png') },
  'Sync Table': { page: 'content', vp: { width: 800, height: 1400 }, act: async (p) => { await table(p); await content(p, 'Sync Table.png'); } },
  'Item Detail': { page: 'content', vp: { width: 800, height: 640 }, act: async (p) => sidecar(p, await row(p, null, 'itemDetailModal'), 'Item Detail.png') },
  'Metadata Item': { page: 'metadata', vp: { width: 800, height: 1100 }, act: async (p) => sidecar(p, await row(p, 'Harbor Lights', 'metadataSyncItemDetailModal'), 'Metadata Item.png') }
};

for (const [name, s] of Object.entries(shots)) {
  if (only && !only.split(',').includes(name)) continue;
  const { b, p } = await open(s.page, s.vp);
  await s.act(p);
  const errs = await p.evaluate(() => window.__errs.concat((window.__unrouted || []).map((r) => 'no stub for ' + r)));
  console.log(name, errs.length ? JSON.stringify(errs) : 'ok');
  await b.close();
}
