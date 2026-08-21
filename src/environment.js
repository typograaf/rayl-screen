import * as THREE from "three";

/**
 * The room, drawn rather than downloaded.
 *
 * The long tool lights its stack with a photographed studio — sixteen hundred
 * kilobytes of HDR before a single pixel is on screen, which is the right
 * trade for something that renders a still to six thousand pixels and the wrong
 * one for something that has to be up in a page. So the room here is a canvas:
 * a floor-to-ceiling ramp with a soft key burnt into it, blurred into an
 * irradiance map the way an HDR would be. It weighs nothing, it comes up in a
 * frame, and because it is generated the rig can move the key rather than
 * choosing between two photographs of somebody else's.
 *
 * The backdrop is the same gradient the design puts behind everything, mixed
 * straight down the frame — the sheet the cards are photographed against. It is
 * not the room: move the light and the cards change, the sheet does not.
 */

export const BACKDROP_TOP = "#81817b";
export const BACKDROP_BOTTOM = "#dbdbd2";

/*
 * The three rigs, as the short panel offers them: a family, and how hard.
 *
 * `key` is where the light is, as a share of the way round and up; `size` how
 * broad it is, which is the whole difference between a window and a bulb;
 * `sky` and `ground` the two ends of the room it stands in.
 */
export const RIGS = {
  Soft: { key: [0.62, 0.72], size: 0.55, power: 2, sky: 1, ground: 0.62 },
  Studio: { key: [0.7, 0.78], size: 0.3, power: 3, sky: 0.92, ground: 0.46 },
  Sharp: { key: [0.78, 0.86], size: 0.15, power: 5, sky: 0.66, ground: 0.26 },
};

export const RIG_NAMES = Object.keys(RIGS);

/** The sheet behind everything: one gradient, straight down the frame. */
export function backdrop() {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const ramp = ctx.createLinearGradient(0, 0, 0, 256);
  ramp.addColorStop(0, BACKDROP_TOP);
  ramp.addColorStop(1, BACKDROP_BOTTOM);
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/*
 * One equirectangular room, at the size an irradiance map is worth taking off.
 *
 * Small on purpose: everything here is either a ramp or a blur, and the pmrem
 * pass that follows throws away detail this side of a few degrees anyway. A
 * bigger canvas would be a bigger blur of the same picture.
 */
function room(rig, warmth) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");

  const ramp = ctx.createLinearGradient(0, 0, 0, 128);
  const sky = Math.round(rig.sky * 255);
  const ground = Math.round(rig.ground * 255);
  ramp.addColorStop(0, `rgb(${sky}, ${sky}, ${Math.round(sky * 0.98)})`);
  ramp.addColorStop(0.55, `rgb(${ground}, ${ground}, ${ground})`);
  ramp.addColorStop(1, `rgb(${ground}, ${ground}, ${ground})`);
  ctx.fillStyle = ramp;
  ctx.fillRect(0, 0, 256, 128);

  /* The key, as a blob with no edge to it. A hard-edged one reads as a hole in
     the wall rather than as a light, and every specular in the picture takes
     its shape. */
  const [u, v] = rig.key;
  const x = u * 256;
  const y = (1 - v) * 128;
  const r = Math.max(rig.size * 128, 4);
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
  const tint = `${255}, ${Math.round(255 - warmth * 10)}, ${Math.round(255 - warmth * 26)}`;
  glow.addColorStop(0, `rgba(${tint}, 1)`);
  glow.addColorStop(0.5, `rgba(${tint}, 0.35)`);
  glow.addColorStop(1, `rgba(${tint}, 0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The lighting: a room, and three lamps standing in it.
 *
 * The room is the ambient half — where the soft light comes from and what the
 * specular has to reflect. The lamps are the half you arrange: each one a point
 * in space you can drag about the picture, because translucency only fires from
 * behind and so the whole question is where each lamp is relative to the card.
 *
 * Only the first casts a shadow. A point light's shadow is a cube — six renders
 * of the scene — and three of them to catch what one already says would be an
 * expensive way to make the same picture darker.
 */
export class Lighting {
  constructor(renderer, scene, count = 3) {
    this.renderer = renderer;
    this.scene = scene;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.target = null;

    /* Decay of two and no cutoff: a real falloff, so pushing a lamp away with
       the wheel dims it the way pushing a lamp away does. */
    this.lamps = [];
    for (let i = 0; i < count; i++) {
      const lamp = new THREE.PointLight(0xffffff, 1, 0, 2);
      if (i === 0) {
        lamp.castShadow = true;
        lamp.shadow.mapSize.set(512, 512);
        lamp.shadow.camera.near = 0.05;
        lamp.shadow.camera.far = 12;
        lamp.shadow.bias = -0.004;
        lamp.shadow.normalBias = 0.02;
      }
      this.lamps.push(lamp);
      scene.add(lamp);
    }

    this.fill = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(this.fill);
  }

  /** Where the lamps are, how hard, and what colour. */
  setLamps(list) {
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i];
      const asked = list[i];
      if (!asked) {
        lamp.visible = false;
        continue;
      }
      lamp.visible = asked.level > 0.001;
      lamp.position.copy(asked.at);
      lamp.intensity = asked.level;
      lamp.color.set(asked.tint);
    }
  }

  /** Put the named room up, at the strength the panel is asking for. */
  set(name, strength, warmth = 0) {
    const rig = RIGS[name] || RIGS.Studio;
    if (this.target) this.target.dispose();
    this.target = this.pmrem.fromEquirectangular(room(rig, warmth));
    this.scene.environment = this.target.texture;
    this.scene.environmentIntensity = strength;
    this.fill.intensity = 0.12 * strength;
  }

  /** How dark the shadow is allowed to go, which is a look and not a physics. */
  setShadow(amount) {
    const key = this.lamps[0];
    key.castShadow = amount > 0.001;
    key.shadow.intensity = amount;
  }

  dispose() {
    if (this.target) this.target.dispose();
    this.pmrem.dispose();
  }
}
