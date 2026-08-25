import "server-only";

/**
 * The temporary password an admin reads out.
 *
 * Lifted out of `lib/actions/profiles.ts` when client invitations needed the
 * same generator: that file is `"use server"`, so every export from it has to
 * be an async Server Action and a plain function cannot live there. This is the
 * whole of the move — the algorithm is unchanged, and `setTemporaryPassword`
 * now imports it rather than owning it.
 *
 * `server-only` because a password generator that can be imported into a client
 * bundle is a password generator somebody will eventually call in a browser.
 *
 * No ambiguous glyphs. This gets read out loud or typed off a screen, and
 * `I`/`l`/`1` and `O`/`0` are the difference between "it does not work" and a
 * support conversation. 31 characters, 16 of them, is about 79 bits.
 */
const READABLE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** The largest multiple of the alphabet that fits in a byte, for rejection sampling. */
const UNBIASED_CEILING = 256 - (256 % READABLE.length);

/**
 * Generated on the SERVER, from `crypto.getRandomValues`, and never anywhere
 * else.
 *
 * Nobody chooses it and nobody may supply one: a human-chosen temporary
 * password is a guessable temporary password, and accepting one from a form
 * would mean the value that grants access to an account arrived over the wire.
 *
 * `% READABLE.length` on a raw byte would bias the first eight characters of
 * the alphabet upwards by about 3%. Not an attack anybody is running, and also
 * two extra lines to do properly.
 */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let group = 0; group < 4; group += 1) {
    let out = "";
    while (out.length < 4) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      for (const byte of bytes) {
        if (out.length === 4) break;
        if (byte >= UNBIASED_CEILING) continue;
        out += READABLE[byte % READABLE.length];
      }
    }
    groups.push(out);
  }
  return groups.join("-");
}
