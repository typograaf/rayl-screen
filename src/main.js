import * as THREE from "three";
import { loadCard, CARD_ASPECT } from "./card.js";
import { cardAtlas, CARD_COUNT } from "./cardart.js";
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
 * How flat the wheel goes at the ends of a list, in card heights.
 *
 * At rest the first card is the one that is chosen, so it is in the middle —
 * and the half of the frame above it is empty, which reads as a list that has
 * lost something rather than a list at its start. So the wheel opens out: at
 * either end it is nearly a straight line with the chosen card at the top of
 * the frame and the rest running down it, and it curls back to its own radius
 * over the first card of scrolling. The one that is chosen is under the ticks
 * either way; what changes is where the ticks are looking.
 */
const FLAT = 10;

/*
 * How much scrolling the wheel takes to curl back up, in cards.
 *
 * It has to be more than one, and the reason is arithmetic. While the wheel is
 * opening back up the lean is being let out, which moves every card *down* the
 * frame; scrolling moves them up, by one pitch per card. Let the lean out over
 * a single card and it comes out at 0.83 of a card height against a pitch of
 * 0.43 — so the first thing a flick does is send the list backwards, and only
 * once the lean is spent does it start going the way the thumb asked. Over two
 * and a half, the steepest the lean can come out is 0.33 against that same
 * 0.43, and the list only ever goes where it was pushed.
 */
const OPEN = 2.5;

const DISTANCES = ["<5km", "<20km", "<50km", "<100km", "Custom"];

const canvas = document.getElementById("stage");
const cards = document.querySelector(".cards");
const reel = document.getElementById("reel");
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
let needs = true;
const mark = () => {
  needs = true;
};

/** The frustum, from the one number that matters: how much of the width a card
    at rest takes. */
function frame() {
  const width = 1 / LOOK.fill;
  const height = width / (canvas.clientWidth / canvas.clientHeight || 1);
  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

/** How far apart two cards are on screen, which is what a stop in the reel is
    worth: the card's own height at this size, plus the air between them. */
function pitch() {
  const wide = canvas.clientWidth * LOOK.fill;
  return (wide / CARD_ASPECT) * (1 + LOOK.spacing);
}

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
  renderer.setSize(width, height);
  frame();
  layReel();
  mark();
}

/* --------------------------------------------------------------- the day --- */

const calendar = buildCalendar(new Date());
let chosen = calendar.days.findIndex((day) => day.today);
if (chosen < 0) chosen = 0;

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

let shifts = [];
/* How many times a day has been laid out, which is the count that says whether
   a month arrived in one move or walked there. */
let built = 0;

/** The reel gets a stop for every card, and enough air either side that the
    first and the last can reach the middle. */
function layReel() {
  const step = pitch();
  const pad = Math.max((reel.clientHeight - step) / 2, 0);
  reel.style.paddingBlock = `${pad}px`;
  for (const stop of reel.children) stop.style.height = `${step}px`;
}

function showDay(index, { jump = true } = {}) {
  built++;
  chosen = index;
  const day = calendar.days[chosen];
  shifts = shiftsOn(day.date);

  wheel.setCount(shifts.length);
  wheel.setArt(shifts);
  pushSurface();

  reel.replaceChildren(...shifts.map(() => document.createElement("i")));
  layReel();
  if (jump) {
    reel.scrollTop = 0;
    at = 0;
  }
  mark();
}

function pushSurface() {
  wheel.setSurface({
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
  const fit = () => {
    rail.style.paddingInline = "0px";
    const fits = rail.scrollWidth <= rail.clientWidth + 1;
    rail.dataset.fits = String(fits);
    if (!fits) rail.style.paddingInline = "";
  };
  fit();
  window.addEventListener("resize", fit);
  const chosenOf = () => {
    const box = rail.getBoundingClientRect();
    const middle = box.left + box.width / 2;
    let best = 0;
    let nearest = Infinity;
    for (const cell of rail.querySelectorAll(".cell")) {
      const at = cell.getBoundingClientRect();
      const gap = Math.abs(at.left + at.width / 2 - middle);
      if (gap < nearest) {
        nearest = gap;
        best = Number(cell.dataset.index);
      }
    }
    return best;
  };

  let showing = -1;
  const settle = () => {
    const now = chosenOf();
    if (now === showing) return;
    showing = now;
    for (const cell of rail.querySelectorAll(".cell"))
      cell.dataset.on = String(Number(cell.dataset.index) === now);
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

  rail.addEventListener("scroll", settle, { passive: true });

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
      showing = index;
      for (const one of rail.querySelectorAll(".cell"))
        one.dataset.on = String(Number(one.dataset.index) === index);
      tick();
      onSettle(index);
      return;
    }
    railTo(name, index);
  });

  const found = {
    rail,
    settle,
    chosenOf,
    showing: () => showing,
    fit,
    driven: false,
    /* Cleared when the scroll it started has stopped, or after long enough that
       it must have. */
    let_go: null,
  };
  rails[name] = found;
  return found;
}

/** Put a rail on a cell, without it counting as somebody scrolling it. */
function railTo(name, index, behavior = "smooth") {
  const found = rails[name];
  if (!found) return;
  const cell = found.rail.querySelector(`.cell[data-index="${index}"]`);
  if (!cell) return;
  const left =
    cell.offsetLeft + cell.offsetWidth / 2 - found.rail.clientWidth / 2;
  found.driven = true;
  clearTimeout(found.let_go);
  found.let_go = setTimeout(
    () => {
      found.driven = false;
    },
    behavior === "smooth" ? 600 : 80,
  );
  found.rail.scrollTo({ left, behavior });
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

function mountCalendar() {
  cutCells();
  /* Months: three across in the file, with a rule either side of each. */
  const months = [];
  calendar.months.forEach((month, i) => {
    months.push(rule(), cell(i, month.label));
  });
  months.push(rule());
  mountRail("months", months, (index, driven) => {
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

  /* Days: label, rule, date — no rules between them, which is the file. */
  const days = calendar.days.map((day, i) => {
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
  mountRail("days", days, (index, driven) => {
    showDay(index);
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
/* Where the months were last drawn from, so a rail being dragged sideways is a
   reason to draw as much as the reel being dragged down is. */
let slid = 0;

/* --------------------------------------------------------------- the loop --- */

/** Nought at the ends of the list, one anywhere inside it, eased. */
function curl() {
  const span = Math.max(shifts.length - 1, 0);
  const edge = Math.min(at, span - at);
  const t = Math.max(0, Math.min(edge / OPEN, 1));
  return t * t * (3 - 2 * t);
}

/*
 * How far the months have been dragged from the one being shown, in months.
 *
 * The cards ride it sideways: a month is a column, and dragging the months
 * carries the column with it. Which needs no animation and no state — when the
 * middle passes from one month to the next, the day changes and this is
 * suddenly measured from the new month instead, so the column that was leaving
 * is replaced by one arriving from the other side. Let go, and the rail's own
 * settling brings it home.
 *
 * Only under a hand. The days push the months along too, and a column sliding
 * out because the day it is showing has crossed into another month would be
 * the screen answering a question nobody asked.
 */
function drift() {
  const found = rails.months;
  if (!found || found.driven) return 0;
  const cell = found.rail.querySelector(
    `.cell[data-index="${found.showing()}"]`,
  );
  if (!cell) return 0;
  const home =
    cell.offsetLeft + cell.offsetWidth / 2 - found.rail.clientWidth / 2;
  /* A month along is the cell plus the rule and the two gaps beside it. */
  const step = cell.offsetWidth + 2 + 12;
  return Math.max(-1.4, Math.min((found.rail.scrollLeft - home) / step, 1.4));
}

/** Half the frame less half a card, in the world's units: how far the wheel
    has to slide for the card at the end to sit against the edge. */
function room() {
  const height =
    1 / LOOK.fill / (canvas.clientWidth / canvas.clientHeight || 1);
  return height / 2 - CARD_HEIGHT / 2;
}

function draw() {
  requestAnimationFrame(draw);
  if (!wheel) return;

  const step = pitch();
  if (step > 0) {
    const now = reel.scrollTop / step;
    if (Math.abs(now - at) > 1e-4) {
      at = now;
      needs = true;
    }
    /* The detent, felt as it is passed rather than when it settles: that is
       what makes a list of cards a dial and not a page. */
    const stop = Math.round(at);
    if (stop !== passing) {
      passing = stop;
      tick();
    }
  }

  const sideways = drift();
  if (Math.abs(sideways - slid) > 1e-4) {
    slid = sideways;
    needs = true;
  }

  if (!needs) return;
  needs = false;
  const open = curl();
  const span = Math.max(shifts.length - 1, 0);
  wheel.update({
    radius: LOOK.radius + (1 - open) * (FLAT - LOOK.radius),
    spacing: LOOK.spacing,
    arc: LOOK.arc,
    fade: LOOK.fade,
    scroll: at,
    thickness: LOOK.depth,
    cycle: false,
    lean: (1 - open) * (at <= span / 2 ? room() : -room()),
    slide: -slid / LOOK.fill,
  });
  renderer.render(scene, camera);
}

/* -------------------------------------------------------------- arriving --- */

async function start() {
  const [geometry, atlas] = await Promise.all([
    loadCard(new URL("card.glb", document.baseURI).href),
    cardAtlas(),
  ]);

  wheel = new Wheel(scene, geometry, atlas);
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
  calendar,
  scene,
  renderer,
  camera,
  get wheel() {
    return wheel;
  },
  get chosen() {
    return chosen;
  },
  get shifts() {
    return shifts;
  },
  get built() {
    return built;
  },
  curl,
  drift,
  get at() {
    return at;
  },
  rails,
};
