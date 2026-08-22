/**
 * The initials rule, in TypeScript, matching `handle_new_user` exactly.
 *
 * The SQL, from `supabase/migrations/20260821180000_role_is_not_client_supplied.sql`:
 *
 *     upper(left(regexp_replace(display, '[^[:alpha:] ]', '', 'g'), 1)) ||
 *       upper(coalesce(substr(split_part(display, ' ', 2), 1, 1), ''))
 *
 * Two details in it are easy to read past and both change the answer:
 *
 *  - The **first** initial comes from the name with every non-letter stripped,
 *    so "'Abdelrahman" gives `A` rather than an apostrophe.
 *  - The **second** comes from `split_part(display, ' ', 2)` on the *original*
 *    string — the unstripped one. So a middle initial written "J." contributes
 *    `J`, and a name with no second word contributes nothing at all.
 *
 * Copying a rule is a liability, so it is copied ONCE, here, and the property
 * that matters is asserted end to end: a name set in Settings and the same name
 * typed at sign-up must produce identical initials. `e2e/settings.spec.ts` does
 * that against the real database rather than against this function.
 *
 * `\p{L}` rather than `[a-zA-Z]`: Postgres' `[[:alpha:]]` is Unicode-aware under
 * a UTF-8 collation, and half this team's names are transliterations.
 */
export function initialsFor(fullName: string): string {
  const lettersOnly = fullName.replace(/[^\p{L} ]/gu, "");
  const first = lettersOnly.slice(0, 1).toUpperCase();
  // `split_part(x, ' ', 2)` is the text between the first and second space —
  // an empty string when there is no second word, NOT the last word.
  const second = (fullName.split(" ")[1] ?? "").slice(0, 1).toUpperCase();
  return `${first}${second}`;
}
