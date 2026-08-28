#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Client } from "pg";
import ts from "typescript";

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
  const client = new Client({ connectionString, connectionTimeoutMillis: 15_000 });
  const failures = [];

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
    if (!localHost &&
        (!role || role.current_user !== "coditu_backup" || !role.rolbypassrls || !role.can_read || role.can_write)) {
      failures.push("connection role is not the read-only coditu_backup contract");
    }
    if (!localHost && !role?.encrypted) failures.push("database connection is not encrypted");

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
}

main();
