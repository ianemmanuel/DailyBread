# DailyBread Database Package

This package owns the application's database layer.

Responsibilities:

- Prisma schema
- Prisma Client generation
- Database migrations
- Seed data
- Database bootstrap scripts
- Super Admin creation

---

# Development Workflow

## 1. Start PostgreSQL

From the repository root

```bash
pnpm docker:dev:up
```

Verify

```bash
pnpm docker:dev:ps
```

---

## 2. Generate Prisma Client

```bash
pnpm db:generate
```

---

## 3. Create Migration

```bash
pnpm db:migrate
```

---

## 4. Deploy Existing Migrations

Used by CI/CD.

```bash
pnpm db:deploy
```

---

## 5. Seed Immutable System Data

Seeds:

- Roles
- Permissions
- Role Permission Pools
- Action Reasons

```bash
pnpm db:seed:admin
```

Safe to run multiple times.

---

## 6. Create the First Super Admin

Run only during initial platform setup.

```bash
pnpm db:super-admin \
-- --email admin@example.com \
--first John \
--last Doe
```

The script:

- creates the AdminUser
- assigns the Super Admin role
- grants all permissions
- assigns Global scope
- sends Clerk invitation

---

# Development Lifecycle

```text
docker:dev:up

↓

db:generate

↓

db:migrate

↓

db:seed:admin

↓

db:super-admin

↓

turbo run dev
```

---

# Production Lifecycle

```text
docker compose up

↓

db:deploy

↓

db:seed:admin (first deployment only)

↓

db:super-admin (first deployment only)

↓

start backend
```

---

# Seed Philosophy

Only immutable system data belongs in seed scripts.

Examples

✓ Roles

✓ Permissions

✓ Permission Pools

✓ Action Reasons

✓ Feature Flags

✓ System Settings

Do NOT seed:

✗ Customers

✗ Vendors

✗ Cities

✗ Countries

✗ Meals

✗ Orders

These should be managed through the Admin UI.

---

# Database Ownership

This package is the single source of truth for:

- Prisma Schema
- Prisma Client
- Migrations
- Seed Data
- Bootstrap Scripts