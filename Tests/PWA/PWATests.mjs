import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateManifest } from "../../docs/data-service.js";
import { secureRandomInteger } from "../../docs/random.js";

test("production manifest is valid", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../docs/manifest.json", import.meta.url), "utf8"));
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.categories.map((category) => category.id), ["when", "where", "who", "action"]);
});

test("logline manifest contains six curated categories", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../docs/logline/manifest.json", import.meta.url), "utf8"));
  assert.equal(validateManifest(manifest), manifest);
  assert.deepEqual(manifest.categories.map((category) => category.id), [
    "protagonists",
    "desires",
    "daily_triggers",
    "phenomena",
    "settings",
    "scales",
  ]);
  assert.deepEqual(
    manifest.categories.map((category) => category.files.reduce((total, file) => total + file.count, 0)),
    [619, 300, 300, 311, 632, 100],
  );
});

test("secure random integer stays inside the requested range", () => {
  for (const maximum of [1, 2, 3, 10, 1_000, 100_000]) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const value = secureRandomInteger(maximum);
      assert.ok(value >= 0 && value < maximum);
    }
  }
});

test("secure random integer rejects modulo-biased values", () => {
  const supplied = [0xffff_ffff, 5];
  let calls = 0;
  const cryptoProvider = {
    getRandomValues(buffer) {
      buffer[0] = supplied[calls];
      calls += 1;
      return buffer;
    },
  };
  assert.equal(secureRandomInteger(10, cryptoProvider), 5);
  assert.equal(calls, 2);
});

test("web manifest references existing icon files", async () => {
  const webManifest = JSON.parse(await readFile(new URL("../../docs/manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(webManifest.display, "standalone");
  for (const icon of webManifest.icons) {
    const data = await readFile(new URL(`../../docs/${icon.src}`, import.meta.url));
    assert.ok(data.length > 0);
  }
});

test("service worker shell references existing files", async () => {
  const worker = await readFile(new URL("../../docs/service-worker.js", import.meta.url), "utf8");
  const paths = [...worker.matchAll(/^\s+"\.\/(.+)",$/gm)].map((match) => match[1]);
  assert.ok(paths.length >= 10);
  for (const path of paths) {
    const data = await readFile(new URL(`../../docs/${path}`, import.meta.url));
    assert.ok(data.length > 0, path);
  }
});
