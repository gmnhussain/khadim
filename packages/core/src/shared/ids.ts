import { randomBytes } from "node:crypto";

import type { Clock } from "./clock";

/** Source of new ids, injected so tests get deterministic ones (conventions §7). */
export interface IdGenerator {
  readonly randomId: () => string;
}

/** Returns `size` random bytes; `node:crypto` in production, fixed bytes in tests. */
export type RandomBytes = (size: number) => Uint8Array;

/** Dependencies of `createIdGenerator`. */
export interface IdGeneratorDependencies {
  readonly clock: Clock;
  readonly randomBytes?: RandomBytes | undefined;
}

const UUID_BYTE_COUNT = 16;
/** RFC 9562 §5.7: 12 bits of rand_a and 62 bits of rand_b, read from 10 random bytes. */
const UUID_RANDOM_BYTE_COUNT = 10;
/** The timestamp field is 48 bits of Unix milliseconds. */
const MAX_TIMESTAMP_MS = 2 ** 48 - 1;
const TWO_POW_32 = 2 ** 32;

const VERSION_7_BITS = 0x7000;
const RAND_A_MASK = 0x0fff;
const VARIANT_BITS = 0x8000_0000;
const RAND_B_HIGH_MASK = 0x3fff_ffff;

const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
/** End offsets of the first four groups in the 32 hex digits of a UUID (8-4-4-4-12). */
const GROUP_ENDS = [8, 12, 16, 20] as const;

function toUuidText(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0"),
  ).join("");
  const [first, second, third, fourth] = GROUP_ENDS;
  return [
    hex.slice(0, first),
    hex.slice(first, second),
    hex.slice(second, third),
    hex.slice(third, fourth),
    hex.slice(fourth),
  ].join("-");
}

/**
 * Creates a generator of UUID version 7 ids (RFC 9562 §5.7), the format PostgreSQL's `uuidv7()`
 * gives database keys (conventions §13). Ids sort by creation time to the millisecond.
 */
export function createIdGenerator(dependencies: IdGeneratorDependencies): IdGenerator {
  const { clock } = dependencies;
  const readRandomBytes = dependencies.randomBytes ?? randomBytes;

  function randomId(): string {
    const timestampMs = clock.now().getTime();
    if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs > MAX_TIMESTAMP_MS) {
      throw new Error(`clock is outside the UUIDv7 timestamp range: ${timestampMs}`);
    }
    const random = readRandomBytes(UUID_RANDOM_BYTE_COUNT);
    if (random.byteLength !== UUID_RANDOM_BYTE_COUNT) {
      throw new Error(
        `random source returned ${random.byteLength} bytes, expected ${UUID_RANDOM_BYTE_COUNT}`,
      );
    }
    const source = new DataView(random.buffer, random.byteOffset, random.byteLength);
    const bytes = new Uint8Array(UUID_BYTE_COUNT);
    const target = new DataView(bytes.buffer);

    // A 48-bit integer does not fit JavaScript's 32-bit bitwise operators, so the timestamp is
    // split by division: its high 16 bits, then its low 32 bits.
    target.setUint16(0, Math.floor(timestampMs / TWO_POW_32));
    target.setUint32(2, timestampMs % TWO_POW_32);
    target.setUint16(6, VERSION_7_BITS | (source.getUint16(0) & RAND_A_MASK));
    // `>>> 0` turns the signed result of the bitwise operators back into an unsigned integer.
    target.setUint32(8, (VARIANT_BITS | (source.getUint32(2) & RAND_B_HIGH_MASK)) >>> 0);
    target.setUint32(12, source.getUint32(6));

    return toUuidText(bytes);
  }

  return { randomId };
}
