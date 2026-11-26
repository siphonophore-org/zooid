# Release

How to cut a release of this plugin, from the version number to the manifest every server reads.

| Channel | Repository URL | Released by | Version |
| :--- | :--- | :--- | :--- |
| Stable | `https://repo.siphonophore.org/stable` | Publishing the draft release, as below | `JJ.JJ.F.B` |
| Unstable | `https://repo.siphonophore.org/unstable` | **Release Unstable**, every Friday or by hand. See [Unstable Build](#unstable-build) | `JJ.JJ.YYYY.N` |

The unstable channel lists every stable release too.

## Versions

A version is `JJ.JJ.F.B`.

| Part | Means | Raise it when |
| :--- | :--- | :--- |
| `JJ.JJ` | The Jellyfin version the release targets, such as `12.4` | The plugin moves to a new Jellyfin version |
| `F` | The feature release | The release adds or changes behavior a user will notice |
| `B` | The bug release within that feature | The release only fixes bugs |

Raising a part sets every part after it to `0`. The first release is `12.4.0.0`. From there, a feature release raises `F` by one and sets `B` to `0`, and a fix raises `B` by one.

## Branch

A feature release is cut on `unstable`, then **Sync Branches** with `promote` moves `main` to it. A bug release is cut on `main`, and the sync carries it to `unstable`. See [branches.md](branches.md).

## Before the Release

1. **Stolon.** When the release needs a Stolon change, release Stolon first with its **Release** workflow, then raise `Siphonophore.Stolon` in `Jellyfin.Plugin.Zooid/Jellyfin.Plugin.Zooid.csproj` and delete any local copy Stolon replaces. Wait until GitHub Packages serves the version, and never release against a local package. Raise Stolon on a branch, and merge it once every check below has passed on it.
2. **Protocol.** When a hint, a peer route, or a conflict rule changes in a way a server on the previous protocol would misread, raise `HintProtocol.ProtocolVersion`. Raise `HintProtocol.MinProtocolVersion` only when the release cannot talk to the protocol before it.
3. **Database.** When the schema changes, raise `SyncSchema.CurrentSchemaVersion` and add the step that brings the version before it forward. Raise `SyncSchema.MinReaderVersion` only when the change alters or removes something the code of an earlier schema relies on, never for added tables, nullable or defaulted columns, or indexes.
4. **Build.**

    ```bash
    dotnet build
    ```

5. **Tests.**

    ```bash
    dotnet test
    ```

    ```bash
    node --test 'Jellyfin.Plugin.Zooid.Tests/js/*.test.mjs'
    ```

6. **Pool.** Run the full pool from a clean state.

    ```bash
    python3 tools/integration/run.py reset
    ```

    ```bash
    python3 tools/integration/run.py test
    ```

    Run the matrix too when the release changes how content or links follow file changes, or how files are downloaded or written. See [testing.md](testing.md#matrix).

    Every check must run on the commit that is released. Run them again after any later change.

7. **Artwork.** The build downloads the installed plugin's image from `brand/zooid/catalog.png` in the Siphonophore repository, and the catalog, docs, and README load theirs from the same folder. Change the artwork there, never in this repository.
8. **Docs.** Every page describes this release. Retake any screenshot whose subject changed, and all of them when the Stolon version changed. Update [Versioning](../docs/Versioning.md) when the protocol or the schema version changed, and [Architecture](../docs/Architecture.md) when the parts or their connections changed.

    ```bash
    mkdocs build --strict
    ```

9. **Review.** Run [review.md](review.md) over everything since the last release.

## Set the Release

Edit `build.yaml`.

1. Set `version` to the new version.
2. Replace the whole `changelog` with this release's entries. Each release lists only its own changes. See [documentation.md](documentation.md#release-notes) for how to write them.
3. Say in `changed` when the protocol changed, so a user knows to update every server in the pool.
4. Name the Stolon version in `developer` when it changed, such as "Uses Siphonophore.Stolon 12.4.8", with what it replaced locally.
5. Keep `description` and `overview` true for this release. The Siphonophore `plugins.json` holds the catalog's own copy, so update both together.

Commit it on its own.

```bash
git commit -am "Set the release to 12.4.0.0"
```

```bash
git push
```

## Publish

1. **Draft.** The **Create/Update Release Draft** workflow builds the zip and writes a draft release named `v<version>` with the changelog as its notes. A push that only changes `build.yaml` does not start it, so start it from the Actions tab. Draft builds run one at a time, so a push and a manual start that overlap build one after the other.
2. **Check.** Wait until no draft build is queued or running, since each one replaces the zip. Then open the draft on GitHub. The notes must match `build.yaml`, and the zip and its `.md5` must be attached.
3. **Release.** Publish the draft. The **Publish Plugin** workflow tells the Siphonophore repository, which rebuilds both manifests from this repository's releases. Without a `SIPHONOPHORE_DISPATCH_TOKEN` secret the manifests list it on their next scheduled rebuild, within six hours. A draft build never replaces the assets of a published release.
4. **Pull.**

    ```bash
    git pull
    ```

5. **Verify.** On a test server, add `https://repo.siphonophore.org/stable`, install the release from the catalog, restart, and open each tool.

## Unstable Build

**Release Unstable** publishes the `unstable` branch as a pre-release, which only the Siphonophore unstable manifest lists. It runs every Friday at 15:00 UTC, and by hand from the Actions tab on any day.

* The version is the Jellyfin version, the year, and a count, `JJ.JJ.YYYY.N`, such as `12.4.2026.1` and then `12.4.2026.2`. Each build takes the last one's count plus one, and the count starts at 1 each year. Each unstable build sorts after every stable release and after the builds before it.
* Only published pre-releases with a zip count, so a failed run takes no number.
* The run sets that version in `build.yaml` for its own build only. Nothing is committed.
* The notes list the commits since the last unstable build.
* A Friday run skips when the newest unstable build already holds the branch's last commit.
* Releases are immutable once published, so the run builds into a draft and publishes it after the zip is in. A draft left by a failed run is filled and published.

## When a Release Is Wrong

* Never edit or reuse a published version. Fix it in a new bug release.
* When a release breaks servers, publish the fix as the next bug release at once.
* When the manifest entry itself is wrong, run **Publish Plugin** by hand with the release tag after fixing the cause.

## Checklist

* [ ] The version follows `JJ.JJ.F.B`, and later parts are `0`.
* [ ] Stolon is released and referenced, with local copies deleted.
* [ ] The protocol and schema versions are raised when needed.
* [ ] `dotnet build`, `dotnet test`, and the JS tests pass on the released commit.
* [ ] The pool passes from `reset`, and the matrix when needed.
* [ ] Docs, screenshots, Versioning, and Architecture describe this release.
* [ ] `mkdocs build --strict` passes.
* [ ] The changelog lists only this release, in the four keys.
* [ ] The draft matches `build.yaml` before it is published.
* [ ] The manifest commit is pulled.
