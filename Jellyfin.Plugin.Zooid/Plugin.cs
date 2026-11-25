using System;
using System.Collections.Generic;
using System.IO;
using Jellyfin.Plugin.Zooid.Configuration;
using Jellyfin.Plugin.Zooid.Models.Configuration;
using Jellyfin.Plugin.Zooid.Services.ContentSync.Downloads;
using Jellyfin.Plugin.Zooid.Services.Database;
using Jellyfin.Plugin.Zooid.Services.HistorySync;
using Siphonophore.Stolon;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Zooid;

/// <summary>
/// The Zooid plugin. It is sealed because its constructor calls the virtual <c>SaveConfiguration</c>.
/// </summary>
public sealed class Plugin : PluginBase<Plugin, PluginConfiguration>
{
    /// <summary>
    /// The name the secret key folder, application name, and purpose derive from. Changing it makes every stored API Key unreadable.
    /// </summary>
    public const string SecretsName = "Jellyfin.Plugin.Zooid";

    private readonly ILogger<Plugin> _logger;
    /// <summary>Protects API Keys with the same key ring as the protector registered for injection.</summary>
    private readonly Lazy<SecretProtector> _secrets;

    /// <summary>
    /// Initializes a new instance of the <see cref="Plugin"/> class.
    /// </summary>
    /// <param name="applicationPaths">Gives the data and cache paths.</param>
    /// <param name="xmlSerializer">Reads and writes the settings file.</param>
    /// <param name="logger">Writes log entries.</param>
    public Plugin(
        IApplicationPaths applicationPaths,
        IXmlSerializer xmlSerializer,
        ILogger<Plugin> logger)
        : base(applicationPaths, xmlSerializer)
    {
        _logger = logger;

        _secrets = new Lazy<SecretProtector>(() => StableSecretProtection.CreateProtector(applicationPaths, SecretsName, logger));

        HistorySyncMergeService.EnabledFields = () => Configuration.GetHistoryFields();

        DiskSpaceService.Logger = logger;

        try
        {
            // A key saved while Data Protection was down is plaintext until protected here.
            var encrypted = false;
            foreach (var server in Configuration.Servers ?? new System.Collections.Generic.List<Models.Configuration.SourceServer>())
            {
                if (string.IsNullOrEmpty(server.ApiKey) || SecretProtector.IsProtected(server.ApiKey))
                {
                    continue;
                }

                var protectedKey = _secrets.Value.Protect(server.ApiKey);
                if (!string.Equals(protectedKey, server.ApiKey, StringComparison.Ordinal))
                {
                    server.ApiKey = protectedKey;
                    encrypted = true;
                }
            }

            if (encrypted)
            {
                lock (Services.Configuration.ConfigurationSaveLock.Sync)
                {
                    SaveConfiguration();
                }
            }
        }
        // No failure here may keep the plugin from loading.
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to prepare the stored server list at startup. It will be fixed on the next save");
        }

        _logger.LogInformation("Zooid plugin initialized");
    }

    /// <summary>
    /// Sanitizes the settings and protects each API Key on every save from the settings page, which reaches no other server side check.
    /// A key the page posts as kept resolves to the stored secret.
    /// </summary>
    /// <param name="incoming">The settings being saved.</param>
    /// <param name="stored">The settings already stored.</param>
    protected override void OnConfigurationSaving(PluginConfiguration incoming, PluginConfiguration stored)
    {
        ArgumentNullException.ThrowIfNull(incoming);
        ArgumentNullException.ThrowIfNull(stored);
        incoming.SanitizeValues();

        var before = LinkCacheRoot(stored);

        // A cache turned off or moved leaves its folder, which is emptied.
        if (stored.LinkCacheOn && (!incoming.LinkCacheOn || !string.Equals(before, LinkCacheRoot(incoming), StringComparison.Ordinal)))
        {
            try
            {
                Services.Links.LinkCache.WipeFolder(before);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _logger.LogWarning(ex, "Could not empty the link cache at {Root}", FormatUtilities.SanitizeForLog(before));
            }
        }

        foreach (var server in incoming.Servers)
        {
            // A key posted in protected form is the stored key, kept like the sentinel.
            var incomingKey = SecretProtector.IsProtected(server.ApiKey) ? SecretProtector.KeptSentinel : server.ApiKey;
            server.ApiKey = _secrets.Value.ResolveIncoming(incomingKey, KeptApiKeyFor(server, stored));
        }
    }

    /// <summary>
    /// Finds the stored API Key an incoming entry may keep, which is the same entry's key while its Server URL is unchanged.
    /// An edited address would hand the old server's key to whatever the address names, so the key is dropped.
    /// </summary>
    /// <param name="incoming">The entry being saved.</param>
    /// <param name="stored">The stored settings, which hold the protected keys.</param>
    /// <returns>The stored key in protected form, or empty when there is none to keep.</returns>
    public static string KeptApiKeyFor(SourceServer incoming, PluginConfiguration stored)
    {
        ArgumentNullException.ThrowIfNull(incoming);
        ArgumentNullException.ThrowIfNull(stored);
        var storedServer = stored.FindServer(incoming.Key);
        if (storedServer is null || !Utilities.ConfigurationUtilities.SameServerUrl(storedServer.Url, incoming.Url))
        {
            return string.Empty;
        }

        return storedServer.ApiKey ?? string.Empty;
    }

    /// <summary>
    /// Saves from the settings page under the plugin's save lock, so the write cannot interleave with a task recording a run failure.
    /// </summary>
    /// <param name="configuration">The settings that were saved.</param>
    public override void UpdateConfiguration(BasePluginConfiguration configuration)
    {
        lock (Services.Configuration.ConfigurationSaveLock.Sync)
        {
            base.UpdateConfiguration(configuration);
        }
    }

    /// <summary>Resolves the folder the link cache uses under the given settings.</summary>
    private string LinkCacheRoot(PluginConfiguration config)
        => Services.Links.LinkCache.RootFor(config.LinkCachePath, Path.Combine(ApplicationPaths.CachePath, Services.Links.LinkCache.DefaultFolder));

    /// <summary>
    /// Empties the link cache when the plugin is uninstalled, removing only the cache's own files.
    /// </summary>
    public override void OnUninstalling()
    {
        foreach (var root in new[] { Path.Combine(ApplicationPaths.CachePath, Services.Links.LinkCache.DefaultFolder), LinkCacheRoot(Configuration) })
        {
            try
            {
                Services.Links.LinkCache.WipeFolder(root);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                _logger.LogWarning(ex, "Could not empty the link cache at {Root} while uninstalling", FormatUtilities.SanitizeForLog(root));
            }
        }

        base.OnUninstalling();
    }

    /// <inheritdoc />
    public override string Name => "Zooid";

    /// <inheritdoc />
    public override Guid Id => Guid.Parse("d25d4326-c40f-450a-95d1-377254a318ac");

    /// <inheritdoc />
    public override string Description => "Sync media, watch history, metadata, people, user settings, and playlists between Jellyfin servers.";

    /// <inheritdoc />
    public override IEnumerable<PluginPageInfo> GetPages()
    {
        var ns = typeof(Plugin).Namespace;

        // The one page the menu opens. It holds every tool below in a sidebar and swaps them in place.
        yield return new PluginPageInfo
        {
            Name = "zooid",
            EmbeddedResourcePath = $"{ns}.Web.zooid.html",
            MenuSection = "server",
            DisplayName = "Zooid",
            EnableInMainMenu = true,
            MenuIcon = "sync"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_dashboard",
            EmbeddedResourcePath = $"{ns}.Web.zooid_dashboard.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_dashboard.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_dashboard.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_troubleshooting",
            EmbeddedResourcePath = $"{ns}.Web.zooid_troubleshooting.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_troubleshooting.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_troubleshooting.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_queue",
            EmbeddedResourcePath = $"{ns}.Web.zooid_queue.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_queue.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_queue.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_table.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_table.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_content.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_content.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_history.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_history.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_metadata.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_metadata.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_users.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_users.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_people.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_people.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_sync_queue.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_sync_queue.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_servers",
            EmbeddedResourcePath = $"{ns}.Web.zooid_servers.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_servers.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_servers.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_storage",
            EmbeddedResourcePath = $"{ns}.Web.zooid_storage.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_storage.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_storage.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_statistics",
            EmbeddedResourcePath = $"{ns}.Web.zooid_statistics.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_statistics.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_statistics.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_settings",
            EmbeddedResourcePath = $"{ns}.Web.zooid_settings.html"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_settings.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_settings.js"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_shared.css",
            EmbeddedResourcePath = $"{ns}.Web.zooid_shared.css"
        };

        yield return new PluginPageInfo
        {
            Name = "zooid_shared.js",
            EmbeddedResourcePath = $"{ns}.Web.zooid_shared.js"
        };

        foreach (var page in GetSharedPages("zooid"))
        {
            yield return page;
        }
    }
}
