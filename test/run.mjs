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
  "and the mark sits 24 under the status bar",
  near((await box(".mark")).y, 24),
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
  "36 from the cards to the tabs",
  near(tabs.y - (cards.y + cards.height), 36),
  `${(tabs.y - cards.y - cards.height).toFixed(1)}`,
);

/*
 * The ticks: four of them, two across and six tall, at the middle of the
 * column, above and below every rail. They are how the screen says where the
 * choosing happens, and without them the middle is a convention you have to be
 * told about rather than a place you can see.
 */
const ticks = await page.evaluate(() => {
  const column = document.querySelector(".calendar").getBoundingClientRect();
  return [...document.querySelectorAll(".calendar .tick")].map((t) => {
    const r = t.getBoundingClientRect();
    return {
      width: +r.width.toFixed(1),
      height: +r.height.toFixed(1),
      off: +(r.x + r.width / 2 - (column.x + column.width / 2)).toFixed(1),
    };
  });
});
check(
  "a tick above and below every rail",
  ticks.length === 4,
  `${ticks.length}`,
);
check(
  "two across, six tall, dead centre",
  ticks.every((t) => near(t.width, 2) && near(t.height, 6) && near(t.off, 0)),
  ticks.map((t) => `${t.width}x${t.height} at ${t.off}`).join("; "),
);
check(
  "and the calendar comes to 178",
  near((await box(".calendar")).height, 178, 2),
  `${(await box(".calendar")).height.toFixed(1)}`,
);

/*
 * The cells are shares of the column, not the pixel widths those shares come to
 * at the 402 the file is drawn at.
 *
 * Every cell in these rows is flex-1 in the file. Pinned to 95.333, 42 and 68,
 * they overflow the 321 a 393 phone leaves — which is how a distance row that
 * comes to exactly one column ended up scrolling with its last chip over the
 * edge. At 330 these come back to the file's own numbers.
 */
const column = (await box(".calendar")).width;
const share = (rules, gaps, cells) => (column - rules * 2 - gaps * 6) / cells;
check(
  "the cells are equal shares of the column",
  near((await box(".months .cell")).width, share(4, 6, 3)) &&
    near((await box(".days .cell")).width, share(0, 6, 7)) &&
    near((await box(".distance .cell")).width, share(4, 6, 3)),
  `${(await box(".months .cell")).width.toFixed(2)}, ${(await box(".days .cell")).width.toFixed(2)}, ${(await box(".distance .cell")).width.toFixed(2)} of a ${column.toFixed(0)} column`,
);

check(
  "every rule is two across",
  near((await box(".months .rule")).width, 2) &&
    near((await box(".distance .rule")).width, 2) &&
    near((await box("nav.tabs .rule")).width, 2),
  `${(await box(".months .rule")).width.toFixed(1)} in the months, ${(await box("nav.tabs .rule")).width.toFixed(1)} in the tabs`,
);

/*
 * Where the rules land in the column, which is arithmetic and not a look.
 *
 * Three months of 95.333 with four rules of 2 and six gaps of 6 comes to 330,
 * and four distances of 68 with five rules and eight gaps comes to 330 as well.
 * So both rows sit flush in the column with a rule at each end — and the day
 * the distance row was centre-padded like a row that scrolls, it sat 41 points
 * off and the last chip fell out of the column.
 */
const ruleRun = (selector) =>
  page.evaluate((selector) => {
    const rail = document.querySelector(selector);
    const box = rail.getBoundingClientRect();
    return [...rail.querySelectorAll(".rule")]
      .map((r) => +(r.getBoundingClientRect().x - box.x).toFixed(1))
      .filter((x) => x >= -2 && x <= box.width + 2);
  }, selector);

const distanceRules = await ruleRun(".distance");
check(
  "the distances land on the months' own lines",
  distanceRules.length === 4 &&
    near(distanceRules[0], 0, 1) &&
    near(distanceRules[3], column - 2, 1.5),
  `${distanceRules.map((x) => x.toFixed(0)).join(", ")} across ${column.toFixed(0)}`,
);

check(
  "and that row scrolls, because there are more than three",
  await page.evaluate(() => {
    const rail = document.getElementById("distance");
    return rail.scrollWidth > rail.clientWidth + 1;
  }),
  "it fits, so there is nowhere to scroll to",
);

const monthRules = await ruleRun(".months");
check(
  "and so do the months",
  monthRules.length === 4 &&
    near(monthRules[0], 0, 1) &&
    near(monthRules[3], column - 2, 1.5),
  `${monthRules.map((x) => x.toFixed(0)).join(", ")} across ${column.toFixed(0)}`,
);

check(
  "the days carry no rules between them",
  (await ruleRun(".days")).length === 0,
  "seven cells and nothing between them, as the file has it",
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

/*
 * And it does not stop to compile anything while it is being scrolled.
 *
 * This is what choppy was. `transparent` is baked into three's program, so a
 * card flipping to see-through as it reached the arc's edge recompiled its
 * shader — mid-flick, several times a gesture, each one a stall you can feel.
 * The materials are see-through from the moment they are made now, and opacity
 * is a uniform.
 */
const flick = await page.evaluate(async () => {
  const reel = document.getElementById("reel");
  const step = reel.children[0].getBoundingClientRect().height;
  let programs = window.rayl.renderer.info.programs.length;
  let recompiles = 0;
  const times = [];
  await new Promise((done) => {
    let frames = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      times.push(now - last);
      last = now;
      reel.scrollTop += step / 8;
      const count = window.rayl.renderer.info.programs.length;
      if (count !== programs) {
        recompiles++;
        programs = count;
      }
      if (++frames < 80) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
  });
  const sorted = times.slice(5).sort((a, b) => a - b);
  return {
    recompiles,
    median: sorted[Math.floor(sorted.length / 2)],
    calls: window.rayl.renderer.info.render.calls,
  };
});
check(
  "nothing is compiled while the cards are scrolled",
  flick.recompiles === 0,
  `${flick.recompiles} recompiles over eighty frames`,
);
check(
  "and a frame is inside the budget",
  flick.median < 20,
  `${flick.median.toFixed(1)}ms median, ${flick.calls} draw calls`,
);

/*
 * A month arrives in one move.
 *
 * It used to walk: a smooth scroll of the days, one day at a time from here to
 * there, every one of them a day chosen, a rota built and a tick rung — which
 * is what "it bugs on" was. The days are put where they belong now, so a month
 * away is one day laid out and not thirty.
 */
const before = await page.evaluate(() => window.rayl.built);
await roll("#months", 102);
await wait(1200);
const after = await page.evaluate(() => window.rayl.built);
check(
  "a month away is one day laid out, not thirty",
  after - before <= 2,
  `${after - before} days built crossing a month`,
);

/*
 * And the wheel opens out at the ends of a list.
 *
 * At rest the chosen card is the first one, so centring it leaves the top half
 * of the frame empty — which reads as a list that has lost something rather
 * than a list at its start. Flat and leaning, the first card sits at the top
 * and the rest run down the frame; a card in and it has curled back to its own
 * radius with the chosen one in the middle.
 */
const opening = await page.evaluate(() => {
  const reel = document.getElementById("reel");
  reel.scrollTop = 0;
  window.rayl.draw?.();
  return null;
});
await wait(500);
const atRest = await page.evaluate(() => ({
  curl: window.rayl.curl(),
  first: window.rayl.wheel.cards[0].position.y,
  second: window.rayl.wheel.cards[1].position.y,
}));
check(
  "at rest the wheel is flat and the first card is at the top",
  atRest.curl < 0.05 && atRest.first > 0.2 && atRest.second < atRest.first,
  `curl ${atRest.curl.toFixed(2)}, first card at y ${atRest.first.toFixed(2)}`,
);

await page.evaluate(() => {
  const reel = document.getElementById("reel");
  reel.scrollTop = reel.children[0].getBoundingClientRect().height * 2;
});
await wait(600);
const inside = await page.evaluate(() => ({
  curl: window.rayl.curl(),
  chosen: Math.abs(
    window.rayl.wheel.cards[Math.round(window.rayl.at)].position.y,
  ),
}));
check(
  "and inside the list it has curled, with the chosen card in the middle",
  inside.curl > 0.9 && inside.chosen < 0.02,
  `curl ${inside.curl.toFixed(2)}, chosen card at y ${inside.chosen.toFixed(3)}`,
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
