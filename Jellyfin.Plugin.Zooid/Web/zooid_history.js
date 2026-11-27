// zooid_history.js
// The History tool: the history sync table, its counts, and the details of one row. zooid_sync_page.js builds it.

import * as syncPage from './configurationpage?name=zooid_sync_page.js';

export default function (view) {
    syncPage.createSyncTypePage(view, 'history');
}
