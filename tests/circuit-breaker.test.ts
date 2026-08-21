import { describe, expect, it } from "vitest";

import {
  DependencyTimeoutError,
  DependencyUnavailableError,
  createBreaker,
} from "@/lib/circuit-breaker";

/**
 * The breaker's whole job is to behave correctly at moments nobody can
 * reproduce on demand — a dependency that has just started timing out, and the
 * minute after it comes back. So the clock is injected and every transition is
 * driven explicitly rather than waited for.
 *
 * `resetAfterMs` is the one thing a real timer would be needed for, and a test
 * that sleeps ten seconds to prove a ten-second window is a test nobody runs.
 */

/** A breaker with a clock the test moves by hand. */
function breakerAt(overrides: Partial<Parameters<typeof createBreaker>[0]> = {}) {
  let clock = 0;
  const breaker = createBreaker({
    name: "probe",
    failureThreshold: 3,
    resetAfterMs: 10_000,
    timeoutMs: 50,
    now: () => clock,
    ...overrides,
  });
  return { breaker, advance: (ms: number) => (clock += ms) };
}

const boom = () => Promise.reject(new Error("upstream said no"));
const fine = () => Promise.resolve("value");

describe("closed", () => {
  it("passes a result straight through", async () => {
    const { breaker } = breakerAt();
    await expect(breaker.run(fine)).resolves.toBe("value");
    expect(breaker.state()).toBe("closed");
  });

  it("reports the dependency's own error, not one of its own", async () => {
    const { breaker } = breakerAt();
    await expect(breaker.run(boom)).rejects.toThrow("upstream said no");
  });

  it("forgets failures as soon as a call succeeds", async () => {
    const { breaker } = breakerAt();
    await expect(breaker.run(boom)).rejects.toThrow();
    await expect(breaker.run(boom)).rejects.toThrow();
    await expect(breaker.run(fine)).resolves.toBe("value");

    // Two more would have opened it if the counter were cumulative.
    await expect(breaker.run(boom)).rejects.toThrow();
    await expect(breaker.run(boom)).rejects.toThrow();
    expect(breaker.state()).toBe("closed");
  });
});

describe("opening", () => {
  it("opens on the threshold and then stops calling out at all", async () => {
    const { breaker } = breakerAt();
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(breaker.run(boom)).rejects.toThrow();
    }
    expect(breaker.state()).toBe("open");

    // The point of the whole exercise: the work is not run.
    let called = false;
    await expect(
      breaker.run(async () => {
        called = true;
        return "value";
      })
    ).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(called, "an open breaker must not call the dependency").toBe(false);
  });

  it("says it did not call, rather than that the call failed", async () => {
    const { breaker } = breakerAt({ failureThreshold: 1 });
    await expect(breaker.run(boom)).rejects.toThrow();

    const error = await breaker.run(fine).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect((error as DependencyUnavailableError).reason).toBe("open");
    expect((error as DependencyUnavailableError).dependency).toBe("probe");
  });
});

describe("recovering", () => {
  it("lets exactly one probe through once the window has passed", async () => {
    const { breaker, advance } = breakerAt({ failureThreshold: 1 });
    await expect(breaker.run(boom)).rejects.toThrow();
    advance(10_000);
    expect(breaker.state()).toBe("half-open");

    // The probe is deliberately left pending so the second caller meets a
    // half-open breaker with a probe already out.
    let release: (value: string) => void = () => undefined;
    const probe = breaker.run(() => new Promise<string>((resolve) => (release = resolve)));

    await expect(breaker.run(fine)).rejects.toBeInstanceOf(DependencyUnavailableError);

    release("value");
    await expect(probe).resolves.toBe("value");
    expect(breaker.state(), "a successful probe closes it").toBe("closed");
  });

  it("re-opens for the whole window when the probe fails", async () => {
    const { breaker, advance } = breakerAt({ failureThreshold: 1 });
    await expect(breaker.run(boom)).rejects.toThrow();

    advance(10_000);
    await expect(breaker.run(boom)).rejects.toThrow("upstream said no");
    expect(breaker.state(), "a failed probe must not leave it half-open").toBe("open");

    advance(9_999);
    expect(breaker.state()).toBe("open");
    advance(1);
    expect(breaker.state()).toBe("half-open");
  });

  it("closes again and serves normally after the dependency comes back", async () => {
    const { breaker, advance } = breakerAt({ failureThreshold: 2 });
    await expect(breaker.run(boom)).rejects.toThrow();
    await expect(breaker.run(boom)).rejects.toThrow();
    expect(breaker.state()).toBe("open");

    advance(10_000);
    await expect(breaker.run(fine)).resolves.toBe("value");
    expect(breaker.state()).toBe("closed");
    await expect(breaker.run(fine)).resolves.toBe("value");
    expect(breaker.inFlight()).toBe(0);
  });
});

describe("the deadline", () => {
  it("gives up on a call that never answers, and says so", async () => {
    const { breaker } = breakerAt({ timeoutMs: 20 });
    const error = await breaker
      .run(() => new Promise(() => undefined))
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(DependencyTimeoutError);
    expect((error as Error).message).toContain("20ms");
  });

  it("aborts the signal it handed out, so the work can stop too", async () => {
    const { breaker } = breakerAt({ timeoutMs: 20 });
    let aborted = false;
    await breaker
      .run(
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true;
              reject(new Error("aborted"));
            });
          })
      )
      .catch(() => undefined);

    expect(aborted).toBe(true);
  });

  it("counts a timeout as a failure — a slow dependency is a failing one", async () => {
    const { breaker } = breakerAt({ timeoutMs: 10, failureThreshold: 2 });
    await breaker.run(() => new Promise(() => undefined)).catch(() => undefined);
    await breaker.run(() => new Promise(() => undefined)).catch(() => undefined);
    expect(breaker.state()).toBe("open");
  });

  it("releases its timer, so a fast call leaves nothing running", async () => {
    const { breaker } = breakerAt({ timeoutMs: 60_000 });
    await expect(breaker.run(fine)).resolves.toBe("value");
    // If the timer were still pending this suite would hang on exit rather
    // than fail, which is why it is asserted rather than assumed.
    expect(breaker.inFlight()).toBe(0);
  });
});

describe("the bulkhead", () => {
  it("refuses the call that would exceed the limit instead of queueing it", async () => {
    const { breaker } = breakerAt({ maxConcurrent: 2 });
    const release: Array<() => void> = [];
    const pending = [0, 1].map(() =>
      breaker.run(() => new Promise<string>((resolve) => release.push(() => resolve("value"))))
    );

    expect(breaker.inFlight()).toBe(2);
    const error = await breaker.run(fine).catch((thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(DependencyUnavailableError);
    expect((error as DependencyUnavailableError).reason).toBe("saturated");

    for (const done of release) done();
    await Promise.all(pending);
    expect(breaker.inFlight()).toBe(0);
    await expect(breaker.run(fine)).resolves.toBe("value");
  });

  it("does not let saturation open the breaker", async () => {
    // Saturation is our own limit doing its job, not the dependency failing.
    // Counting it would mean a busy minute takes the dependency out for ten.
    const { breaker } = breakerAt({ maxConcurrent: 1, failureThreshold: 2 });
    let release: (value: string) => void = () => undefined;
    const held = breaker.run(() => new Promise<string>((resolve) => (release = resolve)));

    await expect(breaker.run(fine)).rejects.toBeInstanceOf(DependencyUnavailableError);
    await expect(breaker.run(fine)).rejects.toBeInstanceOf(DependencyUnavailableError);
    await expect(breaker.run(fine)).rejects.toBeInstanceOf(DependencyUnavailableError);
    expect(breaker.state()).toBe("closed");

    release("value");
    await expect(held).resolves.toBe("value");
    await expect(breaker.run(fine)).resolves.toBe("value");
  });
});
