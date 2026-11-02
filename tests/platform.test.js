import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createAppServer } from "../server.mjs";
import { safeStreamUrl } from "../pomodoro-pwa/src/services.js";
test("audio rejects insecure and executable URLs", () => {
  for (const url of [
    "javascript:alert(1)",
    "http://radio.test",
    "data:audio/mp3,x",
    "https://name:secret@radio.test",
  ])
    assert.equal(safeStreamUrl(url), null);
  assert.equal(
    safeStreamUrl("https://radio.test/live"),
    "https://radio.test/live",
  );
});
test("service worker isolates its cache and excludes external requests and APIs", async () => {
  const events = {},
    deleted = [],
    intercepted = [];
  let pending;
  const scope = "https://example.test/pomodoro/";
  const context = {
    URL,
    Set,
    Promise,
    self: {
      registration: { scope },
      location: new URL(scope),
      clients: { claim: async () => {} },
      addEventListener: (name, callback) => {
        events[name] = callback;
      },
    },
    caches: {
      keys: async () => [
        "another-app",
        "pomodoro-v3",
        `pomodoro-study:${scope}:v1`,
        `pomodoro-study:https://example.test/other/:v1`,
      ],
      delete: async (key) => deleted.push(key),
      open: async () => ({ match: async () => "cached", addAll: async () => {}, put: async () => {} }),
    },
    fetch: async () => "network",
  };
  vm.runInNewContext(
    await readFile(new URL("../pomodoro-pwa/sw.js", import.meta.url), "utf8"),
    context,
  );
  events.activate({
    waitUntil: (p) => {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(deleted, [`pomodoro-study:${scope}:v1`]);
  for (const url of [
    scope + "src/app.js",
    "https://api.open-meteo.com/",
    scope + "api/notion",
    "https://radio.test/live",
  ]) {
    events.fetch({
      request: { method: "GET", url },
      respondWith: (p) => intercepted.push(p),
    });
  }
  assert.equal(intercepted.length, 0);
  events.fetch({
    request: { method: "GET", url: scope + "assets/app.js" },
    respondWith: (p) => intercepted.push(p),
  });
  assert.equal(intercepted.length, 1);
  assert.equal(await intercepted[0], "cached");
});
test("static server serves the app and refuses files outside its root and mutations", async (t) => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const index = await fetch(url);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Encontre seu ritmo/);
  assert.equal((await fetch(url + "/%2e%2e%2fpackage.json")).status, 404);
  assert.equal((await fetch(url + "/.env")).status, 404);
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  const manifest = await (await fetch(url + "/manifest.json")).json();
  for (const asset of manifest.icons)
    assert.equal((await fetch(url + "/" + asset.src)).status, 200);
});
