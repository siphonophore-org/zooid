// zooid_content.js
// The Content tool: the content sync table, its counts, and the details of one file. zooid_sync_page.js builds it.

import * as syncPage from './configurationpage?name=zooid_sync_page.js';

export default function (view) {
    syncPage.createSyncTypePage(view, 'content');
}
