<img src="https://raw.githubusercontent.com/siphonophore-org/siphonophore/main/brand/zooid/banner.svg" alt="Zooid: Part of the Siphonophore project" width="100%">

A Jellyfin plugin that keeps several Jellyfin servers in step. It syncs **Content**, **History**, **Metadata**, **People**, **Users**, and **Playlists** across servers, on a schedule and, between servers that both run the plugin, as changes happen.

## The Name

A [zooid](https://en.wikipedia.org/wiki/Zooid) is "an animal that is part of a colonial animal." A siphonophore is a colony of zooids that live and work as one, and each Jellyfin server running Zooid is one member of that colony.

## Documentation

Installation, setup, every sync type, and the API are covered in the **[Zooid documentation](https://siphonophore-org.github.io/zooid/)**.

Plugin repository URL for Jellyfin, from [Siphonophore](https://github.com/siphonophore-org/siphonophore), which also has an unstable channel:

```
https://repo.siphonophore.org/stable
```

## Use At Your Own Risk

This plugin modifies live data on your Jellyfin server. While extensively tested, I maintain this plugin for my personal use case and I do not account for every server configuration. **Always maintain backups of your Jellyfin data and configuration.** By using this plugin, you accept full responsibility for any data loss or issues that may occur.
