# Coditu — recovery sets

Encrypted backups of the Coditu production Supabase project, one per release,
plus the tooling that writes and restores them.

**There is no plaintext here and no private key here.** Every archive is
encrypted with `age` to the public recipient in `ops/backup-recipient.txt`. This
repository can write backups it cannot read. The private half is
`backup.agekey`, held by Mohamed on his Mac and in whatever offline copy he
keeps; if that key is lost, everything in this repository is noise.

## What a release is

| Tag | Assets |
|---|---|
| `nightly-<id>` | `<id>.tar.gz.age`, `<id>.metadata.json` |
| `monthly-<id>` | the same two, for a set taken on day 01 |

`<id>` is `YYYY-MM-DDTHHMMSSZ`. Retention is 30 nightly and 12 monthly; a
pruned release is deleted with its tag and its assets are really gone. The
release notes carry `backup-id`, `sha256` and `bytes` as an independent record
of what the sidecar claims — the freshness check compares them and refuses to
take either one's word for it.

Backups are **releases, not commits**, because git objects are permanent: a
`git rm` of a 19 MB archive reclaims nothing, so a retention policy expressed as
deletions would grow this repository without bound.

## What each archive contains

`roles.sql`, `schema.sql`, `data.sql`, every Storage object under
`storage/<bucket>/<name>`, and three pieces of evidence used during a restore:
`row-counts.tsv`, `manifest.json` and `checksums.sha256`.

Storage bytes are in **no** database backup, on any Supabase plan. That is why
they are copied separately and counted separately.

## To restore

```bash
scripts/verify-backup-restore.sh <archive.tar.gz.age> <private.agekey>
```

against a fresh project, with `RESTORE_DB_URL` and the `RESTORE_STORAGE_*`
values pointing at it. The full procedure, including what to do about Storage
after `storage.objects` is restored, is in `docs/12-RECOVERY-RUNBOOK.md` in the
application repository — but this repository is deliberately self-contained, so
that a restore does not begin by checking out the thing being restored.

## Where this comes from

`scripts/sync-recovery-repo.sh` in `MooTamer/coditu`. Edit the tooling there,
not here; `sync-recovery-repo.sh --check` reports drift.
