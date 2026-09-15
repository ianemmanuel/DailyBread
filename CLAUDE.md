# DailyBread

Turborepo monorepo for a multi-country, multi-vendor meal-delivery platform.

> **This file is a rulebook, not a changelog.** It holds decisions that are expensive to re-derive and traps that have already bitten. Full narrative history of every pass is in git — read the log rather than re-adding it here. When you finish a piece of work, update the *rules* and *Current state* below; do not append a diary entry.

## Layout

| Path | What |
|---|---|
| `apps/backend` | Express API — the authority for everything |
| `apps/admin-dashboard` | Next.js ERP (port 3002), Clerk |
| `apps/vendor-dashboard` | Next.js merchant app (port 3000), Clerk |
| `apps/customer-app` | Next.js storefront (port 3003), Clerk |
| `packages/database` | Prisma schema + seeds (`@repo/db`) |
| `packages/types` | `domain/` · `backend/` (Express-dependent, never import in a frontend) · `frontend/` · `enums/`. Entry points: `@repo/types/backend`, `/admin-app`, `/vendor-app`, `/customer-app`, `/enums` |
| `packages/ui` | **Styling framework only** — design tokens + semantic mapping. No components, no TypeScript, no build step. See *Design system* |
| `packages/geo` | Pure geometry + zone capabilities — no I/O, no `@repo/db` |

Verify: `npx tsc --noEmit` per app, `npx vitest run` in `apps/backend` (**622 tests**). Migrations: `npx prisma migrate deploy` (`migrate dev` is non-interactive here; generate destructive ones with `migrate diff --from-config-datasource --to-schema`).

---

## Non-negotiable principles

**1. The backend is the source of truth.** The client displays what the server returned; it never re-derives an answer the server computed, and never computes one the server will later depend on. A number the client calculated is one a crafted request can change, and two implementations of a rule always drift. Client validation tells someone early — it never decides. Where a client mirrors a calculation for responsiveness, the comment says it is a preview and names the authoritative path.

**2. Money is integer minor units.** Always. The scale comes from `Currency.minorUnitDigits` and is **never assumed to be 2** (KES/USD 2, UGX/JPY 0, KWD 3). Columns are named `...Minor` so the unit cannot be mistaken. Float cannot hold 0.10 and every payment provider takes an integer.

**3. Rates are integer basis points.** `1600` = 16%. `CountryTaxRate.rateBps`, `commissionRateBps`, `percentBps`. Lets a statutory 7.5% be exact, and a rate multiplies money.

**4. Derive, don't store.** If every input is already on the row or on the clock, there is no second column. A stored copy needs a cron to stay true and can disagree with the rule it describes. Live examples: `getVendorGoLiveStatus`, `getOutletGoLiveStatus`, `getOutletMealPlanReadiness`, `deriveDiscountState`, `payoutReviewState`, `VendorLifecycleState`, `isGroupRequired` (= `minSelect >= 1`), outlet cuisines.
*When a derived state must be filtered in SQL, transcribe it clause by clause and guard the transcription with an agreement test* — see `lib/pricing/discount-state-filter.ts`.

**5. Modules own their tables.** A module meant to survive extraction never imports a sibling's internal lib. Cross-module access goes through the public `index.ts` barrel, which exports **resolution only**, never administration. **The vendor module never imports admin** (a leaf util writing `prisma.adminNotification` directly is the accepted workaround). Shared pure rules live in `lib/`, imported by both — never copied.

**6. Opaque ids 404, never 403.** Out of scope, suspended, unpublished, someone else's — all indistinguishable from not existing. A 403 makes the id space probeable.

**7. Controllers destructure the body field by field, never spread.** A spread lets a client set `isPublished`, `adminStatus`, `reviewStatus` or a funding field.

**8. Pure rules with unit tests before any Prisma.** `lib/pricing/*`, `lib/delivery/radius.ts`, `lib/time/*`, `vendor.placement.ts`, `vendor.modifiers.ts`, `customer.discovery.ts`. Arithmetic is then testable without a database and queries testable without arithmetic.

**9. Moderation flags detect and surface; they never refuse a save.** A vendor's write always succeeds. Flagged content is hidden from customers, and the word to a vendor is **"send back for revision"**, never "reject" — their next edit re-screens and re-queues it with no admin action.

**10. A ceiling only enforced on the way in is not a ceiling.** Re-clamp on read (`effectiveRadiusMeters`, `MAX_DISCOUNT_BPS`) — rows written before validation existed, or by a future path that skips it, must not be able to exceed policy.

**11. Never invent numbers for the people they describe.** Mock revenue is acceptable in the internal ERP; showing a vendor or customer fabricated figures about their own business is not. Say "this appears once orders are live" instead.

---

## Recurring bug classes — check these every time

1. **A new or renamed request-body field silently dropped.** Controllers map field by field, and the mapper is untyped. Has bitten four times: `taxCategoryId`, `proofDocument`, `deliveryRadius`, `newRateBps`. *Any new field must be added to the controller's mapper deliberately, and a smoke test must route a body through a copy of it.*
2. **Two identical keys in one Prisma `where` object** — the second silently overwrites the first. How a scope filter goes missing. Collect related narrowings into one clause.
3. **A work-queue "All" tab that is unreachable.** An absent query param is indistinguishable from a first visit, so the default re-applies. Emit an explicit `?status=all`.
4. **`.catch(() => null)` making a failure look like an empty list.** Every list page must distinguish *failed* / *empty in this tab* / *empty everywhere*.
5. **RSC boundary: only JSON-serializable props to client components.** Icons and formatters cross as *names*, never as component references. Typechecking cannot catch it.
6. **Prisma rejects `null` inside a compound-unique input** — and Postgres treats NULLs as distinct in a unique index, so such a constraint dedupes nothing. Use `deleteMany` + `createMany` in a transaction.
7. **`P2002` has two payload shapes.** Prisma 7 + `adapter-pg` nests columns at `meta.driverAdapterError.cause.constraint.fields`; `meta.target` is undefined. Always use `errors/prismaUnique.ts`.
8. **Wall-clock reads must use the subject's timezone.** `"HH:mm"` columns (operating hours, happy-hour windows) are local to the *outlet*. `lib/time/localClock.ts` is the only place a clock is read; `City.timezone` is required so it is always knowable.
9. **Tailwind v4**: `dark:` defaults to the media query — every app needs `@custom-variant dark (&:where(.dark, .dark *));` or vendored `dark:` utilities fire for dark-OS users. `@apply` accepts only real utilities, so shared component classes must be declared with `@utility`. Preflight drops the button pointer cursor — `cursor-pointer` is in the base Button class, but raw `<button>`s need it individually.
10. **A feature is unreachable until `pnpm db:seed` runs.** New permissions live in seed data; `syncSuperAdminPermissions()` is what grants them to an existing super admin.
11. **Compiler emit must never land next to sources.** `packages/ui` built with `tsc -b` and no `outDir`, littering `src/` with `.js` / `.d.ts` / `.d.ts.map`; a later sweep of those strays took the whole component directory with it and left all three frontends unable to resolve their imports — undetected because nothing typechecks a package with no TS. `.gitignore` now blocks `packages/*/src/**/*.js` and friends. Any new package that compiles needs an explicit `outDir`.
12. **A stale `.next/dev/types` produces syntax errors in files you did not write.** `Unterminated template literal` / `Declaration or statement expected` pointing into `.next/dev/types/{routes.d.ts,validator.ts}` is a corrupt cache, not a real error: `rm -rf .next && next typegen`. Do not go looking for the bug in your own code.

---

## Backend conventions

`routes/v1/*.routes.ts` → `controllers/*.controller.ts` → `services/*.service.ts`. Services hold the business logic and take an `AdminScopeContext` per call; controllers only map and delegate. Every mutation calls `auditService.log` (`entity.verb`) into the append-only `AuditLog`.

**Admin RBAC** is pool-based: `AdminRolePermission` = a role's ceiling, `AdminUserPermission` = individual grants within it. Roles: `super_admin`, `identity_admin`, `finance`, `vendor_ops`, `customer_care`, `courier_ops`, `operations_admin`. A `RECEIVE_ESCALATION` permission is always **ceiling-only** — granted individually to senior reviewers.

**Scope** (`AdminScopeContext`): `isGlobal` / `countryIds` / `cityIds` / optional **`tier`**. `REGION` does not exist. `buildScopeContext` folds a CITY scope's `countryId` into `countryIds`, so **a city admin is indistinguishable from a country admin by `countryIds` alone** — country-wide policy writes must gate on `tier` (`assertCountryPolicyScope`). `ROLE_SCOPE_RULES` decides which scopes a role may hold.
> **Open hole, same shape:** `assignVendorTypeToCountry` / `removeVendorTypeFromCountry` still lack the `tier` gate.

**Review workflows come in two strengths, and the choice is deliberate:**
- **Full claim / escalate / reassign** — applications, compliance cases, appeals, payout accounts. Used only where concurrent action has consequences (money, a formal dispute). `admin.vendor.compliance-case.service.ts` is the reference implementation; escalate is a *free pool*, reassign is *targeted*; acting requires holding the claim; the escalator is permanently locked out; `claimedFromEscalation` is terminal.
- **Plain approve / send-back** — outlets, profiles, meals. Two admins clearing the same food photo is a non-event.

**Uploads and secrets.**
- One pipeline everywhere: presign → XHR `PUT` to R2 → submit the `storageKey`. The bucket is **private**, so keys are named `...Key` (never `...Url`) and become short-lived signed URLs at a **single exit point** per domain (`presentVendorProfile`, `presentMenuItem`, `signKey`). A key rendered straight into an `<img src>` is a 403.
- Every key carries the owner's id (`meal-images/<vendorId>/…`, `profile-media/<kind>/<vendorId>/…`, `payout-docs/<method>/<vendorId>/…`). That segment is **load-bearing**: `assertOwned*Key` is what stops a discard endpoint being a delete-anything primitive — it must check the exact prefix, one segment after it, no traversal, and no prefix collision (`vendor-1` must not match `vendor-1-extra`). Filenames are uuids, never fixed, so a replacement never destroys the evidence a decision rested on.
- Payout identifiers are **AES-256-GCM at rest** with keyed-HMAC blind indexes for duplicate matching without decrypting. `presentPayoutAccount()` is the only exit to any client and returns masked values — a vendor never gets their own numbers back (Stripe's model). `decryptPayoutIdentifiers` is reachable from no route.

**Catalog pattern** (used six times): a global catalog + a per-country enablement table. `VendorType`, `Cuisine`, `DietaryTag`, `PaymentMethod`, `TaxCategory`. Catalog writes need GLOBAL scope; per-country availability needs only country scope. There is **no delete** — withdraw by status so history stays readable.

---

## Design system

**Three tiers. `@repo/ui` is the bottom two; personality is the app's.**

```
@repo/ui                    styles only — shipped as CSS, imported by every app
├── styles/tokens.css       raw primitives: neutral scale, warm-amber brand ramp,
│                           status + order-status colours, radii, shadows.
│                           No UI meaning. Never add an app-specific value here.
└── styles/base.css         primitives → semantic tokens (--primary, --card,
                            --muted, --border, --ring …) + a minimal reset
        │
        ├── admin-dashboard/app/globals.css    neutral, dense, operational
        ├── vendor-dashboard/app/globals.css   warm cream, hospitality
        └── customer-app/app/globals.css       Warm Editorial Marketplace
```

Each app's `globals.css` imports the two shared sheets, **overrides semantic
tokens** to set its personality, adds its own app-only tokens, and re-exports
everything into Tailwind through its `@theme` block. The three apps are
deliberately *not* meant to look alike — only to share the same brand ramp and
the same token vocabulary.

**shadcn components are per-app, never shared.** Every Next app owns
`components/ui/*.tsx` and its own `cn()` in `lib/utils.ts`, installs its own
Radix/cmdk/recharts dependencies, and has its own `components.json` (admin is
`radix-nova`, vendor and customer are `new-york`). This is deliberate: a shared
component library forces one app's variant decisions onto the other two, and
divergence showed up almost immediately — admin's Button and vendor's Button
had already drifted while both lived in `@repo/ui`. Because the primitives read
semantic tokens (`var(--primary)`, `var(--radius)`), each app's override block
re-skins them for free.

- **Never** add `@repo/ui/components/*` or `@repo/ui/lib/*` back. `@repo/ui` has
  no `.ts` files and no build script, on purpose.
- To add a primitive, run shadcn **inside the app that needs it**. Copying one
  in by hand is fine too — rewrite its imports to `@/components/ui/*` and
  `@/lib/utils`, and add the Radix dep to *that app's* `package.json`.
- Customer-specific visual semantics (display scale, photo ratios, section
  grounds, scrims) live in `apps/customer-app`, not in `@repo/ui`.

**The customer storefront's design language** lives entirely in
`apps/customer-app/app/globals.css`. Every colour in it was sampled from
`public/design-reference/design.png` and contrast-checked; the file comments say
where a value was moved and why. Before inventing a class, check what is already
there:

| | |
|---|---|
| Brand | `--db-amber-50…800`. **Hue 78 (golden)** — deliberately *not* `@repo/ui`'s hue-48–62 ramp, which reads orange. 500 = `#d99a1e` is the reference's exact button amber |
| Grounds | `--surface-cream` (page) · `-warm` (alternating band) · `-raised` (cards) · `-ink` (editorial band) · `-amber` (CTA band) |
| Type | `.heading-hero` (uppercase, fluid clamp) · `.heading-xl/lg/md` · `.eyebrow` · `.lede` · `.price` |
| Layout | `.shell` (gutter + max width) · `.band` / `.band-tight` (section rhythm) · `.full-bleed` · `.rail` · `h-nav` |
| Surfaces | `.surface` · `.surface-interactive` · `.photo-frame` · `.photo-zoom` · `.photo-scrim` · `.chip-*` |

Three contrast decisions are deliberate and must not be "corrected" back to the
mock: `--primary-foreground` is **ink, not white** (white on the brand amber is
2.44:1); `--muted-foreground` is darker than the mock's `#878580` (3.45:1); and
amber-as-text uses `--primary-text` (the 700 step), never the 500.

**Always use the mapped utility, never the arbitrary-value form.** `@theme
inline` exposes every semantic token, so it is `text-muted-foreground`, not
`text-[var(--muted-foreground)]`. The arbitrary form bypasses the map and a
token change stops propagating — the pre-existing components had accumulated 217
of them.

## Frontend conventions

- Server Components fetch through the app's own `adminFetch` / `backendFetch` / `publicFetch`; client mutations go through `app/api/**` route handlers that proxy. The Clerk token never reaches client JS.
- Pages are **short** and delegate to components; markup lives in `components/`.
- Light-only. No `next-themes`.
- Shared: `TableFilterBar` (extend via the generic `extraFilters`, never a new prop trio), `TablePagination`, `SearchableSelect`, `EmptyState`. `AlertDialog` for confirmations, `Sheet` for forms.
- Sidebar nav is permission-gated — links vanish rather than render-then-403. `isItemActive` needs a special case wherever a section "Home" href is a prefix of its siblings.
- Link-based pagination on SSR list pages (no JS needed). **Rebuild the whole query string** — a bare `?page=2` drops active filters.
- Mapbox is ~1.8 MB: always `next/dynamic` with `ssr: false`.

**customer-app only** (public, anonymous-first, performance-critical):
- `lib/api/server.ts` attaches a Clerk token **when one exists and never errors when it does not** — the mirror of the backend's `attachCustomerContext`. The dashboards' `backendFetch` throws instead; do not copy that here.
- Anything carrying a token is `cache: "no-store"`. Only an explicitly `anonymous` read may opt into ISR — a cached response must not depend on who asked.
- `proxy.ts` (Next 16's middleware) lists **protected** routes rather than exempting public ones, so a forgotten route stays public instead of leaking. Browsing, storefronts and cart pricing all work signed-out.
- The visitor's location lives in a **cookie**, so the feed is a plain server render with no mount-fetch waterfall. It is untrusted input — `parseLocation` range-checks it, and a saved address travels as `addressId` so the server resolves the point itself.
- Reads return a **state** (`no-location` / `ok` / `error`), never a bare throw or an empty array — see recurring bug class #4.
- `lib/format/money.ts` is the only place minor units become a decimal, and it reads `currency.minorUnitDigits`.
- Keep `"use client"` at the leaves. Today: `NavLinks`, `MobileNav`, `AuthActions`. The `Navbar` itself, cards, hero and menu are Server Components and must stay that way.

**Customer auth is modal-only, and that is a deliberate pair of decisions.**
- **No `/sign-in` or `/sign-up` route exists.** `AuthActions` uses Clerk's `<SignInButton mode="modal">` / `<SignUpButton mode="modal">`. Browsing, storefronts and cart pricing are all public, so someone signing in is *part-way through something* rather than stopped at a gate — a redirect loses their place, a modal returns it. Only orders, payments, subscriptions and order history will ever require an account.
  > `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` in `.env` still point at those non-existent routes. Harmless for the modal flow, but `auth.protect()` and `redirectToSignIn()` would 404 — build the pages or drop the vars when route protection lands.
- **`<ClerkProvider>` is NOT given `dynamic`.** It renders statically by default; passing `dynamic` resolves auth on the server and opts **every route** into dynamic rendering. So `<SignedIn>` / `<SignedOut>` resolve on the client, and `<ClerkLoading>` holds a same-size placeholder to stop the bar collapsing while Clerk boots. That is the right trade while visitors are mostly signed out. Verify with `next build` — `○ /`, never `ƒ /`.
- `<ClerkProvider>` goes **inside `<body>`**, per current Clerk docs (older docs wrapped `<html>`).
- Clerk's `appearance.variables` colours must be **literal hex, not `var(--token)`** — Clerk parses each one to derive its own shades and alpha variants and cannot do that with an unresolved custom property. `CLERK_APPEARANCE` in `app/layout.tsx` mirrors `globals.css` by hand and must be updated alongside it. `formButtonPrimary` is re-stated with our own classes because Clerk would otherwise put white on the brand amber (2.44:1).
- Clerk clones its button child to attach its own `onClick`, so a handler passed to that child is not guaranteed to survive. To run something alongside it (the mobile sheet closing before the modal opens — mandatory, since the sheet is a Radix dialog that traps focus), put the handler on a **wrapping element** and let the click bubble.

---

## Domain state

**Vendor** — country-scoped (`VendorAccount.countryId` set at approval, never changes). `VendorUser` is 1:1 (no multi-user orgs; `StaffRole` is an unwired placeholder). Banning is identity-level and independent of account status. Three tiers: **access** (not banned) → **authoring** (account ACTIVE — profile, outlets, payout, documents, menu, offers) → **commercial activation** (`canGoLive`, which needs a verified payout account). A merchant builds their menu while banking is pending — Uber Eats / DoorDash / Jumia all work this way.

**Geography** — `Country` → `City` (required `timezone`, validated against `Country.timezones`) → `Zone`. A **Zone is a capability container, not a delivery boundary**: `level` (`REGISTRATION_ONLY` → `MARKETPLACE` → `PLATFORM_DELIVERY` → `FULL_OPERATIONS`) × `operationalStatus` × record `status`. `ZONE_CAPABILITIES` is the one place a level becomes boolean flags — check the flag, never `level >= X`. `ServiceArea`/`DeliveryZone` are alive but frontend-less (courier-layer decision, not cleanup).

**Outlet** — three independent axes, never collapsed: `clearanceStatus` (capability) × `adminStatus` (health) × `reviewStatus` (moderation). `deliveryRadius` is the merchant's reach; the zone is the platform's permission. Both are required — see `lib/delivery/radius.ts`.

**Menu** — `MenuItem` (vendor-level catalog: the dish) → `Meal` (one dish at one outlet, carrying only what varies by location: `priceMinorOverride`, `isAvailable`). `MenuSection` is vendor-owned and ordered by authored `position`. `ModifierGroup`/`ModifierOption` are **one primitive** for variants and addons — the selection rule is the only difference. Composition order is fixed: `base + option deltas` → `− discount` → `± tax` → **commission on the discounted amount**.

**Tax** — its own module. `TaxCategory` (global) × `CountryTaxRate` (per country, `rateBps`, one `isStandard` enforced by a partial unique index) + `CountryTaxConfig` (inclusive/exclusive, remitter, local label). An unrated category falls back to the standard rate, **never to zero**. Vendors do not choose a tax category; the platform sells ready-cooked food only.

**Finance** — provider-agnostic. `PaymentProvider` (catalog) → `CountryProviderAccount` (per country + environment) → routed per **capability** by `resolveProviderGateway`. **No fallback, ever** — a missing route is an explicit config error. Cross-country routing is structurally impossible (composite same-country FKs). `bankVerificationMode` is `PROVIDER` or `MANUAL` (Kenya is MANUAL: no provider can resolve a KES bank account); the two paths never fall back to each other. Adapters: Flutterwave, dLocal (account validation only, Nigeria only).

**Discounts** — vendor-owned, merchant-funded. Two types (`PERCENTAGE_OFF_ITEMS`, `AMOUNT_OFF_ORDER`). State derived. Targeting is **explicit flags**, never inferred from an empty list. **Offers never stack** — the customer gets the single best one. Caps are recorded but **not enforced** (nothing increments them: no orders).

**Customer** — mostly public. Two auth chains: `customerAuthChain` (required — account, addresses) and `attachCustomerContext` (optional, never rejects — browsing, storefront, cart). A verified token with no row yet returns **503 `CUSTOMER_ACCOUNT_PENDING`**, not 401. Discovery = customer's point in a serviceable zone **AND** outlet cleared to sell **AND** within the outlet's radius, same city. `customer.visibility.ts` is the one definition of what a customer may see (FLAGGED content is hidden; `isAvailable: false` is shown greyed-out, not hidden). The cart is **stateless**: the client holds ids and quantities, the server prices from scratch every call.

---

## Current state

Everything through the **customer backend module + customer frontend scaffold** is shipped and verified. Latest migration: `20260913120000_drop_outlet_cuisine_and_repair_city_timezones`.

Verified green as of this pass: `pnpm check-types` 5/5, backend `vitest run` 622/622, `next build` clean in `customer-app`.

`apps/customer-app` builds and typechecks: discovery feed, storefront + menu, cart (client store + server pricing), Clerk sign-in/up, location-in-a-cookie so the feed is a real SSR render. **Awaiting the user's env values** (`BACKEND_API_URL`, a *separate* customer Clerk app, `CLERK_CUSTOMER_WEBHOOK_SECRET` on the backend → `<ngrok>/webhooks/clerk/customer`). `.env.example` documents each (placeholders — never commit a real key there).

**Design-system migration is complete.** `@repo/ui` was reduced to the two
stylesheets, and all 32 shadcn primitives now live per-app under
`components/ui/` with ~370 imports rewritten to `@/components/ui/*`. See
*Design system* for the rule and why. Every app typechecks against its own
primitives.

**The customer app was reset to a clean foundation** (explicit direction). Clerk,
the react-query provider and every fetch were removed so the shell could be
rebuilt properly; the discovery feed, storefront, cart, location picker and their
`lib/` modules were deleted with them. **All of it is recoverable from commit
`30facf5`** — recover rather than rewrite when those pages come back.

What exists now: `app/layout.tsx` (no Dynamic APIs), `Navbar` + `NavLinks` +
`MobileNav` + `AuthActions` + `Logo` under `components/layout/`, a blank
`app/page.tsx`, and the full design language in `app/globals.css`. Kept
deliberately: `lib/format/money.ts` (pure, encodes the minor-units rule) and the
shadcn primitives.

**Clerk is back, modal-only** — `proxy.ts` runs a bare `clerkMiddleware()` with
no route matcher, because nothing is protected yet. See *Frontend conventions →
Customer auth* for the two decisions that matter. Still unverified in a browser:
the modal's themed appearance, and the mobile sheet closing cleanly as the modal
opens.

**`/` is static.** The root layout reads no cookies and no auth, which is the
whole reason `next build` reports `○ /` instead of `ƒ /`. Anything added to the
root layout that touches `cookies()`, `headers()` or `auth()` makes **every route
in the app dynamic** — put it behind `<Suspense>` or in a route-group layout
instead. Verify with the build output, not by inspection.

**Next up on the customer app:** the eight landing bands from `design.png` (hero,
craving rail, popular, editorial band, meal plans, neighbourhood, CTA band, full
footer). Two decisions are still open — whether the feed moves to `/discover`
with `(marketing)` / `(shop)` route groups, and whether landing sections are a
fixed tree or a server-resolved block list (the latter is what the future
CITY → COUNTRY → GLOBAL promo resolution needs; `Serviceability` already returns
`cityId`/`cityName`).

`next dev` (Next 16) writes `AGENTS.md` and a one-line `CLAUDE.md` into each app
directory and re-creates them if deleted. They are framework notes, not project
rules — this file is the rulebook. Commit them or set `agentRules: false`.

**Data is entered by hand, not seeded** (explicit direction). Dev DB holds 1 vendor outlet, 1 dish, 0 consumers. Nairobi's two zones **do not tile the city** — an outlet placed outside them is correctly `AREA_NOT_LAUNCHED` and will not be discoverable.

### Next up
1. **The `Order` model** — the single largest schema decision left, and the blocker for: discount redemption and cap enforcement, commission actually charged, `resolvePayoutDestination` having somewhere to send money, `getOutletMealPlanReadiness` gating anything, and the vendor order feed. Design it deliberately *with* the Payments boundary rather than incidentally as whatever checkout needs.
2. **Payments module** — separate from tax and finance, per explicit direction. Finance keeps provider config/routing/credentials/adapters; Payments takes payment-intent/attempt/capture/refund orchestration, webhook reconciliation and `ProviderWebhookEvent`.
3. **Meal-plan cleanup, before orders** — `MealPlan` is outlet-scoped while `MenuItem` is vendor-scoped, and `MealPlanMeal` has **no day column** despite the concept being one meal per delivery day. Meal plans are this platform's differentiator; an Order model designed without them in view will need reshaping.

---

## Deferred — with the reason, so it isn't re-litigated

- **Reviews.** `Outlet.ratings` / `totalReviews` / `VendorProfile.averageRating` are read and displayed but **nothing writes them** — every rating is currently 0. No review model exists.
- **Persisted / cross-device cart** — storage on top of the existing pricing endpoint; belongs with orders.
- **PostGIS.** Discovery's distance filter runs in memory over a bounding-box prefilter, bounded by `MAX_CANDIDATE_SCAN` (2000). `ST_DWithin` is the named upgrade when a market outgrows it.
- **Address geocoding.** The customer location picker takes coordinates; a search box needs a provider key. The vendor dashboard's Mapbox picker is the component to lift.
- **Nested modifiers, per-outlet option pricing, drag-and-drop reordering, menu trading hours** (needs a `Menu` layer above `MenuSection`).
- **BOGO, platform-funded/co-funded campaigns, free delivery, promo codes, customer targeting, stacking.**
- **Sub-national tax rates.** Extension point is a nullable `cityId` + partial unique index; `resolveRateBps` is the only function that changes. No launch market needs it.
- **Vendor tax-registration status** — belongs to onboarding, which already captures the IDs.
- **Effective-dated commission schedules** — the scalar + audit-log model is sufficient; wait for a real pricing need.
- **Free-text "Other" category / vendor-created dietary tags.** Refused deliberately: a controlled vocabulary is what filters, facets and analytics run on, and a dietary tag is a *safety claim*. The right shape is a "request a tag" suggestion queue — not built.
- **KYC / PEP screening / data-retention tooling** — blocked on business and legal decisions, not on code. Do not invent a retention period.
- **City boundary/service-area Mapbox UI** and `Outlet.serviceMode` computation (`serviceMode`/`isUnzoned` were dropped as dead).
- **Admin-side image moderation** — needs an `ImageModerationProvider`.

### External-API pause points
Each is a hard stop where the user provisions keys; each is then one adapter file behind an existing seam.
**Payment execution** (collection + payout providers, encrypted per-country credentials, internal ledger, idempotency, webhooks) · **Email** (`sendEmail` is the seam; swap SMTP for Resend/Postmark/SES) · **Content moderation** (`ContentModerationProvider`; `bad-words` is the current impl) · **Image moderation** (new interface needed) · **Document OCR** (new interface + `expiryDateSource`/`expiryDateConfidence` fields).

---

## Working agreement

Recon before building. Push back when the request is wrong, and say why. Copy Uber Eats / DoorDash / Bolt Food where a convention already exists — meal plans are the one part that is genuinely ours. Ask when two readings would produce materially different work; otherwise decide, state the assumption, and proceed.

**A feature is not done because it typechecks.** Every pass ends with: typecheck all apps, `vitest run`, and a **smoke test against the dev database that exercises every new Prisma query and cleans up after itself** — sweeping strays from an aborted earlier run before it starts. Assert on the *reason* a thing failed, not merely that it did: a test that passes because an unrelated error leaked is a test that proves nothing.
