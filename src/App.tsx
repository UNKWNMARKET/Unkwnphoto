import { useCallback, useEffect, useMemo, useState } from "react";
import { getLibrary, getSession, type SessionState } from "./lib/api";
import { linkProps, parseRoute, usePath } from "./lib/router";
import type { Library } from "./types";
import Home from "./components/Home";
import AlbumView from "./components/AlbumView";
import Admin from "./components/Admin";
import Login from "./components/Login";

const EMPTY: Library = { version: 2, albums: [], photos: [] };

export default function App() {
  const [library, setLibrary] = useState<Library>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>({
    authenticated: false,
    configured: false
  });

  const path = usePath();
  const route = parseRoute(path);

  const refresh = useCallback(async () => {
    try {
      setLibrary(await getLibrary());
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
      throw err;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lib, sess] = await Promise.all([
        getLibrary().catch((err: Error) => err),
        getSession()
      ]);
      if (cancelled) return;
      if (lib instanceof Error) setLoadError(lib.message);
      else setLibrary(lib);
      setSession(sess);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const albums = useMemo(
    () => [...library.albums].sort((a, b) => a.order - b.order),
    [library.albums]
  );

  const album = route.albumId
    ? albums.find((a) => a.id === route.albumId)
    : undefined;

  const albumPhotos = useMemo(
    () =>
      album
        ? library.photos
            .filter((p) => p.albumId === album.id)
            .sort((a, b) => a.order - b.order)
        : [],
    [album, library.photos]
  );

  const isAdmin = route.name === "admin";

  // Keep the tab title, the canonical URL and indexing meaningful as you move
  // around — the app never reloads, so none of this updates on its own.
  useEffect(() => {
    document.title = album ? `${album.name} — Unkwnphoto` : "Unkwnphoto";

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = new URL(path, canonical.href).href;

    // The admin page is unlisted rather than forbidden: it isn't named in
    // robots.txt, which would only advertise it, so tell crawlers here.
    const ROBOTS_ID = "robots-meta";
    document.getElementById(ROBOTS_ID)?.remove();
    if (isAdmin) {
      const meta = document.createElement("meta");
      meta.id = ROBOTS_ID;
      meta.name = "robots";
      meta.content = "noindex, nofollow";
      document.head.appendChild(meta);
    }
  }, [album, path, isAdmin]);

  return (
    <div className={`app${isAdmin ? " app-admin" : ""}`}>
      <header className="site-header">
        <a {...linkProps("/")} className="wordmark">
          Unkwnphoto
        </a>
        {/* Visitors never see an admin entry — it appears only once signed in. */}
        {session.authenticated && !isAdmin && (
          <a {...linkProps("/admin")} className="header-link">
            Manage
          </a>
        )}
      </header>

      <main className="site-main">
        {route.name === "home" && (
          <Home
            albums={albums}
            photos={library.photos}
            loading={loading}
            error={loadError}
          />
        )}

        {route.name === "album" &&
          (album ? (
            <AlbumView album={album} photos={albumPhotos} />
          ) : loading ? (
            <div className="loading" aria-live="polite" />
          ) : (
            <div className="empty">
              <p className="empty-title">That album doesn't exist.</p>
              <p className="empty-body">
                <a {...linkProps("/")}>Back to all albums</a>
              </p>
            </div>
          ))}

        {isAdmin &&
          (loading ? (
            <div className="loading" aria-live="polite" />
          ) : session.authenticated ? (
            <Admin
              albums={albums}
              photos={library.photos}
              onChanged={refresh}
              onSignedOut={() => setSession((s) => ({ ...s, authenticated: false }))}
            />
          ) : (
            <Login
              configured={session.configured}
              onSignedIn={async () => {
                setSession((s) => ({ ...s, authenticated: true }));
                await refresh();
              }}
            />
          ))}

        {route.name === "notFound" && (
          <div className="empty">
            <p className="empty-title">Page not found.</p>
            <p className="empty-body">
              <a {...linkProps("/")}>Back to all albums</a>
            </p>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <span>© {new Date().getFullYear()} Unkwnphoto</span>
      </footer>
    </div>
  );
}
