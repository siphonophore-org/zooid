// zooid_people.js
// The People tool: the people sync table, its counts, and the details of one person. zooid_sync_page.js builds it.

import * as syncPage from './configurationpage?name=zooid_sync_page.js';

export default function (view) {
    syncPage.createSyncTypePage(view, 'people');
}
