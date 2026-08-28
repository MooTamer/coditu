# 12 — Infrastructure recovery runbook

This runbook describes the recovery path implemented on 2026-08-28. It does not upgrade a
provider statement into a fact. The current boundary is in
`docs/09-BACKUP-PROPOSAL.md` §7: locally proved, off-site activation card-blocked.

## 1. One-time activation

1. Apply `20260828140000_a_role_that_can_only_read.sql` to the hosted database.
2. In Supabase SQL Editor, generate a unique 32+ character password and set it with
   `alter role coditu_backup with password '<generated value>';`. Do not put the password
   in a shell history, document, issue, workflow, screenshot, or log.
3. Create S3 access keys for the Supabase Storage project. They are separate from the
   database login because database backups do not contain Storage bytes.
4. Activate an R2 Standard bucket and create object read/write/delete keys scoped to that
   bucket. Stop if Cloudflare asks for a payment method: Mohamed explicitly refused a card.
5. Add the secret names listed in `09-BACKUP-PROPOSAL.md` §8 to `MooTamer/coditu`.
6. Keep Vercel and the Recovery Centre unchanged. Dispatch `Nightly recovery copy` once.
7. Verify the workflow output names one uploaded key, `nightly_retained=1`, and no secret.
   Independently `HEAD` the object and compare its byte size and `sha256` metadata to the
   adjacent JSON sidecar.
8. Dispatch `Recovery copy freshness`. It must print the same backup id, an age below
   93,600 seconds and a non-zero encrypted size.
9. Create a free UptimeRobot heartbeat named `Coditu backup freshness`, set it to expect an
   hourly check-in with enough grace for normal GitHub queue delay, and send its email alert
   to Mohamed. Store its unique URL only as `BACKUP_CANARY_HEARTBEAT_URL`; never paste it in
   a log, issue or document. Run the canary again and wait for UptimeRobot to record the
   check-in before enabling notifications. This order avoids a false incident during setup.
10. Configure a local `coditu-r2` AWS profile outside Git and run:

   ```bash
   R2_ENDPOINT='<account endpoint>' R2_BUCKET='<bucket>' \
   LOCAL_BACKUP_DIR='/Users/motamer/Library/Application Support/Coditu/Backups' \
   ./scripts/sync-backup-local.sh
   ```

   Schedule that command daily on Mohamed's Mac only after the first pull succeeds.

## 2. What a nightly recovery set contains

- `roles.sql` — user-created roles and memberships, with passwords excluded;
- `schema.sql` — platform-aware schema dump;
- `data.sql` — data from `public`, `auth`, `storage` and the other non-excluded schemas;
- `storage/<bucket>/<object>` — the bytes absent from every database backup;
- `row-counts.tsv`, `manifest.json`, `checksums.sha256` — the evidence used by a restore.

The set is encrypted to `ops/backup-recipient.txt` before upload. GitHub can write it and
cannot read it. The only private key is
`/Users/motamer/.config/coditu/backup.agekey`, plus the offline copy Mohamed must make
before activation.

## 3. Full recovery after losing the project

1. Stop writes to the old application and record the newest R2 backup id. Do not let two
   recoveries write to the same target.
2. Create a fresh Supabase project in the same region and note its Postgres major version.
3. Download the encrypted archive and metadata to Mohamed's local backup directory.
4. Verify the archive's SHA-256 and byte size against the metadata sidecar before decrypting.
5. Use the platform restore owner, not the backup role, and run
   `scripts/verify-backup-restore.sh <archive> <private.agekey>` against the fresh project.
   The restore order is roles → schema → data. The command fails if any of the 130 current
   table counts differs.
6. Force-upload Storage with recursive copy. Do **not** use `aws s3 sync` after restoring
   `storage.objects`: the metadata rows make sync believe absent bytes already exist.
7. Re-run the object download and byte comparison, the SQL tests, and the hosted schema
   preflight. Only then point Vercel environment variables at the recovered project.
8. Smoke marketing, sign-in, Home, one project, one image, Recovery Centre and a write with
   rollback. Re-open writes only after all pass.

The local drill on 2026-08-28 took under one minute for 5,245 rows and 115 objects after the
throwaway stack was healthy. That is evidence for this data size on this laptop, not an RTO:
creating a hosted project, DNS/environment changes, decision time and provider queues were not
measured. RTO therefore remains unset until the first hosted drill.

## 4. Normal retention and local-copy checks

Every nightly upload goes under `coditu/nightly/<backup-id>/`. A run on day 01 also writes
the same encrypted set under `coditu/monthly/<backup-id>/`. `prune-backups.sh` sorts the
timestamp ids and keeps exactly 30 and 12. It validates every deletion prefix before asking
S3 to remove it.

The local pull does not use `--delete`: an accidental R2 deletion is not propagated onto the
Mac. Check local disk use monthly and remove only copies already represented by a newer
verified set and the 30 + 12 policy.

## 5. Freshness alert

`Recovery copy freshness` runs at minute 47 of every hour. It lists R2 itself, selects the
newest nightly encrypted archive, and fails if there is no archive, its key is malformed,
the adjacent metadata sidecar is absent or empty, its recorded SHA-256 is absent, or its
R2 `LastModified` age exceeds 93,600 seconds (26 hours). A timestamp more than five minutes
in the future also fails instead of disguising clock or metadata corruption.

Only a complete, fresh check pings `BACKUP_CANARY_HEARTBEAT_URL`. UptimeRobot therefore
alerts Mohamed both when the R2 copy becomes stale and when GitHub stops dispatching the
canary itself. The monitor is a separate control plane; GitHub's own workflow status is not
treated as the only alarm for GitHub scheduling.
