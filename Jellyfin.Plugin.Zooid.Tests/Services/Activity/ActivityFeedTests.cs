using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Plugin.Zooid.Services.Activity;
using Jellyfin.Plugin.Zooid.Tests.Fakes;
using MediaBrowser.Model.Activity;
using Microsoft.Extensions.Logging;
using Xunit;

namespace Jellyfin.Plugin.Zooid.Tests.Services.Activity;

/// <summary>
/// The feed reads the activity log a page at a time and keeps Zooid's entries, newest first.
/// </summary>
public class ActivityFeedTests
{
    /// <summary>
    /// Zooid's own types are owned, and other plugins' and Jellyfin's are not.
    /// True: Recent activity shows only what Zooid wrote.
    /// False: another plugin's entry, or one that only starts with the same letters, would show.
    /// </summary>
    [Theory]
    [InlineData("Zooid.HintsApplied", true)]
    [InlineData("Zooid.PeerPaused", true)]
    [InlineData("ZooidAttention", true)]
    [InlineData("Zooid.", false)]
    [InlineData("Zooid", false)]
    [InlineData("ZooidOther", false)]
    [InlineData("zooid.HintsApplied", false)]
    [InlineData("Necto.GroupCreated", false)]
    [InlineData("SessionStarted", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void Owns_KnowsZooidTypes(string? type, bool owned)
        => Assert.Equal(owned, ActivityFeed.Owns(type));

    /// <summary>
    /// Only Zooid's entries come back, newest first, with their names, types, overviews, and severities.
    /// True: Recent activity shows what Zooid did.
    /// False: Jellyfin's own entries would fill the list.
    /// </summary>
    [Fact]
    public async Task RecentAsync_KeepsZooidEntriesNewestFirst()
    {
        var paused = ActivityLogStub.Entry(2, "Zooid.PeerPaused", "Sending paused", LogLevel.Warning);
        paused.Overview = "Den is unreachable";
        var stub = new ActivityLogStub(new List<ActivityLogEntry>
        {
            ActivityLogStub.Entry(1, "SessionStarted"),
            ActivityLogStub.Entry(3, ActivityFeed.AttentionType, "Items failed for a day", LogLevel.Warning),
            paused,
            ActivityLogStub.Entry(4, "Necto.GroupCreated")
        });

        var items = await stub.Feed.RecentAsync(10);

        Assert.Equal(new[] { "Sending paused", "Items failed for a day" }, items.Select(i => i.Name));
        Assert.Equal(("Zooid.PeerPaused", "Den is unreachable", LogLevel.Warning), (items[0].Type, items[0].Overview, items[0].Severity));
    }

    /// <summary>
    /// The feed reads further pages until it has enough, stops at a short page, and never reads past its bound.
    /// True: a log busy with Jellyfin's own entries still shows Zooid's, at a bounded cost.
    /// False: the Dashboard would read the whole log on every load.
    /// </summary>
    [Fact]
    public async Task RecentAsync_ReadsPagesUpToItsBound()
    {
        var log = Enumerable.Range(0, 150).Select(i => ActivityLogStub.Entry(i, "SessionStarted"))
            .Append(ActivityLogStub.Entry(200, "Zooid.HintsApplied", "Items synced")).ToList();
        var stub = new ActivityLogStub(log);

        var items = await stub.Feed.RecentAsync(5);

        Assert.Equal("Items synced", Assert.Single(items).Name);
        Assert.Equal(new int?[] { 0, 100 }, stub.Queries.Select(q => q.Skip));

        var busy = new ActivityLogStub(Enumerable.Range(0, 1000).Select(i => ActivityLogStub.Entry(i, "SessionStarted")).ToList());
        Assert.Empty(await busy.Feed.RecentAsync(5));
        Assert.Equal(5, busy.Queries.Count);
    }

    /// <summary>
    /// The feed stops reading once a page gives it enough entries.
    /// True: a log full of Zooid's entries costs one page.
    /// False: every load would read five pages.
    /// </summary>
    [Fact]
    public async Task RecentAsync_StopsWhenItHasEnough()
    {
        var stub = new ActivityLogStub(Enumerable.Range(0, 300).Select(i => ActivityLogStub.Entry(i, "Zooid.HintsApplied")).ToList());

        var items = await stub.Feed.RecentAsync(20);

        Assert.Equal(20, items.Count);
        Assert.Single(stub.Queries);
    }

    /// <summary>
    /// The count is held between 1 and the most the Dashboard lists.
    /// True: a caller cannot ask for the whole log.
    /// False: a large limit would return thousands of entries, and zero or less would return none.
    /// </summary>
    [Fact]
    public async Task RecentAsync_HoldsTheCount()
    {
        var stub = new ActivityLogStub(Enumerable.Range(0, 80).Select(i => ActivityLogStub.Entry(i, "Zooid.HintsApplied")).ToList());

        Assert.Equal(ActivityFeed.MaxItems, (await stub.Feed.RecentAsync(500)).Count);
        Assert.Single(await stub.Feed.RecentAsync(0));
        Assert.Single(await stub.Feed.RecentAsync(-3));
    }
}
