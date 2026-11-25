// zooid_storage.test.mjs
// Tests for zooid_storage.js: that a load failure shows on the page status and never in an
// alert, that the page says so when no sync type that uses storage is on, and the chart of synced files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, settle, statusText } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };

var IDS = ['storageStatus', 'storageDisabled', 'storageFiltersOnly', 'storageContent', 'storageLibrariesContainer', 'storageServerContainer',
    'storageNoServers', 'storageLibrariesSection', 'keptCopiesSection', 'selStorageServer', 'storageFilesSection', 'storageFilesChart', 'storageUsageSection', 'storageUsageMeter'];

// openPage
// Loads the Storage controller over a view that holds the elements it uses, and shows the page.
async function openPage(opts) {
    opts = opts || {};
    var calls = [];
    var page = installPage({ calls: calls, config: opts.config === undefined ? {} : opts.config, storage: opts.storage });
    var view = page.dom.el('div', {}, IDS.map(function (id) { return page.dom.el(id === 'selStorageServer' ? 'select' : 'div', { id: id }); }));
    page.dom.document.documentElement.appendChild(view);
    if (opts.answer) globalThis.ApiClient.fetch = function (options) { page.requests.push(options); return opts.answer(options); };
    if (opts.fail) globalThis.ApiClient.getPluginConfiguration = function () { return Promise.reject(new Error('refused')); };
    var mod = await loadScript('zooid_storage.js');
    mod.default(view);
    view.dispatch('viewshow');
    await settle();
    return { page: page, view: view, calls: calls };
}

test('a config that cannot be loaded shows an error on the page status and never opens an alert', async function () {
    var opened = await openPage({ fail: true });
    var status = opened.view.querySelector('#storageStatus');
    assert.equal(statusText(status), 'Could not load the storage settings. Reload the page.');
    assert.ok(status.classList.contains('stolon-status-bad'));
});

test('the page says nothing applies while content, history, and metadata sync are all off', async function () {
    var opened = await openPage({ config: { EnableContentSync: false, EnableHistorySync: false, EnableMetadataSync: false } });
    assert.equal(opened.view.querySelector('#storageDisabled').classList.contains('stolon-hidden'), false);
    assert.equal(opened.view.querySelector('#storageContent').classList.contains('stolon-hidden'), true);
});

test('the page says only the filter applies while content sync is off and another sync type is on', async function () {
    var opened = await openPage({ config: { EnableContentSync: false, EnableHistorySync: true, Servers: [] } });
    assert.equal(opened.view.querySelector('#storageDisabled').classList.contains('stolon-hidden'), true);
    assert.equal(opened.view.querySelector('#storageFiltersOnly').classList.contains('stolon-hidden'), false);
    assert.equal(opened.view.querySelector('#storageContent').classList.contains('stolon-hidden'), false);
    assert.ok(opened.view.querySelector('#storageLibrariesContainer').classList.contains('zooid-filters-only'));
});

test('the page shows the server picker only when more than one server has library mappings', async function () {
    var one = { Key: 'a', Name: 'A', Url: 'u', ApiKey: 'k', LibraryMappings: [] };
    var two = { Key: 'b', Name: 'B', Url: 'u', ApiKey: 'k', LibraryMappings: [] };
    var opened = await openPage({ config: { EnableContentSync: true, Servers: [{ ...one, LibraryMappings: [{ IsEnabled: false }] }] } });
    assert.equal(opened.view.querySelector('#storageServerContainer').classList.contains('stolon-hidden'), true);
    opened = await openPage({ config: { EnableContentSync: true, Servers: [{ ...one, LibraryMappings: [{ IsEnabled: false }] }, { ...two, LibraryMappings: [{ IsEnabled: false }] }] } });
    assert.equal(opened.view.querySelector('#storageServerContainer').classList.contains('stolon-hidden'), false);
});

test('a Push server maps no libraries, so the picker leaves it out', async function () {
    var opened = await openPage({ config: { EnableContentSync: true, Servers: [{ Key: 'p', Name: 'P', Url: 'u', ApiKey: 'k', Mode: 'Push', LibraryMappings: [{ IsEnabled: false }] }] } });
    assert.equal(opened.view.querySelector('#storageNoServers').classList.contains('stolon-hidden'), false);
});

var MAPPED = { Key: 'a b', Name: 'A', Url: 'u', ApiKey: 'k', LibraryMappings: [{ IsEnabled: false }] };

// countsAnswer
// Answers the Items counts the chart asks for: copies, links, and cached links.
function countsAnswer(copies, links, cached, cache) {
    return function (options) {
        var url = String(options.url);
        if (url === 'Zooid/LinkCache') return Promise.resolve(cache || { Enabled: false });
        if (url.indexOf('Items?') < 0) return Promise.resolve({});
        var total = url.indexOf('cached=true') >= 0 ? cached : url.indexOf('storage=Link') >= 0 ? links : copies;
        return Promise.resolve({ Items: [], TotalCount: total });
    };
}

test('the Usage section shows the link cache as used of its limit only while the cache is on', async function () {
    var on = await openPage({ config: { EnableContentSync: true, Servers: [MAPPED] }, answer: countsAnswer(1, 1, 0, { Enabled: true, UsedBytes: 1073741824, LimitBytes: 4294967296 }) });
    assert.equal(on.view.querySelector('#storageUsageSection').classList.contains('stolon-hidden'), false);
    var text = on.view.querySelector('#storageUsageMeter').textContent;
    assert.match(text, /Link cache/);
    assert.match(text, /1 GB of 4 GB used/);
    var off = await openPage({ config: { EnableContentSync: true, Servers: [MAPPED] }, answer: countsAnswer(1, 1, 0, { Enabled: false, UsedBytes: 0, LimitBytes: 0 }) });
    assert.equal(off.view.querySelector('#storageUsageSection').classList.contains('stolon-hidden'), true);
});
