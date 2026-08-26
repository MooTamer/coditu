/**
 * Create a sign-in for the LOCAL database only.
 *
 *   node scripts/add-local-user.mjs <email> [--name "Full Name"] [--role admin|lead|engineer] [--developer]
 *
 * The password is always `coditu`, the same one every account in
 * `supabase/seed.sql` carries. That is deliberate: a local login is a fixture,
 * not a credential, and a real password typed into a dev database is a real
 * password sitting in a dev database.
 *
 * Run it after `npm run db:seed` or `npm run db:reset` — both drop the whole
 * database, and an account made here lives only in it. Re-running is free: an
 * address that already has an account gets its password and role reset rather
 * than a duplicate.
 *
 * WHY THIS IS NOT ONE SUPABASE CALL
 *
 * Three different authorities are needed, and collapsing them would mean
 * widening one:
 *
 *   1. `allowed_emails` — `enforce_email_allowlist` is a BEFORE INSERT trigger
 *      on `auth.users`, so nothing can be created before this row exists.
 *      `service_role` has SELECT and nothing else on that table, on purpose
 *      (`20260821150000_allowlist_service_grant.sql`), so the write goes over a
 *      direct postgres connection instead of quietly granting the service key
 *      INSERT.
 *   2. The account itself — through GoTrue's admin API, never a hand-written
 *      `auth.users` row. Seeding that table by hand means supplying every token
 *      column as '' rather than NULL, and getting it wrong fails EVERY sign-in
 *      with "Database error querying schema", which names the schema and says
 *      nothing about the column. See the note above the insert in `seed.sql`.
 *   3. The role — set here, as a privileged write, never from the sign-up
 *      request. `20260821180000_role_is_not_client_supplied.sql` exists because
 *      `handle_new_user` used to read the role out of client-controlled
 *      metadata, which let anybody on the allowlist hand themselves `admin`.
 *
 * INTERNAL ACCOUNTS ONLY
 *
 * `--role` names the three internal roles and there is no flag for a client
 * contact, but that alone did not make this internal-only. `handle_new_user`
 * decides the account KIND from a pending `client_invitations` row keyed on the
 * address — so asking for an address an admin had already invited produced a
 * CLIENT account, silently consumed a real invitation, created the contact and
 * its project grants, and then stamped `role = admin` on top of it. The script
 * printed `· admin` and had made something else entirely.
 *
 * So it looks first and refuses, rather than finding out afterwards. A client
 * contact is made through the invitation flow in the app, which is where the
 * capabilities are chosen; this script is for the team.
 *
 * Reads `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the
 * environment, or from `.env.local` if they are not already set, and refuses to
 * run against anything that is not loopback. That guard is the point of the
 * script as much as the account is: this repo keeps hosted credentials in
 * `.env.production.local`, and `NODE_ENV=production` loads them ahead of
 * `.env.local` — so "it read the env file" is not the same as "it is pointed at
 * your laptop".
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

// The local dev password, matching every account in `supabase/seed.sql`. There
// is deliberately no flag to override it — see the header.
const PASSWORD = "coditu";

const ROLES = ["admin", "lead", "engineer"];

const root = join(import.meta.dirname, "..");

function env(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, ".env.local");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

// Walk the list rather than filtering it: `--name "Mohamed Tamer"` puts a
// non-flag word in the middle that is a value, not the address.
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--developer") continue;
  if (argv[i].startsWith("--")) {
    i += 1;
    continue;
  }
  positional.push(argv[i]);
}
const email = positional[0];

if (!email || !email.includes("@")) {
  fail(
    'usage: node scripts/add-local-user.mjs <email> [--name "Full Name"] [--role admin|lead|engineer] [--developer]'
  );
}

const role = value("role") ?? "engineer";
if (!ROLES.includes(role)) fail(`--role must be one of: ${ROLES.join(", ")}`);

const fullName = value("name") ?? email.split("@")[0];

// `is_developer` decides who may take a share of a sprint's payout, not what
// anybody may see. It is off unless asked for: the column defaults to false,
// and an account that silently becomes eligible for earnings the moment it logs
// an hour is a worse surprise than one flag.
const isDeveloper = flag("developer");

// Two letters, first name and last, the way `seed.sql` writes them.
const words = fullName.trim().split(/\s+/);
const initials = (
  words.length > 1 ? words[0][0] + words[words.length - 1][0] : fullName.slice(0, 2)
).toUpperCase();

// ---------------------------------------------------------------------------
// Refuse anything that is not local
// ---------------------------------------------------------------------------

const url = env("NEXT_PUBLIC_SUPABASE_URL");
const key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) {
  fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.local).");
}

const dbUrl =
  process.env.LOCAL_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54422/postgres";

const isLoopback = (candidate) => {
  try {
    const { hostname } = new URL(candidate);
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
};

if (!isLoopback(url)) fail(`Refusing to run: ${url} is not the local stack.`);
if (!isLoopback(dbUrl)) fail(`Refusing to run: ${dbUrl} is not the local database.`);

// ---------------------------------------------------------------------------
// Do it
// ---------------------------------------------------------------------------

const db = new Client({ connectionString: dbUrl });
await db.connect();

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

try {
  // 0. Refuse anything that is not, or would not become, an internal account.
  //
  //    Both halves are needed. The invitation check stops a NEW account being
  //    created as a client — `handle_new_user` reads that row, not this script,
  //    so by the time the profile exists the decision has been made and the
  //    invitation has been consumed. The kind check stops an EXISTING client
  //    contact being handed an internal role by a re-run.
  const invited = await db.query(
    `select 1 from public.client_invitations
      where lower(email) = lower($1) and status = 'pending' and expires_at > now()`,
    [email]
  );
  if (invited.rowCount > 0) {
    fail(
      `Refusing to run: ${email} has a pending client invitation.\n` +
        "  Creating the account here would claim that invitation and make a CLIENT\n" +
        "  contact, not an internal one. Accept it through the app, or withdraw it first."
    );
  }

  const kind = await db.query(
    `select p.account_kind from public.profiles p
       join auth.users u on u.id = p.id
      where lower(u.email) = lower($1)`,
    [email]
  );
  if (kind.rows[0]?.account_kind === "client") {
    fail(`Refusing to run: ${email} is a client contact. This script makes internal accounts.`);
  }

  // 1. The allowlist, which the trigger on `auth.users` enforces regardless of
  //    who is asking.
  await db.query(
    `insert into public.allowed_emails (email, note)
     values ($1, 'Local development login')
     on conflict (email) do nothing`,
    [email]
  );

  // 2. The account. Look first so a re-run after a partial failure updates
  //    rather than erroring on the address already existing.
  const existing = await db.query("select id from auth.users where lower(email) = lower($1)", [
    email,
  ]);

  let id = existing.rows[0]?.id;
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUser: ${error.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`createUser: ${error.message}`);
    id = data.user.id;
  }

  // GoTrue writes the identity with `email_verified: false` for an
  // admin-created account. `seed.sql` sets it true, and identity linking and
  // the magic-link flow read it — so match the seed rather than leave this
  // account subtly different from the other four.
  await db.query(
    `update auth.identities
        set identity_data = identity_data || '{"email_verified": true}'::jsonb
      where user_id = $1`,
    [id]
  );

  // 3. The profile `handle_new_user` just created, as the privileged writer
  //    this connection already is.
  await db.query(
    `update public.profiles
        set full_name = $2, initials = $3, role = $4::public.app_role, is_developer = $5
      where id = $1`,
    [id, fullName, initials, role, isDeveloper]
  );

  // The post-condition. The two checks above are about what is known before the
  //    account exists; this is about what it actually became. A future branch in
  //    `handle_new_user` that decides `client` some other way fails here, loudly,
  //    instead of printing a role this account does not have.
  const made = await db.query("select account_kind from public.profiles where id = $1", [id]);
  if (made.rows[0]?.account_kind !== "internal") {
    throw new Error(
      `${email} was created as a ${made.rows[0]?.account_kind ?? "missing"} account, not internal. ` +
        "Nothing further was written; remove it before trying again."
    );
  }

  console.log(`${email} / ${PASSWORD}`);
  console.log(`  ${fullName} (${initials}) · ${role}${isDeveloper ? " · developer" : ""}`);
  console.log(`  ${id}`);
} finally {
  await db.end();
}
