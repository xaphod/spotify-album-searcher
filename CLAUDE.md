# Spotify Album Searcher

## Project overview

Next.js App Router (TypeScript) deployed on Vercel hobby plan. Scans a user's Spotify liked songs and finds albums where they've liked >=70% of tracks but haven't saved the album itself.

## Architecture

**Hybrid client/server split** — server handles OAuth only, client does all Spotify API scanning directly from the browser. This is intentional: large libraries (100K+ songs) take minutes to scan, exceeding Vercel's serverless function timeout.

- **Server** (`src/app/api/`): OAuth login/callback, token refresh endpoint
- **Client** (`src/lib/spotify.ts`, `src/lib/scanner.ts`): All Spotify API calls run in the browser using the access token from `/api/token`
- **Session**: iron-session encrypted cookies — no database

## Key files

- `src/lib/spotify.ts` — `RateLimitedPool` (concurrency=5, 429 handling), `spotifyFetch` wrapper, API helpers
- `src/lib/scanner.ts` — `scanLibrary()` — fetches all liked tracks in parallel, builds album map, filters by 70% threshold, checks saved status
- `src/lib/types.ts` — All shared types (session, Spotify API responses, scan progress)
- `src/lib/session.ts` — iron-session config
- `src/app/scan/page.tsx` — Single client component with state machine: idle -> scanning -> review -> saving -> done
- `src/app/api/auth/login/route.ts` — OAuth redirect to Spotify
- `src/app/api/auth/callback/route.ts` — Token exchange, session save
- `src/app/api/token/route.ts` — Returns valid access token (auto-refreshes if near expiry)

## Spotify API usage

Uses the Feb 2026+ API — no deprecated endpoints:
- `GET /me/tracks` — paginated liked songs (offset-based, limit 50)
- `GET /me/library/contains?uris=...&type=album` — check if albums are saved (batch 20)
- `PUT /me/library` with `{uris: [...]}` — save albums (batch 50)
- `GET /me` — user profile for display name

Scopes: `user-library-read`, `user-library-modify`

## Commands

```
npm run dev    # Start dev server on :3000
npm run build  # Production build
npm start      # Start production server
```

## Environment variables

Set in `.env.local` (see `.env.local.example`):
- `SPOTIFY_CLIENT_ID` — from Spotify Developer Dashboard
- `SPOTIFY_CLIENT_SECRET` — from Spotify Developer Dashboard
- `SESSION_SECRET` — 32+ char random string for iron-session cookie encryption
