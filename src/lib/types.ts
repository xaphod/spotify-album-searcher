// iron-session data stored in encrypted cookie
export interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms timestamp
  userName?: string;
  oauthState?: string;
}

// Which scan flow the user picked from the idle screen
export type ScanMode = "albums" | "artists";

// Album accumulated during scan
export interface AlbumAccumulator {
  id: string;
  name: string;
  artistName: string;
  imageUrl: string;
  totalTracks: number;
  likedTracks: number;
}

// Artist surfaced by the artist-follow scan
export interface ArtistToFollow {
  id: string;
  name: string;
  imageUrl: string;
  albumCount: number;
}

// Scan progress callback payload
export interface ScanProgress {
  phase: "scanning" | "checking" | "complete" | "error" | "rate_limited";
  tracksScanned: number;
  totalTracks: number;
  pagesCompleted: number;
  totalPages: number;
  albumsFound: number;
  error?: string;
  rateLimitWaitSeconds?: number;
}

// Progress callback for the artist-follow scan
export interface FollowProgress {
  phase: "scanning" | "checking" | "complete" | "error" | "rate_limited";
  albumsScanned: number;
  totalAlbums: number;
  pagesCompleted: number;
  totalPages: number;
  artistsFound: number;
  error?: string;
  rateLimitWaitSeconds?: number;
}

// Spotify API response types

export interface SpotifyPaging<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
}

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifySimplifiedAlbum {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: SpotifyImage[];
  total_tracks: number;
  album_type: string;
  uri: string;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images: SpotifyImage[];
}

export interface SpotifySavedTrack {
  added_at: string;
  track: {
    id: string;
    name: string;
    album: SpotifySimplifiedAlbum;
  };
}

export interface SpotifySavedAlbum {
  added_at: string;
  album: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
  };
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
}

// Token response from /api/token
export interface TokenResponse {
  accessToken: string;
  expiresAt: number;
}
