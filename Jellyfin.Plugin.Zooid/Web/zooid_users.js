// zooid_users.js
// The Users tool: the user sync table, its counts, and the details of one user. zooid_sync_page.js builds it.

import * as syncPage from './configurationpage?name=zooid_sync_page.js';

export default function (view) {
    syncPage.createSyncTypePage(view, 'users');
}
