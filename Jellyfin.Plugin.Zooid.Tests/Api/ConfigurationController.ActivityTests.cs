using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Plugin.Zooid.Api;
using Jellyfin.Plugin.Zooid.Services.Activity;
using Jellyfin.Plugin.Zooid.Tests.Fakes;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Jellyfin.Plugin.Zooid.Tests.Api;

/// <summary>
/// The Activity route gives administrators Zooid's newest activity log entries, as many as asked up to its bound.
/// </summary>
public sealed class ConfigurationControllerActivityTests : IDisposable
{
    private readonly ControllerTestHarness _harness = new();

    /// <inheritdoc/>
    public void Dispose() => _harness.Dispose();

    /// <summary>
    /// The route requires elevation and answers GET at Activity.
    /// True: only an administrator reads what Zooid did.
    /// False: any signed in user could read server names and sync outcomes.
    /// </summary>
    [Fact]
    public void Route_RequiresElevation()
        => ControllerRouteAssert.Elevated(typeof(ConfigurationController), nameof(ConfigurationController.GetActivity), "GET", "Activity");

    /// <summary>
    /// The route gives 20 entries by default and the number asked for otherwise, newest first.
    /// True: the Dashboard lists the latest 20 without asking.
    /// False: the Dashboard would list everything or nothing.
    /// </summary>
    [Fact]
    public async Task GetActivity_GivesTheLimitNewestFirst()
    {
        var stub = new ActivityLogStub(Enumerable.Range(0, 30).Select(i => ActivityLogStub.Entry(i, "Zooid.HintsApplied", "Entry " + i)).ToList());
        var controller = _harness.Configuration();

        var byDefault = await Read(controller.GetActivity(stub.Feed));
        var three = await Read(controller.GetActivity(stub.Feed, 3));

        Assert.Equal(20, byDefault.Count);
        Assert.Equal(new[] { "Entry 0", "Entry 1", "Entry 2" }, three.Select(item => item.Name));
    }

    private static async Task<IReadOnlyList<ActivityItem>> Read(Task<ActionResult<IReadOnlyList<ActivityItem>>> answer)
        => Assert.IsAssignableFrom<IReadOnlyList<ActivityItem>>(Assert.IsType<OkObjectResult>((await answer).Result).Value);
}
