using System.Collections.Generic;

namespace Jellyfin.Plugin.Zooid.Models.Statistics;

/// <summary>
/// What the Statistics page charts.
/// </summary>
public class SyncStatisticsDto
{
    /// <summary>
    /// Gets or sets the sync types that are turned on, each with its last scans. A sync type that is off is left out.
    /// </summary>
    public IReadOnlyList<SyncTypeStatisticsDto> Types { get; set; } = new List<SyncTypeStatisticsDto>();

    /// <summary>
    /// Gets or sets the link streams of the last thirty days for each server that may link to this one, or null when none may. It does not depend on any sync type being on.
    /// </summary>
    public LinkStreamsDto? LinkStreams { get; set; }

    /// <summary>
    /// Gets or sets how each server's synced files are kept here, one entry per server that has any, or null while content sync is off.
    /// </summary>
    public IReadOnlyList<FileUsageDto>? Files { get; set; }
}
