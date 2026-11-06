<img src="nodes/Navidrome/navidrome.svg" width="90" align="right" alt="Navidrome" />

# n8n-nodes-navidrome-plus

n8n community node for [Navidrome](https://www.navidrome.org). It covers the Subsonic API
endpoints that Navidrome implements, library scans, and user management through Navidrome's
native API.

Tested with n8n 2.45 and Navidrome 0.64.2.

## Installation

**From npm:** in n8n open Settings → Community Nodes → Install and enter
`n8n-nodes-navidrome-plus`.

**Manual (Docker):** copy the tarball into the container, install it in `~/.n8n/nodes` and
restart n8n. Replace `n8n` with your container name.

```bash
docker cp n8n-nodes-navidrome-plus-0.3.0.tgz n8n:/tmp/
docker exec -it n8n sh -c "mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install --legacy-peer-deps /tmp/n8n-nodes-navidrome-plus-0.3.0.tgz"
docker restart n8n
```

`--legacy-peer-deps` is required: without it npm installs the `n8n-workflow` peer dependency,
whose native modules fail to build in the n8n image.

## Credentials

| Field | Description |
|---|---|
| Base URL | e.g. `https://music.example.com`. Include the sub-path if Navidrome runs under one. Use the final address: redirects are not followed. |
| Username | Navidrome username |
| Password | Navidrome password |

Subsonic requests use token authentication (`t = md5(password + salt)`, new salt per request);
the password is never sent in a URL. User management logs in to the native API with a POST
request, so use it only over HTTPS.

Some operations need an **administrator** account. For everything else a normal user is
enough, and it is the safer choice.

## Operations

| Resource | Operations | Admin |
|---|---|---|
| System | Ping, Get License, Get OpenSubsonic Extensions | |
| Browsing | Get Music Folders, Indexes, Music Directory, Genres, Artists, Artist, Album, Song, Artist Info, Album Info, Similar Songs, Top Songs | |
| Lists | Get Album List, Get Now Playing, Get Random Songs, Get Songs By Genre, Get Starred | |
| Search | Search | |
| Playlists | Get Many, Get, Create, Update, Delete | Update, Delete: owner |
| Favorites & Ratings | Star, Unstar, Set Rating, Scrobble | |
| Lyrics | Get Lyrics, Get Lyrics By Song ID | |
| Bookmarks & Play Queue | Get, Create, Delete Bookmark; Get, Save Play Queue | |
| Internet Radio | Get Many; Create, Update, Delete | write ops |
| Library | Get Scan Status; Start Scan (Quick or Full, optional Wait For Completion) | Start Scan |
| Users | Get, Get Many, Create, Update, Change Password, Delete | yes* |
| Custom Endpoint | Call any JSON Subsonic endpoint | depends |

\* Without admin rights only your own user is reachable: Get (by ID, or with Source = Subsonic),
Update and Change Password (by ID, if Navidrome's `EnableUserEditing` is on, the default).

List operations have a **Split Into Items** option (default on): one n8n item per element.
Lists are always returned as arrays, even when the server sends a single object.

### Get Now Playing

Always returns a single item. **Max Minutes Ago** (0 = no filter) ignores older entries.

```json
{
  "playing": true,
  "count": 1,
  "entries": [
    {
      "title": "Teardrop",
      "artist": "Massive Attack",
      "username": "alice",
      "minutesAgo": 2,
      "playerName": "Feishin",
      "state": "playing"
    }
  ]
}
```

`playing` is `true` when at least one entry remains after the filter, paused entries included.

### Custom Endpoint

Accepts `getGenres`, `getGenres.view`, `/rest/getGenres` or a full URL on the same server as
the Base URL. Authentication parameters (`u`, `p`, `t`, `s`) are ignored; the node adds its own
token authentication. The response is returned as sent, without list normalisation.

## Errors

Navidrome errors make the node fail with code and message, e.g.
`Navidrome error 70: Album not found (The requested item was not found.)`. With Continue On Fail the item outputs
`{ "error": "..." }`. Error messages never contain the password or tokens.

## Security

- Use HTTPS: over plain HTTP the Subsonic token can be intercepted and reused.
- Redirects are never followed, so credentials cannot reach another host.
- Every request times out after 30 seconds.
- The node can be used as an AI agent tool. Give an agent a non-admin credential unless it
  really needs to manage users, scans or radio stations.

## Not supported

- Binary endpoints (`stream`, `download`, `getCoverArt`, `getAvatar`, HLS), shares and jukebox
  control.
- Endpoints Navidrome does not implement: podcasts, chat, video, and the Subsonic user
  management endpoints (replaced by the native API).

## Development

```bash
npm install
npm run build
npm run lint
npm test
npm pack
```

## License

[MIT](./LICENSE)