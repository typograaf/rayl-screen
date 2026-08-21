import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

/**
 * A tick you can feel.
 *
 * In the app it is the real thing: `UIImpactFeedbackGenerator`, through
 * Capacitor, which is the same tap the system's own pickers make. That is the
 * whole reason this is an app and not only a page.
 *
 * In a browser there is no such call. Safari has no Vibration API —
 * `navigator.vibrate` is not on any iPhone and never has been — and the one
 * thing on iOS that plays a haptic from a page is the switch control Apple
 * added in Safari 17.4: toggling one ticks. So on the web there is a switch
 * nobody can see and this flips it. A trick, written down as one: if a Safari
 * stops ringing it, the scrolling goes on working and the phone goes quiet,
 * which is the right way round for something that is decoration on a gesture.
 */

/* Two ticks closer together than this are one tick as far as a hand is
   concerned, and asking for them is how a fast flick turns into a buzz. */
const APART = 40;

function throttled(ring) {
  let last = 0;
  return function tick() {
    const now = performance.now();
    if (now - last < APART) return;
    last = now;
    ring();
  };
}

export function mountHaptics() {
  if (Capacitor.isNativePlatform()) {
    return throttled(() => {
      /* Light, because this is a detent going past and not a thing landing. */
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    });
  }

  const box = document.createElement("input");
  box.type = "checkbox";
  box.setAttribute("switch", "");
  box.id = "haptic";
  box.tabIndex = -1;
  box.setAttribute("aria-hidden", "true");

  const label = document.createElement("label");
  label.setAttribute("for", "haptic");
  label.setAttribute("aria-hidden", "true");

  /* Out of the way rather than display:none — a control that is not laid out is
     a control that is not activated either. */
  const hidden =
    "position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;" +
    "pointer-events:none;margin:0;padding:0;border:0";
  box.style.cssText = hidden;
  label.style.cssText = hidden;
  document.body.append(box, label);

  return throttled(() => {
    try {
      label.click();
    } catch {
      // a browser that will not have it is a browser that stays quiet
    }
  });
}
