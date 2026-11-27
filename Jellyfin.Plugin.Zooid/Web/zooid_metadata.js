// zooid_metadata.js
// The Metadata tool: the metadata sync table, its counts, and the details of one item. zooid_sync_page.js builds it.

import * as syncPage from './configurationpage?name=zooid_sync_page.js';

export default function (view) {
    syncPage.createSyncTypePage(view, 'metadata');
}
