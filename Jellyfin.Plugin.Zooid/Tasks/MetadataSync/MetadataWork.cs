using Jellyfin.Plugin.Zooid.Models.Configuration;
using Jellyfin.Plugin.Zooid.Tasks.Common;
using Jellyfin.Sdk.Generated.Models;

namespace Jellyfin.Plugin.Zooid.Tasks.MetadataSync;

/// <summary>
/// Source side work item for the Metadata scan task, which <see cref="RefreshMetadataSyncTableTask"/> turns into a sync row.
/// </summary>
/// <param name="Source">The server the item came from.</param>
/// <param name="LibraryMapping">The library mapping the item belongs to.</param>
/// <param name="SourceItem">The item as the source reports it.</param>
/// <param name="IsFolder">Whether the item is a container such as a series or album.</param>
public sealed record MetadataWork(ScanSource Source, LibraryMapping LibraryMapping, BaseItemDto SourceItem, bool IsFolder, bool CastFetched = true);
