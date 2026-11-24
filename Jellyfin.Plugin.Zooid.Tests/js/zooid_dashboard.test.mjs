// zooid_dashboard.test.mjs
// Tests for zooid_dashboard.js: what each card says, its color, and the tool it opens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPage, loadScript } from './support.mjs';

var CONTENT = { enable: 'EnableContentSync', route: 'Status', view: 'content', stats: 'Content', title: 'SyncTypeContent', icon: 'movie' };

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
    assert.equal(card.tool, 'sync');
    assert.equal(card.param, 'content');
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
    assert.equal(mod.syncTypeCard(strings, CONTENT, true, { Synced: 1 }, runs.slice(0, 1)).sparkline, undefined);
});

test('the servers card counts the servers turned on, and says when there are none', async function () {
    var mod = await dashboard();
    var card = mod.serversCard(strings, { Servers: [{ IsEnabled: true }, { IsEnabled: false }] });
    assert.equal(card.value, 1);
    assert.equal(card.detail, 'DashboardServersLine:1,2');
    assert.equal(card.tool, 'servers');
    assert.equal(mod.serversCard(strings, { Servers: [] }).detail, 'DashboardNoServers');
});

test('the queue card opens the queue and turns red while received changes keep failing', async function () {
    var mod = await dashboard();
    var card = mod.queueCard(strings, { Pending: 4, InboundCount: 2, InboundFailingCount: 1 });
    assert.equal(card.value, 4);
    assert.equal(card.statusColor, 'red');
    assert.equal(card.tool, 'queue');
    assert.equal(mod.queueCard(strings, { Pending: 4 }).statusColor, 'orange');
    assert.equal(mod.queueCard(strings, {}).statusColor, 'green');
});
