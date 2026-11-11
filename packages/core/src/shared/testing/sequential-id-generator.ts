import type { IdGenerator } from "../ids";

/** Everything in a version 7 UUID before its last group, with the other fields set to zero. */
const SEQUENTIAL_ID_PREFIX = "00000000-0000-7000-8000-";
const LAST_GROUP_LENGTH = 12;
const HEX_RADIX = 16;

/** Creates a generator of predictable, UUIDv7-shaped ids: the last group counts 1, 2, 3, … */
export function createSequentialIdGenerator(): IdGenerator {
  let sequence = 0;
  return {
    randomId() {
      sequence += 1;
      return SEQUENTIAL_ID_PREFIX + sequence.toString(HEX_RADIX).padStart(LAST_GROUP_LENGTH, "0");
    },
  };
}
