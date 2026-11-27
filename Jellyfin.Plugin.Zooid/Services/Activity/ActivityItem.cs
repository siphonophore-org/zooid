using System;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Zooid.Services.Activity;

/// <summary>
/// One of Zooid's activity log entries, as the Dashboard lists it.
/// </summary>
/// <param name="Date">When it was written, in UTC.</param>
/// <param name="Name">Its name.</param>
/// <param name="Overview">Its overview, or null.</param>
/// <param name="Type">Its type, such as Zooid.HintsApplied.</param>
/// <param name="Severity">How serious it is.</param>
public sealed record ActivityItem(DateTime Date, string Name, string? Overview, string Type, LogLevel Severity);
