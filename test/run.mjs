/**
 * The suite, against a server it starts itself.
 *
 *   npm test
 *
 * Half of this is arithmetic off node 800:5314 rather than anything anybody
 * looked at: the cells are the width the file's cells come out at, the gaps are
 * the file's gaps, and the colours are the file's colours. A screen that has
 * drifted a couple of points from the design is exactly the kind of thing that
 * survives every glance and none of these.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));

function findChrome() {
  if (process.env.RAYL_CHROME) return process.env.RAYL_CHROME;
  const cache = path.join(os.homedir(), ".cache/puppeteer/chrome");
  if (fs.existsSync(cache)) {
    for (const build of fs.readdirSync(cache).sort().reverse()) {
      const found = path.join(
        cache,
        build,
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
      );
      if (fs.existsSync(found)) return found;
    }
  }
  for (const known of [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ]) {
    if (fs.existsSync(known)) return known;
  }
  throw new Error("no Chrome found — set RAYL_CHROME to one");
}

const port = await new Promise((resolve) => {
  const probe = net.createServer();
  probe.listen(0, () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});
const url = `http://localhost:${port}/`;
const server = spawn(
  "npx",
  ["vite", "--port", String(port), "--strictPort", "--clearScreen", "false"],
  { cwd: path.join(here, ".."), stdio: "ignore" },
);
const stop = () => server.kill();
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});
for (let tries = 0; tries < 60; tries++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: "new",
  args: ["--use-gl=angle"],
});
const page = await browser.newPage();
/* The phone it is for, at the size it gets when it has been added to the Home
   Screen — which is the only size this screen is designed at. */
await page.setViewport({
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const thrown = [];
page.on("pageerror", (e) => thrown.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") thrown.push(m.text().slice(0, 200));
});
await page.goto(url, { waitUntil: "networkidle0" });
await page.waitForFunction("window.rayl && window.rayl.wheel", {
  timeout: 20000,
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(2000);

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(
    `${ok ? "  ok  " : " FAIL "} ${name}${detail ? "  — " + detail : ""}`,
  );
};

const box = (selector) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);

const style = (selector, property) =>
  page.evaluate(
    ([selector, property]) =>
      getComputedStyle(document.querySelector(selector)).getPropertyValue(
        property,
      ),
    [selector, property],
  );

const shown = () =>
  page.evaluate(() => ({
    day: document.querySelector('.days .cell[data-on="true"]')?.dataset.index,
    month: document.querySelector('.months .cell[data-on="true"]')?.dataset
      .index,
    shifts: window.rayl.shifts.length,
    at: window.rayl.at,
  }));

const roll = (selector, by) =>
  page.evaluate(
    ([selector, by]) =>
      document
        .querySelector(selector)
        .scrollBy({ left: by, behavior: "instant" }),
    [selector, by],
  );

/* ------------------------------------------------------- off the design --- */

const near = (a, b, slack = 0.6) => Math.abs(a - b) <= slack;

const screen = await box(".screen");
check(
  "the column is 36 in from either side",
  near((await box(".mark")).x, 36),
  `the mark starts at ${(await box(".mark")).x.toFixed(1)}`,
);
check(
  "and the mark sits 65 down",
  near((await box(".mark")).y, 65),
  `${(await box(".mark")).y.toFixed(1)}`,
);
check(
  "the mark is 18.75 across",
  near((await box(".mark .glyph")).width, 18.75),
  `${(await box(".mark .glyph")).width.toFixed(2)}`,
);
check(
  "the bell is 11.382 by 12",
  near((await box(".mark .bell")).width, 11.382) &&
    near((await box(".mark .bell")).height, 12),
  `${(await box(".mark .bell")).width.toFixed(2)} by ${(await box(".mark .bell")).height.toFixed(2)}`,
);

const mark = await box(".mark");
const calendar = await box(".calendar");
check(
  "36 from the mark to the calendar",
  near(calendar.y - (mark.y + mark.height), 36),
  `${(calendar.y - mark.y - mark.height).toFixed(1)}`,
);

const cards = await box(".cards");
check(
  "36 from the calendar to the cards",
  near(cards.y - (calendar.y + calendar.height), 36),
  `${(cards.y - calendar.y - calendar.height).toFixed(1)}`,
);

const tabs = await box("nav.tabs");
check(
  "33 from the cards to the tabs",
  near(tabs.y - (cards.y + cards.height), 33),
  `${(tabs.y - cards.y - cards.height).toFixed(1)}`,
);

check(
  "the cells are the widths 330 comes out at",
  near((await box(".months .cell")).width, 95.333) &&
    near((await box(".days .cell")).width, 42) &&
    near((await box(".distance .cell")).width, 68),
  `${(await box(".months .cell")).width.toFixed(2)}, ${(await box(".days .cell")).width.toFixed(2)}, ${(await box(".distance .cell")).width.toFixed(2)}`,
);

check(
  "every rule is two across",
  near((await box(".months .rule")).width, 2) &&
    near((await box(".distance .rule")).width, 2) &&
    near((await box("nav.tabs .rule")).width, 2),
  `${(await box(".months .rule")).width.toFixed(1)} in the months, ${(await box("nav.tabs .rule")).width.toFixed(1)} in the tabs`,
);

check(
  "the distance rules are 32 tall",
  near((await box(".distance .rule")).height, 32),
  `${(await box(".distance .rule")).height.toFixed(1)}`,
);

check(
  "type is 12 at 0.24 tracking",
  (await style(".months .cell", "font-size")) === "12px" &&
    (await style(".months .cell", "letter-spacing")) === "0.24px",
  `${await style(".months .cell", "font-size")} / ${await style(".months .cell", "letter-spacing")}`,
);

check(
  "the calendar is off-white and the tabs are black",
  (await style(".months .cell", "color")) === "rgb(234, 234, 229)" &&
    (await style("nav.tabs .tab", "color")) === "rgb(63, 63, 59)",
  `${await style(".months .cell", "color")} / ${await style("nav.tabs .tab", "color")}`,
);

check(
  "the chosen day is the black block with the green rule",
  (await style('.days .cell[data-on="true"]', "background-color")) ===
    "rgb(63, 63, 59)" &&
    (await style('.days .cell[data-on="true"] .bar', "background-color")) ===
      "rgb(216, 222, 185)",
  `${await style('.days .cell[data-on="true"]', "background-color")}, rule ${await style('.days .cell[data-on="true"] .bar', "background-color")}`,
);

check(
  "and nothing else carries a state",
  await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        ".months .cell, .distance .cell, nav.tabs .tab",
      ),
    ].every((cell) => getComputedStyle(cell).opacity === "1"),
  ),
  "months, distances and tabs all at full opacity, as the file has them",
);

/* ------------------------------------------------------------ the rails --- */

const today = new Date();
check(
  "it opens on today",
  await page.evaluate(
    () => window.rayl.calendar.days[window.rayl.chosen].today,
  ),
  `${(await shown()).day}`,
);

const start = await shown();
for (let i = 0; i < 11; i++) {
  await roll("#days", 48);
  await wait(80);
}
await wait(600);
const later = await shown();
check(
  "scrolling the days moves the day",
  later.day !== start.day,
  `${start.day} -> ${later.day}`,
);
check(
  "and the month comes with it off the end of itself",
  later.month !== start.month,
  `month ${start.month} -> ${later.month}`,
);
check(
  "a day's shifts come with the day",
  later.shifts >= 3 && later.shifts <= 6,
  `${later.shifts} shifts`,
);

await roll("#months", -102);
await wait(900);
const back = await shown();
check(
  "scrolling the month corrects the day",
  back.month === start.month &&
    (await page.evaluate(
      () => window.rayl.calendar.days[window.rayl.chosen].month,
    )) === Number(back.month),
  `month ${later.month} -> ${back.month}, day ${later.day} -> ${back.day}`,
);

/* ------------------------------------------------------------- the cards --- */

const step = await page.evaluate(
  () => document.querySelector("#reel > i").getBoundingClientRect().height,
);
check(
  "a stop in the reel is a card on screen",
  step > 60 && step < 300,
  `${step.toFixed(1)}px, against a card ${(393 - 72).toFixed(0)} wide`,
);

await page.evaluate((step) => {
  document.getElementById("reel").scrollBy({ top: step, behavior: "instant" });
}, step);
await wait(400);
check(
  "scrolling the reel turns the wheel",
  Math.abs((await shown()).at - 1) < 0.02,
  `the wheel is at ${(await shown()).at.toFixed(3)}`,
);

/* The middle is the selection, which is the whole arrangement: whichever card
   the reel stopped on has to be the one nearest the middle of the picture. */
const middle = await page.evaluate(() => {
  const near = window.rayl.wheel.cards
    .map((card, index) => ({
      index,
      y: Math.abs(card.position.y),
      on: card.visible,
    }))
    .filter((card) => card.on)
    .sort((a, b) => a.y - b.y);
  return { nearest: near[0].index, stoppedOn: Math.round(window.rayl.at) };
});
check(
  "and the card in the middle is the one it stopped on",
  middle.nearest === middle.stoppedOn,
  `stopped on ${middle.stoppedOn}, nearest the middle is ${middle.nearest}`,
);

/* ----------------------------------------------------------- the haptics --- */

check(
  "there is a switch to ring",
  await page.evaluate(() => {
    const box = document.getElementById("haptic");
    return Boolean(
      box && box.type === "checkbox" && box.hasAttribute("switch"),
    );
  }),
  "iOS has no vibration API; a switch is the only thing that ticks",
);

check("nothing was thrown", thrown.length === 0, thrown.join(" | "));

await browser.close();
stop();
console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
