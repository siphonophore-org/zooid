using System;
using Jellyfin.Plugin.Zooid.Models.Common;

namespace Jellyfin.Plugin.Zooid.Models.MetadataSync;

/// <summary>
/// Response model for metadata sync status.
/// </summary>
public class MetadataSyncStatusResponse : BaseSyncStatusResponse
{
    /// <summary>
    /// Gets or sets the last sync time.
    /// </summary>
    public DateTime? LastSyncTime { get; set; }

    /// <summary>
    /// Gets or sets the number of libraries mapped.
    /// </summary>
    public int LibraryCount { get; set; }
}
