// zooid_servers.test.mjs
// Tests for zooid_servers.js: its place in the sidebar, that a load failure shows on the page status and never in an
// alert, and that the pool map draws each server by name, escaped, with no inline style.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, settle, statusText, pageView, sidebar } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };

var IDS = ['serverListStatus', 'poolMap', 'serverList', 'serverEditor', 'serverEmpty', 'modeChoices', 'authChoices', 'saveServerStatus'];

// openPage
// Loads the Servers controller over a view that holds the elements it uses, and shows the page.
async function openPage(opts) {
    opts = opts || {};
    var calls = [];
    var page = installPage({ calls: calls, config: opts.config === undefined ? { Servers: [] } : opts.config, storage: opts.storage });
    var view = pageView(page.dom, IDS.map(function (id) { return page.dom.el('div', { id: id }); }));
    page.dom.document.documentElement.appendChild(view);
    if (opts.fail) globalThis.ApiClient.getPluginConfiguration = function () { return Promise.reject(new Error('refused')); };
    var serverName = opts.serverName === undefined ? 'Home <Server>' : opts.serverName;
    globalThis.ApiClient.getSystemInfo = function () { return Promise.resolve({ ServerName: serverName }); };
    var mod = await loadScript('zooid_servers.js');
    mod.default(view);
    view.dispatch('viewshow');
    await settle();
    return { page: page, view: view, calls: calls };
}

test('the Servers page is second in the sidebar', async function () {
    var opened = await openPage();
    var bar = sidebar(opened.view);
    assert.equal(bar.current, 1);
    assert.equal(bar.names[1], 'Servers');
    assert.equal(bar.hrefs[1], '#/configurationpage?name=zooid_servers');
});

test('the Servers page leaves out Storage while it is hidden and still marks itself', async function () {
    var opened = await openPage({ storage: { 'zooid.storageTab': '0' } });
    assert.deepEqual(sidebar(opened.view).names, ['Sync', 'Servers', 'Statistics', 'Settings']);
    assert.equal(sidebar(opened.view).current, 1);
});

test('a config that cannot be loaded shows an error on the server list status and never opens an alert', async function () {
    var opened = await openPage({ fail: true });
    var status = opened.view.querySelector('#serverListStatus');
    assert.equal(statusText(status), 'Could not load the servers. Reload the page.');
    assert.ok(status.classList.contains('stolon-status-bad'));
});

test('the pool map draws each server by name, escaped, and sizes the picture with an attribute, not a style', async function () {
    var opened = await openPage({ config: { Servers: [
        { Key: 'a', Name: '<img src=x>', Url: 'http://a', ApiKey: 'k', Mode: 'Pull', IsEnabled: true },
        { Key: 'b', Name: 'Beta', Url: 'http://b', ApiKey: 'k', Mode: 'Push', IsEnabled: true }
    ] } });
    var map = opened.view.querySelector('#poolMap');
    assert.match(map.innerHTML, /^<svg viewBox="[-\d. ]+" width="\d+" xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
    assert.doesNotMatch(map.innerHTML, /style=/);
    assert.doesNotMatch(map.innerHTML, /<img src=x>/);
    assert.match(map.innerHTML, /&lt;img src=x&gt;/);
    assert.match(map.innerHTML, /Beta/);
    assert.match(map.getAttribute('aria-label'), /^Servers this one is set up with, /);
    assert.doesNotMatch(map.getAttribute('aria-label'), /:/);
});

test('the pool map colors its lines and dots with classes, and writes no color of its own', async function () {
    var opened = await openPage({ config: { Servers: [
        { Key: 'a', Name: 'Alpha', Url: 'http://a', ApiKey: 'k', Mode: 'Pull', IsEnabled: true },
        { Key: 'b', Name: 'Beta', Url: 'http://b', ApiKey: 'k', Mode: 'Push', IsEnabled: false },
        { Key: 'c', Name: 'Gamma', Url: '', ApiKey: '', Mode: 'Sync', IsEnabled: true }
    ] } });
    var html = opened.view.querySelector('#poolMap').innerHTML;
    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(html, / (fill|stroke)="(?!none|context-stroke)/);
    assert.match(html, /class="zooid-pool-line zooid-pool-pull"/);
    assert.match(html, /class="zooid-pool-line zooid-pool-push"/);
    assert.match(html, /class="zooid-pool-line zooid-pool-sync"/);
    assert.match(html, /class="zooid-pool-dot zooid-pool-disabled"/);
    assert.match(html, /class="zooid-pool-dot zooid-pool-down"/);
    assert.match(html, /class="zooid-pool-pill"/);
    assert.match(html, /class="zooid-pool-card"/);
});

test('the pool map shows this server by its own name, and by Server when the name is long', async function () {
    var opened = await openPage({ config: { Servers: [{ Key: 'a', Name: 'A', Url: 'http://a', ApiKey: 'k', IsEnabled: true }] } });
    var html = opened.view.querySelector('#poolMap').innerHTML;
    assert.match(html, /<text class="zooid-pool-self"[^>]*>Server<\/text>/);
    assert.match(html, /Home &lt;Server&gt;, this server/);
});

test('the pool map titles this server This server, once, when it has no name', async function () {
    var opened = await openPage({ serverName: '', config: { Servers: [{ Key: 'a', Name: 'A', Url: 'http://a', ApiKey: 'k', IsEnabled: true }] } });
    var html = opened.view.querySelector('#poolMap').innerHTML;
    assert.match(html, /class="zooid-pool-card"><title>This server<\/title>/);
    assert.doesNotMatch(html, /this server, this server/i);
});

test('the pool map is hidden while there are no servers', async function () {
    var opened = await openPage();
    var map = opened.view.querySelector('#poolMap');
    assert.equal(map.innerHTML, '');
    assert.ok(map.classList.contains('stolon-hidden'));
});

test('urlWasCleared is true only when a saved Server URL is emptied', async function () {
    var mod = await loadScript('zooid_servers.js');
    assert.equal(mod.urlWasCleared('http://a:8096', ''), true);
    assert.equal(mod.urlWasCleared('http://a:8096', '   '), true);
    assert.equal(mod.urlWasCleared('http://a:8096', 'http://b:8096'), false);
    assert.equal(mod.urlWasCleared('', ''), false);
    assert.equal(mod.urlWasCleared(null, ''), false);
});
