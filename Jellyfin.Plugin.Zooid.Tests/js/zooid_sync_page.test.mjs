// zooid_sync_page.test.mjs
// Tests for zooid_sync_page.js and the sync type tools it builds: that a tool sets no Jellyfin tabs, builds its own
// type's table once, follows the config on each show, and stops its work when it hides.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installPage, loadScript, flush, settle, paths } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };
globalThis.clearInterval = function () {};

var TYPES = ['content', 'history', 'metadata', 'people', 'users'];

// openTool
// Builds a sync type tool over a view that holds its status line, with its module's table and loads stubbed, shows
// it, and returns what it set.
async function openTool(type, opts) {
    opts = opts || {};
    var calls = [];
    var page = installPage({ calls: calls, config: opts.config });
    var view = page.dom.el('div', { class: 'page' });
    view.appendChild(page.dom.el('div', { class: 'content-primary' }, [page.dom.el('div', { id: 'syncStatus' })]));
    page.dom.document.documentElement.appendChild(view);
    var mod = await loadScript('zooid_sync_page.js');
    var made = mod.createSyncTypePage(view, type);
    var module = await made.ready;
    var opened = { inits: 0, loads: 0 };
    module.init = function () { opened.inits++; this._initialized = true; };
    module.loadAll = function () { opened.loads++; return Promise.resolve(); };
    view.dispatch('viewshow');
    await settle(20);
    return Object.assign(opened, { calls: calls, view: view, page: page, module: module });
}

test('each sync type tool sets no Jellyfin tabs', async function () {
    for (var type of TYPES) {
        var opened = await openTool(type);
        assert.equal(opened.calls.length, 0, type);
    }
});

test('each sync type tool registers for viewshow and viewhide', async function () {
    for (var type of TYPES) {
        var opened = await openTool(type);
        assert.equal((opened.view.listeners.viewshow || []).length, 1, type);
        assert.equal((opened.view.listeners.viewhide || []).length, 1, type);
    }
});

test('the first show builds the table and loads its rows, once', async function () {
    for (var type of TYPES) {
        var opened = await openTool(type);
        assert.equal(opened.inits, 1, type);
        assert.equal(opened.loads, 1, type);
        opened.view.dispatch('viewhide');
        opened.view.dispatch('viewshow');
        await flush();
        assert.equal(opened.inits, 1, type);
    }
});

test('each tool controller builds the tool of its own sync type', function () {
    for (var type of TYPES) {
        var text = readFileSync(join(paths.configDir, 'zooid_' + type + '.js'), 'utf8');
        assert.ok(text.indexOf("createSyncTypePage(view, '" + type + "')") > 0, type);
    }
});

test('hiding a tool before its modules load does not fail', async function () {
    var page = installPage({});
    var view = page.dom.el('div');
    page.dom.document.documentElement.appendChild(view);
    var mod = await loadScript('zooid_sync_page.js');
    mod.createSyncTypePage(view, 'history');
    view.dispatch('viewhide');
    await flush();
});

test('each tool builds the module of its own sync type', async function () {
    installPage({});
    var mod = await loadScript('zooid_sync_page.js');
    for (var type of TYPES) {
        var spec = mod.SYNC_PAGES[type];
        var module = await loadScript(spec.script);
        assert.equal(typeof module[spec.build], 'function', type);
        assert.equal(spec.page, 'zooid_' + type);
    }
});

test('each tool page holds its own table and the controller for its type', async function () {
    var mod = await loadScript('zooid_sync_page.js');
    var tables = { content: 'syncItemsTableContainer', history: 'historyItemsTableContainer', metadata: 'metadataSyncItemsTableContainer', people: 'peopleSyncItemsTableContainer', users: 'userSyncItemsTableContainer' };
    for (var type of TYPES) {
        var html = readFileSync(join(paths.configDir, mod.SYNC_PAGES[type].page + '.html'), 'utf8');
        assert.ok(html.indexOf('data-controller="__plugin/zooid_' + type + '.js"') > 0, type);
        assert.ok(html.indexOf('id="' + tables[type] + '"') > 0, type);
        TYPES.filter(function (other) { return other !== type; }).forEach(function (other) {
            assert.equal(html.indexOf('id="' + tables[other] + '"'), -1, type + ' holds the ' + other + ' table');
        });
    }
});

test('a show after the first reads the config again and hands it to the module', async function () {
    var opened = await openTool('history', { config: { EnableHistorySync: true, Marker: 1 } });
    globalThis.ApiClient.getPluginConfiguration = function () { return Promise.resolve({ EnableHistorySync: true, Marker: 2 }); };
    opened.view.dispatch('viewhide');
    opened.view.dispatch('viewshow');
    await flush();
    assert.equal(opened.module.currentConfig.Marker, 2);
});

test('hiding a tool stops its table observer, and showing it again starts it', async function () {
    var opened = await openTool('metadata');
    var observer = { on: true };
    opened.module.table = { disconnectObserver: function () { observer.on = false; }, reconnectObserver: function () { observer.on = true; } };
    opened.view.dispatch('viewhide');
    assert.equal(observer.on, false);
    opened.view.dispatch('viewshow');
    await flush();
    assert.equal(observer.on, true);
});
