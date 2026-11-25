using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Jellyfin.Plugin.Zooid.Services.ContentSync.Tables;
using Jellyfin.Plugin.Zooid.Services.Database;
using Jellyfin.Plugin.Zooid.Tests.Fakes;
using Siphonophore.Stolon;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Plugin.Zooid.Tests.Services.Database;

/// <summary>
/// The schema is created in one step and never upgraded in place, so these tests pin what it holds and
/// what happens to a database from a release this one cannot read.
/// </summary>
public sealed class SyncSchemaTests : IDisposable
{
    // The fingerprint of every table, column, and index at schema v39. A change to the schema changes
    // it, which is the moment to raise SyncSchema.CurrentSchemaVersion and decide what older files do.
    private const string SchemaFingerprint = "1B614A677C453177305610F2DD276DD3CC511498547F9DA02530DA984C61C66F";

    private readonly string _dataPath;

    public SyncSchemaTests()
    {
        _dataPath = Path.Combine(Path.GetTempPath(), "zooid-schema-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dataPath);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_dataPath, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    /// <summary>
    /// An empty database gets every table the plugin reads.
    /// True: a fresh install works from its first start.
    /// False: the first query against a missing table fails.
    /// </summary>
    [Fact]
    public void Create_MakesEveryTable()
    {
        using var conn = Memory();
        SyncSchema.Create(conn);

        var tables = Column(conn, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        Assert.Equal(
            new[]
            {
                "HistorySyncItems", "InboundHints", "LinkStreamDays", "MetadataSyncItems", "ObjectVersions", "OutboundHints", "PeerPairings",
                "PendingVersions", "PeopleSyncItems", "PlaylistCopies", "RemovedItems", "RemovedItemsLog", "ScanRuns", "ScanWatermarks",
                "SourceMediaSegments", "SyncAttention", "SyncItems", "UserSyncItems"
            },
            tables);
        Assert.Equal(1L, Scalar(conn, "SELECT COUNT(*) FROM RemovedItemsLog"));
    }

    /// <summary>
    /// Creating the schema twice changes nothing.
    /// True: a start that was cut short after the tables and before the version stamp recovers.
    /// False: that start would fail on a table that already exists.
    /// </summary>
    [Fact]
    public void Create_Twice_IsHarmless()
    {
        using var conn = Memory();
        SyncSchema.Create(conn);
        var first = Describe(conn);
        SyncSchema.Create(conn);

        Assert.Equal(first, Describe(conn));
        Assert.Equal(1L, Scalar(conn, "SELECT COUNT(*) FROM RemovedItemsLog"));
    }

    /// <summary>
    /// The schema is exactly the one this version number names.
    /// True: a database written by any build at this version has the same tables, columns, and indexes.
    /// False: the schema drifted without its version, so two builds at one version would disagree.
    /// </summary>
    [Fact]
    public void Schema_MatchesItsVersion()
    {
        using var conn = Memory();
        SyncSchema.Create(conn);
        var described = Describe(conn);
        if (Environment.GetEnvironmentVariable("ZOOID_SCHEMA_DUMP") is { Length: > 0 } dump)
        {
            File.WriteAllText(dump, described);
        }

        Assert.Equal(1, SyncSchema.CurrentSchemaVersion);
        Assert.Equal(SchemaFingerprint, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(described))));
    }

    private static SqliteConnection Memory()
    {
        var conn = new SqliteConnection("Data Source=:memory:");
        conn.Open();
        return conn;
    }

    // Every column of every table in order, then every index, one per line.
    private static string Describe(SqliteConnection conn)
    {
        var lines = Column(conn, @"SELECT m.name || '.' || p.name || ' ' || p.type || ' ' || p.""notnull"" || ' ' || COALESCE(p.dflt_value, '-') || ' ' || p.pk
            FROM sqlite_master m, pragma_table_info(m.name) p
            WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name <> 'SchemaInfo' ORDER BY m.name, p.cid").ToList();
        lines.AddRange(Column(conn, "SELECT 'IDX ' || name || ' ' || tbl_name FROM sqlite_master WHERE type = 'index' AND tbl_name <> 'SchemaInfo' ORDER BY name"));
        return string.Join('\n', lines);
    }

    private static string[] Column(SqliteConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        using var reader = cmd.ExecuteReader();
        var values = new List<string>();
        while (reader.Read())
        {
            values.Add(reader.GetString(0));
        }

        return values.ToArray();
    }

    private static void Exec(SqliteConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        cmd.ExecuteNonQuery();
    }

    private static object? Scalar(SqliteConnection conn, string sql)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = sql;
        return cmd.ExecuteScalar();
    }
}
