import {
  AlbumAccumulator,
  ArtistToFollow,
  FollowProgress,
  ScanProgress,
  SpotifyImage,
  SpotifyPaging,
  SpotifySavedAlbum,
  SpotifySavedTrack,
} from "./types";
import {
  RateLimitedPool,
  getArtists,
  getLikedTracksPage,
  getSavedAlbumsPage,
  checkAlbumsSaved,
  checkArtistsFollowed,
  getSavedAlbumKeys,
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

  // Filter out albums saved by exact ID
  let qualifying = candidates.filter((a) => !savedMap.get(a.id));

  // Step 5: Filter out regional variants — same album name+artist but different ID
  const savedKeys = await getSavedAlbumKeys(pool, latestToken);
  qualifying = qualifying.filter((a) => {
    const key = `${a.artistName.toLowerCase()} /// ${a.name.toLowerCase()}`;
    return !savedKeys.has(key);
  });

  // Sort by most liked tracks (descending)
  qualifying.sort((a, b) => b.likedTracks - a.likedTracks);

  return qualifying;
}

type ArtistAccumulator = {
  id: string;
  name: string;
  albumCount: number;
};

export async function scanArtistsToFollow(
  getToken: () => Promise<string>,
  onProgress: (progress: FollowProgress) => void,
  signal?: AbortSignal
): Promise<ArtistToFollow[]> {
  const pool = new RateLimitedPool(5);
  const artistMap = new Map<string, ArtistAccumulator>();
  let pagesCompleted = 0;
  let albumsScanned = 0;

  if (signal) {
    signal.addEventListener("abort", () => pool.abort(), { once: true });
  }

  const token = await getToken();
  const firstPage = await getSavedAlbumsPage(pool, token, 0);
  const total = firstPage.total;
  const totalPages = Math.ceil(total / 50);

  extractEligibleArtists(firstPage, artistMap);
  albumsScanned = firstPage.items.length;
  pagesCompleted = 1;

  onProgress({
    phase: "scanning",
    albumsScanned,
    totalAlbums: total,
    pagesCompleted,
    totalPages,
    artistsFound: artistMap.size,
  });

  if (totalPages > 1) {
    const offsets = Array.from(
      { length: totalPages - 1 },
      (_, i) => (i + 1) * 50
    );

    let pagesSinceTokenRefresh = 0;
    let currentToken = token;

    const pagePromises = offsets.map((offset) =>
      (async () => {
        pagesSinceTokenRefresh++;
        if (pagesSinceTokenRefresh >= 200) {
          pagesSinceTokenRefresh = 0;
          currentToken = await getToken();
        }

        const page = await getSavedAlbumsPage(pool, currentToken, offset);
        extractEligibleArtists(page, artistMap);

        albumsScanned += page.items.length;
        pagesCompleted++;

        onProgress({
          phase: "scanning",
          albumsScanned,
          totalAlbums: total,
          pagesCompleted,
          totalPages,
          artistsFound: artistMap.size,
        });

        return page;
      })()
    );

    await Promise.all(pagePromises);
  }

  onProgress({
    phase: "checking",
    albumsScanned: total,
    totalAlbums: total,
    pagesCompleted: totalPages,
    totalPages,
    artistsFound: artistMap.size,
  });

  if (artistMap.size === 0) {
    return [];
  }

  const allArtistIds = Array.from(artistMap.keys());
  const latestToken = await getToken();
  const followedMap = await checkArtistsFollowed(pool, latestToken, allArtistIds);

  const unfollowed = allArtistIds.filter((id) => !followedMap.get(id));
  if (unfollowed.length === 0) {
    return [];
  }

  const fullArtists = await getArtists(pool, latestToken, unfollowed);
  const imageById = new Map<string, string>();
  for (const a of fullArtists) {
    imageById.set(a.id, pickSmallestImage(a.images));
  }

  const result: ArtistToFollow[] = unfollowed.map((id) => {
    const acc = artistMap.get(id)!;
    return {
      id,
      name: acc.name,
      imageUrl: imageById.get(id) ?? "",
      albumCount: acc.albumCount,
    };
  });

  result.sort((a, b) => {
    if (b.albumCount !== a.albumCount) return b.albumCount - a.albumCount;
    return a.name.localeCompare(b.name);
  });

  return result;
}

function extractEligibleArtists(
  page: SpotifyPaging<SpotifySavedAlbum>,
  artistMap: Map<string, ArtistAccumulator>
) {
  for (const item of page.items) {
    const artists = item.album.artists;
    if (artists.length < 1 || artists.length > 2) continue;
    for (const artist of artists) {
      if (!artist.id) continue;
      const existing = artistMap.get(artist.id);
      if (existing) {
        existing.albumCount++;
      } else {
        artistMap.set(artist.id, {
          id: artist.id,
          name: artist.name,
          albumCount: 1,
        });
      }
    }
  }
}

function pickSmallestImage(images: SpotifyImage[]): string {
  if (images.length === 0) return "";
  const smallest = images.reduce<SpotifyImage | null>((acc, img) => {
    if (!acc || (img.width && acc.width && img.width < acc.width)) {
      return img;
    }
    return acc;
  }, null);
  return smallest?.url ?? images[0].url;
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
