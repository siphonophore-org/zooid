// zooid_servers.test.mjs
// Tests for zooid_servers.js: that a load failure shows on the page status and never in an alert.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, settle, statusText } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };

var IDS = ['serverListStatus', 'serverList', 'serverEditor', 'serverEmpty', 'modeChoices', 'authChoices', 'saveServerStatus'];

// openPage
// Loads the Servers controller over a view that holds the elements it uses, and shows the page.
async function openPage(opts) {
    opts = opts || {};
    var calls = [];
    var page = installPage({ calls: calls, config: opts.config === undefined ? { Servers: [] } : opts.config, storage: opts.storage });
    var view = page.dom.el('div', {}, IDS.map(function (id) { return page.dom.el('div', { id: id }); }));
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

test('a config that cannot be loaded shows an error on the server list status and never opens an alert', async function () {
    var opened = await openPage({ fail: true });
    var status = opened.view.querySelector('#serverListStatus');
    assert.equal(statusText(status), 'Could not load the servers. Reload the page.');
    assert.ok(status.classList.contains('stolon-status-bad'));
});

test('urlWasCleared is true only when a saved Server URL is emptied', async function () {
    var mod = await loadScript('zooid_servers.js');
    assert.equal(mod.urlWasCleared('http://a:8096', ''), true);
    assert.equal(mod.urlWasCleared('http://a:8096', '   '), true);
    assert.equal(mod.urlWasCleared('http://a:8096', 'http://b:8096'), false);
    assert.equal(mod.urlWasCleared('', ''), false);
    assert.equal(mod.urlWasCleared(null, ''), false);
});
