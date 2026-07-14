import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import worker from "../dist/server/index.js";

const response = await worker.fetch(
  new Request("https://pages.local/"),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (!response.ok) throw new Error(`Unable to render the homepage: ${response.status}`);

let html = await response.text();
html = html
  .replaceAll("http://localhost:3000/og.png", "./og.png")
  .replaceAll("https://pages.local/og.png", "https://s4mwhite.github.io/hao-chi-qing-dan/og.png")
  .replace('self.__VINEXT_RSC_NAV__={"pathname":"/","searchParams":[]}', 'self.__VINEXT_RSC_NAV__={"pathname":"/hao-chi-qing-dan/","searchParams":[]}')
  .replaceAll("/assets/", "./assets/");

await rm(new URL("../docs/", import.meta.url), { recursive: true, force: true });
await mkdir(new URL("../docs/", import.meta.url), { recursive: true });
await cp(new URL("../dist/client/assets/", import.meta.url), new URL("../docs/assets/", import.meta.url), { recursive: true });
await cp(new URL("../dist/client/og.png", import.meta.url), new URL("../docs/og.png", import.meta.url));
await writeFile(new URL("../docs/index.html", import.meta.url), html);
await writeFile(new URL("../docs/.nojekyll", import.meta.url), "");

console.log("GitHub Pages files written to docs/");
