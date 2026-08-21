/**
 * A tick you can feel, on the one platform that has one and no way to ask for
 * it.
 *
 * Safari has no Vibration API — `navigator.vibrate` is not there on any iPhone,
 * and never has been. The one thing on iOS that plays the system's own haptic
 * from a web page is the switch control Apple added in Safari 17.4: toggling
 * one ticks. So there is a switch on this page that nobody can see, and this
 * flips it.
 *
 * It is a trick and it is written down as one. If a future Safari stops ringing
 * it, the scrolling goes on working exactly as it did and the phone goes quiet,
 * which is the right way round for something that is decoration on a gesture.
 * Everywhere else it is already quiet: nothing else here plays haptics from a
 * page either.
 */

/* Two ticks closer together than this are one tick as far as a hand is
   concerned, and asking for them is how a fast flick turns into a buzz. */
const APART = 40;

export function mountHaptics() {
  const box = document.createElement("input");
  box.type = "checkbox";
  box.setAttribute("switch", "");
  box.id = "haptic";
  box.tabIndex = -1;
  box.setAttribute("aria-hidden", "true");

  const label = document.createElement("label");
  label.setAttribute("for", "haptic");
  label.setAttribute("aria-hidden", "true");

  /* Out of the way rather than display:none — a control that is not laid out
     is a control that is not activated either. */
  const hidden =
    "position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;" +
    "pointer-events:none;margin:0;padding:0;border:0";
  box.style.cssText = hidden;
  label.style.cssText = hidden;
  document.body.append(box, label);

  let last = 0;
  return function tick() {
    const now = performance.now();
    if (now - last < APART) return;
    last = now;
    try {
      label.click();
    } catch {
      // a browser that will not have it is a browser that stays quiet
    }
  };
}
