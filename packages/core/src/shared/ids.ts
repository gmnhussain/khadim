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

/** rand_a and rand_b together: 74 random bits, kept as one number so they can be counted up. */
const RAND_B_BITS = 62n;
const MAX_RANDOM = (1n << 74n) - 1n;
const LOW_32_BITS = 0xffff_ffffn;
const BITS_32 = 32n;

/** Where each source field is read from, in the 10 random bytes. */
const SOURCE_RAND_A_OFFSET = 0;
const SOURCE_RAND_B_HIGH_OFFSET = 2;
const SOURCE_RAND_B_LOW_OFFSET = 6;
/** Where each field is written, in the 16 bytes of the UUID (RFC 9562 §5.7). */
const TIMESTAMP_HIGH_OFFSET = 0;
const TIMESTAMP_LOW_OFFSET = 2;
const VERSION_RAND_A_OFFSET = 6;
const VARIANT_RAND_B_HIGH_OFFSET = 8;
const RAND_B_LOW_OFFSET = 12;

const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
/** End offsets of the first four groups in the 32 hex digits of a UUID (8-4-4-4-12). */
const GROUP_ENDS = [8, 12, 16, 20] as const;

const toUuidText = (bytes: Uint8Array): string => {
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
};

/** The 74 random bits of a UUIDv7, read from 10 random bytes. */
const toRandomBits = (random: Uint8Array): bigint => {
  const source = new DataView(random.buffer, random.byteOffset, random.byteLength);
  const randA = BigInt(source.getUint16(SOURCE_RAND_A_OFFSET) & RAND_A_MASK);
  const randBHigh = BigInt(source.getUint32(SOURCE_RAND_B_HIGH_OFFSET) & RAND_B_HIGH_MASK);
  const randBLow = BigInt(source.getUint32(SOURCE_RAND_B_LOW_OFFSET));
  return (randA << RAND_B_BITS) | (randBHigh << BITS_32) | randBLow;
};

const encodeUuid = (timestampMs: number, randomBits: bigint): string => {
  const bytes = new Uint8Array(UUID_BYTE_COUNT);
  const target = new DataView(bytes.buffer);
  // A 48-bit integer does not fit JavaScript's 32-bit bitwise operators, so the timestamp is
  // split by division: its high 16 bits, then its low 32 bits.
  target.setUint16(TIMESTAMP_HIGH_OFFSET, Math.floor(timestampMs / TWO_POW_32));
  target.setUint32(TIMESTAMP_LOW_OFFSET, timestampMs % TWO_POW_32);
  target.setUint16(VERSION_RAND_A_OFFSET, VERSION_7_BITS | Number(randomBits >> RAND_B_BITS));
  const randBHigh = Number((randomBits >> BITS_32) & BigInt(RAND_B_HIGH_MASK));
  // `>>> 0` turns the signed result of the bitwise operators back into an unsigned integer.
  target.setUint32(VARIANT_RAND_B_HIGH_OFFSET, (VARIANT_BITS | randBHigh) >>> 0);
  target.setUint32(RAND_B_LOW_OFFSET, Number(randomBits & LOW_32_BITS));
  return toUuidText(bytes);
};

/**
 * Creates a generator of UUID version 7 ids (RFC 9562 §5.7), the format PostgreSQL's `uuidv7()`
 * gives database keys (conventions §13). Ids from one generator sort in the order they were
 * made, within a millisecond too, as PostgreSQL's do within one session: RFC 9562 §6.2 Method 2,
 * "monotonic random". An id in the same millisecond as the last one, or under a clock that went
 * back, keeps the last timestamp and adds a random step of 1 to 2^32 to the last 74 random bits.
 * When they would overflow, the timestamp moves forward 1 ms and the bits start fresh
 * (review fixes, D-2).
 */
export function createIdGenerator(dependencies: IdGeneratorDependencies): IdGenerator {
  const { clock } = dependencies;
  const readRandomBytes = dependencies.randomBytes ?? randomBytes;
  let lastTimestampMs = -1;
  let lastRandomBits = 0n;

  function randomId(): string {
    const clockMs = clock.now().getTime();
    if (!Number.isInteger(clockMs) || clockMs < 0 || clockMs > MAX_TIMESTAMP_MS) {
      throw new Error(`clock is outside the UUIDv7 timestamp range: ${clockMs}`);
    }
    const random = readRandomBytes(UUID_RANDOM_BYTE_COUNT);
    if (random.byteLength !== UUID_RANDOM_BYTE_COUNT) {
      throw new Error(
        `random source returned ${random.byteLength} bytes, expected ${UUID_RANDOM_BYTE_COUNT}`,
      );
    }
    const freshBits = toRandomBits(random);

    let timestampMs = clockMs;
    let randomBits = freshBits;
    if (clockMs <= lastTimestampMs) {
      const step = (freshBits & LOW_32_BITS) + 1n;
      timestampMs = lastTimestampMs;
      randomBits = lastRandomBits + step;
      if (randomBits > MAX_RANDOM) {
        timestampMs = lastTimestampMs + 1;
        randomBits = freshBits;
      }
    }
    if (timestampMs > MAX_TIMESTAMP_MS) {
      throw new Error(`clock is outside the UUIDv7 timestamp range: ${timestampMs}`);
    }

    lastTimestampMs = timestampMs;
    lastRandomBits = randomBits;
    return encodeUuid(timestampMs, randomBits);
  }

  return { randomId };
}
