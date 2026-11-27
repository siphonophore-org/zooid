// zooid_dashboard.test.mjs
// Tests for zooid_dashboard.js: what each card says, its color, and the tool it opens, and Recent activity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript, settle } from './support.mjs';

var CONTENT = { enable: 'EnableContentSync', route: 'Status', view: 'content', stats: 'Content', title: 'SyncTypeContent', icon: 'video_library' };

// strings
// A strings handle that answers with the key, and with the key and its values for a format.
var strings = {
    tr: function (key) { return key; },
    format: function (key) { return key + ':' + Array.prototype.slice.call(arguments, 1).join(','); }
};

async function dashboard() {
    installPage({});
    return loadScript('zooid_dashboard.js');
}

test('a sync type that is off says so and opens Settings', async function () {
    var mod = await dashboard();
    var card = mod.syncTypeCard(strings, CONTENT, false, null, null);
    assert.equal(card.status, 'Off');
    assert.equal(card.statusColor, 'gray');
    assert.equal(card.tool, 'settings');
});

test('failed rows win over waiting ones and color the card red', async function () {
    var mod = await dashboard();
    var card = mod.syncTypeCard(strings, CONTENT, true, { Synced: 40, Pending: 2, Queued: 1, Errored: 3 }, null);
    assert.equal(card.status, 'LabelFailed');
    assert.equal(card.statusColor, 'red');
    assert.equal(card.value, 40);
    assert.equal(card.detail, 'DashboardCountsLine:3,3');
    assert.equal(card.tool, 'content');
    assert.equal('param' in card, false);
});

test('waiting rows with none failed color the card orange, and none at all green', async function () {
    var mod = await dashboard();
    assert.equal(mod.syncTypeCard(strings, CONTENT, true, { Synced: 1, Pending: 1 }, null).statusColor, 'orange');
    assert.equal(mod.syncTypeCard(strings, CONTENT, true, { Synced: 1 }, null).statusColor, 'green');
});

test('a status that could not be read says so in red', async function () {
    var mod = await dashboard();
    var card = mod.syncTypeCard(strings, CONTENT, true, null, null);
    assert.equal(card.statusColor, 'red');
    assert.equal(card.detail, 'DashboardLoadFailed');
});

test('the last scans draw a sparkline of what each found, once there are two', async function () {
    var mod = await dashboard();
    var runs = [{ Added: 1, Updated: 2, Removed: 0 }, { Added: 0, Updated: 0, Removed: 5 }];
    assert.deepEqual(mod.syncTypeCard(strings, CONTENT, true, { Synced: 1 }, runs).sparkline, [3, 5]);
    assert.deepEqual(mod.syncTypeCard(strings, CONTENT, true, { Synced: 1 }, runs.slice(0, 1)).sparkline, [0, 0]);
});

test('the servers card counts the servers turned on, and says when there are none', async function () {
    var mod = await dashboard();
    var card = mod.serversCard(strings, { Servers: [{ Key: 'a', IsEnabled: true }, { Key: 'b', IsEnabled: false }] }, {});
    assert.equal(card.value, 1);
    assert.equal(card.detail, 'DashboardServersLine:1,2');
    assert.equal(card.tool, 'servers');
    assert.equal(card.status, 'OptionEnabled');
    assert.equal(mod.serversCard(strings, { Servers: [] }, {}).detail, 'DashboardNoServers');
});

test('the queue card draws a column per state in the Queue page colors, and totals them', async function () {
    var mod = await dashboard();
    var card = mod.queueCard(strings, { Gathering: [{}, {}], OutboundCounts: { Pending: 3, Sent: 1, Failed: 0 }, InboundCount: 4, InboundFailingCount: 0 });
    assert.deepEqual(card.bars.map(function (p) { return [p.label, p.value, p.color]; }), [
        ['StatusGathering', 2, 'gray'], ['StatusPending', 3, 'orange'], ['StatusSent', 1, 'blue'], ['StatusReceived', 4, 'purple'], ['LabelFailed', 0, 'red']
    ]);
    assert.equal(card.value, 10);
    assert.equal(card.statusColor, 'orange');
    assert.equal(card.tool, 'queue');
});

test('the queue card turns red while changes keep failing, and is idle when empty', async function () {
    var mod = await dashboard();
    assert.equal(mod.queueCard(strings, { InboundCount: 1, InboundFailingCount: 1 }).statusColor, 'red');
    assert.equal(mod.queueCard(strings, { OutboundCounts: { Failed: 2 } }).statusColor, 'red');
    var idle = mod.queueCard(strings, {});
    assert.equal(idle.status, 'PriorityIdle');
    assert.equal(idle.value, 0);
});

test('every card keeps a chart, a flat gray one when there is nothing to draw, so a row of cards lines up', async function () {
    var mod = await dashboard();
    var off = mod.syncTypeCard(strings, CONTENT, false, null, null);
    assert.deepEqual(off.sparkline, [0, 0]);
    assert.equal(off.sparklineColor, 'gray');
    assert.equal(off.value, '\u2014');
    assert.deepEqual(mod.serversCard(strings, { Servers: [] }, {}).sparkline, [0, 0]);
});

test('the servers card draws one bar split by health, whatever the number of servers', async function () {
    var mod = await dashboard();
    var servers = [
        { Key: 'ok', IsEnabled: true, Url: 'http://a', ApiKey: 'k' },
        { Key: 'bare', IsEnabled: true, Url: 'http://b', ApiKey: 'k' },
        { Key: 'down', IsEnabled: true, Url: 'http://c', ApiKey: 'k' },
        { Key: 'off', IsEnabled: false, Url: 'http://d', ApiKey: 'k' },
        { Key: 'wait', IsEnabled: true, Url: 'http://e', ApiKey: 'k' },
        { Key: 'nokey', IsEnabled: true, Url: 'http://f', ApiKey: '' }
    ];
    var checks = { ok: { Reachable: true, HasPlugin: true }, bare: { Reachable: true, HasPlugin: false }, down: null };
    var card = mod.serversCard(strings, { Servers: servers }, checks);
    assert.equal(card.dots, undefined);
    assert.deepEqual(card.segments.map(function (p) { return [p.label, p.value, p.color]; }), [
        ['DashboardHealthOk', 1, 'green'], ['DashboardHealthNoPlugin', 1, 'orange'], ['DashboardHealthDown', 2, 'red'], ['DashboardHealthOff', 1, 'gray'], ['DashboardHealthChecking', 1, 'gray']
    ]);
    assert.equal(mod.serversCard(strings, { Servers: servers.slice(0, 1) }, checks).segments[0].value, 1);
});

// relative
// A helper bag whose relative time names the date it was given, so a test can see which date each item used.
var relative = { formatRelativeTime: function (date) { return 'ago:' + date.toISOString(); } };

test('activity entries become timeline items with their time, title, overview, and kind icon', async function () {
    var mod = await dashboard();
    var items = mod.activityItems([
        { Date: '2026-11-27T12:00:00.000Z', Name: 'Items synced', Overview: '3 items from Den', Type: 'Zooid.HintsApplied', Severity: 'Information' },
        { Date: '2026-11-27T11:00:00.000Z', Name: 'Sending paused', Type: 'Zooid.PeerPaused', Severity: 'Warning' }
    ], relative);
    assert.deepEqual(items[0], { time: 'ago:2026-11-27T12:00:00.000Z', datetime: '2026-11-27T12:00:00.000Z', title: 'Items synced', icon: 'sync', body: '3 items from Den' });
    assert.equal(items[1].icon, 'pause_circle');
    assert.equal('body' in items[1], false);
});

test('only warnings and errors take a status, orange and red', async function () {
    var mod = await dashboard();
    var status = function (severity) { return mod.activityItems([{ Date: '2026-11-27T12:00:00Z', Name: 'x', Type: 'ZooidAttention', Severity: severity }], relative)[0].status; };
    assert.equal(status('Warning'), 'orange');
    assert.equal(status('Error'), 'red');
    assert.equal(status('Critical'), 'red');
    assert.equal(status('Information'), undefined);
});

test('each kind of entry Zooid writes has its own icon, and an unknown one falls back to sync', async function () {
    var mod = await dashboard();
    var types = ['Zooid.HintsApplied', 'Zooid.HintsDropped', 'Zooid.HintsRetrying', 'Zooid.PeerPaused', 'Zooid.HintRejected', 'Zooid.HintResent', 'ZooidAttention'];
    var icons = mod.activityItems(types.map(function (type) { return { Date: '2026-11-27T12:00:00Z', Name: type, Type: type }; }), relative).map(function (item) { return item.icon; });
    assert.equal(new Set(icons).size, types.length);
    assert.equal(mod.activityItems([{ Date: '2026-11-27T12:00:00Z', Name: 'x', Type: 'Zooid.Other' }], relative)[0].icon, 'sync');
});

test('an activity answer that is missing or not a list gives no items', async function () {
    var mod = await dashboard();
    assert.deepEqual(mod.activityItems(null, relative), []);
    assert.deepEqual(mod.activityItems({}, relative), []);
});

// openPage
// Loads the Dashboard over a view that holds its elements, answers every route, with activity for the Activity
// route, and shows the page.
async function openPage(activity) {
    var page = installPage({ config: { Servers: [] } });
    var view = page.dom.el('div', {}, ['dashboardStatus', 'dashboardCards', 'dashboardActivity'].map(function (id) { return page.dom.el('div', { id: id }); }));
    page.dom.document.documentElement.appendChild(view);
    globalThis.ApiClient.fetch = function (options) {
        page.requests.push(options);
        return Promise.resolve(/\/Activity$/.test(String(options.url).split('?')[0]) ? activity : {});
    };
    var mod = await loadScript('zooid_dashboard.js');
    mod.default(view);
    view.dispatch('viewshow');
    await settle();
    return { page: page, view: view };
}

test('the page lists the activity in a fixed Recent activity section that grows to fit', async function () {
    var opened = await openPage([
        { Date: new Date().toISOString(), Name: 'Items synced', Overview: '3 items from Den', Type: 'Zooid.HintsApplied', Severity: 'Information' },
        { Date: new Date().toISOString(), Name: 'Changes rejected', Type: 'Zooid.HintRejected', Severity: 'Error' }
    ]);
    var holder = opened.view.querySelector('#dashboardActivity');
    assert.equal(holder.querySelector('.stolon-collapsible-title').textContent, 'Recent activity');
    assert.equal(holder.querySelector('.stolon-collapsible-tile').textContent, 'receipt_long');
    assert.equal(holder.querySelector('button.stolon-collapsible-header'), null);
    assert.deepEqual(Array.from(holder.querySelectorAll('.stolon-timeline-title')).map(function (el) { return el.textContent; }), ['Items synced', 'Changes rejected']);
    assert.equal(holder.querySelectorAll('.stolon-timeline-item')[1].classList.contains('stolon-red'), true);
    assert.equal(holder.querySelector('.stolon-timeline-wrap').style.maxHeight || '', '');
    assert.ok(opened.page.requests.some(function (r) { return /Activity$/.test(String(r.url)); }));
});

test('with no activity the section says so', async function () {
    var opened = await openPage([]);
    assert.match(opened.view.querySelector('#dashboardActivity').textContent, /No activity yet\./);
});
