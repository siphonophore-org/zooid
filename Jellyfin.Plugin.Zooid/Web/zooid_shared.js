// zooid_shared.js
// Wraps the Stolon shared bundle for the Zooid pages. It re-exports Stolon's table and dialog builders
// and adds createZooidShared(view), the helper bag with the Zooid helpers the pages use.
//
// Every page loads the plugin's strings once from TRANSLATIONS_URL. The bag's t is the handle, and a page's
// bind and load run once it has them, so script text and the marked markup are in the viewer's language.
//
// Zooid is one page, zooid, whose sidebar lists every tool, and each tool is its own registered page that the
// tool app swaps in place. Each sync type has its own tool, listed while that type is on. The sidebar is built
// before any config is read, so the last known answer for each tool that can be hidden is kept per browser under
// TOOL_FLAG_KEYS. A missing answer lists the tool. The app reads the config once it is built and again each time
// a tool shows, and the sidebar is read again whenever an answer changes.

// The specifier is relative so it resolves against this module's own URL, and a server hosted under
// a base URL still loads the bundle.
import {
    createShared as baseCreateShared,
    createPaginatedTable,
    createSortableCardList,
    createChoiceGroup,
    createCheckboxList,
    createPieChart,
    createBarChart,
    createLineChart,
    createUsageMeter,
    createRepeater,
    createSaveBar,
    generateGuid,
    bindSidecar,
    confirmDialog,
    createDialogItem,
    createConfigPage,
    createToolApp,
    setToolTitle,
    refreshTools,
    openTool,
    createStatusCardGrid,
    createTimeRangeField,
    toHours,
    fromHours,
    loadTranslations,
    createTranslations,
    SECRET_KEPT
} from './configurationpage?name=zooid_stolon.js';

// Re-exports
// The Stolon builders and the kept secret sentinel, so a page takes everything from this one module.
export { createPaginatedTable, createSortableCardList, createChoiceGroup, createCheckboxList, createPieChart, createBarChart, createLineChart, createUsageMeter, createRepeater, generateGuid, bindSidecar, confirmDialog, createDialogItem, openTool, createStatusCardGrid, createTimeRangeField, toHours, fromHours, SECRET_KEPT };

var PLUGIN_ID = 'd25d4326-c40f-450a-95d1-377254a318ac';

// TRANSLATIONS_URL
// The route that gives the pages their strings in the viewer's language.
export var TRANSLATIONS_URL = 'Sync/Translations';

// The strings once a page has loaded them, so the sidebar names follow the viewer's language.
var tabStrings = null;

// TOOL_FLAG_KEYS
// The browser storage keys that hold whether a tool that can be hidden shows, by tool. Each sync type's tool shows
// while that type is on, Storage while content, history, or metadata sync is on, and Statistics while any sync type
// is on or a server may link here. The sidebar is built before any config is read, so the last answer is kept.
export var TOOL_FLAG_KEYS = {
    content: 'zooid.contentTab',
    history: 'zooid.historyTab',
    metadata: 'zooid.metadataTab',
    people: 'zooid.peopleTab',
    users: 'zooid.usersTab',
    storage: 'zooid.storageTab',
    statistics: 'zooid.statisticsTab'
};

// STORAGE_TAB_KEY
// The browser storage key that holds whether the Storage page shows.
export var STORAGE_TAB_KEY = TOOL_FLAG_KEYS.storage;

// readToolFlag
// Reads the stored answer for whether a tool shows.
//
// Inputs
// tool [string]: The tool's key in TOOL_FLAG_KEYS.
//
// Output
// [string]: '1' or '0', or null when nothing is stored or storage is blocked.
function readToolFlag(tool) {
    try {
        return window.localStorage.getItem(TOOL_FLAG_KEYS[tool]);
    } catch (e) {
        return null;
    }
}

// writeToolFlag
// Stores whether a tool shows. A blocked storage leaves the tool at its default of shown.
//
// Inputs
// tool [string]: The tool's key in TOOL_FLAG_KEYS.
// value [string]: '1' to show the tool or '0' to hide it.
function writeToolFlag(tool, value) {
    try {
        window.localStorage.setItem(TOOL_FLAG_KEYS[tool], value);
    } catch (e) {
        // Storage blocked: the tool keeps its default of shown.
    }
}

// toolFlags
// Works out which tools that can be hidden show for a config.
//
// Inputs
// config [object]: The plugin configuration.
//
// Output
// [object]: '1' or '0' for each tool in TOOL_FLAG_KEYS.
export function toolFlags(config) {
    var flag = function (on) { return on ? '1' : '0'; };
    var anyType = !!(config.EnableContentSync || config.EnableHistorySync || config.EnableMetadataSync || config.EnablePeopleSync || config.EnableUserSync);
    var linking = (config.Servers || []).some(function (server) { return server && server.OffersLinks; });
    return {
        content: flag(config.EnableContentSync),
        history: flag(config.EnableHistorySync),
        metadata: flag(config.EnableMetadataSync),
        people: flag(config.EnablePeopleSync),
        users: flag(config.EnableUserSync),
        storage: flag(config.EnableContentSync || config.EnableHistorySync || config.EnableMetadataSync),
        statistics: flag(anyType || linking)
    };
}

// rememberToolFlags
// Records which tools that can be hidden show for a config.
//
// Inputs
// config [object]: The plugin configuration. Anything without EnableContentSync is ignored.
//
// Output
// [boolean]: Whether what the sidebar shows changed.
export function rememberToolFlags(config) {
    if (!config || typeof config !== 'object' || !('EnableContentSync' in config)) return false;
    var flags = toolFlags(config);
    var changed = false;
    Object.keys(flags).forEach(function (tool) {
        var before = readToolFlag(tool);
        if (before === flags[tool]) return;
        writeToolFlag(tool, flags[tool]);
        // A missing flag already showed the tool, so only a change of what shows reads the sidebar again.
        if ((before !== '0') !== (flags[tool] === '1')) changed = true;
    });
    return changed;
}

// followToolsOff
// Reads the config again and reads the sidebar again when a tool joins or leaves it, so a sync type turned on or
// off elsewhere, such as from another browser, shows without a reload.
//
// Inputs
// view [HTMLElement]: Any element inside the tool app.
function followToolsOff(view) {
    if (typeof ApiClient === 'undefined' || !ApiClient.getPluginConfiguration) return;
    ApiClient.getPluginConfiguration(PLUGIN_ID).then(function (config) {
        if (rememberToolFlags(config)) refreshTools(view);
    }, function () { /* the sidebar stays as it is */ });
}

// tabName
// Names a sidebar entry in the viewer's language, or in English until the strings have loaded.
//
// Inputs
// key [string]: The key of the entry's name.
// english [string]: The name to show before the strings load.
//
// Output
// [string]: The entry's name.
function tabName(key, english) {
    return tabStrings ? tabStrings.tr(key, english) : english;
}

// zooidTools
// Lists Zooid's tools in the order the sidebar shows them, the dashboard first. A tool in TOOL_FLAG_KEYS is left
// out while the last config read said it has nothing to show.
//
// Output
// [object[]]: Each tool's key, name, icon, and the registered page it shows.
export function zooidTools() {
    var tools = [
        { key: 'dashboard', name: tabName('TabDashboard', 'Dashboard'), icon: 'dashboard', page: 'zooid_dashboard' },
        { key: 'queue', name: tabName('ButtonQueue', 'Queue'), icon: 'swap_horiz', page: 'zooid_queue' },
        { key: 'content', name: tabName('SyncTypeContent', 'Content'), icon: 'video_library', page: 'zooid_content' },
        { key: 'history', name: tabName('SyncTypeHistory', 'History'), icon: 'history', page: 'zooid_history' },
        { key: 'metadata', name: tabName('LabelMetadata', 'Metadata'), icon: 'info', page: 'zooid_metadata' },
        { key: 'people', name: tabName('People', 'People'), icon: 'recent_actors', page: 'zooid_people' },
        { key: 'users', name: tabName('HeaderUsers', 'Users'), icon: 'group', page: 'zooid_users' },
        { key: 'storage', name: tabName('TabStorage', 'Storage'), icon: 'storage', page: 'zooid_storage' },
        { key: 'servers', name: tabName('TabServers', 'Servers'), icon: 'dns', page: 'zooid_servers' },
        { key: 'statistics', name: tabName('TabStatistics', 'Statistics'), icon: 'insights', page: 'zooid_statistics' }
    ].filter(function (tool) { return !TOOL_FLAG_KEYS[tool.key] || readToolFlag(tool.key) !== '0'; });
    tools.push({ key: 'settings', name: tabName('Settings', 'Settings'), icon: 'settings', page: 'zooid_settings' });
    tools.push({ key: 'troubleshooting', name: tabName('HeaderTroubleshooting', 'Troubleshooting'), icon: 'bug_report', page: 'zooid_troubleshooting' });
    return tools;
}

// createZooidApp
// Builds the Zooid page: Stolon's tool app with every Zooid tool, which swaps each tool in place. The app is built
// at once, so it catches the page's first show. The sidebar names turn to the viewer's language once the strings
// arrive, and the tools that are off leave it once the config is read.
//
// Inputs
// view [HTMLElement]: The host page the dashboard passes to the controller.
//
// Output
// [object]: The tool app's handle.
export function createZooidApp(view) {
    var app = createToolApp(view, { storageKey: 'zooid', name: 'Zooid', tools: zooidTools });
    followToolsOff(app.shell.content);
    loadTranslations(TRANSLATIONS_URL).then(function (t) {
        tabStrings = t;
        app.refreshTools();
    }, function () { /* the English names stay */ });
    return app;
}

// createZooidPage
// Wires a Zooid tool's page through Stolon's page lifecycle, with the Zooid helper bag. The page's bind and load
// wait for the strings, and the marked markup is translated before bind runs.
//
// Inputs
// view [HTMLElement]: The tool's view, which the tool app passes to the controller.
// opts [object]: page is the tool's own page name. bind, load, and onHide are Stolon's, and each is given the
//   Zooid bag and the page handle.
//
// Output
// [object]: shared is the Zooid helper bag, and page is Stolon's page handle with addCleanup and createPoller.
export function createZooidPage(view, opts) {
    var bag = null;
    var pass = function (fn) { return fn ? function (shared, page) { fn(bag, page); } : undefined; };
    var bound = null;
    var page = createConfigPage(view, {
        pluginId: PLUGIN_ID,
        apiPrefix: 'Sync',
        bind: function () {
            bound = bag.translations.then(function (t) {
                t.apply(view);
                if (opts.bind) opts.bind(bag, page);
            });
        },
        load: function () {
            bound.then(function () { if (opts.load) opts.load(bag, page); });
            followToolsOff(view);
        },
        onHide: pass(opts.onHide)
    });
    bag = createZooidShared(view, page.shared);
    // A config load or save that turns a sync type on or off adds or drops its tools from the sidebar.
    bag.onTabsChanged = function () { refreshTools(view); };
    // Sets the heading over the tool, which is the tool's name by default.
    bag.setPageTitle = function (text) { setToolTitle(view, text); };
    return { shared: bag, page: page };
}

// createSaveBars
// Ends sections with Stolon's Save Bar and asks before the page is left while one has unsaved changes.
// A field changed inside a section marks its bar unsaved, and a save that lands clears it.
//
// Inputs
// page [object]: Stolon's page handle, from createZooidPage.
//
// Output
// [object]: add(content, opts) appends a Save Bar to content and returns the bar. opts holds savedText,
//   failedText, and onSave, which returns the save's promise. A promise that resolves with text shows that
//   text as the saved line. markDirty(bar) marks a bar unsaved from code. clean() clears every bar, for
//   after the page loads its values.
export function createSaveBars(page) {
    var entries = [];

    function entryOf(bar) {
        return entries.find(function (entry) { return entry.bar === bar; }) || null;
    }

    function markDirty(bar) {
        var entry = entryOf(bar);
        if (!entry) return;
        entry.dirty = true;
        bar.setDirty(true);
    }

    page.guardUnsaved(function () { return entries.some(function (entry) { return entry.dirty; }); });

    return {
        add: function (content, opts) {
            if (!content) return null;
            var bar = createSaveBar({
                fill: true,
                savedText: opts.savedText,
                failedText: opts.failedText,
                onSave: function () {
                    return Promise.resolve().then(opts.onSave).then(function (savedLine) {
                        var entry = entryOf(bar);
                        if (entry) entry.dirty = false;
                        // The bar shows its own saved line once this resolves, so a line of the save's own follows it.
                        if (typeof savedLine === 'string' && savedLine) setTimeout(function () { bar.setState('saved', savedLine); }, 0);
                    });
                }
            });
            entries.push({ bar: bar, dirty: false });
            content.appendChild(bar.element);
            // A table's search and filters only change what it shows, so they leave the section saved.
            var mark = function (e) {
                if (bar.element.contains(e.target) || (e.target.closest && e.target.closest('.stolon-table-controls'))) return;
                markDirty(bar);
            };
            content.addEventListener('input', mark);
            content.addEventListener('change', mark);
            return bar;
        },
        markDirty: markDirty,
        clean: function () {
            entries.forEach(function (entry) {
                entry.dirty = false;
                entry.bar.setDirty(false);
            });
        }
    };
}

// createZooidShared
// Builds the helper bag a Zooid page uses. It is Stolon's bag for the Sync route, plus the config
// readers, the thumbnail renderers, the save helpers, and the health banner. Loading it also checks the
// plugin's health and shows its banner when the plugin cannot run.
//
// Inputs
// view [HTMLElement]: The page the helpers work in.
// bag [object]: Stolon's bag to add the helpers to, such as a page handle's. A new one is built when left out.
//
// Output
// [object]: The helper bag, with every Stolon helper and the Zooid helpers below.
export function createZooidShared(view, bag) {
    var shared = bag || baseCreateShared(view, PLUGIN_ID, 'Sync');

    shared.SECRET_KEPT = SECRET_KEPT;

    // The plugin's strings. t has none until translations resolves, which every page waits for.
    shared.t = createTranslations({});
    shared.translations = loadTranslations(TRANSLATIONS_URL).then(function (t) {
        shared.t = t;
        tabStrings = t;
        return t;
    });

    // Set by a page to read the sidebar again when a tool appears or disappears.
    shared.onTabsChanged = null;

    // rememberTools
    // Records which tools that can be hidden show, and tells the page when that changed the sidebar.
    //
    // Inputs
    // config [object]: The plugin configuration. Anything without EnableContentSync is ignored.
    shared.rememberTools = function (config) {
        if (rememberToolFlags(config) && typeof shared.onTabsChanged === 'function') shared.onTabsChanged();
    };

    var baseGetConfig = shared.getConfig;
    var baseSaveConfig = shared.saveConfig;

    // getConfig
    // Reads the plugin configuration and remembers which tools show.
    //
    // Output
    // [Promise]: Resolves with the configuration.
    shared.getConfig = function () {
        return baseGetConfig.apply(shared, arguments).then(function (config) {
            shared.rememberTools(config);
            return config;
        });
    };

    // saveConfig
    // Saves the plugin configuration and remembers which tools show.
    //
    // Inputs
    // config [object]: The configuration to save.
    //
    // Output
    // [Promise]: Resolves when the save landed.
    shared.saveConfig = function (config) {
        return baseSaveConfig.apply(shared, arguments).then(function (result) {
            shared.rememberTools(config);
            return result;
        });
    };

    // This server's name, filled by fetchLocalServerName.
    shared.localServerName = null;

    // Source images go through the plugin's ImageProxy endpoint so the source API key never reaches the
    // browser. The image bytes are fetched with ApiClient, which keeps the session token in the
    // Authorization header and out of the URL, and attached as an object URL once the row is in the DOM.
    var thumbSeq = 0;

    // scheduleProxyImage
    // Loads a source image through the proxy into an image element that is already in the DOM, or soon
    // will be. When the load fails, the image hides and the placeholder after it shows.
    //
    // Inputs
    // imgId [string]: The id of the image element.
    // id [string]: The item, person, or user to show.
    // isUser [boolean]: Whether id is a user.
    // maxHeight [number]: The tallest image to ask for, in pixels. Defaults to 80.
    // serverKey [string]: The configured server that holds it. A row with none belongs to the first scan server.
    shared.scheduleProxyImage = function (imgId, id, isUser, maxHeight, serverKey) {
        var attempts = 0;
        function tryLoad() {
            var img = document.getElementById(imgId);
            if (!img) {
                // The caller inserts the rendered HTML in the same tick. Up to three deferred
                // retries, each waiting a little longer, cover slower table renderers.
                if (++attempts <= 3) setTimeout(tryLoad, 100 * attempts);
                return;
            }
            var params = {
                itemId: id,
                user: isUser ? 'true' : 'false',
                maxHeight: maxHeight || 80
            };
            if (serverKey) params.serverKey = serverKey;
            var url = ApiClient.getUrl('Sync/ImageProxy', params);
            ApiClient.fetch({ url: url, type: 'GET' }).then(function (response) {
                if (!response || !response.ok) throw new Error('image fetch failed');
                return response.blob();
            }).then(function (blob) {
                var objectUrl = URL.createObjectURL(blob);
                img.addEventListener('load', function () { URL.revokeObjectURL(objectUrl); }, { once: true });
                img.src = objectUrl;
            }).catch(function () {
                img.classList.add('stolon-hidden');
                if (img.nextElementSibling) img.nextElementSibling.classList.remove('stolon-hidden');
            });
        }
        setTimeout(tryLoad, 0);
    };

    // proxyImage
    // Gives a table column the loader for a thumbnail that is read through this server's image proxy.
    //
    // Inputs
    // id [string]: The item, person, or user to show.
    // isUser [boolean]: Whether id is a user.
    // serverKey [string]: The configured server that holds it.
    //
    // Output
    // [function]: A loader that resolves to the image, or null when there is no id.
    shared.proxyImage = function (id, isUser, serverKey) {
        if (!id) return null;
        return function () {
            var params = { itemId: id, user: isUser ? 'true' : 'false', maxHeight: 80 };
            if (serverKey) params.serverKey = serverKey;
            return ApiClient.fetch({ url: ApiClient.getUrl('Sync/ImageProxy', params), type: 'GET' }).then(function (response) {
                if (!response || !response.ok) throw new Error('image fetch failed');
                return response.blob();
            });
        };
    };

    // scanServers
    // Lists the configured servers that scan, in rank order. A server scans when it is on, has a Server
    // URL and API Key, and pulls. A server with no Mode is a Pull server, matching the server side default.
    // The mode arrives as the enum name or, from older writers, as its number, so both spellings count.
    //
    // Inputs
    // config [object]: The plugin configuration.
    //
    // Output
    // [object[]]: The servers that scan.
    shared.scanServers = function (config) {
        return ((config && config.Servers) || []).filter(function (s) {
            if (!s || s.IsEnabled === false || !s.Url || !s.ApiKey) return false;
            var mode = s.Mode === undefined || s.Mode === null || s.Mode === '' ? 'Pull' : s.Mode;
            return mode === 'Pull' || mode === 'Sync' || mode === 0 || mode === 2;
        });
    };

    // allLibraryMappings
    // Gathers the library mappings of every server that scans.
    //
    // Inputs
    // config [object]: The plugin configuration.
    //
    // Output
    // [object[]]: The mappings, in server rank order.
    shared.allLibraryMappings = function (config) {
        var out = [];
        shared.scanServers(config).forEach(function (s) { out = out.concat(s.LibraryMappings || []); });
        return out;
    };

    // allUserMappings
    // Gathers the user mappings of every server that scans.
    //
    // Inputs
    // config [object]: The plugin configuration.
    //
    // Output
    // [object[]]: The mappings, in server rank order.
    shared.allUserMappings = function (config) {
        var out = [];
        shared.scanServers(config).forEach(function (s) { out = out.concat(s.UserMappings || []); });
        return out;
    };

    // serverFor
    // Finds the configured server a row came from. A row with no key, or a key that no server holds,
    // belongs to the first scan server.
    //
    // Inputs
    // config [object]: The plugin configuration.
    // serverKey [string]: The key the row carries.
    //
    // Output
    // [object]: The server, or null when none scans.
    shared.serverFor = function (config, serverKey) {
        var servers = (config && config.Servers) || [];
        if (serverKey) {
            var match = servers.find(function (s) { return s.Key === serverKey; });
            if (match) return match;
        }
        return shared.scanServers(config)[0] || null;
    };

    // serverDisplayName
    // Names a server for a table or a message: its name, else the name it reported, else its Server URL.
    //
    // Inputs
    // server [object]: The configured server.
    //
    // Output
    // [string]: The name, or the word for Source when there is none.
    shared.serverDisplayName = function (server) {
        if (!server) return shared.t.tr('LabelSource');
        return server.Name || server.ServerName || server.Url || shared.t.tr('LabelSource');
    };

    // serverNameFor
    // Names the server a row came from.
    //
    // Inputs
    // config [object]: The plugin configuration.
    // serverKey [string]: The key the row carries.
    //
    // Output
    // [string]: The server's display name.
    shared.serverNameFor = function (config, serverKey) {
        return shared.serverDisplayName(shared.serverFor(config, serverKey));
    };

    // requestFor
    // Builds the body of a request that names one configured server, for the endpoints that talk to it.
    // The server resolves a kept key sentinel against the stored entry with the same key.
    //
    // Inputs
    // server [object]: The configured server.
    // apiKeyOverride [string]: An API Key to send in place of the server's own.
    //
    // Output
    // [object]: The request body.
    shared.requestFor = function (server, apiKeyOverride) {
        return {
            ServerUrl: server.Url,
            ApiKey: apiKeyOverride || (server.ApiKey ? server.ApiKey : ''),
            ServerKey: server.Key,
            AllowPrivateNetwork: server.AllowPrivateNetwork !== false,
            AuthenticatedUserId: server.AuthenticatedUserId || null
        };
    };

    // saveSection
    // Saves one section of the config through Stolon's saveConfigWith. It reads the config again, applies only
    // that section's fields, and saves, since posting a page load snapshot whole would overwrite what other
    // writers changed since, such as the timestamps and failure records the tasks write, or the other
    // dashboard pages' sections.
    //
    // Inputs
    // mutator [function]: Called with the fresh config, and changes it in place.
    //
    // Output
    // [Promise]: Resolves with the saved config, and rejects when the save failed, so a Save Bar shows the
    // result. The caller keeps its own copy of the config and updates it only from a save the server kept.
    shared.saveSection = function (mutator) {
        var pending = null;
        return shared.saveConfigWith(function (config) {
            mutator(config);
            pending = config;
        }).then(function () { return pending; });
    };

    // pageHelpers
    // Binds the helpers the Servers, Settings, and Storage pages call by bare name to this bag, so a page
    // takes the ones it uses in one destructuring assignment once the module has loaded.
    //
    // Output
    // [object]: The bound helpers.
    shared.pageHelpers = function () {
        return {
            escapeHtml: shared.escapeHtml.bind(shared),
            apiRequest: shared.apiRequest.bind(shared),
            setVisible: shared.setVisible.bind(shared),
            bindClick: shared.bindClick.bind(shared),
            getEl: shared.getEl.bind(shared),
            setChecked: shared.setChecked.bind(shared),
            getChecked: shared.getChecked.bind(shared),
            setValue: shared.setValue.bind(shared),
            getValue: shared.getValue.bind(shared),
            getIntValue: shared.getIntValue.bind(shared),
            requestFor: shared.requestFor
        };
    };

    // plural
    // Writes a text with a count in the right form, such as "1 item ignored." or "3 items ignored.".
    //
    // Inputs
    // count [number]: How many there are, filled in as {0}.
    // one [string]: The key of the text for exactly one.
    // many [string]: The key of the text for any other count.
    // ...args [any]: More values, filled in as {1}, {2}.
    //
    // Output
    // [string]: The text in the viewer's language.
    shared.plural = function (count, one, many) {
        var args = Array.prototype.slice.call(arguments, 3);
        return shared.t.format.apply(null, [count === 1 ? one : many, count].concat(args));
    };

    // syncStatus
    // Reports a result on the status line of a sync type tool or the Queue tool.
    //
    // Inputs
    // message [string]: What happened, as one sentence.
    // isError [boolean]: Whether it went wrong.
    shared.syncStatus = function (message, isError) {
        shared.setStatus('syncStatus', message, !!isError, { timeout: 10000 });
    };

    // fetchLocalServerName
    // Reads this server's name, once, and keeps it in localServerName.
    //
    // Output
    // [Promise]: Resolves with the name, or the word for Local when it could not be read.
    shared.fetchLocalServerName = function () {
        return ApiClient.getPublicSystemInfo().then(function (info) {
            shared.localServerName = info.ServerName || shared.t.tr('ServerLocal');
            return shared.localServerName;
        }).catch(function () {
            shared.localServerName = shared.t.tr('ServerLocal');
            return shared.localServerName;
        });
    };


    return shared;
}
