using System;
using MediaBrowser.Common.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.Zooid.Services.Database;

/// <summary>
/// Opens the shared <see cref="SyncDatabase"/> on first use and closes it on disposal.
/// </summary>
[PluginService(ServiceLifetime.Singleton, ServiceType = typeof(ISyncDatabaseProvider))]
public sealed class SyncDatabaseProvider : ISyncDatabaseProvider, IDisposable
{
    private readonly ILoggerFactory _loggerFactory;
    private readonly string _dataPath;
    private readonly object _lock = new();
    private volatile SyncDatabase? _database;
    private volatile bool _disposed;

    /// <summary>
    /// Initializes a new instance of the <see cref="SyncDatabaseProvider"/> class.
    /// </summary>
    /// <param name="loggerFactory">Builds the database's logger.</param>
    /// <param name="applicationPaths">Locates Jellyfin's data folder.</param>
    public SyncDatabaseProvider(ILoggerFactory loggerFactory, IApplicationPaths applicationPaths)
    {
        ArgumentNullException.ThrowIfNull(loggerFactory);
        ArgumentNullException.ThrowIfNull(applicationPaths);
        _loggerFactory = loggerFactory;
        _dataPath = applicationPaths.DataPath;
    }

    /// <inheritdoc />
    public SyncDatabase Database
    {
        get
        {
            ObjectDisposedException.ThrowIf(_disposed, nameof(SyncDatabaseProvider));

            if (_database != null)
            {
                return _database;
            }

            lock (_lock)
            {
                ObjectDisposedException.ThrowIf(_disposed, nameof(SyncDatabaseProvider));
                _database ??= new SyncDatabase(
                    _loggerFactory.CreateLogger<SyncDatabase>(),
                    _dataPath);
                return _database;
            }
        }
    }

    /// <inheritdoc />
    public void Dispose()
    {
        lock (_lock)
        {
            if (!_disposed)
            {
                _database?.Dispose();
                _disposed = true;
            }
        }
    }
}
