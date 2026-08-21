import * as THREE from "three";
import { CARD_ASPECT, cardFor, CARD_WIDE } from "./card.js";
import { cardTile, cardHeight, cardShape, CARD_SHAPE } from "./cardart.js";

/**
 * The wheel: a list of cards mounted round the outside of a drum.
 *
 * The drum lies across the frame with its axis horizontal, so scrolling turns
 * it and the cards ride up and over. Card `i` sits (scroll - i) steps round
 * from the front, and the front is the middle of the picture — so the number in
 * the scroll is which card is being looked at, and the fraction is how far it
 * has been dragged towards the next one.
 *
 * That sign is the whole of which way a list runs: at rest the first card is in
 * the middle and everything after it hangs below, the way a page of anything
 * does, and turning the wheel forwards brings the next one up rather than
 * fetching the last one back.
 *
 * The drum is placed so its front is at the origin rather than its centre. Both
 * cameras then look at the origin and the card at rest is the same size under
 * either of them, which is the whole point of offering the two.
 *
 * Nothing is drawn on the far side. A drum is a loop and a list is not, so a
 * card that has been scrolled past has gone rather than come round: past the
 * arc it is switched off, and for the last few degrees before that it fades, so
 * it leaves rather than blinks.
 *
 * And the cards are not all the same size. The design cuts a card to what is on
 * it, so where each one sits is a running total of the ones before it — half of
 * each of them and the air between — rather than its number times a pitch. The
 * scroll is a distance round the drum for the same reason: a count of cards is
 * only a distance when every card is the same.
 */

/* The card the file draws: one unit across and this much down. Cards are not
   all this tall — the design cuts each one to what is on it — but the drum is
   still measured in these, so that a radius of 1.75 means the same curve
   whatever mix of cards is on it. */
export const CARD_HEIGHT = 1 / CARD_ASPECT;

/** A design's height, in the same units: a share of the card's width. */
export const heightOf = (design) => cardHeight(design) / CARD_WIDE;

const RADIANS = Math.PI / 180;

/**
 * One card's material: the print laid into the surface, on one face.
 *
 * The sheet is shared and the card's own place on it is a uniform, so six
 * designs and a dozen cards are one texture and one program. The `paint`
 * attribute out of the model decides where the ink is allowed to land — the
 * front face and nothing else, so the back and the rim stay the colour of the
 * card.
 */
function cardMaterial(atlas, tile) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe9e9e2,
    roughness: 0.55,
    metalness: 0,
    sheen: 0.5,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0xffffff),
    clearcoat: 0,
    clearcoatRoughness: 0.4,
    map: atlas,
    /*
     * See-through from the start, and it stays that way.
     *
     * `transparent` is baked into three's program as OPAQUE, so flipping it as
     * a card starts to fade means recompiling that card's shader — mid-scroll,
     * on a phone, several times a flick. Every one of those is a stall you can
     * feel, and it is the difference between this wheel gliding and stuttering.
     * Left on, opacity is a uniform and costs nothing to change.
     */
    transparent: true,
  });

  material.userData.tile = { value: new THREE.Vector4(...tile) };
  /* The graded finish: two colours and a radial sweep between them, or nothing
     at all and the flat one the material already carries. */
  material.userData.grade = { value: 0 };
  material.userData.inside = { value: new THREE.Color(0xcecec5) };
  material.userData.edge = { value: new THREE.Color(0xe7e7e0) };
  /* Light coming through the card rather than off it: how much, how wide it
     spreads, how far it wraps round the terminator, and how tight the lobe is. */
  material.userData.through = { value: new THREE.Vector4(0, 0.28, 0.35, 2) };
  material.userData.shape = {
    value: new THREE.Vector3(
      CARD_SHAPE.half[0],
      CARD_SHAPE.half[1],
      CARD_SHAPE.radius,
    ),
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = material.userData.tile;
    shader.uniforms.uGrade = material.userData.grade;
    shader.uniforms.uInside = material.userData.inside;
    shader.uniforms.uEdge = material.userData.edge;
    shader.uniforms.uShape = material.userData.shape;
    shader.uniforms.uThrough = material.userData.through;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float paint;\nvarying float vPaint;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\n\tvPaint = paint;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform vec4 uTile;\nuniform float uGrade;\n" +
          "uniform vec3 uInside;\nuniform vec3 uEdge;\nuniform vec3 uShape;\n" +
          "uniform vec4 uThrough;\nvarying float vPaint;",
      )
      /*
       * Laid into the colour rather than multiplied over it.
       *
       * The sheet is ink on nothing: its alpha is where a mark is and its rgb
       * is the colour that mark was drawn at. Multiplying would tint the card
       * everywhere the sheet is clear; mixing puts the design's own grey on
       * the card and leaves the rest of it alone.
       */
      .replace(
        "#include <map_fragment>",
        `/*
         * The card's own colour first, flat or graded, and the design on top of
         * whichever it is.
         *
         * The sweep runs from the middle of the card outwards, in the same
         * planar coordinates the print is laid in — so it is a circle in the
         * card's own space, which on something two and a half times as wide as
         * it is tall reaches all four edges at once rather than the long ones
         * last.
         *
         * The two colours are mixed as levels and turned into light afterwards,
         * not held as light and mixed there. A gradient is a thing somebody drew
         * in a design tool, and design tools interpolate as levels: e7 to ce has
         * its middle at db, where mixing the same two as light puts it several
         * levels off what the person who chose them expects.
         */
        if (uGrade > 0.5) {
          /*
           * How far in from the edges this is, in the card's own units.
           *
           * Not how far out from the middle. A circle measured in uv is an
           * ellipse on a card two and a half times as wide as it is tall, and
           * an ellipse gives the short edges their falloff over sixty-four
           * units and the long ones over a hundred and sixty-five — which
           * reads exactly as it is: the ends lit and the sides not, on a card
           * that is one material.
           *
           * So each pair of edges is measured on its own, over the same depth,
           * and the two are multiplied. Which matters more than it sounds: the
           * obvious way to combine them is to take the nearer edge, and the
           * nearer edge changes which one it is along the diagonals — a fold in
           * the falloff that comes out as a triangle in each corner, sharpest
           * exactly where a corner should be softest. A product has no fold in
           * it anywhere.
           *
           * Smoothstepped rather than straight, so the falloff has no kink
           * where it arrives either: a linear ramp meeting its own limit is a
           * line the eye finds, on a gradient with nothing else in it to look
           * at.
           */
          vec2 fromMiddle = (vMapUv - 0.5) * uShape.xy * 2.0;
          vec2 toEdge = uShape.xy - abs(fromMiddle);
          float deep = min(uShape.x, uShape.y);
          vec2 fromEach = smoothstep(vec2(0.0), vec2(deep), toEdge);
          vec3 sweep = mix(uEdge, uInside, fromEach.x * fromEach.y);
          diffuseColor.rgb = mix(
            sweep / 12.92,
            pow((sweep + 0.055) / 1.055, vec3(2.4)),
            step(vec3(0.04045), sweep)
          );
        }

        vec4 print = texture2D(map, vMapUv * uTile.xy + uTile.zw);
        diffuseColor.rgb = mix(diffuseColor.rgb, print.rgb, print.a * vPaint);`,
      )
      /*
       * And the light that comes through the card rather than off it.
       *
       * Added where three has finished adding everything that comes off it, as
       * indirect light — which is what it is: it arrived at the far side, was
       * scattered about inside a few millimetres of material and left in every
       * direction, and the one thing it no longer remembers is where it came
       * from.
       *
       * The term only fires when a lamp is behind the card, which is why the
       * lamps are a thing to arrange by hand: the whole gesture is asking which
       * side of the card a light is on. `scatter` bends the lamp's direction
       * along the normal, which is how far the glow spreads round from directly
       * behind; `wrap` carries the ordinary shading past the terminator, the way
       * light does in anything it can get into; `falloff` is how tight the lobe
       * is, and so how much of the card lights up at once.
       *
       * Shadow is not asked for on purpose. A lamp behind the card is occluded
       * by the card, so a term that respected the shadow map would be a
       * translucency that only worked where nothing was in the way.
       */
      .replace(
        "#include <lights_fragment_end>",
        `#include <lights_fragment_end>
        #if NUM_POINT_LIGHTS > 0
        if (uThrough.x > 0.0 || uThrough.z > 0.0) {
          vec3 look = normalize(vViewPosition);
          vec3 glow = vec3(0.0);
          for (int i = 0; i < NUM_POINT_LIGHTS; i++) {
            vec3 toLamp = pointLights[i].position + vViewPosition;
            float away = length(toLamp);
            vec3 lamp = toLamp / max(away, 1e-4);
            vec3 lit = pointLights[i].color * getDistanceAttenuation(
              away, pointLights[i].distance, pointLights[i].decay
            );
            vec3 bent = normalize(lamp + normal * uThrough.y);
            glow += lit * pow(clamp(dot(look, -bent), 0.0, 1.0), uThrough.w) * uThrough.x;
            float facing = dot(normal, lamp);
            glow += lit * (
              clamp((facing + uThrough.z) / (1.0 + uThrough.z), 0.0, 1.0) -
              clamp(facing, 0.0, 1.0)
            );
          }
          reflectedLight.indirectDiffuse += glow * diffuseColor.rgb;
        }
        #endif`,
      );
  };
  /* Every card compiles to the same program, and it is not the stock one. */
  material.customProgramCacheKey = () => "rayl-card-print";
  return material;
}

export class Wheel {
  constructor(scene, geometry, atlas) {
    this.scene = scene;
    this.geometry = geometry;
    this.atlas = atlas;
    this.cards = [];
    /* How tall each card on the drum is, and how far round the drum it sits
       from the first — both in the card's own units, and both worked out from
       what is printed on them. */
    this.tall = [];
    this.round = [];
  }

  /** As many cards as the panel asks for, each with its own design. */
  setCount(count) {
    while (this.cards.length > count) {
      const card = this.cards.pop();
      this.scene.remove(card);
      card.material.dispose();
    }
    while (this.cards.length < count) {
      const i = this.cards.length;
      const card = new THREE.Mesh(
        this.geometry,
        cardMaterial(this.atlas, cardTile(i)),
      );
      card.castShadow = true;
      card.receiveShadow = true;
      this.cards.push(card);
      this.scene.add(card);
    }
  }

  /**
   * Which design each card carries, said outright.
   *
   * The tool this came from runs a repeating run of them, because a loop has to
   * close; a day's shifts are a list and repeat only by coincidence, so here
   * every card is told what it is.
   */
  setArt(designs, spacing = 0) {
    this.tall = [];
    for (let i = 0; i < this.cards.length; i++) {
      const design = designs[i % designs.length];
      const card = this.cards[i];
      const tall = heightOf(design);
      this.tall.push(tall);
      card.material.userData.tile.value.set(...cardTile(design));
      /* The shape the graded finish measures its falloff against is this card's
         own, or a tall card would be lit like a short one. */
      const shape = cardShape(design);
      card.material.userData.shape.value.set(
        shape.half[0],
        shape.half[1],
        shape.radius,
      );
      /* And the model, stretched to the height this design came out at. */
      card.geometry = cardFor(tall) || card.geometry;
    }
    this.lay(spacing);
  }

  /**
   * How far round the drum each card sits, in the card's own units.
   *
   * Which used to be `i` times a pitch, and cannot be once the cards are not
   * all the same height: the distance from one to the next is half of each of
   * them and the air between. So it is a running total, and everything that
   * used to count in cards — the scroll, the stops on the reel, where the
   * middle is — counts in this instead. There are a dozen of them; it is worked
   * out when the day changes and read from an array after that.
   */
  lay(spacing) {
    const air = CARD_HEIGHT * spacing;
    this.round = [0];
    for (let i = 1; i < this.tall.length; i++) {
      this.round.push(
        this.round[i - 1] + (this.tall[i - 1] + this.tall[i]) / 2 + air,
      );
    }
  }

  /** Which card is nearest a place on the drum. */
  nearest(round) {
    let best = 0;
    let gap = Infinity;
    for (let i = 0; i < this.round.length; i++) {
      const away = Math.abs(this.round[i] - round);
      if (away < gap) {
        gap = away;
        best = i;
      }
    }
    return best;
  }

  /** Where a card sits on the drum. */
  placeOf(i) {
    return this.round[Math.max(0, Math.min(i, this.round.length - 1))] || 0;
  }

  /**
   * A different sheet, at the same coordinates.
   *
   * Where each card sits on it is a fraction, so a sheet drawn at four times
   * the size is a straight swap — which is how an export gets a print with
   * pixels in it without anything else in the tool knowing there was a change.
   */
  setPrint(atlas) {
    this.atlas = atlas;
    for (const card of this.cards) {
      card.material.map = atlas;
      card.material.needsUpdate = true;
    }
  }

  /** The colour and finish of every card, which is one surface and not many. */
  setSurface({
    colour,
    roughness,
    sheen,
    coat,
    graded,
    inside,
    edges,
    through,
    scatter,
    wrap,
    falloff,
  }) {
    for (const card of this.cards) {
      card.material.color.set(colour);
      card.material.roughness = roughness;
      card.material.sheen = sheen;
      card.material.clearcoat = coat;
      card.material.userData.grade.value = graded ? 1 : 0;
      /* Held as the bytes the design names — the turning into light happens in
         the shader, after the mixing. */
      card.material.userData.inside.value.setStyle(inside, THREE.NoColorSpace);
      card.material.userData.edge.value.setStyle(edges, THREE.NoColorSpace);
      card.material.userData.through.value.set(through, scatter, wrap, falloff);
    }
  }

  /**
   * Where every card is, at this scroll.
   *
   * `radius` and `spacing` are both in cards: how many card-heights across the
   * drum is, and how much clear air there is between one card and the next
   * along its surface. Read that way the two are independent — a wider drum at
   * the same spacing is a flatter run of the same list, rather than the same
   * curve with the cards further apart.
   */
  update({
    radius,
    arc,
    fade,
    scroll,
    thickness,
    lean = 0,
    slide = 0,
    frame = Infinity,
    edge = 1,
  }) {
    /*
     * The drum is measured in the file's card and not in whichever card is on
     * it. A radius of 1.75 is 1.75 of the card the design draws, so a day
     * carrying a tall card is the same curve as a day that is not — the tall
     * one simply takes up more of it.
     */
    const R = Math.max(radius, 0.2) * CARD_HEIGHT;
    const limit = arc * RADIANS;
    const soft = Math.max(fade * RADIANS, 1e-4);
    const count = this.cards.length;

    for (let i = 0; i < count; i++) {
      const card = this.cards[i];
      const tall = this.tall[i] ?? CARD_HEIGHT;
      /* Where this card sits on the drum, which is a running total of the ones
         before it rather than its number times a pitch. */
      const theta = (scroll - this.placeOf(i)) / R;
      if (Math.abs(theta) >= limit) {
        card.visible = false;
        continue;
      }
      card.visible = true;
      /*
       * `lean` slides the whole wheel up or down the frame — at the ends of a
       * list it is what puts the first card at the top and the last at the
       * bottom, so the frame fills instead of showing one card in the middle of
       * nothing. `slide` does the same across it, which is how a month reads as
       * a column: drag the months and the day's cards go with them.
       */
      card.position.set(
        slide,
        R * Math.sin(theta) + lean,
        R * Math.cos(theta) - R,
      );
      card.rotation.x = -theta;
      card.scale.z = thickness;

      const over = Math.abs(theta) - (limit - soft);
      const turned = over <= 0 ? 1 : Math.max(0, 1 - over / soft);
      /*
       * And a card fades out before it reaches the edge of the frame, not on
       * its way through it.
       *
       * The fade above is the drum's: a card fades because it has turned away,
       * which is the whole of it while the drum is at its own radius — the arc
       * is done with a card well before the card reaches an edge, so no edge is
       * ever involved. Open the drum out flat at the ends of a list and that
       * stops being true. Nothing has turned by more than a few degrees, so
       * nothing fades, and the frame simply stops: a card is cut through by a
       * line in mid-air.
       *
       * Fading a card by how much of it is already past the edge does not fix
       * that, it only dims it — a card three-quarters on at half opacity is
       * still a card with a straight edge sawn through it. So the fade is over
       * the last margin *inside* the frame instead, and it is spent by the time
       * the card's own edge arrives at the frame's. Nothing is ever cut,
       * because there is never anything there to cut.
       *
       * Which is why the ends of a list land a margin in rather than flush: a
       * card that has landed sits exactly on the line this fade starts at, so
       * it is whole, and one that carries on past it is gone before it can be
       * cut. One number does both.
       */
      const outer = Math.abs(card.position.y) + tall / 2;
      const near = Math.max(0, Math.min((frame - outer) / edge, 1));
      const opacity = Math.min(turned, near * near * (3 - 2 * near));
      /* Nothing else to say: the material has been see-through since it was
         made, so this is a uniform and not a recompile. */
      card.material.opacity = opacity;
      /* A card that has faded out casts no shadow either, or the light shows
         something the picture does not. */
      card.castShadow = opacity > 0.02;
    }
  }

  /** Off, without taking it apart — the cards stay for the next time. */
  hide() {
    for (const card of this.cards) card.visible = false;
  }

  /** How far round the drum the whole run goes, end to end. */
  span() {
    return this.placeOf(this.round.length - 1);
  }
}
