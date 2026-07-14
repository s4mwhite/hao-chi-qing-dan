import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the food notebook", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /好吃清单/);
  assert.match(html, /私人清单/);
  assert.match(html, /正在打开清单/);
  assert.doesNotMatch(html, /预计时间|难度/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("uses the documented map search flow and restaurant photo library", async () => {
  const [page, mapPicker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MapPicker.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /地点 \/ 商圈/);
  assert.match(page, /multiple/);
  assert.match(page, /设为封面/);
  assert.match(mapPicker, /geocoder\.getLocation/);
  assert.match(mapPicker, /placeSearch\.search/);
  assert.match(mapPicker, /event\.preventDefault\(\)/);
});
