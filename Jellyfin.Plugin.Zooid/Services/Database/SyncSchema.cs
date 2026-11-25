using System;
using Microsoft.Data.Sqlite;

#pragma warning disable CA2100 // SQL commands use only internal constants and safe parameterized queries

namespace Jellyfin.Plugin.Zooid.Services.Database;

/// <summary>
/// Holds the sync database's schema, every table as this release reads and writes it, and the version that names it.
/// </summary>
public static class SyncSchema
{
    /// <summary>
    /// The schema version. Raise it when the schema changes, and add the step that brings the version before it forward.
    /// </summary>
    public const int CurrentSchemaVersion = 1;

    /// <summary>
    /// The oldest schema version whose code can still use a database at <see cref="CurrentSchemaVersion"/>, written into the database so an older build can tell.
    /// Raise it only when a change alters or removes something older code relies on, never for added tables, nullable or defaulted columns, or indexes.
    /// </summary>
    public const int MinReaderVersion = 1;

    /// <summary>
    /// Creates every table of the schema in an empty database.
    /// </summary>
    /// <param name="connection">The open database to create the tables in.</param>
    public static void Create(SqliteConnection connection)
    {
        ArgumentNullException.ThrowIfNull(connection);
        CreateContentTable(connection);
        CreateHistoryTable(connection);
        CreateUserTable(connection);
        CreatePeopleTable(connection);
        CreateMetadataTable(connection);
        CreateSharedTables(connection);
        CreateStatisticsTables(connection);
        CreateMediaSegmentTable(connection);
    }

    /// <summary>
    /// Creates the Content sync table, one row for each file to download, replace, or delete, where a change shows as a new size.
    /// PendingType names the operation apart from Status, StorageMode says copy or link, and OriginServerId names a copy's origin.
    /// </summary>
    private static void CreateContentTable(SqliteConnection connection)
    {
        using var syncItemsCmd = connection.CreateCommand();
        syncItemsCmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS SyncItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SourceLibraryId TEXT NOT NULL,
                LocalLibraryId TEXT NOT NULL,
                SourceItemId TEXT NOT NULL,
                SourcePath TEXT NOT NULL,
                SourceSize INTEGER NOT NULL,
                SourceCreateDate TEXT NOT NULL,
                LocalItemId TEXT,
                LocalPath TEXT,
                Status INTEGER NOT NULL,
                StatusDate TEXT NOT NULL,
                LastSyncTime TEXT,
                Reason TEXT,
                PendingType INTEGER,
                RetryCount INTEGER DEFAULT 0,
                ServerKey TEXT,
                CompanionFiles TEXT,
                StorageMode INTEGER NOT NULL DEFAULT 0,
                Kept INTEGER NOT NULL DEFAULT 0,
                OriginServerId TEXT,
                UNIQUE(SourceItemId)
            );
            CREATE INDEX IF NOT EXISTS idx_source_item ON SyncItems(SourceItemId);
            CREATE INDEX IF NOT EXISTS idx_status ON SyncItems(Status);
            CREATE INDEX IF NOT EXISTS idx_source_library ON SyncItems(SourceLibraryId);
            CREATE INDEX IF NOT EXISTS idx_local_path ON SyncItems(LocalPath);
        ";
        syncItemsCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the History sync table, one row for each user and item, holding the five history fields as the source, this server, and the merge have them.
    /// The state hashes fingerprint the source's five fields, so a scan skips a row whose source state has not moved.
    /// </summary>
    private static void CreateHistoryTable(SqliteConnection connection)
    {
        using var historyCmd = connection.CreateCommand();
        historyCmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS HistorySyncItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SourceUserId TEXT NOT NULL,
                LocalUserId TEXT NOT NULL,
                SourceLibraryId TEXT NOT NULL,
                LocalLibraryId TEXT NOT NULL,
                SourceItemId TEXT NOT NULL,
                LocalItemId TEXT,
                ItemName TEXT,
                SourcePath TEXT,
                LocalPath TEXT,
                SourceIsPlayed INTEGER,
                SourcePlayCount INTEGER,
                SourcePlaybackPositionTicks INTEGER,
                SourceLastPlayedDate TEXT,
                SourceIsFavorite INTEGER,
                LocalIsPlayed INTEGER,
                LocalPlayCount INTEGER,
                LocalPlaybackPositionTicks INTEGER,
                LocalLastPlayedDate TEXT,
                LocalIsFavorite INTEGER,
                MergedIsPlayed INTEGER,
                MergedPlayCount INTEGER,
                MergedPlaybackPositionTicks INTEGER,
                MergedLastPlayedDate TEXT,
                MergedIsFavorite INTEGER,
                NegotiatedIsPlayed INTEGER,
                NegotiatedPlayCount INTEGER,
                NegotiatedPlaybackPositionTicks INTEGER,
                NegotiatedLastPlayedDate TEXT,
                NegotiatedIsFavorite INTEGER,
                NegotiatedAt TEXT,
                Status INTEGER NOT NULL,
                StatusDate TEXT NOT NULL,
                LastSyncTime TEXT,
                Reason TEXT,
                RetryCount INTEGER NOT NULL DEFAULT 0,
                ServerKey TEXT,
                SourceStateHash TEXT,
                SyncedStateHash TEXT,
                UNIQUE(SourceUserId, SourceItemId)
            );
            CREATE INDEX IF NOT EXISTS idx_history_user ON HistorySyncItems(SourceUserId, LocalUserId);
            CREATE INDEX IF NOT EXISTS idx_history_status ON HistorySyncItems(Status);
            CREATE INDEX IF NOT EXISTS idx_history_library ON HistorySyncItems(SourceLibraryId);
            CREATE INDEX IF NOT EXISTS idx_history_server_local ON HistorySyncItems(ServerKey, LocalItemId);
        ";
        historyCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the Users sync table, one row for each user mapping and each of Policy, Configuration, and ProfileImage.
    /// The value hashes let a scan skip an unchanged row, and the image hashes compare the profile image. On a ProfileImage row, SourceValueHash holds the source's image tag.
    /// </summary>
    private static void CreateUserTable(SqliteConnection connection)
    {
        using var userCmd = connection.CreateCommand();
        userCmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS UserSyncItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SourceUserId TEXT NOT NULL,
                LocalUserId TEXT NOT NULL,
                SourceUserName TEXT,
                LocalUserName TEXT,
                PropertyCategory TEXT NOT NULL,
                SourceValue TEXT,
                LocalValue TEXT,
                MergedValue TEXT,
                SourceValueHash TEXT,
                SyncedValueHash TEXT,
                SourceImageHash TEXT,
                LocalImageHash TEXT,
                SyncedImageHash TEXT,
                SourceImageSize INTEGER,
                LocalImageSize INTEGER,
                SyncedImageSize INTEGER,
                Status INTEGER NOT NULL DEFAULT 0,
                StatusDate TEXT NOT NULL,
                LastSyncTime TEXT,
                Reason TEXT,
                RetryCount INTEGER NOT NULL DEFAULT 0,
                ServerKey TEXT,
                UNIQUE(SourceUserId, LocalUserId, PropertyCategory)
            );
            CREATE INDEX IF NOT EXISTS idx_user_sync_mapping ON UserSyncItems(SourceUserId, LocalUserId);
            CREATE INDEX IF NOT EXISTS idx_user_sync_status ON UserSyncItems(Status);
            CREATE INDEX IF NOT EXISTS idx_user_sync_category ON UserSyncItems(PropertyCategory);
        ";
        userCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the People sync table, one row for each person, matched by name across servers.
    /// Metadata and Images are each held as JSON with hashes, so a scan skips a value that matches what was synced.
    /// </summary>
    private static void CreatePeopleTable(SqliteConnection connection)
    {
        using var peopleCmd = connection.CreateCommand();
        peopleCmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS PeopleSyncItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                PersonName TEXT NOT NULL,
                SourcePersonId TEXT,
                LocalPersonId TEXT,
                SourceMetadataValue TEXT,
                LocalMetadataValue TEXT,
                SourceMetadataHash TEXT,
                SyncedMetadataHash TEXT,
                SourceImagesValue TEXT,
                LocalImagesValue TEXT,
                SourceImagesHash TEXT,
                SyncedImagesHash TEXT,
                Status INTEGER NOT NULL DEFAULT 0,
                StatusDate TEXT NOT NULL,
                LastSyncTime TEXT,
                Reason TEXT,
                RetryCount INTEGER NOT NULL DEFAULT 0,
                ServerKey TEXT,
                UNIQUE(PersonName)
            );
            CREATE INDEX IF NOT EXISTS idx_people_sync_name ON PeopleSyncItems(PersonName);
            CREATE INDEX IF NOT EXISTS idx_people_sync_status ON PeopleSyncItems(Status);
        ";
        peopleCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the Metadata sync table, one row for each item, holding Metadata, Images, People, Studios, and media segments.
    /// Each category has its own hashes, so a scan skips the categories that match what was synced.
    /// </summary>
    private static void CreateMetadataTable(SqliteConnection connection)
    {
        using var metadataCmd = connection.CreateCommand();
        metadataCmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS MetadataSyncItems (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                SourceLibraryId TEXT NOT NULL,
                LocalLibraryId TEXT NOT NULL,
                SourceItemId TEXT NOT NULL,
                LocalItemId TEXT,
                ItemName TEXT,
                SourcePath TEXT,
                LocalPath TEXT,
                ItemType TEXT,
                IsFolder INTEGER NOT NULL DEFAULT 0,
                SourceMetadataValue TEXT,
                LocalMetadataValue TEXT,
                SourceMetadataHash TEXT,
                SyncedMetadataHash TEXT,
                SourceImagesValue TEXT,
                LocalImagesValue TEXT,
                SourceImagesHash TEXT,
                SyncedImagesHash TEXT,
                SourcePeopleValue TEXT,
                LocalPeopleValue TEXT,
                SourcePeopleHash TEXT,
                SyncedPeopleHash TEXT,
                SourceStudiosValue TEXT,
                LocalStudiosValue TEXT,
                SourceStudiosHash TEXT,
                SyncedStudiosHash TEXT,
                SourceSegmentsValue TEXT,
                LocalSegmentsValue TEXT,
                SourceSegmentsHash TEXT,
                SyncedSegmentsHash TEXT,
                Status INTEGER NOT NULL DEFAULT 0,
                StatusDate TEXT NOT NULL,
                LastSyncTime TEXT,
                Reason TEXT,
                RetryCount INTEGER NOT NULL DEFAULT 0,
                ServerKey TEXT,
                UNIQUE(SourceLibraryId, SourceItemId)
            );
            CREATE INDEX IF NOT EXISTS idx_metadata_sync_item ON MetadataSyncItems(SourceItemId);
            CREATE INDEX IF NOT EXISTS idx_metadata_sync_status ON MetadataSyncItems(Status);
            CREATE INDEX IF NOT EXISTS idx_metadata_sync_library ON MetadataSyncItems(SourceLibraryId);
        ";
        metadataCmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the tables beside the sync tables, which hold hints sent and received, stamps, pairing secrets, scan watermarks,
    /// playlists copied from peers, when each failing row first failed, and the files that left the library.
    /// </summary>
    private static void CreateSharedTables(SqliteConnection connection)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS OutboundHints (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                HintId TEXT NOT NULL,
                PeerKey TEXT NOT NULL,
                Kind INTEGER NOT NULL,
                Key TEXT NOT NULL,
                ItemPath TEXT,
                ItemId TEXT,
                UserId TEXT,
                UserName TEXT,
                ItemType TEXT,
                VersionServerId TEXT NOT NULL,
                VersionTimestamp TEXT NOT NULL,
                Recorded INTEGER NOT NULL DEFAULT 1,
                State INTEGER NOT NULL,
                Attempts INTEGER NOT NULL DEFAULT 0,
                NextAttempt TEXT NOT NULL,
                SentAt TEXT,
                LastError TEXT,
                CreatedAt TEXT NOT NULL,
                UNIQUE(PeerKey, Kind, Key)
            );
            CREATE INDEX IF NOT EXISTS idx_outbound_state ON OutboundHints(State, NextAttempt);
            CREATE INDEX IF NOT EXISTS idx_outbound_hint ON OutboundHints(HintId);
            CREATE INDEX IF NOT EXISTS idx_outbound_peer_state ON OutboundHints(PeerKey, State, Id);

            CREATE TABLE IF NOT EXISTS InboundHints (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                HintId TEXT NOT NULL,
                OriginServerId TEXT NOT NULL,
                Kind INTEGER NOT NULL,
                Key TEXT NOT NULL,
                ItemPath TEXT,
                ItemId TEXT,
                UserId TEXT,
                UserName TEXT,
                ItemType TEXT,
                VersionServerId TEXT NOT NULL,
                VersionTimestamp TEXT NOT NULL,
                Recorded INTEGER NOT NULL DEFAULT 1,
                ReceivedAt TEXT NOT NULL,
                Attempts INTEGER NOT NULL DEFAULT 0,
                NextAttempt TEXT NOT NULL,
                LastError TEXT,
                ParkedPath TEXT,
                UNIQUE(OriginServerId, Kind, Key)
            );
            CREATE INDEX IF NOT EXISTS idx_inbound_next ON InboundHints(NextAttempt);
            CREATE INDEX IF NOT EXISTS idx_inbound_origin ON InboundHints(OriginServerId);
            CREATE INDEX IF NOT EXISTS idx_inbound_parked_nocase ON InboundHints(ParkedPath COLLATE NOCASE);

            CREATE TABLE IF NOT EXISTS ObjectVersions (
                Kind INTEGER NOT NULL,
                Key TEXT NOT NULL,
                ServerId TEXT NOT NULL,
                Timestamp TEXT NOT NULL,
                PRIMARY KEY(Kind, Key)
            );

            CREATE TABLE IF NOT EXISTS PeerPairings (
                PeerKey TEXT NOT NULL PRIMARY KEY,
                InboundSecret TEXT,
                OutboundSecret TEXT,
                InboundRefusedAt TEXT,
                UpdatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS PendingVersions (
                Kind INTEGER NOT NULL,
                Key TEXT NOT NULL,
                ServerId TEXT NOT NULL,
                Timestamp TEXT NOT NULL,
                ReadAt TEXT NOT NULL,
                PRIMARY KEY(Kind, Key)
            );

            CREATE TABLE IF NOT EXISTS ScanWatermarks (
                TaskKey TEXT NOT NULL,
                ServerKey TEXT NOT NULL,
                ScopeHash TEXT NOT NULL,
                ListedFrom TEXT NOT NULL,
                FullAt TEXT NOT NULL,
                PRIMARY KEY(TaskKey, ServerKey)
            );

            CREATE TABLE IF NOT EXISTS PlaylistCopies (
                PlaylistId TEXT NOT NULL PRIMARY KEY,
                RootId TEXT NOT NULL,
                ServerKey TEXT NOT NULL,
                CreatedAt TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS SyncAttention (
                TableName TEXT NOT NULL,
                RowId INTEGER NOT NULL,
                FirstFailed TEXT NOT NULL,
                Reason TEXT,
                Reported INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(TableName, RowId)
            );

            CREATE TABLE IF NOT EXISTS RemovedItems (
                Seq INTEGER PRIMARY KEY AUTOINCREMENT,
                ItemId TEXT NOT NULL,
                RemovedAt TEXT NOT NULL,
                Path TEXT,
                OriginServerId TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_removed_items_at ON RemovedItems(RemovedAt);
            CREATE TABLE IF NOT EXISTS RemovedItemsLog (StartedAt TEXT NOT NULL);
            INSERT INTO RemovedItemsLog (StartedAt) SELECT @now WHERE NOT EXISTS (SELECT 1 FROM RemovedItemsLog);";
        cmd.Parameters.AddWithValue("@now", Siphonophore.Stolon.UtcTime.Format(DateTime.UtcNow));
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the tables the Statistics page reads: the last scans of each sync type, and the link streams started for each server on each day.
    /// Both hold counts only, and each write trims them to what the charts show.
    /// </summary>
    private static void CreateStatisticsTables(SqliteConnection connection)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS ScanRuns (
                Id INTEGER PRIMARY KEY AUTOINCREMENT,
                Module TEXT NOT NULL,
                FinishedAt TEXT NOT NULL,
                Added INTEGER NOT NULL DEFAULT 0,
                Updated INTEGER NOT NULL DEFAULT 0,
                Removed INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_scan_runs_module ON ScanRuns(Module, Id);

            CREATE TABLE IF NOT EXISTS LinkStreamDays (
                Day TEXT NOT NULL,
                ServerKey TEXT NOT NULL,
                Streams INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(Day, ServerKey)
            );";
        cmd.ExecuteNonQuery();
    }

    /// <summary>
    /// Creates the table the media segment provider answers from: for each local item, the segments its source holds
    /// with the size and runtime of the source's file, so they are used only for the same file, and the server they were first made on.
    /// HeldTypes names the segment types this server made itself, whose own segments are kept.
    /// </summary>
    private static void CreateMediaSegmentTable(SqliteConnection connection)
    {
        using var cmd = connection.CreateCommand();
        cmd.CommandText = @"
            CREATE TABLE IF NOT EXISTS SourceMediaSegments (
                LocalItemId TEXT PRIMARY KEY,
                ServerKey TEXT NOT NULL,
                SourceItemId TEXT NOT NULL,
                Segments TEXT NOT NULL,
                Size INTEGER,
                RunTimeTicks INTEGER,
                FetchedAt TEXT NOT NULL,
                OriginServerId TEXT,
                HeldTypes TEXT
            );";
        cmd.ExecuteNonQuery();
    }
}
