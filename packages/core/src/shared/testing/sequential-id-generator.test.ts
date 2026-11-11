import { describe, expect, it } from "vitest";

import { createSequentialIdGenerator } from "./sequential-id-generator";

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("createSequentialIdGenerator", () => {
  it("counts from one in the last group of a UUIDv7-shaped id", () => {
    const generator = createSequentialIdGenerator();

    expect(generator.randomId()).toBe("00000000-0000-7000-8000-000000000001");
    expect(generator.randomId()).toBe("00000000-0000-7000-8000-000000000002");
  });

  it("keeps the id well-formed when the count needs more than one hex digit", () => {
    const generator = createSequentialIdGenerator();

    const ids = Array.from({ length: 16 }, () => generator.randomId());

    expect(ids.at(-1)).toBe("00000000-0000-7000-8000-000000000010");
    for (const id of ids) {
      expect(id).toMatch(UUID_V7_PATTERN);
    }
  });

  it("gives each generator its own count", () => {
    const first = createSequentialIdGenerator();
    const second = createSequentialIdGenerator();

    first.randomId();

    expect(second.randomId()).toBe("00000000-0000-7000-8000-000000000001");
  });
});
