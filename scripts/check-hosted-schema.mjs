#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";
import ts from "typescript";

import { describeTransport, transportFailures } from "./lib/transport-guard.mjs";

const root = resolve(import.meta.dirname, "..");
const typesPath = resolve(root, "lib/supabase/database.types.ts");
const migrationsPath = resolve(root, "supabase/migrations");
const expectedProjectRef = "hayfsvsepgfescojesbd";

function fail(message) {
  process.stderr.write(`check-hosted-schema: ${message}\n`);
  process.exit(1);
}

function propertyName(node) {
  if (!node?.name) return null;
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

function property(typeNode, name) {
  if (!typeNode || !ts.isTypeLiteralNode(typeNode)) return null;
  return typeNode.members.find(
    (member) => ts.isPropertySignature(member) && propertyName(member) === name,
  );
}

function requireTypeLiteral(node, label) {
  if (!node?.type || !ts.isTypeLiteralNode(node.type)) fail(`${label} is not a type literal`);
  return node.type;
}

function parseGeneratedContract() {
  const source = readFileSync(typesPath, "utf8");
  const file = ts.createSourceFile(typesPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const database = file.statements.find(
    (statement) => ts.isTypeAliasDeclaration(statement) && statement.name.text === "Database",
  );
  if (!database || !ts.isTypeLiteralNode(database.type)) fail("generated Database type is missing");

  const publicProperty = property(database.type, "public");
  const publicType = requireTypeLiteral(publicProperty, "Database.public");

  const relations = new Map();
  for (const [sectionName, kind] of [
    ["Tables", "table"],
    ["Views", "view"],
  ]) {
    const section = requireTypeLiteral(property(publicType, sectionName), `public.${sectionName}`);
    for (const relation of section.members) {
      if (!ts.isPropertySignature(relation)) continue;
      const relationName = propertyName(relation);
      const relationType = requireTypeLiteral(relation, `${sectionName}.${relationName}`);
      const row = requireTypeLiteral(property(relationType, "Row"), `${sectionName}.${relationName}.Row`);
      const columns = row.members
        .filter(ts.isPropertySignature)
        .map(propertyName)
        .filter(Boolean)
        .sort();
      if (!relationName || columns.length === 0) fail(`${sectionName} contains an empty relation`);
      relations.set(relationName, { kind, columns });
    }
  }

  const functions = new Map();
  const functionSection = requireTypeLiteral(property(publicType, "Functions"), "public.Functions");
  for (const fn of functionSection.members) {
    if (!ts.isPropertySignature(fn)) continue;
    const functionName = propertyName(fn);
    const functionType = requireTypeLiteral(fn, `Functions.${functionName}`);
    const args = property(functionType, "Args");
    if (!functionName || !args?.type) fail("generated function contract has no Args type");
    const inputNames = ts.isTypeLiteralNode(args.type)
      ? args.type.members.filter(ts.isPropertySignature).map(propertyName).filter(Boolean).sort()
      : args.type.kind === ts.SyntaxKind.NeverKeyword
        ? []
        : fail(`Functions.${functionName}.Args has an unsupported shape`);
    const returns = property(functionType, "Returns")?.type;
    const returnedRow = returns && ts.isArrayTypeNode(returns) && ts.isTypeLiteralNode(returns.elementType)
      ? returns.elementType
      : null;
    const outputNames = returnedRow
      ? returnedRow.members.filter(ts.isPropertySignature).map(propertyName).filter(Boolean).sort()
      : [];
    functions.set(functionName, { inputNames, outputNames });
  }

  const enums = new Map();
  const enumSection = requireTypeLiteral(property(publicType, "Enums"), "public.Enums");
  for (const enumNode of enumSection.members) {
    if (!ts.isPropertySignature(enumNode)) continue;
    const enumName = propertyName(enumNode);
    const labels = [];
    const visit = (node) => {
      if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) labels.push(node.literal.text);
      ts.forEachChild(node, visit);
    };
    if (enumNode.type) visit(enumNode.type);
    if (!enumName || labels.length === 0) fail("generated enum contract is empty");
    enums.set(enumName, labels);
  }

  return { relations, functions, enums };
}

function localMigrations() {
  return readdirSync(migrationsPath)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .map((name) => name.split("_", 1)[0])
    .sort();
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

// The transport guard lives in `scripts/lib/transport-guard.mjs` and is
// exercised by `tests/transport-guard.test.ts`. It moved there when Supabase's
// "Enforce SSL on incoming connections" was turned on: the provider now refuses
// a cleartext connection outright, so the experiment that used to prove this
// assertion could fail — force `ssl: false` and watch it refuse — no longer
// reaches the assertion at all. A guard nothing can exercise is a comment.

// The role the deploy preflight is meant to connect as, and the one deliberate
// exception to it.
//
// `coditu_backup` is the contract: BYPASSRLS so it sees every row, `select` on
// the tables, and no `insert`. When `HOSTED_SCHEMA_PRIVILEGED_ROLE` names a
// different role, that role — and only that role, spelled out — is accepted,
// with the deviation printed on every run.
//
// Unset, the strict contract applies. An absent variable makes this check
// HARDER to satisfy, not easier, which is the whole difference between a
// deviation and a hole. See ADR 2026-08-31.
const CONTRACT_ROLE = "coditu_backup";

function roleFailures(role) {
  if (!role) return ["connection role could not be read"];
  if (!role.rolbypassrls) return [`${role.current_user} does not have BYPASSRLS`];

  const permitted = process.env.HOSTED_SCHEMA_PRIVILEGED_ROLE?.trim();

  // The contract role is always acceptable, named deviation or not. Until
  // 2026-08-31 it was not: with `HOSTED_SCHEMA_PRIVILEGED_ROLE=postgres` set —
  // which is what `ci.yml` carries — a secret narrowed to `coditu_backup` was
  // REFUSED, with the message "connection role is neither coditu_backup nor the
  // permitted postgres (got coditu_backup)". Naming a deviation must widen what
  // is accepted, never replace it; the version that replaced it would have
  // failed the deploy on the exact action this file's own warning asks for.
  if (role.current_user === CONTRACT_ROLE) {
    if (role.can_read && !role.can_write) return [];
    return [
      `${CONTRACT_ROLE} is not read-only on this connection ` +
        `(can_read=${role.can_read}, can_write=${role.can_write})`,
    ];
  }

  if (!permitted) {
    return [
      `connection role is not the read-only ${CONTRACT_ROLE} contract ` +
        `(got ${role.current_user}, can_write=${role.can_write})`,
    ];
  }

  if (role.current_user !== permitted) {
    return [
      `connection role is neither ${CONTRACT_ROLE} nor the permitted ` +
        `${permitted} (got ${role.current_user})`,
    ];
  }
  if (!role.can_read) return [`${permitted} cannot read public.work_items`];

  process.stderr.write(
    "::warning title=Schema preflight is not using the least-privilege role::" +
      `connected as ${permitted}, and the contract is ${CONTRACT_ROLE}. ` +
      "What bounds this is the read-only transaction, which is proved rather than trusted, " +
      "not the role's own privileges. Narrowing it is owed — ADR 2026-08-31.\n",
  );
  return [];
}

// The property the role name is only a proxy for: this connection cannot write.
//
// Measured rather than assumed, because both of the things that currently
// guarantee it are one edit away from being gone — the role name is a
// hand-maintained string, and `begin read only` is a single line no test was
// watching. `create temp table` is the probe: a read-only transaction refuses
// it as DDL, and in the world where the transaction is NOT read-only it
// creates nothing that outlives the connection. A probe that writes a real row
// to prove it cannot write a real row is not a probe worth having.
const READ_ONLY_SQL_TRANSACTION = "25006";

async function readOnlyFailures(client) {
  const failures = [];

  const setting = await client.query("show transaction_read_only");
  if (setting.rows[0]?.transaction_read_only !== "on") {
    failures.push("the preflight transaction is not read only");
  }

  await client.query("savepoint write_probe");
  try {
    await client.query("create temp table hosted_schema_write_probe (probe int)");
    failures.push("the preflight connection was able to write; it must not be able to");
  } catch (error) {
    if (error?.code !== READ_ONLY_SQL_TRANSACTION) {
      failures.push(
        `the write probe was refused, but for the wrong reason (${error?.code ?? "no code"})`,
      );
    }
  }
  await client.query("rollback to savepoint write_probe");

  return failures;
}

async function main() {
  const connectionString = process.env.HOSTED_SCHEMA_DB_URL;
  if (!connectionString) fail("HOSTED_SCHEMA_DB_URL is required");

  let parsedUrl;
  try {
    parsedUrl = new URL(connectionString);
  } catch {
    fail("HOSTED_SCHEMA_DB_URL is not a valid URL");
  }
  if (!/^postgres(ql)?:$/.test(parsedUrl.protocol)) fail("HOSTED_SCHEMA_DB_URL must use Postgres");
  const localHost = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(parsedUrl.hostname);
  if (localHost && process.env.ALLOW_LOCAL_SCHEMA_CHECK !== "1") {
    fail("refusing a local database without ALLOW_LOCAL_SCHEMA_CHECK=1");
  }
  if (!localHost && !`${parsedUrl.username}@${parsedUrl.hostname}`.includes(expectedProjectRef)) {
    fail(`database URL does not identify the ${expectedProjectRef} project`);
  }

  const contract = parseGeneratedContract();
  const expectedMigrations = localMigrations();
  // TLS is ESTABLISHED here. The connection string says WHERE to connect; it is
  // deliberately given no say in HOW.
  //
  // The first CI run of this check refused with `database connection is not
  // encrypted`, because `HOSTED_SCHEMA_DB_URL` carried no usable `sslmode`.
  // The assertion was right and the design around it was wrong: a transport
  // guarantee that depends on a query parameter inside an opaque secret is a
  // guarantee nobody can review, and this driver does not even read `sslmode`
  // the way `psql` does — `require` is `verify-full` here and merely "encrypt"
  // there, so the string that is correct for the backup leg fails outright on
  // this one.
  //
  // Supplying `ssl` beside `connectionString` is not enough: node-postgres lets
  // a `sslmode` in the string win, so `require` still died and `disable` still
  // connected in cleartext. Measured, not assumed. So the URL is decomposed and
  // its query string dropped, and every field this client uses is passed
  // explicitly. `sslmode=disable` in the secret can no longer produce a
  // cleartext connection, and `sslmode=require` can no longer produce a
  // failure that reads like a broken database.
  //
  // `transportFailures` still reads the socket afterwards. Arranging the
  // guarantee and asserting it are different jobs and neither replaces the
  // other — if this block is ever wrong, that one still says so.
  const client = new Client({
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 5432,
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database: decodeURIComponent(parsedUrl.pathname.replace(/^\//, "")) || "postgres",
    connectionTimeoutMillis: 15_000,
    ssl: localHost
      ? false
      : process.env.HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS === "1"
        ? {
            rejectUnauthorized: true,
            ...(process.env.HOSTED_SCHEMA_DB_CA ? { ca: process.env.HOSTED_SCHEMA_DB_CA } : {}),
          }
        : // Encrypt without delegating verification, which is the posture
          // `transportFailures` was written for: it pins the issuer to Supabase
          // by name, because no public trust store carries their root.
          { rejectUnauthorized: false },
  });
  const failures = [];
  // Reported at the end, so a run that proved the encryption reads differently
  // from a run in which the assertion was deleted.
  let transport = { encrypted: false };

  try {
    await client.connect();
    await client.query("begin read only");
    await client.query("set local statement_timeout = '15s'");

    const identity = await client.query(`
      select current_user,
             rolbypassrls,
             has_table_privilege(current_user, 'public.work_items', 'select') as can_read,
             has_table_privilege(current_user, 'public.work_items', 'insert') as can_write,
             exists (
               select 1 from pg_stat_ssl where pid = pg_backend_pid() and ssl
             ) as encrypted
      from pg_roles
      where rolname = current_user
    `);
    const role = identity.rows[0];
    if (!localHost) {
      failures.push(...roleFailures(role));
      transport = describeTransport(client.connection?.stream);
      failures.push(
        ...transportFailures({
          socket: client.connection?.stream,
          pgStatSslSaysEncrypted: role?.encrypted === true,
          requireVerified: process.env.HOSTED_SCHEMA_REQUIRE_VERIFIED_TLS === "1",
        }),
      );
    }

    // Runs against a local stack too. It asserts a property of this script
    // rather than of the project it is pointed at, and the local path is the
    // one a developer actually exercises.
    failures.push(...(await readOnlyFailures(client)));

    const migrationRows = await client.query(
      "select version::text from supabase_migrations.schema_migrations order by version::text",
    );
    const remoteMigrations = new Set(migrationRows.rows.map((row) => row.version));
    for (const version of expectedMigrations) {
      if (!remoteMigrations.has(version)) failures.push(`missing migration ${version}`);
    }

    const relationRows = await client.query(`
      select c.relname,
             case when c.relkind in ('r', 'p') then 'table' else 'view' end as kind,
             a.attname as column_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      where n.nspname = 'public'
        and c.relkind in ('r', 'p', 'v', 'm')
        and a.attnum > 0
        and not a.attisdropped
      order by c.relname, a.attnum
    `);
    const actualRelations = new Map();
    for (const row of relationRows.rows) {
      const current = actualRelations.get(row.relname) ?? { kind: row.kind, columns: new Set() };
      current.columns.add(row.column_name);
      actualRelations.set(row.relname, current);
    }
    for (const [name, expected] of contract.relations) {
      const actual = actualRelations.get(name);
      if (!actual || actual.kind !== expected.kind) {
        failures.push(`missing ${expected.kind} public.${name}`);
        continue;
      }
      for (const column of expected.columns) {
        if (!actual.columns.has(column)) failures.push(`missing column public.${name}.${column}`);
      }
    }

    const functionRows = await client.query(`
      select p.proname,
             coalesce(p.proargnames[1:p.pronargs], '{}'::text[]) as input_names,
             coalesce(p.proargnames[p.pronargs + 1:cardinality(p.proargnames)], '{}'::text[]) as output_names
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f'
      order by p.proname, p.oid
    `);
    const actualFunctions = new Map();
    for (const row of functionRows.rows) {
      const signatures = actualFunctions.get(row.proname) ?? [];
      signatures.push({
        inputNames: [...row.input_names].sort(),
        outputNames: [...row.output_names].sort(),
      });
      actualFunctions.set(row.proname, signatures);
    }
    for (const [name, expected] of contract.functions) {
      const signatures = actualFunctions.get(name) ?? [];
      if (!signatures.some((actual) =>
        sameValues(actual.inputNames, expected.inputNames) &&
        sameValues(actual.outputNames, expected.outputNames))) {
        failures.push(
          `missing function public.${name}(${expected.inputNames.join(",")})` +
          ` -> (${expected.outputNames.join(",")})`,
        );
      }
    }

    const enumRows = await client.query(`
      select t.typname, e.enumlabel
      from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      join pg_enum e on e.enumtypid = t.oid
      where n.nspname = 'public'
      order by t.typname, e.enumsortorder
    `);
    const actualEnums = new Map();
    for (const row of enumRows.rows) {
      const labels = actualEnums.get(row.typname) ?? [];
      labels.push(row.enumlabel);
      actualEnums.set(row.typname, labels);
    }
    for (const [name, labels] of contract.enums) {
      if (!sameValues(actualEnums.get(name) ?? [], labels)) failures.push(`enum public.${name} differs`);
    }

    const requiredBuckets = new Map([
      ["avatars", true],
      ["comment-images", false],
      ["work-attachments", false],
    ]);
    const bucketRows = await client.query(
      "select id, public from storage.buckets where id = any($1::text[]) order by id",
      [[...requiredBuckets.keys()]],
    );
    const actualBuckets = new Map(bucketRows.rows.map((row) => [row.id, row.public]));
    for (const [bucket, isPublic] of requiredBuckets) {
      if (actualBuckets.get(bucket) !== isPublic) failures.push(`Storage bucket ${bucket} is missing or has wrong visibility`);
    }

    await client.query("rollback");
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // The original connection/query error is the useful one.
    }
    const code = typeof error?.code === "string" ? ` (${error.code})` : "";
    fail(`database preflight could not complete${code}: ${error instanceof Error ? error.message : "unknown error"}`);
  } finally {
    await client.end().catch(() => {});
  }

  if (failures.length > 0) {
    for (const problem of failures) process.stderr.write(`  - ${problem}\n`);
    fail(`${failures.length} hosted schema requirement(s) failed`);
  }

  const columnCount = [...contract.relations.values()].reduce((sum, relation) => sum + relation.columns.length, 0);
  process.stdout.write("hosted_schema_verified=true\n");
  process.stdout.write(`migrations=${expectedMigrations.length}\n`);
  process.stdout.write(`relations=${contract.relations.size}\n`);
  process.stdout.write(`columns=${columnCount}\n`);
  process.stdout.write(`functions=${contract.functions.size}\n`);
  process.stdout.write(`enums=${contract.enums.size}\n`);
  process.stdout.write("storage_buckets=3\n");
  process.stdout.write(`tls=${transport.encrypted ? "encrypted" : "cleartext"}\n`);
  if (transport.encrypted) {
    process.stdout.write(`tls_protocol=${transport.protocol ?? "unknown"}\n`);
    process.stdout.write(`tls_cipher=${transport.cipher ?? "unknown"}\n`);
    process.stdout.write(`tls_issuer=${transport.issuer ?? "unknown"}\n`);
    process.stdout.write(`tls_verified=${transport.verified}\n`);
  }
}

main();
