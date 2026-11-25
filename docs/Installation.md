# Installation

Zooid needs Jellyfin 12.4. Install it on every server that should push, sync, or link. A server that Zooid only pulls from can run plain Jellyfin.

## Add the Plugin Repository

1. Open Jellyfin and go to **Dashboard > Plugins > Repositories**.
2. Select **Add Repository**.
3. Enter this repository URL and select **Save**:

```
https://raw.githubusercontent.com/siphonophore-org/siphonophore/main/manifest.json
```

## Install the Plugin

1. Open the **Catalog** page in the Plugins section.
2. Find **Zooid** and select **Install**.
3. Wait for the installation to complete.

## Restart Jellyfin

Restart Jellyfin completely and wait for it to start.

## Check It Works

Open **Zooid** from the dashboard menu, or go to **Dashboard > Plugins > Zooid**. The Zooid page opens on its **Dashboard** tool.

Servers in a pool can run different Zooid versions as long as their protocols overlap. See [Versioning](Versioning.md).

Next: [Setup](Setup.md).
