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

**Two object-storage buckets, and the split is a security boundary.** R2 grants
public access per BUCKET — there is no per-prefix switch and no per-object
public flag — so a public path inside the private bucket would publish every
payout proof and identity document in it.
| Bucket | Env | Holds |
|---|---|---|
| private | `R2_BUCKET_NAME` | documents, payout proofs, menu photos, **and every original an admin uploads**. Leaves only as a short-lived signed URL |
| public | `R2_PUBLIC_*` | marketing derivatives **this server produced**, uuid-named, `max-age=31536000, immutable` |
Nothing a user uploaded is ever served byte for byte. `lib/storage/publicMedia.storage.ts`
is the only writer to the public bucket and `publicUrl()` is the only place a key
becomes a URL.

Verify: `pnpm check-types` (5/5), `npx vitest run` in `apps/backend` (**666 tests**), and the smoke scripts in `apps/backend/scripts/smoke/` (`pnpm dlx tsx --env-file=.env scripts/smoke/<name>.ts`). Migrations: `npx prisma migrate deploy` (`migrate dev` is non-interactive here; generate destructive ones with `migrate diff --from-config-datasource --to-schema`).

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

## Marketing module — storefront merchandising

`modules/marketing` owns `HeroPromotion`. **Its own module, not part of admin**,
for the same reason tax and finance are: the table is WRITTEN by admins and READ
by the customer storefront, and `modules/customer` imports no sibling except a
module barrel for resolution. Putting it in admin would force
customer → admin, the one dependency direction this codebase refuses. The barrel
exports **resolution only** and mounts `marketingAdminRouter` under the admin v1
router, exactly like `taxAdminRouter`.

**`HeroPromotion`, not `HeroOffer`.** "Offer" already means a funded `Discount`
with redemption rules and caps. This is a marketing SLOT — image, copy, link.
The planned next use is vendors paying to have a meal featured, which is a
promotion, not a discount. Extension point when that lands: nullable
`vendorId`/`menuItemId` plus a funding column. Nothing speculative is modelled.

**Resolution is CITY → COUNTRY → GLOBAL**, most specific wins, ties broken by
`priority` then newest `publishedAt`. `resolveHeroPromotion()` is the pure rule;
the SQL pre-filter orders by the same columns, and the pure function is what
makes that transcription testable (principle 4). Perth never sees Berlin's, and
an unknown visitor location matches nothing city-scoped.

**Images: re-encoding IS the sanitiser** (`lib/images/transform.ts`). Admins
upload JPEG, PNG, WebP or AVIF — **never SVG**, which can carry script. The
server decodes and re-encodes, which strips EXIF (a phone photo carries the GPS
coordinates where it was taken), destroys polyglot files, and drops metadata
chunks with a history of bad parsing. The DECODED format is the truth; a
declared content type is only a claim. `limitInputPixels` is the
decompression-bomb guard — a 3 MB PNG can decode to gigabytes, long before any
byte check fires.

**One square derivative, 1600 × 1600 WebP.** The hero is a square card, so one
image serves every screen and there is no art direction. Stored as WebP, not
AVIF: this is a master that `next/image` re-encodes per browser and width, and
AVIF is a slow-to-decode delivery format. The visitor still gets AVIF — Next
makes it. A second crop belongs here only if the hero ever becomes full-bleed.

**Public keys are uuid-named and never reused.** Replacing an image writes a new
key, which is what makes `immutable` caching safe and means no CDN purge is ever
needed. `assertHeroOriginalKey` / `assertHeroPublicKey` are what stop "process
this key" being a copy-anything-into-the-public-bucket primitive.

**RBAC needs nothing module-specific.** `adminRouter.use(...adminAuthChain)`
runs before `/v1` is mounted, so every router inside it — marketing, tax,
finance — gets verifyAdminToken → loadAdminUser → checkIsActive →
loadPermissions → buildScopeContext. By the time a handler runs,
`req.adminPermissions` and `req.adminScope` are freshly derived from Postgres
for THAT request; nothing is read from the JWT, so a permission change takes
effect on the next request with no session to revoke. **Confirmed: tax and
finance already inherit this and needed no change.**

Three permissions, because they are three kinds of trust: `:read` (see what is
scheduled), `:manage` (write drafts, upload imagery), `:publish` (change what
customers see, or withdraw it). Geographic scope is enforced per call in the
SERVICE, never in the router — a route cannot know whether the body names a
city the caller holds.

**A GLOBAL promotion that names a place is refused, not silently stripped.**
Found by the smoke test: `countryRef` on a global promotion was being ignored,
which would have handed the caller a reach they did not ask for. Same class as
a request field that never reaches its mapper.

**`presentHeroPromotion` degrades rather than throws** when the public bucket is
unconfigured. A read crashing over a deployment concern is far worse than a
missing picture; it logs a warning naming the exact cause.

**The customer endpoint takes no identity at all** — not even
`attachCustomerContext`. `GET /api/customer/v1/hero-promotion?cityId&countryId`
depends only on WHERE a visitor is, so it is identical for signed-in and
signed-out visitors and cacheable per location. Verifying a token we would then
ignore would cost a round trip and make the response look person-specific when
it is not. Both ids are shape-checked; an unrecognised one simply matches
nothing and falls through to the global default.

**`getHeroContent()` passes `anonymous: true`, and that is load-bearing.** It
skips the Clerk lookup, which is what keeps `/` a STATIC route (`○ /` with a
5-minute revalidate). Reading auth or cookies in that path would make **every**
page in the app dynamic. When city/country scoping lands, the location must
come from somewhere that does not force a dynamic render, or `/` changes class —
decide that deliberately.

> **The customer app's `BACKEND_API_URL` has NO `/api` suffix; the ERP's does.**
> So customer-app paths are written `/api/customer/v1/…` and ERP paths
> `/admin/v1/…`. Getting this wrong fails as a 404 wrapped in a generic
> "Something went wrong".

**The hero falls back to a built-in default** when nothing is scheduled, when the
promotion has no usable image, or when the backend is unreachable — and logs the
reason in the last case. That is a real default, not a hidden error: a landing
page with no hero is broken, and unlike a list of results a marketing slot has a
meaningful "nothing scheduled" answer. The fallback's invented figures are
dropped the moment a real promotion renders.

**Processing is synchronous, deliberately.** There is no queue in this project
(no Redis, no BullMQ). Two crops of one photo is 1–3 s and an admin gets a
finished image instead of a pending state to poll. Add a queue when thousands of
vendor photos need it, not for this.

> **Setting up the public bucket** (one-time, by hand in Cloudflare):
> 1. R2 → Create bucket, e.g. `dailybread-public`, same region as the private one.
> 2. Settings → **Public access** → connect a custom domain (e.g. `img.dailybread.com`).
>    Use a real domain, **not** the `r2.dev` subdomain — it is rate-limited and not for production.
> 3. Manage API tokens → a token scoped to **this bucket only**, Object Read & Write.
> 4. Fill the blank `R2_PUBLIC_*` values in `apps/backend/.env`. `R2_PUBLIC_CDN_URL`
>    is the custom domain, **not** the S3 endpoint.
> 5. Add that host to `remotePatterns` in `apps/customer-app/next.config.js`.
> 6. On the PRIVATE bucket, add a lifecycle rule deleting `marketing/hero-originals/`
>    objects older than N days **only if** you decide not to keep originals for re-crops;
>    otherwise add one for abandoned uploads once the upload flow exists.
>
> Every `R2_PUBLIC_*` var is optional and defaults to empty on purpose, so nobody
> working on another module is blocked. `publicMediaStorage.assertConfigured()`
> fails loudly on the one code path that needs it.

> **On replacing R2 later** (analysis, not built). Everything is plain S3 API, so
> another S3-compatible store is an endpoint + credential change. What would
> actually cost work: (1) the public URL shape, which is why `publicUrl()` exists
> and nothing outside it concatenates a URL; (2) presigned-PUT CORS, configured
> per provider by hand; (3) **nothing in the database** — it stores KEYS, never
> URLs, so a move re-points a base URL instead of rewriting rows. Keep it that
> way: persist a full URL anywhere and the provider is welded in. A shared
> `ObjectStore` interface over both buckets is the natural step when a second
> provider is real.

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
| Brand | A **10-step ramp**, `--brand-50…900`, declared once as theme-INDEPENDENT primitives and exposed as `bg-brand-400`, `text-brand-700`, `border-brand-400`… Step **400 = `#fd9a4c`** is the brand orange. Every semantic token picks a step — nothing reaches for a raw oklch. Deliberately shadows `@repo/ui`'s `--color-brand-*` inside this app |
| Grounds | `--surface-base` (page) · `-subtle` (alternating band) · `-raised` (cards) · `-ink` (editorial band) · `-brand` (CTA band). Renamed from the old cream/warm/amber names, which described a palette this app no longer has |
| Type | `.heading-hero` (uppercase, fluid clamp) · `.heading-xl/lg/md` · `.eyebrow` · `.lede` · `.price` |
| Layout | `.shell` (gutter + max width) · `.band` / `.band-tight` (section rhythm) · `.full-bleed` · `.rail` · `h-nav` |
| Surfaces | `.surface` · `.surface-interactive` · `.photo-frame` · `.photo-zoom` · `.photo-scrim` · `.chip-*` |

Three contrast decisions are deliberate and must not be "corrected":

- `--primary-foreground` is **near-black, not white**. White on `#fd9a4c` is
  2.1:1; `dark-theme.jpg` does use white on its orange and it is the one thing
  in that image not worth copying. Near-black is 9.29:1.
- **`--ring` is NOT `--primary`.** A focus ring must clear 3:1 against whatever
  it is drawn over, and the light orange manages only 2.1:1 on a white field —
  an all-but-invisible focus indicator. Light mode rings in a deeper orange
  (`#e26b09`, 3.31:1 on white); dark mode rings in the primary, already 9.29:1
  there. Clerk's shadcn theme draws its ring at 50% opacity, which undoes this,
  so the root layout overrides it with `variables: { colorRing: "var(--ring)" }`.
- `--muted-foreground` is tuned against `--surface-subtle`, the *darkest* light
  ground, not the page.

> **Known trade in the light theme.** A pale fill on a near-white page has low
> BOUNDARY contrast: `#fd9a4c` against the light page is **1.94:1**, under the
> 3:1 WCAG 1.4.11 asks of a UI component's edge. The button's LABEL is far above
> AA so the control is readable; it is the outline that is soft. Accepted
> deliberately for the look. The honest fixes if it ever matters are a hairline
> border on light-theme filled buttons, or a deeper `--primary` for `:root`
> only — never a lighter label, which trades a real failure for a worse one.

**The palette is SAMPLED, not invented.** `public/design-reference/dark-theme.jpg`
was decoded with `sharp`, its pixels clustered, and the dominant colours
converted to oklch. The dark theme's every ground is that image's actual value:
page `#0a0b0d` · band `#161719` · card `#222325` · raised `#2e3133` · border
`#3b3f42` · text `#fafafb` · muted `#aaabae`. Re-run that sampling rather than
guessing if it ever needs revisiting.

Three facts came out of it and the whole file rests on them:
1. **The greys are COOL, not warm** — hue ~240–264, a blue-grey. Cool grey
   against a hot orange is what makes the reference read as elegant rather than
   cosy. Earlier passes used a warm brown and it read muddy. Hue 264 is also
   `@repo/ui`'s own neutral hue, so all three apps share a neutral family free.
2. **One orange, both themes** (see the table above).
3. **The separations are wider than they look** — card/page `1.25:1`,
   border/card `1.48:1`. Earlier passes had 1.17 and 1.41 and read flat; those
   two numbers are what "beautiful contrast" turned out to mean.

**The light theme is that palette mirrored**, not a separate design: same cool
neutral hue, same orange, same role per token, only the lightness axis flipped.

The dark palette is a `.dark` class block in `apps/customer-app/app/globals.css`
only — never in `@repo/ui`, whose comment explains why.
`@custom-variant dark (&:is(.dark *))` — the two dashboards still pin the
variant to a class nothing sets, which keeps shadcn's `dark:` utilities inert
there.

**The two references have different jobs, and neither is authoritative for
everything.** Settled by explicit direction:

| | |
|---|---|
| `design.png` | **STRUCTURE** — what the landing page is made of and how it is organised: the eight bands, section rhythm, card shapes, grid, density. Both themes. |
| `dark-theme.jpg` | **COLOUR** — the palette, sampled. Both themes: dark is its values directly, light is that palette mirrored. |
| `mobile-dark-theme.jpg` | Secondary colour reference; same family. |

Neither is copied wholesale. design.png's *cream* is not the light theme — the
light theme is cool grey, matching dark, so the pair reads as one identity in
two modes rather than two identities. What survives of design.png's warmth is
the food photography (which reads better against cool grey than against cream,
because the ground stops competing with it), the pale-peach `--surface-brand`
CTA band, and the orange itself.

**Typography is a deliberate two-face split** (explicit direction): **Playfair
Display for display headings, Inter for body and UI.** design.png's serif is the
strongest piece of brand personality it has, and a display serif on cool grey
with an orange accent is what keeps the storefront from looking like every other
delivery template. `--font-display` / `--font-sans` in `@theme inline` are the
only two faces; `.heading-hero|xl|lg|md` and the bare `h1, h2, h3` default carry
the serif, everything else is Inter.
> Watch `.heading-md` (1.125rem) on the dark ground. Playfair is a HIGH-CONTRAST
> serif — its hairlines get fragile at small sizes on a near-black page. If it
> shimmers or disappears in the browser, that class is the one to move to Inter
> semibold; the larger steps are not at risk.

> **`--color-input` maps to `--input-border`, not `--input`.** shadcn primitives
> use `border-input` and `dark:bg-input/30`, and in shadcn's vocabulary
> `--input` means the input's BORDER. `@repo/ui` uses it for the input's
> BACKGROUND. Mapping it straight through emitted
> `.border-input { border-color: white }` — an invisible border on every form
> control. The fill is exposed as `--color-input-background` for anything that
> genuinely wants it.

Two things in that file are load-bearing and easy to undo by accident. The
radius scale **must live in `@theme inline`**, not `:root` — an earlier version
set `--radius-sm/md/lg` on `:root` where Tailwind never read them and
`rounded-md` silently kept its stock value. And the whole shadow scale resolves
through `--shadow-color`, warm in light mode and black in dark, so re-tinting
every shadow is two values.

**Always use the mapped utility, never the arbitrary-value form.** `@theme
inline` exposes every semantic token, so it is `text-muted-foreground`, not
`text-[var(--muted-foreground)]`. The arbitrary form bypasses the map and a
token change stops propagating — the pre-existing components had accumulated 217
of them.

## Frontend conventions

- Server Components fetch through the app's own `adminFetch` / `backendFetch` / `publicFetch`; client mutations go through `app/api/**` route handlers that proxy. The Clerk token never reaches client JS.
- Pages are **short** and delegate to components; markup lives in `components/`.
- The two dashboards are **light-only**. `customer-app` has light/dark/system
  through its **own** provider in `components/themes/theme-provider.tsx` —
  `next-themes` was removed and **should not be added back**. It renders its
  blocking `<script>` *inside* the React tree from a Client Component, which
  React 19 / Next 16 warns on ("Encountered a script tag while rendering React
  component"), and 0.4.6 (the latest release) has no prop to disable it — the
  warning is structural, not a misconfiguration. `<ThemeScript />` is rendered
  by the **server** layout as the first child of `<body>` instead, so it is in
  the HTML, runs before first paint, and is never re-rendered on the client.
  Anything reading the theme imports `useTheme` from that file. The shadcn docs
  still recommend next-themes and that remains good advice elsewhere; only the
  script placement is what fails here.
- **Link lists live in `constants/links/`** — `nav-links.ts` (navbar + mobile sheet,
  one source so the two can never diverge) and `footer-links.ts`. Components
  import them; they do not define them.
- **Images: `formats: ["image/avif", "image/webp"]`** in `next.config.js`. Next
  negotiates per request from the `Accept` header, so nothing breaks on an old
  client. AVIF is ~20-30% smaller than WebP at matched quality and about half of
  JPEG; the encode cost is paid once per (image, width, quality) and cached.
  **Upload/store a JPEG or WebP master** (max ~2560px on the long edge, q85-90)
  and let the optimiser derive the rest — never store per-size derivatives, and
  never store AVIF as the master (it is a delivery format, slow to re-encode
  from). Store a ~20px `blurDataURL` beside each record: a remote signed URL
  cannot use a static import, so that LQIP is the only way to get
  `placeholder="blur"` on hero imagery.
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
- Keep `"use client"` at the leaves. Today: `Navbar`, `NavLinks`, `MobileNav`, `ThemeToggle`. Cards, hero and menu are Server Components and must stay that way. `Navbar` is the one deliberate exception — see *Customer auth*.
- **Pages start with a fragment.** `<main>` in the root layout carries `.shell` (centred max-width + responsive side gutters) and `flex flex-1 flex-col`, so a page never repeats that wrapper. Vertical spacing is the page's own business. A section that must span the full screen width uses `.full-bleed`; `body` has `overflow-x: clip` so that 100vw section never adds a sideways scroll (`clip`, not `hidden`, which would break the sticky navbar).

**Customer auth is route-based**, on `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` — the optional catch-all is required, because Clerk routes its own multi-step flow (second factor, email code, reset) onto child paths. `<SignInButton>` / `<SignUpButton>` use their default **redirect** mode, and `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` point at those pages. Those two routes build as `ƒ`; other pages stay `○`.
  > This supersedes an earlier modal-only decision, on explicit direction. Switching back is `mode="modal"` on the buttons — and then the mobile sheet must close before the modal opens, because the sheet is a Radix dialog that blocks everything outside it.

**Clerk is used as its docs show — plain components, no wrapper components** (explicit direction; same as the vendor and admin dashboards).
- **Theme: Clerk's official shadcn theme.** `import { shadcn } from "@clerk/ui/themes"` → `<ClerkProvider appearance={{ theme: shadcn, … }}>` in the root layout, plus `@import "@clerk/ui/themes/shadcn.css"` in `globals.css`. It reads our semantic tokens (`--primary`, `--card`, `--input`, `--ring`…) so every Clerk surface follows light/dark with no code of ours. **Retune Clerk by changing tokens in `globals.css`**, not Clerk props.
  > This replaced a hand-maintained file of hex values plus a per-component `useTheme` hook. The old rule that Clerk `variables` "must be literal hex" is **obsolete for Clerk v7**: the official theme is built from `var(--…)` and `color-mix()`.
- **`Navbar` is a Client Component, on purpose.** `<Show>` from `@clerk/nextjs` has two versions: from a Server Component it runs `await auth()`, which reads request headers and makes **every page that renders it dynamic**; from a Client Component it reads the session in the browser and pages stay static. The navbar is in the root layout, so this decides whether the whole app is `○` or `ƒ`.
- **`<ClerkProvider>` is NOT given `dynamic`**, for the same reason. It goes inside `<body>`.
- **Clerk has no built-in skeleton.** Use its two slots for your own placeholder: `<ClerkLoading>` (the navbar and sheet) and the `fallback` prop on `<SignIn>` / `<SignUp>` / `<UserButton>`. Size the placeholder like the real thing so nothing jumps.
- **No `<UserButton>` inside the mobile sheet.** Its menu opens in a portal outside the sheet, and the sheet blocks clicks outside itself, so the menu would be unusable. The sheet shows `<UserAvatar>` + `<SignOutButton>`; the desktop bar keeps `<UserButton>`.
- Clerk copies its child button to attach its own click handler, so a handler put on that child may be dropped. To run something as well (closing the sheet), put the handler on a **wrapping element** and let the click bubble — `SheetFooter` does this.

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
`MobileNav` + `Footer` + `Logo` under `components/layout/`, and the full design
language in `app/globals.css`. Kept
deliberately: `lib/format/money.ts` (pure, encodes the minor-units rule) and the
shadcn primitives.

**Clerk is route-based and themed** — `proxy.ts` runs a bare `clerkMiddleware()`
with no route matcher, because nothing is protected yet. `/sign-in` and
`/sign-up` are real pages. See *Frontend conventions → Customer auth* for the
decisions that matter, including why the appearance cannot sit on the provider.

**One root layout, no route groups** (explicit direction — do not reintroduce
them). `app/layout.tsx` renders `ThemeScript` → `ThemeProvider` →
`ClerkProvider` (per Clerk's Next.js docs, inside `<body>`) → skip link,
`Navbar`, `<main>`, `Footer`. Every page shares that navbar and footer, and
`not-found.tsx` gets them for free. A route-group split that kept Clerk off the
landing page was built and then reverted as over-engineering for this stage —
see *Deferred* for the measured cost if it ever needs revisiting.

**`/` is the landing page, built band by band** (explicit direction, superseding
the earlier "no `/` page" note). `design.png` decides the arrangement; the theme
stays ours. Rules:
- `app/page.tsx` only imports and renders section components — no data
  fetching, no client code.
- Each section lives in `components/home/<section>/` and loads its own content
  through an `async get<Section>Content()` in `constants/home/<section>-content.ts`. It returns
  static placeholder data today, in the shape the ERP will return later, so
  connecting the database changes that one function body and nothing else.
- Placeholder photography is from Pexels (`images.pexels.com` is allowed in
  `next.config.js` — remove it when nothing uses it). Every URL was downloaded
  and looked at before use; don't add one unseen.
- **Placeholder figures and offers must not ship.** The hero's "10,000+ happy
  food lovers" and its "20% off" offer are invented for layout.

**All landing sections exist with static data**, in `design.png` order: `Hero`,
`Categories`, `PopularDishes`, `EditorialBand`, `MealPlans`,
`NeighbourhoodKitchens`, `CtaBand` (+ the layout's `Footer`). Shared: `SectionHeader`,
and `constants/home/placeholder-data.ts` (`pexels()` + a KES placeholder currency —
delete it when nothing uses it). Card rows are a sideways-swipe `.rail` on phones
and a CSS grid from tablet up, so there are **no carousel arrows and no client
JS**. Full-width tinted bands use `.full-bleed` with an inner `.shell`.
Placeholder ratings, prices and dishes are invented; nothing writes ratings yet.

**Hero (`components/home/hero/`)** — done, awaiting review. Text, address
search (`next/form` GET to `/discover?location=…`, works without JS) and avatar
row on the left; a square photo with a floating offer card on the right; stacked
text-first on phones. The photo uses `loading="eager"` + `fetchPriority="high"`,
not `preload`: on phones it starts below the fold. Served as AVIF, ~57 KB at
640px wide. **Image spec:** square **1600 × 1600**, JPEG or WebP at q85–90,
under ~600 KB, food centred and kept out of the bottom-left third (the offer
card covers it). One square image serves every screen size, so no separate
mobile crop is needed while the frame is square. `/discover` does not exist yet.

**The navbar, footer, layout and both auth pages are styled, in light and dark.**
The mobile sheet is: header (logo + close) → "Menu" links with icons → an
"Appearance" Light/Dark/System segmented control (a dropdown inside a dialog is
awkward on a phone) → a footer with the auth actions.

**Verified this pass:** `pnpm check-types` 5/5, backend `vitest run` 622/622,
`next build` clean with pages static, and the compiled CSS checked directly for
layer order (`theme → base → clerk → components → utilities`), for the `.dark`
block landing after `:root`, and for `rounded-md` resolving through `--radius`.
**Not yet verified in a browser** — every visual claim here is arithmetic and
build output, not pixels: the themed Clerk forms, the toggle's icon cross-fade,
and the sheet's footer on a short viewport.

**Pages are static.** The root layout reads no cookies and no auth, which is
why `next build` reports pages as `○` rather than `ƒ`. Anything added to the
root layout that touches `cookies()`, `headers()` or `auth()` makes **every route
in the app dynamic** — put it behind `<Suspense>` instead. Verify with the build
output, not by inspection.

**Next:** make each landing section live, one at a time, starting with the hero.

`public/design-reference/` now holds three files: `design.png` (the light
landing page), `dark-theme.jpg` (the dark palette's source — near-neutral
grounds, vivid orange) and `mobile-dark-theme.jpg`. Retuning the dark theme is
editing the `.dark` block in `globals.css` — Clerk follows automatically.

**The footer is built and shipped.** `Footer.tsx` + `constants/footer-links.ts`,
a Server Component on `--surface-subtle` so it ends the page rather than running
on from the page ground above it. **Every href is `"#"`** until those pages exist; replace
them group by group in the data file.

`next dev` (Next 16) writes `AGENTS.md` and a one-line `CLAUDE.md` into each app
directory and re-creates them if deleted. They are framework notes, not project
rules — this file is the rulebook. Commit them or set `agentRules: false`.

**Data is entered by hand, not seeded** (explicit direction). Dev DB holds 1 vendor outlet, 1 dish, 0 consumers. Nairobi's two zones **do not tile the city** — an outlet placed outside them is correctly `AREA_NOT_LAUNCHED` and will not be discoverable.

### Hero offers — the shape to build toward
The hero is **offer content resolved per location**, not a fixed image. Admins
set offers in the ERP and resolution is a **CITY → COUNTRY → GLOBAL** fallback:
show the city's offer; if there is none, the country's; if none, the global
default. A visitor in Perth must never see Berlin's offer, and Perth and Sydney
can differ within the same country.

Build order (explicit direction): **static image first, then global defaults,
then the scoped resolution.** `Serviceability` already returns
`cityId`/`cityName`, which is the input the resolver needs.

Notes for when it lands:
- It is the **LCP element**. `priority`, a correct `sizes`, and no layout shift.
- A remote signed URL cannot use a static import, so width/height and
  `blurDataURL` must come from the offer record — store them at upload time.
- Resolution happens on the SERVER (principle 1). The client renders what came
  back; it never picks between city and country itself.
- Art direction: a wide desktop crop and a taller mobile crop are different
  images, not one image at two sizes. Budget for both fields on the offer.

### Next up
1. **The `Order` model** — the single largest schema decision left, and the blocker for: discount redemption and cap enforcement, commission actually charged, `resolvePayoutDestination` having somewhere to send money, `getOutletMealPlanReadiness` gating anything, and the vendor order feed. Design it deliberately *with* the Payments boundary rather than incidentally as whatever checkout needs.
2. **Payments module** — separate from tax and finance, per explicit direction. Finance keeps provider config/routing/credentials/adapters; Payments takes payment-intent/attempt/capture/refund orchestration, webhook reconciliation and `ProviderWebhookEvent`.
3. **Meal-plan cleanup, before orders** — `MealPlan` is outlet-scoped while `MenuItem` is vendor-scoped, and `MealPlanMeal` has **no day column** despite the concept being one meal per delivery day. Meal plans are this platform's differentiator; an Order model designed without them in view will need reshaping.

---

## Deferred — with the reason, so it isn't re-litigated

- **Keeping `ClerkProvider` off pages that don't need auth.** Measured on the
  old landing page: 938 KB of JS with Clerk in the root layout, 681 KB without —
  `ClerkProvider` itself ~176 KB, Clerk's UI components ~82 KB, so lazy-loading
  the buttons alone recovers under a third. Deferred as over-engineering for now
  (explicit direction). To measure again, sum the `<script src>` files in
  `.next/server/app/<route>.html` — **not** `build-manifest.json`, which lists
  shared chunks and shows no difference.
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
