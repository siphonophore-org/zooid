using System;
using Jellyfin.Plugin.Zooid.Models.Configuration;
using Jellyfin.Plugin.Zooid.Services.Clients;

namespace Jellyfin.Plugin.Zooid.Services.Providers;

/// <summary>An item found on another server, with the client that reached it.</summary>
/// <param name="Parent">The source it was found on.</param>
/// <param name="Client">The client for that server, which the match disposes.</param>
/// <param name="ItemId">The item's id on that server.</param>
public sealed record PeerMatch(SourceServer Parent, SourceServerClient Client, Guid ItemId) : IDisposable
{
    /// <inheritdoc />
    public void Dispose() => Client.Dispose();
}
