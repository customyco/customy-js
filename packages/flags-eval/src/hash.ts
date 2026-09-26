/**
 * The one hash of the platform.
 *
 * murmur3_32 is chosen over SHA-256 for a hard runtime reason, not a stylistic
 * one: assignment happens inside the Pages middleware, which runs in Edge
 * Runtime. `node:crypto.createHash` does not exist there and
 * `crypto.subtle.digest` is asynchronous, so neither can decide a variant
 * before the first byte. murmur3 is pure arithmetic, synchronous, and produces
 * an identical result in Node and in Edge — which is what lets the middleware,
 * the server renderer and an Analytics audit replay all reach the same arm for
 * the same visitor.
 *
 * Moved here from `@customy/flags-eval` so that flags, pages personalization
 * and experiments stop bucketing the same visitor three different ways.
 */

export function murmur3_32(input: string, seed = 0): number {
  let h1 = seed >>> 0;
  const remainder = input.length & 3;
  const bytes = input.length - remainder;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  let i = 0;

  while (i < bytes) {
    let k1 =
      (input.charCodeAt(i) & 0xff) |
      ((input.charCodeAt(++i) & 0xff) << 8) |
      ((input.charCodeAt(++i) & 0xff) << 16) |
      ((input.charCodeAt(++i) & 0xff) << 24);
    ++i;

    k1 = Math.imul(k1, c1);
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = Math.imul(k1, c2);

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = Math.imul(h1, 5) + 0xe6546b64;
  }

  let k1 = 0;
  switch (remainder) {
    case 3:
      k1 ^= (input.charCodeAt(i + 2) & 0xff) << 16;
    // falls through
    case 2:
      k1 ^= (input.charCodeAt(i + 1) & 0xff) << 8;
    // falls through
    case 1:
      k1 ^= input.charCodeAt(i) & 0xff;
      k1 = Math.imul(k1, c1);
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = Math.imul(k1, c2);
      h1 ^= k1;
  }

  h1 ^= input.length;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b);
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35);
  h1 ^= h1 >>> 16;
  return h1 >>> 0;
}

/** Integer bucket in [0, 100). Use for percentage rollouts. */
export function bucket(namespace: string, contextKey: string, salt = ""): number {
  return murmur3_32(`${namespace}:${salt}:${contextKey}`) % 100;
}

/**
 * Continuous bucket in [0, 1). Preferred for weighted variant allocation:
 * the integer form cannot express a 33.3/33.3/33.4 split without drift.
 */
export function bucketRatio(namespace: string, contextKey: string, salt = ""): number {
  return murmur3_32(`${namespace}:${salt}:${contextKey}`) / 0x100000000;
}
