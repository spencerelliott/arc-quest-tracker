# ARC Quests

A small web app for ARC Raiders players that shows which map to play next. It uses the
[ArcTracker API](https://arctracker.io/developers/docs) to load your quest progress, then groups
your active quests by the map they take place on, with the busiest map first.

It's a static site (HTML, CSS and plain JavaScript) with no backend. The only build step is a
small script that writes the app key into `config.js`. Anyone can host their own copy on
Netlify with their own ArcTracker app key; see [Host your own copy](#host-your-own-copy).

## Features

- **Maps ranked by priority.** Maps with more active quests come first. Ties go to the map with
  more quests you can only do there, then to the map with more open steps. Quests that work on
  any map are listed last.
- **Quest details.** Each quest shows its trader, every step, items to deliver, other
  requirements, and a badge for any other maps it's on. A quest on several maps appears under
  each of them.
- **Only quests you can do now.** A quest is *active* if it isn't completed and every quest
  that unlocks it is done. You can also show locked quests in Settings.
- **Collapsible sections.** Any map or quest can be collapsed, and the app remembers what you
  collapsed.
- **Works on phones and tablets.** The layout adapts to small screens, and you can add the app
  to your home screen, where it opens full-screen as "ARC Quests" with its own icon.
- **Guide lookup.** Each quest has a **Look up guide** link that opens a Google search for
  "Arc Raiders *quest name* guide" in a new tab.
- **Link to ArcTracker.** The **ArcTracker** button in the header opens your quest tracker on
  arctracker.io, where you can mark quests complete. The ArcTracker API is read-only, so this
  app can't mark quests complete itself. Click **Refresh** afterwards to update the list.

## Using it

To load your quests, the app needs a user API key from your ArcTracker account.

### Create your ArcTracker user key

1. Sign in at [arctracker.io](https://arctracker.io) and open
   [Settings](https://arctracker.io/settings).
2. Scroll down to the **Developer Access** section and click **Create API Key**.
3. Under **Key Name**, enter a name you'll recognise, such as `ARC Quests`.
4. Under **Data Scopes**, tick **Quests** only. **Profile** is ticked by default, so untick it.
   This app only reads your quest progress and doesn't need any other data.
5. Click **Create Key** and copy the key it shows you. It starts with `arc_u1_`. Keep it
   somewhere safe in case you need to enter it again.

You can delete the key at any time from the same **Developer Access** section, using the bin
icon next to it. The app then stops being able to read your progress.

### Add the key to the app

1. Open the app and click the ⚙️ button.
2. Paste your key into **User key** and click **Save**.

Your user key is stored only in your browser's `localStorage` and is sent only to
`arctracker.io`.

### Add it to your home screen

- **iPhone or iPad (Safari):** tap the Share button, then **Add to Home Screen**.
- **Android (Chrome):** open the ⋮ menu and tap **Add to Home screen** or **Install app**.

It opens full-screen as "ARC Quests", like a regular app. It still needs an internet connection
to load quest data. Your user key is saved separately for the home-screen app on iPhone, so you
may need to enter it again there.

### About the app key

ArcTracker's user-data endpoints need two keys: the visitor's user key and an app key
(`arc_k1_…`) that identifies the site. The app key isn't stored in this repository. Each copy of
the site supplies its own through the `ARC_APP_KEY` environment variable, and it's written into
`config.js` when the site is built.

Anyone can see the app key in the page source, because the browser has to send it. That's normal
for a browser app, but don't reuse the key anywhere you need it kept secret.

Everyone using a copy of the site shares its app key's rate limit, which defaults to **500
requests per hour**. Each page load or Refresh uses 2.

## How it works

| Data | Endpoint | Called via |
|------|----------|------------|
| Quest details (names, maps, steps) | `GET /api/quests` (public) | Same-origin proxy at `/arc-api/*` |
| Your progress | `GET /api/v2/user/quests?filter=completed` and `?filter=incomplete` | Directly from the browser |

The public `/api/quests` endpoint doesn't send CORS headers, so browsers block direct requests
to it. The app requests it from `/arc-api/quests` instead, and Netlify forwards that to
ArcTracker (see [_redirects](_redirects)). The quest list is cached in `localStorage` for 12
hours; **Refresh** reloads it.

The user endpoints do allow direct browser requests, so the app calls them directly and your
keys never pass through the proxy.

### Files

| File | Purpose |
|------|---------|
| `index.html` | Page layout and the settings window |
| `styles.css` | Styles |
| `app.js` | API calls, map grouping and ranking, rendering |
| `build-config.sh` | Writes `config.js` from `ARC_APP_KEY`; `--package` also builds a drag-and-drop deploy in `dist/` |
| `build-config.ps1` | Windows (PowerShell) version of `build-config.sh` |
| `netlify.toml` | Netlify build settings (runs `build-config.sh`, publishes the repository root) |
| `_redirects` | Netlify rule that sets up the `/arc-api/*` proxy |
| `_headers` | Netlify headers so `sw.js` and `config.js` are always rechecked for updates |
| `manifest.webmanifest` | Home-screen name, icons and colours |
| `sw.js` | Service worker that makes the app installable and caches the page files |
| `icons/` | App icons; `icon.svg` is the source for the PNG sizes |
| `dev-server.py` | Local server: provides the proxy and serves `config.js` from `.env` |
| `.env.example` | Template for your local `.env` |

`config.js`, `dist/` and `.env` are generated or personal, so they're in `.gitignore` and never committed.

## Host your own copy

You need a free [Netlify](https://www.netlify.com) account and an ArcTracker app key.

### 1. Get an ArcTracker app key

Sign in to ArcTracker, open the Developer Dashboard (see the
[developer docs](https://arctracker.io/developers/docs)), and create an app. Copy its app key
(`arc_k1_…`).

### 2. Deploy to Netlify

#### Option A: from a Git repository (recommended)

1. Fork or copy this repository to your GitHub, GitLab or Bitbucket account.
2. In Netlify, choose **Add new site → Import an existing project** and pick the repository.
   Netlify reads the build settings from `netlify.toml`, so leave them as they are.
3. Before deploying, click **Add environment variables** and add:
   - **Key:** `ARC_APP_KEY`
   - **Value:** your app key
4. Click **Deploy**. Every later push to your deploy branch redeploys the site.

If you skipped step 3, add the variable afterwards under **Site configuration → Environment
variables**, then go to **Deploys → Trigger deploy → Deploy site**. The variable only takes
effect on the next deploy.

#### Option B: Netlify CLI

```bash
npx netlify-cli login
```

```bash
npx netlify-cli init
```

```bash
npx netlify-cli env:set ARC_APP_KEY arc_k1_your_app_key
```

```bash
npx netlify-cli deploy --build --prod
```

`--build` runs `build-config.sh` using the site's environment variables before uploading.

#### Option C: drag and drop

A drag-and-drop deploy doesn't use Netlify's environment variables, so the build script puts
your app key into the files before you upload them. It reads `ARC_APP_KEY` from the
environment, or from a `.env` file (see [Running locally](#running-locally)).

**macOS or Linux:**

```bash
sh build-config.sh --package
```

**Windows (PowerShell):**

```powershell
powershell -ExecutionPolicy Bypass -File .\build-config.ps1 -Package
```

Both commands create:

- `dist/site/`: the files to upload. Drag this **folder** onto the deploy area in Netlify
  (**Add new site → Deploy manually** for a new site, or the bottom of the site's **Deploys**
  page to update it). Netlify's drag-and-drop needs a folder; it doesn't accept a zip.
- `dist/arc-quests.zip`: the same files as a zip, for hosts or tools that take a zip upload.

The package leaves out `netlify.toml` on purpose. If it were included, Netlify would run the
build again when you're signed in and replace `config.js` with an empty key.

To use a different key for one build, set it on the command line instead of in `.env`:

```bash
ARC_APP_KEY=arc_k1_your_app_key sh build-config.sh --package
```

```powershell
$env:ARC_APP_KEY = "arc_k1_your_app_key"; .\build-config.ps1 -Package
```

### 3. Check the deploy

- Open `https://<your-site>.netlify.app/config.js`. It should contain your app key. If
  `appKey` is empty, `ARC_APP_KEY` wasn't set when the site was built; set it and redeploy.
- Open `https://<your-site>.netlify.app/arc-api/quests`. You should see JSON quest data. If
  you get a 404 page instead, `_redirects` wasn't deployed.
- Open the site, click ⚙️, and enter your user key.

## Running locally

Python 3 is required; nothing else needs installing.

1. Copy `.env.example` to `.env` and put your app key in it:

   ```bash
   cp .env.example .env
   ```

2. Start the dev server:

   ```bash
   python3 dev-server.py
   ```

3. Open http://localhost:8080.

The dev server provides the `/arc-api` proxy and generates `config.js` from `.env` as it's
requested, so you don't need to run `build-config.sh` locally. Pass a different port as an
argument if you need one (`python3 dev-server.py 3000`).

Opening `index.html` directly from disk (`file://`) won't work, because the quest list needs the
proxy.

## Changing the app icon

Edit `icons/icon.svg`, then regenerate the PNG sizes. On macOS:

```bash
cd icons && for s in 512 192; do sips -s format png -z $s $s icon.svg --out icon-$s.png; done && sips -s format png -z 180 180 icon.svg --out apple-touch-icon.png && sips -s format png -z 32 32 icon.svg --out favicon-32.png
```

Keep the important part of the design within the middle 80% of the square, because Android
crops the edges of home-screen icons. Phones cache home-screen icons, so you may need to remove
the app from the home screen and add it again to see a new one.

## Troubleshooting

- **"This site has no ArcTracker app key configured"**: `config.js` is missing or its
  `appKey` is empty. On Netlify, set `ARC_APP_KEY` and redeploy. Locally, check `.env`.

- **"Couldn't load /quests…"**: the `/arc-api` proxy isn't available. Use `dev-server.py`
  locally, or check that `_redirects` was deployed.
- **"Invalid user key" or 401/403 errors**: check the key you pasted into Settings, and check
  in ArcTracker that the key has the **Quests** scope. If not, create a new key with **Quests**
  ticked.
- **429 errors**: the app's shared rate limit is used up. Wait for it to reset; the limit is
  per hour.
- **The app still shows an old version after a deploy**: the service worker fetches fresh files
  whenever you're online, so closing and reopening the app should fix it. If it doesn't, change
  `CACHE` in `sw.js` (for example to `arc-quests-v2`) and redeploy.
- **No quests, or progress looks wrong**: ArcTracker doesn't document the format of the progress
  response, so the app handles several likely formats. Open **Settings → Debug** to see the raw
  response and compare it with `loadProgress()` in `app.js`.
