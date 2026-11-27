// zooid_sync_content.js
// The Content sync table and the controller that opens it. Built by zooid_sync_page.js from the
// page context and the table kit in zooid_sync_table.js.

// createContentSyncTableModule
// Builds the Content tool: its table, status counts, health figures, detail modal, and bulk actions.
//
// Inputs
// ctx [object]: The page context from zooid_sync_page.js.
// kit [object]: The table kit from createSyncTableKit.
//
// Output
// [object]: The view's module, with table, currentConfig, init, loadAll, loadStatus, loadItems, and the
// modal and bulk actions.
export function createContentSyncTableModule(ctx, kit) {
    'use strict';

    var view = ctx.view;
    var ZooidShared = ctx.shared;
    var confirmDialog = ctx.confirmDialog;
    var createDialogItem = ctx.createDialogItem;
    var createSyncTableModule = kit.createSyncTableModule;
    var renderRowInfo = kit.renderRowInfo;
    var setHealthLastSync = kit.setHealthLastSync;
    var setHealthCount = kit.setHealthCount;
    var t = ZooidShared.t;

    // PENDING_KEYS
    // The key of each pending status's name, by the pending type the server sends.
    var PENDING_KEYS = { Download: 'StatusPendingDownload', Replacement: 'StatusPendingReplacement', Deletion: 'StatusPendingDeletion' };

    // STATUS_KEYS
    // The key of each status's name, by the status the server sends.
    var STATUS_KEYS = { Synced: 'StatusSynced', Queued: 'StatusQueued', Errored: 'StatusErrored', Ignored: 'StatusIgnored', Pending: 'StatusPending', Deleting: 'StatusDeleting' };

    var SyncTableModule = createSyncTableModule({
        name: '',
        prefix: '',
        containerId: 'syncItemsTableContainer',
        listEndpoint: 'Items',
        statusEndpoint: 'Status',
        itemsEndpoint: '',
        modalId: 'itemDetailModal',
        modalButtonPrefix: 'btnModal',
        extraModalButtons: [
            { id: 'MarkSynced', method: 'modalMarkSynced' },
            { id: 'Keep', method: 'modalKeep' },
            { id: 'Delete', method: 'modalDelete' }
        ],
        bulkButtons: [
            { id: 'Ignore', title: t.tr('ButtonIgnore'), icon: 'block', method: 'bulkIgnore' },
            { id: 'MarkSynced', title: t.tr('ButtonMarkSynced'), icon: 'check_circle', method: 'bulkMarkSynced' },
            { id: 'Queue', title: t.tr('ButtonQueue'), icon: 'playlist_add', className: 'stolon-button stolon-primary', method: 'bulkQueue' },
            { id: 'MakeCopy', title: t.tr('ButtonKeepCopy'), icon: 'push_pin', method: 'bulkMakeCopy' },
            { id: 'Delete', title: t.tr('ButtonDeleteLocalFile'), icon: 'delete', className: 'stolon-button stolon-destructive', method: 'bulkDelete' }
        ],
        idKey: 'SourceItemId',
        tasks: {
            refresh: { key: 'ZooidUpdateTables' },
            sync: { key: 'ZooidDownloadContent' }
        },
        messages: {
            startRefreshFailed: 'MessageStartRefreshFailed',
            startSyncFailed: 'MessageStartSyncFailed',
            ignoredOne: 'ToastItemsIgnoredOne',
            ignoredMany: 'ToastItemsIgnoredMany',
            queuedOne: 'ToastItemsQueuedOne',
            queuedMany: 'ToastItemsQueuedMany',
            ignoreFailed: 'ErrorIgnoreItems',
            queueFailed: 'ErrorQueueItems',
            retryNone: 'MessageNoErroredItems',
            retriedOne: 'MessageErroredItemsRetriedOne',
            retriedMany: 'MessageErroredItemsRetriedMany',
            retriedUnknown: 'MessageErroredItemsRetried',
            retryFailed: 'ErrorRetryItems',
            statusUpdated: 'ToastItemStatusUpdated',
            statusFailed: 'ErrorItemStatusUpdate'
        },
        emptyMessage: t.tr('EmptyContentItems'),
        filters: {
            options: [
                { value: 'Synced', label: t.tr('StatusSynced') },
                { value: 'Linked', label: t.tr('StatusLinked') },
                { value: 'Queued', label: t.tr('StatusQueued') },
                { value: 'Errored', label: t.tr('StatusErrored') },
                { value: 'Ignored', label: t.tr('StatusIgnored') },
                { value: 'Pending', label: t.tr('StatusPending') },
                { value: 'Cached', label: t.tr('StatusCached') },
                { value: 'Pending:Download', label: t.tr('StatusPendingDownload'), id: 'optPendingDownload', hidden: true },
                { value: 'Pending:Replacement', label: t.tr('StatusPendingReplacement'), id: 'optPendingReplacement', hidden: true },
                { value: 'Pending:Deletion', label: t.tr('StatusPendingDeletion'), id: 'optPendingDeletion', hidden: true },
                { value: 'Deleting', label: t.tr('StatusDeleting'), id: 'optDeleting', hidden: true }
            ],
            buildParams: function(filterValue) {
                if (filterValue === 'Cached') {
                    return { cached: true };
                }
                // A synced row is a copy or a link, so the two are filtered apart.
                if (filterValue === 'Synced') {
                    return { status: 'Synced', storage: 'Copy' };
                }
                if (filterValue === 'Linked') {
                    return { status: 'Synced', storage: 'Link' };
                }
                if (filterValue.indexOf(':') > -1) {
                    var parts = filterValue.split(':');
                    return { status: parts[0], pendingType: parts[1] };
                }
                return { status: filterValue };
            }
        },
        tableOptions: function(self) {
            return {
                getDisplayStatus: function(item) { return self.getDisplayStatus(item); },
                getStatusClass: function(item) { return self.getStatusClass(item); }
            };
        },
        columns: function() {
            return [
                {
                    key: 'name',
                    label: t.tr('ColumnItem'),
                    type: 'custom',
                    className: 'stolon-table-cell-with-thumb',
                    image: function(item) { return ZooidShared.proxyImage(item.SourceItemId, false, item.ServerKey); },
                    render: function(item) {
                        var sourcePath = item.SourcePath || '';
                        var libraries = t.format('MappingArrow', item.SourceLibraryName || t.tr('Unknown'), item.LocalLibraryName || t.tr('Unknown'));
                        return renderRowInfo(ZooidShared.getFileName(sourcePath), libraries, item, item.Status, sourcePath);
                    }
                },
                {
                    key: 'details',
                    label: t.tr('ColumnDetails'),
                    type: 'custom',
                    className: 'zooid-details-cell',
                    render: function(item) {
                        if (item.Status === 'Synced') {
                            return '<span class="stolon-badge stolon-gray">' + ZooidShared.escapeHtml(t.tr('BadgeNoChanges')) + '</span>';
                        }
                        var size = item.SourceSizeFormatted || '';
                        return size ? '<span class="stolon-badge stolon-purple">' + ZooidShared.escapeHtml(size) + '</span>' : '';
                    }
                },
                { key: 'Status', label: t.tr('HeaderStatus'), type: 'status' }
            ];
        },
        loadHealth: function() {
            return Promise.all([
                ZooidShared.getConfig(),
                ZooidShared.apiRequest('PendingSize', 'GET')
            ]).then(function(results) {
                var pendingSizeData = results[1];
                setHealthLastSync('healthLastSync', results[0].LastSyncEndTime);
                setHealthCount('healthLibraryCount', ZooidShared.allLibraryMappings(results[0]).length);

                var pendingCountEl = view.querySelector('#healthPendingCount');
                if (pendingSizeData && typeof pendingSizeData.TotalPendingBytes === 'number') {
                    pendingCountEl.textContent = ZooidShared.formatSize(pendingSizeData.TotalPendingBytes);
                    pendingCountEl.className = pendingSizeData.TotalPendingBytes > 0 ? 'zooid-health-value stolon-warning' : 'zooid-health-value';
                } else {
                    pendingCountEl.textContent = ZooidShared.formatSize(0);
                    pendingCountEl.className = 'zooid-health-value';
                }
            });
        },
        statusRequest: function(item, status) {
            return { endpoint: status === 'Ignored' ? 'IgnoreItems' : 'QueueItems', body: { SourceItemIds: [item.SourceItemId] } };
        },
        methods: {
            loadStatus: function() {
                var self = this;
                return ZooidShared.apiRequest('Status', 'GET').then(function(status) {
                    self._showStatusCounts(status);

                    var show = function(countId, groupId, count, title) {
                        view.querySelector('#' + countId).textContent = count;
                        view.querySelector('#' + groupId).setAttribute('title', title);
                    };

                    // Pending counts everything waiting to download, be replaced, or be deleted, with each kind in its title.
                    var pendingTotal = (status.PendingDownload || 0) + (status.PendingReplacement || 0) + (status.PendingDeletion || 0);
                    show('pendingCount', 'statusGroupPending', pendingTotal,
                        t.format('TitlePendingBreakdown', pendingTotal, status.PendingDownload || 0, status.PendingReplacement || 0, status.PendingDeletion || 0));
                    show('deletingCount', 'statusGroupDeleting', status.Deleting || 0, t.format('StatusCountTitle', t.tr('StatusDeleting'), status.Deleting || 0));
                }).catch(function() {
                    // The status endpoint is not available yet.
                });
            },

            retryErrors: function() {
                var self = this;
                ZooidShared.apiRequest('RetryErroredItems', 'POST', {}).then(function() {
                    ZooidShared.syncStatus(t.tr('MessageErroredItemsRetried'), false);
                    self.loadStatus();
                    self.loadItems();
                }).catch(function() {
                    ZooidShared.syncStatus(t.tr('ErrorRetryItems'), true);
                });
            },

            bulkIgnore: function() {
                var ids = this.table.getSelectedIds();
                if (ids.length === 0) return;
                this.postSelection('IgnoreItems', { SourceItemIds: ids }, ZooidShared.t.plural(ids.length, 'ToastItemsIgnoredOne', 'ToastItemsIgnoredMany'), t.tr('ErrorIgnoreItems'));
            },

            // Pending deletions cannot be queued, so they are left out.
            bulkQueue: function() {
                var ids = this.table.getSelectedIds();
                if (ids.length === 0) return;

                var items = this.table.getItems();
                var queueable = ids.filter(function(id) {
                    var item = items.find(function(i) { return i.SourceItemId === id; });
                    return !(item && item.Status === 'Pending' && item.PendingType === 'Deletion');
                });
                if (queueable.length === 0) {
                    ZooidShared.syncStatus(t.tr('MessageNothingToQueue'), false);
                    return;
                }

                this.postSelection('QueueItems', { SourceItemIds: queueable }, ZooidShared.t.plural(queueable.length, 'ToastItemsQueuedOne', 'ToastItemsQueuedMany'), t.tr('ErrorQueueItems'));
            },

            // The server checks the local files exist before marking.
            bulkMarkSynced: function() {
                var ids = this.table.getSelectedIds();
                if (ids.length === 0) return;
                this.postSelection('MarkSynced', { SourceItemIds: ids }, function(result) {
                    var msg = ZooidShared.t.plural((result && result.Synced) || 0, 'MessageMarkedSyncedOne', 'MessageMarkedSyncedMany');
                    if (result && result.NotFound > 0) {
                        msg = ZooidShared.t.plural(result.NotFound, 'MessageLocalFilesMissingOne', 'MessageLocalFilesMissingMany', msg);
                    }
                    return t.format('MessageSentence', msg);
                }, t.tr('ErrorMarkItemsSynced'));
            },

            // Only links can become copies. The server skips anything else, and moves cached files into place now.
            bulkMakeCopy: function() {
                var ids = this.table.getSelectedIds();
                if (ids.length === 0) return;
                this.postSelection('PromoteItems', { SourceItemIds: ids }, this.keepMessage, t.tr('ErrorKeepCopies'));
            },

            modalKeep: function() {
                var self = this;
                if (!this.currentModalItem) return;
                ZooidShared.apiRequest('PromoteItems', 'POST', { SourceItemIds: [this.currentModalItem.SourceItemId] }).then(function(result) {
                    self.closeModal();
                    ZooidShared.syncStatus(self.keepMessage(result), false);
                }).catch(function() {
                    ZooidShared.syncStatus(t.tr('ErrorKeepCopy'), true);
                });
            },

            keepMessage: function(result) {
                var promoted = (result && result.Promoted) || 0;
                var fromCache = (result && result.FromCache) || 0;
                var msg = fromCache > 0
                    ? ZooidShared.t.plural(fromCache, 'MessageCachedLinksMovingOne', 'MessageCachedLinksMovingMany')
                    : ZooidShared.t.plural(promoted, 'MessageLinksCopyNextOne', 'MessageLinksCopyNextMany');
                if (fromCache > 0 && promoted > fromCache) {
                    msg = t.format('MessageAlsoDownloaded', promoted - fromCache, msg);
                }
                if (result && result.Skipped > 0) {
                    msg = ZooidShared.t.plural(result.Skipped, 'MessageNotLinksOne', 'MessageNotLinksMany', msg);
                }
                return t.format('MessageSentence', msg);
            },

            bulkDelete: function() {
                var self = this;
                var ids = this.table.getSelectedIds();
                if (ids.length === 0) return;
                confirmDialog(t.tr('ConfirmDeleteItemsDetail'), {
                    title: ZooidShared.t.plural(ids.length, 'TitleDeleteItemsOne', 'TitleDeleteItemsMany'),
                    confirmText: t.tr('Delete'),
                    destructive: true
                }).then(function(confirmed) {
                    if (!confirmed) return;
                    self.postSelection('DeleteLocalItems', { SourceItemIds: ids }, function(result) {
                        return result && result.Deleted > 0 ? ZooidShared.t.plural(result.Deleted, 'MessageItemsDeletedOne', 'MessageItemsDeletedMany') : null;
                    }, t.tr('ErrorDeleteItems'));
                });
            },

            getDisplayStatus: function(item) {
                var linked = item.StorageMode === 'Link' || item.StorageMode === 'Promoting';
                if (item.Status === 'Synced') {
                    if (!linked) return t.tr('StatusSynced');
                    return item.StorageMode === 'Promoting' ? t.tr('StatusLinkedCopyNext') : item.Cached ? t.tr('StatusLinkedCached') : t.tr('StatusLinked');
                }
                var name = item.Status === 'Pending' && PENDING_KEYS[item.PendingType] ? t.tr(PENDING_KEYS[item.PendingType])
                    : STATUS_KEYS[item.Status] ? t.tr(STATUS_KEYS[item.Status]) : item.Status;
                if (item.StorageMode === 'Link') return item.Cached ? t.format('StatusWithLinkCached', name) : t.format('StatusWithLink', name);
                if (item.StorageMode === 'Promoting') return t.format('StatusWithLinkToCopy', name);
                if (item.StorageMode === 'Unkeeping') return t.format('StatusWithCopyToLink', name);
                return name;
            },

            getStatusClass: function(item) {
                if (item.Status === 'Pending' && item.PendingType) {
                    return 'Pending-' + item.PendingType;
                }
                return item.Status;
            },

            showDetail: function(item) {
                this.showItemDetail(item.SourceItemId);
            },

            showItemDetail: function(sourceItemId) {
                var self = this;
                var items = this.table.getItems();
                var item = items.find(function(i) { return i.SourceItemId === sourceItemId; });
                if (!item) return;

                self.currentModalItem = item;

                view.querySelector('#modalTitle').textContent = ZooidShared.getFileName(item.SourcePath) || item.ItemName || t.tr('Unknown');

                var statusBadge = view.querySelector('#modalStatusBadge');
                var displayStatus = self.getDisplayStatus(item);
                var statusClass = self.getStatusClass(item);
                statusBadge.textContent = displayStatus;
                statusBadge.className = 'stolon-table-status-badge ' + statusClass;

                var sourceServerName = ZooidShared.serverNameFor(self.currentConfig, item.ServerKey);
                var localServerName = ZooidShared.localServerName || t.tr('ServerLocal');
                view.querySelector('#modalServerMapping').textContent = t.format('MappingArrow', sourceServerName, localServerName);

                if (item.LastSyncTime) {
                    var lastSync = new Date(item.LastSyncTime);
                    view.querySelector('#modalLastSync').textContent = ZooidShared.formatRelativeTime(lastSync);
                } else {
                    view.querySelector('#modalLastSync').textContent = '-';
                }

                var sourceLibrary = item.SourceLibraryName || t.tr('Unknown');
                var localLibrary = item.LocalLibraryName || t.tr('Unknown');
                view.querySelector('#modalLibraryMapping').textContent = t.format('MappingArrow', sourceLibrary, localLibrary);

                var errorSection = view.querySelector('#modalErrorSection');
                if (item.Status === 'Errored' && item.ErrorMessage) {
                    view.querySelector('#modalError').textContent = item.ErrorMessage;
                    errorSection.classList.remove('stolon-hidden');
                } else {
                    errorSection.classList.add('stolon-hidden');
                }

                var retrySection = view.querySelector('#modalRetrySection');
                if (item.RetryCount > 0) {
                    view.querySelector('#modalRetryCount').textContent = ZooidShared.t.plural(item.RetryCount, 'AttemptCountOne', 'AttemptCountMany');
                    retrySection.classList.remove('stolon-hidden');
                } else {
                    retrySection.classList.add('stolon-hidden');
                }

                var companionSection = view.querySelector('#modalCompanionFilesSection');
                if (item.CompanionFiles) {
                    var companionList = item.CompanionFiles.split(',').map(function(f) {
                        return f.trim();
                    }).filter(function(f) {
                        return f.length > 0;
                    });
                    if (companionList.length > 0) {
                        view.querySelector('#modalCompanionFiles').innerHTML = companionList.map(function(f) {
                            return '<div class="zooid-companion-item">' +
                                '<span class="zooid-companion-icon material-icons" aria-hidden="true">description</span>' +
                                '<span class="zooid-companion-name">' + ZooidShared.escapeHtml(f) + '</span>' +
                                '</div>';
                        }).join('');
                        companionSection.classList.remove('stolon-hidden');
                    } else {
                        companionSection.classList.add('stolon-hidden');
                    }
                } else {
                    companionSection.classList.add('stolon-hidden');
                }

                view.querySelector('#modalSourcePath').textContent = item.SourcePath || t.tr('LabelNotAvailable');
                view.querySelector('#modalSourceSize').textContent = ZooidShared.formatSize(item.SourceSize);

                var localPathEl = view.querySelector('#modalLocalPath');
                var localPathNoteEl = view.querySelector('#modalLocalPathNote');
                var localSizeRowEl = view.querySelector('#modalLocalSizeRow');
                var localSizeEl = view.querySelector('#modalLocalSize');
                var localExists = item.Status === 'Synced';

                if (item.LocalPath) {
                    localPathEl.textContent = item.LocalPath;
                    if (localExists) {
                        localPathNoteEl.textContent = '';
                        localPathNoteEl.classList.add('stolon-hidden');
                        localSizeEl.textContent = ZooidShared.formatSize(item.LocalSize || item.SourceSize);
                        localSizeRowEl.classList.remove('stolon-hidden');
                    } else {
                        localPathNoteEl.textContent = t.tr('HelpLocalPathPending');
                        localPathNoteEl.classList.remove('stolon-hidden');
                        localSizeRowEl.classList.add('stolon-hidden');
                    }
                } else {
                    localPathEl.textContent = t.tr('LabelNotAvailable');
                    localPathNoteEl.classList.add('stolon-hidden');
                    localSizeRowEl.classList.add('stolon-hidden');
                }

                var btnQueue = view.querySelector('#btnModalQueue');
                var btnMarkSynced = view.querySelector('#btnModalMarkSynced');
                var modalDeleteBtn = view.querySelector('#btnModalDelete');
                var isPendingDeletion = item.Status === 'Pending' && item.PendingType === 'Deletion';
                var isPendingDownloadOrReplacement = item.Status === 'Pending' && (item.PendingType === 'Download' || item.PendingType === 'Replacement');
                var isSynced = item.Status === 'Synced';
                var isQueuedOrErrored = item.Status === 'Queued' || item.Status === 'Errored';

                btnQueue.querySelector('span').textContent = isSynced ? t.tr('ButtonResync') : t.tr('ButtonQueue');

                btnMarkSynced.classList.toggle('stolon-hidden', !isQueuedOrErrored);

                // Only a link can be kept as a copy, and not one already on its way or on its way out.
                view.querySelector('#btnModalKeep').classList.toggle('stolon-hidden', !(item.StorageMode === 'Link' && !isPendingDeletion
                    && item.Status !== 'Ignored' && item.Status !== 'Deleting'));

                if (isPendingDeletion) {
                    btnQueue.classList.add('stolon-hidden');
                    modalDeleteBtn.classList.remove('stolon-hidden');
                } else if (isPendingDownloadOrReplacement) {
                    btnQueue.classList.remove('stolon-hidden');
                    modalDeleteBtn.classList.add('stolon-hidden');
                } else {
                    btnQueue.classList.remove('stolon-hidden');
                    modalDeleteBtn.classList.remove('stolon-hidden');
                }

                self._sidecar.open();
            },

            // A pending deletion cannot be queued.
            modalQueue: function() {
                var item = this.currentModalItem;
                if (item && !(item.Status === 'Pending' && item.PendingType === 'Deletion')) {
                    this.setModalStatus('Queued');
                }
            },

            modalMarkSynced: function() {
                var self = this;
                if (!this.currentModalItem) return;

                ZooidShared.apiRequest('MarkSynced', 'POST', { SourceItemIds: [this.currentModalItem.SourceItemId] }).then(function(result) {
                    self.closeModal();
                    if (result && result.Synced > 0) {
                        ZooidShared.syncStatus(t.tr('MessageItemMarkedSynced'), false);
                    } else {
                        ZooidShared.syncStatus(t.tr('ErrorLocalFileMissing'), true);
                    }
                }).catch(function() {
                    ZooidShared.syncStatus(t.tr('ErrorMarkItemSynced'), true);
                });
            },

            modalDelete: function() {
                var self = this;
                if (!this.currentModalItem) return;

                var item = this.currentModalItem;
                var fileName = ZooidShared.getFileName(item.LocalPath || item.SourcePath);
                var libraries = t.format('MappingArrow', item.SourceLibraryName || t.tr('Unknown'), item.LocalLibraryName || t.tr('Unknown'));
                confirmDialog(t.tr('ConfirmDeleteFile'), {
                    title: t.tr('TitleDeleteFile'),
                    context: createDialogItem({ image: ZooidShared.proxyImage(item.SourceItemId, false, item.ServerKey), title: fileName, subtitle: libraries }),
                    confirmText: t.tr('Delete'),
                    destructive: true
                }).then(function(confirmed) {
                    if (!confirmed) return;
                    return ZooidShared.apiRequest('DeleteLocalItems', 'POST', { SourceItemIds: [item.SourceItemId] }).then(function() {
                        self.closeModal();
                        ZooidShared.syncStatus(t.tr('MessageItemDeleted'), false);
                    }).catch(function() {
                        ZooidShared.syncStatus(t.tr('ErrorDeleteItem'), true);
                    });
                });
            },

            updatePendingFilterVisibility: function(config) {
                var downloadMode = config.DownloadNewContentMode || 'Enabled';
                var replaceMode = config.ReplaceExistingContentMode || 'Enabled';
                var deleteMode = config.DeleteMissingContentMode || 'Disabled';

                var showPendingDownload = downloadMode === 'RequireApproval';
                var showPendingReplace = replaceMode === 'RequireApproval';
                // Automatic deletion still holds some deletions for approval, so both deletion states can
                // appear whenever deletion is on at all.
                var showPendingDelete = deleteMode !== 'Disabled';

                if (this.table) {
                    this.table.setFilterOptionVisible('optPendingDownload', showPendingDownload);
                    this.table.setFilterOptionVisible('optPendingReplacement', showPendingReplace);
                    this.table.setFilterOptionVisible('optPendingDeletion', showPendingDelete);
                    this.table.setFilterOptionVisible('optDeleting', showPendingDelete);
                }

                ZooidShared.setVisible('statusGroupDeleting', showPendingDelete);

                var showAnyPending = showPendingDownload || showPendingReplace || showPendingDelete;
                var pendingRow = view.querySelector('#pendingStatusRow');
                if (pendingRow) {
                    pendingRow.classList.toggle('stolon-hidden', !showAnyPending);
                }
            },
        }
    });

    return SyncTableModule;
}

// createContentPageController
// Builds the controller that opens the Content tool's table the first time it is shown.
//
// Inputs
// ctx [object]: The page context from zooid_sync_page.js.
// SyncTableModule [object]: The view's module from createContentSyncTableModule.
//
// Output
// [object]: A handle with init, which starts the table, reads the config, and loads the rows.
export function createContentPageController(ctx, SyncTableModule) {
    'use strict';

    var ZooidShared = ctx.shared;

    var ContentPageController = {
        init: function() {
            SyncTableModule.init();
            ZooidShared.fetchLocalServerName();
            ZooidShared.getConfig().then(function(config) {
                SyncTableModule.currentConfig = config;
                SyncTableModule.updatePendingFilterVisibility(config);
            }).catch(function() {
                // Without a config the pending filters keep their default visibility.
            });
            SyncTableModule.loadAll();
        }
    };

    return ContentPageController;
}
