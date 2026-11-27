// zooid_app.test.mjs
// Tests for the Zooid page: the tools its sidebar lists, in order, with the dashboard first, and the sync type tools
// that leave it while their type is off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installPage, loadScript, pageView, sidebar, flush, paths } from './support.mjs';

globalThis.setTimeout = function () { return 1; };
globalThis.clearTimeout = function () {};

var EVERY_TOOL = ['Dashboard', 'Queue', 'Content', 'History', 'Metadata', 'People', 'Users', 'Servers', 'Storage', 'Statistics', 'Settings', 'Troubleshooting'];

// openApp
// Builds the Zooid page over a fresh view and returns the view.
async function openApp(storage, beforeLoad, config) {
    var page = installPage({ storage: storage, config: config });
    if (beforeLoad) beforeLoad();
    var view = pageView(page.dom, []);
    page.dom.document.documentElement.appendChild(view);
    var shared = await loadScript('zooid_shared.js');
    shared.createZooidApp(view);
    view.page = page;
    return view;
}

test('the sidebar lists the dashboard first, then a tool for each sync type, then the rest', async function () {
    var view = await openApp({});
    assert.deepEqual(sidebar(view).names, EVERY_TOOL);
});

test('the sidebar leaves Storage out once the stored answer says it is hidden', async function () {
    var view = await openApp({ 'zooid.storageTab': '0' });
    assert.deepEqual(sidebar(view).names, EVERY_TOOL.filter(function (name) { return name !== 'Storage'; }));
});

test('the sidebar lists every tool when storage is blocked', async function () {
    var view = await openApp({}, function () {
        globalThis.localStorage = { getItem: function () { throw new Error('blocked'); }, setItem: function () {} };
    });
    assert.equal(sidebar(view).names.length, EVERY_TOOL.length);
});

test('every tool shows its own registered page', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    assert.deepEqual(shared.zooidTools().map(function (tool) { return tool.page; }), [
        'zooid_dashboard', 'zooid_queue', 'zooid_content', 'zooid_history', 'zooid_metadata', 'zooid_people', 'zooid_users',
        'zooid_servers', 'zooid_storage', 'zooid_statistics', 'zooid_settings', 'zooid_troubleshooting'
    ]);
});

test('every tool page is in Web and names a controller that is there too', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    var missing = [];
    shared.zooidTools().forEach(function (tool) {
        var file = join(paths.configDir, tool.page + '.html');
        if (!existsSync(file)) { missing.push(tool.page + '.html'); return; }
        var controller = /data-controller="__plugin\/([^"]+)"/.exec(readFileSync(file, 'utf8'));
        if (!controller || !existsSync(join(paths.configDir, controller[1]))) missing.push(tool.page + ' controller');
    });
    assert.deepEqual(missing, []);
});

test('every tool page is registered by the plugin', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    var plugin = readFileSync(join(paths.configDir, '..', 'Plugin.cs'), 'utf8');
    var types = (/foreach \(var type in new\[\] \{([^}]*)\}\)/.exec(plugin) || ['', ''])[1];
    var missing = shared.zooidTools().filter(function (tool) {
        var type = tool.page.replace(/^zooid_/, '');
        return plugin.indexOf('"' + tool.page + '"') < 0 && types.indexOf('"' + type + '"') < 0;
    }).map(function (tool) { return tool.page; });
    assert.deepEqual(missing, []);
});

test('each sync type tool has the icon of its Settings section', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    var icons = {};
    shared.zooidTools().forEach(function (tool) { icons[tool.key] = tool.icon; });
    assert.deepEqual([icons.content, icons.history, icons.metadata, icons.people, icons.users], ['video_library', 'history', 'info', 'recent_actors', 'group']);
});

test('the sidebar has its fold button', async function () {
    var view = await openApp({});
    assert.ok(view.querySelector('.stolon-tool-shell-fold'));
});

test('the sync type tools and Statistics leave the sidebar once the stored answers say they are off', async function () {
    var view = await openApp({
        'zooid.contentTab': '0', 'zooid.historyTab': '0', 'zooid.metadataTab': '0', 'zooid.peopleTab': '0', 'zooid.usersTab': '0',
        'zooid.statisticsTab': '0', 'zooid.storageTab': '0'
    });
    assert.deepEqual(sidebar(view).names, ['Dashboard', 'Queue', 'Servers', 'Settings', 'Troubleshooting']);
});

test('a sync type that is off leaves the sidebar once the app reads the config', async function () {
    var view = await openApp({}, null, { EnableContentSync: true, EnableHistorySync: false, EnableMetadataSync: true, EnablePeopleSync: false, EnableUserSync: true });
    await flush();
    assert.deepEqual(sidebar(view).names, ['Dashboard', 'Queue', 'Content', 'Metadata', 'Users', 'Servers', 'Storage', 'Statistics', 'Settings', 'Troubleshooting']);
    assert.equal(view.page.store['zooid.historyTab'], '0');
    assert.equal(view.page.store['zooid.contentTab'], '1');
});

test('a sync type turned back on joins the sidebar once the app reads the config', async function () {
    var view = await openApp({ 'zooid.peopleTab': '0' }, null, { EnableContentSync: false, EnablePeopleSync: true });
    await flush();
    assert.ok(sidebar(view).names.indexOf('People') > 0);
    assert.ok(sidebar(view).names.indexOf('Content') < 0);
});

test('toolFlags shows each sync type tool for its own type, Storage for the library ones, and Statistics for links too', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    var off = { content: '0', history: '0', metadata: '0', people: '0', users: '0', storage: '0', statistics: '0' };
    assert.deepEqual(shared.toolFlags({}), off);
    assert.deepEqual(shared.toolFlags({ EnableUserSync: true }), Object.assign({}, off, { users: '1', statistics: '1' }));
    assert.deepEqual(shared.toolFlags({ EnableHistorySync: true }), Object.assign({}, off, { history: '1', storage: '1', statistics: '1' }));
    assert.deepEqual(shared.toolFlags({ EnablePeopleSync: true }), Object.assign({}, off, { people: '1', statistics: '1' }));
    assert.deepEqual(shared.toolFlags({ Servers: [{ OffersLinks: true }] }), Object.assign({}, off, { statistics: '1' }));
});

test('rememberToolFlags says whether what the sidebar shows changed, and ignores a config without the sync switches', async function () {
    installPage({});
    var shared = await loadScript('zooid_shared.js');
    assert.equal(shared.rememberToolFlags({ Other: true }), false);
    assert.equal(shared.rememberToolFlags(null), false);
    assert.equal(shared.rememberToolFlags({ EnableContentSync: false }), true);
    assert.equal(shared.rememberToolFlags({ EnableContentSync: false }), false);
    assert.equal(shared.rememberToolFlags({ EnableContentSync: true }), true);
});
