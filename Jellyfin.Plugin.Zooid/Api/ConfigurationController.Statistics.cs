using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Jellyfin.Plugin.Zooid.Configuration;
using Jellyfin.Plugin.Zooid.Models.Statistics;
using Jellyfin.Plugin.Zooid.Services.ContentSync.Tables;
using Jellyfin.Plugin.Zooid.Services.Database;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Zooid.Api;

/// <summary>
/// The route of the Statistics page.
/// </summary>
public partial class ConfigurationController
{
    /// <summary>
    /// Reads the last scans of each sync type that is turned on, and the link streams of the last thirty days for each server that may link to this one.
    /// </summary>
    /// <param name="statistics">Reads what each scan found and the link streams started each day.</param>
    /// <returns>The numbers the Statistics page charts.</returns>
    [HttpGet("Statistics")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult<SyncStatisticsDto> GetStatistics([FromServices] SyncStatisticsStore statistics)
    {
        ArgumentNullException.ThrowIfNull(statistics);
        var config = _configManager.Configuration;
        var enabled = new (string Key, bool On)[]
        {
            ("Content", config.EnableContentSync),
            ("History", config.EnableHistorySync),
            ("Metadata", config.EnableMetadataSync),
            ("People", config.EnablePeopleSync),
            ("User", config.EnableUserSync)
        };

        var result = new SyncStatisticsDto
        {
            Types = enabled
                .Where(type => type.On)
                .Select(type => new SyncTypeStatisticsDto
                {
                    Key = type.Key,
                    Runs = statistics.Runs(type.Key)
                        .Select(run => new ScanRunDto { FinishedAt = run.FinishedAt, Added = run.Added, Updated = run.Updated, Removed = run.Removed })
                        .ToList()
                })
                .ToList()
        };

        // The chart counts streams served to servers that link to this one, so it shows only while one may.
        // A server that only serves links has every sync type off and still shows it.
        var linking = config.Servers.Where(server => server.OffersLinks).ToList();
        if (linking.Count > 0)
        {
            var today = DateOnly.FromDateTime(DateTime.Now);
            var counted = statistics.LinkStreams(today);
            result.LinkStreams = new LinkStreamsDto
            {
                Days = SyncStatisticsStore.Days(today).Select(day => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)).ToList(),
                Servers = linking
                    .Select(server => new LinkStreamServerDto
                    {
                        Key = server.Key,
                        Name = server.DisplayName,
                        Streams = counted.TryGetValue(server.Key, out var streams) ? streams : new int[SyncStatisticsStore.DaysKept]
                    })
                    .ToList()
            };
        }

        // How each server's synced files are kept here, while content sync is on. The table and the link cache
        // are read from the request's services, so a caller without them gets no breakdown rather than an error.
        var services = HttpContext?.RequestServices;
        if (config.EnableContentSync && services?.GetService(typeof(ContentSyncTableManager)) is ContentSyncTableManager manager)
        {
            var cache = services.GetService(typeof(Services.Links.LinkCache)) as Services.Links.LinkCache;
            var cachedIds = cache?.List().Select(entry => entry.LinkId).ToList() ?? new List<string>();
            var counts = manager.CountSyncedStorage(cachedIds);
            result.Files = counts
                .Select(pair =>
                {
                    var server = config.FindServer(pair.Key);
                    return new FileUsageDto
                    {
                        ServerKey = pair.Key,
                        Name = server?.DisplayName ?? pair.Key,
                        Copies = pair.Value.Copies,
                        Links = pair.Value.Links,
                        CachedLinks = pair.Value.CachedLinks
                    };
                })
                .OrderBy(file => file.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToList();
        }

        return Ok(result);
    }
}
