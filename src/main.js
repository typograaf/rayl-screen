import * as THREE from "three";
import { loadCard, CARD_ASPECT } from "./card.js";
import { cardAtlas, CARD_COUNT, cardHeight, cardBlocks } from "./cardart.js";
import { Wheel, CARD_HEIGHT } from "./wheel.js";
import { Lighting } from "./environment.js";
import { buildCalendar, dayInMonth } from "./calendar.js";
import { mountHaptics } from "./haptics.js";

/**
 * The screen — node 800:5314, running.
 *
 * The cards are the wheel out of the tool next door, at one state of it: the
 * link that state came from is written out below in full, so what is on this
 * screen and what was arranged in the tool are the same thing and can be
 * checked against each other.
 *
 * Everything that scrolls here is a real scroller with the phone's own physics
 * in it, and the picture reads them. Nothing about momentum, rubber banding or
 * how a flick decays is written by hand, because none of it can be written as
 * well as it already works — and on a phone, that is most of what the thing
 * feels like.
 */

/*
 * The state, from
 * #projection=isometric&fov=28&fill=0.99&radius=1.75&spacing=0.1&arc=90&fade=60
 * &count=14&depth=0.85&roughness=1&surface=colour&colour=%23f0f0ea
 * &through=1&scatter=0&wrap=0&falloff=1&rig=Soft&light=0.6&shadow=0
 * &keyAt=1.15,0.00,-0.67&fillAt=0.01,0.01,0.03&edgeAt=-1.10,-0.00,-0.22
 * &keyLevel=1.4&fillLevel=0&edgeLevel=1.4
 *
 * Count and scroll are not in it: on this screen those are the day's shifts and
 * where the list has been dragged to, which is the whole point of the screen.
 */
const LOOK = {
  fill: 0.99,
  radius: 1.75,
  spacing: 0.1,
  arc: 90,
  fade: 60,
  depth: 0.85,
  roughness: 1,
  colour: "#f0f0ea",
  through: 1,
  scatter: 0,
  wrap: 0,
  falloff: 1,
  rig: "Soft",
  light: 0.6,
  lamps: [
    { at: [1.15, 0.0, -0.67], level: 1.4, tint: "#eaeae5" },
    { at: [0.01, 0.01, 0.03], level: 0, tint: "#d1d5bc" },
    { at: [-1.1, -0.0, -0.22], level: 1.4, tint: "#eaeae5" },
  ],
};

/* The file's four, and only those: they come to exactly the width of the
   column with the rules and the gaps taken out, which is why there are four. */
/* Three of them show at a time, cut to the months' width — so the row scrolls,
   and what is past the edge is reached the same way a month is. */
/*
 * Nothing opens out at the ends of a list any more, and the reason is worth
 * keeping.
 *
 * The wheel used to flatten at either end and lean, so the first card sat at
 * the top of the frame and the last at the bottom rather than one card sitting
 * in the middle of a half-empty frame. It filled the first screen and it cost
 * every screen after it: the lean is only spent two and a half cards in, so
 * every card chosen before that came to rest somewhere other than the middle —
 * the picture pushed down, a gap above it, the card below pushed out of the
 * frame. Which is exactly the thing that has to be reliable, because the middle
 * is what is chosen.
 *
 * So the wheel is its own radius everywhere and the card that is chosen is in
 * the middle everywhere, and a list that has ended shows what a list that has
 * ended looks like: three cards at the top of a run, then two, then one, fading
 * out the way every other card on this screen does.
 */

/*
 * The design's margin, and the one number the edges of the picture are made of.
 *
 * A list lands a margin inside the frame rather than flush against it, and a
 * card fades out over that same margin on its way to the edge — so the card
 * that ends a list sits exactly on the line the fade begins at and is whole,
 * and any card carrying on past it is gone before there is anything to cut.
 * The columns are a margin apart for the same reason they are 36 apart from
 * everything else on the screen.
 */
const MARGIN = 36;

const DISTANCES = ["<5km", "<20km", "<50km", "<100km", "Custom"];

const canvas = document.getElementById("stage");
const cards = document.querySelector(".cards");
const reel = document.getElementById("reel");
const pager = document.getElementById("pager");
const tick = mountHaptics();

/* ------------------------------------------------------------ the picture --- */

/* Alpha, because the paper behind the cards is the screen's own gradient — the
   design's, in CSS, under everything else on the page. A background drawn in
   here as well would be a second one, half a pixel out. */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
/* Shadow is nought in this state, so the maps are never asked for. */
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
const lighting = new Lighting(renderer, scene);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

let wheel = null;
/* The column next door, and the day it is showing. Only ever on screen while a
   month is under a hand. */
let ghost = null;
let ghostDay = -1;
let ghostOrigin = 0;
let needs = true;
const mark = () => {
  needs = true;
};

/**
 * How wide a card is on screen, in pixels.
 *
 * The column's, less the sliver the state leaves either side of it — and taken
 * from the column rather than from the canvas, because the two are no longer
 * the same thing. The canvas runs to the edges of the screen so that a column
 * of cards can leave by one; the card is still the width the design draws it.
 */
function cardPx() {
  const column = document.querySelector(".calendar").clientWidth;
  return (column || canvas.clientWidth) * LOOK.fill;
}

/** The frustum, in cards: how many of them the canvas is across and down. */
function frame() {
  const wide = cardPx() || 1;
  const width = canvas.clientWidth / wide;
  const height = canvas.clientHeight / wide;
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

/** How far apart the file's own two cards would be on screen — what a card was
    worth when they were all one height, and still what the fade is measured
    against. */
function pitch() {
  return (cardPx() / CARD_ASPECT) * (1 + LOOK.spacing);
}

/** Where a card of the day's run sits on the drum, in pixels of scroll. */
function stopFor(i) {
  if (!wheel) return 0;
  return (wheel.placeOf(origin + i) - wheel.placeOf(origin)) * cardPx();
}

/** How far the day's run goes, in pixels of scroll. */
function travel() {
  return stopFor(Math.max(shifts.length - 1, 0));
}

/* The last shape the picture was laid out for, so a box that has not changed is
   not a reason to lay it out again. */
let laid = "";

function resize() {
  cutCells();
  for (const name of Object.keys(rails)) {
    rails[name].fit();
    /* A rail whose cells have just changed width is a rail that is no longer
       looking at what it was looking at. */
    railTo(name, rails[name].showing(), "instant");
  }
  const width = cards.clientWidth;
  const height = cards.clientHeight;
  if (!width || !height) return;
  laid = `${width}x${height}`;
  /*
   * Without letting it write the canvas's style, which is the third argument.
   *
   * three sets `width` and `height` on the element as well as on the buffer,
   * and an inline style beats the sheet — so the canvas stopped being the box
   * it is supposed to fill and became whatever size it was the last time this
   * ran. The sheet has it at inset nought, which is right whatever else
   * happens; only the buffer belongs to this.
   */
  renderer.setSize(width, height, false);
  /* And the pager back on its middle page, which is where it lives. */
  pager.scrollLeft = pager.clientWidth;
  frame();
  layReel();
  mark();
}

/* --------------------------------------------------------------- the day --- */

/*
 * The calendar runs as far either way as anybody scrolls.
 *
 * It is built as a run of whole months around today and grown a year at a time
 * whenever the month being shown comes within two of an end — so there is
 * always more of it in both directions and no edge to arrive at. It is only
 * ever grown, never trimmed: the day the screen is on is an index into this
 * run, and an index that means one date now and another later is the kind of
 * thing that goes wrong quietly.
 *
 * Growing rebuilds both rows of cells, which is why it waits for a hand to come
 * off them. A row rebuilt under a finger is a row that jumps.
 */
const TODAY = new Date();
let reach = { back: 2, on: 3 };
let calendar = buildCalendar(TODAY, reach.back, reach.on);
let chosen = calendar.days.findIndex((day) => day.today);
if (chosen < 0) chosen = 0;

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/* Wanted, but a rail was being held at the time. */
let owed = false;

function stretch() {
  if (!rails.months || !rails.days || !calendar.days[chosen]) return;
  const month = calendar.days[chosen].month;
  const near = 2;
  const want = {
    back: reach.back + (month < near ? 12 : 0),
    on: reach.on + (month > calendar.months.length - 1 - near ? 12 : 0),
  };
  if (want.back === reach.back && want.on === reach.on) {
    owed = false;
    return;
  }
  if (rails.months.held || rails.days.held) {
    owed = true;
    return;
  }
  owed = false;
  reach = want;
  const was = calendar.days[chosen].date;
  const older = calendar.days.length;
  calendar = buildCalendar(TODAY, reach.back, reach.on);
  /* The day comes across by its date. Every index into the run has just moved —
     by a year of days if the growth was backwards — and a day that means the
     21st now and the 1st in a moment is the kind of thing that goes wrong
     quietly. */
  const found = calendar.days.findIndex((day) => sameDay(day.date, was));
  chosen =
    found >= 0
      ? found
      : Math.min(
          chosen + (calendar.days.length - older),
          calendar.days.length - 1,
        );
  /* Every index into the run has just moved, this one included. */
  ghostDay = -1;
  rails.months.rail.replaceChildren(...monthCells());
  rails.days.rail.replaceChildren(...dayCells());
  cutCells();
  for (const name of ["months", "days"]) {
    rails[name].fit();
    rails[name].forget();
  }
  railTo("days", chosen, "instant");
  railTo("months", calendar.days[chosen].month, "instant");
  requestAnimationFrame(() => {
    rails.months.settle();
    rails.days.settle();
  });
}

/*
 * What is on a day.
 *
 * Made from the date rather than kept anywhere, so a day looks the same every
 * time it is scrolled back to. Eight to fourteen of them: enough that the list
 * runs past the frame in both directions once you are inside it, which is what
 * a day of work looks like and what the wheel is for.
 */
function shiftsOn(date) {
  let seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  next();
  const many = 8 + Math.floor(next() * 7);
  return Array.from({ length: many }, () => Math.floor(next() * CARD_COUNT));
}

/*
 * How many of the days either side of this one the drum also carries.
 *
 * The frame holds about three cards and a list has to fill it, including at its
 * own ends — where there is nothing above the first card and nothing below the
 * last, and centring the chosen one leaves half a screen of empty paper. It is
 * a rota, though, and there is no such thing as nothing above the first shift
 * of a day: there is the last shift of the day before. So the drum carries two
 * of those at each end, faded like every other card that far out.
 *
 * They are not stops on the reel. The list you are scrolling is the day's, and
 * what is above and below it is the rota carrying on.
 */
const EDGE = 2;

let shifts = [];
/* Where the day's own first card sits on the drum, the cards before it being
   the day before's. */
let origin = 0;
/* How many times a day has been laid out, which is the count that says whether
   a month arrived in one move or walked there. */
let built = 0;

/*
 * The reel is as long as the run of cards is round the drum.
 *
 * A stop is the distance from one card to the next, which is half of each of
 * them and the air between — so the stops are not all the same height any more
 * and neither is what a card is worth. Half the frame either side, so nought
 * puts the first card in the middle and the end puts the last one there.
 */
function layReel() {
  const pad = reel.clientHeight / 2;
  reel.style.paddingBlock = `${pad}px`;
  const stops = [...reel.children];
  for (let i = 0; i < stops.length; i++) {
    stops[i].style.height = `${Math.max(stopFor(i + 1) - stopFor(i), 0)}px`;
  }
}

/** A day's shifts, with the tail of the day before and the head of the day
    after — which is what the drum carries and not what the reel stops on. */
function runOf(index) {
  const day = calendar.days[index];
  const own = shiftsOn(day.date);
  const before = calendar.days[index - 1]
    ? shiftsOn(calendar.days[index - 1].date).slice(-EDGE)
    : [];
  const after = calendar.days[index + 1]
    ? shiftsOn(calendar.days[index + 1].date).slice(0, EDGE)
    : [];
  return { own, run: [...before, ...own, ...after], origin: before.length };
}

function showDay(index, { jump = true } = {}) {
  built++;
  chosen = index;
  const day = runOf(index);
  shifts = day.own;
  origin = day.origin;

  wheel.setCount(day.run.length);
  wheel.setArt(day.run, LOOK.spacing);
  pushSurface();

  /* One fewer than the cards: a stop is the gap between two of them, and the
     half-frame of padding is what lets the last one reach the middle. */
  reel.replaceChildren(
    ...shifts.slice(1).map(() => document.createElement("i")),
  );
  layReel();
  if (jump) {
    reel.scrollTop = 0;
    at = 0;
  }
  mark();
}

function pushSurface(on = wheel) {
  on.setSurface({
    colour: LOOK.colour,
    roughness: LOOK.roughness,
    sheen: 0.5,
    coat: 0,
    graded: false,
    inside: "#cecec5",
    edges: "#eaeae5",
    through: LOOK.through,
    scatter: LOOK.scatter,
    wrap: LOOK.wrap,
    falloff: LOOK.falloff,
  });
}

/* -------------------------------------------------------------- the rails --- */

const rails = {};

/*
 * How wide a cell is in each rail, from the column the screen actually leaves.
 *
 * The file gives every cell in these rows flex-1 — an equal share of what is
 * left once the rules and the gaps are taken out — so that is what this works
 * out rather than the pixel widths those shares happen to come to at the 402
 * the file is drawn at. On a 393 phone the column is 321, and cells cut for 330
 * overflow it: which is how a distance row that comes to exactly one column
 * ended up scrolling, 41 points out of place, with its last chip over the edge.
 */
function cutCells() {
  const column = document.querySelector(".calendar").clientWidth;
  if (!column) return;
  const share = (rules, gaps, cells) => (column - rules * 2 - gaps * 6) / cells;
  document
    .getElementById("months")
    .style.setProperty("--cell", `${share(4, 6, 3)}px`);
  document
    .getElementById("days")
    .style.setProperty("--cell", `${share(0, 6, 7)}px`);
  /* The distances are cut like the months: three across, the same width, their
     rules on the same lines. */
  document
    .getElementById("distance")
    .style.setProperty("--cell", `${share(4, 6, 3)}px`);
}

/**
 * One row of the design, on a scroller.
 *
 * `cells` are what it holds; `onSettle` is told which one is in the middle
 * whenever that changes, because the middle is what is chosen. The tick goes
 * here rather than at the end of the gesture: a detent you feel as you pass it
 * is what makes a list of days feel like a dial instead of a page.
 */
function mountRail(name, cells, onSettle) {
  const rail = document.getElementById(name);
  rail.replaceChildren(...cells);

  /*
   * A row that already fits does not get the air.
   *
   * The half-cell either side is what lets the first and the last of a long
   * list reach the middle. On a row whose cells come to exactly the width of
   * the column — the four distances do, which is why there are four — it does
   * the opposite: it makes a row that fits into a row that scrolls, and shunts
   * it 41 points off the column it is supposed to sit flush in.
   */
  /*
   * The one measurement a rail needs, taken when its cells change size and not
   * again: where the cells start, how wide one is, and how far to the next.
   *
   * In fractions of a pixel, and that is the whole point of it. A cell here is
   * 106.33 across, and `offsetLeft` is rounded to whole pixels — so a pitch
   * taken from two neighbours is out by a third of a pixel and a month forty
   * along is out by thirteen. Which is a rail that can never be home: the
   * columns sit a few points off the middle of the screen and a sliver of the
   * month next door shows at the edge, at rest, for no reason anybody could
   * see. Measured across the whole run instead, the error divides away.
   */
  const shape = { first: 0, wide: 1, pitch: 1, count: 0 };
  const fit = () => {
    rail.style.paddingInline = "0px";
    const fits = rail.scrollWidth <= rail.clientWidth + 1;
    rail.dataset.fits = String(fits);
    if (!fits) rail.style.paddingInline = "";
    const cells = rail.querySelectorAll(".cell");
    shape.count = cells.length;
    if (!cells.length) return;
    const from = rail.getBoundingClientRect().left - rail.scrollLeft;
    const one = cells[0].getBoundingClientRect();
    const last = cells[cells.length - 1].getBoundingClientRect();
    shape.first = one.left - from;
    shape.wide = one.width;
    shape.pitch =
      cells.length > 1
        ? (last.left - one.left) / (cells.length - 1)
        : one.width || 1;
  };
  fit();
  window.addEventListener("resize", fit);

  /*
   * Which cell is in the middle, worked out rather than looked for.
   *
   * Every cell in a rail is the same width with the same air beside it, so the
   * one in the middle is arithmetic on the scroll: where the first one starts,
   * how far it is to the next, and where the middle of the rail has got to.
   *
   * It used to ask every cell where it was. That is a measurement each, and a
   * measurement is a layout, and it happened on every scroll event of every
   * rail — which was survivable at six months and is not the calendar this now
   * carries. Months run as far either way as anyone cares to scroll.
   */
  const chosenOf = () => {
    const middle = rail.scrollLeft + rail.clientWidth / 2 - shape.first;
    const at = Math.round((middle - shape.wide / 2) / shape.pitch);
    return Math.max(0, Math.min(at, shape.count - 1));
  };

  const cellAt = (index) => rail.querySelector(`.cell[data-index="${index}"]`);

  let showing = -1;
  const settle = () => {
    /* A rail being carried by something else does not answer: the cells slide
       under the block, and what is chosen is not up for discussion until the
       gesture that is carrying it has finished. */
    if (found.muted) return;
    const now = chosenOf();
    if (now === showing) return;
    const was = showing;
    showing = now;
    /* Two cells change hands, not all of them: the one that had it and the one
       that has it. */
    if (was >= 0) delete cellAt(was)?.dataset.on;
    const has = cellAt(now);
    if (has) has.dataset.on = "true";
    /*
     * A rail that has been put somewhere says so.
     *
     * Scrolling the months to September used to drag the days along one month
     * at a time — every month the smooth scroll passed through moved the days,
     * which moved the months back, and the two went through every day between
     * here and there ringing all the way.
     *
     * So the two things a rail does when it settles are told apart. What it is
     * for happens either way: a day chosen is a day chosen, however it got
     * there. What it says to the other rail does not, because the other rail is
     * where it came from.
     */
    if (!found.driven) tick();
    onSettle(now, found.driven);
  };

  rail.addEventListener(
    "scroll",
    () => {
      found.moved = performance.now();
      settle();
    },
    { passive: true },
  );

  /*
   * And a cell can be pressed.
   *
   * Scrolling to a day three weeks out is a gesture; picking the one next to
   * the one you are on is a tap, and a calendar that only answers to the first
   * is a calendar with a hand always on it. A row that scrolls is scrolled to
   * the cell, so it arrives the same way it would have by hand; a row that fits
   * has nowhere to scroll, so it is simply chosen.
   */
  rail.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (rail.dataset.fits === "true") {
      if (showing >= 0) delete cellAt(showing)?.dataset.on;
      showing = index;
      cell.dataset.on = "true";
      tick();
      onSettle(index);
      return;
    }
    railTo(name, index);
  });

  /* A hand on a rail, so that a calendar which wants to grow can wait until it
     is nobody's turn: rebuilding a row under a finger is the row jumping. */
  rail.addEventListener(
    "touchstart",
    () => {
      found.held = true;
    },
    { passive: true },
  );
  for (const done of ["touchend", "touchcancel"]) {
    rail.addEventListener(
      done,
      () => {
        found.held = false;
        /* After the snap it started has finished. */
        setTimeout(() => {
          if (owed) stretch();
        }, 400);
      },
      { passive: true },
    );
  }

  const found = {
    rail,
    settle,
    chosenOf,
    shape,
    showing: () => showing,
    /* After its cells have been rebuilt: whatever it was showing, it is not
       showing it now. */
    forget: () => {
      showing = -1;
    },
    fit,
    held: false,
    muted: false,
    /* When it last moved, so that what only belongs on screen during a gesture
       can tell a gesture from a rail sitting still. */
    moved: 0,
    driven: false,
    /* Cleared when the scroll it started has stopped, or after long enough that
       it must have. */
    let_go: null,
  };
  rails[name] = found;
  return found;
}

/*
 * A rail that has stopped anywhere but exactly on its cell is put on it.
 *
 * A snap lands where the browser puts it, which is not always the pixel this
 * works its own arithmetic from, and on the days — where a cell is 42 across
 * and a column is 354 — one pixel out is seven points of column standing off
 * the side of the screen. Which is the sliver of the day next door that kept
 * turning up at rest. There is nothing to see in the correction: it is a pixel
 * or two, and it happens once the scrolling has stopped.
 */
function tidy(name) {
  const found = rails[name];
  if (!found || found.held || found.driven || found.muted) return;
  if (!found.shape.pitch || performance.now() - found.moved < 120) return;
  const want = home(found, found.showing());
  const off = found.rail.scrollLeft - want;
  if (Math.abs(off) > 0.5 && Math.abs(off) < found.shape.pitch / 2)
    found.rail.scrollLeft = want;
}

/** Where a rail has to be scrolled to for a cell to be in its middle. */
function home(found, index) {
  const { first, wide, pitch } = found.shape;
  return first + index * pitch + wide / 2 - found.rail.clientWidth / 2;
}

/** Put a rail on a cell, without it counting as somebody scrolling it. */
function railTo(name, index, behavior = "smooth") {
  const found = rails[name];
  if (!found || index < 0 || index >= found.shape.count) return;
  const left = home(found, index);
  found.driven = true;
  clearTimeout(found.let_go);
  found.let_go = setTimeout(
    () => {
      found.driven = false;
    },
    behavior === "smooth" ? 600 : 80,
  );
  found.rail.scrollTo({ left, behavior });
  /*
   * And told where it is, now, rather than when the scroll event turns up.
   *
   * An instant scroll moves the rail inside this call and the event that says
   * so arrives afterwards — so the frame in between had the rail on the new day
   * and the black block still on the old one, sitting off to one side of the
   * row. Scrolling the months flashed it across the calendar and back on every
   * month it passed. The block is a cell's, so the cell has to be told in the
   * same breath as the scroll.
   */
  if (behavior !== "smooth") found.settle();
}

/*
 * A label goes in a span, and it matters.
 *
 * Every text node in the design is cap-trimmed, and a trim applies to a text
 * box — a bare string inside a flex cell is an anonymous box and does not get
 * one. Left as text the rows came out 38.4 instead of 32, which walked the
 * whole column 13 points down the screen and took 20 off the cards. The day
 * cells were right all along, because their three parts were already in spans.
 */
const cell = (index, text, className = "cell") => {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.dataset.index = String(index);
  const label = document.createElement("span");
  label.textContent = text;
  node.append(label);
  return node;
};

const rule = () => {
  const node = document.createElement("span");
  node.className = "rule";
  return node;
};

/* Months: three across in the file, with a rule either side of each. */
function monthCells() {
  const months = [];
  calendar.months.forEach((month, i) => {
    months.push(rule(), cell(i, month.label));
  });
  months.push(rule());
  return months;
}

/* Days: label, rule, date — no rules between them, which is the file. */
function dayCells() {
  return calendar.days.map((day, i) => {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "cell";
    node.dataset.index = String(i);
    const name = document.createElement("span");
    name.textContent = day.name;
    const bar = document.createElement("span");
    bar.className = "bar";
    const number = document.createElement("span");
    number.textContent = day.number;
    node.append(name, bar, number);
    return node;
  });
}

function mountCalendar() {
  cutCells();
  mountRail("months", monthCells(), (index, driven) => {
    /*
     * A month scrolled to takes the days with it — to the same date if that
     * month has one. Not when the days are what moved it, and not when it is
     * already the month the chosen day is in.
     */
    if (driven) return;
    if (calendar.days[chosen].month === index) return;
    const day = dayInMonth(calendar, index, calendar.days[chosen].number);
    /* Put there, not walked there: a month away is thirty days of scrolling,
       and every one of them would be a day chosen, a rota built and a tick. */
    railTo("days", day, "instant");
  });

  mountRail("days", dayCells(), (index, driven) => {
    showDay(index);
    /* And a day near either end of the run is a run that wants to be longer. */
    stretch();
    /* And the month follows the day off the end of itself — unless the month is
       where the day came from. */
    if (driven) return;
    const month = calendar.days[index].month;
    if (rails.months.showing() !== month) railTo("months", month);
  });

  const distance = [];
  DISTANCES.forEach((label, i) => {
    distance.push(rule(), cell(i, label));
  });
  distance.push(rule());
  mountRail("distance", distance, () => {});
}

/* ------------------------------------------------------------- the scroll --- */

let at = 0;

/*
 * Nothing listens for the scroll.
 *
 * A scroll event on a phone arrives when the browser gets round to it, and
 * during momentum it is coalesced — so a picture drawn from those events lags
 * the finger and then catches up, which is exactly what choppy is. The
 * scroller's position is read once a frame instead, in the same breath as the
 * drawing, so the cards are wherever the scroller is at the moment the frame is
 * made. The scrolling itself is still entirely the phone's.
 */
let passing = 0;
/* How far the columns were last drawn from home, and which day was next door —
   so a rail being dragged sideways is a reason to draw as much as the reel
   being dragged down is. */
let slid = 0;
let slidDay = -1;

/* A hand on the cards themselves. */
let pagerHeld = false;
pager.addEventListener(
  "touchstart",
  () => {
    pagerHeld = true;
  },
  { passive: true },
);
for (const done of ["touchend", "touchcancel"]) {
  pager.addEventListener(
    done,
    () => {
      pagerHeld = false;
    },
    { passive: true },
  );
}

/*
 * And where a flick that has run out is put right.
 *
 * The stops are proximity rather than mandatory, because mandatory snapping on
 * iOS ends a flick at the next stop however hard it was thrown — a list that
 * moves one card per swipe and cannot be spun. What proximity gives up is the
 * guarantee: momentum that dies between two cards is left between two cards,
 * and the middle of this screen is a choice, so it cannot be. So the loop
 * watches for the scroller having stopped, and if it has stopped anywhere but
 * on a card it is sent to the nearest one.
 *
 * Not while a finger is down: a scroller being corrected under a hand is a
 * scroller fighting it.
 */
let held = false;
let still = 0;
reel.addEventListener(
  "touchstart",
  () => {
    held = true;
    still = 0;
  },
  { passive: true },
);
for (const done of ["touchend", "touchcancel"]) {
  reel.addEventListener(
    done,
    () => {
      held = false;
    },
    { passive: true },
  );
}

/** Which of the day's cards is nearest the middle. */
function on() {
  if (!wheel) return 0;
  return Math.max(
    0,
    Math.min(
      wheel.nearest(wheel.placeOf(origin) + at) - origin,
      Math.max(shifts.length - 1, 0),
    ),
  );
}

/* --------------------------------------------------------------- the loop --- */

/** How far a rail has been dragged from the cell it is showing, in cells. */
function railDrift(name) {
  const found = rails[name];
  /* A rail being carried by another gesture is not a gesture: what moved it is
     already counted, and counting it twice slides the columns twice as far. */
  if (!found || found.driven || found.muted) return 0;
  const step = found.shape.pitch;
  if (!step) return 0;
  const off = (found.rail.scrollLeft - home(found, found.showing())) / step;
  /*
   * A rail that is as good as home is home.
   *
   * A snap does not always land on the exact pixel, and a rail resting a pixel
   * out is a column standing a few points off the side of the screen — which is
   * a sliver of the day next door showing at the edge, at rest, for no reason
   * anybody could see. Under a hand this much is nothing.
   */
  if (Math.abs(off) < 0.004) return 0;
  /* And a rail nobody has touched for half a second is not being dragged: the
     column next door belongs to the gesture, not to the screen. */
  if (!found.held && performance.now() - found.moved > 500) return 0;
  return Math.max(-0.6, Math.min(off, 0.6));
}

/** How far the cards themselves have been swiped, in pages — a page being a
    day, which is what the pager is three of. */
function pageDrift() {
  const wide = pager.clientWidth;
  if (!wide) return 0;
  const off = (pager.scrollLeft - wide) / wide;
  return Math.abs(off) < 0.004 ? 0 : Math.max(-1, Math.min(off, 1));
}

/*
 * How far the columns have been dragged, and which day is next door.
 *
 * A day is a column and there are three ways to drag one: sideways across the
 * cards, along the days, or along the months. They are the same gesture as far
 * as this is concerned — one of them at a time, because a rail that has been
 * put somewhere by another rail says so and is not counted — and they all mean
 * the same thing, which is that a day is on its way in from one side and the
 * one on screen is on its way out the other.
 *
 * It needs no animation and no state. When the middle passes from one day to
 * the next this is suddenly measured from the new one instead, so the column
 * that was leaving is replaced by the one arriving at exactly the distance it
 * had got to, and letting go brings it home because settling is what takes the
 * measurement back to nothing.
 */
function drift() {
  const swipe = pageDrift();
  const days = railDrift("days");
  const months = railDrift("months");
  const off = swipe + days + months;
  /*
   * And under a few points of column there is nothing to draw.
   *
   * The deadbands on the rails are in cells, and a cell is not the same size in
   * each of them: three points of column is a fifteenth of a month cell and a
   * hundredth of a day. This is the one that matters, because it is the one
   * that shows — a column standing three points off the middle of the screen is
   * three points of the day next door at the edge of it.
   */
  if (Math.abs(off) * column() * cardPx() < 3) return { off: 0, day: -1 };
  let next = -1;
  if (swipe || days) {
    next = chosen + Math.sign(swipe + days);
  } else if (months) {
    const where = rails.months.showing() + Math.sign(months);
    next =
      where < 0 || where >= calendar.months.length
        ? -1
        : dayInMonth(calendar, where, calendar.days[chosen].number);
  }
  if (!calendar.days[next]) next = -1;
  return { off: Math.max(-1, Math.min(off, 1)), day: next };
}

/** Half the frame, in the world's units. */
function half() {
  return canvas.clientHeight / (cardPx() || 1) / 2;
}

/** The margin, in the world's units — a card being one across. */
function margin() {
  return MARGIN / (cardPx() || 1);
}

/**
 * How far out a card fades over, in the world's units.
 *
 * All the room there is, which is the distance between where the card next to
 * the chosen one stands and the edge of the frame. Three cards to a frame is
 * what this screen holds and three cards fill it to within a couple of points,
 * so that distance is most of what decides whether the thing scrolls or blinks:
 * cut to the box it is a few points and the outer cards go out like a light,
 * and with the design's own gaps in the picture it is a third of a card and
 * they go the way everything else on this screen goes.
 *
 * Worked out rather than chosen, so it is always as gentle as the frame allows.
 */
function feather() {
  const R = LOOK.radius * CARD_HEIGHT;
  const step = (CARD_HEIGHT * (1 + LOOK.spacing)) / R;
  const beside = R * Math.sin(step) + CARD_HEIGHT / 2;
  return Math.max(half() - beside, MARGIN / 4 / (cardPx() || 1));
}

/** One column to the next: a card and the margin between them. */
function column() {
  return 1 + margin();
}

/*
 * The column the month next door would show, drawn beside the one on screen.
 *
 * A month is a column and dragging the months carries it sideways — but with
 * only one column ever drawn, what a drag actually showed was a column leaving
 * and then a screen of nothing until the next one was suddenly the one being
 * measured. Two columns and a margin between them is what the gesture is: the
 * one going and the one coming, both under the hand at once.
 *
 * It also makes the changeover free. Halfway between two months the day changes
 * and the cards with it, and at that moment this column is exactly where the
 * one on screen is about to be measured to — so the two swap places and nothing
 * moves.
 *
 * Rebuilt only when it is a different day, which under a hand is once: a day's
 * shifts are made from its date, and making fourteen cards on every frame of a
 * drag is the kind of thing that is felt rather than seen.
 */
function nextDoor() {
  const way = Math.sign(slid);
  if (!way || slidDay < 0) {
    if (ghostDay !== -1) {
      ghost.hide();
      ghostDay = -1;
    }
    return;
  }
  if (slidDay !== ghostDay) {
    ghostDay = slidDay;
    const run = runOf(slidDay);
    ghostOrigin = run.origin;
    ghost.setCount(run.run.length);
    ghost.setArt(run.run, LOOK.spacing);
    pushSurface(ghost);
  }
  /* At the top of its own list, which is where it will be when it arrives:
     showing a day opens it at its first card. */
  ghost.update({
    radius: LOOK.radius,
    arc: LOOK.arc,
    fade: LOOK.fade,
    /* Its own first card, which is a place on its drum and not a number: the
       cards before it are the day before that day's. */
    scroll: ghost.placeOf(ghostOrigin),
    thickness: LOOK.depth,
    slide: -slid * column() + way * column(),
    frame: half(),
    edge: feather(),
  });
}

/*
 * A swipe across the cards carries the days rail with it.
 *
 * The same cells sliding under the same block as when the row itself is
 * dragged, because it is the same gesture asked for in another place — and the
 * row is the only thing on the screen that says which day this is, so a day
 * being swiped through without it moving is the screen keeping a secret.
 *
 * Muted while it is carried, and its snapping off: a rail that answered would
 * choose a day halfway through a swipe that has not landed yet, and a rail that
 * snapped would be pulled off the finger between one frame and the next.
 */
let carried = false;
function carryDays(off) {
  const found = rails.days;
  if (!found || !found.shape.pitch) return;
  if (off) {
    if (!carried) {
      carried = true;
      found.muted = true;
      found.rail.style.scrollSnapType = "none";
    }
    found.rail.scrollLeft = home(found, chosen) + off * found.shape.pitch;
  } else if (carried) {
    carried = false;
    found.muted = false;
    found.rail.style.scrollSnapType = "";
    found.rail.scrollLeft = home(found, chosen);
  }
}

/*
 * And a page that has landed on one side or the other is a day turned.
 *
 * The pager is put back on its middle page in the same breath, which nobody
 * sees: at the moment it lands, the day going is a whole column off the screen
 * and the day coming is dead centre — exactly where the day that has just been
 * chosen is about to be drawn. The two swap and nothing moves.
 */
function turnPage() {
  const wide = pager.clientWidth;
  if (!wide || pagerHeld) return;
  const off = (pager.scrollLeft - wide) / wide;
  if (Math.abs(off) < 0.98) return;
  const want = chosen + Math.sign(off);
  pager.scrollLeft = wide;
  /* The rail is handed back before it is told anything: a rail being carried is
     a rail that does not answer, and this is about to ask it to. */
  carryDays(0);
  if (!calendar.days[want]) return;
  tick();
  /* The rails come with it, and the day is chosen by the same call that would
     have chosen it had the day rail been dragged there by hand. */
  railTo("days", want, "instant");
  const month = calendar.days[want].month;
  if (rails.months.showing() !== month) railTo("months", month);
  stretch();
}

function draw() {
  requestAnimationFrame(draw);
  if (!wheel) return;

  {
    /* The scroll is a distance round the drum rather than a count of cards,
       because cards are not all one height any more: a pixel is a pixel and a
       card is however tall this one came out. */
    const now = reel.scrollTop / (cardPx() || 1);
    if (Math.abs(now - at) > 1e-5) {
      at = now;
      needs = true;
      still = 0;
    } else if (!held && ++still === 8) {
      /* Stopped, and stopped between two cards: on to the nearer one. The
         eight frames are an eighth of a second of complete stillness, so that a
         scroller which has merely paused — the top of a bounce, a finger
         resting, a wheel between notches — is not taken for one that has
         finished. */
      const want = stopFor(on());
      if (Math.abs(reel.scrollTop - want) > 0.5)
        reel.scrollTo({ top: want, behavior: "smooth" });
    }
    /* The detent, felt as it is passed rather than when it settles: that is
       what makes a list of cards a dial and not a page. */
    const stop = on();
    if (stop !== passing) {
      passing = stop;
      tick();
    }
  }

  turnPage();
  const swipe = pageDrift();
  carryDays(swipe);
  for (const name of Object.keys(rails)) tidy(name);
  if (!pagerHeld && !swipe && pager.clientWidth) {
    /* And the pager itself, for the same reason. */
    const off = pager.scrollLeft - pager.clientWidth;
    if (Math.abs(off) > 0.5) pager.scrollLeft = pager.clientWidth;
  }
  const sideways = drift();
  if (Math.abs(sideways.off - slid) > 1e-4 || sideways.day !== slidDay) {
    slid = sideways.off;
    slidDay = sideways.day;
    needs = true;
  }

  if (!needs) return;
  needs = false;
  wheel.update({
    radius: LOOK.radius,
    arc: LOOK.arc,
    fade: LOOK.fade,
    /* The day's first card is not the drum's first card: the ones before it are
       yesterday's, and the scroll is counted from the day's own. */
    scroll: wheel.placeOf(origin) + at,
    thickness: LOOK.depth,
    /*
     * A month along is a column along: a card and a margin, the same 36 that
     * separates everything else on this screen. The one going and the one
     * coming are both drawn, so the changeover in the middle — where the day
     * changes and the cards with it — lands with each of them exactly where the
     * other one was, and there is nothing to see happen.
     */
    slide: -slid * column(),
    frame: half(),
    edge: feather(),
  });
  nextDoor();
  renderer.render(scene, camera);
}

/* -------------------------------------------------------------- arriving --- */

async function start() {
  const [geometry, atlas] = await Promise.all([
    loadCard(new URL("card.glb", document.baseURI).href),
    cardAtlas(),
  ]);

  wheel = new Wheel(scene, geometry, atlas);
  ghost = new Wheel(scene, geometry, atlas);
  lighting.set(LOOK.rig, LOOK.light);
  lighting.setLamps(
    LOOK.lamps.map((lamp) => ({
      at: new THREE.Vector3(...lamp.at),
      level: lamp.level,
      tint: lamp.tint,
    })),
  );
  lighting.setShadow(0);

  mountCalendar();
  showDay(chosen);
  resize();

  /* Both rails put where they start without a scroll to watch — the day is
     today and the month is the one it is in. */
  railTo("days", chosen, "instant");
  railTo("months", calendar.days[chosen].month, "instant");
  railTo("distance", 1, "instant");
  requestAnimationFrame(() => {
    for (const name of Object.keys(rails)) rails[name].settle();
  });

  /*
   * The box is watched, not the window.
   *
   * A phone's safe areas do not arrive with the first layout — the web view
   * lays out once with nothing at the top, and the inset turns up a moment
   * later. Nothing about the window changed, so nothing said so: the column
   * moved down by the notch and the picture stayed the size it had been, which
   * is a wheel drawn half an inset lower than the frame it is supposed to be
   * in, with that much of it cut off the bottom. Everything that has been read
   * on this screen as sitting too low, or as the last card being clipped, was
   * that.
   */
  new ResizeObserver(() => {
    if (`${cards.clientWidth}x${cards.clientHeight}` !== laid) resize();
  }).observe(cards);
  window.addEventListener("resize", resize);
  window.visualViewport?.addEventListener("resize", resize);
  requestAnimationFrame(draw);

  await document.fonts.ready;
  resize();
  document.body.classList.remove("starting");
}

start();

/* A way in from the outside, for a test or a console. */
window.rayl = {
  LOOK,
  get calendar() {
    return calendar;
  },
  get reach() {
    return reach;
  },
  stretch,
  scene,
  renderer,
  camera,
  get wheel() {
    return wheel;
  },
  get ghost() {
    return ghost;
  },
  get ghostDay() {
    return ghostDay;
  },
  get chosen() {
    return chosen;
  },
  get shifts() {
    return shifts;
  },
  get origin() {
    return origin;
  },
  get built() {
    return built;
  },
  drift: () => drift().off,
  get slidDay() {
    return slidDay;
  },
  get ghostOrigin() {
    return ghostOrigin;
  },
  get at() {
    return at;
  },
  on,
  /* What the six designs come out at, for a test that wants to know. */
  get CARD_SIZES() {
    return Array.from({ length: CARD_COUNT }, (_, i) => cardHeight(i));
  },
  get CARD_BLOCKS() {
    return cardBlocks();
  },
  stopFor,
  travel,
  rails,
};
