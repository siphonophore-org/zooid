namespace Jellyfin.Plugin.Zooid.Models.ContentSync;

/// <summary>
/// What one library mapping of one server holds here, for the Storage page.
/// </summary>
public class LibraryStorage
{
    /// <summary>Gets or sets the library on the source.</summary>
    public string SourceLibraryId { get; set; } = string.Empty;

    /// <summary>Gets or sets the library here.</summary>
    public string LocalLibraryId { get; set; } = string.Empty;

    /// <summary>Gets or sets how many synced files are full copies.</summary>
    public int Copies { get; set; }

    /// <summary>Gets or sets how many synced files are links whose file is not in the link cache.</summary>
    public int Links { get; set; }

    /// <summary>Gets or sets how many synced files are links whose file is in the link cache.</summary>
    public int CachedLinks { get; set; }

    /// <summary>Gets or sets how many rows wait for the next run.</summary>
    public int Queued { get; set; }

    /// <summary>Gets or sets how many rows wait for approval.</summary>
    public int Pending { get; set; }

    /// <summary>Gets or sets how many rows failed and will be retried.</summary>
    public int Errored { get; set; }

    /// <summary>Gets or sets the bytes the synced copies take on disk.</summary>
    public long CopyBytes { get; set; }
}
