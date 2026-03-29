# Spotify Album Searcher

Scans your Spotify liked songs and finds albums you should save to your library. If you've liked 70% or more of an album's tracks but haven't saved the album itself, this app will find it and let you add it with one click.

https://github.com/user-attachments/assets/c3c5b032-c9bf-48c9-bfd1-9ea346d9c88c

## Installing / Using the app

You'll need a Spotify Premium account. There are three parts: creating a Spotify app (so the tool can access your library), deploying the web app on Vercel (free), and connecting the two.

### Part 1: Create a Spotify app

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in with your Spotify account
2. Click **Create app**
3. Fill in a name (anything you want, e.g. "Album Searcher") and a description
4. Leave the **Redirect URI** field empty for now — you'll come back to this in Part 3
5. Check the **Web API** checkbox under "Which API/SDKs are you planning to use?"
6. Click **Save**
7. On your new app's page, click **Settings**
8. You'll see your **Client ID** — copy it somewhere (you'll need it soon)
9. Click **View client secret** and copy that too

### Part 2: Deploy on Vercel

1. If you don't have a GitHub account, create one at [github.com](https://github.com)
2. Go to this repository on GitHub and click **Fork** (top right) to copy it to your own account
3. Go to [vercel.com](https://vercel.com) and click **Sign Up** — sign up with your GitHub account
4. Once logged in, click **Add New** > **Project**
5. Find your forked repository in the list and click **Import**
6. Before clicking Deploy, expand **Environment Variables** and add these three, one at a time:
   - Name: `SPOTIFY_CLIENT_ID` — Value: the Client ID you copied in Part 1
   - Name: `SPOTIFY_CLIENT_SECRET` — Value: the Client Secret you copied in Part 1
   - Name: `SESSION_SECRET` — Value: any random string of 32+ characters (mash your keyboard, or use a [random string generator](https://www.random.org/strings/?num=1&len=40&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain))
7. Click **Deploy** and wait for it to finish (about a minute)
8. Vercel will show you your app's URL — it will look something like `https://your-project-name.vercel.app`. Copy this URL.

### Part 3: Connect Spotify to Vercel

1. Go back to your Spotify app's **Settings** page at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Under **Redirect URIs**, click **Edit**
3. Add your Vercel URL followed by `/api/auth/callback`. For example: `https://your-project-name.vercel.app/api/auth/callback`
4. Click **Add**, then **Save**

### Part 4: Use the app

1. Open your Vercel URL in a web browser
2. Click **Login with Spotify** and authorize the app
3. Click **Scan My Library** — the progress bar will fill as it reads your liked songs
4. Review the list of albums — they're all checked by default. Uncheck any you don't want to add.
5. Click **Add Albums to Library**

## How it works

1. Log in with your Spotify account
2. Click "Scan My Library" — the app fetches all your liked songs and groups them by album
3. Albums where you've liked >= 70% of tracks (but haven't saved the album) are shown in a checklist
4. Select which albums to add and click "Add to Library"

Handles large libraries (100K+ liked songs) by scanning directly from the browser with parallel requests.

## Local development

### 1. Create a Spotify app

Follow Part 1 above, but in Part 3 use `http://localhost:3000/api/auth/callback` as the redirect URI instead.

### 2. Configure environment

```sh
cp .env.local.example .env.local
```

Fill in `.env.local`:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SESSION_SECRET=any_random_string_at_least_32_characters_long
```

### 3. Install and run

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [iron-session](https://github.com/vvo/iron-session) for encrypted cookie sessions
- Spotify Web API (Feb 2026+ endpoints)
- Deployed on Vercel (hobby plan compatible)
