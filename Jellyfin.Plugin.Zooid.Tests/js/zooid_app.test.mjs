// zooid_app.test.mjs
// Tests for the Zooid page: the tools its sidebar lists, in order, with the dashboard first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, pageView, sidebar } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};

// openApp
// Builds the Zooid page over a fresh view and returns the view.
async function openApp(storage, beforeLoad) {
    var page = installPage({ storage: storage });
    if (beforeLoad) beforeLoad();
    var view = pageView(page.dom, []);
    page.dom.document.documentElement.appendChild(view);
    var shared = await loadScript('zooid_shared.js');
    shared.createZooidApp(view);
    return view;
}

test('the sidebar lists the dashboard first, then every tool while Storage shows', async function () {
    var view = await openApp({});
    assert.deepEqual(sidebar(view).names, ['Dashboard', 'Sync', 'Queue', 'Servers', 'Storage', 'Statistics', 'Settings', 'Troubleshooting']);
});

test('the sidebar leaves Storage out once the stored answer says it is hidden', async function () {
    var view = await openApp({ 'zooid.storageTab': '0' });
    assert.deepEqual(sidebar(view).names, ['Dashboard', 'Sync', 'Queue', 'Servers', 'Statistics', 'Settings', 'Troubleshooting']);
});

test('the sidebar lists Storage when storage is blocked', async function () {
    var view = await openApp({}, function () {
        globalThis.localStorage = { getItem: function () { throw new Error('blocked'); }, setItem: function () {} };
    });
    assert.equal(sidebar(view).names.length, 8);
});

test('every tool shows its own registered page', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    assert.deepEqual(shared.zooidTools().map(function (tool) { return tool.page; }),
        ['zooid_dashboard', 'zooid_sync', 'zooid_queue', 'zooid_servers', 'zooid_storage', 'zooid_statistics', 'zooid_settings', 'zooid_troubleshooting']);
});

test('the sidebar has its fold button', async function () {
    var view = await openApp({});
    assert.ok(view.querySelector('.stolon-tool-shell-fold'));
});

test('Sync and Statistics leave the sidebar once the stored answers say they have nothing to show', async function () {
    var view = await openApp({ 'zooid.syncTab': '0', 'zooid.statisticsTab': '0', 'zooid.storageTab': '0' });
    assert.deepEqual(sidebar(view).names, ['Dashboard', 'Queue', 'Servers', 'Settings', 'Troubleshooting']);
});

test('toolFlags shows Sync for any sync type, Storage for the library ones, and Statistics for links too', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    assert.deepEqual(shared.toolFlags({}), { storage: '0', sync: '0', statistics: '0' });
    assert.deepEqual(shared.toolFlags({ EnableUserSync: true }), { storage: '0', sync: '1', statistics: '1' });
    assert.deepEqual(shared.toolFlags({ EnableHistorySync: true }), { storage: '1', sync: '1', statistics: '1' });
    assert.deepEqual(shared.toolFlags({ Servers: [{ OffersLinks: true }] }), { storage: '0', sync: '0', statistics: '1' });
});
