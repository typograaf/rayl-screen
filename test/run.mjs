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
const tabs = await box("nav.tabs");

/*
 * The cards keep the file's 36 either side of them, and the box does not.
 *
 * The picture takes the gap above it and the gap below it, because that is the
 * only room there is for a card to fade in: three cards to a frame is what this
 * screen holds and three fill it to within a couple of points, so a picture cut
 * to the box has its outer two hard against the edges and they go out like a
 * light. Nothing moves for it. The card at the top of the frame stands where it
 * always stood, which is the file's 36 and the head start the fade takes on top
 * of it, and the one at the bottom stands the same distance off the tabs.
 */
const air = await page.evaluate(() => {
  const box = document.querySelector(".cards").getBoundingClientRect();
  const reel = document.getElementById("reel");
  const view = window.rayl.camera;
  const tall = box.height / (view.top - view.bottom);
  /* A card's own height on screen: a stop in the reel less the air in it. */
  const high = reel.children[0].getBoundingClientRect().height / 1.1;
  const middle = box.top + box.height / 2;
  const showing = window.rayl.wheel.cards
    .filter((card) => card.visible && card.material.opacity > 0.5)
    .map((card) => card.position.y);
  return {
    over:
      middle -
      Math.max(...showing) * tall -
      high / 2 -
      document.querySelector(".calendar").getBoundingClientRect().bottom,
    under:
      document.querySelector("nav.tabs").getBoundingClientRect().top -
      (middle - Math.min(...showing) * tall + high / 2),
    cards: showing.length,
  };
});
check(
  "the cards stand clear of the calendar and the tabs",
  air.over > 36 && air.under > 36 && Math.abs(air.over - air.under) < 1,
  `${air.over.toFixed(1)} above and ${air.under.toFixed(1)} below, on the file's 36`,
);
check(
  "and the box the picture is drawn in takes those gaps",
  Math.abs(cards.y - (calendar.y + calendar.height)) < 0.5 &&
    Math.abs(tabs.y - (cards.y + cards.height)) < 0.5,
  `the picture runs from the calendar to the tabs, and the cards keep their air inside it`,
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
  later.shifts >= 8 && later.shifts <= 14,
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

/* Three cards in, where the wheel has finished curling and the middle means
   what it says — the opening out takes two and a half. */
await page.evaluate((step) => {
  document
    .getElementById("reel")
    .scrollBy({ top: step * 3, behavior: "instant" });
}, step);
await wait(400);
check(
  "scrolling the reel turns the wheel",
  Math.abs((await shown()).at - 3) < 0.05,
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
  /* Counted from the day's own first card: the ones before it on the drum are
     the day before's. */
  return {
    nearest: near[0].index - window.rayl.origin,
    stoppedOn: Math.round(window.rayl.at),
  };
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
 * The card that is chosen is in the middle, wherever in the list it is.
 *
 * The wheel used to flatten and lean at either end, so the first card sat at
 * the top of the frame and the last at the bottom rather than one card in the
 * middle of a half-empty frame. That filled the first screen and cost every
 * screen after it: the lean is only spent two and a half cards in, so every
 * card chosen before that came to rest somewhere other than the middle — the
 * picture pushed down, a gap above it, the card below pushed out of the frame.
 * The middle is what is chosen, so the middle is where it goes.
 */
const rests = await page.evaluate(async () => {
  const reel = document.getElementById("reel");
  const step = reel.children[0].getBoundingClientRect().height;
  const stops = reel.children.length - 1;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  reel.dispatchEvent(new Event("touchstart"));
  const seen = [];
  for (const on of [0, 1, 2, Math.floor(stops / 2), stops - 1, stops]) {
    reel.scrollTop = step * on;
    await frame();
    await frame();
    seen.push({
      on,
      y: window.rayl.wheel.cards[window.rayl.origin + on].position.y,
      /* What the frame holds at that rest, top first. */
      showing: window.rayl.wheel.cards
        .filter((card) => card.visible && card.material.opacity > 0.05)
        .map((card) => +card.position.y.toFixed(3))
        .sort((a, b) => b - a),
    });
  }
  reel.dispatchEvent(new Event("touchend"));
  return seen;
});
const off = Math.max(...rests.map((r) => Math.abs(r.y)));
check(
  "the chosen card is in the middle wherever in the list it is",
  off < 0.005,
  `the furthest any of six rests came to rest from the middle is ${(off * 1000).toFixed(1)} thousandths of a card`,
);

/*
 * And every rest is the same picture — the ends of the list included.
 *
 * Three cards in the same three places, whichever card is chosen. The frame
 * holds about three and a list has to fill it at its own ends too, where there
 * is nothing above the first card and nothing below the last. It is a rota,
 * though, and there is no such thing as nothing above the first shift of a day:
 * there is the last shift of the day before, and the drum carries two of those
 * at either end.
 */
const spread = Math.max(
  ...rests.flatMap((r) =>
    r.showing.map((y, i) => Math.abs(y - rests[0].showing[i])),
  ),
);
check(
  "and every rest is the same picture, the ends of the list included",
  rests.every((r) => r.showing.length === 3) && spread < 0.005,
  `all ${rests.length} rests hold three cards, within ${(spread * 1000).toFixed(1)} thousandths of each other`,
);

/*
 * And nothing is ever cut by the edge of the frame.
 *
 * The drum's own fade is a card turning away, which is the whole story at its
 * own radius. Fading a card by how much of it is already past an edge only dims
 * it — a card three-quarters on at half opacity is still a card with a straight
 * edge sawn through it — so the fade is over the last margin inside the frame
 * instead, and it is spent by the time the card's own edge arrives at the
 * frame's.
 */
const cut = await page.evaluate(async () => {
  const reel = document.getElementById("reel");
  const step = reel.children[0].getBoundingClientRect().height;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const stops = reel.children.length - 1;
  reel.dispatchEvent(new Event("touchstart"));
  let worst = -Infinity;
  for (let i = 0; i <= 40; i++) {
    reel.scrollTop = (step * stops * i) / 40;
    await frame();
    await frame();
    const edge = window.rayl.camera.top;
    const tall = 1 / 2.5776; /* CARD_HEIGHT, near enough for a bound */
    for (const card of window.rayl.wheel.cards) {
      if (!card.visible || card.material.opacity <= 0.02) continue;
      const out = (Math.abs(card.position.y) + tall / 2 - edge) / tall;
      if (out > worst) worst = out;
    }
  }
  reel.dispatchEvent(new Event("touchend"));
  return { worst };
});
check(
  "nothing is ever cut by the edge of the frame",
  cut.worst <= 0.01,
  cut.worst <= 0
    ? `the nearest anything showing ever came to an edge is ${(-cut.worst * 100).toFixed(0)}% of a card inside it`
    : `${(cut.worst * 100).toFixed(0)}% of a card was left showing past an edge`,
);

/*
 * The picture is the box, whatever the box does afterwards.
 *
 * A phone's safe areas do not arrive with the first layout: the web view lays
 * out once with nothing at the top and the inset turns up a moment later.
 * Nothing about the window changed, so nothing said so — and three writes the
 * canvas's size onto the element as well as onto its buffer, where an inline
 * style beats the sheet. So the column moved down by the notch and the picture
 * stayed the size it had been: a wheel drawn half an inset lower than the frame
 * it is in, with that much of it cut off the bottom. Everything that read as
 * sitting too low, or as the last card being clipped, was this.
 */
const late = await page.evaluate(async () => {
  const screen = document.querySelector(".screen");
  const canvas = document.getElementById("stage");
  const look = () => {
    const box = document.querySelector(".cards").getBoundingClientRect();
    const seen = canvas.getBoundingClientRect();
    return {
      out: Math.abs(seen.top + seen.height / 2 - (box.top + box.height / 2)),
      tall: Math.abs(seen.height - box.height),
      /* The buffer is capped at two to the point, which is the renderer's own
         limit and not a mismatch. */
      buffer: Math.abs(
        canvas.height / Math.min(devicePixelRatio, 2) - box.height,
      ),
    };
  };
  const before = look();
  /* An inset arriving, which is what a phone does. */
  screen.style.paddingTop = "120px";
  await new Promise((r) => setTimeout(r, 400));
  const after = look();
  screen.style.paddingTop = "";
  await new Promise((r) => setTimeout(r, 400));
  return { before, after, back: look(), style: canvas.style.height };
});
check(
  "the picture is the box it is drawn in",
  late.before.out < 0.5 && late.before.tall < 0.5 && late.before.buffer < 1,
  `middle out by ${late.before.out.toFixed(2)}, height by ${late.before.tall.toFixed(2)}, buffer by ${late.before.buffer.toFixed(2)}`,
);
check(
  "and it still is when the notch arrives late",
  late.after.out < 0.5 &&
    late.after.tall < 0.5 &&
    late.after.buffer < 1 &&
    late.back.out < 0.5 &&
    late.style === "",
  `middle out by ${late.after.out.toFixed(2)}, height by ${late.after.tall.toFixed(2)}, buffer by ${late.after.buffer.toFixed(2)}, style "${late.style}"`,
);

/*
 * The picture is the screen's width and the cards on it are the column's.
 *
 * A column of cards that stops at the column's own edge is a column cut off 36
 * points early in mid-air, so the canvas runs to the edges of the screen — and
 * the cards are cut to the column regardless, which is the thing that must not
 * move.
 */
const bleed = await page.evaluate(() => {
  const box = document.querySelector(".cards").getBoundingClientRect();
  const view = window.rayl.camera;
  return {
    canvas: Math.round(box.width),
    screen: window.innerWidth,
    card: box.width / (view.right - view.left),
    column: document.querySelector(".calendar").clientWidth,
  };
});
check(
  "the picture runs to the edges of the screen",
  bleed.canvas === bleed.screen && bleed.canvas > bleed.column,
  `${bleed.canvas} across, against a column of ${bleed.column}`,
);
check(
  "and a card is still the width of the column",
  Math.abs(bleed.card - bleed.column * 0.99) < 1,
  `${bleed.card.toFixed(1)} against ${(bleed.column * 0.99).toFixed(1)}`,
);

/*
 * A month is a column, and dragging the months carries it sideways.
 *
 * Measured from the month being shown, so when the middle passes from one to
 * the next the column that was leaving is replaced by one arriving from the
 * other side — no animation, no state, and letting go brings it home because
 * the rail's own settling does.
 */
const sideways = await page.evaluate(async () => {
  const rail = document.getElementById("months");
  /* Snapping is mandatory on this rail, so a scroll set from a script is put
     straight back — which is the rail doing its job and this test measuring
     around it. A thumb holds it wherever it likes. */
  const snap = rail.style.scrollSnapType;
  rail.style.scrollSnapType = "none";
  rail.scrollLeft += 40;
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  const seen = {
    drift: window.rayl.drift(),
    /* The one in the middle — a card off the end of the arc is switched off and
       its position is wherever it was left. */
    x: window.rayl.wheel.cards[window.rayl.origin + Math.round(window.rayl.at)]
      .position.x,
  };
  rail.style.scrollSnapType = snap;
  return seen;
});
check(
  "dragging the months carries the cards sideways",
  Math.abs(sideways.x) > 0.05 &&
    Math.sign(sideways.x) === -Math.sign(sideways.drift),
  `drifted ${sideways.drift.toFixed(2)} of a month, cards at x ${sideways.x.toFixed(2)}`,
);

await page.evaluate(() => {
  document
    .getElementById("months")
    .scrollBy({ left: -40, behavior: "instant" });
});
await wait(400);
check(
  "and letting go brings them back",
  Math.abs(await page.evaluate(() => window.rayl.wheel.cards[0].position.x)) <
    0.02,
  `${(await page.evaluate(() => window.rayl.wheel.cards[0].position.x)).toFixed(3)}`,
);

/*
 * And a flick only ever goes where it was pushed.
 *
 * While the wheel curls back up the lean is being let out, which moves every
 * card down the frame, and scrolling moves them up. Let the lean out over one
 * card and it comes out faster than the scrolling arrives — so the first thing
 * a flick did was send the list backwards, and only once the lean was spent did
 * it start going the way the thumb had asked. Over two and a half it cannot.
 *
 * Measured on the cards that are on screen, which is the whole of what the
 * claim is about. A card that has left the top goes on round the drum, and
 * what it does up there — over the top and down the other side, y falling as
 * the angle passes ninety — is the drum being a drum and nothing to do with
 * which way the list went.
 */
const walk = await page.evaluate(async () => {
  const reel = document.getElementById("reel");
  const step = reel.children[0].getBoundingClientRect().height;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  /* Held, as a thumb would hold it: a scroller stepped by a script sits still
     between steps, and a scroller sitting still with nobody on it is one the
     loop is entitled to put on the nearest card. */
  reel.dispatchEvent(new Event("touchstart"));
  reel.scrollTop = 0;
  await frame();
  await frame();
  const was = new Map();
  let backwards = 0;
  let seen = 0;
  for (let i = 0; i <= 30; i++) {
    reel.scrollTop = (step * 3 * i) / 30;
    await frame();
    await frame();
    const edge = window.rayl.camera.top;
    window.rayl.wheel.cards.forEach((card, n) => {
      const y = card.position.y;
      /* On screen, which is not the same as inside the frame: the drum's own
         radius is shorter than half the frame, so a card can be over the top of
         it and coming down the far side without ever having been at an edge.
         It is switched off up there, and what it does is the drum being a drum
         rather than the list going anywhere. */
      const showing =
        card.visible && card.material.opacity > 0.02 && Math.abs(y) < edge;
      if (showing && was.has(n)) {
        seen++;
        if (y < was.get(n) - 1e-4) backwards++;
      }
      if (showing) was.set(n, y);
      else was.delete(n);
    });
  }
  reel.dispatchEvent(new Event("touchend"));
  return { backwards, seen };
});
check(
  "a flick only ever goes where it was pushed",
  walk.backwards === 0,
  `${walk.backwards} of ${walk.seen} cards on screen went the wrong way`,
);

/*
 * A month is a column and the column next door is drawn beside it.
 *
 * With only one of them on screen a drag showed a column leaving and then a
 * screen of nothing until the next was suddenly the one being measured. Two
 * columns a margin apart is what the gesture is — and it makes the changeover
 * free: halfway between two months the day changes and the cards with it, and
 * the two are exactly where each other is about to be measured to.
 */
const paged = await page.evaluate(async () => {
  const rail = document.getElementById("months");
  const cell = rail.querySelector(".cell");
  const snap = rail.style.scrollSnapType;
  rail.style.scrollSnapType = "none";
  const step = cell.offsetWidth + 14;
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const home = rail.scrollLeft;
  const look = () => ({
    here: window.rayl.wheel.cards[
      window.rayl.origin + Math.round(window.rayl.at)
    ].position.x,
    next: window.rayl.ghost.cards[0].position.x,
    day: window.rayl.chosen,
  });

  rail.scrollLeft = home + step * 0.3;
  await frame();
  await frame();
  const held = look();

  /* Over the halfway line, where the day changes and the columns swap. */
  rail.scrollLeft = home + step * 0.48;
  await frame();
  await frame();
  const before = look();
  rail.scrollLeft = home + step * 0.52;
  await frame();
  await frame();
  await frame();
  const after = look();

  rail.style.scrollSnapType = snap;
  rail.scrollLeft = home;
  return { held, before, after, apart: window.rayl.wheel.cards[0].position.x };
});
check(
  "a month along is a column along",
  Math.abs(paged.held.next - paged.held.here - 1.113) < 0.02,
  `the two columns are ${(paged.held.next - paged.held.here).toFixed(3)} apart, against a card and a margin at 1.113`,
);
check(
  "and the changeover happens where each is already standing",
  paged.after.day !== paged.before.day &&
    Math.abs(paged.after.here - paged.before.next) < 0.06 &&
    Math.abs(paged.after.next - paged.before.here) < 0.06,
  `the day went ${paged.before.day} -> ${paged.after.day} and the columns moved ${Math.abs(paged.after.here - paged.before.next).toFixed(3)}`,
);

/*
 * And a flick that dies between two cards is put on one.
 *
 * The stops are proximity rather than mandatory: mandatory snapping on iOS ends
 * a flick at the next stop however hard it was thrown, so the list could not be
 * spun. What it gives up is the guarantee, and the middle of this screen is a
 * choice — so the loop watches for a scroller that has stopped anywhere but on
 * a card, and sends it to the nearest one.
 */
const settled = await page.evaluate(async () => {
  const reel = document.getElementById("reel");
  const step = reel.children[0].getBoundingClientRect().height;
  /* After the rails have finished with each other: a month put back is a day
     put back, and a day put back opens its list at the top. */
  await new Promise((r) => setTimeout(r, 700));
  reel.scrollTop = step * 2.5;
  await new Promise((r) => setTimeout(r, 900));
  return { at: window.rayl.at };
});
check(
  "a spin that stops between two cards is put on one",
  Math.abs(settled.at - Math.round(settled.at)) < 0.02 && settled.at > 1,
  `left at 2.5, came to rest at ${settled.at.toFixed(3)}`,
);

/*
 * The months do not run out, in either direction.
 *
 * The run is built around today and grown a year at a time whenever the month
 * being shown comes within two of an end, so there is always more of it both
 * ways. Every index into the run moves when it grows, which is why the day is
 * carried across by its date and not by its number.
 */
const forever = await page.evaluate(async () => {
  const r = window.rayl;
  const rail = document.getElementById("months");
  const put = (at) =>
    rail.scrollTo({
      left:
        r.rails.months.shape.first +
        at * r.rails.months.shape.pitch +
        r.rails.months.shape.wide / 2 -
        rail.clientWidth / 2,
      behavior: "instant",
    });
  const start = {
    months: r.calendar.months.length,
    label: r.calendar.months[r.rails.months.showing()].label,
  };
  /* Twenty months on, a month at a time, the way a thumb would. */
  for (let i = 0; i < 20; i++) {
    put(r.rails.months.showing() + 1);
    await new Promise((res) => setTimeout(res, 30));
  }
  await new Promise((res) => setTimeout(res, 400));
  const on = {
    months: r.calendar.months.length,
    label: r.calendar.months[r.rails.months.showing()].label,
    date: r.calendar.days[r.chosen].date.getTime(),
    day: r.calendar.days[r.chosen].date.getDate(),
  };
  /* And the same the other way, back past where it started. */
  for (let i = 0; i < 30; i++) {
    put(r.rails.months.showing() - 1);
    await new Promise((res) => setTimeout(res, 30));
  }
  await new Promise((res) => setTimeout(res, 400));
  const back = {
    months: r.calendar.months.length,
    label: r.calendar.months[r.rails.months.showing()].label,
    date: r.calendar.days[r.chosen].date.getTime(),
    day: r.calendar.days[r.chosen].date.getDate(),
  };
  return { start, on, back };
});
const monthsOn = new Date(forever.on.date);
const monthsBack = new Date(forever.back.date);
check(
  "the months do not run out going forward",
  forever.on.months > forever.start.months && monthsOn.getFullYear() >= 2027,
  `${forever.start.months} months became ${forever.on.months}, twenty on from ${forever.start.label} at ${monthsOn.toDateString()}`,
);
check(
  "and they do not run out going back",
  forever.back.months > forever.on.months && monthsBack < monthsOn,
  `${forever.back.months} months, ten back the other side of where it started at ${monthsBack.toDateString()}`,
);
check(
  "and the day is carried across by its date",
  forever.on.day === forever.back.day,
  `the same day of the month either side of ${forever.back.months - forever.start.months} months of the run being rebuilt`,
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
