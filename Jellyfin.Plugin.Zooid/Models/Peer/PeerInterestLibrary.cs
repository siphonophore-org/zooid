using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.Json;
using Jellyfin.Plugin.Zooid.Configuration;
using Jellyfin.Plugin.Zooid.Models.Configuration;
using Jellyfin.Plugin.Zooid.Models.Queue;
using Jellyfin.Plugin.Zooid.Services.Queue;
using Jellyfin.Plugin.Zooid.Utilities;

namespace Jellyfin.Plugin.Zooid.Models.Peer;

/// <summary>
/// One mapped library in a <see cref="PeerInterest"/>.
/// </summary>
public class PeerInterestLibrary
{
    /// <summary>Gets or sets the library's root folder on the peer.</summary>
    public string Root { get; set; } = string.Empty;

    /// <summary>Gets or sets the Library filter mode.</summary>
    public LibraryFilterMode FilterMode { get; set; }

    /// <summary>Gets or sets the paths the Library filter lists, in the peer's folders.</summary>
    public List<string> Filtered { get; set; } = new();
}
