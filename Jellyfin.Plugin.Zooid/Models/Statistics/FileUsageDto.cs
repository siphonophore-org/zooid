namespace Jellyfin.Plugin.Zooid.Models.Statistics;

/// <summary>
/// How one server's synced files are kept here: as full copies, as links, and as links whose file is in the link cache.
/// </summary>
public class FileUsageDto
{
    /// <summary>
    /// Gets or sets the server entry's key.
    /// </summary>
    public string ServerKey { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets the server's name as the pages show it.
    /// </summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Gets or sets how many synced files are full copies.
    /// </summary>
    public int Copies { get; set; }

    /// <summary>
    /// Gets or sets how many synced files are links whose file is not in the link cache.
    /// </summary>
    public int Links { get; set; }

    /// <summary>
    /// Gets or sets how many synced files are links whose file is in the link cache.
    /// </summary>
    public int CachedLinks { get; set; }
}
