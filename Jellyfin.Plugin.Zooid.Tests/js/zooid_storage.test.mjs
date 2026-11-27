// zooid_storage.test.mjs
// Tests for zooid_storage.js: that a load failure shows on the page status and never in an alert, that the page says so
// when no sync type that uses storage is on, the server tabs, the count cards and library rows, and the editor sidecar's save.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, settle, statusText, strings } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};
globalThis.setInterval = function () { return 1; };

var IDS = ['storageStatus', 'storageDisabled', 'storageFiltersOnly', 'storageNoServers', 'btnStorageMapLibraries', 'storageContent', 'storageServerPicker',
    'storageServerContent', 'storageServerOff', 'storageSummary', 'storageLibraryList', 'storageNoLibraries', 'storageItemsSection', 'storageItemsStatus',
    'storageItemsTableContainer', 'storageCacheLine', 'storageCacheMeter', 'storageCacheText'];

// t
// The strings bag the pure helpers take, in US English.
var t = {
    tr: function (key) { return strings[key]; },
    format: function (key) {
        var args = Array.prototype.slice.call(arguments, 1);
        return strings[key].replace(/\{(\d+)\}/g, function (m, i) { return String(args[i]); });
    },
    plural: function (count, one, many) { return t.format(count === 1 ? one : many, count); }
};

// openPage
// Loads the Storage controller over a view that holds the elements it uses, and shows the page.
async function openPage(opts) {
    opts = opts || {};
    var calls = [];
    var page = installPage({ calls: calls, config: opts.config === undefined ? {} : opts.config, storage: opts.storage });
    var view = page.dom.el('div', {}, IDS.map(function (id) { return page.dom.el('div', { id: id }); }));
    page.dom.document.documentElement.appendChild(view);
    globalThis.ApiClient.getVirtualFolders = function () { return Promise.resolve(opts.folders || []); };
    globalThis.ApiClient.getImageUrl = function (id) { return '/image/' + id; };
    if (opts.answer) globalThis.ApiClient.fetch = function (options) { page.requests.push(options); return opts.answer(options); };
    if (opts.fail) globalThis.ApiClient.getPluginConfiguration = function () { return Promise.reject(new Error('refused')); };
    var saved = [];
    globalThis.ApiClient.updatePluginConfiguration = function (id, config) { saved.push(JSON.parse(JSON.stringify(config))); return Promise.resolve(); };
    var mod = await loadScript('zooid_storage.js');
    mod.default(view);
    view.dispatch('viewshow');
    await settle();
    return { page: page, view: view, calls: calls, saved: saved };
}

// all
// The elements under a root that match a selector, as an array.
function all(root, selector) {
    return Array.from(root.querySelectorAll(selector));
}

function hidden(view, id) {
    return view.querySelector('#' + id).classList.contains('stolon-hidden');
}

function mapping(source, local, extra) {
    return Object.assign({ SourceLibraryId: source, SourceLibraryName: source + ' there', LocalLibraryId: local, LocalLibraryName: local + ' here', IsEnabled: true, FilterMode: 'AllowAll', FilteredItems: [] }, extra || {});
}

var DEN = { Key: 'den', Name: 'Den', Url: 'u', ApiKey: 'k', Mode: 'Sync', LibraryMappings: [mapping('films', 'movies'), mapping('shows', 'tv', { StorageMode: 'Link' })] };

// storageAnswer
// Answers the LibraryStorage route with the given counts, and every other route with an empty answer.
function storageAnswer(counts) {
    return function (options) {
        var url = String(options.url);
        if (url.indexOf('Sync/LibraryStorage') === 0) return Promise.resolve(counts);
        if (url === 'Sync/LinkCache') return Promise.resolve({ Enabled: false });
        return Promise.resolve({ Items: [], TotalCount: 0 });
    };
}

test('a config that cannot be loaded shows an error on the page status and never opens an alert', async function () {
    var opened = await openPage({ fail: true });
    var status = opened.view.querySelector('#storageStatus');
    assert.equal(statusText(status), 'Could not load the storage settings. Reload the page.');
    assert.ok(status.classList.contains('stolon-status-bad'));
});

test('the page says nothing applies while content, history, and metadata sync are all off', async function () {
    var opened = await openPage({ config: { EnableContentSync: false, EnableHistorySync: false, EnableMetadataSync: false } });
    assert.equal(hidden(opened.view, 'storageDisabled'), false);
    assert.equal(hidden(opened.view, 'storageContent'), true);
    assert.equal(hidden(opened.view, 'storageNoServers'), true);
});

test('with content sync off the page says only the filter applies, and counts only the libraries', async function () {
    var opened = await openPage({ config: { EnableContentSync: false, EnableHistorySync: true, Servers: [DEN] }, answer: storageAnswer([]) });
    assert.equal(hidden(opened.view, 'storageFiltersOnly'), false);
    var labels = all(opened.view, '#storageSummary .stolon-card-label').map(function (el) { return el.textContent; });
    assert.deepEqual(labels, ['Libraries']);
    assert.equal(opened.page.requests.some(function (r) { return String(r.url).indexOf('LibraryStorage') >= 0; }), false);
});

test('with no mapped server the page shows the empty state and its way to the Servers page', async function () {
    var opened = await openPage({ config: { EnableContentSync: true, Servers: [{ Key: 'p', Name: 'P', Url: 'u', ApiKey: 'k', Mode: 'Push', LibraryMappings: [mapping('a', 'b')] }] } });
    assert.equal(hidden(opened.view, 'storageNoServers'), false);
    assert.equal(hidden(opened.view, 'storageContent'), true);
});

test('the server tabs show only when more than one server has library mappings, named by each server', async function () {
    var one = await openPage({ config: { EnableContentSync: true, Servers: [DEN] }, answer: storageAnswer([]) });
    assert.equal(hidden(one.view, 'storageServerPicker'), true);
    var cabin = { Key: 'cabin', Name: 'Cabin', Url: 'u', ApiKey: 'k', Mode: 'Pull', LibraryMappings: [mapping('docs', 'docs')] };
    var two = await openPage({ config: { EnableContentSync: true, Servers: [DEN, cabin] }, answer: storageAnswer([]) });
    assert.equal(hidden(two.view, 'storageServerPicker'), false);
    var tabs = all(two.view, '#storageServerPicker .stolon-subtab').map(function (el) { return el.textContent; });
    assert.deepEqual(tabs, ['Den', 'Cabin']);
});

test('each enabled library mapping gets a row with its counts, and the cards sum them', async function () {
    var off = mapping('old', 'old', { IsEnabled: false });
    var den = Object.assign({}, DEN, { LibraryMappings: DEN.LibraryMappings.concat([off]) });
    var opened = await openPage({
        config: { EnableContentSync: true, Servers: [den] },
        folders: [{ ItemId: 'movies', CollectionType: 'movies' }],
        answer: storageAnswer([
            { SourceLibraryId: 'films', LocalLibraryId: 'movies', Copies: 3, Links: 0, CachedLinks: 0, Errored: 1, CopyBytes: 2048 },
            { SourceLibraryId: 'shows', LocalLibraryId: 'tv', Copies: 0, Links: 4, CachedLinks: 1 }
        ])
    });
    var rows = opened.view.querySelectorAll('#storageLibraryList .stolon-media-card');
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent, /movies here/);
    assert.match(rows[0].textContent, /1 errored/);
    assert.match(rows[1].textContent, /5 links/);
    var cards = all(opened.view, '#storageSummary .stolon-card').map(function (el) {
        return el.querySelector('.stolon-card-label').textContent + '=' + el.querySelector('.stolon-card-count').textContent;
    });
    assert.deepEqual(cards.filter(function (c) { return !/Space used/.test(c); }), ['Libraries=2', 'Copies=3', 'Links=5', 'Cached links=1', 'Errored=1']);
});

test('summaryCards shows only the library count before the counts arrive', async function () {
    var mod = await loadScript('zooid_storage.js');
    assert.deepEqual(mod.summaryCards([mapping('a', 'b')], null, true, t, String), [{ count: 1, label: 'Libraries' }]);
});

test('libraryCard draws the icon by library type, the Storage badge, and the most urgent state', async function () {
    var mod = await loadScript('zooid_storage.js');
    var link = mod.libraryCard(mapping('a', 'b', { StorageMode: 'Link', FilterMode: 'Whitelist' }), { Pending: 2, Queued: 1 }, 'tvshows', true, t);
    assert.equal(link.icon, 'tv');
    assert.deepEqual(link.badges.map(function (b) { return b.label + ':' + b.color; }), ['Link:green', 'Whitelist:blue']);
    assert.deepEqual(link.status, { label: '2 pending', color: 'purple' });
    assert.equal(link.subtitle, 'From a there');
    var empty = mod.libraryCard(mapping('a', 'b'), {}, '', true, t);
    assert.equal(empty.icon, 'video_library');
    assert.equal(empty.detail, 'Nothing synced yet.');
    assert.equal(empty.status, null);
    var filtersOnly = mod.libraryCard(mapping('a', 'b'), { Copies: 3 }, '', false, t);
    assert.deepEqual(filtersOnly.badges, []);
    assert.equal(filtersOnly.detail, null);
});

test('applyMappingEdit writes to the mapping with the same pair of libraries, even after it moved', async function () {
    var mod = await loadScript('zooid_storage.js');
    var config = { Servers: [{ Key: 'den', LibraryMappings: [mapping('new', 'new'), mapping('films', 'movies')] }] };
    assert.equal(mod.applyMappingEdit(config, 'den', { index: 0, sourceLibraryId: 'films', localLibraryId: 'movies' }, { StorageMode: 'Link' }), true);
    assert.equal(config.Servers[0].LibraryMappings[1].StorageMode, 'Link');
    assert.equal(config.Servers[0].LibraryMappings[0].StorageMode, undefined);
    assert.equal(mod.applyMappingEdit(config, 'den', { index: 0, sourceLibraryId: 'gone', localLibraryId: 'gone' }, { StorageMode: 'Link' }), false);
    assert.equal(mod.applyMappingEdit(config, 'other', { index: 1, sourceLibraryId: 'films', localLibraryId: 'movies' }, {}), false);
});

test('selecting a library opens its editor, and Save writes its Storage to that mapping only', async function () {
    var config = { EnableContentSync: true, Servers: [JSON.parse(JSON.stringify(DEN))] };
    var opened = await openPage({ config: config, answer: storageAnswer([]) });
    var dom = opened.page.dom;
    opened.view.querySelectorAll('#storageLibraryList .stolon-media-card')[0].click();
    await settle();
    var sidecar = dom.document.querySelector('.stolon-sidecar');
    assert.ok(sidecar, 'the editor opens');
    assert.match(sidecar.textContent, /movies here/);
    var radios = all(sidecar, 'input').filter(function (input) { return input.type === 'radio'; });
    var link = radios.find(function (input) { return input.value === 'Link'; });
    // The fake DOM does not uncheck the other radio of the group, as a browser does.
    radios.forEach(function (input) { input.checked = input === link; });
    link.dispatch('change');
    var save = all(sidecar, 'button').find(function (b) { return b.textContent === 'Save'; });
    save.click();
    await settle();
    assert.equal(opened.saved.length, 1);
    var stored = opened.saved[0].Servers[0].LibraryMappings;
    assert.equal(stored[0].StorageMode, 'Link');
    assert.equal(stored[0].ExcludeFromLinkCache, false);
    assert.equal(stored[0].FilterMode, 'AllowAll');
    assert.equal(stored[1].StorageMode, 'Link');
    assert.equal(stored[1].SourceLibraryName, 'shows there');
    assert.equal(statusText(opened.view.querySelector('#storageStatus')), 'Storage saved.');
});

test('the Content table loads the rows of the picked server, and the cache bar shows how much of the link cache is used while a library links', async function () {
    function answer(cache) {
        return function (options) {
            if (String(options.url) === 'Sync/LinkCache') return Promise.resolve(cache);
            if (String(options.url).indexOf('Sync/Items?') === 0) return Promise.resolve({ Items: [], TotalCount: 0 });
            return Promise.resolve([]);
        };
    }
    var on = await openPage({ config: { EnableContentSync: true, Servers: [DEN] }, answer: answer({ Enabled: true, UsedBytes: 1073741824, LimitBytes: 4294967296 }) });
    assert.equal(hidden(on.view, 'storageItemsSection'), false);
    var items = on.page.requests.find(function (r) { return String(r.url).indexOf('Sync/Items?') === 0; });
    assert.ok(items, 'the table asks for the rows');
    assert.match(String(items.url), /serverKey=den/);
    assert.equal(hidden(on.view, 'storageCacheLine'), false);
    assert.equal(hidden(on.view, 'storageCacheText'), true);
    var meter = on.view.querySelector('#storageCacheMeter').textContent;
    assert.match(meter, /Link cache/);
    assert.match(meter, /1 GB of 4 GB used/);
    var off = await openPage({ config: { EnableContentSync: true, Servers: [DEN] }, answer: answer({ Enabled: false, UsedBytes: 0, LimitBytes: 0 }) });
    assert.equal(hidden(off.view, 'storageCacheText'), false);
    assert.equal(hidden(off.view, 'storageCacheMeter'), true);
    var copiesOnly = { Key: 'c', Name: 'C', Url: 'u', ApiKey: 'k', Mode: 'Pull', LibraryMappings: [mapping('a', 'b')] };
    var none = await openPage({ config: { EnableContentSync: true, Servers: [copiesOnly] }, answer: answer({ Enabled: false, UsedBytes: 0, LimitBytes: 0 }) });
    assert.equal(hidden(none.view, 'storageCacheLine'), true);
    var filtersOnly = await openPage({ config: { EnableContentSync: false, EnableHistorySync: true, Servers: [DEN] }, answer: answer({ Enabled: true, UsedBytes: 0, LimitBytes: 1 }) });
    assert.equal(hidden(filtersOnly.view, 'storageItemsSection'), true);
});

test('keptBadges says how a file is kept, and its status when it is not synced', async function () {
    var mod = await loadScript('zooid_storage.js');
    var labels = function (item) { return mod.keptBadges(item).map(function (b) { return b.label + ':' + b.color; }); };
    assert.deepEqual(labels({ StorageMode: 'Copy', Status: 'Synced' }), ['StatusCopied:blue']);
    assert.deepEqual(labels({ StorageMode: 'Copy', Kept: 'Pick', Status: 'Synced' }), ['StatusCopied:blue']);
    assert.equal(mod.keptBadges({ StorageMode: 'Copy', Kept: 'Hand', Status: 'Synced' })[0].title, 'HelpKeptHand');
    assert.deepEqual(labels({ StorageMode: 'Link', Status: 'Synced' }), ['StatusLinked:green']);
    assert.deepEqual(labels({ StorageMode: 'Link', Cached: true, Status: 'Errored' }), ['StatusCached:orange', 'StatusErrored:red']);
});

test('itemsParams asks for the picked server and the storage the filter names', async function () {
    var mod = await loadScript('zooid_storage.js');
    assert.deepEqual(mod.itemsParams('den', 'all'), { serverKey: 'den', storage: null, cached: null });
    assert.deepEqual(mod.itemsParams('den', 'copy'), { serverKey: 'den', storage: 'Copy', cached: null });
    assert.deepEqual(mod.itemsParams('den', 'link'), { serverKey: 'den', storage: 'Link', cached: null });
    assert.deepEqual(mod.itemsParams('den', 'cached'), { serverKey: 'den', storage: null, cached: 'true' });
});
