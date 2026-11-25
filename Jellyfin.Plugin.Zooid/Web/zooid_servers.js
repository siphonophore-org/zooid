// zooid_servers.js
// The Servers page: each server's steps, and its library and user mappings.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

// urlWasCleared
// Says whether a saved entry's Server URL was emptied in the editor.
//
// Inputs
// storedUrl [string]: The Server URL saved for the entry, or null for an entry never saved.
// editedUrl [string]: The Server URL in the editor.
//
// Output
// [boolean]: True when a saved address would be replaced by nothing.
export function urlWasCleared(storedUrl, editedUrl) {
    return !!(storedUrl || '').trim() && !(editedUrl || '').trim();
}

// zooid_servers
// Builds the Servers page. It draws the server list, edits one server at a time, tests its
// connection and sign in, and edits its library and user mappings.
//
// Inputs
// view [HTMLElement]: The page the dashboard passes to the controller.
export default function (view) {
    'use strict';

    var ZooidShared = null;
    var createSortableCardList = null;
    var createChoiceGroup = null;
    var confirmDialog = null;

    // Helpers called by bare name, taken from the shared bag.
    var escapeHtml, apiRequest, setVisible, bindClick, getEl, setChecked, getChecked, setValue, getValue, requestFor;

    // Stolon runs bindPage once and loadConfig each time the page shows.
    var made = zooidModule.createZooidPage(view, { page: 'zooid_servers', bind: function () { bindPage(); }, load: function () { loadConfig(); } });
    ZooidShared = made.shared;
    createSortableCardList = zooidModule.createSortableCardList;
    createChoiceGroup = zooidModule.createChoiceGroup;
    confirmDialog = zooidModule.confirmDialog;
    ({ escapeHtml, apiRequest, setVisible, bindClick, getEl, setChecked, getChecked, setValue, getValue, requestFor } = ZooidShared.pageHelpers());


    var currentConfig = null;
    var sourceLibraries = [];
    var localLibraries = [];
    var sourceUsers = [];
    var localUsers = [];

    // The Save Bar that ends the server editor, made when the page binds.
    var saveBars = zooidModule.createSaveBars(made.page);
    var serverBar = null;

    // markEdited
    // Marks the editor unsaved after a change no field reports, such as a mapping row added or removed.
    function markEdited() {
        if (serverBar) saveBars.markDirty(serverBar);
    }

    // The configured servers live in config.Servers in rank order. The page
    // keeps that array in memory, edits one entry at a time through a single
    // editor, and posts the whole array on save. Keys round-trip so a renamed
    // or reordered entry keeps its stored API key and its sync rows.

    var servers = [];
    var selectedIndex = -1;

    function newServerKey() {
        var guid = (ZooidShared.generateGuid ? ZooidShared.generateGuid() : '') || '';
        guid = String(guid).replace(/-/g, '');
        if (guid.length === 32) return guid;
        var out = '';
        for (var i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
        return out;
    }

    function selectedServer() {
        return selectedIndex >= 0 && selectedIndex < servers.length ? servers[selectedIndex] : null;
    }

    // The entry with this key in the current list. A save replaces every entry with a fresh copy, so an
    // answer that arrives after one looks its server up again by key. Writing into the object it started
    // with would change a copy the page no longer shows or saves.
    function serverByKey(key) {
        return servers.find(function (s) { return s.Key === key; }) || null;
    }

    // Whether the server an answer belongs to is still the one open in the editor. A slow answer for a
    // server the operator has since moved away from must not be written into another server's editor,
    // where the next save would store it under that server.
    function stillSelected(key) {
        var open = selectedServer();
        return !!open && open.Key === key;
    }

    // The value a mapping select stands for: what is picked, or the saved id when the list it chooses
    // from could not be loaded, so a failed fetch never saves an empty id over a working mapping.
    function pickedValue(select) {
        return (select && (select.value || select.dataset.savedValue)) || '';
    }

    function pickedName(select) {
        if (!select) return '';
        if (select.value && select.options[select.selectedIndex]) return select.options[select.selectedIndex].textContent;
        return select.dataset.savedName || '';
    }

    // Last known reachability per entry key, for the dot on each card.
    var serverHealth = {};

    // Whether the mapping rows of the open server have been rendered from fetched libraries and users.
    // Until then the rows' selects are empty, and reading them back would save blank mappings.
    var mappingsLoaded = false;

    // The shared card list owns selection, folding, arrows, and drag. This page renders a card's text
    // and reads the editor back before the open card changes.
    var cards = null;

    function serverTitle(server) {
        return server.Name || server.ServerName || server.Url || ZooidShared.t.tr('ServerNewName');
    }

    // modeName
    // Names a server's mode in the viewer's language.
    //
    // Inputs
    // mode [string]: Pull, Push, or Sync.
    //
    // Output
    // [string]: The mode's name.
    function modeName(mode) {
        if (mode === 'Push') return ZooidShared.t.tr('ModePush');
        if (mode === 'Sync') return ZooidShared.t.tr('TabSync');
        return ZooidShared.t.tr('ModePull');
    }

    function modeBadgeClass(mode) {
        return mode === 'Sync' ? 'purple' : mode === 'Push' ? 'blue' : 'green';
    }

    function cardSpec(server) {
        var health = serverHealth[server.Key] || (server.Url && server.ApiKey ? 'unknown' : 'none');
        var badges = [{ label: modeName(server.Mode || 'Pull'), cls: modeBadgeClass(server.Mode || 'Pull') }];
        if (server.IsEnabled === false) badges.push({ label: ZooidShared.t.tr('Disabled'), cls: 'gray' });
        var dotTitles = {
            ok: ZooidShared.t.tr('HealthReachable'),
            bad: ZooidShared.t.tr('HealthNotReachable'),
            checking: ZooidShared.t.tr('StatusChecking'),
            unknown: ZooidShared.t.tr('HealthNotChecked'),
            none: ZooidShared.t.tr('HealthNotConfigured')
        };
        return {
            title: serverTitle(server),
            subtitle: server.Url || ZooidShared.t.tr('ServerNoUrl'),
            badges: badges,
            dot: health,
            dotTitle: dotTitles[health],
            disabled: server.IsEnabled === false
        };
    }

    function ensureCards() {
        if (cards) return cards;
        cards = createSortableCardList(getEl('serverList'), {
            items: servers,
            editor: getEl('serverEditor'),
            render: cardSpec,
            escapeHtml: escapeHtml,
            // Clicking the open card's head folds it, and another card's head switches to that card.
            onBeforeLeave: function () { collectServerEditor(); },
            onSelect: function (index) {
                selectedIndex = index;
                loadServerEditor();
            },
            onMove: function () {
                selectedIndex = cards.getSelected();
                saveServers(ZooidShared.t.tr('ToastServerOrderSaved'), ZooidShared.t.tr('ErrorServerOrderSave'), null, 'serverListStatus');
            }
        });
        return cards;
    }

    function renderServerList() {
        ensureCards().setItems(servers);
        setVisible('serverEmpty', servers.length === 0);
    }

    function modeOf(server) {
        var mode = server.Mode;
        return mode === 1 ? 'Push' : mode === 2 ? 'Sync' : (typeof mode === 'string' ? mode : 'Pull');
    }

    // Updates each card's dot in place. A full render rebuilds the cards and moves the open editor,
    // which takes the cursor out of whatever field the operator is typing in.
    function updateHealthDots() {
        view.querySelectorAll('#serverList .stolon-card-item').forEach(function (card) {
            var server = servers[parseInt(card.getAttribute('data-index'), 10)];
            var dot = card.querySelector('.stolon-card-item-title .stolon-dot');
            if (!server || !dot) return;
            var spec = cardSpec(server);
            var color = { ok: 'green', bad: 'red', checking: 'orange', unknown: 'gray' }[spec.dot];
            if (!color) return;
            dot.className = 'stolon-dot ' + color;
            dot.title = spec.dotTitle || '';
            dot.setAttribute('aria-label', spec.dotTitle || '');
        });
    }

    // Tests every configured entry in the background so the dots mean something. Entries with the
    // kept sentinel resolve to their stored key on the server.
    function refreshServerHealth() {
        servers.forEach(function (server) {
            if (!server.Url || !server.ApiKey) return;
            serverHealth[server.Key] = 'checking';
            apiRequest('TestConnection', 'POST', requestFor(server)).then(function (response) {
                serverHealth[server.Key] = response && response.Success ? 'ok' : 'bad';
                if (response && response.Success) {
                    if (response.IsAdministrator === true) server.AccessLevel = 'Administrator';
                    else if (response.IsAdministrator === false) server.AccessLevel = 'User';
                    if (response.UserId) {
                        server.AuthenticatedUserId = response.UserId;
                        server.AuthenticatedUser = response.UserName || server.AuthenticatedUser || '';
                    }
                    if (response.CanDownload === true || response.CanDownload === false) server.CanDownload = response.CanDownload;
                    server.SyncAccess = response.SyncAccess || '';
                    server.SyncAccessMessage = response.SyncAccessMessage || '';
                    if (stillSelected(server.Key)) reflectAccess(server);
                }
            }).catch(function () {
                serverHealth[server.Key] = 'bad';
            }).then(function () {
                updateHealthDots();
            });
        });
        renderServerList();
    }

    // Either a pasted API key or a sign in that yields a token. The two never show at once.

    var authGroup = null;
    var modeGroup = null;

    function getAuthMethod() {
        return (authGroup && authGroup.get()) || 'key';
    }

    function setAuthMethod(method) {
        if (authGroup) authGroup.set(method);
        reflectAuthMethod();
    }

    function reflectAuthMethod() {
        var method = getAuthMethod();
        setVisible('authKeyPanel', method === 'key');
        setVisible('authUserPanel', method === 'user');
        reflectAddressChange();
    }

    function normalizeId(id) {
        return (id || '').replace(/-/g, '').toLowerCase();
    }

    function isStandardUser(server) {
        return !!server && server.AccessLevel === 'User';
    }

    function maySyncUser(server, sourceUserId) {
        if (!isStandardUser(server)) return true;
        return !!sourceUserId && normalizeId(sourceUserId) === normalizeId(server.AuthenticatedUserId);
    }

    // accessRows
    // Lists what the key can do there, one row for each module, from the access the last test or sign in found.
    //
    // Inputs
    // server [object]: The open server.
    //
    // Output
    // [array[]]: Each row as the key of its title, its state, and its text.
    function accessRows(server) {
        var t = ZooidShared.t;
        var admin = server.AccessLevel === 'Administrator';
        var who = server.AuthenticatedUser || t.tr('AccessThisUser');
        var downloads = server.CanDownload === false
            ? ['no', t.format('AccessDownloadsRefused', server.AuthenticatedUser || t.tr('AccessThisAccount'))]
            : ['ok', t.tr('AccessAllowed')];
        if (admin) {
            return [
                ['AccessContentListing', 'ok', t.tr('AccessContentAll')],
                ['AccessFileDownloads', downloads[0], downloads[1]],
                ['AccessMetadata', 'ok', t.tr('PermissionEveryItem')],
                ['AccessWatchHistory', 'ok', t.tr('AccessMappedUsers')],
                ['AccessUserSettings', 'ok', t.tr('AccessMappedUsers')],
                ['Playlists', 'ok', t.tr('AccessPlaylistsAll')],
                ['AccessTwoWayHistory', 'ok', t.tr('AccessTwoWayAll')],
                ['AccessPushAndSync', 'ok', t.tr('AccessPushAll')]
            ];
        }
        return [
            ['AccessContentListing', 'limited', t.format('AccessContentLimited', who)],
            ['AccessFileDownloads', downloads[0], downloads[1]],
            ['AccessMetadata', 'limited', t.format('AccessMetadataLimited', who)],
            ['AccessWatchHistory', 'limited', t.format('AccessHistoryLimited', who)],
            ['AccessUserSettings', 'limited', t.format('AccessSettingsLimited', who)],
            ['Playlists', 'limited', t.format('AccessPlaylistsLimited', who)],
            ['AccessTwoWayHistory', 'limited', t.format('AccessTwoWayLimited', who)],
            ['AccessPushAndSync', 'limited', t.format('AccessPushLimited', who)]
        ];
    }

    // The key of each access state's badge.
    var ACCESS_LABELS = { ok: 'LabelAvailable', limited: 'BadgeLimited', no: 'BadgeUnavailable', none: 'LabelNotInstalled' };
    var ACCESS_BADGES = { ok: 'green', limited: 'orange', no: 'red', none: 'gray' };

    function syncAccessRow(server) {
        if (!server.SyncAccess) return null;
        var state = server.SyncAccess === 'Allowed' ? 'ok' : server.SyncAccess === 'NotInstalled' ? 'none' : 'no';
        var detail = server.SyncAccessMessage || '';
        if (state === 'no') detail = ZooidShared.t.format('AccessSyncRoutesFix', detail);
        return ['AccessSyncRoutes', state, detail];
    }

    // What the key can do there, learned by the last test or sign in.
    function reflectAccess(server) {
        var level = (server && server.AccessLevel) || '';
        var known = level === 'Administrator' || level === 'User';
        setVisible('accessUnknown', !!server && !!server.Url && !known);
        setVisible('accessSummary', known);
        if (known) {
            var headline = getEl('accessHeadline');
            if (headline) {
                headline.className = 'zooid-mb-md ' + (level === 'Administrator' ? 'stolon-callout-success' : 'stolon-callout-warn');
                headline.textContent = level !== 'Administrator'
                    ? ZooidShared.t.format('AccessStandardAs', server.AuthenticatedUser || ZooidShared.t.tr('AccessUnknownUser'))
                    : server.AuthenticatedUser ? ZooidShared.t.format('AccessAdminAs', server.AuthenticatedUser) : ZooidShared.t.tr('AccessAdmin');
            }
            var rows = getEl('accessRows');
            if (rows) {
                var list = accessRows(server);
                var endpoints = syncAccessRow(server);
                var reach = !endpoints ? ['limited', ZooidShared.t.tr('AccessCheckingRoutes')] : endpoints[1] !== 'ok' ? ['no', ZooidShared.t.tr('AccessNeedsRoutes')] : null;
                if (reach) {
                    list = list.map(function (row) {
                        return row[0] === 'AccessTwoWayHistory' || row[0] === 'AccessPushAndSync' ? [row[0], reach[0], reach[1]] : row;
                    });
                }
                if (endpoints) list.unshift(endpoints);
                rows.innerHTML = list.map(function (row) {
                    return '<div class="zooid-access-row">' +
                        '<div class="zooid-access-text">' +
                            '<div class="zooid-access-title">' + escapeHtml(ZooidShared.t.tr(row[0])) + '</div>' +
                            '<div class="zooid-access-description">' + escapeHtml(row[2]) + '</div>' +
                        '</div>' +
                        '<span class="stolon-badge ' + ACCESS_BADGES[row[1]] + '">' + escapeHtml(ZooidShared.t.tr(ACCESS_LABELS[row[1]])) + '</span>' +
                        '</div>';
                }).join('');
            }
        }
        reflectModeLimits(server);
        reflectUserLimits(server);
    }

    function reflectModeLimits(server) {
        setVisible('modeLimited', isStandardUser(server) && getMode() !== 'Pull');
    }

    function reflectUserLimits(server) {
        var limited = isStandardUser(server);
        var note = getEl('usersLimited');
        if (note) {
            note.textContent = limited
                ? ZooidShared.t.format('WarnStandardUserKey', server.AuthenticatedUser || ZooidShared.t.tr('AccessThatUser'))
                : '';
        }
        setVisible('usersLimited', limited);
        updateUserSelects();
    }

    function reflectSignedIn(server) {
        var signedIn = !!(server && server.AuthenticatedUser);
        setVisible('authSignedIn', signedIn);
        var note = getEl('authSignedIn');
        // The user's name is set in bold, so the sentence is escaped first and the name put in after.
        if (note) note.innerHTML = signedIn ? escapeHtml(ZooidShared.t.tr('MessageSignedInAs')).replace('{0}', '<strong>' + escapeHtml(server.AuthenticatedUser) + '</strong>') : '';
    }

    // A token the page never saw round trips as the sentinel. Anything stored comes back encrypted.
    function SecretLooksStored(value) {
        return typeof value === 'string' && value.indexOf('enc:') === 0;
    }

    // Whether two server addresses name the same server, ignoring case and a trailing slash. Mirrors
    // the server's own rule, which decides whether a saved key or token may go to an address.
    function sameServerUrl(a, b) {
        var left = (a || '').trim();
        var right = (b || '').trim();
        try {
            var ua = new URL(left);
            var ub = new URL(right);
            return ua.protocol === ub.protocol
                && ua.hostname.toLowerCase() === ub.hostname.toLowerCase()
                && ua.port === ub.port
                && ua.pathname.replace(/\/+$/, '').toLowerCase() === ub.pathname.replace(/\/+$/, '').toLowerCase();
        } catch (e) {
            return left.replace(/\/+$/, '').toLowerCase() === right.replace(/\/+$/, '').toLowerCase();
        }
    }

    // The address saved for an entry, or null for an entry that was never saved.
    function storedUrlFor(key) {
        var saved = currentConfig && currentConfig.Servers
            ? currentConfig.Servers.find(function (s) { return s.Key === key; })
            : null;
        return saved ? (saved.Url || '') : null;
    }

    // Whether the open entry holds a saved key or token that the edited address would lose. The server
    // only keeps a saved secret for the address it was saved with, so a new address needs a new key
    // or a new sign in. A token from a sign in made on this page is new and belongs to the new address.
    function savedSecretLeftBehind(server) {
        if (!server || !(server.ApiKey === ZooidShared.SECRET_KEPT || SecretLooksStored(server.ApiKey))) return false;
        var stored = storedUrlFor(server.Key);
        // An emptied address is refused on save, so it never costs the entry its key.
        if (urlWasCleared(stored, getValue('txtSourceServerUrl', ''))) return false;
        return stored !== null && !sameServerUrl(getValue('txtSourceServerUrl', ''), stored);
    }

    // Clears the kept placeholder and says what to do while the address differs from the saved one,
    // and puts the placeholder back when the address returns to it.
    function reflectAddressChange() {
        var server = selectedServer();
        // A new address may be another server, so whether it runs Zooid is asked again.
        if (server) delete peerPlugin[server.Key];
        var moved = savedSecretLeftBehind(server);
        var keyField = getEl('txtSourceServerApiKey');
        if (keyField) {
            if (moved && keyField.value === ZooidShared.SECRET_KEPT) keyField.value = '';
            if (!moved && !keyField.value && server && server.ApiKey) keyField.value = ZooidShared.SECRET_KEPT;
        }
        var note = getEl('savedSecretNote');
        if (note) {
            note.textContent = !moved ? '' : getAuthMethod() === 'user'
                ? ZooidShared.t.format('WarnSignInUrlChanged', storedUrlFor(server.Key))
                : ZooidShared.t.format('WarnApiKeyUrlChanged', storedUrlFor(server.Key));
        }
        setVisible('savedSecretNote', moved);
    }

    function getMode() {
        return (modeGroup && modeGroup.get()) || 'Pull';
    }

    function setMode(mode) {
        if (modeGroup) modeGroup.set(mode);
        reflectMode();
    }

    function reflectMode() {
        setVisible('peerCheckArea', true);
        reflectStream();
        reflectModeLimits(selectedServer());
        ZooidShared.setStatus('peerCheckStatus', '', false);
        setVisible('peerCheckResult', false);
    }

    // The answer to a link check: a verdict in the color of its severity, then one line for each
    // thing learned, with a badge. A check that ended early has only a sentence, shown beside the button.
    function showPeerCheck(result) {
        var severity = (result && result.Severity) || 'error';
        var rows = (result && result.Details) || [];
        if (!rows.length) {
            setVisible('peerCheckResult', false);
            ZooidShared.setStatus('peerCheckStatus', (result && result.Message) || ZooidShared.t.tr('ErrorNoAnswer'), severity !== 'ok', { timeout: 0 });
            return;
        }
        ZooidShared.setStatus('peerCheckStatus', '', false);
        var headline = getEl('peerCheckHeadline');
        if (headline) {
            headline.className = 'zooid-mb-md ' + (severity === 'ok' ? 'stolon-callout-success' : severity === 'warn' ? 'stolon-callout-warn' : 'stolon-callout-error');
            headline.textContent = result.Headline || result.Message;
        }
        var grid = getEl('peerCheckRows');
        if (grid) {
            grid.innerHTML = rows.map(function (row) {
                return '<div class="zooid-access-row">' +
                    '<div class="zooid-access-text">' +
                        '<div class="zooid-access-title">' + escapeHtml(row.Title) + '</div>' +
                        '<div class="zooid-access-description">' + escapeHtml(row.Text) + '</div>' +
                    '</div>' +
                    '<span class="stolon-badge ' + (ACCESS_BADGES[row.State] || 'gray') + '">' + escapeHtml(row.Badge) + '</span>' +
                    '</div>';
            }).join('');
        }
        setVisible('peerCheckResult', true);
    }

    // Asks the other server whether it runs Zooid, accepts hints, and lists this server, so a
    // link that would only fail in the queue is caught here.
    function checkPeer() {
        var server = collectServerEditor();
        if (!server) return;
        if (!server.Url || !server.ApiKey) {
            ZooidShared.setStatus('peerCheckStatus', ZooidShared.t.tr('ErrorEnterUrlAndKey'), true);
            return;
        }
        ZooidShared.setStatus('peerCheckStatus', ZooidShared.t.tr('StatusCheckingWork'), false, { timeout: 0 });
        setVisible('peerCheckResult', false);
        var key = server.Key;
        var request = requestFor(server);
        request.Mode = getMode();
        ZooidShared.apiRequest('Hints/CheckPeer', 'POST', request).then(function (result) {
            peerPlugin[key] = result && result.Reachable ? (result.HasPlugin ? 'yes' : 'no') : 'unreachable';
            if (stillSelected(key)) reflectLinkingPlugin();
            if (result && result.Reachable) {
                serverHealth[key] = 'ok';
                var current = serverByKey(key);
                if (current && result.ServerName) current.ServerName = result.ServerName;
                if (current && result.ServerId) current.ServerId = result.ServerId;
            }
            // The status line belongs to whichever server is open, so an answer for one the operator has
            // left only updates that server's dot.
            if (!stillSelected(key)) {
                updateHealthDots();
                return;
            }
            showPeerCheck(result);
            if (result && result.Reachable) renderServerList();
        }).catch(function () {
            if (!stillSelected(key)) return;
            ZooidShared.setStatus('peerCheckStatus', ZooidShared.t.tr('ErrorCheckLink'), true);
        });
    }

    // Fills the editor from the selected entry. The stored key is never shown. The sentinel
    // round-trips and the server keeps the existing secret.
    function loadServerEditor() {
        var server = selectedServer();
        if (!server) return;

        setValue('txtServerName', server.Name || '');
        setMode(server.Mode || 'Pull');
        setChecked('chkServerEnabled', server.IsEnabled !== false);
        setValue('txtSourceServerUrl', server.Url || '');
        setValue('txtSourceServerExternalUrl', server.ExternalUrl || '');
        setChecked('chkAllowPrivateNetwork', server.AllowPrivateNetwork !== false);
        setChecked('chkAllowLinking', server.AllowLinking === true);
        setValue('txtLinkMaxStreams', String(server.LinkMaxStreams || 0));
        setChecked('chkLinkCountOwnSessions', server.LinkCountOwnSessions === true);
        setChecked('chkLinkHonorBitrateLimit', server.LinkHonorBitrateLimit === true);
        fillFallbackUsers(server.LinkFallbackUserId || '');
        reflectLinking();
        clampUserStreams();
        setValue('txtSourceServerApiKey', server.ApiKey ? ZooidShared.SECRET_KEPT : '');
        setValue('txtAuthUsername', server.AuthenticatedUser || '');
        setValue('txtAuthPassword', '');
        setAuthMethod(server.AuthenticatedUser ? 'user' : 'key');
        reflectSignedIn(server);
        reflectAccess(server);
        reflectAddressChange();

        var nameEl = getEl('txtSourceServerName');
        var idEl = getEl('txtSourceServerId');
        if (nameEl) nameEl.textContent = server.ServerName || ZooidShared.t.tr('Unknown');
        if (idEl) idEl.textContent = server.ServerId || ZooidShared.t.tr('Unknown');
        setVisible('serverInfoContainer', !!(server.ServerName || server.ServerId));

        var authUserEl = getEl('txtAuthenticatedUser');
        if (authUserEl) authUserEl.textContent = server.AuthenticatedUser || '';
        setVisible('authenticatedUserRow', !!server.AuthenticatedUser);

        ZooidShared.setStatus('connectionStatus', '', false);
        ZooidShared.setStatus('tokenGeneratorStatus', '', false);

        sourceLibraries = [];
        sourceUsers = [];
        var configured = !!(server.Url && server.ApiKey);
        setMappingSectionsVisible(configured);
        if (configured) {
            loadMappings(server.Key);
        } else {
            renderLibraryMappings([]);
            renderUserMappings([]);
            setMappingsLoaded(true);
        }
    }

    // Marks whether the open server's mapping rows are ready, and enables the add buttons only then. A
    // row added before the lists arrive would be wiped when the fetched mappings are rendered.
    function setMappingsLoaded(loaded) {
        mappingsLoaded = loaded;
        ['btnAddMapping', 'btnAddUserMapping'].forEach(function (id) {
            var btn = getEl(id);
            if (btn) btn.disabled = !loaded;
        });
    }

    // Fetches the libraries and users of the server with this key, then renders its mapping rows from
    // them. The rows on screen are replaced by a loading note at once, so rows left over from the server
    // shown before, or from before a reconnect, can never be edited and then silently dropped.
    function loadMappings(key) {
        setMappingsLoaded(false);
        clearMappingContainer('libraryMappingsContainer', ZooidShared.t.tr('StatusLoadingLibraryMappings'));
        clearMappingContainer('userMappingsContainer', ZooidShared.t.tr('StatusLoadingUserMappings'));
        var server = serverByKey(key);
        if (!server) return Promise.resolve();
        return Promise.all([fetchSourceLibraries(server), fetchSourceUsers(server)]).then(function () {
            if (!stillSelected(key)) return;
            var current = serverByKey(key);
            renderLibraryMappings((current && current.LibraryMappings) || []);
            renderUserMappings((current && current.UserMappings) || []);
            setMappingsLoaded(true);
        });
    }

    // Empties a mapping container and shows a note in place of its rows when one is given.
    function clearMappingContainer(containerId, note) {
        var container = getEl(containerId);
        if (!container) return;
        container.innerHTML = '';
        if (note) {
            var noteEl = document.createElement('div');
            noteEl.className = 'fieldDescription';
            noteEl.textContent = note;
            container.appendChild(noteEl);
        }
    }

    function setMappingSectionsVisible(visible) {
        setVisible('librariesSection', visible);
        setVisible('usersSection', visible);
        setVisible('librariesLocked', !visible);
        setVisible('usersLocked', !visible);
    }

    // Reads the editor back into the selected entry.
    function collectServerEditor() {
        var server = selectedServer();
        if (!server) return null;
        server.Name = getValue('txtServerName', '').trim();
        server.Mode = getMode();
        server.IsEnabled = getChecked('chkServerEnabled');
        // Read before the address is taken from the editor. The saved secret stays with the saved
        // address, so the entry carries no key until one is entered or signed in again.
        var secretLeftBehind = savedSecretLeftBehind(server);
        server.Url = getValue('txtSourceServerUrl', '').trim();
        server.ExternalUrl = getValue('txtSourceServerExternalUrl', '').trim();
        server.AllowPrivateNetwork = getChecked('chkAllowPrivateNetwork');
        server.AllowLinking = getChecked('chkAllowLinking');
        clampUserStreams();
        server.LinkMaxStreams = Math.max(0, parseInt(getValue('txtLinkMaxStreams', '0'), 10) || 0);
        server.LinkCountOwnSessions = getChecked('chkLinkCountOwnSessions');
        server.LinkHonorBitrateLimit = getChecked('chkLinkHonorBitrateLimit');
        server.LinkFallbackUserId = getValue('selLinkFallbackUser', '');
        if (getAuthMethod() === 'key') {
            var apiKey = getValue('txtSourceServerApiKey', '').trim();
            // Text typed after the kept placeholder is a new key, never the placeholder plus a suffix.
            if (apiKey.length > ZooidShared.SECRET_KEPT.length && apiKey.indexOf(ZooidShared.SECRET_KEPT) === 0) {
                apiKey = apiKey.substring(ZooidShared.SECRET_KEPT.length);
            }
            // An empty field on an entry that has a stored key means "keep it", the same as the sentinel,
            // unless the address changed, which the stored key may not follow.
            server.ApiKey = apiKey || (server.ApiKey && !secretLeftBehind ? ZooidShared.SECRET_KEPT : '');
            // A pasted key belongs to no signed in user.
            if (apiKey && apiKey !== ZooidShared.SECRET_KEPT) {
                server.AuthenticatedUser = '';
                server.AuthenticatedUserId = '';
                server.AccessLevel = '';
                server.CanDownload = null;
                server.SyncAccess = '';
                server.SyncAccessMessage = '';
            }
        } else if (!server.ApiKey) {
            server.ApiKey = '';
        } else if (secretLeftBehind) {
            // The token was issued by the saved address. A new address needs a new sign in.
            server.ApiKey = '';
            server.AuthenticatedUser = '';
            server.AuthenticatedUserId = '';
            server.AccessLevel = '';
            server.CanDownload = null;
            server.SyncAccess = '';
            server.SyncAccessMessage = '';
        } else {
            // Signed in: the token lives in the entry already, and the field is not in play.
            server.ApiKey = server.ApiKey === ZooidShared.SECRET_KEPT || SecretLooksStored(server.ApiKey) ? ZooidShared.SECRET_KEPT : server.ApiKey;
        }
        // Mapping rows are read back only once they were rendered from fetched data, otherwise a save
        // made while they load, such as a reorder, would replace real mappings with blank ones.
        if (mappingsLoaded && !getEl('librariesSection').classList.contains('stolon-hidden')) {
            server.LibraryMappings = collectLibraryMappings();
        }
        if (mappingsLoaded && !getEl('usersSection').classList.contains('stolon-hidden')) {
            server.UserMappings = collectUserMappings();
        }
        return server;
    }

    function selectServer(index) {
        ensureCards().setItems(servers);
        setVisible('serverEmpty', servers.length === 0);
        if (servers.length === 0 || index < 0) {
            selectedIndex = -1;
            cards.setSelected(-1);
            return;
        }
        // setSelected raises onSelect, which sets selectedIndex and loads the editor.
        cards.setSelected(Math.max(0, Math.min(index, servers.length - 1)));
    }

    function setStepOpen(target, open) {
        var header = view.querySelector('.stolon-collapsible-header[data-target="' + target + '"]');
        var content = getEl(target);
        if (!header || !content) return;
        header.classList.toggle('stolon-collapsed', !open);
        content.classList.toggle('stolon-collapsed', !open);
        header.setAttribute('aria-expanded', String(open));
    }

    // The steps start closed. A brand new server has nothing to do but connect, so that step opens.
    function addServer() {
        collectServerEditor();
        setStepOpen('serverStepConnection', true);
        setStepOpen('serverStepAuthentication', true);
        servers.push({
            Key: newServerKey(),
            Name: '',
            Url: '',
            ExternalUrl: '',
            AllowPrivateNetwork: true,
            ApiKey: '',
            AuthenticatedUser: '',
            AuthenticatedUserId: '',
            ServerName: '',
            ServerId: '',
            Mode: 'Pull',
            IsEnabled: true,
            LibraryMappings: [],
            UserMappings: []
        });
        selectServer(servers.length - 1);
        markEdited();
    }

    function deleteServer() {
        var server = selectedServer();
        if (!server) return;
        var label = server.Name || server.ServerName || server.Url || ZooidShared.t.tr('ServerThisServer');
        var question = '<p>' + escapeHtml(ZooidShared.t.format('ConfirmRemoveServer', label)) + '</p>' +
            '<p>' + escapeHtml(ZooidShared.t.tr('ConfirmRemoveServerDetail')) + '</p>';
        confirmDialog(question, {
            html: true,
            title: ZooidShared.t.tr('ButtonRemoveServer'),
            confirmText: ZooidShared.t.tr('ButtonRemove'),
            destructive: true
        }).then(function (confirmed) {
            // A save landing while the dialog is open replaces the entries with fresh copies, so the
            // entry removed is found again by its key.
            var removedIndex = servers.findIndex(function (s) { return s === server || (server.Key && s.Key === server.Key); });
            if (!confirmed || removedIndex < 0) {
                return;
            }
            var removedKey = servers[removedIndex].Key;
            var removedId = servers[removedIndex].ServerId || '';

            // The list on the page changes only once the save lands. Removing it first would leave the page
            // showing a list the server never kept, and the rows would be forgotten for a server still in use.
            var remaining = servers.filter(function (s, i) { return i !== removedIndex; });
            saveServers(ZooidShared.t.tr('ToastServerRemoved'), ZooidShared.t.tr('ErrorServerRemove'), remaining, 'serverListStatus').then(function (saved) {
                if (!saved) {
                    return;
                }

                selectServer(servers.length > 0 ? Math.min(removedIndex, servers.length - 1) : -1);
                // The rows it tracked and the hints it sent have nothing to pull from now. Failing to clear
                // them is not fatal. The tables simply keep inert rows until a reset.
                if (removedKey) {
                    apiRequest('Servers/' + encodeURIComponent(removedKey) + '/Rows' + (removedId ? '?serverId=' + encodeURIComponent(removedId) : ''), 'DELETE').catch(function () {});
                }
            });
        });
    }

    // persistServers
    // Posts the in memory list. The server resolves kept sentinels against the stored entry with the same key,
    // so keys are never retyped. A list other than the page's own, such as the list without a server being
    // removed, can be saved, and becomes the page's list only on success. The whole list is saved, so the
    // editor holds nothing unsaved afterwards.
    //
    // Inputs
    // list [object[]]: The list to save, instead of the page's own.
    //
    // Output
    // [Promise]: Resolves once the save landed, and rejects when it did not.
    function persistServers(list) {
        var snapshot = JSON.parse(JSON.stringify(list || servers));
        // A save made for another reason never empties a saved address.
        snapshot.forEach(function (entry) {
            var stored = storedUrlFor(entry.Key);
            if (urlWasCleared(stored, entry.Url)) entry.Url = stored;
        });
        return ZooidShared.saveSection(function (config) {
            keepStoredStorageFields(config.Servers, snapshot);
            config.Servers = snapshot;
        }).then(function (saved) {
            // The saved list becomes the page's list. Its entries are fresh copies, which is why answers
            // that arrive later look their server up again with serverByKey.
            currentConfig = saved;
            if (currentConfig && currentConfig.Servers) {
                servers = currentConfig.Servers;
                renderServerList();
            }
            saveBars.clean();
        });
    }

    // saveServers
    // Saves the list for an action outside the editor's Save Bar, such as a reorder, and reports on a status line.
    //
    // Inputs
    // successMessage [string]: What the status says when the save landed.
    // failureMessage [string]: What the status says when it did not.
    // list [object[]]: The list to save, instead of the page's own.
    // statusId [string]: The status element that reports the result.
    //
    // Output
    // [Promise]: Resolves true when the save landed.
    function saveServers(successMessage, failureMessage, list, statusId) {
        return persistServers(list).then(function () {
            ZooidShared.setStatus(statusId, successMessage, false);
            return true;
        }, function () {
            ZooidShared.setStatus(statusId, failureMessage, true, { timeout: 10000 });
            return false;
        });
    }

    // Push and Sync, and a library kept as links, only work when the other server runs a Zooid
    // this one can talk to. A plain Jellyfin server can only be pulled from, as copies. So a server
    // that answers and does not run it, or runs one too far from this version, is not saved that way. One that cannot be reached is saved, since it cannot be asked.
    // The Save Bar shows a refusal as its failed line, and an unreachable server as its saved line.
    function saveServerConfig() {
        var server = collectServerEditor();
        if (!server) return Promise.reject(new Error(ZooidShared.t.tr('ErrorServerSave')));
        if (urlWasCleared(storedUrlFor(server.Key), server.Url)) {
            return Promise.reject(new Error(ZooidShared.t.tr('ErrorEnterUrlNotSaved')));
        }
        var links = (server.LibraryMappings || []).some(function (m) { return m.IsEnabled !== false && (m.StorageMode === 'Link' || m.StorageMode === 1); });
        if ((modeOf(server) === 'Pull' && !links) || !server.Url || !server.ApiKey) {
            return persistServers();
        }

        var request = requestFor(server);
        request.Mode = modeOf(server);
        return apiRequest('Hints/CheckPeer', 'POST', request).catch(function () { return null; }).then(function (result) {
            if (result && result.Reachable && !result.HasPlugin) {
                peerPlugin[server.Key] = 'no';
                throw new Error(ZooidShared.t.format('ErrorPeerNoPlugin', serverTitle(server)));
            }
            // Its Zooid and this one cannot talk until one is updated, which leaves it where a
            // server without Zooid is: nothing sent to it would be taken, and no link would play.
            if (result && result.Reachable && result.Incompatible) {
                throw new Error(ZooidShared.t.format('ErrorPeerIncompatible', result.Message || ZooidShared.t.format('ErrorPeerIncompatibleReason', serverTitle(server))));
            }

            return persistServers().then(function () {
                return result && !result.Reachable ? ZooidShared.t.tr('ToastServerSavedUnreachable') : '';
            });
        });
    }

    function testConnection() {
        var server = collectServerEditor();
        if (!server) return;

        if (!server.Url || !server.ApiKey) {
            ZooidShared.setStatus('connectionStatus', ZooidShared.t.tr('ErrorEnterUrlAndKey'), true);
            return;
        }

        ZooidShared.setStatus('connectionStatus', ZooidShared.t.tr('StatusTesting'), false, { timeout: 0 });

        var key = server.Key;
        apiRequest('TestConnection', 'POST', requestFor(server)).then(function(response) {
            if (!stillSelected(key)) {
                serverHealth[key] = response && response.Success ? 'ok' : 'bad';
                updateHealthDots();
                return;
            }

            if (response && response.Success) {
                // The editor is read back into the entry that holds this key now. A save while the test
                // ran replaced the entry it started with, and the operator may have edited fields since.
                var current = collectServerEditor();
                ZooidShared.setStatus('connectionStatus', ZooidShared.t.format('ToastConnectedTo', response.ServerName || ZooidShared.t.tr('ServerTheServer')), false);
                current.ServerName = response.ServerName || '';
                current.ServerId = response.ServerId || '';
                if (response.IsAdministrator === true) current.AccessLevel = 'Administrator';
                else if (response.IsAdministrator === false) current.AccessLevel = 'User';
                if (response.UserId) {
                    current.AuthenticatedUserId = response.UserId;
                    current.AuthenticatedUser = response.UserName || current.AuthenticatedUser || '';
                }
                current.CanDownload = response.CanDownload === true || response.CanDownload === false ? response.CanDownload : null;
                current.SyncAccess = response.SyncAccess || '';
                current.SyncAccessMessage = response.SyncAccessMessage || '';
                reflectAccess(current);
                var nameEl = getEl('txtSourceServerName');
                var idEl = getEl('txtSourceServerId');
                if (nameEl) nameEl.textContent = current.ServerName || ZooidShared.t.tr('Unknown');
                if (idEl) idEl.textContent = current.ServerId || ZooidShared.t.tr('Unknown');
                setVisible('serverInfoContainer', true);
                serverHealth[key] = 'ok';
                renderServerList();

                setMappingSectionsVisible(true);
                loadMappings(key);
            } else {
                ZooidShared.setStatus('connectionStatus', (response && response.Message) || ZooidShared.t.tr('ErrorConnect'), true, { timeout: 10000 });
                serverHealth[key] = 'bad';
                renderServerList();
            }
        }).catch(function() {
            serverHealth[key] = 'bad';
            if (!stillSelected(key)) {
                updateHealthDots();
                return;
            }
            ZooidShared.setStatus('connectionStatus', ZooidShared.t.tr('ErrorConnect'), true);
            renderServerList();
        });
    }

    function generateToken() {
        var server = collectServerEditor();
        var usernameEl = getEl('txtAuthUsername');
        var passwordEl = getEl('txtAuthPassword');
        if (!server) return;

        var username = usernameEl ? usernameEl.value : '';
        var password = passwordEl ? passwordEl.value : '';

        if (!server.Url) {
            ZooidShared.setStatus('tokenGeneratorStatus', ZooidShared.t.tr('ErrorEnterUrl'), true);
            return;
        }

        if (!username || !password) {
            ZooidShared.setStatus('tokenGeneratorStatus', ZooidShared.t.tr('ErrorEnterCredentials'), true);
            return;
        }

        ZooidShared.setStatus('tokenGeneratorStatus', ZooidShared.t.tr('StatusAuthenticating'), false, { timeout: 0 });

        var key = server.Key;
        apiRequest('Authenticate', 'POST', {
            ServerUrl: server.Url,
            Username: username,
            Password: password,
            AllowPrivateNetwork: server.AllowPrivateNetwork !== false
        }).then(function(response) {
            if (!response || !response.Success) {
                // The status line belongs to whichever server is open, so a failure for one the operator
                // has left is not written over the other server's editor.
                if (stillSelected(key)) ZooidShared.setStatus('tokenGeneratorStatus', (response && response.Message) || ZooidShared.t.tr('ErrorSignIn'), true, { timeout: 10000 });
                return;
            }

            var selected = stillSelected(key);
            // A save while the sign in ran replaced every entry with a fresh copy, so the token goes into
            // the entry that holds this key now, which is the one the next save sends. When the server is
            // still open, the editor is read back first so edits made meanwhile are saved with the token.
            var current = selected ? collectServerEditor() : serverByKey(key);
            if (!current) {
                ZooidShared.setStatus('serverListStatus', ZooidShared.t.tr('ErrorSignedInServerRemoved'), true, { timeout: 10000 });
                return;
            }

            current.ApiKey = response.AccessToken;
            current.AuthenticatedUser = response.Username || username;
            current.AuthenticatedUserId = response.UserId || '';
            current.ServerName = response.ServerName || current.ServerName || '';
            current.ServerId = response.ServerId || current.ServerId || '';
            if (response.IsAdministrator === true) current.AccessLevel = 'Administrator';
            else if (response.IsAdministrator === false) current.AccessLevel = 'User';
            current.CanDownload = response.CanDownload === true || response.CanDownload === false ? response.CanDownload : null;
            current.SyncAccess = response.SyncAccess || '';
            current.SyncAccessMessage = response.SyncAccessMessage || '';

            if (!selected) {
                // The operator moved to another server meanwhile. The key still belongs to this one, so it
                // is stored on it and saved, without touching the editor that now shows the other.
                saveServers(ZooidShared.t.tr('ToastTokenSaved'), ZooidShared.t.tr('ErrorTokenSave'), null, 'serverListStatus');
                return;
            }

            // Clear the password field for security
            if (passwordEl) passwordEl.value = '';

            reflectAccess(current);
            setValue('txtSourceServerApiKey', response.AccessToken);

            var authUserEl = getEl('txtAuthenticatedUser');
            if (authUserEl) authUserEl.textContent = current.AuthenticatedUser;
            setVisible('authenticatedUserRow', true);
            reflectSignedIn(current);

            var nameEl = getEl('txtSourceServerName');
            var idEl = getEl('txtSourceServerId');
            if (nameEl) nameEl.textContent = current.ServerName || ZooidShared.t.tr('Unknown');
            if (idEl) idEl.textContent = current.ServerId || ZooidShared.t.tr('Unknown');
            setVisible('serverInfoContainer', true);

            // The success line shows only once the save landed, since a token the server never stored
            // would be lost on the next page load.
            saveServers(ZooidShared.t.tr('ToastTokenSaved'), ZooidShared.t.tr('ErrorTokenSave'), null, 'tokenGeneratorStatus').then(function(ok) {
                if (!stillSelected(key) || !ok) return;
                serverHealth[key] = 'ok';
                renderServerList();
                setMappingSectionsVisible(true);
                loadMappings(key);
            });
        }).catch(function(error) {
            console.error('Token generation error:', error);
            if (stillSelected(key)) ZooidShared.setStatus('tokenGeneratorStatus', ZooidShared.t.tr('ErrorSignIn'), true);
        });
    }

    // Selects an option by value, matching ids with or without dashes and in any case, since a stored
    // id may have been written either way and the server answers with dashed ids.
    function selectLoose(select, value) {
        if (!select || !value) return;
        select.value = value;
        if (select.value === value) return;
        var wanted = String(value).replace(/-/g, '').toLowerCase();
        for (var i = 0; i < select.options.length; i++) {
            if (String(select.options[i].value).replace(/-/g, '').toLowerCase() === wanted) {
                select.selectedIndex = i;
                return;
            }
        }
    }

    function fetchSourceLibraries(server) {
        return apiRequest('GetSourceLibraries', 'POST', requestFor(server)).then(function(libraries) {
            if (!stillSelected(server.Key)) return;
            sourceLibraries = libraries || [];
            updateLibrarySelects();
        }).catch(function() {
            if (stillSelected(server.Key)) sourceLibraries = [];
        });
    }

    function fetchLocalLibraries() {
        return ApiClient.fetch({
            url: ApiClient.getUrl('Library/VirtualFolders'),
            type: 'GET',
            dataType: 'json'
        }).then(function(folders) {
            localLibraries = (folders || []).map(function(folder) {
                return { Id: folder.ItemId, Name: folder.Name, Locations: folder.Locations || [] };
            });
        }).catch(function() {
            localLibraries = [];
        });
    }

    function updateLibrarySelects() {
        view.querySelectorAll('.zooid-source-library-select').forEach(function(select) {
            var savedValue = select.dataset.savedValue || select.value;
            select.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectSourceLibrary')) + '</option>';
            sourceLibraries.forEach(function(lib) {
                var option = document.createElement('option');
                option.value = lib.Id;
                option.textContent = lib.Name;
                option.dataset.locations = JSON.stringify(lib.Locations || []);
                select.appendChild(option);
            });
            if (savedValue) selectLoose(select, savedValue);
        });
        view.querySelectorAll('.zooid-local-library-select').forEach(function(select) {
            var savedValue = select.dataset.savedValue || select.value;
            select.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectLocalLibrary')) + '</option>';
            localLibraries.forEach(function(lib) {
                var option = document.createElement('option');
                option.value = lib.Id;
                option.textContent = lib.Name;
                option.dataset.locations = JSON.stringify(lib.Locations || []);
                select.appendChild(option);
            });
            if (savedValue) selectLoose(select, savedValue);
        });
    }

    function renderLibraryMappings(mappings) {
        clearMappingContainer('libraryMappingsContainer');
        (mappings || []).forEach(function(mapping) {
            addLibraryMappingRow(mapping);
        });
    }

    // The fields of a library mapping edited on the Storage page. This page never shows them, and a save
    // here carries them through from the stored mapping so it never drops them.
    var STORAGE_FIELDS = ['StorageMode', 'ExcludeFromLinkCache', 'PermanentItems', 'FilterMode', 'FilteredItems', 'NegotiateHistory'];

    function sameId(a, b) {
        return !!a && !!b && String(a).replace(/-/g, '').toLowerCase() === String(b).replace(/-/g, '').toLowerCase();
    }

    // The stored mapping a mapping on screen stands for: the same source and local library, else the
    // same source library alone.
    function storedMappingFor(storedMappings, mapping) {
        var list = storedMappings || [];
        return list.find(function (m) { return sameId(m.SourceLibraryId, mapping.SourceLibraryId) && sameId(m.LocalLibraryId, mapping.LocalLibraryId); })
            || list.find(function (m) { return sameId(m.SourceLibraryId, mapping.SourceLibraryId); })
            || null;
    }

    function copyStorageFields(from, to) {
        STORAGE_FIELDS.forEach(function (field) {
            if (from[field] !== undefined) to[field] = from[field];
        });
    }

    // Puts the Storage page's fields of the stored config onto each mapping about to be saved, so a
    // change made on the Storage page since this page loaded survives a save here.
    function keepStoredStorageFields(storedServers, list) {
        (list || []).forEach(function (server) {
            var stored = (storedServers || []).find(function (s) { return s.Key === server.Key; });
            if (!stored) return;
            // A server's stream speeds are set under Settings > Bandwidth, so the stored ones are kept.
            if (stored.LinkStreamSpeedMbps !== undefined) server.LinkStreamSpeedMbps = stored.LinkStreamSpeedMbps;
            if (stored.LinkScheduledStreamSpeedMbps !== undefined) server.LinkScheduledStreamSpeedMbps = stored.LinkScheduledStreamSpeedMbps;
            (server.LibraryMappings || []).forEach(function (mapping) {
                var match = storedMappingFor(stored.LibraryMappings, mapping);
                if (match) copyStorageFields(match, mapping);
            });
        });
    }

    function addLibraryMappingRow(mapping) {
        mapping = mapping || { IsEnabled: true };
        var container = view.querySelector('#libraryMappingsContainer');
        if (!container) return;

        var div = document.createElement('div');
        div.className = 'zooid-mapping zooid-library-mapping';
        div.innerHTML =
            '<div class="zooid-mapping-header">' +
                '<label class="emby-checkbox-label"><input type="checkbox" is="emby-checkbox" class="zooid-mapping-enabled" ' + (mapping.IsEnabled ? 'checked' : '') + ' /><span class="checkboxLabel">' + escapeHtml(ZooidShared.t.tr('OptionEnabled')) + '</span></label>' +
                '<button is="emby-button" type="button" class="zooid-remove-mapping raised stolon-button stolon-destructive stolon-small"><span>' + escapeHtml(ZooidShared.t.tr('ButtonRemove')) + '</span></button>' +
            '</div>' +
            '<div class="zooid-mapping-grid">' +
                '<div class="zooid-mapping-column">' +
                    '<div class="selectContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelSourceLibrary')) + '</label><select is="emby-select" class="zooid-source-library-select"></select></div>' +
                    '<div class="inputContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelSourceRootPath')) + '</label><input is="emby-input" type="text" class="zooid-source-root-path" value="' + escapeHtml(mapping.SourceRootPath || '') + '" /></div>' +
                '</div>' +
                '<div class="zooid-mapping-column">' +
                    '<div class="selectContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelLocalLibrary')) + '</label><select is="emby-select" class="zooid-local-library-select"></select></div>' +
                    '<div class="inputContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelLocalRootPath')) + '</label><input is="emby-input" type="text" class="zooid-local-root-path" value="' + escapeHtml(mapping.LocalRootPath || '') + '" /></div>' +
                '</div>' +
            '</div>';

        container.appendChild(div);

        // The mapping as loaded. Its Storage page fields go back out with the save.
        div._storedMapping = mapping;

        var sourceSelect = div.querySelector('.zooid-source-library-select');
        if (mapping.SourceLibraryId) sourceSelect.dataset.savedValue = mapping.SourceLibraryId;
        if (mapping.SourceLibraryName) sourceSelect.dataset.savedName = mapping.SourceLibraryName;
        sourceSelect.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectSourceLibrary')) + '</option>';
        sourceLibraries.forEach(function(lib) {
            var option = document.createElement('option');
            option.value = lib.Id;
            option.textContent = lib.Name;
            option.dataset.locations = JSON.stringify(lib.Locations || []);
            sourceSelect.appendChild(option);
        });
        if (mapping.SourceLibraryId) selectLoose(sourceSelect, mapping.SourceLibraryId);
        sourceSelect.addEventListener('change', function() {
            var option = this.options[this.selectedIndex];
            if (option && option.dataset.locations) {
                var locations = JSON.parse(option.dataset.locations);
                if (locations.length > 0) div.querySelector('.zooid-source-root-path').value = locations[0];
            }
        });

        var localSelect = div.querySelector('.zooid-local-library-select');
        if (mapping.LocalLibraryId) localSelect.dataset.savedValue = mapping.LocalLibraryId;
        if (mapping.LocalLibraryName) localSelect.dataset.savedName = mapping.LocalLibraryName;
        localSelect.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectLocalLibrary')) + '</option>';
        localLibraries.forEach(function(lib) {
            var option = document.createElement('option');
            option.value = lib.Id;
            option.textContent = lib.Name;
            option.dataset.locations = JSON.stringify(lib.Locations || []);
            localSelect.appendChild(option);
        });
        if (mapping.LocalLibraryId) selectLoose(localSelect, mapping.LocalLibraryId);
        localSelect.addEventListener('change', function() {
            var option = this.options[this.selectedIndex];
            if (option && option.dataset.locations) {
                var locations = JSON.parse(option.dataset.locations);
                if (locations.length > 0) div.querySelector('.zooid-local-root-path').value = locations[0];
            }
        });

        div.querySelector('.zooid-remove-mapping').addEventListener('click', function() {
            div.remove();
            markEdited();
        });
    }

    function collectLibraryMappings() {
        var mappings = [];
        view.querySelectorAll('.zooid-library-mapping').forEach(function(row) {
            var sourceSelect = row.querySelector('.zooid-source-library-select');
            var localSelect = row.querySelector('.zooid-local-library-select');
            var stored = row._storedMapping || {};

            var mapping = {
                IsEnabled: row.querySelector('.zooid-mapping-enabled').checked,
                SourceLibraryId: pickedValue(sourceSelect),
                SourceLibraryName: pickedName(sourceSelect),
                SourceRootPath: row.querySelector('.zooid-source-root-path').value,
                LocalLibraryId: pickedValue(localSelect),
                LocalLibraryName: pickedName(localSelect),
                LocalRootPath: row.querySelector('.zooid-local-root-path').value,
                StorageMode: 'Copy',
                ExcludeFromLinkCache: false,
                PermanentItems: null,
                FilterMode: 'AllowAll',
                FilteredItems: []
            };
            // The Storage page settings stay with the row. Picks name items of one source library, so a
            // row moved to another source library keeps its storage, cache, and filter mode but starts
            // with no picks.
            copyStorageFields(stored, mapping);
            if (stored.SourceLibraryId && !sameId(stored.SourceLibraryId, mapping.SourceLibraryId)) {
                mapping.PermanentItems = null;
                mapping.FilteredItems = [];
            }
            mappings.push(mapping);
        });
        return mappings;
    }

    function fetchSourceUsers(server) {
        return apiRequest('GetSourceUsers', 'POST', requestFor(server)).then(function(users) {
            if (!stillSelected(server.Key)) return;
            sourceUsers = users || [];
            updateUserSelects();
        }).catch(function() {
            if (stillSelected(server.Key)) sourceUsers = [];
        });
    }

    function fetchLocalUsers() {
        return ApiClient.fetch({
            url: ApiClient.getUrl('Users'),
            type: 'GET',
            dataType: 'json'
        }).then(function(users) {
            localUsers = (users || []).map(function(user) {
                return { Id: user.Id, Name: user.Name };
            });
        }).catch(function() {
            localUsers = [];
        });
    }

    // The limits only mean something while linking is allowed.
    function linkingAllowed() {
        return getMode() !== 'Pull' && getChecked('chkAllowLinking');
    }

    // A user never gets more streams than the whole server, so each per user field is held to the
    // server's total while one is set.
    function clampUserStreams() {
        var total = Math.max(0, parseInt(getValue('txtLinkMaxStreams', '0'), 10) || 0);
        // Counting a user's own playback only changes anything while some per user limit applies.
        var anyUserLimit = total > 0
            || Array.prototype.some.call(view.querySelectorAll('.zooid-user-link-max-streams'), function (f) { return (parseInt(f.value, 10) || 0) > 0; });
        setVisible('countOwnSessionsContainer', anyUserLimit);
        var fields = Array.prototype.slice.call(view.querySelectorAll('.zooid-user-link-max-streams'));
        fields.forEach(function(field) {
            if (!field) return;
            field.max = total > 0 ? String(total) : '1000';
            var value = parseInt(field.value, 10);
            if (total > 0 && value > total) field.value = String(total);
        });
    }

    // Whether each server runs Zooid, as last checked: 'yes', 'no', 'unreachable', or 'checking'.
    // Linking needs it there, so the Linking step warns when it is missing.
    var peerPlugin = {};

    function reflectLinkingPlugin() {
        var server = selectedServer();
        var note = getEl('linkingNeedsPlugin');
        if (!server || !note) return;
        var on = linkingAllowed();
        var state = peerPlugin[server.Key];
        if (on && state === undefined && server.Url && server.ApiKey) {
            var key = server.Key;
            var request = requestFor(server);
            request.Mode = getMode();
            peerPlugin[key] = 'checking';
            apiRequest('Hints/CheckPeer', 'POST', request).then(function (result) {
                peerPlugin[key] = result && result.Reachable ? (result.HasPlugin ? 'yes' : 'no') : 'unreachable';
            }).catch(function () {
                peerPlugin[key] = 'unreachable';
            }).then(function () {
                if (stillSelected(key)) reflectLinkingPlugin();
            });
        }
        note.textContent = state === 'no'
            ? ZooidShared.t.tr('WarnLinkingNoPlugin')
            : state === 'unreachable' ? ZooidShared.t.tr('WarnLinkingUnreachable') : '';
        setVisible('linkingNeedsPlugin', on && (state === 'no' || state === 'unreachable'));
    }

    function reflectLinking() {
        reflectLinkingPlugin();
        setVisible('linkLimits', linkingAllowed());
        view.querySelectorAll('.zooid-user-link-caps').forEach(function(caps) {
            caps.classList.toggle('stolon-hidden', !linkingAllowed());
        });
    }

    // Linking is for Push and Sync servers. A Pull server only gives this one things to read, so it
    // may never link here, and the step is hidden. Stolon numbers the steps that show.
    function reflectStream() {
        var mode = getMode();
        setVisible('serverStepStreamSection', mode !== 'Pull');
        reflectLinking();
    }

    // Refilling keeps the choice on screen unless a server's own value is given, which always wins,
    // so opening a server with no fallback never shows the last server's.
    function fillFallbackUsers(value) {
        var select = getEl('selLinkFallbackUser');
        if (!select) return;
        var savedValue = value !== undefined ? value : select.value;
        select.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionRefuseStream')) + '</option>';
        localUsers.forEach(function(user) {
            var option = document.createElement('option');
            option.value = user.Id;
            option.textContent = user.Name;
            select.appendChild(option);
        });
        select.value = '';
        if (savedValue) selectLoose(select, savedValue);
    }

    function updateUserSelects() {
        fillFallbackUsers();
        view.querySelectorAll('.zooid-source-user-select').forEach(function(select) {
            var savedValue = select.value || select.dataset.savedValue;
            fillSourceUserOptions(select);
            if (savedValue) selectLoose(select, savedValue);
            reflectUserRowLimit(select);
        });
        view.querySelectorAll('.zooid-local-user-select').forEach(function(select) {
            var savedValue = select.dataset.savedValue || select.value;
            select.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectLocalUser')) + '</option>';
            localUsers.forEach(function(user) {
                var option = document.createElement('option');
                option.value = user.Id;
                option.textContent = user.Name;
                select.appendChild(option);
            });
            if (savedValue) selectLoose(select, savedValue);
        });
    }

    function fillSourceUserOptions(select) {
        var server = selectedServer();
        select.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectSourceUser')) + '</option>';
        sourceUsers.forEach(function(user) {
            var option = document.createElement('option');
            option.value = user.Id;
            var allowed = maySyncUser(server, user.Id);
            option.textContent = allowed ? user.Name : ZooidShared.t.format('OptionUserNeedsAdmin', user.Name);
            option.disabled = !allowed;
            select.appendChild(option);
        });
    }

    function reflectUserRowLimit(select) {
        var row = select.closest('.zooid-user-mapping');
        if (!row) return;
        var server = selectedServer();
        var value = pickedValue(select);
        var blocked = !!value && !maySyncUser(server, value);
        var warning = row.querySelector('.zooid-user-mapping-limit');
        if (!warning) {
            warning = document.createElement('div');
            warning.className = 'zooid-user-mapping-limit stolon-warn stolon-hidden';
            warning.textContent = ZooidShared.t.tr('WarnUserSkipped');
            row.appendChild(warning);
        }
        warning.classList.toggle('stolon-hidden', !blocked);
    }

    function renderUserMappings(mappings) {
        clearMappingContainer('userMappingsContainer');
        (mappings || []).forEach(function(mapping) {
            addUserMappingRow(mapping);
        });
    }

    function addUserMappingRow(mapping) {
        mapping = mapping || { IsEnabled: true };
        var container = view.querySelector('#userMappingsContainer');
        if (!container) return;

        var div = document.createElement('div');
        div.className = 'zooid-mapping zooid-user-mapping';
        div.innerHTML =
            '<div class="zooid-mapping-header">' +
                '<label class="emby-checkbox-label"><input type="checkbox" is="emby-checkbox" class="zooid-user-mapping-enabled" ' + (mapping.IsEnabled !== false ? 'checked' : '') + ' /><span class="checkboxLabel">' + escapeHtml(ZooidShared.t.tr('OptionEnabled')) + '</span></label>' +
                '<button is="emby-button" type="button" class="zooid-remove-user-mapping raised stolon-button stolon-destructive stolon-small"><span>' + escapeHtml(ZooidShared.t.tr('ButtonRemove')) + '</span></button>' +
            '</div>' +
            '<div class="zooid-mapping-grid">' +
                '<div class="zooid-mapping-column"><div class="selectContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelSourceUser')) + '</label><select is="emby-select" class="zooid-source-user-select"></select></div></div>' +
                '<div class="zooid-mapping-column"><div class="selectContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelLocalUser')) + '</label><select is="emby-select" class="zooid-local-user-select"></select></div></div>' +
            '</div>' +
            '<div class="zooid-mapping-grid zooid-user-link-caps' + (getChecked('chkAllowLinking') ? '' : ' stolon-hidden') + '">' +
                '<div class="zooid-mapping-column"><div class="inputContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelLinkStreamsAtOnce')) + '</label><input is="emby-input" type="number" min="0" max="1000" class="zooid-user-link-max-streams" placeholder="' + escapeHtml(ZooidShared.t.tr('Default')) + '" value="' + (mapping.LinkMaxStreams == null ? '' : escapeHtml(String(mapping.LinkMaxStreams))) + '" />' +
                    '<div class="fieldDescription">' + escapeHtml(ZooidShared.t.tr('HelpUserLinkMaxStreams')) + '</div></div></div>' +
                '<div class="zooid-mapping-column"><div class="inputContainer"><label>' + escapeHtml(ZooidShared.t.tr('LabelLinkSpeed')) + '</label><input is="emby-input" type="number" min="0" max="100000" class="zooid-user-link-speed" placeholder="' + escapeHtml(ZooidShared.t.tr('Default')) + '" value="' + (mapping.LinkStreamSpeedMbps == null ? '' : escapeHtml(String(mapping.LinkStreamSpeedMbps))) + '" />' +
                    '<div class="fieldDescription">' + escapeHtml(ZooidShared.t.tr('HelpUserLinkSpeed')) + '</div></div></div>' +
            '</div>';

        container.appendChild(div);

        var sourceSelect = div.querySelector('.zooid-source-user-select');
        if (mapping.SourceUserId) sourceSelect.dataset.savedValue = mapping.SourceUserId;
        if (mapping.SourceUserName) sourceSelect.dataset.savedName = mapping.SourceUserName;
        fillSourceUserOptions(sourceSelect);
        if (mapping.SourceUserId) selectLoose(sourceSelect, mapping.SourceUserId);
        reflectUserRowLimit(sourceSelect);
        sourceSelect.addEventListener('change', function() { reflectUserRowLimit(sourceSelect); });

        var localSelect = div.querySelector('.zooid-local-user-select');
        if (mapping.LocalUserId) localSelect.dataset.savedValue = mapping.LocalUserId;
        if (mapping.LocalUserName) localSelect.dataset.savedName = mapping.LocalUserName;
        localSelect.innerHTML = '<option value="">' + escapeHtml(ZooidShared.t.tr('OptionSelectLocalUser')) + '</option>';
        localUsers.forEach(function(user) {
            var option = document.createElement('option');
            option.value = user.Id;
            option.textContent = user.Name;
            localSelect.appendChild(option);
        });
        if (mapping.LocalUserId) selectLoose(localSelect, mapping.LocalUserId);

        div.querySelector('.zooid-remove-user-mapping').addEventListener('click', function() { div.remove(); markEdited(); });
    }

    // An empty box means "use the server's own value", which is stored as null.
    function optionalNumber(input) {
        if (!input || input.value === '') return null;
        var value = parseInt(input.value, 10);
        return isNaN(value) ? null : Math.max(0, value);
    }

    function collectUserMappings() {
        var mappings = [];
        view.querySelectorAll('.zooid-user-mapping').forEach(function(row) {
            var sourceSelect = row.querySelector('.zooid-source-user-select');
            var localSelect = row.querySelector('.zooid-local-user-select');
            mappings.push({
                IsEnabled: row.querySelector('.zooid-user-mapping-enabled').checked,
                SourceUserId: pickedValue(sourceSelect),
                SourceUserName: pickedName(sourceSelect),
                LocalUserId: pickedValue(localSelect),
                LocalUserName: pickedName(localSelect),
                LinkMaxStreams: optionalNumber(row.querySelector('.zooid-user-link-max-streams')),
                LinkStreamSpeedMbps: optionalNumber(row.querySelector('.zooid-user-link-speed'))
            });
        });
        return mappings;
    }

    function loadConfig() {
        ZooidShared.getConfig().then(function(config) {
            currentConfig = config;
            servers = config.Servers || [];
            Promise.all([fetchLocalLibraries(), fetchLocalUsers()]).then(function() {
                // Every server card starts closed, and one opens when it is picked.
                selectServer(-1);
                saveBars.clean();
                refreshServerHealth();
            });
        }).catch(function() {
            ZooidShared.setStatus('serverListStatus', ZooidShared.t.tr('ErrorServersLoad'), true, { timeout: 0 });
        });
    }

    // bindPage
    // Wires the page's buttons and controls. Stolon calls it once, the first time the page shows.
    function bindPage() {
        ZooidShared.initCollapsibles();

        bindClick('btnTestConnection', testConnection);
        bindClick('btnGenerateToken', generateToken);
        bindClick('btnAddServer', addServer);
        bindClick('btnDeleteServer', deleteServer);
        bindClick('btnCheckPeer', checkPeer);

        // The stored key shows as a placeholder. Focusing the field clears it, so typing enters a
        // new key rather than adding to the placeholder. Leaving it empty keeps the stored key.
        var keyField = getEl('txtSourceServerApiKey');
        if (keyField) {
            keyField.addEventListener('focus', function () {
                if (keyField.value === ZooidShared.SECRET_KEPT) keyField.value = '';
            });
            keyField.addEventListener('blur', function () {
                var open = selectedServer();
                if (!keyField.value && open && open.ApiKey && !savedSecretLeftBehind(open)) keyField.value = ZooidShared.SECRET_KEPT;
            });
        }
        var urlField = getEl('txtSourceServerUrl');
        if (urlField) urlField.addEventListener('input', reflectAddressChange);
        var linkingField = getEl('chkAllowLinking');
        if (linkingField) linkingField.addEventListener('change', reflectLinking);
        var totalField = getEl('txtLinkMaxStreams');
        if (totalField) totalField.addEventListener('input', clampUserStreams);
        view.addEventListener('change', function(e) {
            if (e.target && ((e.target.classList && e.target.classList.contains('zooid-user-link-max-streams')))) clampUserStreams();
        });
        modeGroup = createChoiceGroup(getEl('modeChoices'), { onChange: reflectMode });
        authGroup = createChoiceGroup(getEl('authChoices'), { onChange: reflectAuthMethod });

        // The buttons are disabled while the open server's lists load. The check here covers a
        // click that lands before the disabled state does.
        bindClick('btnAddMapping', function() { if (mappingsLoaded) { addLibraryMappingRow(); markEdited(); } });
        bindClick('btnAddUserMapping', function() { if (mappingsLoaded) { addUserMappingRow(); markEdited(); } });

        serverBar = saveBars.add(getEl('serverEditor'), {
            savedText: ZooidShared.t.tr('ToastServerSaved'),
            failedText: ZooidShared.t.tr('ErrorServerSave'),
            onSave: saveServerConfig
        });
    }
}
