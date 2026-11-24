// zooid_sync.test.mjs
// Tests for zooid_sync.js: that the page sets no Jellyfin tabs, and stops its work when it hides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, flush } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };
globalThis.clearInterval = function () {};

// openPage
// Loads the page controller over a view that holds the page's content, shows it, and returns what it set.
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
    return { calls: calls, view: view, page: page };
}

test('the Sync page sets no Jellyfin tabs', async function () {
    var opened = await openPage({});
    assert.equal(opened.calls.length, 0);
});

test('the Sync page registers for viewshow and viewhide', async function () {
    var opened = await openPage({});
    assert.equal((opened.view.listeners.viewshow || []).length, 1);
    assert.equal((opened.view.listeners.viewhide || []).length, 1);
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
