using Jellyfin.Plugin.Zooid.Models.Common;
using Jellyfin.Plugin.Zooid.Models.Configuration;
using Jellyfin.Plugin.Zooid.Tasks.Common;
using Jellyfin.Sdk.Generated.Models;

namespace Jellyfin.Plugin.Zooid.Tasks.ContentSync;

/// <summary>
/// Source side work item for the Content scan task, which <see cref="UpdateSyncTablesTask"/> turns into a sync row.
/// </summary>
/// <param name="Source">The server the item came from.</param>
/// <param name="Mapping">The library mapping the item belongs to.</param>
/// <param name="SourceItem">The item as the source reports it.</param>
/// <param name="WatchedByAll">Whether every user picked for the watched filter has played the item, so its row is <see cref="SyncStatus.Ignored"/>.</param>
public sealed record ContentRefreshWork(ScanSource Source, LibraryMapping Mapping, BaseItemDto SourceItem, bool WatchedByAll);
