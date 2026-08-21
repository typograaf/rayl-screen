import * as THREE from "three";

/**
 * What is printed on a card, drawn into one atlas.
 *
 * Node 800:6538, in the design's own units and scaled once on the way to the
 * canvas — every measurement below can be read straight against the file. Drawn
 * rather than exported, for the reason a texture is usually exported: a card is
 * 330 across in the design and can be most of a retina frame here, and a flat
 * PNG of one would be soft long before that. This is redrawn at whatever size
 * it is asked for, in the same Azeret the panel is set in.
 *
 * It comes out on nothing. The card itself is not drawn, only the marks on it,
 * so the alpha of this texture is where the ink is and the card underneath goes
 * on being a material you can dial.
 */

/* The card, in the design's units. */
const W = 330;
const H = 128;
const PAD = 24;
const GAP = 24;

/*
 * The card's outline, in the design's units — half across, half down, and the
 * corner. What the print is laid out in, and what the graded finish measures
 * its falloff against, so the two cannot drift apart.
 *
 * Half down is per card, because the height is: the design cuts a card to what
 * is on it. `CARD_SHAPE` is the one the file draws, and `cardShape` is any of
 * them.
 */
export const CARD_SHAPE = { half: [W / 2, H / 2], radius: 24 };
export const cardShape = (i) => ({
  half: [W / 2, cardHeight(i) / 2],
  radius: 24,
});

/* The design's own two. */
const INK = "#3f3f3b";
const TROUGH = "#cecec5";

/* Rules and bars are 2 through the middle of everything, rounded at 41 — which
   on something 2 across is simply round. */
const RULE = 2;

/*
 * Every icon at four fifths of the size it was cut at — node 800:8147, where
 * the six of them are shown on the same card at their own sizes, and every one
 * comes out at exactly 0.8 of its own artboard. They are not one size: the card
 * in the design grows and shrinks by a few points to fit whichever it carries.
 */
const ICON = 0.8;

/*
 * How many canvas pixels one design unit gets.
 *
 * Three is what a retina preview wants: the card is 330 across in the design
 * and about a thousand pixels across in a preview at that size, so the sheet
 * has a pixel for each of them and a little over.
 *
 * It is an argument rather than a constant because an export is not a preview.
 * A card six thousand pixels wide asked of a sheet drawn for a thousand is a
 * blur with the right colours in it — which is the one thing a design drawn
 * rather than exported does not have to be. Every measurement below is in the
 * design's own units and the scale is put on the context once, so the same code
 * draws the same card at any size.
 */
export const PRINT_SCALE = 3;

/* Three across and two down, which keeps the sheet nearer square than a strip
   and so further from any driver's limit on one side. */
export const CARD_COLUMNS = 3;

/*
 * The six, all the same shape as the design's one.
 *
 * Only the third is in the file — the others are the same layout carrying the
 * other five jobs, so a wheel scrolls through something rather than repeating
 * one card six times. `bar` is how far the progress line has run, which the
 * design draws at 100 of the block's width on the card it shows.
 */
const CARDS = [
  {
    icon: "icon-1.svg",
    title: ["Huwelijks", "Fotograaf"],
    at: "@Meetdistrict",
    hours: "09:00 — 17:00",
    shift: "1/1",
    people: "2",
    length: "8u00min",
    bar: 0.35,
  },
  {
    icon: "icon-2.svg",
    title: ["Horeca", "Medewerker"],
    at: "@Meetdistrict",
    hours: "11:30 — 19:00",
    shift: "2/3",
    people: "1",
    length: "7u30min",
    bar: 0.55,
  },
  {
    icon: "icon-3.svg",
    title: ["Schoonmaak", "Medewerker"],
    at: "@Meetdistrict",
    hours: "10:00 — 15:30",
    shift: "1/2",
    people: "1",
    length: "5u30min",
    bar: 0.7,
  },
  {
    icon: "icon-4.svg",
    title: ["Technisch", "Medewerker"],
    at: "@Meetdistrict",
    hours: "08:00 — 16:30",
    shift: "1/2",
    people: "3",
    length: "8u30min",
    bar: 0.2,
  },
  {
    icon: "icon-5.svg",
    title: ["Front-desk", "Receptionist"],
    at: "@Meetdistrict",
    hours: "09:30 — 18:00",
    shift: "3/4",
    people: "1",
    length: "8u30min",
    bar: 0.85,
  },
  {
    icon: "icon-6.svg",
    /* Three lines, and the card is eighteen taller for it — the one design here
       that is a different height from the file's, so that a screen full of them
       is a screen full of the sizes they come in. */
    title: ["Assistent", "Facility", "Manager"],
    at: "@Meetdistrict",
    hours: "07:30 — 16:00",
    shift: "1/3",
    people: "2",
    length: "8u30min",
    bar: 0.45,
  },
];

export const CARD_COUNT = CARDS.length;
const ROWS = Math.ceil(CARD_COUNT / CARD_COLUMNS);

/*
 * How tall each card is, in the design's units.
 *
 * The design cuts the card to its contents: 24 above the block and 24 below it,
 * whatever the block comes to. An icon two points shorter is a card two points
 * shorter and a third line of title is a card eighteen taller — which is what
 * the file does and what this used to fake by centring every block in one
 * height. Measured rather than declared, because the block is measured: it is
 * the type's own cap heights and the icon's own artboard, and neither is a
 * number anybody can write down.
 *
 * Filled in when the sheet is drawn, which is before there is a card to put it
 * on. Until then every card is the file's own.
 */
const sizes = CARDS.map(() => H);
/* What is on each card, measured, and the air that is added to it — kept so the
   one rule this follows can be checked rather than described. */
const blocks = CARDS.map(() => H - 48);
export const cardBlocks = () => blocks.slice();
export const cardHeight = (i) =>
  sizes[((i % CARD_COUNT) + CARD_COUNT) % CARD_COUNT];
export const cardTallest = () => Math.max(...sizes);

/**
 * An icon, recoloured to the ink and handed back with the size it was cut at.
 *
 * The artwork is the file rather than anything reconstructed here, but the
 * files carry the long card's lighter grey, so the fill is rewritten on the way
 * past. The size is read off the file's own width and height rather than the
 * loaded image's: an SVG that is 27.5 across comes back as an integer number of
 * pixels, and a rounded icon is a rounded icon at every size after it.
 */
const icons = new Map();

function loadIcon(name) {
  if (icons.has(name)) return icons.get(name);
  const ready = fetch(new URL(`cards/${name}`, document.baseURI).href)
    .then((r) => r.text())
    .then(
      (svg) =>
        new Promise((resolve) => {
          const inked = svg.replace(
            /fill="#[0-9a-fA-F]{3,8}"/g,
            `fill="${INK}"`,
          );
          const size = {
            width: parseFloat((svg.match(/width="([\d.]+)"/) || [])[1]) || 20,
            height: parseFloat((svg.match(/height="([\d.]+)"/) || [])[1]) || 20,
          };
          const image = new Image();
          image.onload = () => resolve({ image, ...size });
          // an icon that will not load is not worth failing a whole sheet over
          image.onerror = () => resolve(null);
          image.src =
            "data:image/svg+xml;charset=utf-8," + encodeURIComponent(inked);
        }),
    )
    .catch(() => null);
  icons.set(name, ready);
  return ready;
}

/* Type is measured off its capitals rather than its em box, the way every text
   node in the design is trimmed. */
function capHeight(ctx) {
  return ctx.measureText("H").actualBoundingBoxAscent;
}

function setFace(ctx, size, tracking = 0) {
  ctx.font = `500 ${size}px Azeret, monospace`;
  ctx.letterSpacing = `${tracking}px`;
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/* Measured in the design's units, because that is what the font is set in:
   text metrics come back in user space and the scale is on the context. */
const widthOf = (ctx, text) => ctx.measureText(text).width;

/** A rounded bar, which every rule and every divider on this card is. */
function bar(ctx, x, y, w, h, colour) {
  const r = Math.min(w, h) / 2;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/**
 * One card, at the design's measurements.
 *
 * The frame is 24 all round with 24 between the two columns; the left one is as
 * wide as its longest line and the right one takes the rest. Down the left:
 * the icon, 12, the title, 12, the handle. Down the right: a rule, the hours,
 * the progress line, the shift, a rule — six apart, with the two rows sharing
 * whatever is left, which at the design's own height is 25 each.
 */
/**
 * What is on a card, measured: the icon, the title and the handle with twelve
 * between them. The card is this and a margin either side of it.
 */
function blockOf(ctx, card, icon) {
  const iconHeight = icon ? icon.height * ICON : 14;
  setFace(ctx, 18);
  const titleCap = capHeight(ctx);
  setFace(ctx, 10, 0.1);
  const atCap = capHeight(ctx);
  return (
    iconHeight + 12 + (18 * (card.title.length - 1) + titleCap) + 12 + atCap
  );
}

function drawCard(ctx, card, ox, oy, icon, tall) {
  ctx.save();
  ctx.translate(ox, oy);

  /* ------------------------------------------------------------ the left --- */

  /*
   * Measured before anything is drawn, because where the block starts depends
   * on how tall it comes out.
   *
   * In the design the card is cut to its contents: an icon two points shorter
   * makes a card two points shorter. There is one model here and it is one
   * height, so what the design does by resizing the card this does by centring
   * the block in it — the same distances, the same order, and no card riding
   * high because its icon is a flat one.
   */
  const iconWidth = icon ? icon.width * ICON : 16;
  const iconHeight = icon ? icon.height * ICON : 14;

  setFace(ctx, 18);
  const titleCap = capHeight(ctx);
  const titleWidth = Math.max(...card.title.map((line) => widthOf(ctx, line)));

  setFace(ctx, 10, 0.1);
  const atCap = capHeight(ctx);
  const atWidth = widthOf(ctx, card.at);

  const height =
    iconHeight + 12 + (18 * (card.title.length - 1) + titleCap) + 12 + atCap;
  /* Which comes to the margin, because the card was cut to the block: this is
     the same 24 the design draws, arrived at from the other end. */
  const top = (tall - height) / 2;
  let y = top;

  if (icon) {
    ctx.drawImage(icon.image, PAD, y, iconWidth, iconHeight);
  }
  y += iconHeight + 12;

  setFace(ctx, 18);
  card.title.forEach((line, i) => {
    /* Leading none: each line sits a full size below the one above it, and the
       block is trimmed to the caps of the first and the baseline of the last. */
    ctx.fillText(line, PAD, y + titleCap + i * 18);
  });
  y += 18 * (card.title.length - 1) + titleCap + 12;

  setFace(ctx, 10, 0.1);
  ctx.fillText(card.at, PAD, y + atCap);

  const leftWidth = Math.max(iconWidth, titleWidth, atWidth);

  /* ----------------------------------------------------------- the right --- */
  const x = PAD + leftWidth + GAP;
  const right = W - PAD - x;
  /* Stretched to the block beside it, the way the design has it — two rules, a
     trough and four gaps of six, and the two rows split what is left. */
  const row = (height - RULE * 3 - 6 * 4) / 2;

  bar(ctx, x, top, right, RULE, INK);
  const rowA = top + RULE + 6;
  const trough = rowA + row + 6;
  const rowB = trough + RULE + 6;
  bar(ctx, x, top + height - RULE, right, RULE, INK);

  bar(ctx, x, trough, right, RULE, TROUGH);
  bar(ctx, x, trough, Math.max(right * card.bar, RULE), RULE, INK);

  setFace(ctx, 10, 0.1);
  const cap = capHeight(ctx);
  const middle = (line) => line + (row + cap) / 2;

  /*
   * The hours, spread rather than packed.
   *
   * Three dividers and two cells, the cells padded six either side, and the
   * space that is left shared out evenly between the five — which is what
   * justify-between does with them in the file.
   */
  const hoursWidth = widthOf(ctx, card.hours) + 12;
  const shiftWidth = widthOf(ctx, card.shift) + 12;
  const spare = (right - RULE * 3 - hoursWidth - shiftWidth) / 4;
  let at = x;
  bar(ctx, at, rowA, RULE, row, INK);
  at += RULE + spare;
  ctx.fillText(card.hours, at + 6, middle(rowA));
  at += hoursWidth + spare;
  bar(ctx, at, rowA, RULE, row, INK);
  at += RULE + spare;
  ctx.fillText(card.shift, at + 6, middle(rowA));
  at += shiftWidth + spare;
  bar(ctx, at, rowA, RULE, row, INK);

  /*
   * The shift below it, packed rather than spread: twelve between everything,
   * the head count and its mark tight together, and the length taking whatever
   * room is left over.
   */
  const headWidth = widthOf(ctx, card.people) + 4 + 12;
  at = x;
  bar(ctx, at, rowB, RULE, row, INK);
  at += RULE + 12;
  ctx.fillText(card.people, at, middle(rowB));
  drawHours(ctx, at + widthOf(ctx, card.people) + 4, rowB + (row - 12) / 2);
  at += headWidth + 12;
  bar(ctx, at, rowB, RULE, row, INK);
  at += RULE + 12;
  const rest = W - PAD - RULE - 12 - at;
  const length = widthOf(ctx, card.length);
  ctx.fillText(card.length, at + (rest - length) / 2, middle(rowB));
  bar(ctx, W - PAD - RULE, rowB, RULE, row, INK);

  ctx.restore();
}

/*
 * The one mark that is not a file: a rounded square with a bar in it and a
 * handle above, at twelve across. It is nine paths in the design and four
 * rectangles here, which is the same picture at the size it is ever drawn.
 */
function drawHours(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(0, 0, 12, 12, 3);
  ctx.roundRect(1.5, 1.5, 9, 9, 1.5);
  ctx.fill("evenodd");
  ctx.beginPath();
  ctx.roundRect(4.5, 3, 3, 1.5, 0.75);
  ctx.roundRect(3, 6, 6, 3, [1.5, 1.5, 0.75, 0.75]);
  ctx.fill();
  ctx.restore();
}

/**
 * The whole sheet, once the type has arrived.
 *
 * The font has to be in before a single measurement is taken: everything on
 * this card is laid out around the width of its own type, so a sheet drawn in
 * the fallback face is not the same picture at a different weight — it is the
 * wrong picture.
 */
export async function cardAtlas(scale = PRINT_SCALE) {
  await document.fonts.load("500 18px Azeret");
  await document.fonts.load("500 10px Azeret");
  const art = await Promise.all(CARDS.map((card) => loadIcon(card.icon)));

  /*
   * The heights first, because the sheet is cut to them.
   *
   * Every cell on the sheet is the tallest card, and each card is drawn at the
   * top of its own — so a cell is a card and whatever is left under it, and
   * what is left is never sampled: the card's own tile stops at its own height.
   * A packer would waste less and cost more to be sure of, on a sheet that has
   * six things on it.
   */
  const measure = document.createElement("canvas").getContext("2d");
  CARDS.forEach((card, i) => {
    blocks[i] = blockOf(measure, card, art[i]);
  });
  /*
   * The air above and below the block is the air the file's own card leaves.
   *
   * The file gives one card — the third, the Schoonmaak one — at 330 by 128,
   * and its block measures whatever it measures here: this face's cap heights
   * and this icon's own artboard, neither of which is a number anybody can
   * write down. So the padding is worked back out of the one card there is a
   * height for, and every other card gets the same. That way the card the file
   * draws comes out at the file's 128 exactly, and a third line of title is 18
   * more than that rather than 18 more than a guess.
   */
  const air = (H - blocks[2]) / 2;
  CARDS.forEach((card, i) => {
    sizes[i] = Math.round(blocks[i] + air * 2);
  });
  const cell = cardTallest();

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(W * CARD_COLUMNS * scale);
  canvas.height = Math.round(cell * ROWS * scale);
  const ctx = canvas.getContext("2d");
  /* The scale, once, on the context: everything after this is the design's own
     numbers, at whatever size the sheet is being drawn. */
  ctx.scale(scale, scale);

  CARDS.forEach((card, i) => {
    const column = i % CARD_COLUMNS;
    const row = Math.floor(i / CARD_COLUMNS);
    drawCard(ctx, card, column * W, row * cell, art[i], sizes[i]);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Where card `i` sits on the sheet, as a scale and an offset in uv.
 *
 * The cells are a grid of the tallest card and each one is drawn at the top of
 * its cell, so the scale down the sheet is that card's own height rather than
 * the cell's — which is what keeps a short card's print off the bottom of a
 * tall card's cell.
 */
export function cardTile(i) {
  const index = ((i % CARD_COUNT) + CARD_COUNT) % CARD_COUNT;
  const column = index % CARD_COLUMNS;
  const row = Math.floor(index / CARD_COLUMNS);
  const cell = cardTallest();
  const tall = cardHeight(index);
  const sheet = cell * ROWS;
  return [
    1 / CARD_COLUMNS,
    tall / sheet,
    column / CARD_COLUMNS,
    /* v runs down the canvas and up the texture, so the first row of cells is
       the last row of uv — and a card sits at the top of its cell, so its own
       height is measured down from there. */
    1 - (row * cell + tall) / sheet,
  ];
}
