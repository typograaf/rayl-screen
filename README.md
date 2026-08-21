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

## The ticks

Four of them, two points across and six tall, at the middle of the column,
above and below every rail — node 893:7501. They are how the screen says where
the choosing happens. Without them the middle is a convention somebody has to be
told about; with them it is a place you can see, and the thing under them is the
thing that is chosen.

Everything in the calendar is six apart, the three rails included, and the
distances are cut like the months: three across the column at the same width,
their rules landing on the same lines. Which is what makes that row scroll —
there are more than three of them, and what is past the edge is reached the same
way a month is.

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

**The months do not run out.** The run is built around today and grown a year at
a time whenever the month being shown comes within two of an end, so there is
always more of it in both directions and no edge to arrive at. It is only ever
grown, never trimmed: the day the screen is on is an index into this run, and an
index that means one date now and another later is the kind of thing that goes
wrong quietly — which is also why the day is carried across a rebuild by its
date rather than by its number. Growing rebuilds both rows of cells, so it waits
for a hand to come off them; a row rebuilt under a finger is a row that jumps.

Which cell is in the middle is arithmetic rather than a search — where the first
one starts, how far it is to the next, and where the middle of the rail has got
to. It used to ask every cell where it was, which is a measurement each and a
layout each, on every scroll event of every rail. That was survivable at six
months and is not survivable at a hundred.

**In fractions of a pixel, and that is the whole point of it.** A cell is 106.33
across and `offsetLeft` is rounded to whole pixels, so a pitch taken from two
neighbours is out by a third of a pixel and a month forty along is out by
thirteen — a rail that can never be home, columns sitting a few points off the
middle of the screen, and a sliver of the month next door showing at the edge at
rest for no reason anybody could see. Measured across the whole run, the error
divides away.

Neither pushes back on the other, and the way that is arranged took two goes.

The two things a rail does when it settles are told apart: what it is _for_
happens however it got there — a day chosen is a day chosen — and what it _says
to the other rail_ only happens when the other rail is not where it came from.
Suppressing the whole of it instead, which was the first try, meant a month
scrolled to moved the days and then never told anybody, so the rota stayed on
yesterday.

And a month arrives in one move rather than walking. Scrolled to smoothly, the
days went one at a time from here to there — every one of them a day chosen, a
rota built, a tick rung, and the months dragged back by each — which is what
"it bugs on" was. The suite crosses a month and fails if more than a day or two
gets laid out.

## Every rest is the same picture

The card that is chosen is in the middle of the frame, wherever in the list it
is: one faded card above it, one below, and the same three places every time it
comes to rest.

**Including at the ends of a list**, where there is nothing above the first card
and nothing below the last and centring the chosen one would leave half a screen
of empty paper. It is a rota, though, and there is no such thing as nothing
above the first shift of a day: there is the last shift of the day before. The
drum carries two of those at either end, faded like every other card that far
out. They are not stops on the reel — the list being scrolled is the day's, and
what is above and below it is the rota carrying on.

It used to open out. At either end the wheel flattened to nearly a straight line
and leaned far enough up or down that the card at that end sat against the edge
of the frame and the rest ran away from it, filling the space. That filled the
first screen and cost every screen after it, because the lean is only spent two
and a half cards in: every card chosen before that came to rest somewhere other
than the middle — the picture pushed down, a gap above it, the card below pushed
out of the frame — and near the end of a list the same thing the other way up.
The middle is what is chosen, so the middle is where it goes, and the emptiness
above the first card is what the top of a list is.

The suite stops at six places in a list, both ends included, and fails if the
chosen card is anywhere but the middle or if the three cards on screen stand
anywhere but where they stood at the last one.

## A month is a column

Dragging the months carries the day's cards sideways with them, as though each
month were a column with one on screen at a time.

It needs no animation and no state. The offset is measured from the month being
_shown_, so when the middle passes from one month to the next — which is the
moment the day changes and the cards with it — the column that was leaving is
suddenly measured from where it arrived, and comes in from the other side. Let
go and the rail's own settling brings it home, because settling is what takes
that measurement back to nothing.

Only under a hand, though. The days push the months along too, and a column
sliding out because the day it is showing has crossed into another month would
be the screen answering a question nobody asked.

**A day is a column, and there are three ways to drag one**: sideways across the
cards, along the days, or along the months. They are the same gesture as far as
the picture is concerned — one at a time, because a rail that has been put
somewhere by another rail says so and is not counted — and they all mean the
same thing, which is that a day is on its way in from one side and the one on
screen is on its way out the other.

The cards themselves are swiped on a pager: three pages wide, sitting on the
middle one, so a swipe is the phone's own scrolling with mandatory snapping and
goes one day rather than four. **The days rail comes with it** — the same cells
sliding under the same block as when the row itself is dragged, because the row
is the only thing on the screen that says which day this is and a day being
swiped through without it moving is the screen keeping a secret. It is muted
while it is carried, and its snapping is off: a rail that answered would choose
a day halfway through a swipe that has not landed, and a rail that snapped would
be pulled off the finger between one frame and the next. When it lands on a side page the day changes and
it goes back to the middle in the same breath, which nobody sees — at that
moment the day going is a whole column off the screen and the day coming is dead
centre, exactly where the day just chosen is about to be drawn.

**A column along**: a card and a margin, the same 36 that separates
everything else on this screen. Both columns are drawn — the one going and the
one coming — because with only one of them on screen a drag showed a column
leaving and then a screen of nothing until the next was suddenly the one being
measured. Two of them also makes the changeover free: halfway between two months
the day changes and the cards with it, and each column is exactly where the
other is about to be measured to, so they swap and nothing moves. The column
next door is rebuilt only when it is a different day, which under a hand is
once.

The canvas runs to the edges of the screen for the same reason: a column that
stopped at the column's own edge was cut off 36 points early, in mid-air, on a
background that carries on past it.

## The picture is the box

A phone's safe areas do not arrive with the first layout. The web view lays out
once with nothing at the top and the inset turns up a moment later — and nothing
about the window changed, so nothing said so. three writes the canvas's size onto
the element as well as onto its buffer, where an inline style beats the sheet, so
the column moved down by the notch and the picture stayed the size it had been:
a wheel drawn half an inset lower than the frame it is in, with that much of it
cut off the bottom.

Everything that read as sitting too low, or as the last card being clipped, was
that — and none of it was the wheel. The box is watched now rather than the
window, and the renderer is told to keep its hands off the element's style: the
sheet has the canvas at inset nought, which is right whatever else happens, and
only the buffer belongs to the code. The suite moves 96 points of inset in after
the fact and fails if the picture does not come with it.

**And a rail that has stopped anywhere but exactly on its cell is put on it.** A
snap lands where the browser puts it, which is not always the pixel this works
its own arithmetic from — and on the days, where a cell is 42 across and a
column is 354, one pixel out is seven points of column standing off the side of
the screen. That is the sliver of the day next door that kept turning up at
rest. There is nothing to see in the correction: a pixel or two, once the
scrolling has stopped. The deadband that decides a column is home is in points
of column for the same reason, since three points is a fifteenth of a month cell
and a hundredth of a day, and it is the column that shows.

## The block does not flash

The chosen day is a black block with a green rule through it, and it belongs to
a cell. An instant scroll moves a rail inside the call that asks for it and the
event that says so arrives afterwards — so the frame in between had the rail on
the new day and the block still on the old one, sitting off to one side of the
row: scrolling the months flashed it across the calendar and back on every month
it passed. A rail is told where it is in the same breath as it is scrolled now,
and the suite reads the block's position before anything is painted and fails if
it is ever more than a point off the middle.

## Nothing is cut by an edge

The drum's own fade is a card turning away. That is the whole story at its own
radius — the arc is done with a card well before the card reaches an edge — and
none of it once the drum opens out flat at the ends of a list, where nothing has
turned by more than a few degrees. So the frame simply stopped: a card was cut
through the middle by a line in mid-air.

Fading a card by how much of it is already past the edge does not fix that, it
only dims it — a card three-quarters on at half opacity is still a card with a
straight edge sawn through it. The fade is over the last **margin inside** the
frame instead, and it is spent by the time the card's own edge arrives at the
frame's. Nothing is ever cut because there is never anything there to cut.

**How far it fades over is all the room there is**, and finding that room is the
whole problem. Three cards to a frame is what this screen holds and three cards
fill it to within a couple of points, so a picture cut to its own box has the
outer two hard against the edges with nowhere to fade in: bright at rest and
gone a few points later, which is a list that blinks rather than scrolls.

So the picture takes the 36 above it and the 36 below it. Nothing moves for it —
the cards stand exactly where they stood, the file's 36 clear of the calendar
and of the tabs with the fade's own head start on top — but those gaps belong to
the picture now instead of to the box, and a card fades over a third of its own
height rather than over a few points. The distance is worked out from where the
card beside the chosen one stands, so it is always as gentle as the frame
allows, and it is still spent by the time a card's own edge reaches the frame's,
which is the only thing it is for.

## It can be spun

The reel does not snap at all. Mandatory snapping on iOS ends a flick at the
next stop however hard it was thrown — one card a swipe, a list that cannot be
spun. Proximity was meant to be the middle of it and is not: it still takes the
scroller off the momentum it was given, and what that feels like is the thing
locking under your thumb.

So the phone's own scrolling is left entirely alone, and where a flick comes to
rest is put right afterwards: the loop watches for a scroller that has stopped
anywhere but on a card and sends it to the nearest one. An eighth of a second of
complete stillness before it believes the scrolling is over — a bounce at the
top, a finger resting, a wheel between notches, none of those are finished — and
never while a finger is down.
