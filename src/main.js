import * as THREE from "three";
import { loadCard, CARD_ASPECT } from "./card.js";
import { cardAtlas, CARD_COUNT } from "./cardart.js";
import { Wheel } from "./wheel.js";
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
const DISTANCES = ["<5km", "<20km", "<50km", "Custom"];

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
 * time it is scrolled back to. Five to nine of them, which is what the design
 * has on screen at once: fewer than that and the wheel is a card in an empty
 * frame rather than a list you are somewhere in.
 */
function shiftsOn(date) {
  let seed =
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  next();
  const many = 5 + Math.floor(next() * 5);
  return Array.from({ length: many }, () => Math.floor(next() * CARD_COUNT));
}

let shifts = [];

/** The reel gets a stop for every card, and enough air either side that the
    first and the last can reach the middle. */
function layReel() {
  const step = pitch();
  const pad = Math.max((reel.clientHeight - step) / 2, 0);
  reel.style.paddingBlock = `${pad}px`;
  for (const stop of reel.children) stop.style.height = `${step}px`;
}

function showDay(index, { jump = true } = {}) {
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
  document
    .getElementById("distance")
    .style.setProperty("--cell", `${share(5, 8, 4)}px`);
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
    tick();
    onSettle(now);
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

  const found = { rail, settle, chosenOf, showing: () => showing, fit };
  rails[name] = found;
  return found;
}

/** Put a rail on a cell, without it counting as somebody scrolling it. */
function railTo(name, index, behavior = "smooth") {
  const { rail } = rails[name];
  const cell = rail.querySelector(`.cell[data-index="${index}"]`);
  if (!cell) return;
  const left = cell.offsetLeft + cell.offsetWidth / 2 - rail.clientWidth / 2;
  rail.scrollTo({ left, behavior });
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
  mountRail("months", months, (index) => {
    /*
     * A month scrolled to takes the days with it — to the same date if that
     * month has one. Only when it is not already the month the chosen day is
     * in, so the days pushing the months along does not push back.
     */
    if (calendar.days[chosen].month === index) return;
    const day = dayInMonth(calendar, index, calendar.days[chosen].number);
    railTo("days", day);
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
  mountRail("days", days, (index) => {
    showDay(index);
    /* And the month follows the day off the end of itself. */
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

/* --------------------------------------------------------------- the loop --- */

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

  if (!needs) return;
  needs = false;
  wheel.update({
    radius: LOOK.radius,
    spacing: LOOK.spacing,
    arc: LOOK.arc,
    fade: LOOK.fade,
    scroll: at,
    thickness: LOOK.depth,
    cycle: false,
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
  get at() {
    return at;
  },
  rails,
};
