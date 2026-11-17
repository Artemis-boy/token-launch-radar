// Verify the dashboard page and the board agree: for every row of
// board.json, the page's own farmSteps and impliedOf must reproduce the
// board's farm_steps and implied_value_usd exactly.
// Run from the repository root after main.ts wrote out/.
import vm from "node:vm";
import fs from "node:fs";

const board = JSON.parse(fs.readFileSync("out/board.json", "utf8")).rows;
const dataSrc = fs.readFileSync("out/data.js", "utf8");
const appSrc = fs.readFileSync("dashboard/app.js", "utf8");

// Minimal browser stubs: the page guards on #board, so rendering is skipped.
const windowStub = {
  location: { hash: "", pathname: "/dashboard/index.html", search: "" },
  history: { replaceState() {} },
  addEventListener() {},
};
const documentStub = {
  getElementById: () => null,
  createElement: () => { throw new Error("no DOM in test"); },
};
const ctx = vm.createContext({ window: windowStub, document: documentStub, console, URLSearchParams });
vm.runInContext(dataSrc, ctx);
vm.runInContext(appSrc, ctx);

const dev = windowStub.RADAR_DEV;
if (!dev) { console.error("RADAR_DEV not exposed"); process.exit(1); }

let stepMismatch = 0;
let valueMismatch = 0;
for (const row of board) {
  const steps = dev.farmSteps(row);
  if (JSON.stringify(steps) !== JSON.stringify(row.farm_steps)) {
    stepMismatch++;
    if (stepMismatch <= 3) console.log("step mismatch:", row.slug);
  }
  if (dev.impliedOf(row) !== row.implied_value_usd) {
    valueMismatch++;
    if (valueMismatch <= 3) console.log("value mismatch:", row.slug, dev.impliedOf(row), "vs", row.implied_value_usd);
  }
}
console.log(`rows checked: ${board.length}`);
console.log(`farm-step mismatches: ${stepMismatch}`);
console.log(`implied-value mismatches: ${valueMismatch}`);
if (stepMismatch > 0 || valueMismatch > 0) process.exit(1);
console.log("page and board agree");
