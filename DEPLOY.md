# Putting Tempo online, step by step

This guide puts Tempo on the internet as your own private website, for example `https://tempo-bento.vercel.app`. When you're done you can open that link at the office, at home or on your phone, sign in, and see the same timers everywhere. Nothing gets installed on the office computer.

**What you need:** a computer with a web browser (use your home one), an email address, and about 20 to 30 minutes. Everything below is free.

## How the pieces fit together

You'll create three free accounts. Each one has one job:

| Service | Its job | A simple way to picture it |
|---|---|---|
| **GitHub** | Stores the app's code | A shared folder in the cloud for the code |
| **Vercel** | Runs the code as a website | The computer that's always on and serves your site |
| **Upstash** | A small database that holds your time entries and logins | The filing cabinet |

Vercel reads the code from GitHub. Whenever the code on GitHub changes, Vercel rebuilds the site by itself. The site saves your data into Upstash.

---

## Step 1: Download and unzip the app

1. Download **time-tracker-cloud.zip** from the project.
2. Right-click it, choose **Extract All**, and click **Extract**.
3. Open the new folder. Inside, you should see a folder called `time-tracker-cloud`. Open it too. In there you'll see `package.json`, `README.md`, `DEPLOY.md`, and the folders `src`, `public` and `tests`.

Remember this folder. In Step 3 you'll upload **what's inside it**.

## Step 2: Create a GitHub account

1. Go to **https://github.com/signup** and create an account. Pick any username; it will appear in your repository's address.
2. Confirm your email when GitHub asks.

## Step 3: Put the code on GitHub

A *repository* (or "repo") is a project folder on GitHub.

1. Once you're signed in, open **https://github.com/new**.
2. **Repository name:** `tempo`.
3. Choose **Private**, so only you can see the code.
4. Leave every other box unticked: no README, no .gitignore, no license. Then click **Create repository**.
5. You'll see a nearly empty page. Find the link **"uploading an existing file"** and click it.
6. In File Explorer, open your `time-tracker-cloud` folder and select **everything inside it** (press `Ctrl + A`). Drag the selection onto the GitHub page.
   - Drag the *contents*, not the folder itself. `package.json` must end up at the top level of the repo, or Vercel won't recognise the app.
   - Wait until the list of files stops growing. There are about 55 files.
7. Scroll down and click **Commit changes**.

**Check:** the repo's main page should list `package.json`, `README.md` and the `src` folder directly, not inside another folder. If you only see one folder called `time-tracker-cloud`, delete the repo (Settings, then scroll to the bottom) and repeat this step, dragging the contents instead.

## Step 4: Create a Vercel account and deploy

1. Go to **https://vercel.com/signup**.
2. Choose the **Hobby** plan, which is free and for personal use. Type your name.
3. Click **Continue with GitHub** and allow access. This lets Vercel read your code.
4. On the Vercel dashboard click **Add New…**, then **Project**.
5. You'll see a list of your GitHub repos. If `tempo` isn't there, click **Adjust GitHub App Permissions** (or **Configure GitHub App**), give access to the `tempo` repo, and come back.
6. Click **Import** next to `tempo`.
7. Vercel detects **Next.js** by itself. Don't change any settings. Click **Deploy**.
8. Wait one or two minutes while it builds. When you see "Congratulations", click **Continue to Dashboard**.

Your site now exists, with an address shown under **Domains** (something like `tempo-xyz.vercel.app`). **Don't start using it yet:** it has no database, so for now it would only save into that one browser.

## Step 5: Add the free database (Upstash)

1. In your Vercel project, click the **Storage** tab at the top.
2. Click **Create Database**. If you don't see that, look for **Browse Marketplace** or **Connect Database**.
3. Choose **Upstash**, then **Upstash for Redis**, and click **Continue**.
   - Vercel may ask you to accept Upstash's terms. This creates your Upstash account automatically, so you don't sign up separately.
4. **Region:** pick the one closest to you, for example Frankfurt for Europe, or Washington D.C. for the US East Coast.
5. **Plan:** choose **Free**.
6. **Name:** `tempo-db`. Click **Create**.
7. Vercel asks which project to connect it to. Choose your `tempo` project and tick **all environments** (Production, Preview, Development). Click **Connect**.

Behind the scenes, Vercel just gave your site the database's address and password. These are settings named `KV_REST_API_URL` and `KV_REST_API_TOKEN`. You don't need to copy them anywhere.

## Step 6: Add a secret key for logins

When you sign in, the site gives your browser a "signed" login cookie. The signature is made with a secret key, so nobody can fake a login. Here you choose that key.

1. Make a long random value. Either:
   - in Git Bash, run `openssl rand -hex 32` and copy the 64-character result; or
   - use a password generator (for example in your browser's password manager) to make a 40+ character password.
2. In Vercel, open your project's **Settings**, then **Environment Variables**.
3. **Key:** `AUTH_SECRET`. **Value:** paste the random value. Leave all environments ticked. Click **Save**.

You never type this key yourself, so you don't need to remember it. Don't share it. Changing it later simply signs everyone out.

*(This step is optional. Without it, the site makes its own key and stores it in the database. Setting it yourself is a little safer.)*

## Step 7: Redeploy so the new settings take effect

A site only reads its settings when it's built. So:

1. Open the **Deployments** tab.
2. On the top deployment, click the **⋯** menu and choose **Redeploy**, then **Redeploy** again.
3. Wait until its status is **Ready**.

## Step 8: Create your admin account right away

1. Open your site's address (shown under **Domains** on the project page).
2. You'll see **Create the admin account**. Choose a username, for example `bento`, and a password of at least 8 characters.
   - Do this straight away. Until an admin exists, whoever opens the link first gets the admin role.
   - Save the password in a password manager. Nobody can reset the last admin's password from inside the app.
3. Check the bottom of the sidebar. It should say **Cloud sync** and **All changes saved**.
   - If it says **This browser**, the database isn't connected. See "If something goes wrong" below.

## Step 9: Bring over your existing time (optional)

If you've already tracked time in the offline version:

1. Open the **offline** Tempo, sign in, go to **Settings**, and click **Download backup (JSON)**.
2. Open the **online** Tempo, go to **Settings**, click **Restore from backup**, and pick that file.

Exports from Toggl, Jibble or Clockify work too: **Settings → Import from Toggl, Jibble, Clockify…**

## Step 10: Use it everywhere

- **At the office:** open your link in Edge or Chrome and sign in. To make it feel like an app, use the browser menu: in Edge, **⋯ → Apps → Install this site as an app**; in Chrome, **⋮ → Cast, save and share → Install page as app**. Tempo then gets its own window and taskbar icon.
- **On your phone:** open the link. On iPhone, tap **Share → Add to Home Screen**. On Android, tap **⋮ → Add to Home screen**.
- **Other people:** in **Settings → Users**, add a username and starting password, then send them the link. Each person sees only their own time.

---

## Prefer not to use the cloud? (optional)

Anyone who doesn't want their time in the database can click **Use a folder on this computer** on the sign-in page instead of signing in. Their time is then saved as a file in a folder they pick, and nothing goes to Upstash. To have it on several computers, pick a folder inside OneDrive, Google Drive or Dropbox, and choose that same folder on each computer. This works in Edge and Chrome on computers, not on phones. See "Keeping your data in a folder instead" in the README.

## Changing the app later

When there's a new version: in your GitHub repo, click **Add file → Upload files**, drag in the changed files (or the whole folder's contents again), and click **Commit changes**. Vercel notices and redeploys by itself within a minute or two. Your data lives in the database, so it isn't touched.

## If something goes wrong

| What you see | What it means and how to fix it |
|---|---|
| The build fails with **"No Next.js version detected"** or **"package.json not found"** | The files are one folder too deep on GitHub. Repeat Step 3 and drag the folder's *contents*. |
| The sidebar says **This browser**, not Cloud sync | The site can't see the database. Check **Settings → Environment Variables** for `KV_REST_API_URL` and `KV_REST_API_TOKEN`. If they're missing, reconnect the database in the **Storage** tab. Then **Redeploy** (Step 7). |
| **"Could not load your data"** with an error number | The database rejected the request. In the **Storage** tab, open the database and check that it's active. Then redeploy. |
| You're signed out on every device | `AUTH_SECRET` changed. Just sign in again. |
| **"Too many wrong attempts"** | After 10 wrong passwords, that username is locked for 15 minutes. Wait, then try again. |

## What it costs

Nothing, for one person or a small team.
- Vercel's **Hobby** plan is free for personal, non-commercial projects.
- Upstash's **Free** plan comes with a monthly allowance of storage and requests. A time tracker uses very little of it: each save is a few requests, and the app only saves when you change something.

You're never charged unless you add a payment method and upgrade yourself. Downloading a backup now and then (**Settings → Download backup**) is still a good habit.
