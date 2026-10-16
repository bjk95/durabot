import { SearchX, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icon-192.png" },
];

export const meta: Route.MetaFunction = () => [
  { title: "durabot" },
  { name: "theme-color", content: "#f2f2f7", media: "(prefers-color-scheme: light)" },
  { name: "theme-color", content: "#000000", media: "(prefers-color-scheme: dark)" },
  { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return <Outlet />;
}

/** Calm error screens: a symbol tile, a title, one sentence, one button. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const Icon = notFound ? SearchX : TriangleAlert;
  const title = notFound ? "Page not found" : "Something went wrong";
  let text = notFound ? "This page does not exist. It may have been deleted." : "Something went wrong on our side. Try again in a moment.";
  if (!notFound && error instanceof Error && import.meta.env.DEV) text = error.message;
  return (
    <div className="screen">
      <div className="center-pg">
        <div className="empty" role="alert">
          <span className="logo" style={{ width: 64, height: 64, borderRadius: 20 }}>
            <Icon className="i" width={30} height={30} strokeWidth={1.8} />
          </span>
          <h1>{title}</h1>
          <p>{text}</p>
          {notFound ? (
            <Link to="/" className="btn btn-primary" style={{ marginTop: 16 }}>
              Go to your bots
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => location.reload()}>
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
