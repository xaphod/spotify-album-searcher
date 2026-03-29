import {
  SpotifyPaging,
  SpotifySavedTrack,
} from "./types";

const SPOTIFY_API = "https://api.spotify.com/v1";

// Callback for notifying the UI about rate limit pauses
export type RateLimitCallback = (waitSeconds: number) => void;
let onRateLimitPause: RateLimitCallback | null = null;

export function setRateLimitCallback(cb: RateLimitCallback | null) {
  onRateLimitPause = cb;
}

// --- Rate-limited concurrency pool ---

type QueueItem<T> = {
  fn: (signal: AbortSignal) => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

export class RateLimitedPool {
  private queue: QueueItem<unknown>[] = [];
  private running = 0;
  private paused = false;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController = new AbortController();

  constructor(private concurrency: number = 5) {}

  enqueue<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as (signal: AbortSignal) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.drain();
    });
  }

  abort() {
    this.abortController.abort();
    for (const item of this.queue) {
      item.reject(new DOMException("Aborted", "AbortError"));
    }
    this.queue = [];
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }

  get signal() {
    return this.abortController.signal;
  }

  private pause(seconds: number) {
    this.paused = true;
    this.pauseTimer = setTimeout(() => {
      this.paused = false;
      this.pauseTimer = null;
      this.drain();
    }, seconds * 1000);
  }

  private drain() {
    if (this.paused) return;
    while (this.running < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!;
      this.running++;
      this.run(item);
    }
  }

  private async run(item: QueueItem<unknown>) {
    try {
      const result = await item.fn(this.abortController.signal);
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.running--;
      this.drain();
    }
  }

  /** Called by spotifyFetch when a 429 is encountered */
  triggerPause(seconds: number) {
    this.pause(seconds);
  }
}

// --- Spotify fetch wrapper ---

export async function spotifyFetch<T>(
  pool: RateLimitedPool,
  token: string,
  url: string,
  options?: RequestInit
): Promise<T> {
  return pool.enqueue(async (signal) => {
    let lastError: unknown;
    let rateLimitRetries = 0;
    let errorRetries = 0;

    for (;;) {
      const res = await fetch(url, {
        ...options,
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...options?.headers,
        },
      });

      if (res.status === 429) {
        rateLimitRetries++;
        if (rateLimitRetries > 1) {
          throw new Error(
            "Spotify rate limit hit — please wait a few minutes before trying again"
          );
        }
        // Single retry after 10s pause, shown to user via callback
        onRateLimitPause?.(10);
        pool.triggerPause(waitSeconds);
        await new Promise((r) => setTimeout(r, waitSeconds * 1000));
        continue;
      }

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        lastError = new Error(
          `Spotify API ${res.status}: ${errorBody || res.statusText} (${url})`
        );
        // Retry on 5xx up to 3 times
        if (res.status >= 500 && errorRetries < 3) {
          errorRetries++;
          await new Promise((r) =>
            setTimeout(r, Math.pow(2, errorRetries) * 1000)
          );
          continue;
        }
        throw lastError;
      }

      const text = await res.text();
      if (!text) return undefined as T;
      return JSON.parse(text) as T;
    }
  });
}

// --- API helpers ---

export async function getLikedTracksPage(
  pool: RateLimitedPool,
  token: string,
  offset: number
): Promise<SpotifyPaging<SpotifySavedTrack>> {
  return spotifyFetch<SpotifyPaging<SpotifySavedTrack>>(
    pool,
    token,
    `${SPOTIFY_API}/me/tracks?limit=50&offset=${offset}`
  );
}

export async function checkAlbumsSaved(
  pool: RateLimitedPool,
  token: string,
  albumIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  // New endpoint uses URIs, batch into groups of 20
  for (let i = 0; i < albumIds.length; i += 20) {
    const batch = albumIds.slice(i, i + 20);
    const uris = batch.map((id) => `spotify:album:${id}`);
    const saved = await spotifyFetch<boolean[]>(
      pool,
      token,
      `${SPOTIFY_API}/me/library/contains?uris=${uris.join(",")}&type=album`
    );
    batch.forEach((id, idx) => result.set(id, saved[idx]));
  }
  return result;
}

export async function saveAlbums(
  pool: RateLimitedPool,
  token: string,
  albumIds: string[],
  onProgress?: (saved: number, total: number) => void
): Promise<void> {
  let saved = 0;
  // New endpoint uses URIs, batch into groups of 50
  for (let i = 0; i < albumIds.length; i += 50) {
    const batch = albumIds.slice(i, i + 50);
    const uris = batch.map((id) => `spotify:album:${id}`);
    await spotifyFetch<void>(
      pool,
      token,
      `${SPOTIFY_API}/me/library?uris=${encodeURIComponent(uris.join(","))}&type=album`,
      { method: "PUT" }
    );
    saved += batch.length;
    onProgress?.(saved, albumIds.length);
  }
}
