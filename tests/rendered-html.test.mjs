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
  const [page, mapPicker, backend, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MapPicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /地点 \/ 商圈/);
  assert.match(page, /multiple/);
  assert.match(page, /设为封面/);
  assert.match(page, /token=\{sessionToken\}/);
  assert.match(mapPicker, /api\/map\/search/);
  assert.match(mapPicker, /setZoomAndCenter\(17/);
  assert.match(mapPicker, /setTimeout\(\(\) => runSearchRef\.current\(keyword\), 700\)/);
  assert.match(mapPicker, /setSearchResults/);
  assert.match(mapPicker, /onChangeRef\.current\(\{ address/);
  assert.match(mapPicker, /event\.preventDefault\(\)/);
  assert.match(backend, /\/api\/map\/search/);
  assert.match(backend, /\/v3\/place\/around/);
  assert.match(backend, /\/v3\/place\/text/);
  assert.match(styles, /food-dialog::-webkit-scrollbar/);
});

test("normalizes AMap POI coordinates for automatic map positioning", async () => {
  const { normalizedAmapPois } = await import("../backend/src/index.ts");
  assert.deepEqual(normalizedAmapPois({
    pois: [{
      id: "B00155MLL2",
      name: "和平饭店",
      pname: "上海市",
      cityname: "上海市",
      adname: "黄浦区",
      address: "南京东路20号",
      location: "121.489233,31.239098",
    }],
  }), [{
    id: "B00155MLL2",
    name: "和平饭店",
    address: "和平饭店 · 上海市黄浦区南京东路20号",
    longitude: 121.489233,
    latitude: 31.239098,
  }]);
});
