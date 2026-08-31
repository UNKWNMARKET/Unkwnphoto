import { useEffect, useState } from "react";

// A ~30-line router. A portfolio has three kinds of page; pulling in a routing
// library for that would be more code than the site.

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return path;
}

export function navigate(to: string): void {
  if (to === window.location.pathname) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}

/** Intercepts a normal left-click so in-app links don't reload the page. */
export function linkProps(to: string) {
  return {
    href: to,
    onClick: (e: React.MouseEvent) => {
      // Let modified clicks (new tab, download, middle-click) behave normally.
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if ((e as unknown as MouseEvent).button !== 0) return;
      e.preventDefault();
      navigate(to);
    }
  };
}

export interface Route {
  name: "home" | "album" | "admin" | "notFound";
  albumId?: string;
}

export function parseRoute(path: string): Route {
  if (path === "/" || path === "") return { name: "home" };
  if (path === "/admin" || path === "/admin/") return { name: "admin" };
  const album = path.match(/^\/a\/([^/]+)\/?$/);
  if (album) return { name: "album", albumId: decodeURIComponent(album[1]) };
  return { name: "notFound" };
}
