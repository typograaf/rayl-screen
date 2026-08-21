import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * The card, as it was modelled.
 *
 * One mesh out of UI Card.blend — the design's rounded rectangle extruded and
 * subdivided, so the corners and the bevel are geometry rather than a normal
 * map pretending. It comes out of Blender lying flat with its thickness on y,
 * which is the exporter's habit and not a decision, so the first thing done to
 * it here is to stand it up: long side across, short side up, thickness towards
 * the camera. That is the frame everything else in this tool is written in.
 *
 * Scaled so the long side is exactly one unit. Every distance in the wheel —
 * radius, spacing, the gap between two cards — is then a share of a card, which
 * is how the design talks about them and the only way those numbers stay
 * meaningful when the framing changes.
 */

/* The design's card: 330 by 128, which the model matches to a tenth of a per
   cent. Kept here because the print is laid out in those units. */
export const CARD_ASPECT = 330 / 128;

let base = null;

/** The card geometry, standing up, centred, one unit across. */
export function cardGeometry() {
  return base;
}

/**
 * Load the model and put it in this tool's frame.
 *
 * Everything is baked into the buffer once rather than carried as a transform
 * on every card: there are a dozen of them sharing this one geometry, and a
 * shared geometry that needs a matrix to make sense is a geometry that will
 * eventually be used without it.
 */
export function loadCard(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        let found = null;
        gltf.scene.traverse((node) => {
          if (!found && node.isMesh) found = node.geometry;
        });
        if (!found) return reject(new Error("no mesh in " + url));

        const geometry = found.clone();
        /* Flat on the floor to standing up: thickness from y to z, the short
           side from z to y. */
        geometry.rotateX(-Math.PI / 2);
        geometry.center();
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const unit = 1 / (box.max.x - box.min.x);
        geometry.scale(unit, unit, unit);
        paint(geometry);
        geometry.computeBoundingBox();
        base = geometry;
        resolve(geometry);
      },
      undefined,
      reject,
    );
  });
}

/**
 * Where the print goes, and which side of the card it goes on.
 *
 * The model carries a uv map from the SVG it was traced off, which is not the
 * one the artwork is drawn against — so a plain planar mapping is laid over it:
 * straight across the card, top to bottom, the way a sheet goes through a
 * press.
 *
 * The face attribute is what keeps it to one side. Which way a normal points is
 * not asked, only how steeply it lies: the mirror this model was built with
 * leaves some of them facing into the card, so the magnitude says "this is a
 * face and not the rim" and the sign of z says which of the two faces it is.
 * The back stays blank and the rim stays the colour of the card, because that
 * is what a printed card is.
 */
function paint(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const width = box.max.x - box.min.x;
  const height = box.max.y - box.min.y;

  const uv = new Float32Array(position.count * 2);
  const face = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = (position.getX(i) - box.min.x) / width;
    /* v of one is the first row of the canvas, which is the top of the card:
       three flips a texture on the way to the GPU, so up on the card and up in
       the buffer are the same direction. */
    uv[i * 2 + 1] = (position.getY(i) - box.min.y) / height;
    const flat = normal ? Math.abs(normal.getZ(i)) : 1;
    face[i] = flat > 0.55 && position.getZ(i) > 0 ? 1 : 0;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("paint", new THREE.BufferAttribute(face, 1));
}
