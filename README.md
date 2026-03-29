# Spotify Album Searcher

Scans your Spotify liked songs and finds albums you should save to your library. If you've liked 70% or more of an album's tracks but haven't saved the album itself, this app will find it and let you add it with one click.

## How it works

1. Log in with your Spotify account
2. Click "Scan My Library" — the app fetches all your liked songs and groups them by album
3. Albums where you've liked >= 70% of tracks (but haven't saved the album) are shown in a checklist
4. Select which albums to add and click "Add to Library"

Handles large libraries (100K+ liked songs) by scanning directly from the browser with parallel requests.

## Setup

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add these redirect URIs:
   - `http://localhost:3000/api/auth/callback` (local development)
   - `https://<your-app>.vercel.app/api/auth/callback` (production)
4. Note your Client ID and Client Secret

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

## Deploy to Vercel

1. Push to a GitHub repository
2. Import the repo in [Vercel](https://vercel.com)
3. Add the three environment variables (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SESSION_SECRET`) in the Vercel project settings
4. Add your production callback URL to your Spotify app's redirect URIs

## Tech stack

- [Next.js](https://nextjs.org) (App Router, TypeScript)
- [iron-session](https://github.com/vvo/iron-session) for encrypted cookie sessions
- Spotify Web API (Feb 2026+ endpoints)
- Deployed on Vercel (hobby plan compatible)
