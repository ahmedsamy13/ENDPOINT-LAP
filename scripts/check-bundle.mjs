import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const assets = await readdir("dist/assets");
const records = [];
for (const name of assets.filter(
  (n) => n.endsWith(".js") || n.endsWith(".css"),
)) {
  const data = await readFile(`dist/assets/${name}`);
  records.push({ name, bytes: data.length, gzipBytes: gzipSync(data).length });
}
const editor = records.find((r) => r.name.startsWith("Editor-"));
const total = records.reduce((n, r) => n + r.bytes, 0);
const html = await readFile("dist/index.html", "utf8");
const entry = html.match(/src="\/assets\/([^\"]+\.js)"/)?.[1];
const initial = records.find((r) => r.name === entry);
const checks = {
  initialEntryUnder150KiBGzip: !!initial && initial.gzipBytes < 150 * 1024,
  lazyEditorUnder220KiBGzip: !!editor && editor.gzipBytes < 220 * 1024,
  totalAssetsUnder1500KiB: total < 1500 * 1024,
};
const result = { records, totalBytes: total, checks };
try {
  result.nativeReleaseBytes = (
    await stat("src-tauri/target/release/endpoint-lap")
  ).size;
} catch {}
console.log(JSON.stringify(result, null, 2));
if (Object.values(checks).some((v) => !v)) process.exitCode = 1;
