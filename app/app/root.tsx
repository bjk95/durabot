import { useEffect } from "react";
import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
  { rel: "apple-touch-icon", href: "/icon-192.png" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&display=swap",
  },
];

export const meta: Route.MetaFunction = () => [
  { title: "durabot" },
  { name: "theme-color", content: "#3b4cca" },
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : "Error";
    details = error.status === 404 ? "This page does not exist." : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="mx-auto max-w-xl p-6 pt-16">
      <h1 className="text-xl font-semibold">{message}</h1>
      <p className="mt-2 text-muted">{details}</p>
      <Link to="/" className="mt-4 inline-block text-accent underline">
        Back to bots
      </Link>
    </main>
  );
}
