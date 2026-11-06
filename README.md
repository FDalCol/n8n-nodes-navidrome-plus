<img src="nodes/Navidrome/navidrome.svg" width="90" align="right" alt="Navidrome" />

# n8n-nodes-navidrome-plus

n8n community node for [Navidrome](https://www.navidrome.org). It uses the Subsonic API
endpoints that Navidrome implements: browsing, lists, now playing, search, playlists,
favorites, ratings, scrobbling, lyrics, bookmarks, play queue, internet radio and library
scans. A Custom Endpoint operation covers other JSON endpoints. User management uses
Navidrome's native API.

Fork of [`n8n-nodes-navidrome`](https://github.com/Izakun/n8n-nodes-navidrome) by Alan Carrer
(Izakun), MIT license. The original copyright notice is kept in [LICENSE](./LICENSE).

## Differences from the original package

| | `n8n-nodes-navidrome` | `n8n-nodes-navidrome-plus` |
|---|---|---|
| Scope | 5 operations (ping, search, album list, artists, starred) | 12 resources, 50 operations |
| Credential test | Password in clear text in the query string (`p=`) | Token authentication (`t`, `s`); the password never appears in a URL |
| Output | Raw `subsonic-response` | Payload only; lists always arrays; optional split into items |
| Errors | Generic API error | Navidrome code and message (`Navidrome error 70: …`); Continue On Fail |
| Users | – | Native API get, list, create, update, password, delete; Subsonic `getUser`/`getUsers` as alternative source |
| Library scans | – | Quick or full scan, optional wait for completion with timeout |
| Credential type | `navidromeApi` | `navidromePlusApi`; both packages can be installed side by side |

## Installation

### From npm

In n8n open Settings → Community Nodes → Install and enter `n8n-nodes-navidrome-plus`.
See the [n8n documentation](https://docs.n8n.io/integrations/community-nodes/installation/).

### Manual installation in Docker

Build the tarball with `npm pack` or download it. Install it into `~/.n8n/nodes` of the n8n
user inside the container, then restart n8n. In the official image the directory is
`/home/node/.n8n/nodes`. It survives container re-creation if `/home/node/.n8n` is a volume.

```bash
docker cp n8n-nodes-navidrome-plus-0.3.0.tgz n8n:/home/node/
```

```bash
docker exec -it n8n sh -c "mkdir -p ~/.n8n/nodes && cd ~/.n8n/nodes && npm install --legacy-peer-deps /home/node/n8n-nodes-navidrome-plus-0.3.0.tgz"
```

```bash
docker restart n8n
```

`--legacy-peer-deps` is required. Without it npm also installs the `n8n-workflow` peer
dependency, which pulls in `isolated-vm`. That native module needs Python and a C++ toolchain
and fails to build in the n8n image. The node uses the `n8n-workflow` bundled with n8n.

Replace `n8n` with the container name. After the restart the node is listed as
Navidrome (Plus).

## Credentials: Navidrome API (Plus)

| Field | Description |
|---|---|
| Base URL | Server address, e.g. `https://music.example.com` or `http://navidrome:4533`. Include the `BasePath` if Navidrome runs under a sub-path. Trailing slashes are removed. |
| Username | Navidrome username. |
| Password | Navidrome password. |

Use of the credential:

- Subsonic API (`/rest/*`): each request gets a random 8-byte salt `s` and the token
  `t = md5(password + s)`, sent with `u`, `v=1.16.1`, `c=n8n`, `f=json`. The password is never
  sent, also not by the credential test.
- Native API (`/api/*`): used only by the Users operations; for Get and Get Many only with
  Source = Native API. The node logs in once per execution with `POST /auth/login` and sends the
  JWT as `x-nd-authorization: Bearer <token>` for all items.
- Test button: authenticated `/rest/ping`. It succeeds only if `subsonic-response.status` is
  `"ok"`.

The native API login sends username and password in a POST body. Create User and Change
Password send the new password the same way. Use these operations only with Navidrome on HTTPS
or on a trusted network.

Token authentication requires Navidrome's own user database. Users authenticated by an external
reverse proxy may get Subsonic error 41.

## Resources and operations

Admin: requires a Navidrome administrator account. Otherwise Navidrome returns error 50, or
HTTP 403 on the native API.

| Resource | Operation | API | Admin |
|---|---|---|---|
| System | Ping | `ping` | |
| | Get License | `getLicense` | |
| | Get OpenSubsonic Extensions | `getOpenSubsonicExtensions` | |
| Browsing | Get Music Folders | `getMusicFolders` | |
| | Get Indexes | `getIndexes` | |
| | Get Music Directory | `getMusicDirectory` | |
| | Get Genres | `getGenres` | |
| | Get Artists | `getArtists` | |
| | Get Artist | `getArtist` | |
| | Get Album | `getAlbum` | |
| | Get Song | `getSong` | |
| | Get Artist Info | `getArtistInfo2` | |
| | Get Album Info | `getAlbumInfo2` | |
| | Get Similar Songs | `getSimilarSongs` | |
| | Get Top Songs (by artist name, or by ID via `topSongsByArtistId`) | `getTopSongs` | |
| Lists (default resource) | Get Album List (type, size, offset, year range, genre, music folder) | `getAlbumList2` | |
| | Get Now Playing (Max Minutes Ago filter) | `getNowPlaying` | |
| | Get Random Songs | `getRandomSongs` | |
| | Get Songs By Genre | `getSongsByGenre` | |
| | Get Starred | `getStarred2` | |
| Search | Search (separate count and offset for artists, albums, songs) | `search3` | |
| Playlists | Get Many, Get | `getPlaylists`, `getPlaylist` | |
| | Create | `createPlaylist` | |
| | Update (name, comment, public, add songs, remove songs by index) | `updatePlaylist` | owner |
| | Delete | `deletePlaylist` | owner |
| Favorites & Ratings | Star, Unstar (song, album or artist) | `star`, `unstar` | |
| | Set Rating (0-5, 0 removes) | `setRating` | |
| | Scrobble (submission or now playing, optional timestamp) | `scrobble` | |
| Lyrics | Get Lyrics (artist and title) | `getLyrics` | |
| | Get Lyrics By Song ID (OpenSubsonic `songLyrics`) | `getLyricsBySongId` | |
| Bookmarks & Play Queue | Get Bookmarks, Create Bookmark, Delete Bookmark | `getBookmarks`, `createBookmark`, `deleteBookmark` | |
| | Get Play Queue, Save Play Queue | `getPlayQueue`, `savePlayQueue` | |
| Internet Radio | Get Many | `getInternetRadioStations` | |
| | Create, Update, Delete | `create/update/deleteInternetRadioStation` | yes |
| Library | Get Scan Status | `getScanStatus` | |
| | Start Scan: Quick (new and modified files) or Full (`fullScan=true`); optional Wait For Completion (poll interval, timeout) | `startScan`, `getScanStatus` | yes |
| Users | Get, Source = Native API (default): by username or ID | `GET /api/user/{id}`; `GET /api/user` to resolve a username | yes¹ |
| | Get, Source = Subsonic: roles of the authenticated user | `getUser` | |
| | Get Many, Source = Native API (default): Return All or Limit, sort | `GET /api/user` (`_start`, `_end`, `_sort`, `_order`) | yes |
| | Get Many, Source = Subsonic | `getUsers` | yes |
| | Create | `POST /api/user` | yes |
| | Update (username, name, email, admin flag) | `GET` and `PUT /api/user/{id}` | yes |
| | Change Password | `GET` and `PUT /api/user/{id}` | yes |
| | Delete | `DELETE /api/user/{id}` | yes |
| Custom Endpoint | Call | any JSON Subsonic endpoint | depends |

¹ A non-admin user can read only their own record, and only by ID: resolving a username lists
all users, which requires an admin. Without an admin account use Source = Subsonic for Get.

### Notes

Users, Source (Get and Get Many):

- Native API (default) returns full records with IDs (`id`, `userName`, `name`, `email`,
  `isAdmin`, `lastLoginAt`, …). Use it with an administrator account.
- Subsonic is the alternative without admin rights. `getUser` only accepts the username of the
  authenticated user; other names fail with error 50. It returns roles, not IDs.
- Navidrome restricts `getUsers` to administrators and returns only the authenticated user.
  Get Many therefore needs an admin account with either source.

Users, native API:

- Get, Update, Change Password and Delete select the user by username (case-insensitive,
  resolved to its ID by listing users) or by ID.
- Navidrome's `PUT` replaces the whole record. The node reads the user first and changes only
  the fields that are set.
- Change Password needs Current Password only when the credential's user changes their own
  password.
- Paths, methods and fields are taken from `server/nativeapi/native_api.go`, `server/auth.go`
  and `persistence/user_repository.go` (Navidrome v0.64.2).

Library, Start Scan, Wait For Completion: polls `getScanStatus` every Poll Interval seconds
until `scanning` is `false`. The output is the final status plus `waitedForCompletion`,
`waitedSeconds` and `statusChecks`. When Timeout is reached the node fails; the scan continues
on the server.

Custom Endpoint:

- The endpoint can be `getAlbumList2`, `getAlbumList2.view`, `/rest/getAlbumList2` or a full
  URL.
- A full URL must have the same protocol, host and port as the Base URL, no user info, query
  string or fragment, and the path `<Base URL path>/rest/<endpoint>`. Otherwise the node fails
  before sending anything.
- Endpoint names contain letters and digits only. `../`, encoded dots and extra path segments
  are rejected.
- Query parameters are name/value pairs. Names contain letters, digits and underscores. A
  repeated name sends multiple values. Values are URL-encoded.
- `u`, `p`, `t` and `s` are ignored; the node handles authentication. `v`, `c` and `f` are
  always set by the node.
- Binary endpoints and shares are rejected (see Excluded endpoints).
- The response is returned without the Subsonic envelope and without list normalisation.

### Get Now Playing

Always returns one item, regardless of Split Into Items:

```json
{
  "playing": true,
  "count": 2,
  "entries": [
    {
      "id": "3b8f0c2e9a…",
      "title": "Paranoid Android",
      "artist": "Radiohead",
      "album": "OK Computer",
      "duration": 387,
      "username": "alice",
      "minutesAgo": 0,
      "playerId": 1,
      "playerName": "Feishin",
      "state": "playing"
    },
    {
      "id": "c41d77a0b2…",
      "title": "Teardrop",
      "artist": "Massive Attack",
      "username": "bob",
      "minutesAgo": 4,
      "playerId": 3,
      "state": "playing"
    }
  ]
}
```

Max Minutes Ago (`maxMinutesAgo`, default `0` = no filter) keeps entries whose `minutesAgo` is
less than or equal to the value. `playing` is `true` when at least one entry remains. Lists is
the default resource, so a node with only `operation: getNowPlaying` (and optionally
`maxMinutesAgo`) works without a `resource` parameter.

### Output

- Operations return the payload without the Subsonic envelope (`status`, `version`, `type`,
  `serverVersion`, `openSubsonic`). Ping returns exactly those fields.
- Lists defined by the Subsonic specification are always arrays, also when the server returns a
  single object or omits the key (e.g. `album.song`, `playlist.entry`,
  `searchResult3.artist/album/song`, `structuredLyrics[].line`).
- Split Into Items (default: on) is available on list operations and outputs one item per
  element. Search and Get Starred items have `resultType` (`artist`, `album`, `song`). Get
  Artists and Get Indexes output one item per artist with its `index` letter. With the option
  off, one item contains the whole list.
- Write operations without a response body return `{ "success": true, ... }` with the
  identifiers involved.

### Errors

- `subsonic-response.status === "failed"` becomes a `NodeOperationError`, e.g.
  `Navidrome error 50: User not authorized (… requires an administrator account)`.
- Native API 401/403: "an administrator account is required to manage users". A failed login
  is reported as invalid credentials and not retried for the other items.
- With Continue On Fail, failed items output `{ "error": "<message>" }` and keep their
  `pairedItem` link.

### Use as an AI agent tool

The node sets `usableAsTool: true`. Descriptions of write operations (create, update, delete,
star, rating, scrobble, scan, password, user management, custom endpoint) state what they
change, whether they are irreversible and whether they need an admin account.

An agent can only reach the Navidrome server of the credential; the Custom Endpoint checks apply
to its inputs. With an administrator credential, an agent or a prompt injection reaching it
could promote users to admin, change passwords, delete users and playlists, start scans or edit
radio stations. Recommended: a non-admin credential unless the agent must manage users, scans
or radio stations; only the needed operations exposed as tools; human approval for write
operations where the n8n setup allows it.

## Security

- Redirects are never followed (Subsonic, native API, credential test). The token, the JWT and
  the login body cannot reach another host. If the server redirects (e.g. `http://` to
  `https://`), the node fails and asks for the final address as Base URL.
- Error messages are redacted, including Continue On Fail items and n8n's error details. The
  password, `t`, `s`, the JWT, new user passwords and request query strings are removed. Server
  error bodies are truncated. User records in the output never contain password fields.
- Every HTTP request times out after 30 seconds. Scan polling is at least 1 second apart and
  waits at most 24 hours, also when expressions set other values. User listing stops when the
  server ignores paging and after at most 1000 pages.
- The Base URL must be `http://` or `https://`, without user info, query string or fragment.
- Use HTTPS. Over plain HTTP the Subsonic `t`/`s` pair travels unencrypted and can be replayed,
  and the native API sends passwords in clear text.

## Excluded endpoints

Checked against the [Navidrome Subsonic compatibility page](https://www.navidrome.org/docs/developers/subsonic-api/)
and the source of Navidrome v0.64.2 (`server/subsonic/api.go`, `server/nativeapi`). These
endpoints are not exposed. Custom Endpoint also rejects the binary and share endpoints.

| Endpoints | Reason |
|---|---|
| `stream`, `download`, `getCoverArt`, `getAvatar`, `getTranscodeStream`, `hls` | Binary files or streams; not needed in this version. |
| `getShares`, `createShare`, `updateShare`, `deleteShare` | Out of scope for this version; only available with `EnableSharing`. |
| `getPodcasts`, `getNewestPodcasts`, `refreshPodcasts`, `createPodcastChannel`, `deletePodcastChannel`, `deletePodcastEpisode`, `downloadPodcastEpisode` | Not implemented by Navidrome (HTTP 501). |
| `createUser`, `updateUser`, `deleteUser`, `changePassword` | Not implemented by Navidrome (HTTP 501); Users uses the native API. |
| `search`, `getChatMessages`, `addChatMessage`, `getVideos`, `getVideoInfo`, `getCaptions` | Deprecated or out of scope in Navidrome (HTTP 410). |
| `jukeboxControl` | Only available with the jukebox enabled; controls server-side playback. |
| `getTranscodeDecision`, `reportPlayback` | Client playback negotiation and live player state; Scrobble covers play reporting. |
| `search2`, `getAlbumList`, `getStarred`, `getArtistInfo`, `getAlbumInfo`, `getSimilarSongs2` | Folder-based or duplicate variants. The node uses the ID3 variants and `getSimilarSongs`, which accepts song, album or artist IDs. Reachable through Custom Endpoint. |
| `getPlayQueueByIndex`, `savePlayQueueByIndex` | Index-based duplicates of Get/Save Play Queue. Reachable through Custom Endpoint. |
| `getSonicSimilarTracks`, `findSonicPath` | Only available with a sonic-similarity plugin. Reachable through Custom Endpoint. |

Other Navidrome behaviour:

- `getIndexes` and `getMusicDirectory` return a simulated folder tree. In `getIndexes`,
  `shortcut` and `child` are always empty arrays.
- Artist Info, Album Info, Similar Songs and Top Songs need external agents such as Last.fm.
- Get Playlists ignores the `username` parameter.

## Requirements

- Node.js 18.10 or later, n8n 1.x (`n8n-workflow` peer dependency).
- No runtime dependencies: hashing uses Node's `crypto`, HTTP uses `this.helpers.httpRequest`.

## Development

```bash
npm install
npm run build   # n8n-node build, output in dist/
npm run lint    # n8n-node lint (eslint with the n8n community rules)
npm test        # vitest (test/*.test.mts) against a fake Navidrome HTTP server
npm pack        # tarball with dist/, index.js, README.md, LICENSE, package.json
```

The fake server verifies `t = md5(password + s)` and `v`/`c`/`f`, rejects Subsonic requests
containing `p`, and serves `/auth/login` and `/api/user`. It records protocol violations; each
test asserts there are none.

Source layout:

```
credentials/NavidromePlusApi.credentials.ts
nodes/Navidrome/Navidrome.node.ts          node description, credential test, execute loop
nodes/Navidrome/transport/subsonic.ts      Subsonic authentication and requests
nodes/Navidrome/transport/nativeApi.ts     native API login and requests
nodes/Navidrome/transport/security.ts      redaction, timeouts, redirect and URL checks
nodes/Navidrome/shared/                    normalisation, split, shared fields
nodes/Navidrome/resources/<resource>/      description.ts and execute.ts per resource
test/                                      vitest suite and fake Navidrome server
```

## License

[MIT](./LICENSE). © 2026 Alan Carrer (Izakun), original project; © 2026 FDalCol, fork.
