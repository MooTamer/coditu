-- One line per table: "<schema>.<table>\t<row count>".
--
-- The obvious shape is a `\gexec` loop, and it is a trap: psql writes the
-- generated statements to the same stream as their results, so the file ends up
-- with two lines per table and any count of it is doubled. `query_to_xml` runs
-- the count inside the same statement, so nothing but the answer is printed.
select
  t.schemaname || '.' || t.tablename || E'\t' ||
  (xpath(
    '/row/c/text()',
    query_to_xml(
      format('select count(*) as c from %I.%I', t.schemaname, t.tablename),
      false, true, ''
    )
  ))[1]::text
from pg_tables t
where t.schemaname in ('public', 'auth', 'storage')
  and t.tablename not in ('schema_migrations', 'migrations')
order by t.schemaname, t.tablename
