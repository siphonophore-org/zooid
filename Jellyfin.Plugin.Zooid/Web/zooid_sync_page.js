// zooid_sync_page.js
// Builds the tool of one sync type from the table kit in zooid_sync_table.js and that type's own module.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

// SYNC_PAGES
// Each sync type tool by its key: its registered page, the module that builds its table, and the module's builder.
export var SYNC_PAGES = {
    content: { page: 'zooid_content', script: 'zooid_sync_content.js', build: 'createContentSyncTableModule' },
    history: { page: 'zooid_history', script: 'zooid_sync_history.js', build: 'createHistorySyncTableModule' },
    metadata: { page: 'zooid_metadata', script: 'zooid_sync_metadata.js', build: 'createMetadataSyncTableModule' },
    people: { page: 'zooid_people', script: 'zooid_sync_people.js', build: 'createPeopleSyncTableModule' },
    users: { page: 'zooid_users', script: 'zooid_sync_users.js', build: 'createUserSyncTableModule' }
};

// createSyncTypePage
// Wires one sync type's tool. The first show loads its table, and each show after reads the config again, so a
// change saved on another tool reaches the rows and the details. Hiding the tool stops its task pollers and its
// table's scroll observer.
//
// Inputs
// view [HTMLElement]: The tool's view, which the tool app passes to the controller.
// type [string]: The sync type's key in SYNC_PAGES.
//
// Output
// [object]: shared is the Zooid helper bag, and ready resolves with the type's module once it is built.
export function createSyncTypePage(view, type) {
    'use strict';

    var spec = SYNC_PAGES[type];
    var polls = [];
    var module = null;
    var controller = null;
    var opened = false;

    var made = zooidModule.createZooidPage(view, {
        page: spec.page,
        load: function () { ready.then(show); },
        onHide: hide
    });

    // Relative specifiers so a server hosted under a base URL still resolves them.
    var ready = Promise.all([
        import('./configurationpage?name=zooid_sync_table.js'),
        import('./configurationpage?name=' + spec.script),
        made.shared.translations
    ]).then(function (loaded) {
        var ctx = {
            view: view,
            shared: made.shared,
            createPaginatedTable: zooidModule.createPaginatedTable,
            bindSidecar: zooidModule.bindSidecar,
            confirmDialog: zooidModule.confirmDialog,
            createDialogItem: zooidModule.createDialogItem,
            activePollIntervals: polls
        };
        var kit = loaded[0].createSyncTableKit(ctx);
        module = loaded[1][spec.build](ctx, kit);
        controller = loaded[1].createContentPageController
            ? loaded[1].createContentPageController(ctx, module)
            : { init: function () { kit.openSyncView(module); } };
        return module;
    });

    // show
    // Opens the table the first time, and after that picks up scrolling again and hands the module a fresh config.
    function show() {
        if (!opened) {
            opened = true;
            controller.init();
            return;
        }
        if (module.table && module.table.reconnectObserver) module.table.reconnectObserver();
        made.shared.getConfig().then(function (config) {
            module.currentConfig = config;
            // The pending filters follow the approval modes, which are set on the Settings tool.
            if (module.table && module.updatePendingFilterVisibility) module.updatePendingFilterVisibility(config);
        }, function () { /* the module keeps the config it has */ });
    }

    // hide
    // Stops every task poller and the table's scroll observer.
    function hide() {
        polls.forEach(function (handle) {
            if (handle && typeof handle.cancel === 'function') handle.cancel();
        });
        polls.length = 0;
        if (module && module.table && module.table.disconnectObserver) module.table.disconnectObserver();
    }

    return { shared: made.shared, ready: ready };
}
