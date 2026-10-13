# DailyBread

Turborepo + pnpm monorepo for a multi-country, multi-vendor meal-delivery marketplace (vendors, outlets, meals, meal plans, customers, delivery). Built to add countries without adding complexity.

> **This file is a rulebook, not a changelog.** It holds decisions that are expensive to re-derive and traps that have already bitten. Narrative history lives in git (`git log -p CLAUDE.md` has every earlier, longer version). When you finish work, update the rules and *Current state* — never append a diary entry.

## Layout

| Path | What |
|---|---|
| `apps/backend` | Express + TypeScript API, Prisma, Postgres. **The authority for everything** |
| `apps/erp` | Next.js internal ERP (package `erp`, port 3002, Clerk). Was `apps/admin-dashboard` |
| `apps/vendor-dashboard` | Next.js merchant app (port 3000, Clerk) |
| `apps/customer-app` | Next.js storefront (port 3003, Clerk) |
| `packages/database` | Prisma schema, migrations, seeds (`@repo/db`) |
| `packages/types` | `domain/` · `backend/` (Express-dependent — never import in a frontend) · `frontend/` · `enums/`. Entry points `@repo/types/backend`, `/admin-app` (the ERP's; name kept to avoid a repo-wide import churn), `/vendor-app`, `/customer-app`, `/enums` |
| `packages/ui` | **Styles only** — design tokens + semantic mapping. No components, no TS, no build |
| `packages/geo` | Pure geometry + zone capabilities. No I/O, no `@repo/db` |

**Naming:** the internal application is the **ERP** in code, UI copy and docs. Backend routes and permission keys keep the `admin` vocabulary (`/admin/v1/...`, `admin_users:*`, `AdminUser`) — that names the *actor*, not the app.

## Verify

- `pnpm check-types` — 5/5 tasks.
- `npx vitest run` in `apps/backend` (1134), `apps/vendor-dashboard` (68), `apps/erp` (48). jsdom tests opt in per file with `// @vitest-environment jsdom`; React tests use `react-dom/client` + `act` (helpers in `apps/erp/test/dom.tsx`), no testing-library.
- Smoke scripts against the dev DB: `pnpm dlx tsx --env-file=.env scripts/smoke/<name>.ts` in `apps/backend`. Each builds its own fixtures, sweeps strays first, cleans up after.
- Migrations: `npx prisma migrate deploy` in `packages/database` (`migrate dev` is non-interactive here). Generate with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, then **read it**: a rename comes out as drop + add and must be hand-written as `RENAME COLUMN` (+ `RENAME CONSTRAINT`/`INDEX`). After deploying, `migrate diff` must be empty.
- **Never `next build` over a running `next dev`** — they share `.next`; the dev server then 404s every route. Check the port (`netstat -ano | grep LISTENING | grep :3002`); if busy, verify with `tsc` only. Fix a broken dev server: stop it, `rm -rf apps/<app>/.next`, restart. Stopping `pnpm dev` can leave the `next` child holding the port — kill by port.

---

## Non-negotiable principles

1. **The backend is the source of truth.** Clients display what the server returned; they never re-derive a computed answer or compute one the server later depends on. Client validation informs early, never decides. A client-side mirror (for responsiveness) says in a comment that it is a preview and names the authoritative path.
2. **Money is integer minor units**, columns named `...Minor`. Scale comes from `Currency.minorUnitDigits` — never assume 2 (UGX/JPY 0, KWD 3). `lib/format/money.ts` is the only place minor units become a decimal.
3. **Rates are integer basis points** (`1600` = 16%): `rateBps`, `commissionRateBps`, `percentBps`.
4. **Derive, don't store.** If every input is on the row or the clock, there is no second column (`getVendorGoLiveStatus`, `deriveDiscountState`, `payoutReviewState`, `isGroupRequired`, …). When a derived state must be filtered in SQL, transcribe it clause by clause and guard it with an agreement test (`lib/pricing/discount-state-filter.ts`).
5. **Modules own their tables.** Cross-module access goes through a module's `index.ts` barrel, which exports **resolution only**. **The vendor module never imports admin**; the customer module imports no sibling except barrels. Shared pure rules live in `lib/`, imported by both — never copied.
6. **Opaque ids 404, never 403.** Out of scope, suspended, unpublished, someone else's — indistinguishable from missing. (Exception: public content such as hero promotions, where nothing is secret.)
7. **Controllers destructure the body field by field, never spread** — a spread lets a client set `isPublished`, `adminStatus`, funding fields.
8. **Pure rules with unit tests before any Prisma** (`lib/pricing/*`, `lib/delivery/radius.ts`, `lib/time/*`, `delegation-policy.ts`, …).
9. **Moderation flags detect and surface; they never refuse a save.** Flagged content is hidden from customers; the vendor-facing word is **"send back for revision"**, never "reject". The next edit re-screens and re-queues.
10. **A ceiling only enforced on the way in is not a ceiling.** Re-clamp on read (`effectiveRadiusMeters`, `MAX_DISCOUNT_BPS`, `SELLABLE_MENU_ITEM_WHERE`).
11. **Never invent numbers for the people they describe.** Mock figures are acceptable in the internal ERP only; vendors and customers see "this appears once orders are live".

## Recurring bug classes — check every time

1. **A new or renamed request-body field silently dropped.** Mappers are untyped. Bitten by `taxCategoryId`, `proofDocument`, `deliveryRadius`, `newRateBps`, and a `?category=` filter read as `?adminStatus=`. Add new fields to the controller deliberately and route a body through the real controller in a smoke test.
2. **Two identical keys in one Prisma `where`** — the second overwrites the first; a scope filter vanishes. Collect narrowings into an `AND` list.
3. **An unreachable "All" tab** — an absent param re-applies the default. Emit `?status=all`.
4. **`.catch(() => null)` making a failure look like empty.** Every list distinguishes *failed* / *empty here* / *empty everywhere*; a failed optional read is shown as unavailable, not absent.
5. **RSC boundary:** only JSON-serializable props reach client components. Icons and formatters cross as *names*.
6. **Prisma rejects `null` in a compound-unique input**, and Postgres treats NULLs as distinct — use `deleteMany` + `createMany` in a transaction.
7. **`P2002` has two shapes** under Prisma 7 + `adapter-pg` — always use `errors/prismaUnique.ts`.
8. **Wall-clock reads use the subject's timezone.** `"HH:mm"` columns are outlet-local; `lib/time/localClock.ts` is the only clock reader; `City.timezone` is required.
9. **Tailwind v4:** every app needs `@custom-variant dark (...)` or vendored `dark:` utilities fire for dark-OS users; `@apply` takes only real utilities (declare shared classes with `@utility`); raw `<button>`s need `cursor-pointer`.
10. **A feature is unreachable until `pnpm db:seed` runs** — permissions live in seed data; `syncSuperAdminPermissions()` grants new ones to an existing super admin.
11. **Compiler emit must never land next to sources.** Any compiling package needs an explicit `outDir`; `.gitignore` blocks `packages/*/src/**/*.js`. Backend vitest resolves `.ts` before `.js` as a guard.
12. **Client-only state that changes the TREE SHAPE is a hydration bug.** If a persisted preference changes *which components render* (e.g. a collapsed sidebar mounting Radix Popovers), it must travel as a **cookie** so the server renders it; `localStorage` may only carry CSS-level preferences.
13. **Stale `.next/dev/types`** produces syntax errors in files you did not write: `rm -rf .next && next typegen`.
14. **`revalidateTag(tag, "default")` only marks STALE in Next 16.** Route Handlers must `expireTags(...)` (`lib/cache/expire.ts`) so the next render is fresh; `updateTag` throws outside Server Actions.
15. **Clerk issuer is matched by exact string.** `canonicalIssuer()` in `env.ts` strips trailing slashes at parse time. A webhook working proves nothing about the issuer.
16. **Double-encoded cookies** — Next's cookie setters already percent-encode; serialise plain JSON. `readJson` accepts both forms.
17. **A fast machine clock breaks Clerk sign-in with a blank page** (tokens live ~60 s). Tell: `Clock skew detected … JWT is expired` in `.next/dev/logs/next-development.log`. Fix the clock (`w32tm /resync /force`), never `clockSkewInMs`.
18. **A Radix Sheet/Dialog inside a `<form>` submits that form** (React bubbles along the React tree). Render sheets that hold their own form outside the parent form and `stopPropagation()` in their submit.
19. **A bare 401 "Unauthorized" has several causes** — every verifier logs a classified `Token verification failed` (`expired` + `secondsPastExp`, `bad_signature`, `untrusted_issuer`, …). Open: a vendor 401 right after creating a meal; do not change verification until a log line shows `expired` with `secondsPastExp ≤ 5`.
20. **Smoke helpers that mirror middleware must track it.** `loadAdminUser` selects `city.status` (inactive cities fail closed); a smoke `scopeOf` helper that omitted it silently derived empty CITY scopes.
21. **`next build` caches fetches in `.next/cache`** — `rm -rf .next/cache` before trusting prerendered output after a data-shape change.

---

## Identity, authentication and RBAC

**Clerk establishes identity; Postgres decides authority.** Four Clerk applications (customer · vendor · courier (reserved) · admin), each with its own issuer, JWKS and webhook secret. `verifyClerkJwt` matches `iss` against the four and every middleware asserts the audience, so a token from one app is useless on another's routes. Identity columns are `externalAuthId` (named for the role, not the vendor; code calling Clerk's API still says `clerkUserId`). `CLERK_AUTHORIZED_PARTIES` is required in production.

### Admin RBAC model

**ONE ADMIN → ONE ROLE → explicit GRANTS → ONE SCOPE.**
- **Role** (`AdminUser.roleId`) is a **ceiling**: its pool (`AdminRolePermission`) is what *may* be granted, never an automatic grant. Roles: `super_admin` (CLI only, GLOBAL, never assignable or targetable in the ERP), `identity_admin` (GLOBAL|COUNTRY), `operations_admin`, `finance`, `vendor_ops`, `customer_care`, `courier_ops` (any tier). `ROLE_SCOPE_RULES` decides tiers; an unknown role is refused.
- **Scope** is exactly one `AdminUserScope` row: GLOBAL, one country, or one city. Never a union. The DB enforces it (partial unique index on `adminUserId` — keep it partial so `migrate diff` ignores it — plus a shape CHECK). A CITY scope's country is the **city's** own, read from `city.countryId`. `deriveScopeContext` (`admin/lib/scope/single-scope.ts`) fails CLOSED on zero/several/malformed rows.
- **Effective permissions** — `src/lib/permissions/effective.ts` is the ONE definition: active grants ∩ the role's CURRENT pool ∩ active definitions, and nothing unless the account is active with a valid role/scope pair; a CITY scope also needs an ACTIVE city (`SCOPE_CITY_INACTIVE`, re-checked every request; grants are kept). An invalid scope is reported (`scope.valid`/`invalidReason`), not treated as "zero grants".
- **Chain:** `verifyAdminToken → loadAdminUser → checkIsActive → buildScopeContext → loadPermissions`, re-read from Postgres on every request — no session to revoke, nothing read from the JWT. Mounted once by `adminRouter.use(...adminAuthChain)`; every module router inherits it.
- **`AdminScopeContext`** = `isGlobal`/`countryIds`/`cityIds`/**`tier`**. A CITY admin's `countryIds` holds its city's country, so it looks like a country admin by `countryIds` alone — anything country-wide or dish-wide gates on **`tier`**.
- **Queries that SELECT admins by capability** (recipients, escalation targets, reassignment) use `effectivelyHoldsWhere(key)` — never raw `permissions: { some }` or pool membership. It sets several keys; combine with `AND`.
- **Route manifest** (`admin/routes/v1/route-manifest.test.ts` + snapshot) walks the real routers and fails on any route without a `requirePermission`/`requireAnyPermission` gate (six documented self-scoped routes excepted) or any non-route layer it cannot see behind. A changed requirement changes the snapshot — review that diff. It proves gates, not resource scope.
- **Never add a role-name check to resource authorization.** Roles constrain assignment; effective permissions + scope decide access. (`requireIdentityAccess` was deleted for this reason.)

### Delegation policy (`admin/lib/delegation/delegation-policy.ts`, pure, unit-tested)

There is **no administrator hierarchy beyond scope containment**: same role / same tier never refuses an otherwise authorized action. Every mutation takes only the actor's id and re-reads the actor in its transaction; authority is EFFECTIVE keys.
- **Provisioning / lifecycle** (create, invite, role, scope, suspend, reinstate, reactivate, deactivate, availability — each its own `admin_users:*` key): actor is GLOBAL or COUNTRY; target inside the actor's scope (`targetInScope`, inclusive); **never yourself** (`SELF_ACTION_FORBIDDEN` — covers self-suspension and self-deactivation), never a super_admin. The scope is always explicit (`SCOPE_REQUIRED`) and never broader than the actor's. **Creating an admin grants nothing** (`PERMISSIONS_NOT_GRANTABLE_AT_PROVISIONING`). Status changes are conditional on the status they were decided against (`STATUS_CHANGED`). Suspension freezes grants; deactivation deletes them; **reactivation** (deactivated → pending, no grants, no identity link, new invitation) is the only way back.
- **Ordinary delegation** (`PUT /users/:id/permissions`, `admin_users:permissions:manage`): **permission ownership** — every key added *or removed* is one the actor effectively holds, inside the target role's current pool, for a target whose role the actor may manage (same role, or a pool that covers it — only super_admin's), inside the actor's scope. Ceiling-only in `vendor_ops` and `finance` pools (a designated lead).
- **Recovery / bootstrap** (`PUT /users/:id/permissions/recovery`, `admin_users:permissions:recover` — the mode is the URL's, never a body field): any key of the target role's pool, held or not, for a department's first lead or a lost one. Still bounded by scope and pool; never yourself, never super_admin, and **never a role whose pool can hold the recovery key** (`RECOVERY_ROLE_PROTECTED`), so recovery cannot mint recoverers. Ceiling-only in the identity pool; granted individually.
- **A scope change or a role change clears every grant**, in one transaction with its audit row (`NO_CHANGE` if unchanged).
- Assignment writes take optimistic locks on BOTH actor and target `updatedAt` (`CONCURRENT_MODIFICATION`), audit rows written inside the transaction; assignment routes refuse each other's fields (`UNSUPPORTED_FIELD`).
- **The ERP renders what the server computes**: `GET /users/:id` returns `capabilities` (via the mutation checks themselves) and `isSelf`; `GET /users/:id/permission-options` returns per-mode allowed + movable keys (`assignmentOptions`, pinned to the write by an agreement test); `GET /users/delegable` lists whom a lead may assign to.
- Reads and writes share ONE geographic rule: `targetInScope`, SQL form `adminsInScopeWhere` (AND-combined). Out of scope is 404. `scripts/audit/verify-admin-scope-queries.ts` checks the two agree on real rows.
- **Not built:** per-permission scope compatibility (a key invalid for CITY admins); referral/approval queues. `scripts/audit/admin-delegation-violations.sql` (read-only, not yet run) lists existing accounts today's rules would refuse.

### Identity directory (ERP `/identity`)

- `GET /admin/v1/users` returns rows **and `statusCounts`**, both built on `adminsInScopeWhere(actorScope)`. `statusCounts` is the viewer's **whole scoped population** (ignores filters, so the summary is stable while the table narrows); `total` is their sum. Filters (`status`, `roleId`, `countryId`, `search`) only narrow inside scope; an unknown status is `400 INVALID_STATUS_FILTER`; malformed paging falls back. Invalid scope → no rows, all counts zero.
- **`createdById` ≠ `invitationSentById`.** `createdById` is who created the record (renamed from the misleading `invitedById`, migration `20261013090000_admin_created_by_and_invitation_sender`). `invitationSentById` is who sent the **latest** invitation, set with `invitationSentAt` and cleared with it on reactivation; backfilled only from `admin_user.invited` audit rows. Never display the creator as the inviter; a sent invitation with no recorded sender reads "Not recorded" (e.g. the super-admin CLI).
- ERP: the directory is `/identity` and one details page `/identity/[id]` serves every status. Every old `/identity/manage[/...]` URL (including `/[id]/review`) redirects through one catch-all, keeping list filters. **Account actions live only on the details page** — the table's row menu just links there. Lifecycle actions (`components/identity/lifecycle/`) share one config, hook and AlertDialog; a dialog closes only after the backend accepts. Permissions are edited in a Dialog on the details page (`permissions/PermissionEditor.tsx`). `/identity/permissions[/:id]` stays for department leads who hold `permissions:manage` but not `profiles:read`; `/identity` sends them (and create-only admins) to the page they can use.
- **Pending permission setup** (`AdminPermissionSetup`, one row per account, PK `adminUserId`; ERP `/identity/setup`). Opened in the invitation's transaction only after Clerk accepted it and only if the account holds no grants (idempotent: `createMany skipDuplicates`); completed by the first non-empty grant; reopened when a role/scope change clears an invited account's grants; cancelled on deactivation; deleted on reactivation. Acceptance never touches it, and nothing is granted automatically. Transitions live in `admin.permissionSetup.lifecycle.ts`, always inside the causing write's transaction.
- **Who sees a setup is never stored** — `lib/delegation/setup-audience.ts` (pure) classifies each pending row per viewer from live authority via `assignmentOptions`: `department` (same role + management key + placement: a GLOBAL target's GLOBAL leads; a COUNTRY/CITY target's COUNTRY leads in that country), `recovery`, `oversight` (reach without being the normal audience — a GLOBAL lead over lower tiers, super_admin). The nav count (`attention`) is department rows, plus recovery/super-admin rows only when no department delegate currently exists. CITY admins never see setups. The SQL pre-filter is `adminsInScopeWhere`, so nothing out of scope reaches rows or counts.
- **Permission saves carry `expectedGrants`** (the editor's baseline): a mismatch is `409 PERMISSION_SETUP_COMPLETED` (someone completed the setup) or `PERMISSIONS_CHANGED`, checked after authorization. Every permission save, in either mode, goes through a written-out review (`PermissionReview`: readable name, description and key for each addition and removal) before it is sent. Editors key on the server's grants so "Load latest" remounts them; lifecycle refusals with 403/409 `router.refresh()`.
- **Clerk refuses a second pending invitation** (`duplicate_record`, a 502 here) and can hold a pending record its list API never returns. `ClerkAdminStateService.createInvitation` therefore creates with `ignoreExisting: true`, then revokes every *other* pending invitation for that exact address (send = resend, one live link). Clerk errors carry their reason in `err.errors[].longMessage`; `err.message` is only the HTTP status text.
- The sidebar count is read uncached in the dashboard layout (`lib/identity/pending-setups.ts` → `NavIndicatorsProvider`) and refreshes with `router.refresh()`; no polling.
- **Editing an account is `/identity/[id]/update`** (SSR; three parts, each saved on its own): profile (`PATCH /users/:id/profile`, key `admin_users:profiles:update`, identity pool only), role + scope as ONE request (`PUT /users/:id/assignment`, `roles:assign` — the pair is validated together, grants cleared once, setup reopened, one audit row), and the permission editor. Both edits are provisioning authority (same rules as create) and send `expectedUpdatedAt` → `409 ACCOUNT_CHANGED` when stale. **The email is never editable** (`EMAIL_NOT_EDITABLE`): a wrong address means deactivate + create. The details page shows "Edit account" from `capabilities.editProfile || changeRole`; it no longer edits role or scope inline. The single-field `/role` and `/scopes` backend routes remain for API callers.
- The directory's country column and filter are for GLOBAL viewers only.
- `UserStatusBadge` is the one status pill (tinted, ringed, coloured dot, pulsing while an invitation awaits acceptance; `size="md"` adds an icon). There are no global `status-*` classes.

### Other admin rules

- **Review workflows come in two strengths.** Full claim/escalate/reassign (applications, compliance cases, appeals, payout accounts — reference: `admin.vendor.compliance-case.service.ts`) where concurrent action has consequences; plain approve/send-back (outlets, profiles, meals) elsewhere.
- **Every mutation audits** via `auditService.log` (`entity.verb`, append-only, fire-and-forget; `drainAuditQueue` and `log` share `audit.queue.ts`). Authorization changes write their audit row inside the transaction. An audit redesign is a separate, planned session.
- **Catalog pattern** (`VendorType`, `Cuisine`, `DietaryTag`, `PaymentMethod`, `TaxCategory`): global catalog + per-country enablement. Catalog writes need GLOBAL; enablement needs country scope. No delete — withdraw by status. Open hole: `assign/removeVendorTypeToCountry` lack the `tier` gate.
- **Action reasons** (`AdminActionReason`, ERP `/meals/reasons`): `description` is the vendor-facing text; `appliesTo` holds canonical audit verbs mapped to their governing permission (`admin/lib/reasons/reason-actions.ts`); authoring needs `settings:action_reasons:write` AND every governing key. Codes are system-generated and never edited; a country row overlays the global row with the same code. `OTHER` is reserved (COUNTRY/GLOBAL only, explanation ≥ `OTHER_MIN_LENGTH`).
- **Customer moderation** moves both ways: `suspendCustomer`/`reinstateCustomer` write Postgres then ban/unban at Clerk (best-effort, reported as `sessionsRevoked`); Clerk's `banned` maps back on `user.updated`; `locked` is not mirrored. No geographic gate — customers are not country-scoped.

---

## Backend conventions

- `routes/v1/*.routes.ts` → `controllers/*.controller.ts` (map + delegate only) → `services/*.service.ts` (logic; take scope per call).
- **Rate limiting keys on a verified identity first, an address second** (`config/rateLimit.ts`): `identifyCaller` verifies any bearer token (never refuses) → `general` (user 600 · anonymous IP 300 · trusted cache fill 3000 / 15 min) → `expensive` (presigns, CSV, image writes: 60). Each limiter mounted once. The customer app's anonymous calls name the visitor via `x-db-internal-key` (`INTERNAL_PROXY_SECRET` = `BACKEND_INTERNAL_KEY`) + `x-db-client-ip`. In-memory stores are correct only for ONE backend process — two processes need Redis. Before production: `CLERK_AUTHORIZED_PARTIES`, the proxy secret pair, `CLIENT_IP_HEADER`, `TRUST_PROXY` if fronted.

### Storage — two buckets, and the split is a security boundary

R2 grants public access per BUCKET, so a public path in the private bucket would publish every payout proof and ID document.

| Bucket | Env | Holds |
|---|---|---|
| private | `R2_BUCKET_NAME` | documents, payout proofs, **every original an admin or vendor uploads**. Leaves only as a short-lived signed URL |
| public | `R2_PUBLIC_*` | derivatives **this server produced** (marketing, cuisine tiles, menu-photo WebP masters, menu logos), uuid-named, `immutable` |

- Nothing a user uploaded is served byte for byte. **Re-encoding is the sanitiser** (`lib/images/transform.ts`): strips EXIF/GPS, kills polyglots; the decoded format is the truth; `limitInputPixels` guards decompression bombs; never SVG. `lib/images/publicImage.ts` is the shared upload→sanitise→publish pipeline; callers pass only prefixes and crop.
- `lib/storage/publicMedia.storage.ts` is the only public writer; `publicUrl()` the only place a key becomes a URL. **The DB stores keys, never URLs** (keeps the provider swappable).
- Upload flow everywhere: presign → XHR `PUT` → submit the `storageKey`. Private keys are named `...Key` and become signed URLs at one exit per domain. Every key carries its owner id, and `assertOwned*Key` checks the exact prefix (no traversal, no `vendor-1` vs `vendor-1-extra` collision). Filenames are uuids; public keys are never reused (no CDN purge needed).
- Env traps guarded at boot in `env.ts`: `R2_PUBLIC_ENDPOINT` is the account endpoint with no bucket path; `R2_PUBLIC_CDN_URL` is the serving origin, never the S3 API URL. `NEXT_PUBLIC_MEDIA_HOST` (hostname only) must be set in the ERP and customer app, read at boot. `r2.dev` is the dev origin only. Private bucket lifecycle rule: `meal-uploads/` deleted after 2 days (staging).
- Payout identifiers: AES-256-GCM at rest + keyed-HMAC blind indexes; `presentPayoutAccount()` (masked) is the only exit; `decryptPayoutIdentifiers` is reachable from no route.
- Processing is synchronous (no queue in the project). Add one when volume demands it.

---

## Domain

- **Vendor** — country-scoped (`VendorAccount.countryId` fixed at approval). `VendorUser` 1:1 (no orgs). Tiers: access (not banned) → authoring (account ACTIVE: profile, outlets, payout, documents, menu, offers) → commercial activation (`canGoLive`, needs a verified payout account).
- **Geography** — `Country` → `City` (required `timezone`) → `Zone`. A Zone is a **capability container**, not a delivery boundary: `level` × `operationalStatus` × `status`; `ZONE_CAPABILITIES` turns level into flags — check the flag, never `level >= X`. `Zone.publicName` (required) is the only zone name customers or vendors see; `Zone.name` is operations vocabulary.
- **Outlet** — `clearanceStatus` × `adminStatus` × `reviewStatus`, never collapsed. `deliveryRadius` is the merchant's reach; the zone is the platform's permission; both required (`lib/delivery/radius.ts`).
- **Menu** — `MenuItem` (the **dish**, vendor-level) → `Meal` (a **listing**: one dish at one outlet; `priceMinorOverride`, `isAvailable`). `MenuSection` vendor-owned, ordered by `position`. `ModifierGroup`/`ModifierOption` are one primitive for variants and add-ons; **a group belongs to one dish**, written only inside the dish's save (`modifierGroups: [...]`; absent = untouched, `[]` = clear); reuse is a copy; `prepareDishGroups` 404s foreign ids. Option selection rules are enforced server-side in `validateSelection` (`lib/pricing/line.ts`); nothing is pre-selected. `portionSize` is descriptive, screened text.
- **Menus** (`Menu`, `MenuMeal`) — an outlet's named selection of Meals it already sells; FKs include `outletId` so the DB refuses cross-outlet rows. ERP read-only; no customer read yet.
- **Pricing order:** `base + option deltas` → `− discount` → `± tax` → **commission on the discounted amount**.
- **Tax** — own module. `TaxCategory` × `CountryTaxRate` (`rateBps`, one `isStandard`) + `CountryTaxConfig`. An unrated category falls back to the standard rate, **never zero**.
- **Finance** — provider-agnostic: `PaymentProvider` → `CountryProviderAccount` → routed per capability by `resolveProviderGateway`. **No fallback, ever**; cross-country routing structurally impossible. `bankVerificationMode` `PROVIDER` | `MANUAL` (Kenya MANUAL).
- **Discounts** — vendor-funded; `PERCENTAGE_OFF_ITEMS` | `AMOUNT_OFF_ORDER`; state derived; explicit targeting flags; **offers never stack**; caps recorded, not enforced (no orders yet). Customer copy says **"Offers"**.
- **Customer** — cart is stateless (client holds ids, server prices every call via `POST /cart/price`). `customer.visibility.ts` defines what a customer may see. Two chains: `customerAuthChain` (required) and `attachCustomerContext` (optional, never rejects). Verified token with no row → **503 `CUSTOMER_ACCOUNT_PENDING`**.

### Meal moderation (`modules/meals`, ERP `/meals`; API `/admin/v1/vendors/meals`)

- In the ERP a `MenuItem` is a **Dish** and a `Meal` is a **Listing**.
- Keys: `vendors:meals:read` · `:moderate` (content verdicts, hide/unhide, escalate) · `:enforce` (suspend/reinstate/ban/unban). Each listing action is its own route with its own gate.
- **Scope decides what may be targeted; the target decides the blast radius.** Dish actions change the dish at every outlet in the country → need GLOBAL/COUNTRY tier (`assertDishWideAuthority`, `canActDishWide` returned). A CITY admin reads only dishes sold in their city and acts on listings (`listingScopeWhere`, by `outlet.cityId`).
- **Every consequential action is reason-backed** (`reasonCode`, `vendorMessage` only for OTHER, `internalNote` audit-only); the free-text `reason` is refused. Audit metadata is a structured snapshot. A CITY admin with no fitting reason escalates (`MealEscalation`, one open per listing, to an eligible COUNTRY recipient).
- Option groups have their own verdict; a blocking group (FLAGGED or MANUALLY_REJECTED) blocks dish approval (`MODIFIER_GROUP_UNRESOLVED`) and is refused on read by `SELLABLE_MENU_ITEM_WHERE`. `nextDishReview` is the only rule for how a dish follows its groups; a re-queued dish waits for an admin. A copied group cannot launder a verdict (`MATCHES_UNRESOLVED_GROUP`).
- Operational status table: suspend (ACTIVE→SUSPENDED), reinstate, ban (→BANNED), unban; the ERP sends `expectedStatus` so a stale view 409s. Listings carry two orthogonal platform controls, `adminHiddenAt` and `Meal.adminStatus`; no vendor write touches either. `listingBlockers` must stay in agreement with `SELLABLE_MEAL_WHERE` (smoke-checked).
- Every moderation action purges the storefront's `city-inventory` tag via `revalidateStorefront` (never throws).

### Marketing (`modules/marketing`, `HeroPromotion`)

- Its own module (written by admins, read by the storefront; customer → admin imports are forbidden). Barrel exports resolution; `marketingAdminRouter` mounts under admin v1.
- Every promotion speaks for the **platform**; scope (CITY → COUNTRY → GLOBAL) says where it is seen. Ranking: **priority tier, then specificity, then newest** — the SQL pre-filter must order by the same keys (it also `take`s). Tiers are named (`STANDARD` 0 · `FEATURED` 100 · `TAKEOVER` 500, `packages/types/src/enums/marketing.ts`); anything above STANDARD needs an end date. The evergreen default is a GLOBAL STANDARD promotion with no end date.
- Reading is unscoped (public copy); writing is scoped → refusals are **403**. `canManage` is computed by running the write guard. The public endpoint uses its own six-field presenter (`presentPublicHeroPromotion`), key set pinned by the smoke test.
- Freshness: backend-driven on-demand purge (`POST /api/revalidate` on the storefront, secret + tag allowlist, fails closed) **plus** the 60 s timed revalidate for windows that open/close with no event. Stale-while-revalidate means the first request after a purge is still old.
- Vendor-funded placement is deliberately unmodelled; it needs its own system (and a resolver that returns more than one winner).

---

## Frontend conventions (all apps)

- Server Components fetch via the app's `adminFetch` / `backendFetch` / `publicFetch`; client mutations go through `app/api/**` route handlers that proxy (`proxyToBackend`). The Clerk token never reaches client JS. **A proxy forwards the query string**, and pickers send an explicit `pageSize`.
- **Server Components by default**; `"use client"` only at interactive leaves. Pages are short and compose components. Fetch initial data on the server; client fetching only for interaction.
- **shadcn components are per-app** (`components/ui/*`, own `cn()`, own Radix deps). Never add `@repo/ui/components/*` back. Add a primitive with shadcn inside the app that needs it.
- **Action colour is a Button variant, never a className.** ERP house style is a tint: `default` (one primary action), `warning` (reversible and consequential — suspend), `success` (restores — reinstate, publish), `destructive` (cannot be undone — kept rare). The `solid-*` variants (white text; shades chosen to clear 4.5:1) are for the few actions that must stand out — account lifecycle and the Assign/Manage permissions button (`solid-info`) on the identity details page — and `neutral` (solid slate) is for back navigation. User-facing copy never says "recovery" (it reads as restoring something lost): the mode is **Department setup**, the queue lane **Other departments**; the code, route and permission key keep `recovery`.
- **Back navigation is always `<BackButton href>`** (`components/shared/BackButton.tsx`); never hand-roll an arrow link.
- `AlertDialog` for confirmations, `Dialog` for larger editors, `Sheet` for forms; a dialog never claims success before the backend confirms.
- `TableFilterBar` (extend via `extraFilters`; named `category*` props write `?category=`), `TablePagination` (rebuild the whole query string), `SearchableSelect`, `EmptyState`. Link-based SSR pagination.
- Sidebar nav is permission-gated — links vanish rather than 403. A button is named for what its destination does.
- **Client components and `Intl`:** a price or date rendered on first paint arrives pre-formatted from the server, or uses a fixed locale (`lib/identity/format.ts`).
- Mapbox is ~1.8 MB: always `next/dynamic`, `ssr: false`.
- Images: `formats: ["image/avif", "image/webp"]`; store a JPEG/WebP master, let `next/image` derive sizes.
- `next dev` (Next 16) writes `AGENTS.md` / a one-line `CLAUDE.md` into each app; they are framework notes, not project rules.

### ERP specifics

- Neutral, dense, operational; light-only. Pages call `getAdminSession()` (`lib/auth/session.ts`) and gate on its permission keys only for navigation; **per-record actions come from server `capabilities`**.
- Marketing routes: `/marketing/[id]` read-only, `/marketing/[id]/edit` the form. Cuisines: pages (`/food-tags/cuisines/[slug]`, `/edit`); dietary tags: Sheet.

### Vendor dashboard specifics

- Sticky navbar inside `SidebarInset`; column `overflow-x-clip` (not hidden). Sidebar collapse is the `db-vendor-sidebar-collapsed` **cookie**; widths from `SIDEBAR_WIDTH`. `BrandMark` is the one place the brand is drawn. Placeholder nav links (Dashboard, Orders, Subscriptions, Meal plans) are deliberate — `nav-links.test.ts` pins them.
- Every menu/outlet write **expires** its cache tags; readiness writes `router.refresh()`.

### Customer app specifics

- **Fetch placement:** Server Component render → `lib/data/*` (direct `backendFetch` + `revalidate`/`tags`); client component → `app/api/**`; static copy → `constants/**`. A Server Component never fetches this app's own route handler.
- `lib/api/server.ts` attaches a token when one exists and never errors without one. Anything carrying a token is `no-store`; only explicitly `anonymous` reads use ISR.
- **Static pages stay static.** `/`, `/about`, `/city`, `/cuisines` are `○`. Nothing in the root layout may read `cookies()`/`headers()`/`auth()` — it would make every route dynamic. `Navbar` is a client component so `<Show>` reads the session in the browser; `ClerkProvider` is not given `dynamic`. Verify with build output.
- Reads return a **state** (`no-location` / `ok` / `error`), never a bare throw or empty array.
- Theme: own provider (`components/themes/theme-provider.tsx`) with `<ThemeScript />` in the server layout; **do not add `next-themes` back**. Clerk uses its official shadcn theme; retune Clerk through tokens in `globals.css`.
- Auth is route-based (`/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`); `fallbackRedirectUrl="/continue"`, never `forceRedirectUrl`. `proxy.ts` lists **protected** routes (`/account…`). No `<UserButton>` inside the mobile sheet.
- **Customer copy:** "Places", not outlets/kitchens/restaurants; "Offers", not discounts; the outlet name leads and the vendor is a byline (`lib/format/outlet.ts`); zones by `publicName`.
- `/meals/[mealId]` has **no `loading.tsx`** on purpose (a loading boundary pins the status at 200; a missing meal must 404).

### Location and markets (customer)

- **Market ≠ point.** A market (country + city, in the URL `/city/[slug]`) drives merchandising; only a **point** (lat/lng) drives a feed, fee, ETA or order. `resolveCustomerLocation` resolves points by point-in-polygon. **Never substitute `City.latitude/longitude` for a missing point** (it is a fly-to centroid; Nairobi's zones don't tile the city).
- Three things, three homes: marketplace city (URL) · delivery choice (cookie `db_delivery`, one entry **per market**: deliver to an address/pin, or browse) · the customer's cities and per-city defaults (`ConsumerMarket`, backend). `resolveMarketChoice` (pure) and `getMarketScope` (`cache()`d per request: `delivery` / `unavailable` / `browse`) are the rules. Every market route is dynamic; crawlers get the city-wide page.
- **A saved address requires a pin** and derives its geography from it; no stored `cityId`/`zoneId` (re-resolved on read). Saving is refused only `OUTSIDE_COVERAGE`. A selected address is authoritative and travels as `addressId` only. Selecting an address (per device, per market) and defaulting it (durable, per city) are different verbs with different endpoints.
- Browsing and setting a location are **public**; saving, checkout, orders and the account need sign-in. `/` never asks for a location; detection happens on a click.
- City inventory (`discoverCityOutlets`) applies the same visibility as the located feed minus distance; distance/ETA come back null, never invented. A facet must count the same ground as the filter it drives.
- Areas shown to customers are zone **names only** (`publicName`), never level, status or polygons. The customer map draws no zones.
- Meal plans: SAMPLE data is allowed for meal plans only, fenced in `lib/data/market/sample/`, off in production builds, always badged.

---

## Design system

- `@repo/ui` = `styles/tokens.css` (raw primitives, brand ramp, status colours, radii, shadows) + `styles/base.css` (semantic tokens). Each app's `globals.css` overrides semantic tokens for its personality and re-exports into Tailwind via `@theme`. The radius scale must live in `@theme inline`.
- **Always use mapped utilities** (`text-muted-foreground`), never `text-[var(--…)]`.
- Customer storefront: palette **sampled** from `public/design-reference/dark-theme.jpg` (cool blue-grey neutrals, one orange `#fd9a4c` in both themes; light theme is the mirror); structure from `design.png`. Playfair Display for display headings, Inter for everything else. Deliberate contrast choices — do not "correct": `--primary-foreground` is near-black; `--ring` is a deeper orange in light mode; `--muted-foreground` is tuned against `--surface-subtle`; `--color-input` maps to `--input-border`.
- Brand: the app name is the logo (customer and vendor apps, rendered WebP wordmarks); the ERP keeps its own mark.

---

## Current state

- Shipped: vendor onboarding/compliance/payouts, menus and meal-owned option groups, ERP meal moderation (dishes, listings, reasons, escalations), marketing heroes, cuisine catalogue, the customer market/location/discovery/storefront/meal pages (read-only), customer accounts and addresses, admin RBAC (effective permissions, single scope, delegation + recovery), and the ERP identity directory (scoped list + counts, one detail page, lifecycle dialogs, permission dialog, pending-setup queue).
- Latest migration: `20261013100000_admin_permission_setup` (backfills a PENDING setup for already-invited accounts holding no grants).
- ERP and vendor pages are verified by build, typecheck and component tests, **not walked in a browser** (needs a real Clerk sign-in).
- Dev data is entered by hand, not seeded beyond catalogues/permissions/geography. Nairobi's two zones do not tile the city.

### Next up
1. **The `Order` model**, designed with the Payments boundary — blocks discount redemption/caps, commission, payouts, meal-plan readiness and the vendor order feed.
2. **Payments module** (separate from tax and finance): intents, attempts, capture, refunds, webhook reconciliation.
3. **Meal-plan cleanup before orders** — `MealPlan` is outlet-scoped while dishes are vendor-scoped, and `MealPlanMeal` has no day column. Fix `MealPlanMeal.meal` to `NoAction` there too.
4. **The cart, with orders and not before** — recover from commit `30facf5`.
5. **Meal-plan market read** to replace `lib/data/market/sample/`.
6. **Delivery verdict on storefront and meal pages** (backend half done).
7. Outlet logos (bounded design: `OUTLET_LOGO_PROFILE`, drop the dormant `Outlet.avatar/coverBanner/images`). Cap on "your cities".
8. RBAC follow-ups: audit-session redesign; per-permission scope compatibility.

## Deferred — with the reason, so it isn't re-litigated

- **Vendor-funded featured placement** — its own system (inventory, pricing, billing, fair rotation).
- **Vendor-created categories or dietary tags** — refused: a controlled vocabulary is what filters and analytics run on, and a dietary tag is a safety claim. A "request a tag" queue is the right shape.
- **Keeping `ClerkProvider` off pages that don't need auth** — measured (~257 KB) and deferred as over-engineering.
- **Reviews** (ratings displayed are all 0; nothing writes them) · **persisted cart** · **PostGIS** (in-memory distance over a bbox prefilter, capped at 2000) · **address geocoding** · nested modifiers / per-outlet option pricing / menu hours · BOGO, co-funded campaigns, promo codes, stacking · per-offer authoring timezone · sub-national tax · effective-dated commission · KYC/PEP/retention (blocked on legal) · admin image moderation and photo takedown · hard-delete integrity for dishes · orphaned image sweep.
- **External-API pause points** (each one adapter behind an existing seam, waiting on keys): payment execution, email (`sendEmail`), content moderation (`ContentModerationProvider`), image moderation, document OCR.
- **Out of scope for identity work unless asked:** Finance role/module changes, Vendor Ops beyond Meals, an HR platform, referral notifications / approval queues, the audit redesign.

---

## Working agreement

- Recon before building; preserve unrelated working-tree changes; never commit or push unless asked.
- Push back when a request is wrong, and say why. Copy Uber Eats / DoorDash / Bolt Food where a convention exists — meal plans are genuinely ours. Ask only when two readings produce materially different work; otherwise decide, state the assumption, proceed.
- **A feature is not done because it typechecks.** Every pass ends with typecheck, the vitest suites, and a smoke test against the dev DB that exercises every new Prisma query and cleans up after itself. Assert on the *reason* a thing failed (its code), not merely that it failed.
- Comments explain non-obvious decisions and security invariants only. Small modules, clear names, no giant components or service functions. No new dependency without a demonstrated need.
