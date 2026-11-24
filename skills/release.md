# Release

How to cut a release of this plugin, from the version number to the manifest every server reads.

## Versions

A version is `JJ.JJ.F.B`.

| Part | Means | Raise it when |
| :--- | :--- | :--- |
| `JJ.JJ` | The Jellyfin version the release targets, such as `12.4` | The plugin moves to a new Jellyfin version |
| `F` | The feature release | The release adds or changes behavior a user will notice |
| `B` | The bug release within that feature | The release only fixes bugs |

Raising a part sets every part after it to `0`. `12.4.13.2` becomes `12.4.14.0` for a feature and `12.4.13.3` for a fix.

## Branch

A feature release is cut on `unstable`, then **Sync Branches** with `promote` moves `main` to it. A bug release is cut on `main`, and the sync carries it to `unstable`. See [branches.md](branches.md).

## Before the Release

1. **Stolon.** When the release needs a Stolon change, release Stolon first with its **Release** workflow, then raise `Siphonophore.Stolon` in `Jellyfin.Plugin.Zooid/Jellyfin.Plugin.Zooid.csproj` and delete any local copy Stolon replaces. Wait until NuGet serves the version, and never release against a local package. Raise Stolon on a branch, and merge it once every check below has passed on it.
2. **Protocol.** When a hint, a peer route, or a conflict rule changed in a way an older server would misread, raise `HintProtocol.ProtocolVersion`. Raise `HintProtocol.MinProtocolVersion` only when this release can no longer talk to the protocol before it.
3. **Database.** When the schema changed, raise `SyncSchema.CurrentSchemaVersion`. Raise `SyncSchema.MinReaderVersion` only when a migration changes or removes something older releases rely on.
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

7. **Docs.** Every page describes this release. Retake any screenshot whose subject changed, and all of them when the Stolon version changed. Update [Versioning](../docs/Versioning.md) when the protocol, the schema reader, or the upgrade path changed, and [Architecture](../docs/Architecture.md) when the parts or their connections changed.

    ```bash
    mkdocs build --strict
    ```

8. **Review.** Run [review.md](review.md) over everything since the last release.

## Set the Release

Edit `build.yaml`.

1. Set `version` to the new version.
2. Replace the whole `changelog` with this release's entries. Each release lists only its own changes. See [documentation.md](documentation.md#release-notes) for how to write them.
3. Say in `changed` when the protocol changed, so a user knows to update every server in the pool.
4. Name the Stolon version in `developer` when it changed, such as "Uses Siphonophore.Stolon 12.4.2", with what it replaced locally.
5. Keep `description` and `overview` true for this release. The Siphonophore `plugins.json` holds the catalog's own copy, so update both together.

Commit it on its own.

```bash
git commit -am "Set the release to 12.4.14.0"
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

5. **Verify.** On a test server, add the repository URL, install the release from the catalog, restart, and open each tab.

## Unstable Build

A test build goes to the Siphonophore unstable manifest only. Set the version and changelog on `unstable` as above, push, then start **Release Unstable** from the Actions tab on `unstable`. It publishes `v<version>` as a pre-release and tells the Siphonophore repository. Running it again for the same version replaces the pre-release's zip. A version already drafted or released as stable is refused.

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
