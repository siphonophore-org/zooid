# Versioning

Releases use a four part version, `JJ.JJ.F.B`. It matches the supported Jellyfin version, followed by the plugin's own feature and bug count.

```
12.4.0.0
└┬─┘ │ └ 0 = Plugin bug release within that feature
 │   └─── 0 = Plugin feature release
 └──────── 12.4 = Jellyfin version this build is released for
```

| Part | Raised when | Then |
| :--- | :--- | :--- |
| `JJ.JJ` | The plugin moves to a new Jellyfin version | `F` and `B` start at 0 |
| `F` | A release adds a feature or changes behavior | `B` starts at 0 |
| `B` | A release only fixes bugs | Nothing else changes |

Zooid 12.4.0.0 is the first release. It needs Jellyfin 12.4.

## Unstable Builds

The unstable channel, `https://repo.siphonophore.org/unstable`, lists every stable release and a test build of the `unstable` branch each Friday. A test build's version is the Jellyfin version, the year, and a count that goes up by one with each build, `JJ.JJ.YYYY.N`, such as `12.4.2026.1` and then `12.4.2026.2`. It sorts after every stable release, so a server on the unstable channel always takes the newest test build.

## What a Release Carries

Each release carries three numbers besides its version.

| Number | 12.4.0.0 | What it decides |
| :--- | :--- | :--- |
| Protocol | 1, oldest 1 | Which servers this one exchanges live changes, history negotiation, and conflict checks with |
| Database schema | 1 | The layout of `zooid/sync.db` in the Jellyfin data folder |
| Minimum reader | 1 | The oldest schema whose code can still use the database |

A release raises the protocol only when a hint, a peer route, or a conflict rule changes in a way another server would misread. It raises the schema when the database layout changes, and the minimum reader only when that change alters or removes something older code relies on. The changelog says when the protocol changes.

## Mixing Versions in a Pool

Servers in a pool do not need the same plugin version. Each build speaks a numbered protocol and names the oldest protocol it still speaks. Two servers talk as long as those ranges overlap. Each call between servers carries the `X-Sync-Version`, `X-Sync-Protocol`, and `X-Sync-Min-Protocol` headers so the receiver can tell.

When the protocols do not overlap, changes for the other server wait in the queue and **Check link** reports the reason. A server that reports no protocol is compatible only when it runs exactly the same plugin version.

## The Database

Zooid's database notes its schema and the oldest schema that can read it. A build that finds a database from a newer schema uses it unchanged when its own schema is at or above that minimum reader. Otherwise it keeps the file as a `.newer-*` backup and starts a fresh database.

## Links and Other Servers

[Links](Links.md) need Zooid on both servers. The source advertises `Link` among its features, and a server with a **Link** mapping waits for a source that does.
