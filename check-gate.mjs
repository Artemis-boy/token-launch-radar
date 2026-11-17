// Check the seven gate rows the scorer checks, from the output directory.
// Run from the repository root after main.ts wrote out/.
import fs from "node:fs";
import path from "node:path";
import { buildDossier } from "./vendor/makefun-board.ts";

const OUT = "out";
const SNAP = JSON.parse(fs.readFileSync("../token-radar-01-kit/input/snapshot.json", "utf8"));
const failures = [];
const ok = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures.push(name);
};

// 1. dashboard_files: index.html + >=1 css + >=1 js, <=400 files, <=4 MiB,
//    no http(s):// address in an attribute, style body, or JS import.
{
  const dir = path.join(OUT, "dashboard");
  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  const hasHtml = files.includes("index.html");
  const hasCss = files.some((f) => f.endsWith(".css"));
  const hasJs = files.some((f) => f.endsWith(".js"));
  const bytes = files.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
  let network = null;
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    if (f.endsWith(".html") && /<(?:[^>]+)(?:href|src)\s*=\s*["']https?:\/\//i.test(text)) network = f;
    if ((f.endsWith(".css") || f.endsWith(".js")) && /https?:\/\//.test(text)) network = f;
  }
  ok("dashboard_files", hasHtml && hasCss && hasJs && files.length <= 400 && bytes <= 4_194_304 && network === null,
    `${files.length} files, ${bytes} bytes${network ? `, network address in ${network}` : ""}`);
}

// 2. board_file + 3. sorted_by_value + 4. coverage + 5. farm_steps
{
  const board = JSON.parse(fs.readFileSync(path.join(OUT, "board.json"), "utf8"));
  const rows = board.rows ?? board;
  const slugs = new Set(SNAP.protocols.map((p) => p.slug));
  const unknown = rows.filter((r) => !slugs.has(r.slug)).slice(0, 5).map((r) => r.slug);
  ok("board_file", Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000 && unknown.length === 0,
    `${rows.length} rows${unknown.length ? `, unknown slugs: ${unknown.join(", ")}` : ""}`);
  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  const ranksOk = ranks.every((v, i) => v === i + 1);
  let orderOk = true;
  for (let i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) orderOk = false;
  const allSame = rows.length >= 2 && rows.every((r) => r.implied_value_usd === rows[0].implied_value_usd);
  ok("sorted_by_value", ranksOk && orderOk && !allSame, `ranks 1..${rows.length}, non-increasing implied value`);
  const missing = SNAP.watchlist.filter((s) => !new Set(rows.map((r) => r.slug)).has(s));
  ok("coverage", missing.length === 0, `${SNAP.watchlist.length - missing.length}/${SNAP.watchlist.length} watchlist slugs`);
  let bad = 0;
  for (const r of rows) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) bad++;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) bad++;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) bad++;
  }
  ok("farm_steps", bad === 0, bad === 0 ? "every row 3-12 steps of 20-600 chars" : `${bad} bad steps/values`);
}

// 6. screenshots: 3-4 images, <=512 KiB, whole PNG/JPEG, long side <=1440, short side >=800.
{
  const dir = path.join(OUT, "screenshots");
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  let detail = `${files.length} images`;
  let good = files.length >= 3 && files.length <= 4;
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    if (buf.length > 524_288) { good = false; detail += `, ${f} over 512 KiB`; }
    let w = 0, h = 0;
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      w = buf.readUInt32BE(16); h = buf.readUInt32BE(20);
    } else if (buf[0] === 0xff && buf[1] === 0xd8) {
      let off = 2;
      while (off < buf.length - 1) {
        if (buf[off] !== 0xff) break;
        const marker = buf[off + 1];
        const len = buf.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          h = buf.readUInt16BE(off + 5); w = buf.readUInt16BE(off + 7); break;
        }
        off += 2 + len;
      }
    } else { good = false; detail += `, ${f} is not PNG/JPEG`; }
    if (w === 0 || Math.max(w, h) > 1440 || Math.min(w, h) < 800) { good = false; detail += `, ${f} is ${w}x${h}`; }
  }
  ok("screenshots", good, detail);
}

// 7. dossier_matches: dossier.json is byte for byte what buildDossier writes.
{
  const written = fs.readFileSync(path.join(OUT, "dossier.json"));
  const rebuilt = buildDossier(OUT, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
  ok("dossier_matches", Buffer.from(rebuilt).equals(written), `${written.length} bytes`);
}

if (failures.length > 0) { console.error(`\n${failures.length} gate row(s) failing: ${failures.join(", ")}`); process.exit(1); }
console.log("\nall seven gate rows pass");
