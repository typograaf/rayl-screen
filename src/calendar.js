/**
 * The days, and the months they fall in.
 *
 * One flat run of days across several months, because that is what scrolling
 * one asks for: a day is next to the day after it whether or not a month ends
 * in between. The months are an index into that run rather than a second list —
 * so a month cannot disagree with the day it is showing, which is the whole of
 * what keeps the two rails in step.
 */

/* The design's own two languages: Dutch days, English months. Node 800:5314
   has `ma di wo do vr za zo` under `July August September`, so that is what
   this says. */
const DAY_NAMES = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const monthName = new Intl.DateTimeFormat("en", { month: "long" });

const key = (date) => `${date.getFullYear()}-${date.getMonth()}`;

/**
 * Every day from `back` months before today to `on` months after it.
 *
 * Built by asking a Date to be the nth of a month and letting it settle, which
 * is the only way to count days that gets February and the clocks right.
 */
export function buildCalendar(today = new Date(), back = 2, on = 3) {
  const days = [];
  const months = [];

  const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + on + 1, 1);

  for (let at = new Date(first); at < end; at.setDate(at.getDate() + 1)) {
    const date = new Date(at);
    const of = key(date);
    let month = months[months.length - 1];
    if (!month || month.key !== of) {
      month = {
        key: of,
        label: monthName.format(date),
        from: days.length,
        to: days.length,
      };
      months.push(month);
    }
    month.to = days.length;
    days.push({
      date,
      month: months.length - 1,
      name: DAY_NAMES[date.getDay()],
      number: String(date.getDate()),
      today:
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate(),
    });
  }

  return { days, months };
}

/** Which day to land on when a month is chosen: the same date if it has one,
    and its last day if it does not — the 31st of a thirty-day month is not a
    reason to jump to the first. */
export function dayInMonth(calendar, month, wanted) {
  const { from, to } = calendar.months[month];
  const day = Number(wanted);
  for (let i = from; i <= to; i++) {
    if (Number(calendar.days[i].number) === day) return i;
  }
  return to;
}
