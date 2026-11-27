// zooid_storage.js
// The Storage page. It shows each enabled library mapping of the picked server as a row with what it holds, and
// opens a row in a sidecar that edits how it keeps its files: Copy or Link, the link cache, Always keep, the library
// filter, and history negotiation. It also lists the permanent copies of the Link libraries and the link cache's use.
// The mappings themselves are made on the Servers page, and a save here changes only these fields of the stored mapping.

import * as zooidModule from './configurationpage?name=zooid_shared.js';

// LIBRARY_ICONS
// The icon for a library, by its collection type here, the way Jellyfin's own menus show it.
export var LIBRARY_ICONS = {
    movies: 'movie',
    tvshows: 'tv',
    music: 'library_music',
    musicvideos: 'music_video',
    books: 'menu_book',
    photos: 'photo_library',
    homevideos: 'video_camera_back',
    boxsets: 'collections',
    playlists: 'queue_music'
};

// idKey
// Writes a library or item id the one way, without dashes and in lowercase, so two spellings of one id match.
//
// Inputs
// id [string]: The id.
//
// Output
// [string]: The id as a key.
export function idKey(id) {
    return String(id || '').replace(/-/g, '').toLowerCase();
}

// modeOf
// Reads a server's Direction, stored as its name or its number.
//
// Inputs
// server [object]: The server entry.
//
// Output
// [string]: Pull, Push, or Sync.
export function modeOf(server) {
    var mode = server && server.Mode;
    if (mode === 1 || mode === 'Push') return 'Push';
    if (mode === 2 || mode === 'Sync') return 'Sync';
    return 'Pull';
}

// isLink
// Whether a library mapping keeps its files as links.
//
// Inputs
// mapping [object]: The library mapping.
//
// Output
// [boolean]: True for Link.
export function isLink(mapping) {
    return !!mapping && (mapping.StorageMode === 'Link' || mapping.StorageMode === 1);
}

// storageServers
// The servers whose libraries are mapped here. A Push server sends files and maps no libraries.
//
// Inputs
// config [object]: The plugin configuration.
//
// Output
// [object[]]: The server entries, in their rank order.
export function storageServers(config) {
    return ((config && config.Servers) || []).filter(function (s) {
        return s && modeOf(s) !== 'Push' && (s.LibraryMappings || []).length > 0;
    });
}

// enabledMappings
// A server's enabled library mappings, each with where it sits in the stored list.
//
// Inputs
// server [object]: The server entry, or null.
//
// Output
// [object[]]: Each as { mapping, index }.
export function enabledMappings(server) {
    var list = [];
    ((server && server.LibraryMappings) || []).forEach(function (mapping, index) {
        if (mapping && mapping.IsEnabled) list.push({ mapping: mapping, index: index });
    });
    return list;
}

// countFor
// The counts the LibraryStorage route gave for one library mapping.
//
// Inputs
// counts [object[]]: The route's answer, or null before it arrives.
// mapping [object]: The library mapping.
//
// Output
// [object]: Its counts, or null when the route gave none for it.
export function countFor(counts, mapping) {
    return (counts || []).find(function (c) {
        return idKey(c.SourceLibraryId) === idKey(mapping.SourceLibraryId) && idKey(c.LocalLibraryId) === idKey(mapping.LocalLibraryId);
    }) || null;
}

// summaryCards
// The count cards at the top of the page, for the picked server's enabled library mappings. With content sync off
// only the library count means something, and before the counts arrive only it shows.
//
// Inputs
// mappings [object[]]: The enabled library mappings.
// counts [object[]]: The LibraryStorage route's answer, or null.
// contentOn [boolean]: Whether content sync is on.
// t [object]: The strings.
// formatSize [function]: Writes a byte count, such as 1.2 GB.
//
// Output
// [object[]]: The cards, as renderCards takes them.
export function summaryCards(mappings, counts, contentOn, t, formatSize) {
    var cards = [{ count: mappings.length, label: t.tr('HeaderLibraries') }];
    if (!contentOn || !counts) return cards;
    var sum = { Copies: 0, Links: 0, CachedLinks: 0, Errored: 0, CopyBytes: 0 };
    mappings.forEach(function (mapping) {
        var c = countFor(counts, mapping);
        if (!c) return;
        Object.keys(sum).forEach(function (key) { sum[key] += c[key] || 0; });
    });
    cards.push({ count: sum.Copies, label: t.tr('ChartCopies'), color: 'blue' });
    cards.push({ count: sum.Links + sum.CachedLinks, label: t.tr('ChartLinks'), color: 'green' });
    if (sum.CachedLinks > 0) cards.push({ count: sum.CachedLinks, label: t.tr('ChartCachedLinks'), color: 'orange' });
    cards.push({ count: formatSize(sum.CopyBytes), label: t.tr('LabelSpaceUsed') });
    if (sum.Errored > 0) cards.push({ count: sum.Errored, label: t.tr('StatusErrored'), color: 'red' });
    return cards;
}

// libraryCard
// The media card of one library mapping: its icon, the library it fills, the source library, how it keeps its files,
// what it holds, and the most urgent thing that needs attention.
//
// Inputs
// mapping [object]: The library mapping.
// count [object]: Its counts from the LibraryStorage route, an empty object when the route gave none for it, or null
//   before the counts arrive.
// type [string]: The local library's collection type, such as movies, or empty when not known.
// contentOn [boolean]: Whether content sync is on.
// t [object]: The strings.
// shared [object]: The helper bag, for plural.
//
// Output
// [object]: The options createMediaCard takes, without onClick.
export function libraryCard(mapping, count, type, contentOn, t, shared) {
    var source = mapping.SourceLibraryName || mapping.SourceLibraryId || t.tr('LabelSourceLibrary');
    var badges = [];
    if (contentOn) {
        var linked = isLink(mapping);
        badges.push({ label: linked ? t.tr('StorageModeLink') : t.tr('Copy'), color: linked ? 'green' : 'blue' });
        if (linked && !mapping.ExcludeFromLinkCache) badges.push({ label: t.tr('HeaderLinkCache'), color: 'orange' });
        if (linked && (mapping.PermanentItems || []).length) badges.push({ label: t.tr('HeaderAlwaysKeep'), color: 'blue' });
    }
    if (mapping.FilterMode === 'Whitelist' || mapping.FilterMode === 'Blacklist') {
        badges.push({ label: t.tr(mapping.FilterMode), color: 'blue' });
    }
    var spec = {
        layout: 'row',
        shape: 'square',
        icon: LIBRARY_ICONS[type] || 'video_library',
        title: mapping.LocalLibraryName || mapping.LocalLibraryId || t.tr('LabelLocalLibrary'),
        subtitle: t.format('LabelLinksFromServer', source),
        badges: badges,
        status: null,
        detail: null,
        size: null
    };
    if (!contentOn || !count) return spec;
    count = ['Copies', 'Links', 'CachedLinks', 'Queued', 'Pending', 'Errored', 'CopyBytes'].reduce(function (all, key) {
        all[key] = count[key] || 0;
        return all;
    }, {});
    if (count.Errored > 0) spec.status = { label: t.format('CountErrored', count.Errored), color: 'red' };
    else if (count.Pending > 0) spec.status = { label: t.format('CountPending', count.Pending), color: 'purple' };
    else if (count.Queued > 0) spec.status = { label: t.format('CountQueued', count.Queued), color: 'orange' };
    var parts = [];
    if (count.Copies > 0) parts.push(shared.plural(count.Copies, 'CountCopiesOne', 'CountCopiesMany'));
    if (count.Links + count.CachedLinks > 0) parts.push(shared.plural(count.Links + count.CachedLinks, 'CountLinksOne', 'CountLinksMany'));
    if (count.CachedLinks > 0) parts.push(t.format('CountCached', count.CachedLinks));
    spec.detail = parts.length ? parts.join(', ') : t.tr('EmptyLibraryFiles');
    if (count.CopyBytes > 0) spec.size = count.CopyBytes;
    return spec;
}

// storedMappingFor
// The stored mapping an editor was opened from: the same position when it still holds the same pair of libraries,
// else the first mapping with that pair. A mapping removed meanwhile has none.
//
// Inputs
// server [object]: The server entry as stored.
// ref [object]: index, sourceLibraryId, and localLibraryId of the mapping the editor was opened from.
//
// Output
// [object]: The stored mapping, or null.
export function storedMappingFor(server, ref) {
    var list = (server && server.LibraryMappings) || [];
    var matches = function (m) { return !!m && idKey(m.SourceLibraryId) === idKey(ref.sourceLibraryId) && idKey(m.LocalLibraryId) === idKey(ref.localLibraryId); };
    if (matches(list[ref.index])) return list[ref.index];
    return list.find(matches) || null;
}

// applyMappingEdit
// Writes an editor's values into the matching stored mapping of a fresh config.
//
// Inputs
// config [object]: The fresh plugin configuration, changed in place.
// serverKey [string]: The key of the mapping's server.
// ref [object]: Where the mapping sat, as storedMappingFor takes it.
// values [object]: The fields to write.
//
// Output
// [boolean]: Whether the mapping was found and written.
export function applyMappingEdit(config, serverKey, ref, values) {
    var server = ((config && config.Servers) || []).find(function (s) { return s.Key === serverKey; });
    var target = server ? storedMappingFor(server, ref) : null;
    if (!target) return false;
    Object.keys(values).forEach(function (field) { target[field] = values[field]; });
    return true;
}

// storedPicks
// The picks of a stored list of items, by item id.
//
// Inputs
// list [object[]]: FilteredItems or PermanentItems, as stored.
//
// Output
// [object]: Each pick by its id.
export function storedPicks(list) {
    var picks = {};
    (list || []).forEach(function (pi) {
        if (pi && pi.ItemId) picks[pi.ItemId] = { ItemId: pi.ItemId, Name: pi.Name || '', Year: pi.Year || null, Path: pi.Path || '', Type: pi.Type || null };
    });
    return picks;
}

// picksToList
// The picks by id back as a stored list.
//
// Inputs
// picks [object]: Each pick by its id.
//
// Output
// [object[]]: The list to store.
export function picksToList(picks) {
    return Object.keys(picks).map(function (id) {
        var p = picks[id];
        return { ItemId: p.ItemId, Name: p.Name || '', Year: p.Year || null, Path: p.Path || '', Type: p.Type || null };
    });
}

// make
// Builds one element with a class and text.
//
// Inputs
// tag [string]: The tag name.
// className [string]: The classes, or empty.
// text [string]: The text, or nothing.
//
// Output
// [HTMLElement]: The element.
function make(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = text;
    return el;
}

// zooid_storage
// Builds the Storage page. It draws a pill for each server with library mappings, count cards and a row for each of
// the picked server's enabled mappings, an editor sidecar for one mapping, the permanent copies, and the link cache.
//
// Inputs
// view [HTMLElement]: The page the dashboard passes to the controller.
export default function (view) {
    'use strict';

    var ZooidShared = null;
    var createPaginatedTable = null;

    // Helpers called by bare name, taken from the shared bag.
    var escapeHtml, apiRequest, setVisible, getEl;

    // tr
    // Reads one of the plugin's strings in the viewer's language.
    //
    // Inputs
    // key [string]: The string's key.
    //
    // Output
    // [string]: The text.
    function tr(key) {
        return ZooidShared.t.tr(key);
    }

    // format
    // Reads one of the plugin's strings and fills its {0}, {1} placeholders.
    //
    // Inputs
    // key [string]: The string's key.
    // ...args [any]: The values for the placeholders.
    //
    // Output
    // [string]: The text.
    function format() {
        return ZooidShared.t.format.apply(null, arguments);
    }

    // Stolon runs bindPage once and loadConfig each time the page shows.
    var made = zooidModule.createZooidPage(view, { page: 'zooid_storage', bind: function () { bindPage(); }, load: function () { loadConfig(); }, onHide: function () { hidePage(); } });
    ZooidShared = made.shared;
    createPaginatedTable = zooidModule.createPaginatedTable;
    ({ escapeHtml, apiRequest, setVisible, getEl } = ZooidShared.pageHelpers());

    var contentOn = true;
    var currentConfig = null;
    var selectedKey = '';
    var counts = null;
    var countsSeq = 0;
    var picker = null;
    var pickerTabs = '';
    var serverContent = null;
    var libraryCards = [];
    var editor = null;
    var _tableSeq = 0;
    var _libraryTypes = null;
    var knownTypes = null;

    function selectedServer() {
        return storageServers(currentConfig).find(function (s) { return s.Key === selectedKey; }) || null;
    }

    // This server's libraries by id, read once per page load. A failed read leaves the default icon.
    function libraryTypes() {
        if (!_libraryTypes) {
            _libraryTypes = Promise.resolve(typeof ApiClient.getVirtualFolders === 'function' ? ApiClient.getVirtualFolders() : []).then(function (folders) {
                var types = {};
                (folders || []).forEach(function (f) {
                    if (f && f.ItemId) types[idKey(f.ItemId)] = (f.CollectionType || '').toLowerCase();
                });
                return types;
            }).catch(function () { return {}; });
        }
        return _libraryTypes;
    }

    // renderServerPicker
    // Draws one tab for each server with library mappings, named by the server, and selects the picked one. One
    // server needs no tabs.
    function renderServerPicker() {
        var list = storageServers(currentConfig);
        if (!list.some(function (s) { return s.Key === selectedKey; })) {
            selectedKey = list.length ? list[0].Key : '';
        }
        var holder = getEl('storageServerPicker');
        var tabs = list.map(function (server) { return { id: server.Key, label: ZooidShared.serverDisplayName(server) }; });
        if (holder && list.length > 1) {
            if (!picker) {
                picker = zooidModule.createSubTabs({
                    label: tr('TabServers'),
                    tabs: tabs,
                    value: selectedKey,
                    onChange: function (id) {
                        if (!id || id === selectedKey) return;
                        selectedKey = id;
                        placeServerContent(true);
                        renderSelected();
                    }
                });
                holder.appendChild(picker.element);
            } else if (JSON.stringify(tabs) !== pickerTabs) {
                // Redrawing the tabs drops their panels, so the content waits under the picker meanwhile.
                placeServerContent(false);
                picker.setItems(tabs, selectedKey);
            } else if (picker.getValue() !== selectedKey) {
                picker.setValue(selectedKey);
            }
            pickerTabs = JSON.stringify(tabs);
        }
        setVisible('storageServerPicker', list.length > 1);
        placeServerContent(list.length > 1);
        setVisible('storageNoServers', list.length === 0);
        setVisible('storageContent', list.length > 0);
    }

    // placeServerContent
    // Moves the picked server's content into its tab's panel, or back under the picker when there are no tabs.
    //
    // Inputs
    // tabbed [boolean]: Whether the tabs show.
    function placeServerContent(tabbed) {
        if (!serverContent) serverContent = getEl('storageServerContent');
        var content = serverContent;
        var holder = getEl('storageServerPicker');
        if (!content || !holder) return;
        var panel = tabbed && picker ? picker.getPanel(selectedKey) : null;
        if (panel) {
            if (content.parentNode !== panel) panel.appendChild(content);
        } else if (content.parentNode !== holder.parentNode) {
            holder.parentNode.insertBefore(content, holder.nextSibling);
        }
    }

    // renderSelected
    // Draws everything that belongs to the picked server, then asks for its counts.
    function renderSelected() {
        var server = selectedServer();
        setVisible('storageServerOff', !!server && server.IsEnabled === false);
        counts = null;
        renderLibraries();
        reloadKeptCopies();
        loadCounts();
    }

    // loadCounts
    // Reads what each library of the picked server holds. An answer for a server no longer picked is dropped.
    function loadCounts() {
        var key = selectedKey;
        var seq = ++countsSeq;
        if (!key || !contentOn) return;
        apiRequest('LibraryStorage?serverKey=' + encodeURIComponent(key), 'GET').then(function (answer) {
            if (seq !== countsSeq || key !== selectedKey) return;
            counts = Array.isArray(answer) ? answer : [];
            renderLibraries();
        }, function () { /* the rows and cards show without counts */ });
    }

    function clearLibraryCards() {
        libraryCards.forEach(function (card) { card.destroy(); });
        libraryCards = [];
        var list = getEl('storageLibraryList');
        if (list) list.textContent = '';
    }

    // renderLibraries
    // Draws the count cards and one row for each enabled library mapping of the picked server.
    function renderLibraries() {
        clearLibraryCards();
        var server = selectedServer();
        var entries = enabledMappings(server);
        var list = getEl('storageLibraryList');
        var summary = getEl('storageSummary');
        if (summary) ZooidShared.renderCards(summary, summaryCards(entries.map(function (e) { return e.mapping; }), counts, contentOn, ZooidShared.t, ZooidShared.formatSize));
        setVisible('storageNoLibraries', !!server && entries.length === 0);
        setVisible('storageLibraryList', entries.length > 0);
        if (!server || !list) return;
        // The types arrive once per page load, and the first answer redraws the icons.
        if (!knownTypes) {
            libraryTypes().then(function (types) {
                var first = !knownTypes;
                knownTypes = types;
                if (first) renderLibraries();
            });
        }
        entries.forEach(function (entry) {
            var type = (knownTypes || {})[idKey(entry.mapping.LocalLibraryId)] || '';
            var spec = libraryCard(entry.mapping, counts ? (countFor(counts, entry.mapping) || {}) : null, type, contentOn, ZooidShared.t, ZooidShared);
            spec.onClick = function () { openEditor(server.Key, entry.index); };
            var card = zooidModule.createMediaCard(spec);
            card.element.setAttribute('data-library', idKey(entry.mapping.LocalLibraryId));
            libraryCards.push(card);
            list.appendChild(card.element);
        });
    }

    // choiceGroup
    // Builds a group of radio cards, one per option, each with its name and one sentence.
    //
    // Inputs
    // name [string]: The radio group's name.
    // label [string]: The group's accessible name.
    // options [object[]]: Each as { value, name, text }.
    // value [string]: The option checked at first.
    //
    // Output
    // [HTMLElement]: The group.
    function choiceGroup(name, label, options, value) {
        var group = make('div', 'stolon-choice-group');
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', label);
        options.forEach(function (option) {
            var card = make('label', 'stolon-choice');
            var input = make('input');
            input.type = 'radio';
            input.name = name;
            input.value = option.value;
            input.setAttribute('value', option.value);
            input.checked = option.value === value;
            card.appendChild(input);
            card.appendChild(make('span', 'stolon-choice-name', option.name));
            card.appendChild(make('span', 'stolon-choice-text', option.text));
            group.appendChild(card);
        });
        return group;
    }

    // checkboxField
    // Builds a Jellyfin checkbox with its label and description. It is written as markup, so Jellyfin upgrades it.
    //
    // Inputs
    // label [string]: The checkbox label.
    // help [string]: The description under it.
    // checked [boolean]: Whether it starts on.
    //
    // Output
    // [object]: element is the container, and input the checkbox, or null where markup is not parsed.
    function checkboxField(label, help, checked) {
        var box = make('div', 'checkboxContainer checkboxContainer-withDescription');
        box.innerHTML = '<label class="emby-checkbox-label"><input type="checkbox" is="emby-checkbox"' + (checked ? ' checked' : '') + ' />' +
            '<span class="checkboxLabel">' + escapeHtml(label) + '</span></label>' +
            '<div class="fieldDescription checkboxFieldDescription">' + escapeHtml(help) + '</div>';
        return { element: box, input: box.querySelector('input') };
    }

    // selectField
    // Builds a Jellyfin select with its label and description. It is written as markup, so Jellyfin upgrades it.
    //
    // Inputs
    // label [string]: The field label.
    // help [string]: The description under it.
    // options [object[]]: Each as { value, text }.
    // value [string]: The option chosen at first.
    //
    // Output
    // [object]: element is the container, and select the select, or null where markup is not parsed.
    function selectField(label, help, options, value) {
        var box = make('div', 'selectContainer');
        var id = 'storageEditorSelect' + (++_tableSeq);
        box.innerHTML = '<label class="selectLabel" for="' + id + '">' + escapeHtml(label) + '</label>' +
            '<select is="emby-select" id="' + id + '" class="emby-select-withcolor emby-select">' +
            options.map(function (option) {
                return '<option value="' + escapeHtml(option.value) + '"' + (option.value === value ? ' selected' : '') + '>' + escapeHtml(option.text) + '</option>';
            }).join('') +
            '</select>' +
            '<div class="fieldDescription">' + escapeHtml(help) + '</div>';
        return { element: box, select: box.querySelector('select') };
    }

    // pickerTable
    // Builds a table of the source library's items, where selecting a row picks or unpicks it.
    //
    // Inputs
    // scope [HTMLElement]: The element that holds the table's container.
    // containerId [string]: The container's id.
    // serverKey [string]: The source server.
    // libraryId [string]: The source library.
    // selected [object]: The picks by id, changed in place.
    // browse [function]: Returns items, collections, or playlists.
    //
    // Output
    // [object]: The table handle.
    function pickerTable(scope, containerId, serverKey, libraryId, selected, browse) {
        var table = createPaginatedTable(scope, ZooidShared, {
            containerId: containerId,
            endpoint: 'SourceLibraryItems',
            pagination: { pageSize: 50, loadMore: true },
            search: { enabled: true },
            selection: { enabled: false, idKey: 'Id' },
            emptyState: { message: tr('EmptyItemsFound') },
            filters: { buildParams: function () { var mode = browse(); return { libraryId: libraryId, serverKey: serverKey, collections: mode === 'collections', playlists: mode === 'playlists' }; } },
            columns: [
                {
                    key: 'Id',
                    type: 'custom',
                    className: 'stolon-table-cell-with-thumb',
                    image: function (item) { return item.Id ? ZooidShared.proxyImage(item.Id, false, serverKey) : null; },
                    render: function (item) {
                        var meta = [item.Year, item.Type].filter(Boolean).join(' • ');
                        return '<div class="zooid-item-info">' +
                                '<div class="zooid-item-name">' + escapeHtml(item.Name || '') + '</div>' +
                                '<div class="zooid-item-path">' + escapeHtml(meta) + '</div>' +
                            '</div>';
                    }
                },
                {
                    key: 'picked',
                    type: 'custom',
                    className: 'zooid-pick-cell',
                    render: function (item) {
                        return '<span class="material-icons" aria-hidden="true">' + (selected[item.Id] ? 'check_box' : 'check_box_outline_blank') + '</span>';
                    }
                }
            ],
            rowClass: function (item) { return selected[item.Id] ? 'stolon-selected' : ''; },
            actions: {
                onRowClick: function (item) {
                    if (selected[item.Id]) delete selected[item.Id];
                    else selected[item.Id] = { ItemId: item.Id, Name: item.Name || '', Year: item.Year, Path: item.Path || '', Type: item.Type || null };
                    var on = !!selected[item.Id];
                    scope.querySelectorAll('#' + containerId + ' .stolon-table-row').forEach(function (rowEl) {
                        if (rowEl.getAttribute('data-id') !== String(item.Id)) return;
                        rowEl.classList.toggle('stolon-selected', on);
                        var icon = rowEl.querySelector('.zooid-pick-cell .material-icons');
                        if (icon) icon.textContent = on ? 'check_box' : 'check_box_outline_blank';
                    });
                }
            }
        });
        // A non-empty filter value makes the table send the buildParams values.
        table.setFilterValue(libraryId);
        return table;
    }

    // buildEditor
    // Builds the body of one library mapping's editor and the reader of its values.
    //
    // Inputs
    // server [object]: The mapping's server entry.
    // mapping [object]: The library mapping as loaded.
    //
    // Output
    // [object]: body is the element, read() returns the fields to save, mount() builds its tables once the body is
    //   in the page, and destroy() stops them.
    function buildEditor(server, mapping) {
        var serverKey = server.Key;
        var libraryId = mapping.SourceLibraryId || '';
        var negotiable = !!(currentConfig && currentConfig.EnableHistorySync) && modeOf(server) === 'Sync';
        var selectedFilter = storedPicks(mapping.FilteredItems);
        var selectedPermanent = storedPicks(mapping.PermanentItems);
        var filterBrowse = 'items';
        var filterTable = null;
        var permanentTable = null;
        var browsePills = null;
        var choices = null;
        var seq = ++_tableSeq;
        var body = make('div', 'zooid-storage-editor');

        var status = make('div', 'stolon-status-text stolon-hidden');
        status.setAttribute('role', 'status');
        body.appendChild(status);

        // Where the files come from and go to.
        var route = zooidModule.createDefinitionList({
            layout: 'columns',
            arrow: true,
            items: [
                { label: tr('LabelSourceLibrary'), value: mapping.SourceLibraryName || mapping.SourceLibraryId || '', meta: mapping.SourceRootPath || null },
                { label: tr('LabelLocalLibrary'), value: mapping.LocalLibraryName || mapping.LocalLibraryId || '', meta: mapping.LocalRootPath || null }
            ]
        });
        body.appendChild(route.element);

        // Storage, the link cache, and Always keep are content sync's alone.
        var linkCache = null;
        var permanentSection = make('div', 'zooid-storage-editor-group');
        var linkCacheSection = make('div', 'zooid-storage-editor-group');
        if (contentOn) {
            var storageSection = make('div', 'zooid-storage-editor-group');
            storageSection.appendChild(make('h3', 'stolon-subsection-title', tr('TabStorage')));
            var group = choiceGroup('storageMode' + seq, tr('TabStorage'), [
                { value: 'Copy', name: tr('Copy'), text: tr('HelpStorageCopy') },
                { value: 'Link', name: tr('StorageModeLink'), text: tr('HelpStorageLink') }
            ], isLink(mapping) ? 'Link' : 'Copy');
            storageSection.appendChild(group);
            body.appendChild(storageSection);
            choices = zooidModule.createChoiceGroup(group, { onChange: updateLinkSections });

            linkCacheSection.appendChild(make('h3', 'stolon-subsection-title', tr('HeaderLinkCache')));
            linkCache = checkboxField(tr('LabelCacheLibraryLinks'), tr('HelpCacheLibraryLinks'), !mapping.ExcludeFromLinkCache);
            linkCacheSection.appendChild(linkCache.element);
            body.appendChild(linkCacheSection);

            permanentSection.appendChild(make('h3', 'stolon-subsection-title', tr('HeaderAlwaysKeep')));
            permanentSection.appendChild(make('div', 'fieldDescription', tr('HelpAlwaysKeep')));
            var permanentHolder = make('div');
            permanentHolder.id = 'storagePermanentTable_' + seq;
            permanentSection.appendChild(permanentHolder);
            body.appendChild(permanentSection);
        }

        // The library filter applies to content, history, and metadata.
        var filterSection = make('div', 'zooid-storage-editor-group');
        filterSection.appendChild(make('h3', 'stolon-subsection-title', tr('HeaderLibraryFilter')));
        var filterMode = selectField(tr('LabelFilterMode'), tr('HelpFilterMode'), [
            { value: 'AllowAll', text: tr('AllowEmbeddedSubtitlesAllowAllOption') },
            { value: 'Whitelist', text: tr('Whitelist') },
            { value: 'Blacklist', text: tr('Blacklist') }
        ], mapping.FilterMode || 'AllowAll');
        filterSection.appendChild(filterMode.element);
        var filterBrowser = make('div', 'zooid-storage-editor-group');
        // Files, Collections, Playlists. Picking a collection or playlist picks its members.
        var browse = make('div', 'stolon-pill-group');
        browse.setAttribute('role', 'group');
        browse.setAttribute('aria-label', tr('HeaderLibraryFilter'));
        [['items', tr('HeaderFiles')], ['collections', tr('Collections')], ['playlists', tr('Playlists')]].forEach(function (pair) {
            var pill = make('button', 'stolon-pill', pair[1]);
            pill.type = 'button';
            pill.setAttribute('data-value', pair[0]);
            browse.appendChild(pill);
        });
        filterBrowser.appendChild(browse);
        var filterHolder = make('div');
        filterHolder.id = 'storageFilterTable_' + seq;
        filterBrowser.appendChild(filterHolder);
        filterSection.appendChild(filterBrowser);
        body.appendChild(filterSection);
        if (filterMode.select) filterMode.select.addEventListener('change', updateFilterSection);

        // Only a Sync server writes history back, so only its libraries offer negotiation, while history sync is on.
        var negotiate = null;
        if (negotiable) {
            var historySection = make('div', 'zooid-storage-editor-group');
            historySection.appendChild(make('h3', 'stolon-subsection-title', tr('SyncTypeHistory')));
            negotiate = checkboxField(tr('LabelNegotiateHistory'), tr('HelpNegotiateHistory'), !!mapping.NegotiateHistory);
            historySection.appendChild(negotiate.element);
            body.appendChild(historySection);
        }

        function filterModeValue() {
            return (filterMode.select ? filterMode.select.value : mapping.FilterMode) || 'AllowAll';
        }

        function storageMode() {
            return choices && choices.get() === 'Link' ? 'Link' : (choices ? 'Copy' : (isLink(mapping) ? 'Link' : 'Copy'));
        }

        // The cache and Always keep only apply to links, so they show for a Link library.
        function updateLinkSections() {
            var linked = contentOn && storageMode() === 'Link';
            linkCacheSection.classList.toggle('stolon-hidden', !linked);
            permanentSection.classList.toggle('stolon-hidden', !linked);
            if (linked && libraryId && createPaginatedTable && body.isConnected) {
                if (!permanentTable) permanentTable = pickerTable(body, 'storagePermanentTable_' + seq, serverKey, libraryId, selectedPermanent, function () { return 'items'; });
                permanentTable.reload();
            }
        }

        function updateFilterSection() {
            var show = filterModeValue() !== 'AllowAll';
            filterBrowser.classList.toggle('stolon-hidden', !show);
            if (show && libraryId && createPaginatedTable && body.isConnected) {
                if (!filterTable) filterTable = pickerTable(body, 'storageFilterTable_' + seq, serverKey, libraryId, selectedFilter, function () { return filterBrowse; });
                filterTable.reload();
            }
        }

        return {
            body: body,
            status: status,
            mount: function () {
                browsePills = zooidModule.createPillGroup(browse, {
                    onChange: function (value) {
                        filterBrowse = value || 'items';
                        if (filterTable) filterTable.reload();
                    }
                });
                browsePills.set('items');
                updateLinkSections();
                updateFilterSection();
            },
            read: function () {
                var values = {
                    FilterMode: filterModeValue(),
                    FilteredItems: picksToList(selectedFilter),
                    NegotiateHistory: negotiate && negotiate.input ? !!negotiate.input.checked : !!mapping.NegotiateHistory
                };
                if (contentOn) {
                    var permanent = picksToList(selectedPermanent);
                    values.StorageMode = storageMode();
                    values.ExcludeFromLinkCache = linkCache.input ? !linkCache.input.checked : !!mapping.ExcludeFromLinkCache;
                    values.PermanentItems = permanent.length ? permanent : null;
                }
                return values;
            },
            destroy: function () {
                if (filterTable && filterTable.disconnectObserver) filterTable.disconnectObserver();
                if (permanentTable && permanentTable.disconnectObserver) permanentTable.disconnectObserver();
                if (browsePills) browsePills.destroy();
                if (choices) choices.destroy();
                route.destroy();
            }
        };
    }

    // openEditor
    // Opens one library mapping in an editor sidecar. Save writes its fields to the stored mapping and redraws the rows.
    //
    // Inputs
    // serverKey [string]: The mapping's server.
    // index [number]: Where the mapping sits in that server's stored list.
    function openEditor(serverKey, index) {
        var server = storageServers(currentConfig).find(function (s) { return s.Key === serverKey; });
        var mapping = server && (server.LibraryMappings || [])[index];
        if (!mapping) return;
        if (editor) editor.handle.close();
        var built = buildEditor(server, mapping);
        var ref = { index: index, sourceLibraryId: mapping.SourceLibraryId, localLibraryId: mapping.LocalLibraryId };
        var handle = zooidModule.openEditorSidecar({
            title: mapping.LocalLibraryName || mapping.LocalLibraryId || tr('LabelLocalLibrary'),
            subtitle: format('LibraryFromServer', mapping.SourceLibraryName || mapping.SourceLibraryId || tr('LabelSourceLibrary'), ZooidShared.serverDisplayName(server)),
            body: built.body,
            page: made.page,
            className: 'zooid-storage-sidecar',
            serialize: function () { return JSON.stringify(built.read()); },
            onSave: function () {
                return saveMapping(serverKey, ref, built.read()).then(function () {
                    return true;
                }, function (err) {
                    built.status.classList.remove('stolon-hidden');
                    ZooidShared.setStatus(built.status, (err && err.message) || tr('ErrorSaveStorage'), true, { timeout: 0 });
                    return false;
                });
            },
            onClose: function () {
                built.destroy();
                if (editor && editor.handle === handle) editor = null;
            }
        });
        editor = { handle: handle, built: built };
        built.mount();
    }

    // saveMapping
    // Writes one editor's values to the stored mapping, then redraws the page from the config the server kept.
    //
    // Inputs
    // serverKey [string]: The mapping's server.
    // ref [object]: Where the mapping sat, as storedMappingFor takes it.
    // values [object]: The fields to write.
    //
    // Output
    // [Promise]: Resolves once saved, and rejects with the reason when the mapping is gone or the save failed.
    function saveMapping(serverKey, ref, values) {
        var found = true;
        return ZooidShared.saveSection(function (config) {
            found = applyMappingEdit(config, serverKey, ref, values);
        }).then(function (saved) {
            currentConfig = saved;
            renderServerPicker();
            renderSelected();
            if (!found) throw new Error(tr('ErrorMappingChanged'));
            ZooidShared.setStatus('storageStatus', tr('ToastStorageSaved'), false);
        }, function (err) {
            throw new Error(ZooidShared.errorText(err, tr('ErrorSaveStorage')));
        });
    }

    var keptTable = null;
    var keptRows = {};
    // The badge of each reason a copy is kept, with the keys of its label and its title.
    var KEPT_BADGES = {
        Pick: { label: 'HeaderAlwaysKeep', cls: 'stolon-blue', title: 'HelpKeptPick' },
        Hand: { label: 'BadgeKeptByHand', cls: 'stolon-purple', title: 'HelpKeptHand' },
        Own: { label: 'BadgeAlreadyHere', cls: 'stolon-green', title: 'HelpKeptOwn' },
        Unknown: { label: 'BadgeEarlierCopy', cls: 'stolon-gray', title: 'HelpKeptUnknown' }
    };

    function ensureKeptTable() {
        if (keptTable || !createPaginatedTable) return keptTable;
        keptTable = createPaginatedTable(view, ZooidShared, {
            containerId: 'keptCopiesTableContainer',
            endpoint: 'KeptCopies',
            pagination: { pageSize: 50 },
            search: { enabled: true, placeholder: tr('PlaceholderSearchPermanentCopies') },
            selection: {
                enabled: true,
                idKey: 'Id',
                onSelectionChange: function (ids) {
                    var btn = getEl('btnUnkeepCopies');
                    if (btn) btn.disabled = ids.length === 0;
                }
            },
            filters: { buildParams: function () { return { serverKey: selectedKey }; } },
            emptyState: { message: tr('EmptyPermanentCopies') },
            columns: [
                {
                    key: 'name',
                    label: tr('ColumnItem'),
                    type: 'custom',
                    className: 'stolon-table-cell-with-thumb',
                    image: function (item) { return ZooidShared.proxyImage(item.SourceItemId, false, item.ServerKey || selectedKey); },
                    render: function (item) {
                        keptRows[String(item.Id)] = item;
                        var path = item.LocalPath || item.SourcePath || '';
                        return '<div class="zooid-item-info">' +
                                '<div class="zooid-item-name" title="' + escapeHtml(path) + '">' + escapeHtml(ZooidShared.getFileName(path)) + '</div>' +
                                '<div class="zooid-item-path">' + escapeHtml(path) + '</div>' +
                            '</div>';
                    }
                },
                {
                    key: 'details',
                    label: tr('ColumnDetails'),
                    type: 'custom',
                    className: 'zooid-details-cell',
                    render: function (item) {
                        var badge = KEPT_BADGES[item.Kept] || KEPT_BADGES.Unknown;
                        var size = item.SourceSizeFormatted || '';
                        return '<span class="stolon-badge ' + badge.cls + '" title="' + escapeHtml(tr(badge.title)) + '">' + escapeHtml(tr(badge.label)) + '</span>' +
                            (size ? ' <span class="stolon-badge stolon-purple">' + escapeHtml(size) + '</span>' : '');
                    }
                },
                { key: 'Status', label: tr('HeaderStatus'), type: 'status' }
            ]
        });
        var bulk = keptTable.getBulkActionsContainer();
        if (bulk) {
            bulk.innerHTML = '<button is="emby-button" type="button" id="btnUnkeepCopies" class="raised stolon-button stolon-primary stolon-small zooid-kept-bulk-button" disabled>' +
                '<span class="material-icons" aria-hidden="true">link</span><span>' + escapeHtml(tr('ButtonTurnBackIntoLinks')) + '</span></button>';
            var unkeep = bulk.querySelector('#btnUnkeepCopies');
            if (unkeep) unkeep.addEventListener('click', unkeepSelected);
        }
        return keptTable;
    }

    function isNotFound(err) {
        return !!err && (err.status === 404 || (err.response && err.response.status === 404));
    }

    // Asks for one row first. A server without the kept copies endpoint answers 404, and the section
    // stays hidden. Kept copies only exist in Link libraries, so a server without one hides it too.
    function reloadKeptCopies() {
        var server = selectedServer();
        var hasLink = enabledMappings(server).some(function (e) { return isLink(e.mapping); });
        if (!server || !hasLink || !contentOn) {
            setVisible('keptCopiesSection', false);
            return;
        }
        var key = server.Key;
        apiRequest('KeptCopies?serverKey=' + encodeURIComponent(key) + '&skip=0&take=1', 'GET').then(function () {
            if (key !== selectedKey) return;
            showKeptTable(key, true);
        }, function (err) {
            if (key !== selectedKey) return;
            if (isNotFound(err)) {
                setVisible('keptCopiesSection', false);
                return;
            }
            showKeptTable(key, false);
        });
    }

    // showKeptTable
    // Shows the Permanent copies section and loads its table for one server.
    //
    // Inputs
    // key [string]: The server's key.
    // fresh [boolean]: Whether to clear the selection and the kept rows first.
    function showKeptTable(key, fresh) {
        setVisible('keptCopiesSection', true);
        var table = ensureKeptTable();
        if (!table) return;
        if (fresh) {
            keptRows = {};
            table.clearSelection();
        }
        // Leaving the page disconnected the scroll observer, so showing the table again connects it.
        table.reconnectObserver();
        table.setFilterValue(key);
        table.reload();
    }

    function unkeepSelected() {
        if (!keptTable) return;
        var selected = keptTable.getSelectedIds();
        var ids = selected.map(function (id) { return parseInt(id, 10); }).filter(function (id) { return !isNaN(id); });
        if (ids.length === 0) return;
        var btn = getEl('btnUnkeepCopies');
        if (btn) btn.disabled = true;
        apiRequest('KeptCopies/Unkeep', 'POST', { Ids: ids }).then(function (result) {
            var queued = (result && result.Queued) || 0;
            var skipped = (result && result.Skipped) || [];
            var lines = [ZooidShared.plural(queued, 'ToastCopiesUnkeptOne', 'ToastCopiesUnkeptMany')];
            if (skipped.length) {
                var picked = 0;
                var reasons = {};
                skipped.forEach(function (s) {
                    var row = keptRows[String(s.Id)];
                    if (row && row.Kept === 'Pick') picked++;
                    var reason = s.Reason || tr('StatusSkipped');
                    reasons[reason] = (reasons[reason] || 0) + 1;
                });
                lines.push(format('ToastUnkeepSkipped', skipped.length, Object.keys(reasons).map(function (reason) {
                    return format('ReasonCount', reason, reasons[reason]);
                }).join(', ')));
                if (picked > 0) {
                    lines.push(tr('HelpUnkeepPicked'));
                }
            }
            ZooidShared.setStatus('keptCopiesStatus', lines.join(' '), false, { timeout: 15000 });
        }, function (err) {
            console.error('Unkeep failed:', err);
            ZooidShared.setStatus('keptCopiesStatus', tr('ErrorUnkeepCopies'), true, { timeout: 10000 });
        }).then(function () {
            keptTable.clearSelection();
            keptRows = {};
            keptTable.reload();
        });
    }

    // The Usage Meter of the link cache, or null before the first draw.
    var usageMeter = null;

    // loadUsage
    // Draws how much of the link cache's room is used. The section shows only while the cache is on.
    function loadUsage() {
        if (!contentOn) {
            setVisible('storageUsageSection', false);
            return;
        }
        apiRequest('LinkCache', 'GET').then(function (cache) {
            var holder = getEl('storageUsageMeter');
            var inUse = !!cache && !!cache.Enabled && cache.LimitBytes > 0;
            setVisible('storageUsageSection', inUse && !!holder);
            if (!inUse || !holder) return;
            var value = { used: cache.UsedBytes || 0, total: cache.LimitBytes };
            if (usageMeter) {
                usageMeter.setValue(value);
                return;
            }
            usageMeter = zooidModule.createUsageMeter({ label: tr('HeaderLinkCache'), bytes: true, used: value.used, total: value.total });
            holder.appendChild(usageMeter.element);
        }).catch(function () {
            setVisible('storageUsageSection', false);
        });
    }

    function loadConfig() {
        ZooidShared.getConfig().then(function (config) {
            currentConfig = config;
            // The library filter applies to content, history, and metadata sync. How files are kept,
            // the cache, Always keep, and permanent copies are content sync's alone.
            var on = !!(config.EnableContentSync || config.EnableHistorySync || config.EnableMetadataSync);
            contentOn = !!config.EnableContentSync;
            setVisible('storageDisabled', !on);
            setVisible('storageFiltersOnly', on && !contentOn);
            if (!on) {
                setVisible('storageContent', false);
                setVisible('storageNoServers', false);
                clearLibraryCards();
                return;
            }
            renderServerPicker();
            renderSelected();
            loadUsage();
        }).catch(function () {
            ZooidShared.setStatus('storageStatus', tr('ErrorLoadStorage'), true, { timeout: 0 });
        });
    }

    // bindPage
    // Wires the page's controls. Stolon calls it once, the first time the page shows.
    function bindPage() {
        ZooidShared.initCollapsibles();
        var mapButton = getEl('btnStorageMapLibraries');
        if (mapButton) mapButton.addEventListener('click', function () { zooidModule.openTool(view, 'servers'); });
    }

    // hidePage
    // Stops the permanent copies table's observer when the page hides. Stolon closes an open editor.
    function hidePage() {
        if (keptTable && keptTable.disconnectObserver) keptTable.disconnectObserver();
    }
}
