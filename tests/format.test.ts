import { describe, expect, it } from "vitest";

import { calendarDate, dateRange, hours, hoursLabel, hoursOrDash, timestamp } from "@/lib/format";
import { initialsFor } from "@/lib/profile-initials";

/**
 * These helpers are where invariants 2 and 5 are actually enforced, so they get
 * tests. Both invariants fail silently — a float that drifts by 0.1 and a date
 * that shows the previous day both look plausible until someone checks.
 */

describe("hours — invariant 2", () => {
  it("divides minutes by 60 at the render edge", () => {
    expect(hours(450)).toBe("7.5");
    expect(hours(30)).toBe("0.5");
    expect(hours(0)).toBe("0.0");
  });

  it("always shows one decimal so a column lines up", () => {
    expect(hours(120)).toBe("2.0");
    expect(hours(60)).toBe("1.0");
  });

  it("reproduces the sprint footer exactly", () => {
    // The seed's Week 17: 960 minutes logged against 2760 estimated.
    expect(`${hours(960)} / ${hours(2760)} h`).toBe("16.0 / 46.0 h");
  });

  it("sums exactly where a float sum would drift", () => {
    // The failure invariant 2 exists to prevent. Six ten-minute entries: as
    // integer minutes the total is exactly 30, but summing 5/60 six times lands
    // at 0.49999999999999994. Rounded for display that still reads "0.5", so
    // the drift is invisible right up until a footer disagrees with a report.
    const entries = [5, 5, 5, 5, 5, 5];

    const asMinutes = entries.reduce((total, m) => total + m, 0);
    const asFloatHours = entries.reduce((total, m) => total + m / 60, 0);

    expect(asMinutes).toBe(30);
    expect(hours(asMinutes)).toBe("0.5");
    expect(asFloatHours).not.toBe(0.5);
    expect(asFloatHours).toBeCloseTo(0.5, 10);
  });

  it("reproduces the seeded sprint total from its real entries", () => {
    const entries = [180, 270, 30, 120, 180, 90, 90];
    expect(entries.reduce((total, m) => total + m, 0)).toBe(960);
    expect(hours(960)).toBe("16.0");
  });

  it("renders a logged zero as an em dash, not 0.0", () => {
    expect(hoursOrDash(0)).toBe("—");
    expect(hoursOrDash(30)).toBe("0.5");
    expect(hoursLabel(450)).toBe("7.5 h");
  });
});

describe("dates — invariant 5", () => {
  it("formats a calendar date without inventing a timezone", () => {
    // new Date("2026-08-23") parses as UTC midnight and renders as the 22nd in
    // any negative offset. calendarDate must never do that.
    expect(calendarDate("2026-08-23")).toBe("2026-08-23");
    expect(calendarDate("2026-01-01")).toBe("2026-01-01");
  });

  it("survives a full timestamp in a date column", () => {
    expect(calendarDate("2026-08-23T00:00:00+00:00")).toBe("2026-08-23");
  });

  it("renders an em dash for a missing date", () => {
    expect(calendarDate(null)).toBe("—");
    expect(dateRange(null, null)).toBe("— → —");
  });

  it("renders a sprint window the way the header does", () => {
    expect(dateRange("2026-08-17", "2026-08-23")).toBe("2026-08-17 → 2026-08-23");
  });

  it("renders a timestamptz in Africa/Cairo", () => {
    // 2026-08-19T11:02Z is 14:02 in Cairo (UTC+3), which is what the seeded
    // comment shows in the design bundle.
    expect(timestamp("2026-08-19T11:02:00Z")).toBe("2026-08-19 14:02");
  });

  it("does not shift a Cairo timestamp across midnight", () => {
    // 22:30Z on the 18th is 01:30 on the 19th in Cairo — the day must advance.
    expect(timestamp("2026-08-18T22:30:00Z")).toBe("2026-08-19 01:30");
  });
});

/**
 * `profiles.initials` is a DERIVED column, and the derivation that counts lives
 * in `handle_new_user`. `initialsFor` is a copy of it — needed because Settings
 * writes the column and a round trip to the database to ask what two letters to
 * store would be absurd — and a copied rule is only safe while it is provably
 * the same rule.
 *
 * Every expectation below was read off Postgres, not reasoned about:
 *
 *   select upper(left(regexp_replace(n, '[^[:alpha:] ]', '', 'g'), 1)) ||
 *          upper(coalesce(substr(split_part(n, ' ', 2), 1, 1), ''))
 *
 * There were three answers to this question in the codebase before today. The
 * two that disagreed with the database are gone; this is the survivor, and
 * `e2e/settings.spec.ts` proves the property end to end by comparing a name set
 * here against the same name typed at sign-up.
 */
describe("initials — the same rule handle_new_user applies", () => {
  it("takes the first letter of the first two names", () => {
    expect(initialsFor("Mohamed Tamer")).toBe("MT");
    expect(initialsFor("Abdelrahman Elkhateeb")).toBe("AE");
    expect(initialsFor("Ahmed Yehia")).toBe("AY");
  });

  it("copes with a single name", () => {
    expect(initialsFor("Prince")).toBe("P");
  });

  it("strips punctuation from the first initial but not from the second word", () => {
    // `regexp_replace` cleans the string the FIRST letter is taken from;
    // `split_part` runs on the original, so "R." still contributes R.
    expect(initialsFor("'Abdelrahman Elkhateeb")).toBe("AE");
    expect(initialsFor("J. R. Tolkien")).toBe("JR");
    expect(initialsFor("3M Corporation")).toBe("MC");
  });

  it("treats a double space the way split_part does — as an empty second word", () => {
    // The trap in the two rules this replaced: both split on `\s+` and answered
    // AY here, where the database answers A.
    expect(initialsFor("Ahmed  Yehia")).toBe("A");
  });

  it("is Unicode-aware, because half these names are transliterations", () => {
    expect(initialsFor("Şeyma Öz")).toBe("ŞÖ");
    expect(initialsFor("محمد تامر")).toBe("مت");
  });
});
