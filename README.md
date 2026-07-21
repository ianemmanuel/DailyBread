# @repo/db

Shared Prisma database package for DailyBread. Backend apps and services
(Express API, admin dashboard, vendor dashboard) all consume this package
rather than talking to Postgres directly.

```
exports: "." → ./src/index.ts   (prisma client + enums, e.g. AdminUserStatus)
```

## Environment variables

| Variable                  | Required for                                  |
| -------------------------- | ---------------------------------------------- |
| `DATABASE_URL`             | Everything (Prisma connection string)          |
| `CLERK_ADMIN_SECRET_KEY`   | `db:super-admin` (sends the Clerk invitation)  |
| `ADMIN_APP_URL`            | `db:super-admin` (invite redirect URL; falls back to `http://localhost:3002`) |

## Scripts

Run these from the repo root via the pass-through scripts in the root
`package.json` (`pnpm db:generate`, `pnpm db:migrate`, etc.), or directly
from this package with `pnpm --filter @repo/db <script>`.

| Script                | What it does                                                  |
| ---------------------- | -------------------------------------------------------------- |
| `db:generate`          | `prisma generate` — regenerate the Prisma client                |
| `db:migrate`           | `prisma migrate dev` — create/apply a migration in development  |
| `db:deploy`            | `prisma migrate deploy` — apply migrations in CI/production      |
| `db:seed`              | Runs the full seed pipeline (`src/seed/index.ts`)                |
| `db:seed:admin`        | Seeds admin roles/permissions                                    |
| `db:seed:geography`    | Seeds countries/cities                                           |
| `db:seed:vendor`       | Seeds vendor fixtures                                             |
| `db:seed:system`       | Seeds system/reference data                                       |
| `db:super-admin`       | Interactive CLI to bootstrap the first Super Admin (see below)   |

## Creating the first super admin

`src/commands/create-super-admin.ts` creates the initial `AdminUser` row,
grants it every `super_admin` permission, assigns `GLOBAL` scope, writes a
bootstrap `AuditLog` entry, and sends the Clerk invitation. It's meant to be
run once per environment, by a developer, from a terminal — **never** wire
it up as an API route.

Prerequisites:

- `db:seed:admin` must have already run (the `super_admin` role + its
  permissions need to exist).
- `DATABASE_URL` and `CLERK_ADMIN_SECRET_KEY` must be set.

### Usage

The CLI accepts email/name as flags, prompts for anything you leave out,
and always shows a confirmation summary before writing anything to the
database.

**Fully interactive — just run it and answer the prompts:**

```powershell 
pnpm db:super-admin --
```

**Email supplied, name prompted:**

```powershell
pnpm db:super-admin -- --email admin@dailybread.co.ke
```

**Everything supplied, no prompts — explicit name parts:**

```powershell
pnpm db:super-admin -- --email admin@dailybread.co.ke --first Emmanuel --middle Ian --last Odhiambo
```

**Everything supplied, no prompts — single `--name` flag:**

```powershell
pnpm db:super-admin -- --email admin@dailybread.co.ke --name "Emmanuel Ian Odhiambo"
```

`--name` splits on whitespace: first token → first name, last token → last
name, anything in between → middle name. `--middle` is always optional —
if you leave it out entirely, you'll get an optional prompt you can skip
by pressing Enter.

You can mix flags and prompts freely — e.g. pass `--email` and `--first`
and it'll only ask you for the last name.

> **PowerShell notes:** the `--` immediately after `db:super-admin` is
> required so pnpm forwards the flags to the script instead of trying to
> parse them itself. PowerShell also doesn't support `\` line continuation
> the way bash does — keep the command on one line, or use a backtick
> `` ` `` at the end of each line if you want to split it up.

### What happens on success

```
✓ AdminUser row created (status: invited)
✓ All super_admin permissions granted
✓ GLOBAL scope assigned
✓ Bootstrap AuditLog entry written (adminUserId: null — no acting admin exists yet)
✓ Clerk invitation sent
```

The account stays in `invited` status until the person accepts the Clerk
invitation and signs up; the Clerk webhook then flips it to `active` and
populates `clerkUserId`.

### If it fails partway

If the Clerk invitation fails after the database row is created, the
script rolls back everything it wrote (the `AdminUser` row, its scopes,
its permissions, and the bootstrap audit entry) so re-running the command
doesn't hit a duplicate-email error.

### Re-running

The script checks for an existing `AdminUser` with the same email before
doing anything, so it's safe to re-run — you'll just get a clear error
telling you the account already exists (with its id and status) instead of
a database constraint failure.