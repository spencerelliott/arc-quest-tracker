# Arc Quest Planner

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
- **Links to ArcTracker.** Each quest links to its page on arctracker.io, where you can mark it
  complete. The ArcTracker API is read-only, so this app can't mark quests complete itself.
  Click **Refresh** afterwards to update the list.

## Using it

1. In ArcTracker, go to **Settings → Developer Access** and create a user key (`arc_u1_…`)
   with the `quests:read` scope.
2. Open the app, click the ⚙️ button, paste your user key, and click **Save**.

Your user key is stored only in your browser's `localStorage` and is sent only to
`arctracker.io`.

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
| `build-config.sh` | Writes `config.js` from the `ARC_APP_KEY` environment variable |
| `netlify.toml` | Netlify build settings (runs `build-config.sh`, publishes the repository root) |
| `_redirects` | Netlify rule that sets up the `/arc-api/*` proxy |
| `dev-server.py` | Local server: provides the proxy and serves `config.js` from `.env` |
| `.env.example` | Template for your local `.env` |

`config.js` and `.env` are generated or personal, so they're in `.gitignore` and never committed.

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

Drag-and-drop deploys skip the build step, so create `config.js` yourself first:

```bash
ARC_APP_KEY=arc_k1_your_app_key sh build-config.sh
```

Then in Netlify choose **Add new site → Deploy manually** and drag the project folder onto the
upload area. Check that `config.js` and `_redirects` are included.

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

## Troubleshooting

- **"This site has no ArcTracker app key configured"**: `config.js` is missing or its
  `appKey` is empty. On Netlify, set `ARC_APP_KEY` and redeploy. Locally, check `.env`.

- **"Couldn't load /quests…"**: the `/arc-api` proxy isn't available. Use `dev-server.py`
  locally, or check that `_redirects` was deployed.
- **"Invalid user key" or 401/403 errors**: check your user key in Settings and make sure it
  has the `quests:read` scope.
- **429 errors**: the app's shared rate limit is used up. Wait for it to reset; the limit is
  per hour.
- **No quests, or progress looks wrong**: ArcTracker doesn't document the format of the progress
  response, so the app handles several likely formats. Open **Settings → Debug** to see the raw
  response and compare it with `loadProgress()` in `app.js`.
