import { describe, expect, it } from "vitest";

import type { Clock } from "./clock";
import { createIdGenerator } from "./ids";
import { createFixedClock } from "./testing";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RANDOM_BYTE_COUNT = 10;
const MAX_TIMESTAMP_MS = 2 ** 48 - 1;

function fixedBytes(...bytes: number[]) {
  return () => Uint8Array.from(bytes);
}

function clockAt(timestampMs: number): Clock {
  return { now: () => new Date(timestampMs) };
}

describe("createIdGenerator", () => {
  it("builds the version 7 UUID of the RFC 9562 test vector (appendix A.6)", () => {
    const generator = createIdGenerator({
      clock: createFixedClock("2022-02-22T19:22:22.000Z"),
      // rand_a 0xCC3, then rand_b 0x18C4DC0C0C07398F.
      randomBytes: fixedBytes(0x0c, 0xc3, 0x18, 0xc4, 0xdc, 0x0c, 0x0c, 0x07, 0x39, 0x8f),
    });

    expect(generator.randomId()).toBe("017f22e2-79b0-7cc3-98c4-dc0c0c07398f");
  });

  it("asks the random source for exactly the bytes a UUIDv7 needs", () => {
    const sizes: number[] = [];
    const generator = createIdGenerator({
      clock: createFixedClock("2026-11-12T00:00:00.000Z"),
      randomBytes: (size) => {
        sizes.push(size);
        return new Uint8Array(size);
      },
    });

    generator.randomId();

    expect(sizes).toEqual([RANDOM_BYTE_COUNT]);
  });

  it("sets the version and variant bits whatever the random bytes are", () => {
    const clock = createFixedClock("2026-11-12T00:00:00.000Z");
    const allZero = createIdGenerator({ clock, randomBytes: fixedBytes(...zeros()) });
    const allOne = createIdGenerator({ clock, randomBytes: fixedBytes(...ones()) });

    expect(allZero.randomId()).toBe("01a1cd0d-dc00-7000-8000-000000000000");
    expect(allOne.randomId()).toBe("01a1cd0d-dc00-7fff-bfff-ffffffffffff");
  });

  it("encodes the timestamp at the start of the 48-bit range", () => {
    const generator = createIdGenerator({
      clock: clockAt(0),
      randomBytes: fixedBytes(...zeros()),
    });

    expect(generator.randomId()).toBe("00000000-0000-7000-8000-000000000000");
  });

  it("encodes the timestamp at the end of the 48-bit range", () => {
    const generator = createIdGenerator({
      clock: clockAt(MAX_TIMESTAMP_MS),
      randomBytes: fixedBytes(...zeros()),
    });

    expect(generator.randomId()).toBe("ffffffff-ffff-7000-8000-000000000000");
  });

  it("refuses a clock one millisecond past the 48-bit range", () => {
    const generator = createIdGenerator({
      clock: clockAt(MAX_TIMESTAMP_MS + 1),
      randomBytes: fixedBytes(...zeros()),
    });

    expect(() => generator.randomId()).toThrow("outside the UUIDv7 timestamp range");
  });

  it("refuses a clock before the Unix epoch", () => {
    const generator = createIdGenerator({
      clock: clockAt(-1),
      randomBytes: fixedBytes(...zeros()),
    });

    expect(() => generator.randomId()).toThrow("outside the UUIDv7 timestamp range");
  });

  it("refuses an invalid clock", () => {
    const generator = createIdGenerator({
      clock: clockAt(Number.NaN),
      randomBytes: fixedBytes(...zeros()),
    });

    expect(() => generator.randomId()).toThrow("outside the UUIDv7 timestamp range");
  });

  it.each([RANDOM_BYTE_COUNT - 1, RANDOM_BYTE_COUNT + 1])(
    "refuses a random source that returns %i bytes",
    (byteCount) => {
      const generator = createIdGenerator({
        clock: createFixedClock("2026-11-12T00:00:00.000Z"),
        randomBytes: () => new Uint8Array(byteCount),
      });

      expect(() => generator.randomId()).toThrow(`returned ${byteCount} bytes, expected 10`);
    },
  );

  it("reads the random bytes from their own position in a larger buffer", () => {
    const buffer = Uint8Array.from([0xff, 0xff, ...zeros(), 0xff, 0xff]);
    const generator = createIdGenerator({
      clock: clockAt(0),
      randomBytes: () => buffer.subarray(2, 2 + RANDOM_BYTE_COUNT),
    });

    expect(generator.randomId()).toBe("00000000-0000-7000-8000-000000000000");
  });

  it("sorts ids by creation time", () => {
    const clock = createFixedClock("2026-11-12T00:00:00.000Z");
    const generator = createIdGenerator({ clock, randomBytes: fixedBytes(...ones()) });

    const earlier = generator.randomId();
    clock.advanceBy(1);
    const later = generator.randomId();

    expect(earlier < later).toBe(true);
  });

  it("uses the system random source by default: well-formed and unique ids", () => {
    const generator = createIdGenerator({ clock: createFixedClock("2026-11-12T00:00:00.000Z") });
    const count = 1000;

    const ids = Array.from({ length: count }, () => generator.randomId());

    expect(new Set(ids).size).toBe(count);
    for (const id of ids) {
      expect(id).toMatch(UUID_V7_PATTERN);
    }
  });
});

function zeros(): number[] {
  return Array.from({ length: RANDOM_BYTE_COUNT }, () => 0x00);
}

function ones(): number[] {
  return Array.from({ length: RANDOM_BYTE_COUNT }, () => 0xff);
}
