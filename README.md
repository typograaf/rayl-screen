# Rayl Screen

The screen from node 800:5314, running on a phone.

    npm install
    npm run dev      # in a browser
    npm run sim      # in the simulator, as the app
    npm run app      # build, sync, and open Xcode for a real phone
    npm test

It is an app as well as a page, and the reason is haptics: iOS gives a web page
no way to ask for one. As an app it is `UIImpactFeedbackGenerator` through
Capacitor — the same tap the system's own pickers make — and every detent rings
it. In a browser it falls back to the switch trick below and everything else
works the same.

For a phone, `npm run app` opens the project in Xcode: pick your team under
Signing & Capabilities, choose the phone, press run. A device needs a signature
and a signature needs an account, so that part is yours. In a browser, add it to
the Home Screen and it opens without Safari around it, which is the size it is
drawn at: the design is 874 tall and a tab in Safari is about 660.

## What it is made of

The cards are the wheel from [rayl-wheel](../rayl-wheel), at one state of it.
The link that state came from is written out in full at the top of `main.js`, so
what is on this screen and what was arranged in the tool are the same thing and
can be checked against each other rather than remembered. The render half came
across whole — the card, the sheet the designs are drawn on, the wheel, the room
and the lamps — and the panel did not, because a screen has no panel.

Two things the tool does not do are here instead: a card is told which design it
carries rather than repeating a run of them, since a day's shifts are a list and
not a loop; and there is no backdrop in the picture, because the paper behind
the cards is the screen's own gradient, in CSS, under everything else. A second
one drawn in the canvas would be the same gradient half a pixel out.

## Smooth, and what was in the way of it

Two things were making it stutter, and neither was the picture.

**Shaders were being compiled mid-flick.** `transparent` is baked into three's
program as OPAQUE, so a card flipping to see-through as it reached the edge of
the arc recompiled its own shader — several times a gesture, each one a stall
long enough to feel. The materials are see-through from the moment they are made
now and opacity is a uniform, which costs nothing to change. The suite scrolls
the reel for eighty frames and fails if a single program is built.

**And the picture was being drawn from scroll events.** A scroll event on a
phone arrives when the browser gets round to it, and during momentum they are
coalesced — so the cards lagged the finger and then caught up, which is exactly
what choppy looks like. Nothing listens for the scroll any more: the reel's
position is read once a frame, in the same breath as the drawing, so the cards
are wherever the scroller is at the moment the frame is made.

## Everything scrolls, and none of it is written here

Every rail and the cards are real scrollers with the phone's own physics in
them. The momentum, the rubber band at the ends, the way a flick decays, the way
a thumb can catch one mid-flight — none of it is written by hand, because none
of it can be written as well as it already works, and on a phone that is most of
what a screen feels like.

The cards are the one that needs saying. The picture is a canvas and a canvas
cannot be scrolled, so there is an invisible scroller over it with a stop for
every shift, and the wheel reads its position. A stop is one card's height on
screen — the card's own size at this framing, plus the air between two of them —
so a drag moves the wheel exactly as far as the thumb moved.

**The middle is the selection**, everywhere: the day in the middle of the days,
the month in the middle of the months, the card in the middle of the picture.
Which is why every rail has half a cell of air at each end, so the first and the
last of anything can reach the middle like the rest.

## The days and the months

One flat run of days across several months, because that is what scrolling one
asks for: a day is next to the day after it whether or not a month ends in
between. The months are an index into that run rather than a second list, so a
month cannot disagree with the day it is showing.

Scroll the days off the end of a month and the months rail follows, because the
day that is now in the middle is in a different one. Scroll the months and the
days correct themselves to the same date in the month you asked for — and to its
last day if it does not have one, since the 31st of a thirty-day month is not a
reason to jump to the first.

Neither pushes back on the other. The days move the months only when the month
is not already the one the chosen day is in, and the months move the days only
when the day is not already in the month, so the two settle instead of chasing
each other round.

## The tick

Safari has no Vibration API. `navigator.vibrate` is not on any iPhone and never
has been, so the usual answer does not exist here.

What does exist is the switch control Apple added in Safari 17.4: toggling one
plays the system's own haptic. So there is a switch on the page that nobody can
see and every detent flips it — a day passing the middle, a month, a card. Two
ticks closer together than forty milliseconds are one tick as far as a hand is
concerned, so they are not sent.

It is a trick and it is written down as one. If a Safari stops ringing it, the
scrolling goes on working exactly as it did and the phone goes quiet, which is
the right way round for something that is decoration on a gesture.

## The column is what the screen leaves

Every cell in the three rails is `flex-1` in the file — an equal share of what is
left once the rules and the gaps are taken out. 95.333, 42 and 68 are what those
shares come to at the 402 the file is drawn at, and they are not the design: the
shares are.

Pinned to those pixel widths, the four distances — which come to exactly one
column — came to a column and a bit on a 393 phone, so the row scrolled when it
should have sat still, shunted 41 points out of place with its last chip over
the edge. The shares are worked out from the column the screen actually leaves
now, and a row that already fits does not get the half-cell of air either.

## Off the file, not off a glance

Every measurement is node 800:5314's: 36 down either side, 65 above the mark, 36
to the calendar and 36 to the cards, 33 to the tabs and 37 under them; 12
between the calendar's three rows and 6 between everything inside one; 2 for
every rule, rounded at 33 in the months, 80 in the days and the distance, 59 in
the tabs; 12pt type at 0.24 tracking and 1.2 leading, cap-trimmed. The three
rails' cells are what 330 comes out at once the gaps and the rules are taken
out — 95.333, 42 and 68 — and half the suite is that arithmetic, because a
screen that has drifted two points from the design survives every glance and
none of it.

The file gives the chosen day a black block with a light green rule through it
and gives the months, the distances and the tabs nothing at all. Dimming the
ones that are not chosen was mine, and it is gone: if those rows want a chosen
state it is a decision for the file to make.

What is not taken from the file is the phone the file draws around itself — its
corners, its notch, its home indicator. This runs on one, so those are the
device's and what is left is the safe areas.
