// zooid_sync.test.mjs
// Tests for zooid_sync.js: the tool shell sidebar the Sync page builds, and that the page stops its work when it hides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, flush } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };
globalThis.clearInterval = function () {};

// openPage
// Loads the page controller over a view that holds the page's content, shows it, and returns the sidebar entries.
async function openPage(storage, beforeLoad) {
    var calls = [];
    var page = installPage({ calls: calls, storage: storage });
    if (beforeLoad) beforeLoad();
    var view = page.dom.el('div', { class: 'page' });
    var host = page.dom.el('div', { class: 'content-primary' });
    host.appendChild(page.dom.el('form', { id: 'ZooidSyncForm' }));
    view.appendChild(host);
    page.dom.document.documentElement.appendChild(view);
    var mod = await loadScript('zooid_sync.js');
    mod.default(view);
    view.dispatch('viewshow');
    await flush();
    var entries = Array.prototype.slice.call(view.querySelectorAll('.stolon-tool-shell-item'));
    return { calls: calls, view: view, page: page, entries: entries };
}

// names
// The sidebar entries' names.
function names(entries) {
    return entries.map(function (e) { return e.querySelector('.stolon-menu-label').textContent; });
}

test('the Sync page lists the five pages in the sidebar, with itself current, while Storage shows', async function () {
    var opened = await openPage({});
    assert.deepEqual(names(opened.entries), ['Sync', 'Servers', 'Storage', 'Statistics', 'Settings']);
    assert.equal(opened.entries[0].getAttribute('href'), '#/configurationpage?name=zooid_sync');
    assert.equal(opened.entries[0].getAttribute('aria-current'), 'page');
    assert.ok(opened.view.querySelector('.stolon-tool-shell-content #ZooidSyncForm'));
});

test('the Sync page sets no Jellyfin tabs', async function () {
    var opened = await openPage({});
    assert.equal(opened.calls.length, 0);
});

test('the Sync page leaves Storage out once the stored answer says it is hidden', async function () {
    var opened = await openPage({ 'zooid.storageTab': '0' });
    assert.deepEqual(names(opened.entries), ['Sync', 'Servers', 'Statistics', 'Settings']);
});

test('the Sync page lists Storage when storage is blocked', async function () {
    var opened = await openPage({}, function () {
        globalThis.localStorage = { getItem: function () { throw new Error('blocked'); } };
    });
    assert.equal(opened.entries.length, 5);
});

test('the Sync tab registers for viewshow and viewhide', async function () {
    var opened = await openPage({});
    assert.equal((opened.view.listeners.viewshow || []).length, 1);
    assert.equal((opened.view.listeners.viewhide || []).length, 1);
});

test('showing the page again keeps one sidebar', async function () {
    var opened = await openPage({});
    opened.view.dispatch('viewshow');
    await flush();
    assert.equal(opened.view.querySelectorAll('.stolon-tool-shell').length, 1);
});

test('hiding the tab before the page modules load does not fail', async function () {
    var calls = [];
    var page = installPage({ calls: calls });
    var view = page.dom.el('div');
    page.dom.document.documentElement.appendChild(view);
    var mod = await loadScript('zooid_sync.js');
    mod.default(view);
    view.dispatch('viewhide');
    await flush();
});
