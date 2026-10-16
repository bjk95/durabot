// Service worker: web push (D23) and an installable app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let msg = { title: "durabot", body: "", url: "/" };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Skip the notice when the owner already looks at this bot.
      if (list.some((c) => c.visibilityState === "visible" && c.url.endsWith(msg.url))) return;
      return self.registration.showNotification(msg.title, { body: msg.body, data: { url: msg.url }, icon: "/icon-192.png", tag: msg.url });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    }),
  );
});
