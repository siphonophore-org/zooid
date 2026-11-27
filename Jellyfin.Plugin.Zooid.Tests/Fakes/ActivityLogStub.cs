using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Jellyfin.Data.Queries;
using Jellyfin.Plugin.Zooid.Services.Activity;
using MediaBrowser.Model.Activity;
using MediaBrowser.Model.Querying;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Zooid.Tests.Fakes;

/// <summary>
/// An activity feed over a stub of Jellyfin's activity manager that answers from a list, newest first, and records each page asked for.
/// </summary>
public sealed class ActivityLogStub
{
    /// <summary>
    /// Initializes a new instance of the <see cref="ActivityLogStub"/> class.
    /// </summary>
    /// <param name="log">The entries the log holds, newest first.</param>
    public ActivityLogStub(IReadOnlyList<ActivityLogEntry> log)
    {
        var (manager, stub) = InterfaceStub.Create<IActivityManager>();
        stub.Answer(nameof(IActivityManager.GetPagedResultAsync), args =>
        {
            var query = (ActivityLogQuery)args[0]!;
            Queries.Add(query);
            var items = log.Skip(query.Skip ?? 0).Take(query.Limit ?? log.Count).ToList();
            return Task.FromResult(new QueryResult<ActivityLogEntry>(query.Skip, log.Count, items));
        });
        Feed = new ActivityFeed(manager);
    }

    /// <summary>Gets the feed under test.</summary>
    public ActivityFeed Feed { get; }

    /// <summary>Gets each page the feed asked for, in order.</summary>
    public List<ActivityLogQuery> Queries { get; } = new();

    /// <summary>
    /// Builds a log entry written some minutes before a fixed moment.
    /// </summary>
    /// <param name="minutesAgo">How long before the fixed moment it was written.</param>
    /// <param name="type">Its type.</param>
    /// <param name="name">Its name.</param>
    /// <param name="severity">How serious it is.</param>
    /// <returns>The entry.</returns>
    public static ActivityLogEntry Entry(int minutesAgo, string type, string name = "Entry", LogLevel severity = LogLevel.Information)
        => new(name, type, Guid.Empty) { Date = new DateTime(2026, 11, 27, 12, 0, 0, DateTimeKind.Utc).AddMinutes(-minutesAgo), Severity = severity };
}
