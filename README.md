# Kawori-Bot

WhatsApp bot built on [Elaina Baileys](https://github.com/rexxzyid/elaina-baileys) (`@rexxhayanasi/elaina-baileys`, pinned to an exact version).

## Run
Needs Node 22.13+ and `ffmpeg`. For the extra features install (all optional, the bot starts without them):
- `tesseract-ocr` plus language data (`tesseract-ocr-ind`, `tesseract-ocr-eng`) for `/ocr`
- `yt-dlp` for `/dl`, and `gallery-dl` only if you want Instagram *photo* posts
```
npm install
# set "botNumber" in config.json (or BOT_NUMBER env) -> pairing code is printed on first start
npm start        # or: pm2 start ecosystem.config.js
```

## Troubleshooting
- **`405 Connection Failure` right after start:** WhatsApp rejects clients announcing an old Web version. The bot looks up the current one at startup (see `latestVersion()` in `src/core/connection.js`).
  To pin one by hand, add `"waVersion": [2, 3000, 1042466098]` to `config.json`; the last number is `client_revision` in https://web.whatsapp.com/sw.js.
- **`NNN reason` in the log** is the WhatsApp disconnect code: 401 logged out (delete `auth_info_baileys`), 428/408 network, 515 normal restart after pairing.

## Layout
```
src/
  index.js              entry point
  core/
    connection.js       WhatsApp socket, pairing, reconnect
    messageHandler.js   prefix parsing, owner guard, usage tracking, error handling
    context.js          builds the `ctx` object each command receives
    registry.js         loads src/commands/*.js (hot-reloads on file change)
    config.js           reads/writes config.json
    listeners.js        loads src/listeners/*.js
  commands/             one file per command
  listeners/            always-on features that look at every message (auto-read, anti-delete, /topdf collector)
  utils/                database, i18n, sticker/pdf/ocr/download helpers
```

## Converter commands
| Command | What it does |
|---|---|
| `/sticker` (`/s`) | Image/GIF/video -> sticker. `/s Pack \| Author` overrides the pack metadata |
| `/smeme top \| bottom` | Meme sticker with captions on the picture (send or reply to an image/video). Font size shrinks automatically for longer captions |
| `/cutmeme words` | "Cut-out words" meme: every word gets its own random font, colour, background and tilt, stacked beside the picture. `\|` starts a new row, `--right` puts the text on the right, `--img` sends a picture instead of a sticker |
| `/ttp text` | Text -> sticker |
| `/attp text` | Text -> animated rainbow sticker |
| `/toimg` | Reply to a (non-animated) sticker -> image |
| `/ocr [lang]` | Photo -> text (send with caption or reply). `/ocr en` also translates the result |
| `/topdf` | Photo (caption or reply) -> one-page PDF. Without a photo it starts collecting: send photos (bot reacts ✅), then `/topdf done` (A4 pages) or `/topdf done fit`; `/topdf cancel` to stop. Max 30 photos / 15 MB, expires after 10 min |

Fonts live in `assets/fonts` (all SIL Open Font License; licenses alongside). `/smeme` and `/ttp` use Anton.
After adding or replacing a font, run `python3 scripts/gen-font-widths.py` to regenerate the size tables in `assets/fonts/widths`. Requires `ffmpeg` with libfreetype and libwebp.

## Downloader
`/dl <link>` (aliases `/tt`, `/ig`, `/fb`; also works when replying to a message containing a link).
- **TikTok**: video without watermark (if TikTok only offers the stamped file, the bot says so)
- **Instagram**: posts (photos and/or videos) and reels. Stories/profiles are not supported
- **Facebook**: videos and reels

Limits are in `config.json` under `downloader` (defaults: one download at a time, 720p max, 10 min, 100 MB, 30 s cooldown per user, owner exempt, 3 min timeout). Files are not re-encoded and temp files are deleted right after sending. `/updatedl` (owner) updates yt-dlp, do this whenever a site stops working.
Instagram often asks for a login: export your cookies in Netscape format to a file and set `downloader.cookiesFile`. Use a spare account, not your main one.

## Group / owner features
| Command | What it does |
|---|---|
| `/antidelete on\|off\|status` | Groups only. Re-posts messages deleted for everyone into the same group. On: group admins and owners. Off: owners only. Keeps text 24 h, photos/videos/voice 12 h (max 10 MB); view-once is never saved. Settings under `antiDelete` |
| `/autoread on\|off` | Owner only. Marks all incoming messages as read (blue ticks), default on |

## Updating from GitHub (owner only)
| Command | What it does |
|---|---|
| `/update check` | Shows new commits waiting on GitHub |
| `/update` | `git pull`, `npm install` if `package.json` changed, then restarts if the change needs it (changes to `src/commands/` and `assets/` apply instantly, no restart) |
| `/update auto on\|off` | Checks GitHub every 10 min (`autoUpdate.intervalMin`) and updates by itself, then messages the first owner |
| `/restart` | Restarts the bot |
| `/info` (everyone), `/sysinfo` (owner) | Version, uptime, response time / CPU, RAM, disk, tool versions, feature status |

How it stays safe: it only fast-forwards (never overwrites your edits on the server), refuses code with syntax errors, and if a new version cannot start twice in a row it rolls back to the previous commit and tells you.

**Setup on the VPS** (once):
1. `git clone` your repo (`https://` for a public repo, or an SSH deploy key for a private one) and make sure `git pull` works there without asking for a password.
2. Run the bot under a supervisor, otherwise it cannot come back after a restart: `npm i -g pm2 && pm2 start ecosystem.config.js && pm2 save && pm2 startup`. Without pm2: `npm run loop`.
3. `config.json` is edited by the bot itself (`/prefix`, `/setwm`, ...). That is fine, local changes to it are kept during updates. Do not edit other tracked files on the server, update would refuse to run.

## Adding a command
Drop a file in `src/commands/`. No restart or other edits needed.
```js
module.exports = {
    name: 'hello',
    aliases: ['hi'],           // optional
    category: 'Others',        // groups it in !menu
    description: 'Say hello',  // shown in !menu (commands without one are hidden)
    ownerOnly: false,          // true = only config.ownerNumbers may run it
    async execute(ctx) {
        await ctx.replyT('Halo!'); // replyT auto-translates to the chat language; reply() sends as-is
    }
};
```
`ctx` has: `reply`, `replyT`, `send(content)`, `t(text)`, `args`, `prefix`, `jid`, `sender`,
`isOwner`, `config`, `commands`, plus raw `sock` and `msg`.
