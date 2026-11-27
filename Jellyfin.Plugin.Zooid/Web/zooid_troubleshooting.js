// zooid_troubleshooting.js
// The Troubleshooting tool: resets that forget Zooid's tracking of one sync table, or of every table at once.
// Media is never touched. Every reset asks first.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

export default function (view) {
    'use strict';

    var ZooidShared = null;
    var confirmDialog = zooidModule.confirmDialog;
    var escapeHtml, bindClick;

    var made = zooidModule.createZooidPage(view, { page: 'zooid_troubleshooting', bind: function () { bindPage(); }, load: function () { paintTables(); } });
    ZooidShared = made.shared;
    ({ escapeHtml, bindClick } = ZooidShared.pageHelpers());

    // confirmReset
    // Asks in a compact dialog before a reset.
    //
    // Inputs
    // title [string]: The dialog title, which names what is reset.
    // cost [string]: What the reset costs.
    //
    // Output
    // [Promise]: Resolves true when the reset is confirmed.
    function confirmReset(title, cost) {
        return confirmDialog(cost, {
            title: title,
            confirmText: ZooidShared.t.tr('Reset'),
            destructive: true
        });
    }

    // resetTable
    // Asks first, then forgets one sync table's tracking. Media is untouched.
    //
    // Inputs
    // table [string]: The route name of the table.
    // title [string]: The dialog title, naming the table.
    // done [string]: What the status says when the reset worked.
    // failed [string]: What the status says when it did not.
    function resetTable(table, title, done, failed) {
        confirmReset(title, ZooidShared.t.tr('ConfirmResetTableCost')).then(function (confirmed) {
            if (!confirmed) return;

            ZooidShared.apiRequest('Reset/' + table, 'POST').then(function() {
                ZooidShared.setStatus('resetStatus', done, false);
                paintTables();
            }).catch(function(err) {
                console.error('Reset ' + table + ' error:', err);
                ZooidShared.setStatus('resetStatus', failed, true, { timeout: 10000 });
            });
        });
    }

    // resetEntireDatabase
    // Asks first, then forgets the tracking of every sync table. Media is untouched.
    function resetEntireDatabase() {
        confirmReset(ZooidShared.t.tr('TitleResetDatabase'), ZooidShared.t.tr('ConfirmResetDatabaseCost')).then(function (confirmed) {
            if (!confirmed) return;

            ZooidShared.apiRequest('Reset/All', 'POST').then(function() {
                ZooidShared.setStatus('resetStatus', ZooidShared.t.tr('ToastDatabaseReset'), false);
                paintTables();
            }).catch(function(err) {
                console.error('Reset all error:', err);
                ZooidShared.setStatus('resetStatus', ZooidShared.t.tr('ErrorResetDatabase'), true, { timeout: 10000 });
            });
        });
    }

    // Each table's reset button, by the name the counts route gives the table.
    var TABLE_BUTTONS = { Content: 'btnResetContentTable', History: 'btnResetHistoryTable', Metadata: 'btnResetMetadataTable', People: 'btnResetPeopleTable', Playlists: 'btnResetPlaylistTable', Users: 'btnResetUserTable' };

    // paintTables
    // Colors each table's tile by what it holds: the accent while it has rows a reset would forget, gray while it is
    // empty. A table with rows shows how many in a badge beside its name. A table whose count cannot be read keeps the
    // accent and shows no badge.
    function paintTables() {
        return ZooidShared.apiRequest('Tables', 'GET').then(function (counts) {
            Object.keys(TABLE_BUTTONS).forEach(function (table) {
                var button = view.querySelector('#' + TABLE_BUTTONS[table]);
                var row = button && button.closest('.stolon-reset-row');
                if (!row) return;
                var count = counts ? counts[table] : undefined;
                zooidModule.setCollapsibleTile(row.querySelector('.stolon-collapsible-tile'), count === 0 ? 'gray' : null);
                var title = row.querySelector('.stolon-reset-info > div');
                var badge = row.querySelector('.zooid-table-count');
                if (typeof count === 'number' && count > 0 && title) {
                    if (!badge) {
                        badge = zooidModule.make('span', 'stolon-badge stolon-blue zooid-table-count');
                        title.appendChild(document.createTextNode(' '));
                        title.appendChild(badge);
                    }
                    badge.textContent = ZooidShared.t.format(count === 1 ? 'BadgeRecordOne' : 'BadgeRecordMany', count.toLocaleString());
                    badge.hidden = false;
                } else if (badge) {
                    badge.hidden = true;
                }
            });
        }).catch(function () { /* the tiles keep the accent */ });
    }

    // bindPage
    // Wires the reset buttons. Stolon calls it once, the first time the page shows.
    function bindPage() {
        bindClick('btnResetContentTable', function() { resetTable('Content', ZooidShared.t.tr('TitleResetContentTable'), ZooidShared.t.tr('ToastContentTableReset'), ZooidShared.t.tr('ErrorResetContentTable')); });
        bindClick('btnResetHistoryTable', function() { resetTable('History', ZooidShared.t.tr('TitleResetHistoryTable'), ZooidShared.t.tr('ToastHistoryTableReset'), ZooidShared.t.tr('ErrorResetHistoryTable')); });
        bindClick('btnResetMetadataTable', function() { resetTable('Metadata', ZooidShared.t.tr('TitleResetMetadataTable'), ZooidShared.t.tr('ToastMetadataTableReset'), ZooidShared.t.tr('ErrorResetMetadataTable')); });
        bindClick('btnResetPeopleTable', function() { resetTable('People', ZooidShared.t.tr('TitleResetPeopleTable'), ZooidShared.t.tr('ToastPeopleTableReset'), ZooidShared.t.tr('ErrorResetPeopleTable')); });
        bindClick('btnResetPlaylistTable', function() { resetTable('Playlists', ZooidShared.t.tr('TitleResetPlaylistTable'), ZooidShared.t.tr('ToastPlaylistTableReset'), ZooidShared.t.tr('ErrorResetPlaylistTable')); });
        bindClick('btnResetUserTable', function() { resetTable('Users', ZooidShared.t.tr('TitleResetUserTable'), ZooidShared.t.tr('ToastUserTableReset'), ZooidShared.t.tr('ErrorResetUserTable')); });
        bindClick('btnResetEntireDatabase', resetEntireDatabase);
    }
}
