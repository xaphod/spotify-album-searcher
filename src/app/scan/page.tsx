"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlbumAccumulator, ScanProgress, TokenResponse } from "@/lib/types";
import { scanLibrary } from "@/lib/scanner";
import { RateLimitedPool, saveAlbums, setRateLimitCallback } from "@/lib/spotify";

type Status = "loading" | "idle" | "scanning" | "review" | "saving" | "done" | "error";

export default function ScanPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [userName, setUserName] = useState<string>("");
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [albums, setAlbums] = useState<AlbumAccumulator[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>("");
  const [saveProgress, setSaveProgress] = useState({ saved: 0, total: 0 });
  const [rateLimitWait, setRateLimitWait] = useState<number | null>(null);
  const rateLimitTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tokenRef = useRef<{ accessToken: string; expiresAt: number } | null>(null);

  const getToken = useCallback(async (): Promise<string> => {
    if (tokenRef.current && tokenRef.current.expiresAt - Date.now() > 300_000) {
      return tokenRef.current.accessToken;
    }
    const res = await fetch("/api/token");
    if (!res.ok) {
      throw new Error("Not authenticated");
    }
    const data: TokenResponse = await res.json();
    tokenRef.current = data;
    return data.accessToken;
  }, []);

  // Check auth on mount
  useEffect(() => {
    getToken()
      .then(() => setStatus("idle"))
      .catch(() => {
        window.location.href = "/";
      });

    // Fetch user name from session info
    fetch("/api/token")
      .then((r) => r.json())
      .then(() => {
        // User name comes from the session; we'd need a separate endpoint
        // For now we skip this — user is clearly logged in if token works
      })
      .catch(() => {});
  }, [getToken]);

  async function startScan() {
    setStatus("scanning");
    setProgress(null);
    setAlbums([]);
    setError("");
    setRateLimitWait(null);

    abortRef.current = new AbortController();

    // Register rate limit callback — shows countdown in UI
    setRateLimitCallback((waitSeconds) => {
      setRateLimitWait(waitSeconds);
      // Count down every second
      if (rateLimitTimerRef.current) clearInterval(rateLimitTimerRef.current);
      let remaining = waitSeconds;
      rateLimitTimerRef.current = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(rateLimitTimerRef.current!);
          rateLimitTimerRef.current = null;
          setRateLimitWait(null);
        } else {
          setRateLimitWait(remaining);
        }
      }, 1000);
    });

    try {
      const results = await scanLibrary(
        getToken,
        (p) => setProgress(p),
        abortRef.current.signal
      );

      if (results.length === 0) {
        setAlbums([]);
        setStatus("review"); // Will show "no results" variant
      } else {
        setAlbums(results);
        setSelected(new Set(results.map((a) => a.id)));
        setStatus("review");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(err instanceof Error ? err.message : "Scan failed");
      setStatus("error");
    } finally {
      setRateLimitCallback(null);
      if (rateLimitTimerRef.current) {
        clearInterval(rateLimitTimerRef.current);
        rateLimitTimerRef.current = null;
      }
      setRateLimitWait(null);
    }
  }

  function cancelScan() {
    abortRef.current?.abort();
  }

  function toggleAlbum(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(albums.map((a) => a.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleSave() {
    const albumIds = Array.from(selected);
    if (albumIds.length === 0) return;

    setStatus("saving");
    setSaveProgress({ saved: 0, total: albumIds.length });

    try {
      const token = await getToken();
      const pool = new RateLimitedPool(5);
      await saveAlbums(pool, token, albumIds, (saved, total) => {
        setSaveProgress({ saved, total });
      });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setStatus("error");
    }
  }

  // Loading state
  if (status === "loading") {
    return (
      <main className="scan-page">
        <div className="scan-progress">
          <span className="spinner" />
        </div>
      </main>
    );
  }

  return (
    <main className="scan-page">
      <header className="scan-header">
        <h1>Spotify Album Searcher</h1>
        {userName && <span className="user-info">{userName}</span>}
      </header>

      {/* IDLE */}
      {status === "idle" && (
        <div className="scan-idle">
          <p>
            Scan your liked songs to find albums where you&apos;ve liked 70% or
            more of the tracks but haven&apos;t saved the album.
          </p>
          <button className="btn btn-primary btn-large" onClick={startScan}>
            Scan My Library
          </button>
        </div>
      )}

      {/* SCANNING */}
      {status === "scanning" && progress && (
        <div className="scan-progress">
          <p className="progress-text">
            {rateLimitWait
              ? `Rate limited — resuming in ${rateLimitWait}s...`
              : progress.phase === "checking"
                ? "Checking saved albums..."
                : `Scanning... ${progress.tracksScanned.toLocaleString()} / ${progress.totalTracks.toLocaleString()} tracks`}
          </p>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${
                  progress.totalTracks > 0
                    ? (progress.tracksScanned / progress.totalTracks) * 100
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="progress-detail">
            {progress.pagesCompleted} / {progress.totalPages} pages &middot;{" "}
            {progress.albumsFound.toLocaleString()} unique albums found
          </p>
          <button className="btn btn-secondary btn-medium" onClick={cancelScan}>
            Cancel
          </button>
        </div>
      )}

      {/* SCANNING — before first progress arrives */}
      {status === "scanning" && !progress && (
        <div className="scan-progress">
          <p className="progress-text">Starting scan...</p>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: "0%" }} />
          </div>
        </div>
      )}

      {/* REVIEW — no results */}
      {status === "review" && albums.length === 0 && (
        <div className="no-results">
          <h2>No albums found</h2>
          <p>
            All your qualifying albums are already saved to your library, or
            none of your albums meet the 70% threshold.
          </p>
          <button className="btn btn-primary btn-medium" onClick={startScan}>
            Scan Again
          </button>
        </div>
      )}

      {/* REVIEW — with results */}
      {status === "review" && albums.length > 0 && (
        <>
          <div className="review-header">
            <h2>
              {albums.length} album{albums.length !== 1 ? "s" : ""} found
            </h2>
            <div className="review-actions">
              <div className="select-links">
                <button onClick={selectAll}>Select All</button>
                <button onClick={deselectAll}>Deselect All</button>
              </div>
            </div>
          </div>

          <div className="album-grid">
            {albums.map((album) => (
              <div
                key={album.id}
                className={`album-card ${!selected.has(album.id) ? "unchecked" : ""}`}
                onClick={() => toggleAlbum(album.id)}
              >
                {album.imageUrl ? (
                  <img
                    className="album-art"
                    src={album.imageUrl}
                    alt={album.name}
                    width={64}
                    height={64}
                  />
                ) : (
                  <div
                    className="album-art"
                    style={{ background: "var(--surface-hover)" }}
                  />
                )}
                <div className="album-info">
                  <div className="album-name" title={album.name}>
                    {album.name}
                  </div>
                  <div className="album-artist" title={album.artistName}>
                    {album.artistName}
                  </div>
                  <div className="album-liked">
                    {album.likedTracks} of {album.totalTracks} tracks liked
                  </div>
                </div>
                <div className="album-checkbox">
                  <input
                    type="checkbox"
                    checked={selected.has(album.id)}
                    onChange={() => toggleAlbum(album.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="save-bar">
            <button
              className="btn btn-primary btn-large"
              onClick={handleSave}
              disabled={selected.size === 0}
            >
              Add {selected.size} Album{selected.size !== 1 ? "s" : ""} to
              Library
            </button>
          </div>
        </>
      )}

      {/* SAVING */}
      {status === "saving" && (
        <div className="scan-progress">
          <p className="progress-text">
            Saving albums... {saveProgress.saved} / {saveProgress.total}
          </p>
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{
                width: `${
                  saveProgress.total > 0
                    ? (saveProgress.saved / saveProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      )}

      {/* DONE */}
      {status === "done" && (
        <div className="status-message">
          <h2>Done!</h2>
          <p>
            Added {saveProgress.total} album{saveProgress.total !== 1 ? "s" : ""}{" "}
            to your library.
          </p>
          <button className="btn btn-primary btn-medium" onClick={startScan}>
            Scan Again
          </button>
        </div>
      )}

      {/* ERROR */}
      {status === "error" && (
        <div className="status-message error">
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button className="btn btn-primary btn-medium" onClick={startScan}>
            Try Again
          </button>
        </div>
      )}
    </main>
  );
}
