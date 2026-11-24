// zooid_queue.js
// The Change queue tool: the hints this server sends and receives. It refreshes itself while it shows and stops
// when it is left. The list itself is built by zooid_sync_queue.js.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

export default function (view) {
    'use strict';

    var queue = null;
    var started = false;

    var made = zooidModule.createZooidPage(view, {
        page: 'zooid_queue',
        load: function () { show(); },
        onHide: function () { if (queue) queue.stopAutoRefresh(); }
    });

    var ready = import('./configurationpage?name=zooid_sync_queue.js').then(function (module) {
        queue = module.createQueueModule({ view: view, shared: made.shared, confirmDialog: zooidModule.confirmDialog });
        return queue;
    });

    // Reads the config for the server list, then loads the queue and keeps it fresh while it shows.
    function show() {
        ready.then(function () {
            made.shared.getConfig().then(function (config) { queue._config = config; }, function () { /* the list still loads */ }).then(function () {
                if (!started) {
                    started = true;
                    queue.init();
                } else {
                    queue._signature = null;
                    queue.load(true);
                }
                queue.startAutoRefresh();
            });
        });
    }
}
