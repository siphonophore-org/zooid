using Jellyfin.Plugin.Zooid.Models.Configuration;
using Jellyfin.Plugin.Zooid.Tasks.Common;
using Jellyfin.Sdk.Generated.Models;

namespace Jellyfin.Plugin.Zooid.Tasks.HistorySync;

/// <summary>
/// Source side work item for the History scan task, which <see cref="RefreshHistorySyncTableTask"/> turns into a sync row.
/// </summary>
/// <param name="Source">The server the item came from.</param>
/// <param name="UserMapping">The user mapping whose history is read.</param>
/// <param name="LibraryMapping">The library mapping the item belongs to.</param>
/// <param name="SourceItem">The item as the source reports it.</param>
public sealed record HistoryWork(ScanSource Source, UserMapping UserMapping, LibraryMapping LibraryMapping, BaseItemDto SourceItem);
