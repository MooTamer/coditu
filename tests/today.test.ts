import { describe, expect, it } from "vitest";

import { greeting, hourInCairo, todayLabel } from "@/lib/today";

/**
 * The greeting is trivial. The timezone underneath it is not, and it is the
 * fifth invariant: `date` columns are calendar dates with no timezone, and
 * `new Date("2026-08-23")` parses as UTC midnight, which is the previous day in
 * half the world.
 *
 * Every assertion here is really about that.
 */

describe("hourInCairo", () => {
  it("reads Cairo's clock, not the server's", () => {
    // August: Egypt is on DST, so Cairo is UTC+**3**. 06:00Z is 09:00 there.
    expect(hourInCairo(new Date("2026-08-25T06:00:00Z"))).toBe(9);
    expect(hourInCairo(new Date("2026-08-25T22:30:00Z"))).toBe(1);
  });

  it("follows Egypt's DST rather than a fixed offset", () => {
    // January: no DST, so Cairo is UTC+2 and the SAME instant is an hour
    // earlier than it was in August. This assertion exists because the obvious
    // shortcut — adding two hours to UTC — is right for half the year and
    // silently wrong for the other half, which is the worst kind of wrong.
    // Egypt reintroduced summer time in 2023; it was abolished in 2014, so
    // anybody's memory of "Cairo is UTC+2" is out of date.
    expect(hourInCairo(new Date("2026-01-15T06:00:00Z"))).toBe(8);
  });
});

describe("greeting", () => {
  it("uses the first name only", () => {
    // "Good morning, Mohamed Tamer" reads like a letter from a bank.
    expect(greeting("Mohamed Tamer", 9)).toBe("Good morning, Mohamed");
    expect(greeting("Abdelrahman Elkhateeb", 9)).toBe("Good morning, Abdelrahman");
  });

  it("changes with Cairo's hour, at the boundaries", () => {
    expect(greeting("Mo", 4)).toBe("Still up, Mo");
    expect(greeting("Mo", 5)).toBe("Good morning, Mo");
    expect(greeting("Mo", 11)).toBe("Good morning, Mo");
    expect(greeting("Mo", 12)).toBe("Good afternoon, Mo");
    expect(greeting("Mo", 17)).toBe("Good afternoon, Mo");
    expect(greeting("Mo", 18)).toBe("Good evening, Mo");
    expect(greeting("Mo", 23)).toBe("Good evening, Mo");
  });

  it("does not produce an empty name from a blank profile", () => {
    expect(greeting("   ", 9)).toBe("Good morning, there");
  });
});

describe("todayLabel", () => {
  it("names the right weekday for a calendar date", () => {
    // 2026-08-25 is a Tuesday. If this is parsed as UTC midnight and rendered
    // in a negative offset it becomes Monday — the exact bug invariant 5 names.
    expect(todayLabel("2026-08-25")).toBe("Tuesday · 2026-08-25");
    expect(todayLabel("2026-08-23")).toBe("Sunday · 2026-08-23");
    expect(todayLabel("2026-01-01")).toBe("Thursday · 2026-01-01");
  });
});
