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
  const [session, setSession] = useState<SessionState>({
    authenticated: false,
    configured: false
  });

  const path = usePath();
  const route = parseRoute(path);

  const refresh = useCallback(async () => {
    setLibrary(await getLibrary());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [lib, sess] = await Promise.all([getLibrary(), getSession()]);
      if (cancelled) return;
      setLibrary(lib);
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

  // Keep the tab title meaningful as you move around.
  useEffect(() => {
    document.title = album ? `${album.name} — Unkwnphoto` : "Unkwnphoto";
  }, [album]);

  const isAdmin = route.name === "admin";

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
          <Home albums={albums} photos={library.photos} loading={loading} />
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
