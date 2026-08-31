# Coditu — emergency card

**One page. Print it.** For the night something is gone and nobody remembers any of this.

Written 2026-08-31. Verified by following it literally, changing nothing — see
`docs/06-PROGRESS.md`.

---

## 1. Read this first

**Your data is not inside the application.** It is a nightly encrypted archive, ~19 MB, and there
are several copies. The application being down and the data being gone are different problems, and
only one of them has ever been likely.

**The fastest useful thing you can do is get the rows back**, not get the site back. That takes
minutes and needs no provider account.

---

## 2. Where the copies are

| Copy | Where | Needs |
|---|---|---|
| **PRIMARY** | Mohamed's Mac: `~/Library/Application Support/coditu-backups/` | The Mac |
| Off-site 1 | The Google Drive folder named in `~/.config/coditu/nightly.env` as `OFFSITE_drive_DIR` | A Google sign-in, or any machine where that Drive is synced |
| Off-site 2 | An external disk with `.coditu-backup-volume` in its Coditu folder | The disk |
| Older sets | `MooTamer/coditu-recovery` GitHub releases, up to 2026-08-31 only | A GitHub sign-in |

Each copy is the same pair of files per night:

```
<id>.tar.gz.age        the encrypted archive
<id>.metadata.json     its checksum, row counts and bucket counts
```

`<id>` is `YYYY-MM-DDTHHMMSSZ`. **Newest is best; any of them works.**

---

## 3. The key — read this before anything else fails

The archives are encrypted with **age**. Without the private key they are noise, and there is no
recovery, no escrow and no reset.

| | |
|---|---|
| **Where the key is** | `~/.config/coditu/backup.agekey` on Mohamed's Mac, mode 0600 |
| **Second copy** | ☐ *fill this in* — the safe, the wallet, the password manager entry, the sealed envelope |
| Public recipient (not secret) | `ops/backup-recipient.txt` in the repository |

> **If there is no second copy and the Mac is gone, stop reading: every archive everywhere is
> unreadable.** Make the second copy today, and **not** where the archives are — a key stored beside
> its ciphertext is not a key. Paper in a different building. A password-manager entry. Anywhere the
> Drive folder is not.

**Never type the key into a chat, a ticket, a commit, or this card.**

---

## 4. Get the data back — the short version

On any Mac or Linux machine with Docker and `age`:

```bash
brew install age                          # or: apt install age
docker run -d --name coditu-restore -e POSTGRES_PASSWORD=postgres -p 5599:5432 postgres:17
age -d -i /path/to/backup.agekey <id>.tar.gz.age | tar -xz -C /tmp/coditu-restore
psql 'postgresql://postgres:postgres@127.0.0.1:5599/postgres' -f /tmp/coditu-restore/database.sql
```

Then the data is queryable:

```bash
psql 'postgresql://postgres:postgres@127.0.0.1:5599/postgres' \
  -c 'select count(*) from public.work_items'
```

**Measured, unattended, with the network off: see §7.**

Storage files (avatars, attachments) are in the same archive under `storage/`, as ordinary files.
They need no database and no tool — open them.

---

## 5. Get the application back

Only if you need the app, not just the data.

1. Create a new Supabase project. Note its URL, anon key and service-role key.
2. Restore as in §4, but against the new project's connection string.
3. **Reapply the two triggers no dump carries** — without them there is no profile creation and
   **no sign-up gate**:
   ```bash
   scripts/reapply-managed-triggers.sh '<new project connection string>'
   ```
4. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   on Vercel and redeploy, or run `npm run build && npm start` anywhere.

Estimated 30–60 minutes. It is an estimate and `docs/14-DEPENDENCY-LEDGER.md` says what it is made
of.

---

## 6. Verify you actually got everything

```bash
node scripts/check-materialised.mjs /path/to/the/archives
```

Prints `materialised=true` only when every archive read back byte-for-byte and matched its own
sidecar. **A file that is the right size is not evidence** — a cloud folder can hold a placeholder
with the right name, the right size and no bytes at all.

Compare the restored counts to the sidecar:

```bash
cat <id>.metadata.json     # databaseTables, databaseRows, storageBuckets, storageObjects
```

---

## 7. How long it takes

| Step | Time | Measured how |
|---|---|---|
| Decrypt and restore the database | *see `docs/06-PROGRESS.md`, offline pass* | Unattended, **wifi off** |
| Read the Storage files | immediate | They are files |
| Stand the application up again | 30–60 min | Estimate; components in the ledger |

---

## 8. Who and what

| | |
|---|---|
| Repository | `MooTamer/coditu` (private) — every clone is a complete copy |
| Recovery tooling | `MooTamer/coditu-recovery` — self-contained, so recovery never begins by checking out the thing that was lost |
| Hosting | Vercel Hobby, project `coditu`, `https://coditu-phi.vercel.app` |
| Database | Supabase Free, `hayfsvsepgfescojesbd`, eu-central-1 |
| Longer runbook | `docs/12-RECOVERY-RUNBOOK.md` |
| What each provider is worth | `docs/14-DEPENDENCY-LEDGER.md` |
