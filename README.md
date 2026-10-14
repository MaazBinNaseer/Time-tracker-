# Tempo: a time tracker (online edition)

Track what you work on, per project, and see where your time went. Inspired by Toggl Track and Jibble.

This is the **online edition**: it runs as a website on [Vercel](https://vercel.com), with nothing to install. Each person chooses where their time is kept:

- **Online account:** sign in with a username and password; data lives in a free cloud database ([Upstash Redis](https://upstash.com)), so you see the same timers at the office, at home and on your phone.
- **A folder on this computer:** no account; the browser saves your data as a file in a folder you pick and nothing is sent to the server. Pick a folder inside OneDrive, Google Drive or Dropbox to sync it between computers. (Edge or Chrome on a computer.) (The offline edition, which runs on your own computer, lives in `time-tracker`.)

**The rule that makes it different:** if you work on a project several times in one day (morning, after lunch, evening), the Timer page and the dashboard show **one row with the day's total** for that project. The individual sessions are still there: click the row to expand them.

## What's inside

| Page | What it does |
|---|---|
| **Timer** | Start/stop bar at the top. Pressing play opens a form: **project**, **project code**, **activity**, **type of work** (Office work, Fieldwork, Travel, Meeting, Admin, Training, Leave, Other; you can change the list), **billable yes/no**, and **date, start time, end time, hours**. Leave the end empty to start a live timer (you can set the start earlier, e.g. 8:00, if you forgot to press play). Fill the end time or the hours to log a finished session; changing one updates the other. Pressing stop opens the same form with the end set to now, so you can correct it before saving. Below it, every day lists each project once with its total; expand to see, edit or delete sessions. "Add time" lets you log time you forgot to track. |
| **Calendar** | Switch between **Day**, **Week** and **Month** views, with arrows to move back and forward and a "Today" button. *Day*: your sessions as blocks on an hour grid (click one to edit; **drag on an empty part of the grid to add time** for that span, snapped to 15 minutes), plus each project's total for that day. *Week*: a timesheet with projects as rows and Mon to Sun as columns (press **Edit hours** or double-click a time to change it; more time stretches that day's last session, less time trims from the end, an empty box gets a new session), daily and weekly totals, busiest day and the change versus last week. *Month*: a calendar grid where each day shows its total and one line per project; click a day to open it. Every view ends with a "Projects this day/week/month" summary: total, share, how many sessions or days, and the tasks behind the hours. |
| **Dashboard** | Pick a range (this week, last 7/30 days, this month). Stacked bar chart of hours per day by project, donut of the project split, a **Type of work** heatmap (rows are types, columns are days, darker means more hours; a menu narrows it to one project), and daily totals. |
| **Projects** | Create, rename, recolour, set a project code, a client and whether new sessions are billable by default; archive or delete. Shows this week's and all-time totals. |
| **Settings** | **Appearance**: light, dark, or match your computer (the sun/moon button next to the play button switches quickly). Change your password and sign out. Admins also get **Users**: add people, reset a forgotten password, make someone admin, or remove an account. **Types of work**: rename, recolour, add or remove types, give each a hint, and choose whether it is always billable, never billable or follows the project. Plus: where your data is stored, download/restore a JSON backup, export daily totals to CSV with codes, billable hours and the split by type of work (opens in Excel/Sheets), load sample data. |

## Put it online

**Follow [DEPLOY.md](DEPLOY.md)**: a click-by-click guide using three free accounts (GitHub, Vercel, Upstash). In short:

1. Upload this folder to a GitHub repository.
2. Import the repository into Vercel and deploy.
3. In Vercel's **Storage** tab, add a free **Upstash for Redis** database to the project.
4. Add an `AUTH_SECRET` environment variable, then redeploy.
5. Open your site straight away and create the admin account.

| Setting (Vercel → Settings → Environment Variables) | Needed? | What it does |
|---|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) | Yes | Connection to the database. Added for you when you connect Upstash. |
| `AUTH_SECRET` | Recommended | Signs login cookies. Changing it signs everyone out. Without it, a random one is made and kept in the database. |
| `ALLOW_SIGNUP` | No | `true` lets anyone with the link create an account. Default: only the first (admin); the admin adds everyone else. |

You can still run it on your own computer for testing (`npm install`, `npm run build`, `npm start`, then http://localhost:3000). Without database settings it saves to a local `data/` folder.

## Users and logins

1. **First visit:** the site asks you to create the **admin account** (a username and a password of 8+ characters). Do this right after deploying: until an admin exists, whoever opens the link first gets that role.
2. **Adding people:** the admin opens **Settings → Users**, types a username and a starting password, and clicks **Add user**. Give that person the link, their username and password; they can change the password themselves in Settings.
3. **Signing in:** everyone uses your Vercel link. Each person only ever sees their own projects and time.
4. **Forgot a password?** The admin clicks **Reset password** next to that user. Keep your own admin password in a password manager, or make a second admin, because nobody can reset the last admin's password from inside the app.

**Automatic backups:** once a day, before your first save of the day, the app copies your data to a backup inside the database and keeps the newest 14 days. **Settings → Storage** lists them. To go back to a day, click **Download this day**, then **Restore from backup** and pick that file.

### How the login works, in plain words

- **Passwords are never stored.** When you set one, the app mixes it with a random "salt" and runs it through *scrypt*, a deliberately slow scrambling function, and stores only the result. To sign in, it scrambles what you typed the same way and checks the results match.
- **Staying signed in** uses a cookie with your username and an expiry date (30 days), plus a *signature* made with the secret key. If anyone edits the cookie, the signature no longer matches and it's rejected.
- **Wrong passwords:** after 10 wrong tries in 15 minutes, that username is locked for 15 minutes.
- **Changing or resetting a password** signs that person out on all their other devices.

## Keeping your data in a folder instead (no cloud)

On the sign-in page, click **Use a folder on this computer** and pick a folder, for example `Documents\Tempo` or `OneDrive\Tempo`. Tempo saves everything there as `tempo-data.json`. The website only delivers the app's screens; your time never goes to the server. Already using an account? **Settings → Storage → Keep my data in a folder on this computer instead** offers to copy your current time into the folder.

- **Syncing between computers:** choose a folder that OneDrive, Google Drive or Dropbox syncs, and pick that same folder on each computer. When you come back to Tempo it re-reads the file, and before every save it checks whether another computer changed it. If so, both sets of changes are combined rather than one overwriting the other. If two computers changed it while offline, sync apps sometimes keep both versions as a "conflicted copy" file; Tempo merges those in and removes them.
- **Backups:** once a day, before your first save, a copy goes into `backups/` in that folder (newest 14 kept). They sync like everything else. To go back to one, use **Restore from backup** and pick that file.
- **After a browser restart** the browser asks once whether Tempo may use the folder again: click **Open <folder>**, then **Allow** (Chrome and Edge may offer "Allow on every visit").
- **Limits:** needs Edge or Chrome on a computer; phones, Safari and Firefox can't give websites a folder. Each browser remembers its own choice.
- **Going back:** Settings → Storage → **Use an online account instead**. The folder is left as it is.

The file is the same format as Tempo's JSON backups and the offline edition's backups, so you can move time between all three with **Download backup** and **Restore from backup**.

## Importing from Toggl, Jibble and others

Settings > Import (or go to `/import`) reads a CSV file exported from another tracker.

1. **Export a CSV** from the other app:
   - **Toggl Track:** Reports > Detailed > Export > *Download CSV*.
   - **Jibble:** Timesheets > Export > choose *Raw time entries* or *Timesheets* and pick **CSV**.
   - **Clockify:** Reports > Detailed > Export > *Save as CSV*.
   - **Excel / Google Sheets:** File > Save as / Download > *CSV*. Needs at least a date plus start/end times or hours.
2. **Choose the file.** The app guesses which column is which (person, date, start, end, duration, project, code,
   client, task, notes, billable) and shows what it guessed. Change any dropdown that looks wrong.
3. **Check the preview.** If dates could be day/month or month/day, pick the right one. If the file has several
   people, pick whose time to import.
4. **Press Import.** New projects are created (with code and client when the file has them), sessions are added,
   and sessions you already have are skipped, so re-importing the same file is safe.

Jibble's clock in / clock out events are paired up automatically: each "In" runs until the next "In" or "Out".
Excel `.xlsx` files are not read directly; save them as CSV first.

## How storage works (in plain words)

The app never talks to storage directly. It goes through a small "adapter" with two jobs: `load()` everything and `save()` everything. When the page opens, it asks the server (`/api/data`) what storage it has:

- **On Vercel with Upstash** the server says "redis", so your data goes to the cloud database, under your account. Login is always required.
- **On Vercel without a database** (or if the server can't be reached) the page keeps data in the browser only (localStorage). The sidebar then says "This browser" instead of "Cloud sync".
- **On your own computer without database settings** it says "file" and uses the `data/` folder.

In folder mode the page reads and writes the folder directly and never calls `/api/data`. In the online modes, the once-a-minute refresh first asks only "has anything changed?" (a tiny version stamp) and downloads your data only when it has.

A copy of your own data is also kept in the browser as a fallback; it is removed when you sign out.

**Two windows at once (tabs, or a laptop and a desktop):** each save says which version it started from. If someone else saved in between, the server *combines* the two instead of overwriting: sessions added in either window are kept, an edited session keeps its most recent edit, and deletions stay deleted. Open windows also pick up each other's changes when you switch to them, and once a minute. If two windows both started a timer, the later one keeps running and the earlier one stops at the moment the later one began.

**Forgot to stop?** When a timer runs longer than a limit (10 hours unless you change it in Settings → Timer reminder), a yellow banner asks if you forgot to stop it, with a button that opens the stop form so you can set the real end time. Saving happens automatically a moment after every change (the sidebar shows "All changes saved").

## How the daily total is computed

Each session is cut at midnight (so 23:00 to 01:00 gives one hour to each day). Then sessions are grouped by **day** and **project**, and their durations are added. In maths terms, for project $p$ on day $d$:

$$\text{total}(p, d) = \sum_{s \,\in\, \text{sessions}(p, d)} (\text{end}_s - \text{start}_s)$$

That logic lives in `src/lib/time.ts` (`rollupByDay`) and is covered by `npm test`.

## Project layout

```
src/
  app/            pages: / (timer), /calendar, /dashboard, /projects, /settings, /import; /api/data, /api/data/backup, /api/auth/*
  components/     calendar/ (Day, Week, Month views), login screen, timer bar, project picker, edit dialog, app shell, data store
  lib/time.ts     date maths, midnight splitting, daily rollup, formatting
  lib/merge.ts    combining edits from two windows
  lib/importer.ts reading Toggl, Jibble, Clockify and other CSV exports
  lib/storage/    browser, server and folder (folder.ts) adapters (client side)
  lib/server/     Upstash + data folder backends, accounts and logins (auth.ts), daily backups (backup.ts)
tests/            rollup, merge and import tests (npm test)
```
