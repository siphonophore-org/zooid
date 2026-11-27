// zooid_settings.js
// The Settings page: bandwidth, processing, the whitelist, and one section for each sync type.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

// zooid_settings
// Builds the Settings page. It loads the config into each section, saves a section on its own, and resets
// sync tables after a question.
//
// Inputs
// view [HTMLElement]: The page the dashboard passes to the controller.
export default function (view) {
    'use strict';

    var ZooidShared = null;
    var confirmDialog = null;

    // Helpers called by bare name, taken from the shared bag.
    var escapeHtml, apiRequest, bindClick, setChecked, getChecked, setValue, getValue, getIntValue, requestFor, getEl, setVisible;

    // Stolon runs bindPage once and loadConfig each time the page shows.
    var made = zooidModule.createZooidPage(view, { page: 'zooid_settings', bind: function () { bindPage(); }, load: function () { loadConfig(); } });
    ZooidShared = made.shared;
    confirmDialog = zooidModule.confirmDialog;
    ({ escapeHtml, apiRequest, bindClick, setChecked, getChecked, setValue, getValue, getIntValue, requestFor, getEl, setVisible } = ZooidShared.pageHelpers());


    var currentConfig = null;

    // The Save Bar that ends each section.
    var saveBars = zooidModule.createSaveBars(made.page);

    // saveSection
    // Saves one section for its Save Bar. The config is replaced only once a save has landed, so the page
    // never holds a change the server did not keep.
    //
    // Inputs
    // mutator [function]: Changes the fresh config in place.
    //
    // Output
    // [Promise]: Resolves once the save landed, and rejects when it did not.
    function saveSection(mutator) {
        return ZooidShared.saveSection(mutator).then(function (saved) {
            currentConfig = saved;
        });
    }

    // The watched by all filter lists the users of every scan server, each
    // tagged with its server, since user ids are only meaningful per server.
    var watchedFilterUsers = [];

    // The Servers page owns the server list. This page only reads it from the config.
    function fetchWatchedFilterUsers() {
        var scanServers = ZooidShared.scanServers(currentConfig);
        return Promise.all(scanServers.map(function (server) {
            return apiRequest('GetSourceUsers', 'POST', requestFor(server)).then(function (users) {
                return (users || []).map(function (u) {
                    return { Id: u.Id, Name: u.Name, ServerName: ZooidShared.serverDisplayName(server), ServerKey: server.Key };
                });
            }).catch(function () { return []; });
        })).then(function (lists) {
            watchedFilterUsers = [];
            lists.forEach(function (list) { watchedFilterUsers = watchedFilterUsers.concat(list); });
            renderWatchedFilterUsers(getCurrentWatchedFilterUserIds());
        });
    }

    // The Checkbox List that holds the users, or null before the first draw.
    var watchedFilterList = null;

    // getCurrentWatchedFilterUserIds
    // Reads the picked users from the list, or from the config while the list has none.
    //
    // Output
    // [string[]]: The picked user ids.
    function getCurrentWatchedFilterUserIds() {
        var rendered = collectWatchedFilterUsers();
        if (rendered.length > 0) {
            return rendered;
        }

        return (currentConfig && currentConfig.WatchedFilterUserIds) || [];
    }

    // renderWatchedFilterUsers
    // Draws the users of every scan server as a Checkbox List, each with its server and its picture.
    //
    // Inputs
    // selectedIds [string[]]: The users to draw as picked.
    function renderWatchedFilterUsers(selectedIds) {
        var container = view.querySelector('#watchedFilterUsersList');
        if (!container) return;

        if (watchedFilterList) watchedFilterList.destroy();
        container.innerHTML = '';

        watchedFilterList = zooidModule.createCheckboxList({
            items: watchedFilterUsers,
            idKey: 'Id',
            value: selectedIds || [],
            searchKeys: ['Name', 'ServerName'],
            placeholder: ZooidShared.t.tr('PlaceholderSearchUsers'),
            emptyMessage: ZooidShared.t.tr('EmptySourceUsers'),
            renderRow: function (user) {
                return {
                    label: user.Name || '',
                    sublabel: user.ServerName || '',
                    image: ZooidShared.proxyImage(user.Id, true, user.ServerKey)
                };
            }
        });
        container.appendChild(watchedFilterList.element);
    }

    // collectWatchedFilterUsers
    // Reads the picked users that are on screen.
    //
    // Output
    // [string[]]: The picked ids of the users the list shows.
    function collectWatchedFilterUsers() {
        if (!watchedFilterList) return [];
        var shown = {};
        watchedFilterUsers.forEach(function (u) { shown[u.Id] = true; });
        return watchedFilterList.getValue().filter(function (id) { return shown[id]; });
    }

    function loadContentSettings(config) {
        setChecked('chkEnableContentSync', config.EnableContentSync || false);
        setChecked('chkDetectUpdatedFiles', config.DetectUpdatedFiles !== false);
        setChecked('chkMirrorSyncedCollections', config.MirrorSyncedCollections !== false);
        setChecked('chkIncludeCompanionFiles', config.IncludeCompanionFiles || false);
        setChecked('chkTakeLinkImagesFromSource', config.TakeLinkImagesFromSource !== false);
        setChecked('chkStreamLinksDirectly', config.StreamLinksDirectly !== false);
        setValue('txtLinkMaxStreamsTotal', config.LinkMaxStreamsTotal || 0);

        // One row per server this one links to: a server it pulls from with a library kept as links.
        var takeRows = getEl('linkTakeRows');
        if (takeRows) {
            takeRows.innerHTML = ((config && config.Servers) || []).filter(function (server) {
                var pulls = server.Mode === 'Pull' || server.Mode === 'Sync' || server.Mode === 0 || server.Mode === 2;
                return server.IsEnabled !== false && pulls && (server.LibraryMappings || []).some(function (m) { return m.IsEnabled !== false && (m.StorageMode === 'Link' || m.StorageMode === 1); });
            }).map(function (server) {
                return '<div class="zooid-form-row" data-server-key="' + escapeHtml(server.Key) + '">' +
                    '<span class="zooid-form-label"><span>' + escapeHtml(ZooidShared.t.format('LabelLinksFromServer', ZooidShared.serverDisplayName(server))) + '</span><span class="zooid-form-hint">' + escapeHtml(ZooidShared.t.tr('HintLinksTakenAtOnce')) + '</span></span>' +
                    '<span class="zooid-form-cell"><input is="emby-input" type="number" min="0" max="1000" class="zooid-form-input zooid-link-take" value="' + escapeHtml(String(server.LinkTakeMaxStreams || 0)) + '" /></span>' +
                '</div>';
            }).join('');
        }

        setValue('selLinkCacheSizing', config.LinkCacheSizing || (config.LinkCacheSizeGb > 0 ? 'Fixed' : 'Off'));
        setValue('txtLinkCacheSizeGb', config.LinkCacheSizeGb || 0);
        setValue('txtLinkCachePercent', config.LinkCachePercent || 50);
        setValue('txtLinkCachePath', config.LinkCachePath || '');
        setValue('txtLinkCacheRetentionDays', config.LinkCacheRetentionDays == null ? 30 : config.LinkCacheRetentionDays);
        setValue('txtLinkCachePreCacheEpisodes', config.LinkCachePreCacheEpisodes == null ? 2 : config.LinkCachePreCacheEpisodes);
        setValue('selLinkCacheRemovalOrder', config.LinkCacheRemovalOrder || 'LastPlayed');
        loadLinkCacheStatus();
        renderWatchedFilterUsers(config.WatchedFilterUserIds || []);
        setValue('selDownloadNewContentMode', config.DownloadNewContentMode || 'Enabled');
        setValue('selReplaceExistingContentMode', config.ReplaceExistingContentMode || 'Enabled');
        setValue('selMissingContent', config.MissingContentAction || 'Keep');
        setChecked('chkEnableRecyclingBin', config.EnableRecyclingBin || false);
        setValue('txtRecyclingBinPath', config.RecyclingBinPath || '');
        setValue('txtRecyclingBinRetentionDays', config.RecyclingBinRetentionDays || 7);
        setChecked('chkRemoveEmptyFolders', config.RemoveEmptyFoldersOnDelete || false);
        setValue('txtMaxConcurrentDownloads', config.MaxConcurrentDownloads || 2);
        setValue('txtTempDownloadPath', config.TempDownloadPath || '');
        setValue('txtMinFreeDiskSpace', config.MinimumFreeDiskSpaceGb == null ? 10 : config.MinimumFreeDiskSpaceGb);


        // The cache's other settings only matter while it is on, and each size choice shows its own field.
        var cacheSizing = getEl('selLinkCacheSizing');
        var reflectCache = function () {
            var sizing = getValue('selLinkCacheSizing', 'Off');
            setVisible('linkCacheOptions', sizing !== 'Off');
            setVisible('linkCacheFixedRow', sizing === 'Fixed');
            setVisible('linkCachePercentRow', sizing === 'Percent');
        };
        if (cacheSizing && !cacheSizing.dataset.bound) {
            cacheSizing.dataset.bound = '1';
            cacheSizing.addEventListener('change', reflectCache);
        }
        reflectCache();
        ZooidShared.bindReveal('chkEnableRecyclingBin', 'recyclingBinSettings');
    }

    // The servers a link streams to: Push and Sync servers allowed to link here.
    function linkingServers(config) {
        return ((config && config.Servers) || []).filter(function (server) {
            var mode = server.Mode;
            return server.IsEnabled !== false && server.AllowLinking === true
                && (mode === 'Push' || mode === 'Sync' || mode === 1 || mode === 2);
        });
    }

    // scheduleHours
    // Builds the scheduled hours, once, as Stolon's Time Range Field in whole hours. A window may run past
    // midnight, and equal times run all day. Each time box goes in its own column, under the speed it applies
    // to, and the field's message goes under the row's hint.
    //
    // Output
    // [object]: The field's handle, or null when the page has no place for it.
    var hoursField = null;
    function scheduleHours() {
        if (hoursField) return hoursField;
        var host = getEl('scheduleHours');
        if (!host) return null;
        hoursField = zooidModule.createTimeRangeField({
            step: 60,
            allowOvernight: true,
            onChange: function () { host.dispatchEvent(new Event('change', { bubbles: true })); }
        });
        var slots = host.querySelectorAll('.zooid-hours-slot');
        var boxes = hoursField.element.querySelectorAll('.stolon-adorned');
        if (slots.length === 2 && boxes.length === 2) {
            slots[0].appendChild(boxes[0]);
            slots[1].appendChild(boxes[1]);
            var message = hoursField.element.querySelector('.stolon-field-message');
            var label = host.querySelector('.zooid-form-label');
            if (message && label) label.appendChild(message);
        } else {
            host.appendChild(hoursField.element);
        }
        return hoursField;
    }

    function loadBandwidthSettings(config) {
        setValue('txtMaxDownloadSpeed', config.MaxDownloadSpeed || 0);
        setChecked('chkEnableBandwidthScheduling', config.EnableBandwidthScheduling || false);
        var hours = scheduleHours();
        if (hours) hours.setValue({ start: zooidModule.fromHours(config.ScheduledStartHour || 0), end: zooidModule.fromHours(config.ScheduledEndHour == null ? 6 : config.ScheduledEndHour) });
        setValue('txtScheduledDownloadSpeed', config.ScheduledDownloadSpeed || 0);

        // One row per server allowed to link, in Mbps like a video's bitrate.
        var rows = getEl('streamSpeedRows');
        if (rows) {
            rows.innerHTML = linkingServers(config).map(function (server) {
                return '<div class="zooid-form-row" data-server-key="' + escapeHtml(server.Key) + '">' +
                    '<span class="zooid-form-label"><span>' + escapeHtml(ZooidShared.t.format('LabelStreamsToServer', ZooidShared.serverDisplayName(server))) + '</span><span class="zooid-form-hint">' + escapeHtml(ZooidShared.t.tr('HintEachStreamAndCache')) + '</span></span>' +
                    '<span class="zooid-form-cell"><input is="emby-input" type="number" min="0" max="100000" class="zooid-form-input zooid-stream-speed" value="' + escapeHtml(String(server.LinkStreamSpeedMbps || 0)) + '" /><span class="zooid-unit">' + escapeHtml(ZooidShared.t.tr('UnitMbps')) + '</span></span>' +
                    '<span class="zooid-form-cell zooid-schedule-cell"><input is="emby-input" type="number" min="0" max="100000" class="zooid-form-input zooid-stream-scheduled-speed" value="' + escapeHtml(String(server.LinkScheduledStreamSpeedMbps || 0)) + '" /><span class="zooid-unit">' + escapeHtml(ZooidShared.t.tr('UnitMbps')) + '</span></span>' +
                '</div>';
            }).join('');
        }

        var scheduleToggle = getEl('chkEnableBandwidthScheduling');
        var reflectSchedule = function () {
            var on = getChecked('chkEnableBandwidthScheduling');
            view.querySelectorAll('.zooid-schedule-row').forEach(function (row) { row.classList.toggle('stolon-hidden', !on); });
            var table = getEl('bandwidthTable');
            if (table) table.classList.toggle('zooid-no-schedule', !on);
        };
        if (scheduleToggle && !scheduleToggle.dataset.bound) {
            scheduleToggle.dataset.bound = '1';
            scheduleToggle.addEventListener('change', reflectSchedule);
        }
        reflectSchedule();
    }

    function saveBandwidthSettings() {
        var speeds = {};
        view.querySelectorAll('#streamSpeedRows [data-server-key]').forEach(function (row) {
            speeds[row.getAttribute('data-server-key')] = {
                normal: Math.max(0, parseInt(row.querySelector('.zooid-stream-speed').value, 10) || 0),
                scheduled: Math.max(0, parseInt(row.querySelector('.zooid-stream-scheduled-speed').value, 10) || 0)
            };
        });
        return saveSection(function (config) {
            config.MaxDownloadSpeed = getIntValue('txtMaxDownloadSpeed', 0);
            config.EnableBandwidthScheduling = getChecked('chkEnableBandwidthScheduling');
            var hours = scheduleHours();
            var span = hours ? hours.getValue() : { start: '00:00', end: '06:00' };
            config.ScheduledStartHour = Math.floor(zooidModule.toHours(span.start) || 0);
            config.ScheduledEndHour = Math.floor(zooidModule.toHours(span.end) || 0);
            config.ScheduledDownloadSpeed = getIntValue('txtScheduledDownloadSpeed', 0);
            (config.Servers || []).forEach(function (server) {
                var speed = speeds[server.Key];
                if (speed) {
                    server.LinkStreamSpeedMbps = speed.normal;
                    server.LinkScheduledStreamSpeedMbps = speed.scheduled;
                }
            });
        });
    }

    // What the link cache holds now, shown under its settings.
    function loadLinkCacheStatus() {
        var status = getEl('linkCacheStatus');
        if (!status) return;
        apiRequest('LinkCache', 'GET').then(function (cache) {
            if (!cache || !cache.Enabled) {
                status.textContent = ZooidShared.t.tr('StatusLinkCacheOff');
                return;
            }
            status.textContent = cache.Waiting
                ? ZooidShared.plural(cache.Files, 'StatusLinkCacheWaitingOne', 'StatusLinkCacheWaitingMany', cache.UsedFormatted, cache.LimitFormatted, cache.Location, cache.Waiting)
                : ZooidShared.plural(cache.Files, 'StatusLinkCacheOne', 'StatusLinkCacheMany', cache.UsedFormatted, cache.LimitFormatted, cache.Location);
        }).catch(function () {
            status.textContent = '';
        });
    }

    // clearLinkCache
    // Asks first, then deletes every file in the link cache.
    function clearLinkCache() {
        confirmDialog(ZooidShared.t.tr('ConfirmDeleteCachedFiles'), {
            title: ZooidShared.t.tr('ButtonDeleteCachedFiles'),
            confirmText: ZooidShared.t.tr('Delete'),
            destructive: true
        }).then(function (confirmed) {
            if (!confirmed) return;
            apiRequest('LinkCache/Clear', 'POST').then(loadLinkCacheStatus).catch(loadLinkCacheStatus);
        });
    }

    // reflectLinkCacheActions
    // Shows Delete cached files above the Content Save Bar while content sync is on, as its options are.
    function reflectLinkCacheActions() {
        setVisible('linkCacheActions', getChecked('chkEnableContentSync'));
    }

    function saveContentSettings() {
        return saveSection(function (config) {
            config.EnableContentSync = getChecked('chkEnableContentSync');
            config.DetectUpdatedFiles = getChecked('chkDetectUpdatedFiles');
            config.MirrorSyncedCollections = getChecked('chkMirrorSyncedCollections');
            config.IncludeCompanionFiles = getChecked('chkIncludeCompanionFiles');
            config.TakeLinkImagesFromSource = getChecked('chkTakeLinkImagesFromSource');
            config.StreamLinksDirectly = getChecked('chkStreamLinksDirectly');
            // An empty or unreadable field keeps the saved number, and a fraction of a gigabyte rounds
            // up to one. A fixed amount of 0 uses all available space.
            config.LinkMaxStreamsTotal = Math.max(0, getIntValue('txtLinkMaxStreamsTotal', 0));
            var takes = {};
            view.querySelectorAll('#linkTakeRows [data-server-key]').forEach(function (row) {
                takes[row.getAttribute('data-server-key')] = Math.max(0, parseInt(row.querySelector('.zooid-link-take').value, 10) || 0);
            });
            (config.Servers || []).forEach(function (server) {
                if (Object.prototype.hasOwnProperty.call(takes, server.Key)) server.LinkTakeMaxStreams = takes[server.Key];
            });
            config.LinkCacheSizing = getValue('selLinkCacheSizing', 'Off');
            var cacheSize = parseFloat(getValue('txtLinkCacheSizeGb'));
            if (!isNaN(cacheSize)) {
                config.LinkCacheSizeGb = cacheSize > 0 ? Math.max(1, Math.floor(cacheSize)) : 0;
            }
            config.LinkCachePercent = Math.min(100, Math.max(1, getIntValue('txtLinkCachePercent', 50)));
            config.LinkCachePath = getValue('txtLinkCachePath') || '';
            config.LinkCacheRetentionDays = Math.max(0, getIntValue('txtLinkCacheRetentionDays', 30));
            config.LinkCachePreCacheEpisodes = Math.max(0, getIntValue('txtLinkCachePreCacheEpisodes', 2));
            config.LinkCacheRemovalOrder = getValue('selLinkCacheRemovalOrder', 'LastPlayed');
            // Only the users on screen can be judged. A saved id whose server did not answer this time is
            // kept as it was, so a failed user list never clears the filter and lets watched files back in.
            var shown = {};
            watchedFilterUsers.forEach(function (u) { shown[u.Id] = true; });
            var unseen = (config.WatchedFilterUserIds || []).filter(function (id) { return !shown[id]; });
            config.WatchedFilterUserIds = collectWatchedFilterUsers().concat(unseen);
            // Skipping is on exactly while users are picked.
            config.SkipWatchedByAllUsers = config.WatchedFilterUserIds.length > 0;
            config.DownloadNewContentMode = getValue('selDownloadNewContentMode', 'Enabled');
            config.ReplaceExistingContentMode = getValue('selReplaceExistingContentMode', 'Enabled');
            var missing = getValue('selMissingContent', 'Keep');
            config.MissingContentAction = missing;
            // The older field is kept matching, so an earlier value left in it is never read back.
            config.DeleteMissingContentMode = missing === 'Delete' ? 'Enabled' : missing === 'DeleteAfterApproval' ? 'RequireApproval' : 'Disabled';
            config.EnableRecyclingBin = getChecked('chkEnableRecyclingBin');
            config.RecyclingBinPath = getValue('txtRecyclingBinPath');
            config.RecyclingBinRetentionDays = getIntValue('txtRecyclingBinRetentionDays', 7);
            config.RemoveEmptyFoldersOnDelete = getChecked('chkRemoveEmptyFolders');
            config.MaxConcurrentDownloads = getIntValue('txtMaxConcurrentDownloads', 2);
            config.TempDownloadPath = getValue('txtTempDownloadPath') || null;
            config.MinimumFreeDiskSpaceGb = getIntValue('txtMinFreeDiskSpace', 10);
        }).then(loadLinkCacheStatus);
    }

    function loadHistorySettings(config) {
        needsUserMapping(config, 'chkEnableHistorySync', 'historyNeedsMapping', config.EnableHistorySync === true);
        setChecked('chkHistorySyncPlayedStatus', config.HistorySyncPlayedStatus !== false);
        setChecked('chkHistorySyncPlaybackPosition', config.HistorySyncPlaybackPosition !== false);
        setChecked('chkHistorySyncPlayCount', config.HistorySyncPlayCount !== false);
        setChecked('chkHistorySyncLastPlayedDate', config.HistorySyncLastPlayedDate !== false);
        setChecked('chkHistorySyncFavorites', config.HistorySyncFavorites !== false);
    }

    function saveHistorySettings() {
        return saveSection(function (config) {
            config.EnableHistorySync = hasUserMapping(config) && getChecked('chkEnableHistorySync');
            config.HistorySyncPlayedStatus = getChecked('chkHistorySyncPlayedStatus');
            config.HistorySyncPlaybackPosition = getChecked('chkHistorySyncPlaybackPosition');
            config.HistorySyncPlayCount = getChecked('chkHistorySyncPlayCount');
            config.HistorySyncLastPlayedDate = getChecked('chkHistorySyncLastPlayedDate');
            config.HistorySyncFavorites = getChecked('chkHistorySyncFavorites');
        });
    }

    // A choice is saved by name and may be read back by name or by number.
    var PRECEDENCE = ['Newest', 'Rank'];

    function choiceOf(value, names) {
        if (typeof value === 'number') return names[value] || names[0];
        return names.indexOf(value) >= 0 ? value : names[0];
    }

    function loadMetadataSettings(config) {
        setChecked('chkEnableMetadataSync', config.EnableMetadataSync || false);
        setChecked('chkMetadataSyncMetadata', config.MetadataSyncMetadata !== false);
        setChecked('chkMetadataSyncGenres', config.MetadataSyncGenres !== false);
        setChecked('chkMetadataSyncTags', config.MetadataSyncTags !== false);
        setChecked('chkMetadataSyncStudios', config.MetadataSyncStudios !== false);
        setChecked('chkMetadataSyncPeople', config.MetadataSyncPeople === true);
        setChecked('chkMetadataSyncImages', config.MetadataSyncImages !== false);
        setChecked('chkMetadataSyncFolderItems', config.MetadataSyncFolderItems === true);
        setChecked('chkMetadataSyncProvider', config.MetadataSyncProvider !== false);
        setChecked('chkMetadataSyncSegmentProvider', config.MetadataSyncSegmentProvider === true);
        setChecked('chkMetadataSyncReplaceSegments', config.MetadataSyncReplaceSegments === true);
        setChecked('chkMetadataSyncRemoveSegments', config.MetadataSyncRemoveSegments === true);
        setChecked('chkMetadataSyncConsolidateIntros', config.MetadataSyncConsolidateIntros === true);
        setChecked('chkMetadataSyncConsolidateOutros', config.MetadataSyncConsolidateOutros === true);
        setChecked('chkMetadataSyncConsolidateOtherSegments', config.MetadataSyncConsolidateOtherSegments === true);
        setValue('selMetadataSyncPrecedence', choiceOf(config.MetadataSyncPrecedence, PRECEDENCE));
    }

    function saveMetadataSettings() {
        return saveSection(function (config) {
            config.EnableMetadataSync = getChecked('chkEnableMetadataSync');
            config.MetadataSyncMetadata = getChecked('chkMetadataSyncMetadata');
            config.MetadataSyncGenres = getChecked('chkMetadataSyncGenres');
            config.MetadataSyncTags = getChecked('chkMetadataSyncTags');
            config.MetadataSyncStudios = getChecked('chkMetadataSyncStudios');
            config.MetadataSyncPeople = getChecked('chkMetadataSyncPeople');
            config.MetadataSyncImages = getChecked('chkMetadataSyncImages');
            config.MetadataSyncFolderItems = getChecked('chkMetadataSyncFolderItems');
            config.MetadataSyncProvider = getChecked('chkMetadataSyncProvider');
            config.MetadataSyncSegmentProvider = getChecked('chkMetadataSyncSegmentProvider');
            config.MetadataSyncReplaceSegments = getChecked('chkMetadataSyncReplaceSegments');
            config.MetadataSyncRemoveSegments = getChecked('chkMetadataSyncRemoveSegments');
            config.MetadataSyncConsolidateIntros = getChecked('chkMetadataSyncConsolidateIntros');
            config.MetadataSyncConsolidateOutros = getChecked('chkMetadataSyncConsolidateOutros');
            config.MetadataSyncConsolidateOtherSegments = getChecked('chkMetadataSyncConsolidateOtherSegments');
            config.MetadataSyncPrecedence = getValue('selMetadataSyncPrecedence') || 'Newest';
        });
    }

    function loadPeopleSettings(config) {
        setChecked('chkEnablePeopleSync', config.EnablePeopleSync === true);
        setChecked('chkPeopleSyncImages', config.PeopleSyncImages !== false);
        setChecked('chkPeopleSyncProvider', config.PeopleSyncProvider !== false);
        setValue('selPeopleSyncPrecedence', choiceOf(config.PeopleSyncPrecedence, PRECEDENCE));
    }

    function savePeopleSettings() {
        return saveSection(function (config) {
            config.EnablePeopleSync = getChecked('chkEnablePeopleSync');
            config.PeopleSyncImages = getChecked('chkPeopleSyncImages');
            config.PeopleSyncProvider = getChecked('chkPeopleSyncProvider');
            config.PeopleSyncPrecedence = getValue('selPeopleSyncPrecedence') || 'Newest';
        });
    }

    function loadUserSyncSettings(config) {
        needsUserMapping(config, 'chkEnableUserSync', 'userNeedsMapping', config.EnableUserSync === true);
        setChecked('chkUserSyncPolicy', config.UserSyncPolicy !== false);
        setChecked('chkUserSyncConfiguration', config.UserSyncConfiguration !== false);
        setChecked('chkUserSyncProfileImage', config.UserSyncProfileImage !== false);
        setValue('selUserSyncPrecedence', choiceOf(config.UserSyncPrecedence, PRECEDENCE));
        setValue('selUserSyncConflict', choiceOf(config.UserSyncConflict, ['Newest', 'Permissive', 'Restrictive']));
    }

    function saveUserSyncSettings() {
        return saveSection(function (config) {
            config.EnableUserSync = hasUserMapping(config) && getChecked('chkEnableUserSync');
            config.UserSyncPolicy = getChecked('chkUserSyncPolicy');
            config.UserSyncConfiguration = getChecked('chkUserSyncConfiguration');
            config.UserSyncProfileImage = getChecked('chkUserSyncProfileImage');
            config.UserSyncPrecedence = getValue('selUserSyncPrecedence') || 'Newest';
            config.UserSyncConflict = getValue('selUserSyncConflict') || 'Newest';
        });
    }

    function hasUserMapping(config) {
        var norm = function (id) { return (id || '').replace(/-/g, '').toLowerCase(); };
        return (config.Servers || []).some(function (server) {
            var self = server.AccessLevel === 'User' ? norm(server.AuthenticatedUserId) : '';
            return server.IsEnabled !== false && (server.UserMappings || []).some(function (m) {
                return m.IsEnabled !== false && m.SourceUserId && m.LocalUserId && (!self || norm(m.SourceUserId) === self);
            });
        });
    }

    function loadPlaylistSettings(config) {
        needsUserMapping(config, 'chkEnablePlaylistSync', 'playlistNeedsMapping', config.EnablePlaylistSync === true);
        setChecked('chkPlaylistSyncShares', config.PlaylistSyncShares !== false);
        setValue('selPlaylistSyncPrecedence', choiceOf(config.PlaylistSyncPrecedence, PRECEDENCE));
        setValue('selPlaylistRemovedAction', choiceOf(config.PlaylistRemovedAction, ['Delete', 'Keep']));
    }

    // History, playlists, and user settings all travel by user mapping. Without one there is nothing
    // to sync, so the switch is off and says what to do first.
    function needsUserMapping(config, toggleId, warningId, on) {
        var mapped = hasUserMapping(config);
        var toggle = getEl(toggleId);
        if (toggle) toggle.disabled = !mapped;
        setChecked(toggleId, mapped && on);
        setVisible(warningId, !mapped);
    }

    function savePlaylistSettings() {
        return saveSection(function (config) {
            config.EnablePlaylistSync = hasUserMapping(config) && getChecked('chkEnablePlaylistSync');
            config.PlaylistSyncShares = getChecked('chkPlaylistSyncShares');
            config.PlaylistSyncPrecedence = getValue('selPlaylistSyncPrecedence') || 'Newest';
            config.PlaylistRemovedAction = getValue('selPlaylistRemovedAction') || 'Delete';
        });
    }

    function loadProcessingSettings(config) {
        setValue('txtHintDebounceSeconds', config.HintDebounceSeconds || 60);
        setValue('txtHintRetrySeconds', config.HintRetrySeconds || 30);
        setValue('txtHintRetryMaxMinutes', config.HintRetryMaxMinutes || 60);
        setValue('txtHintMaxRetries', config.HintMaxRetries || 0);
        setValue('txtHintRefusedRetryMinutes', config.HintRefusedRetryMinutes || 15);
        setValue('txtHintRefusedMaxRetries', config.HintRefusedMaxRetries || 0);
        setValue('txtRefreshParallelism', config.RefreshParallelism || 8);
        setValue('txtFullScanIntervalHours', config.FullScanIntervalHours == null ? 24 : config.FullScanIntervalHours);
        setChecked('chkDeepImageVerification', config.DeepImageVerification === true);
        setValue('txtMaxRetryCount', config.MaxRetryCount || 3);

        // Changes are only sent to Push and Sync servers, so their timing shows only when one exists.
        var sends = (config.Servers || []).some(function (s) {
            return s.IsEnabled !== false && (s.Mode === 'Push' || s.Mode === 'Sync' || s.Mode === 1 || s.Mode === 2);
        });
        setVisible('hintSettings', sends);
    }

    function saveProcessingSettings() {
        return saveSection(function (config) {
            config.HintDebounceSeconds = Math.min(3600, Math.max(1, getIntValue('txtHintDebounceSeconds', 60)));
            config.HintRetrySeconds = Math.min(3600, Math.max(5, getIntValue('txtHintRetrySeconds', 30)));
            config.HintRetryMaxMinutes = Math.min(1440, Math.max(1, getIntValue('txtHintRetryMaxMinutes', 60)));
            config.HintMaxRetries = Math.min(1000, Math.max(0, getIntValue('txtHintMaxRetries', 0)));
            config.HintRefusedRetryMinutes = Math.min(1440, Math.max(1, getIntValue('txtHintRefusedRetryMinutes', 15)));
            config.HintRefusedMaxRetries = Math.min(1000, Math.max(0, getIntValue('txtHintRefusedMaxRetries', 0)));
            config.RefreshParallelism = Math.min(16, Math.max(1, getIntValue('txtRefreshParallelism', 8)));
            config.FullScanIntervalHours = Math.min(720, Math.max(0, getIntValue('txtFullScanIntervalHours', 24)));
            config.DeepImageVerification = getChecked('chkDeepImageVerification');
            config.MaxRetryCount = Math.min(10, Math.max(1, getIntValue('txtMaxRetryCount', 3)));
        });
    }

    var grantUsers = [];
    var grantsLoaded = false;

    function fetchGrantUsers() {
        return ApiClient.fetch({ url: ApiClient.getUrl('Users'), type: 'GET', dataType: 'json' }).then(function (users) {
            grantUsers = (users || []).map(function (u) { return { Id: u.Id.replace(/-/g, '').toLowerCase(), Name: u.Name }; });
        }).catch(function () {
            grantUsers = [];
        });
    }

    // The Repeater that holds the whitelist rows, or null before the users have loaded.
    var grantRepeater = null;

    // grantChoices
    // Lists the choices of a row's User field: API Keys, every user here, and any saved user no longer here.
    //
    // Inputs
    // grants [object[]]: The saved rows.
    //
    // Output
    // [object[]]: The choices as { value, label }.
    function grantChoices(grants) {
        var choices = [{ value: '', label: ZooidShared.t.tr('OptionSelectUser') }, { value: 'apikey', label: ZooidShared.t.tr('HeaderApiKeys') }];
        var known = { apikey: true };
        grantUsers.forEach(function (u) {
            known[u.Id] = true;
            choices.push({ value: u.Id, label: u.Name });
        });
        grants.forEach(function (g) {
            if (!g.UserId || known[g.UserId]) return;
            known[g.UserId] = true;
            choices.push({ value: g.UserId, label: g.UserName || g.UserId });
        });
        return choices;
    }

    // collectGrants
    // Reads the whitelist rows that name a user, with each row's locations split at its commas.
    //
    // Output
    // [object[]]: The rows as { UserId, UserName, Locations }.
    function collectGrants() {
        if (!grantRepeater) return [];
        var names = {};
        grantRepeater.choices.forEach(function (c) { names[c.value] = c.label; });
        return grantRepeater.handle.getValue().filter(function (row) { return !!row.UserId; }).map(function (row) {
            return {
                UserId: row.UserId,
                UserName: names[row.UserId] || '',
                Locations: String(row.Locations || '').split(',').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; })
            };
        });
    }

    // loadCallerAccessSettings
    // Loads the users and draws the whitelist as a Repeater of a user and their locations.
    //
    // Inputs
    // config [object]: The plugin configuration.
    function loadCallerAccessSettings(config) {
        grantsLoaded = false;
        fetchGrantUsers().then(function () {
            var container = getEl('callerGrants');
            if (!container) return;
            if (grantRepeater) grantRepeater.handle.destroy();
            container.innerHTML = '';
            var grants = (config.PeerCallerGrants || []).map(function (g) {
                return { UserId: (g.UserId || '').replace(/-/g, '').toLowerCase(), UserName: g.UserName, Locations: (g.Locations || []).join(', ') };
            });
            var choices = grantChoices(grants);
            var handle = zooidModule.createRepeater({
                fields: [
                    { key: 'UserId', label: ZooidShared.t.tr('HeaderUser'), type: 'select', options: choices, width: '1fr' },
                    { key: 'Locations', label: ZooidShared.t.tr('LabelLocations'), type: 'text', placeholder: ZooidShared.t.tr('Default'), width: '2fr' }
                ],
                value: grants.map(function (g) { return { UserId: g.UserId, Locations: g.Locations }; }),
                addText: ZooidShared.t.tr('ButtonAddUser'),
                rowName: ZooidShared.t.tr('HeaderUser'),
                emptyText: ZooidShared.t.tr('EmptyWhitelistUsers')
            });
            grantRepeater = { handle: handle, choices: choices };
            container.appendChild(handle.element);
            grantsLoaded = true;
        });
    }

    function saveCallerAccessSettings() {
        if (!grantsLoaded) return Promise.reject(new Error(ZooidShared.t.tr('ErrorSaveWhitelist')));
        var grants = collectGrants();
        return saveSection(function (config) {
            config.PeerCallerGrants = grants;
        });
    }

    function loadConfig() {
        ZooidShared.getConfig().then(function(config) {
            currentConfig = config;

            loadContentSettings(config);
            loadBandwidthSettings(config);
            loadHistorySettings(config);
            loadMetadataSettings(config);
            loadPeopleSettings(config);
            loadUserSyncSettings(config);
            loadPlaylistSettings(config);
            loadProcessingSettings(config);

            // A sync type's options only show while it is on.
            [['chkEnableContentSync', 'contentSyncOptions'], ['chkEnableHistorySync', 'historySyncOptions'],
                ['chkEnableMetadataSync', 'metadataSyncOptions'], ['chkEnablePeopleSync', 'peopleSyncOptions'],
                ['chkEnableUserSync', 'userSyncOptions'], ['chkEnablePlaylistSync', 'playlistSyncOptions'],
                ['chkMetadataSyncSegmentProvider', 'segmentProviderOptions']].forEach(function (pair) {
                ZooidShared.bindReveal(pair[0], pair[1]);
            });
            reflectLinkCacheActions();
            bindSwitchTiles();
            loadCallerAccessSettings(config);
            fetchWatchedFilterUsers();
            saveBars.clean();
        }).catch(function() {
            ZooidShared.setStatus('settingsStatus', ZooidShared.t.tr('ErrorLoadSettings'), true, { timeout: 0 });
        });
    }

    // bindPage
    // Wires the page's buttons and controls. Stolon calls it once, the first time the page shows.
    // bindSwitchTiles
    // Colors each sync type's tile by its switch, green while the type is on and gray while it is off, and follows
    // the switch as it changes. Sections with no switch keep the accent.
    function bindSwitchTiles() {
        ['chkEnableContentSync', 'chkEnableHistorySync', 'chkEnableMetadataSync', 'chkEnablePeopleSync', 'chkEnablePlaylistSync', 'chkEnableUserSync'].forEach(function (id) {
            var box = getEl(id);
            var section = box && box.closest('.stolon-collapsible-section');
            var tile = section && section.querySelector('.stolon-collapsible-header .stolon-collapsible-tile');
            if (!tile) return;
            var paint = function () {
                tile.classList.toggle('stolon-green', box.checked);
                tile.classList.toggle('stolon-gray', !box.checked);
            };
            paint();
            if (!box.dataset.tileBound) {
                box.dataset.tileBound = '1';
                box.addEventListener('change', paint);
            }
        });
    }

    function bindPage() {
        ZooidShared.initCollapsibles();

        // Each section ends in its own Save Bar.
        [
            ['bandwidthConfigContent', saveBandwidthSettings, 'ToastBandwidthSaved', 'ErrorSaveBandwidth'],
            ['processingConfigContent', saveProcessingSettings, 'ToastProcessingSettingsSaved', 'ErrorSaveProcessingSettings'],
            ['callerAccessContent', saveCallerAccessSettings, 'ToastWhitelistSaved', 'ErrorSaveWhitelist'],
            ['contentSyncSettingsContent', saveContentSettings, 'ToastContentSettingsSaved', 'ErrorSaveContentSettings'],
            ['historySyncSettingsContent', saveHistorySettings, 'ToastHistorySettingsSaved', 'ErrorSaveHistorySettings'],
            ['metadataSyncSettingsContent', saveMetadataSettings, 'ToastMetadataSettingsSaved', 'ErrorSaveMetadataSettings'],
            ['peopleSyncSettingsContent', savePeopleSettings, 'ToastPeopleSettingsSaved', 'ErrorSavePeopleSettings'],
            ['playlistSyncSettingsContent', savePlaylistSettings, 'ToastPlaylistSettingsSaved', 'ErrorSavePlaylistSettings'],
            ['userSyncSettingsContent', saveUserSyncSettings, 'ToastUserSettingsSaved', 'ErrorSaveUserSettings']
        ].forEach(function (section) {
            saveBars.add(getEl(section[0]), {
                savedText: ZooidShared.t.tr(section[2]),
                failedText: ZooidShared.t.tr(section[3]),
                onSave: section[1]
            });
        });
        bindClick('btnClearLinkCache', clearLinkCache);
        var contentSync = getEl('chkEnableContentSync');
        if (contentSync) contentSync.addEventListener('change', reflectLinkCacheActions);
    }
}
