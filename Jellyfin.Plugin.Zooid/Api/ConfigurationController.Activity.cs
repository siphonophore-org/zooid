using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Jellyfin.Plugin.Zooid.Services.Activity;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Zooid.Api;

/// <summary>
/// The route of the Dashboard's Recent activity.
/// </summary>
public partial class ConfigurationController
{
    /// <summary>
    /// Gives Zooid's newest activity log entries.
    /// </summary>
    /// <param name="feed">Reads Zooid's entries from the activity log.</param>
    /// <param name="limit">How many to give, up to 50. Defaults to 20.</param>
    /// <returns>The entries, newest first.</returns>
    [HttpGet("Activity")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<ActivityItem>>> GetActivity([FromServices] ActivityFeed feed, [FromQuery] int limit = 20)
    {
        ArgumentNullException.ThrowIfNull(feed);
        return Ok(await feed.RecentAsync(limit).ConfigureAwait(false));
    }
}
