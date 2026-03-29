import {
  AlbumAccumulator,
  ScanProgress,
  SpotifyPaging,
  SpotifySavedTrack,
} from "./types";
import {
  RateLimitedPool,
  getLikedTracksPage,
  checkAlbumsSaved,
} from "./spotify";

export async function scanLibrary(
  getToken: () => Promise<string>,
  onProgress: (progress: ScanProgress) => void,
  signal?: AbortSignal
): Promise<AlbumAccumulator[]> {
  const pool = new RateLimitedPool(5);
  const albumMap = new Map<string, AlbumAccumulator>();
  let pagesCompleted = 0;
  let tracksScanned = 0;

  // Wire external abort signal to the pool
  if (signal) {
    signal.addEventListener("abort", () => pool.abort(), { once: true });
  }

  // Step 1: Fetch first page to get total count
  const token = await getToken();
  const firstPage = await getLikedTracksPage(pool, token, 0);
  const total = firstPage.total;
  const totalPages = Math.ceil(total / 50);

  extractAlbums(firstPage, albumMap);
  tracksScanned = firstPage.items.length;
  pagesCompleted = 1;

  onProgress({
    phase: "scanning",
    tracksScanned,
    totalTracks: total,
    pagesCompleted,
    totalPages,
    albumsFound: albumMap.size,
  });

  if (totalPages <= 1) {
    // Small library, skip parallel fetching
  } else {
    // Step 2: Generate all remaining offsets and fetch in parallel
    const offsets = Array.from(
      { length: totalPages - 1 },
      (_, i) => (i + 1) * 50
    );

    let pagesSinceTokenRefresh = 0;
    let currentToken = token;

    // Enqueue all pages through the concurrency pool
    const pagePromises = offsets.map((offset) =>
      (async () => {
        // Refresh token periodically (every ~200 pages)
        pagesSinceTokenRefresh++;
        if (pagesSinceTokenRefresh >= 200) {
          pagesSinceTokenRefresh = 0;
          currentToken = await getToken();
        }

        const page = await getLikedTracksPage(pool, currentToken, offset);
        extractAlbums(page, albumMap);

        tracksScanned += page.items.length;
        pagesCompleted++;

        onProgress({
          phase: "scanning",
          tracksScanned,
          totalTracks: total,
          pagesCompleted,
          totalPages,
          albumsFound: albumMap.size,
        });

        return page;
      })()
    );

    await Promise.all(pagePromises);
  }

  // Step 3: Filter by 70% threshold
  onProgress({
    phase: "checking",
    tracksScanned: total,
    totalTracks: total,
    pagesCompleted: totalPages,
    totalPages,
    albumsFound: albumMap.size,
  });

  const candidates: AlbumAccumulator[] = [];
  for (const album of albumMap.values()) {
    if (album.totalTracks > 0 && album.likedTracks / album.totalTracks >= 0.7) {
      candidates.push(album);
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  // Step 4: Check which candidates are already saved
  const latestToken = await getToken();
  const candidateIds = candidates.map((a) => a.id);
  const savedMap = await checkAlbumsSaved(pool, latestToken, candidateIds);

  // Return only unsaved albums
  const qualifying = candidates.filter((a) => !savedMap.get(a.id));

  // Sort by most liked tracks (descending)
  qualifying.sort((a, b) => b.likedTracks - a.likedTracks);

  return qualifying;
}

function extractAlbums(
  page: SpotifyPaging<SpotifySavedTrack>,
  albumMap: Map<string, AlbumAccumulator>
) {
  for (const item of page.items) {
    const album = item.track.album;
    const existing = albumMap.get(album.id);

    if (existing) {
      existing.likedTracks++;
    } else {
      // Pick the smallest image for thumbnails, fallback to first
      const image =
        album.images.reduce<(typeof album.images)[0] | null>((smallest, img) => {
          if (!smallest || (img.width && smallest.width && img.width < smallest.width)) {
            return img;
          }
          return smallest;
        }, null) ?? album.images[0];

      albumMap.set(album.id, {
        id: album.id,
        name: album.name,
        artistName: album.artists.map((a) => a.name).join(", "),
        imageUrl: image?.url ?? "",
        totalTracks: album.total_tracks,
        likedTracks: 1,
      });
    }
  }
}
