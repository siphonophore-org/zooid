// zooid_dashboard.js
// The Dashboard tool: one status card for the servers, one for the change queue, and one for each sync type.
// A card opens the tool it sums up, and a sync type card opens the Sync tool on that sync type. The page only reads.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

// SYNC_TYPES
// Each sync type in the order the Sync tool lists them: its config switch, its status route, the Sync view it
// opens, the key the Statistics route names it by, its title's string key, and its icon.
var SYNC_TYPES = [
    { enable: 'EnableContentSync', route: 'Status', view: 'content', stats: 'Content', title: 'SyncTypeContent', icon: 'movie' },
    { enable: 'EnableHistorySync', route: 'HistoryStatus', view: 'history', stats: 'History', title: 'SyncTypeHistory', icon: 'history' },
    { enable: 'EnableMetadataSync', route: 'MetadataStatus', view: 'metadata', stats: 'Metadata', title: 'LabelMetadata', icon: 'description' },
    { enable: 'EnablePeopleSync', route: 'PeopleStatus', view: 'people', stats: 'People', title: 'People', icon: 'person' },
    { enable: 'EnableUserSync', route: 'UserStatus', view: 'users', stats: 'User', title: 'HeaderUsers', icon: 'group' }
];

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
// [object]: The status card's options, with tool and param for the tool it opens.
export function syncTypeCard(t, type, on, status, runs) {
    var card = { icon: type.icon, title: t.tr(type.title) };
    if (!on) {
        return Object.assign(card, { status: t.tr('Off'), statusColor: 'gray', detail: t.tr('DashboardTypeOff'), tool: 'settings' });
    }
    card.tool = 'sync';
    card.param = type.view;
    if (!status) return Object.assign(card, { status: t.tr('HeaderError'), statusColor: 'red', detail: t.tr('DashboardLoadFailed') });
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
    }
    return card;
}

// serversCard
// Sums up the servers: how many are turned on, out of how many there are.
//
// Inputs
// t [object]: The strings.
// config [object]: The plugin configuration.
//
// Output
// [object]: The status card's options, with tool for the tool it opens.
export function serversCard(t, config) {
    var servers = (config && config.Servers) || [];
    var on = servers.filter(function (server) { return server.IsEnabled; }).length;
    var card = { icon: 'dns', title: t.tr('TabServers'), value: on, tool: 'servers' };
    if (!servers.length) return Object.assign(card, { status: t.tr('Off'), statusColor: 'gray', detail: t.tr('DashboardNoServers') });
    return Object.assign(card, {
        status: on ? t.tr('StatusSynced') : t.tr('Off'),
        statusColor: on ? 'green' : 'gray',
        detail: t.format('DashboardServersLine', on, servers.length)
    });
}

// queueCard
// Sums up the change queue: the hints waiting to send, and any received that keep failing.
//
// Inputs
// t [object]: The strings.
// hints [object]: What the Hints route answered, or null when it could not be read.
//
// Output
// [object]: The status card's options, with tool and param for the tool it opens.
export function queueCard(t, hints) {
    var card = { icon: 'swap_horiz', title: t.tr('HeaderChangeQueue'), tool: 'queue' };
    if (!hints) return Object.assign(card, { status: t.tr('HeaderError'), statusColor: 'red', detail: t.tr('DashboardLoadFailed') });
    var failing = hints.InboundFailingCount || 0;
    card.value = hints.Pending || 0;
    card.detail = t.format('DashboardQueueLine', hints.InboundCount || 0, failing);
    if (failing > 0) return Object.assign(card, { status: t.tr('LabelFailed'), statusColor: 'red' });
    if (card.value > 0) return Object.assign(card, { status: t.tr('StatusPending'), statusColor: 'orange' });
    return Object.assign(card, { status: t.tr('StatusSynced'), statusColor: 'green' });
}

export default function (view) {
    'use strict';

    var apiRequest, getEl;
    var grid = null;

    var made = zooidModule.createZooidPage(view, { page: 'zooid_dashboard', load: function () { load(); }, onHide: function () { clear(); } });
    ({ apiRequest, getEl } = made.shared.pageHelpers());

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
        grid.setCards(cards.map(function (card) {
            var options = Object.assign({}, card);
            delete options.tool;
            delete options.param;
            options.onClick = function () { zooidModule.openTool(view, card.tool, card.param); };
            return options;
        }));
    }

    function load() {
        var status = getEl('dashboardStatus');
        if (status) status.textContent = '';
        var t = made.shared.t;
        made.shared.getConfig().then(function (config) {
            made.shared.rememberContentSync(config);
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
                draw([serversCard(t, config), queueCard(t, answers[0])].concat(types.map(function (entry, i) {
                    return syncTypeCard(t, entry.type, entry.on, answers[2][i], runsOf(entry.type.stats));
                })));
            });
        }).catch(function () {
            clear();
            if (status) status.textContent = t.tr('ErrorDashboardLoad');
        });
    }
}
