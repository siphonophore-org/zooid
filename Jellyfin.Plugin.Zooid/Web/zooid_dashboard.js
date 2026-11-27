// zooid_dashboard.js
// The Dashboard tool: one status card for the servers, one for the change queue, and one for each sync type.
// A card opens the tool it sums up, and a sync type card opens that sync type's tool. The page only reads.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

// SYNC_TYPES
// Each sync type in the order the sidebar lists them: its config switch, its status route, the tool it opens, the
// key the Statistics route names it by, its title's string key, and its icon, the same as its tool's.
var SYNC_TYPES = [
    { enable: 'EnableContentSync', route: 'Status', view: 'content', stats: 'Content', title: 'SyncTypeContent', icon: 'video_library' },
    { enable: 'EnableHistorySync', route: 'HistoryStatus', view: 'history', stats: 'History', title: 'SyncTypeHistory', icon: 'history' },
    { enable: 'EnableMetadataSync', route: 'MetadataStatus', view: 'metadata', stats: 'Metadata', title: 'LabelMetadata', icon: 'info' },
    { enable: 'EnablePeopleSync', route: 'PeopleStatus', view: 'people', stats: 'People', title: 'People', icon: 'recent_actors' },
    { enable: 'EnableUserSync', route: 'UserStatus', view: 'users', stats: 'User', title: 'HeaderUsers', icon: 'group' }
];

// EMPTY_CHART
// The flat gray line a card shows when it has nothing to chart, so every card keeps the same shape and the cards in
// a row line up.
var EMPTY_CHART = { sparkline: [0, 0], sparklineColor: 'gray' };

// syncTypeCard
// Sums up one sync type. A type that is off says so and opens Settings. Failed rows win over pending ones.
//
// Inputs
// t [object]: The strings.
// type [object]: The sync type, from SYNC_TYPES.
// on [boolean]: Whether the sync type is on.
// status [object]: What its status route answered, or null when it could not be read.
// runs [object[]]: Its last scans from the Statistics route, oldest first, or nothing.
//
// Output
// [object]: The status card's options, with tool for the tool it opens.
export function syncTypeCard(t, type, on, status, runs) {
    var card = Object.assign({ icon: type.icon, title: t.tr(type.title) }, EMPTY_CHART);
    if (!on) {
        return Object.assign(card, { value: '\u2014', status: t.tr('Off'), statusColor: 'gray', detail: t.tr('DashboardTypeOff'), tool: 'settings' });
    }
    card.tool = type.view;
    if (!status) return Object.assign(card, { value: '\u2014', status: t.tr('HeaderError'), statusColor: 'red', detail: t.tr('DashboardLoadFailed') });
    var waiting = (status.Pending || 0) + (status.Queued || 0);
    var failed = status.Errored || 0;
    card.value = status.Synced || 0;
    card.valueLabel = t.tr('StatusSynced').toLowerCase();
    card.detail = t.format('DashboardCountsLine', waiting, failed);
    if (failed > 0) Object.assign(card, { status: t.tr('LabelFailed'), statusColor: 'red' });
    else if (waiting > 0) Object.assign(card, { status: t.tr('StatusPending'), statusColor: 'orange' });
    else Object.assign(card, { status: t.tr('StatusSynced'), statusColor: 'green' });
    if (runs && runs.length > 1) {
        card.sparkline = runs.map(function (run) { return (run.Added || 0) + (run.Updated || 0) + (run.Removed || 0); });
        delete card.sparklineColor;
    }
    return card;
}

// SERVER_HEALTH
// Each server health in the order the health bar draws them, with its color and the string that names its part:
// green runs Zooid, orange answers without it, red cannot be reached, gray is off or still being checked.
var SERVER_HEALTH = [
    { state: 'ok', color: 'green', key: 'DashboardHealthOk' },
    { state: 'noPlugin', color: 'orange', key: 'DashboardHealthNoPlugin' },
    { state: 'down', color: 'red', key: 'DashboardHealthDown' },
    { state: 'disabled', color: 'gray', key: 'DashboardHealthOff' },
    { state: 'pending', color: 'gray', key: 'DashboardHealthChecking' }
];

// serverState
// A server's health before or after it is asked, as the Servers page works it out. A server that is off or has no
// address or key needs no asking.
//
// Inputs
// server [object]: The server entry.
// check [object]: What Hints/CheckPeer answered, null when the ask failed, or undefined before it is asked.
//
// Output
// [string]: A state of SERVER_HEALTH.
export function serverState(server, check) {
    if (server.IsEnabled === false) return 'disabled';
    if (!server.Url || !server.ApiKey) return 'down';
    if (check === undefined) return 'pending';
    if (!check || !check.Reachable) return 'down';
    return check.HasPlugin ? 'ok' : 'noPlugin';
}

// serversCard
// Sums up the servers: how many are turned on, out of how many there are, with one bar split by health.
//
// Inputs
// t [object]: The strings.
// config [object]: The plugin configuration.
// checks [object]: What Hints/CheckPeer answered for each server, by key. A server not in it is still being asked.
//
// Output
// [object]: The status card's options, with tool for the tool it opens.
export function serversCard(t, config, checks) {
    var servers = (config && config.Servers) || [];
    var on = servers.filter(function (server) { return server.IsEnabled; }).length;
    var card = { icon: 'dns', title: t.tr('TabServers'), value: on, tool: 'servers' };
    if (!servers.length) return Object.assign(card, EMPTY_CHART, { status: t.tr('Off'), statusColor: 'gray', detail: t.tr('DashboardNoServers') });
    var states = servers.map(function (server) { return serverState(server, (checks || {})[server.Key]); });
    card.segments = SERVER_HEALTH.map(function (health) {
        return { label: t.tr(health.key), value: states.filter(function (s) { return s === health.state; }).length, color: health.color };
    });
    return Object.assign(card, {
        status: on ? t.tr('OptionEnabled') : t.tr('Off'),
        statusColor: on ? 'green' : 'gray',
        detail: t.format('DashboardServersLine', on, servers.length)
    });
}

// queueCard
// Sums up the change queue as a column per state, in the colors of the Queue page's count cards. The number is
// everything in the columns.
//
// Inputs
// t [object]: The strings.
// hints [object]: What the Hints route answered, or null when it could not be read.
//
// Output
// [object]: The status card's options, with tool for the tool it opens.
export function queueCard(t, hints) {
    var card = { icon: 'swap_horiz', title: t.tr('ButtonQueue'), tool: 'queue' };
    if (!hints) return Object.assign(card, EMPTY_CHART, { value: '\u2014', status: t.tr('HeaderError'), statusColor: 'red', detail: t.tr('DashboardLoadFailed') });
    var counts = hints.OutboundCounts || {};
    var failing = hints.InboundFailingCount || 0;
    card.bars = [
        { label: t.tr('StatusGathering'), value: (hints.Gathering || []).length || hints.Pending || 0, color: 'gray' },
        { label: t.tr('StatusPending'), value: counts.Pending || 0, color: 'orange' },
        { label: t.tr('StatusSent'), value: counts.Sent || 0, color: 'blue' },
        { label: t.tr('StatusReceived'), value: hints.InboundCount || 0, color: 'purple' },
        { label: t.tr('LabelFailed'), value: counts.Failed || 0, color: 'red' }
    ];
    card.value = card.bars.reduce(function (sum, part) { return sum + part.value; }, 0);
    card.detail = t.format('DashboardQueueLine', hints.InboundCount || 0, failing);
    if (failing > 0 || counts.Failed > 0) return Object.assign(card, { status: t.tr('LabelFailed'), statusColor: 'red' });
    if (card.value > 0) return Object.assign(card, { status: t.tr('StatusPending'), statusColor: 'orange' });
    return Object.assign(card, { status: t.tr('PriorityIdle'), statusColor: 'gray' });
}

export default function (view) {
    'use strict';

    var apiRequest, getEl, requestFor;
    var grid = null;

    var made = zooidModule.createZooidPage(view, { page: 'zooid_dashboard', load: function () { load(); }, onHide: function () { clear(); } });
    ({ apiRequest, getEl, requestFor } = made.shared.pageHelpers());

    function clear() {
        if (grid) grid.destroy();
        grid = null;
        var holder = getEl('dashboardCards');
        if (holder) holder.innerHTML = '';
    }

    // Reads a route, answering null when it fails, so one card that cannot load never hides the others.
    function read(path) {
        return apiRequest(path, 'GET').catch(function () { return null; });
    }

    function draw(cards) {
        clear();
        // The grid goes on the page before its cards, so its rows are balanced to the width they have.
        grid = zooidModule.createStatusCardGrid({ minWidth: 240 });
        getEl('dashboardCards').appendChild(grid.element);
        return grid.setCards(cards.map(function (card) {
            var options = Object.assign({}, card);
            delete options.tool;
            options.onClick = function () { zooidModule.openTool(view, card.tool); };
            return options;
        }));
    }

    // Asks each server that is on and has an address whether it answers and runs Zooid, and redraws the health bar as
    // each answer comes. A later load drops the answers of an earlier one.
    var loads = 0;
    function checkServers(config, card) {
        var load = loads;
        var checks = {};
        var redraw = function () {
            if (load !== loads || !card) return;
            var next = serversCard(made.shared.t, config, checks);
            if (next.segments) card.setSegments(next.segments);
        };
        ((config && config.Servers) || []).forEach(function (server) {
            if (server.IsEnabled === false || !server.Url || !server.ApiKey) return;
            var request = requestFor(server);
            request.Mode = server.Mode === 1 ? 'Push' : server.Mode === 2 ? 'Sync' : (typeof server.Mode === 'string' ? server.Mode : 'Pull');
            apiRequest('Hints/CheckPeer', 'POST', request).then(function (result) {
                checks[server.Key] = result || null;
            }, function () {
                checks[server.Key] = null;
            }).then(redraw);
        });
    }

    function load() {
        loads++;
        var status = getEl('dashboardStatus');
        if (status) status.textContent = '';
        var t = made.shared.t;
        made.shared.getConfig().then(function (config) {
            var types = SYNC_TYPES.map(function (type) { return { type: type, on: !!config[type.enable] }; });
            return Promise.all([
                read('Hints'),
                read('Statistics'),
                Promise.all(types.map(function (entry) { return entry.on ? read(entry.type.route) : Promise.resolve(null); }))
            ]).then(function (answers) {
                var stats = answers[1];
                var runsOf = function (key) {
                    var found = stats && stats.Types ? stats.Types.filter(function (type) { return type.Key === key; })[0] : null;
                    return found ? found.Runs : null;
                };
                var handles = draw([serversCard(t, config, {}), queueCard(t, answers[0])].concat(types.map(function (entry, i) {
                    return syncTypeCard(t, entry.type, entry.on, answers[2][i], runsOf(entry.type.stats));
                })));
                checkServers(config, handles && handles[0]);
            });
        }).catch(function () {
            clear();
            if (status) status.textContent = t.tr('ErrorDashboardLoad');
        });
    }
}
