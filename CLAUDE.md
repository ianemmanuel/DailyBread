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
| private | `R2_BUCKET_NAME` | documents, payout proofs, **every original an admin or vendor uploads** (menu-photo originals included). Leaves only as a short-lived signed URL |
| public | `R2_PUBLIC_*` | derivatives **this server produced** (marketing, cuisine tiles, menu-photo WebP masters, vendor-menu logos), uuid-named, `max-age=31536000, immutable` |
Nothing a user uploaded is ever served byte for byte. `lib/storage/publicMedia.storage.ts`
is the only writer to the public bucket and `publicUrl()` is the only place a key
becomes a URL.

Verify: `pnpm check-types` (5/5), `npx vitest run` in `apps/backend` (**892 tests**) and in `apps/vendor-dashboard` (**68 tests**; jsdom tests opt in per file with `// @vitest-environment jsdom`), and the smoke scripts in `apps/backend/scripts/smoke/` (`pnpm dlx tsx --env-file=.env scripts/smoke/<name>.ts`). Migrations: `npx prisma migrate deploy` (`migrate dev` is non-interactive here; generate destructive ones with `migrate diff --from-config-datasource --to-schema`).

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
12. **Client-only state that changes the TREE SHAPE is a hydration bug, not a styling one.** The ERP sidebar stored its collapsed state in `localStorage`, and `SidebarNav` renders a `<Popover>` + `<Tooltip>` per section *only when collapsed* — both call Radix's `useId`. The server always rendered the expanded tree, the client switched after mount, and every generated id downstream shifted: it surfaced as `aria-controls` mismatching on the **mobile sheet's trigger**, a component with nothing to do with the sidebar's width. Fixed by moving the preference to a **cookie**, which travels with the request so the server renders what the client will hydrate (and which also killed a real flash of an expanded sidebar on every load). Rule: if a persisted preference changes *which components render*, it must reach the server — `localStorage` can only carry preferences that change CSS.
13. **A stale `.next/dev/types` produces syntax errors in files you did not write.** `Unterminated template literal` / `Declaration or statement expected` pointing into `.next/dev/types/{routes.d.ts,validator.ts}` is a corrupt cache, not a real error: `rm -rf .next && next typegen`. Do not go looking for the bug in your own code.
15. **A trailing slash on a Clerk ISSUER rejects every token, and says only "Unauthorized".** `verifyClerkJwt` matches the token's `iss` claim against the configured issuer by EXACT STRING, so `https://x.clerk.accounts.dev/` and `https://x.clerk.accounts.dev` are different issuers. `CLERK_CUSTOMER_ISSUER` was pasted with the slash; every customer token failed as "Untrusted Clerk issuer" and surfaced in the browser as a bare 401 on the first authenticated call, with nothing pointing at config. **The webhook working proves nothing about this** — webhooks are verified by svix secret and never touch the issuer. `canonicalIssuer()` in **env.ts** now strips trailing slashes as the value is parsed (unit-tested), so the paste is tolerated and the rest of the app only ever sees a canonical issuer — the same place, and the same reasoning, as the `R2_PUBLIC_ENDPOINT` guard. The comparison in `verifyClerkJwt` stays an exact string match on purpose. To check an instance's true issuer: `curl https://<domain>/.well-known/openid-configuration`, or base64-decode the publishable key (`pk_test_<base64 domain>$`) — the domain is in the key.

16. **A cookie value encoded twice is unreadable in the browser, and nothing errors.** Next's `cookies().set` / `res.cookies.set` percent-encode the value and the server-side readers decode it; our serialisers ALSO ran `encodeURIComponent`, so the stored value was double-encoded. The server tolerated it (it decoded twice), but `document.cookie` sees the raw value, so every browser-side reader parsed `%7B…` as JSON, failed, and silently read "nothing" — the old market bar could never show a selected address for exactly this reason. Serialise as **plain JSON**; `readJson` in `lib/location/cookie.ts` parses both forms. Assert a round trip through `encodeURIComponent` (as `scripts/check-market-rules.ts` does) whenever a cookie is read on both sides.

17. **A machine clock running fast breaks Clerk sign-in with a BLANK page and no error.** Clerk session tokens live ~60 s, so a dev box more than that ahead of real time sees every fresh token as already expired; the middleware's refresh then loops and Clerk gives up, leaving an empty page after a "successful" sign-in. Seen at +82 s when Windows Time stopped syncing with the domain server. The tell is in `apps/<app>/.next/dev/logs/next-development.log`: `Clock skew detected … JWT is expired` followed by `Refreshing the session token resulted in an infinite redirect loop` — the latter blames "keys do not match", which is a red herring here. Compare `date -u` with `curl -sI https://api.clerk.com | grep -i date`; fix the CLOCK (`w32tm /resync /force`, elevated), never by raising `clockSkewInMs`, which only weakens expiry checks and leaves the backend's JWT verification rejecting the same tokens.

18. **`revalidateTag(tag, "default")` does not make the next render fresh — in Next 16 it only marks the tag STALE.** A named profile keeps that profile's `expire` (INFINITE for "default"), so the next read serves the pre-write entry and revalidates in the background: a vendor saved, `router.refresh()` ran, and the page showed what they had just changed away from. A Route Handler must use **`expireTags(...)`** (`lib/cache/expire.ts`, i.e. `{ expire: 0 }`); `updateTag` throws outside a Server Action. `lib/cache/expire.test.ts` pins this against Next's own cache code. Note also that `backendFetch`'s data-cache key includes the bearer token, so entries are per token but ARE reused for that token's ~60 s life — a missed purge is visible.

19. **A Radix Sheet/Dialog rendered inside a `<form>` submits that form.** It is portalled in the DOM but still a child in the REACT tree, and React bubbles synthetic `submit` along the React tree. Finishing an option group saved the whole meal. Render sheets that hold their own form OUTSIDE the parent `<form>` (and `stopPropagation()` in their submit as a second guard) — `MealForm.options.test.tsx` fails if either is undone.

20. **A bare 401 "Unauthorized" from the backend has several causes, and the log now says which.** Every verifier logs a classified `Token verification failed` at WARN (`describeJwtFailure`: `expired` + `secondsPastExp`, `bad_signature`, `untrusted_issuer`, `signing_key`, …; never the token or a claim), and the vendor `backendFetch` logs `401 <code> on <path> (token exp Ns ago)` to the Next dev log. **Open:** a vendor saw "Unauthorized" on the render right after creating a meal. The leading hypothesis — Clerk's middleware accepts a session token up to 5 s past `exp` and server `getToken()` forwards that same token, while `jwt.verify` has no tolerance — is NOT yet confirmed; do not change verification until a reproduction's log line shows `expired` with `secondsPastExp` ≤ 5. It has not been reproduced (no browser automation available; needs a real sign-in). A second, now-fixed source of the same words: vendor outlet routes answered another vendor's outlet with **403 "Unauthorized"** — the earlier `/outlets/[id]` error in the dev log may have been that, not a token. They now 404 like a missing outlet (`vendor.outlets.smoke.ts`).

14. **`next build` run over a live `next dev` breaks the dev server — every route 404s.** They share the app's `.next` folder; the build rewrites it and the running dev server loses its compiled `server/` output from under it. It presented as "`/` is missing" while `app/page.tsx` was untouched — the tell is that plain static routes like `/meals` 404 too. Fix: stop the dev server, `rm -rf apps/<app>/.next`, restart. **Before building to verify anything, check the app's port is free** (`netstat -ano | grep LISTENING | grep :3003`); if it is not, verify with `tsc` only, or ask.

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
Nothing speculative is modelled.

**Resolution is CITY → COUNTRY → GLOBAL**, most specific wins, ties broken by
`priority` then newest `publishedAt`. `resolveHeroPromotion()` is the pure rule;
the SQL pre-filter orders by the same columns, and the pure function is what
makes that transcription testable (principle 4). Perth never sees Berlin's, and
an unknown visitor location matches nothing city-scoped.

**Every hero promotion promotes the PLATFORM**, at all three scopes (explicit
direction). A promotion is DailyBread speaking — a seasonal message, a new-market
announcement, an anniversary. The scope says WHERE it is seen and nothing else;
there is no subject axis, and `HeroPromotion` has no vendor, meal or funding
column anywhere.
> **Vendor-funded featured placement is out of scope and deliberately
> unmodelled** (explicit direction, superseding the earlier "vendors paying to
> feature a meal" note). It is its own system — inventory, pricing, billing, and
> fair rotation between vendors who all paid for the same city — and none of
> this is shaped for it. Half-modelling it would leave dormant columns and
> branches that mislead whoever reads this next. When it is real, the thing to
> settle first is that `resolveHeroPromotion` returns a SINGLE winner: correct
> for platform content, wrong for paid placement, where the loser of a priority
> tie would silently never render while still being billed.

**Ranking is PRIORITY first, then specificity, then newest** — and the order
matters more than it looks. Specificity-first is a *routing* rule (CSS, DNS):
right for a fallback, wrong for a campaign, because a national promotion could
never reach a city that had one of its own, so the busiest markets were the
only ones to miss it. Since `STANDARD` is **0** and every pre-existing row is
0, they all tie on priority and fall through to specificity — the old rule is
now the *default case*, not a replacement, so the change is backward-compatible
by construction. A city keeps its own hero during a global takeover by matching
its tier.
> The SQL pre-filter **must** order by the same three keys in the same order.
> It also applies a `take`, so a different ordering can truncate the true winner
> away before `resolveHeroPromotion` ever sees it (principle 4).

**Priority is exposed as NAMED TIERS, never a raw integer** —
`STANDARD` 0 · `FEATURED` 100 · `TAKEOVER` 500, in
`packages/types/src/enums/marketing.ts`, shared by the backend and the ERP so
the mapping exists once. A free integer field rots predictably: someone sets
999 "to be safe", the next person sets 1000, and the column ends up encoding an
argument nobody remembers. Google Ad Manager's Sponsorship/Standard/House
levels are the same answer to the same problem. The column stays `Int`, so
ordering is still an indexed sort and finer values remain possible without a
migration; the gaps between tiers leave room to insert one without renumbering.

**Anything above STANDARD is a campaign, and a campaign MUST have an end date**
(`assertPriorityWindow`, code `CAMPAIGN_NEEDS_END_DATE`). A takeover suppresses
every ordinary promotion on the platform, so one published for Christmas with
no end date is still running in May and nothing flags it — it is behaving
exactly as configured. Enforced on create, on update (the tier can be raised
later, which is exactly when the date starts being required) **and** on publish.
`assertWindowNotElapsed` separately refuses publishing a window that has already
closed: it could never be seen, but it reads as live in every list.

**READING IS NOT SCOPED; writing is** (explicit direction). Every admin holding
`marketing:promotions:read` sees every promotion at every reach — a hero
promotion is public marketing copy any customer in that market can already see,
so there is nothing to protect, and a marketing team that cannot see what other
markets are running will duplicate and contradict them. `promotionScopeWhere`
was deleted rather than widened to `{}`.
> Two consequences. **Principle 6 does not apply here** — nothing is secret, so
> a write refused for scope answers **403**, not a pretend 404. And
> `updateHeroPromotion` now calls `assertPromotionScope` on the EXISTING row
> explicitly: that check used to ride on the scoped `where` in
> `findPromotionOr404`, and without re-adding it, being able to *see* every
> promotion would have meant being able to *edit* every one.

**`HeroPromotion.canManage` is computed by the server**, by running the very
guard that would refuse the write (`canManagePromotion` calls
`assertPromotionScope` in a try/catch). The ERP renders a read-only view for a
promotion it cannot write and a "View" instead of "Edit" in the list. The
browser deliberately does **not** re-derive this from scope rules — two
implementations of one authorization rule always drift, and the failure would
be a form that 403s on save, or one that hides an action the server allows.

**The "default promotion" already exists — it is a GLOBAL, STANDARD promotion
with no end date.** No second concept, no `isDefault` flag: `STANDARD` is the
only tier that may run without an end date precisely so an evergreen fallback
can exist, and a global TAKEOVER simply outranks it while its window is open,
then falls back to it when the window closes. The gap was never the model, it
was VISIBILITY — so the list returns `globalFallback`, resolved through the
same `resolveHeroPromotionFor` the storefront calls, and the ERP says in
so many words what a visitor with no location is seeing right now. `null` means
the storefront has dropped to its own built-in hero.
> **It belongs in the ERP, not hard-coded in customer-app.** Marketing owns the
> copy and must be able to change it without a deploy. The customer app's
> `FALLBACK_HERO` stays strictly as the *backend-unreachable* safety net — the
> one case the ERP cannot help with.

**`statusCounts` is deliberately unfiltered.** The failure it exists to catch
is creating a promotion, navigating away, and never learning it is still a
draft — a count that respected the current filters would hide exactly the row
you forgot. The ERP surfaces drafts as a link into `?status=DRAFT`.

**ERP routes: `/marketing/[id]` is READ-ONLY, `/marketing/[id]/edit` is the
form.** A deliberate departure from this app's "Sheet for forms" convention,
because the form is four sections plus an uploader — sheet-sized it becomes a
scrolling column inside a scrolling page, and unusable on a phone. As separate
routes, the common case (looking at a promotion) ships no form code, an admin
who may read but not write is redirected rather than shown a disabled editor,
and an edit survives a refresh. Every row in the list opens the details page;
editing is a step from there, so a row never offers an action its viewer cannot
take.

**The ERP offers reaches by SCOPE TIER, and a city is always picked through its
country.** `HeroPromotionPlacement` builds the reach list from `getScopeTier`:
global tier gets all three, country tier gets country + city, city tier gets
city only — the option is absent rather than present-and-rejected. A global
admin picks a country first and the city list loads from it; when the admin's
scope holds exactly one country it is shown as a fact, not a dropdown, and its
cities load immediately. The country list is *already* the scope, because
`/admin/v1/countries` is scope-filtered — the ERP never re-derives scope.
`assertPromotionScope` remains the authority (principle 1).
> **Visible ≠ writable.** A country lead SEES the global default in their list —
> knowing what their market falls back to is part of the job, and
> `promotionScopeWhere` returns it. Opening it renders a read-only notice
> instead of the form (`canAuthorReach`): every write would 403 anyway, and a
> `<select>` with no option matching the row's own scope silently shows its
> first one, so the promotion would look re-aimed just from being opened.

**The public-image pipeline is SHARED** — `lib/images/publicImage.ts` owns the
upload → sanitise → publish round trip, and marketing and the cuisine catalogue
both go through it. What stays with each caller is only its PREFIXES and its
CROP, passed in, so hero code can never assert a cuisine key and vice versa.
The prefix guard in particular is a security control, and two copies of a
security control is one copy that will not get the next fix.

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

**A promotion that names a place its reach cannot use is refused, not silently
stripped.** Found by the smoke test: `countryRef` on a global promotion was
being ignored, which would have handed the caller a reach they did not ask for.
All three combinations now fail with `INVALID_SCOPE` — global + any place,
country + city, and city + country (a city row *does* store a country, but it is
derived from the city, so a supplied one is redundant or contradictory). Same
class as a request field that never reaches its mapper (bug class #1).

**`presentHeroPromotion` degrades rather than throws** when the public bucket is
unconfigured. A read crashing over a deployment concern is far worse than a
missing picture; it logs a warning naming the exact cause.

**The public endpoint has its OWN presenter, and that is a security boundary.**
`presentPublicHeroPromotion` is a six-field allowlist — eyebrow, headline,
subheadline, ctaLabel, ctaHref, image — built on top of `presentHeroPromotion`
so the imageKey → URL rule stays in one place. The admin presenter was
originally wired straight to the anonymous route, handing the world `status`,
`priority`, the run window, `publishedAt`/`createdAt`/`updatedAt`, the row id
and the resolved city/country. The risk is not that those fields are secret —
it is the DEFAULT: every column added to the table later would have been
published automatically, and nobody making that change would think to check.
The smoke test asserts the exact KEY SET for this reason, so widening it has to
be deliberate. `resolveHeroPromotionFor` therefore returns no id, and the smoke
test identifies rows by headline.

**The customer endpoint takes no identity at all** — not even
`attachCustomerContext`. `GET /api/customer/v1/hero-promotion?cityId&countryId`
depends only on WHERE a visitor is, so it is identical for signed-in and
signed-out visitors and cacheable per location. Verifying a token we would then
ignore would cost a round trip and make the response look person-specific when
it is not. Both ids are shape-checked; an unrecognised one simply matches
nothing and falls through to the global default.

**`getHeroContent()` passes `anonymous: true`, and that is load-bearing.** It
skips the Clerk lookup, which is what keeps `/` a STATIC route (`○ /`, 60s
revalidate). Reading auth or cookies in that path would make **every** page in
the app dynamic. It takes an optional `location`, which is how ONE component
serves both pages: `/` passes nothing and gets the global promotion,
`/city/[citySlug]` passes its ids and gets whatever the backend ranks highest
there. The component cannot tell which scope it was handed and does not need
to (principle 1).
> **That was the "decide deliberately" moment, and it was decided by keeping
> the location OUT of `/`** — the scoped hero lives on the city pages, which
> are statically generated per market, rather than making the landing page
> dynamic for everybody.

> **The customer app's `BACKEND_API_URL` has NO `/api` suffix; the ERP's does.**
> So customer-app paths are written `/api/customer/v1/…` and ERP paths
> `/admin/v1/…`. Getting this wrong fails as a 404 wrapped in a generic
> "Something went wrong".

**The hero's fallback is per-PART, not all-or-nothing.** Copy and image fall
back independently: a published promotion always has a headline (the column is
required) but may carry no image — which the schema calls a legitimate seasonal
message, and which is also what every promotion looks like before the public
bucket is provisioned. So a promotion's copy is used whenever a promotion
exists, and the built-in photograph stands in only when that promotion has no
image of its own. **The built-in hero entire** is used only when nothing is
scheduled anywhere, or the backend is unreachable — and the reason is logged in
the last case. That is a real default, not a hidden error: a landing page with
no hero is broken, and unlike a list of results a marketing slot has a
meaningful "nothing scheduled" answer. The fallback's invented figures are
dropped the moment ANY real promotion renders (principle 11).
> Falling back wholesale on a missing image was the earlier behaviour and was
> wrong: it replaced real admin-authored copy with invented marketing.

**Cache freshness is TWO mechanisms, and both are needed.**
`POST /api/revalidate` on the storefront (shared secret, tag allowlist) is
called by the BACKEND on publish, archive, and edits to an already-published
promotion — so an admin sees their change at once instead of waiting out a
revalidate window. The timed 60-second revalidate **stays**: a promotion can go
live or expire with no request and no event at all, which is exactly what
`startsAt`/`endsAt` do, and nothing fires a webhook at midnight.

  | | |
  |---|---|
  | on-demand | somebody DID something — instant, event-driven |
  | timed | the CLOCK crossed a boundary — bounded lag, no event exists |

> **The purge is driven by the backend, not the ERP.** `revalidateTag` only
> reaches the calling process's cache, so the ERP's own
> `revalidateTag("hero-promotions")` purges its list view and can never touch
> the storefront. The backend is also the only place every write goes through.
> `revalidateStorefront` NEVER throws and never blocks: a failed purge must not
> turn a successful publish into an error, since the worst case is the
> staleness you would have had anyway.
>
> **Stale-while-revalidate means the FIRST request after a purge still serves
> the old copy** while regenerating; the next one is fresh. Verified by
> observation, not assumption — do not read a single stale response as a broken
> purge.
>
> The storefront route **fails closed** when `STOREFRONT_REVALIDATE_SECRET` is
> unset: an open purge endpoint is a cheap way to force repeated re-renders and
> push load onto the API. The tag allowlist exists for the same reason.

**A visitor with no location sees the GLOBAL promotion**, and that is the
landing page's default state rather than a special case — `getHeroContent()`
sends no `cityId`/`countryId`, which matches nothing city- or country-scoped and
falls through to global.

**Processing is synchronous, deliberately.** There is no queue in this project
(no Redis, no BullMQ). Two crops of one photo is 1–3 s and an admin gets a
finished image instead of a pending state to poll. Add a queue when thousands of
vendor photos need it, not for this.

> **Setting up the public bucket** (one-time, by hand in Cloudflare). Each value's
> exact source and shape is documented inline in `apps/backend/.env`:
> 1. R2 → Create bucket, e.g. `dailybread-public`, same region as the private one.
> 2. Bucket → Settings → **Public access** → **R2.dev subdomain** → Allow Access.
>    Cloudflare returns `https://pub-<32 hex>.r2.dev` — that is `R2_PUBLIC_CDN_URL`.
> 3. R2 → API → Manage API tokens → a token scoped to **this bucket only**,
>    Object Read & Write. A separate token from the private bucket's, which is the
>    entire point of two buckets.
> 4. `R2_PUBLIC_ENDPOINT` is the **account-level** S3 endpoint
>    (`https://<accountId>.r2.cloudflarestorage.com`) — identical to `R2_ENDPOINT`,
>    because both buckets live in one account.
> 5. Set `NEXT_PUBLIC_MEDIA_HOST` to that origin's **hostname** (no scheme, no
>    trailing slash) in `apps/admin-dashboard/.env` and `apps/customer-app/.env`.
>    customer-app also wildcards `**.r2.dev`; the ERP does not, so without this
>    the ERP throws *"hostname is not configured under images"* the moment a
>    promotion has a picture. `next.config.js` reads it at **boot**, so it needs
>    a dev-server restart, not a page reload.
> 6. On the PRIVATE bucket (`R2_BUCKET_NAME`) → Settings → Object lifecycle rules →
>    Add rule: prefix **`meal-uploads/`**, delete objects **2 days** after upload.
>    That prefix is meal-photo STAGING — what the browser PUTs before the dish is
>    saved; a save copies the original to `meal-images/` and clears it, so anything
>    still there is abandoned. The code relies on this rule and has no cron for it.
>    (`marketing/hero-originals/` needs a rule only if originals are not kept for re-crops.)
>
> **`r2.dev` is the DEVELOPMENT origin, on explicit direction** — a custom domain
> comes when the backend is deployed. Cloudflare rate-limits `r2.dev` and does not
> support it for production traffic, and it cannot be purged. The swap is one env
> value plus `NEXT_PUBLIC_MEDIA_HOST`, because nothing but `publicUrl()` builds a
> URL and the database stores keys, never URLs.
>
> **Two env traps, both guarded at boot in `env.ts` because both fail silently.**
> `R2_PUBLIC_ENDPOINT` is the **account** endpoint with NO path — Cloudflare's
> bucket Settings page shows the S3 API value *with the bucket name appended*,
> and the SDK appends the bucket itself, so copying it verbatim writes every
> object to `<bucket>/<bucket>/<key>`: uploads report success and every public
> URL 404s. And `R2_PUBLIC_CDN_URL` is the origin the bucket is **served** from,
> never the S3 API endpoint. The two sit next to each other in Cloudflare's UI, both are https
> URLs, and confusing them fails silently — every image 401s because the S3
> endpoint wants a signature. `env.ts` refuses it at boot for that reason.
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
> `auditService.log` is fire-and-forget; `drainAuditQueue` (shutdown) waits for writes in flight. Both MUST use the one list in `audit.queue.ts` (`trackAuditWrite`). They used to keep one each, the drain awaited an always-empty array, and writes in flight at shutdown were lost. `audit.queue.test.ts` goes through `auditService.log` for that reason.

**Admin RBAC** is pool-based: `AdminRolePermission` = a role's ceiling, `AdminUserPermission` = individual grants within it. Roles: `super_admin`, `identity_admin`, `finance`, `vendor_ops`, `customer_care`, `courier_ops`, `operations_admin`. A `RECEIVE_ESCALATION` permission is always **ceiling-only** — granted individually to senior reviewers.

**ONE ADMIN → ONE ROLE → many permissions → ONE SCOPE.** Role is `AdminUser.roleId`; permissions come from the role's pool; scope is exactly ONE `AdminUserScope` row — GLOBAL, one country, or one city. **Never a union**: COUNTRY Kenya + CITY Kampala used to read as a country admin of both. `deriveScopeContext` (`admin/lib/scope/single-scope.ts`, unit-tested) is the only reader: one well-formed row → its context; zero, several or malformed → `NO_SCOPE` (fails CLOSED, logged). The database forbids the rest (`20261006090000_admin_single_scope`: unique index on `adminUserId` — **written partial on purpose so `migrate diff` ignores it**, do not make it a plain index — plus a shape CHECK). Create AND update go through `resolveSingleScope` (`SINGLE_SCOPE_REQUIRED`, `INVALID_SCOPE_SHAPE`, `COUNTRY_MISMATCH`) and `assertScopeCanManage`; update used to skip the actor check entirely. **A CITY scope's country is the CITY's** — set from the city on write, and read from `city.countryId` (not the stored column) by `loadAdminUser` → `buildScopeContext`. The session sends the server's `tier` and the ERP's `getScopeTier` reads it; the scope picker offers one scope, no "Add another".
**Scope** (`AdminScopeContext`): `isGlobal` / `countryIds` / `cityIds` / **`tier`**. `REGION` does not exist. A CITY admin's `countryIds` is their city's ONE country (for modules not yet narrowed to city), so **a city admin is indistinguishable from a country admin by `countryIds` alone** — anything country-wide or dish-wide must gate on `tier` (`assertCountryPolicyScope`, `assertDishWideAuthority`). Anything owned by ONE outlet (listings, outlet menus) scopes through `outletScopeWhere`. `ROLE_SCOPE_RULES` decides which scope type a role may hold.
> **Open hole, same shape:** `assignVendorTypeToCountry` / `removeVendorTypeFromCountry` still lack the `tier` gate.

**Review workflows come in two strengths, and the choice is deliberate:**
- **Full claim / escalate / reassign** — applications, compliance cases, appeals, payout accounts. Used only where concurrent action has consequences (money, a formal dispute). `admin.vendor.compliance-case.service.ts` is the reference implementation; escalate is a *free pool*, reassign is *targeted*; acting requires holding the claim; the escalator is permanently locked out; `claimedFromEscalation` is terminal.
- **Plain approve / send-back** — outlets, profiles, meals. Two admins clearing the same food photo is a non-event.

**Meal moderation** (`modules/meals`; ERP at **`/meals`** — Overview · `/meals/listings` · `/meals/dishes` · `/meals/reasons`; the old `/vendors/meals*` URLs are thin redirect pages, query kept. The backend API stays at `/admin/v1/vendors/meals`; rules in `meals/lib/moderation.rules.ts`). In the ERP a `MenuItem` is a **Dish** and a `Meal` is a **Listing** — use those words in UI copy:
- **Every consequential action is REASON-BACKED (Phase 2.1)**: dish send back / suspend / ban, option-group send back, listing hide / suspend. The reason system is the existing `AdminActionReason` (no second one): `description` IS the vendor-facing explanation, `appliesTo` holds the action's AUDIT VERB (`MealReasonActions` in `@repo/types/enums`), a country row overlays the global row with the same code. `chooseReason` (`admin/lib/reasons/reason-choice.ts`, pure, unit-tested) is the one rule; `resolveReasonForAction` loads the row. Body fields: `reasonCode`, `vendorMessage` (OTHER only — a predefined reason refuses one), `internalNote` (audit only). The pre-2.1 free-text `reason` is REFUSED (`UNSUPPORTED_FIELD`). Restoring acts (approve, unhide, reinstate, unban) take only an optional `internalNote`. Audit metadata is a STRUCTURED snapshot `{ reason: { reasonId, code, label, vendorMessage, isOther }, internalNote }` — rewording a reason never rewrites history; old string reasons read back as `legacyText`, never back-filled.
- **`OTHER` is a reserved code, never a row**: COUNTRY/GLOBAL tier only (`OTHER_REASON_NOT_ALLOWED` for CITY), vendor explanation ≥ `OTHER_MIN_LENGTH`. A CITY admin with no fitting reason ESCALATES instead: `MealEscalation` (PENDING → RESOLVED, nothing more) to ONE recipient who is active, holds `meals:moderate` and whose one scope is COUNTRY of the listing's country — the picker and the create both run `eligibleRecipientsWhere`, so a forged recipient id is `INVALID_RECIPIENT`. One open escalation per listing. No notifications, queue or SLA (Phase 3).
- **Reason governance**: writes use `settings:action_reasons:write` + `assertReasonReach` — platform-wide reasons need GLOBAL, a country reason needs that country's COUNTRY admin (or GLOBAL); CITY never authors. The library read (`/reasons/library`) returns `canManage` / `canCreate*` from the same guard. Reason APPLICABILITY is the action only (a reason shared by listing and dish actions is offered to a city admin suspending a listing); AUTHORITY is permission + scope + target. The ERP keeps "Create platform reason" (GLOBAL) distinct from a COUNTRY admin's "Add <country> version" of a platform reason (same code, replaces it in that country only). Resolving an escalation grants nothing: it needs the resolver's own `meals:moderate`, tier and scope, never the fact they were the recipient. **In the ERP they are "Action Reasons"** (`/meals/reasons`, 10 a page, server-paged; details at `/meals/reasons/[id]`). **The `code` is SYSTEM-generated** (`reasonCodeFromLabel` + `firstFreeReasonCode`, collision-suffixed against every existing code) and never edited — renaming changes the label only. A caller may name a code ONLY for a country version, and it must be an existing platform reason's code (`CODE_IS_SYSTEM_GENERATED` otherwise). Seeded meal reasons live in `action-reasons.seed.ts` (`pnpm db:seed:admin`); with none seeded, no consequential meal action can be taken.
- **An option group (`ModifierGroup`) has its OWN verdict**, given at `/admin/v1/vendors/meals/modifier-groups/:id/{approve,send-back}` under `VENDORS_MEALS_MODERATE` and scoped through the group's vendor. The words live on the group, so approving the dish can never clear it. A group blocks its dish while it is FLAGGED **or** MANUALLY_REJECTED (`groupBlocksDish` = the complement of what the storefront shows), and **a dish cannot be approved while a group blocks it** (`MODIFIER_GROUP_UNRESOLVED`): it would sell with that choice silently missing.
- **`nextDishReview` is the only rule for how a dish follows its groups.** Automatic statuses follow the reasons. A MANUALLY_APPROVED dish is re-flagged when a group newly blocks it. A MANUALLY_REJECTED dish carrying the modifier flag goes back to the **queue** (FLAGGED, never straight to approved) when the group clears or the vendor re-edits it. A rejection about the dish's own words is never moved by a group change.
  > **A re-queued dish waits for an ADMIN.** It is FLAGGED with its `rejectionReason` still set. Only `approveMenuItem` or the vendor's own text re-screen clears that field, so on a FLAGGED dish it means exactly "re-queued after a send-back". No group event may auto-approve it: not the vendor editing a group again, and not an admin approving a group it shares. An earlier version treated it as an ordinary automatic FLAGGED and let the next group event clear it. `meals.adminModeration.smoke.ts` has three checks that fail if that guard is removed.
- **Operational status is a fixed table, the outlet's**: suspend (ACTIVE→SUSPENDED), reinstate (SUSPENDED→ACTIVE), ban (ACTIVE|SUSPENDED→BANNED), unban (BANNED→ACTIVE). Nothing else. `/status` still takes a TARGET status, so the act is named from where the meal actually is, and the ERP sends `expectedStatus` — without it, a stale "Reinstate" on a meal someone just banned would silently become an unban. Each act has its own audit verb and vendor notification. The admin's reason is audit-only and never shown to the vendor, same as outlets.
- **Pre-Phase-9 rows**: `apps/backend/scripts/audit/meal-blocked-option-groups.sql` (read-only; how to run it, what each column means and how to fix rows are in its header) finds dishes whose own status would show them while a group blocks them. The read-side guard hides them from customers, but they still read as approved in the ERP and to the vendor. Fix them through the ERP group actions, never with a hand-written UPDATE.
- **No customer-visible dish may carry a blocking group, and that is enforced TWICE**: the rules above keep such a dish out of a visible review status on every write, and `SELLABLE_MENU_ITEM_WHERE` also refuses it on read (principle 10). The cart prices against every attached group without filtering by status, so before that read-side guard a row from before Phase 9 sold with a choice the customer was never shown. `meals.adminModeration.smoke.ts` plants such a row directly and checks storefront, meal page and cart together. A dish-level visibility check needs an always-sellable control dish at the outlet: an outlet with nothing sellable is itself hidden, and the check then passes for the wrong reason.
- **Every meal moderation action purges the storefront's `city-inventory` tag** (the anonymous city feeds, cached 60s stale-while-revalidate) after its write commits, through `revalidateStorefront`, the same channel hero promotions use. A refused action purges nothing. Ordinary vendor edits are NOT purged; they ride the 60s revalidate, which is the documented bound for them.
- **The vendor sees a group's verdict from its LIBRARY row** (`reviewStatus`, `rejectionReason` already on `ModifierGroup`). The dish notice joins attached group ids against that query (`MealOptionGroupIssues`), the same join the options section does, so the dish contract stays as it is.
- **DISH vs LISTING: scope decides what an admin may TARGET; the target decides the blast radius.** A dish (`MenuItem`, `/vendors/meals`) is the vendor's reusable definition, and EVERY dish action — approve, send back, suspend, ban, and the option-group verdicts — changes it at every outlet in the vendor's country. So dish-wide acts need GLOBAL or COUNTRY tier (`assertDishWideAuthority`, 403 `DISH_WIDE_ACTION_NEEDS_COUNTRY_SCOPE`; the response carries `canActDishWide` so the ERP never re-derives it). A CITY admin READS only dishes sold (now or before) at an outlet in their city (`dishReadScopeWhere` / `dishInReadScope`), sees only their own outlet rows plus `outsideScopeOutletCount`, gets no flagged-meals sidebar dot, and acts on ONE listing instead. The list's where-clause is an AND list because the scope and the outlet drill-down both constrain `outletMeals` (bug class #2). Gate on `tier`, never `countryIds`.
- **LISTINGS: one dish at one outlet (a `Meal` row), ERP at `/vendors/meals/listings[/:mealId]`** (`services/listings.service.ts`, pure rules in `lib/listings.rules.ts`). The dish page is organised by the vendor's catalogue (content is reviewed once per dish); the listing page by where it is SOLD. Scope is `listingScopeWhere` / `listingInScope` — GLOBAL all, COUNTRY by the outlet vendor's country, CITY by `outlet.cityId` (gate on `tier`, never `countryIds`, which folds a city's country in). Out of scope = 404.
  - **Two platform controls, orthogonal columns, neither the vendor's:** `adminHiddenAt` (hide/unhide — quiet, optional note, vendor NOT notified) and `Meal.adminStatus` ACTIVE⇄SUSPENDED (suspend needs a reason; vendor notified, reason audit-only). Lifting one never lifts the other. No listing-level BAN — bans are dish-wide until the review lifecycle designs them. Both gate `SELLABLE_MEAL_WHERE`; `isAvailable` stays the vendor's presentation flag and is never written by the ERP. No vendor write touches either column, and reconcile REVIVES the same row on re-add, so neither editing, 86-ing nor removing/re-adding an outlet lifts a control. A removed listing cannot be hidden or suspended, but a control on it can always be lifted.
  - `POST …/listings/:mealId/{hide,unhide,suspend,reinstate}` under `VENDORS_MEALS_MODERATE`, with `expectedStatus` + `expectedHidden` (stale view → 409) and a conditional write. Audit verbs `meal.hidden|unhidden|suspended|reinstated`, entityType `Meal`; the detail page's history is read from that audit trail, not a second store. Purges `city-inventory` like dish actions.
  - `listingBlockers` EXPLAINS the dish half of visibility; `dishSellable` is the predicate itself (`SELLABLE_MEAL_WHERE` count). `meals.listings.smoke.ts` asserts they agree in every state it reaches — add a blocker whenever a clause is added to that predicate. The vendor dashboard does not yet SHOW a per-outlet suspension or hide (it gets the notification for a suspension only).

**Uploads and secrets.**
- One pipeline everywhere: presign → XHR `PUT` to R2 → submit the `storageKey`. The bucket is **private**, so keys are named `...Key` (never `...Url`) and become short-lived signed URLs at a **single exit point** per domain (`presentVendorProfile`, `signKey`). A key rendered straight into an `<img src>` is a 403.
  > **Menu photos are the exception**: a save re-encodes each upload into a public WebP master (`meals/services/images.service.ts`) and keeps the original private. Readers get `presentMealImage` / `mealImageUrl`, a stable public URL, never a signed one. A soft-deleted or banned dish keeps its images (meal plans and, later, orders must stay resolvable), so its master stays publicly fetchable by URL. Taking one down is deferred to image moderation.
- Every key carries the owner's id (`meal-images/<vendorId>/…`, `profile-media/<kind>/<vendorId>/…`, `payout-docs/<method>/<vendorId>/…`). That segment is **load-bearing**: `assertOwned*Key` is what stops a discard endpoint being a delete-anything primitive — it must check the exact prefix, one segment after it, no traversal, and no prefix collision (`vendor-1` must not match `vendor-1-extra`). Filenames are uuids, never fixed, so a replacement never destroys the evidence a decision rested on.
- Payout identifiers are **AES-256-GCM at rest** with keyed-HMAC blind indexes for duplicate matching without decrypting. `presentPayoutAccount()` is the only exit to any client and returns masked values — a vendor never gets their own numbers back (Stripe's model). `decryptPayoutIdentifiers` is reachable from no route.

**IDENTITY: the column is `externalAuthId`, the provider is Clerk.**
`AdminUser`, `VendorUser` and `ConsumerAccount` each carry `externalAuthId` —
named for the ROLE it plays, because verification is already plain JWT + JWKS
against a configured issuer and a column named after one supplier is how that
supplier quietly becomes part of the schema. The VALUE is a Clerk user id
today; code that talks to Clerk's API still says `clerkUserId`, and that is
deliberate — it is Clerk's id being handed to Clerk.
> Renamed by `20260924090000_rename_clerk_id_to_external_auth_id`, **hand-written
> as `ALTER TABLE … RENAME COLUMN` plus `ALTER INDEX … RENAME`**. `prisma
> migrate diff` generates drop-and-add for a rename, which silently discards
> every identity link; the indexes are renamed alongside so the database
> matches the names Prisma derives, or the next diff reports drift and offers
> to "fix" it.

**Four Clerk applications, one account**: customer · vendor · courier (env
reserved) · admin, each with its own issuer, JWKS and webhook secret.
`verifyClerkJwt` matches the token's `iss` against the four and every
middleware then asserts the audience (`verified.app !== "customer"` → 401), so
a vendor token is structurally useless on a customer route. Separate user pools
are the point: an admin identity cannot authenticate against the storefront at
all, and MFA/session policy is set per audience.

**CUSTOMER MODERATION MOVES IN BOTH DIRECTIONS.** `ConsumerStatus.SUSPENDED`
used to be enforced on every request and settable by nothing — a rule nobody
could apply.

| | |
|---|---|
| admin → provider | `suspendCustomer` / `reinstateCustomer` write Postgres, then ban/unban at Clerk |
| provider → admin | a `banned` flag on `user.updated` maps onto `SUSPENDED` / `ACTIVE` |

> **Postgres decides; the provider only revokes sessions.** Every customer
> request re-reads `status`, so a suspension lands on the next call with no
> session to hunt down — the provider call is BEST-EFFORT and its failure is
> reported (`sessionsRevoked: false`), never swallowed and never a rollback.
> `CLERK_CUSTOMER_SECRET_KEY` is optional for exactly that reason: without it
> the suspension still applies and says loudly that live sessions survived.
> **`locked` is NOT mirrored** — that is Clerk's own brute-force lockout,
> temporary and self-clearing, and turning it into a platform suspension would
> strand someone who mistyped a password. Suspension never deletes: addresses
> and later orders must survive being reinstated.
> **No geographic scope gate on customer moderation.** Customers are not
> country-scoped — `ConsumerAccount.countryId` is a home-market hint and a
> customer may hold addresses in several countries — so gating on it would
> refuse a legitimate action for someone who simply travelled.

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

**Brand: the app's NAME is the logo for now** (explicit direction) — customer
app and vendor dashboard so far; the ERP keeps its own mark.
| file | what |
|---|---|
| `public/brand/dailybread-wordmark.webp` (both apps) | "Daily" #121417 + "Bread" #ac5107, 463×96 |
| `customer-app/public/brand/dailybread-wordmark-dark.webp` | #fafafb + #febe90, for `.dark` |
| `vendor-dashboard/public/brand/dailybread-monogram.webp` | the "DB" tile, collapsed sidebar only |
| `app/favicon.ico` (both apps) | "DB" — white D, #fd9a4c B on #0a0b0d — 16/32/48 px |
Rendered once from Playfair Display 700 at tracking -0.03em (the old live
`<Logo />`): glyphs → SVG paths with opentype.js, then `sharp` → WebP / PNG,
the PNGs packed into the ICO. Not a build step — regenerate the same way if
the colours or type change. The customer `Logo` swaps light/dark by CSS
(`dark:hidden` / `dark:block`, default lazy loading so the hidden file is never
fetched); the vendor `BrandMark` is the single place that app draws it (sidebar,
mobile sheet, phone navbar, footer). Both use `unoptimized` — the files are
already small WebPs at ~3× display height.

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
  > The named `category*` props write **`?category=`**. A page that reads any other key must use `extraFilters` with `name` set to that key. The meals queue's status filter read `?adminStatus=` through `categoryOptions` and silently filtered nothing (bug class #1).
- **Action colour is SEMANTIC, and it is a Button variant, never a className.**
  The ERP's house style is a TINT (`bg-X/10 text-X hover:bg-X/20`), not a solid
  fill: this app is dense and operational, and a wall of saturated buttons
  stops any one of them meaning anything.

  | variant | meaning |
  |---|---|
  | `default` | the one primary action on a screen |
  | `warning` | reversible and consequential — suspend, pause, withdraw |
  | `success` | restores something — reactivate, resume, publish |
  | `destructive` | cannot be undone. Kept rare so it still lands |

  A status action rendered in a TABLE colours only its label and takes its tint
  on hover; the same component rendered on a DETAILS page takes the full tint.
  One component, a `presentation` prop, no fork — see `FoodTagStatusActions`.
- **A button is named for what its destination actually does.** "Edit image"
  was accurate when that route only held an uploader and became a lie the day
  it grew a name field; an admin reading it would never have found the rest.
  Re-read action labels whenever the page behind them grows.
- Sidebar nav is permission-gated — links vanish rather than render-then-403. `isItemActive` needs a special case wherever a section "Home" href is a prefix of its siblings.
- **An `app/api/**` proxy must forward the caller's query string**, and a client
  picker must send an explicit `pageSize`. `/api/countries/[countryRef]/cities`
  dropped it for months: the backend defaults to `pageSize=10`, so every city
  picker in the ERP silently offered a country's first ten cities alphabetically
  and simply had no row for the eleventh. Nothing errored — same shape as bug
  class #4, a truncated list that reads as a complete one.
- Link-based pagination on SSR list pages (no JS needed). **Rebuild the whole query string** — a bare `?page=2` drops active filters.
- Mapbox is ~1.8 MB: always `next/dynamic` with `ssr: false`.
- **Customer: the OUTLET leads, the business is a byline.** Every outlet payload carries `name` (the outlet's own, unique per vendor) and `displayName` (the vendor's storefront name). `lib/format/outlet.ts` is the one rule — outlet name primary, "by <vendor>" only when it adds something — used by `OutletCard`, `MealCard`, the meal page, `StoreHero` and both pages' titles. Printing `displayName` alone made two outlets of one vendor (correctly two listings, different prices and reach) look like duplicates. Never merge listings by name or photo.
- **Meal page price summary** (`MealOptions` + `lib/meal/summary.ts`): the section is always headed "Options" (a vendor's group name is that group's `<legend>`, as written); beside it a summary of meal price (the outlet's, `wasPriceMinor ?? priceMinor`), choices, preview subtotal, and an explicit Included / Not included list. The server's offer price is shown only while the choices add nothing; otherwise the offer is named and excluded. A missing or hidden meal is a REAL 404 (verified with curl for a missing id and an archived dish): `/meals/[mealId]` has NO `loading.tsx` on purpose — a loading boundary streams first and pins the status at 200. Links into it show `LinkPending` (useLinkStatus) instead. Do not add a loading.tsx back.
- **Vendor shell.** The navbar is `sticky` INSIDE the content column (`SidebarInset`), never a full-width fixed bar — that one covered the sidebar's brand header and needed a magic `pt-20` on `<main>`. The column uses `overflow-x-clip`, not `hidden`, which would make it a scroll container and break every `sticky` inside it. The desktop sidebar collapses to an icon rail; the preference is the `db-vendor-sidebar-collapsed` COOKIE read by the layout (bug class #12), widths come from one table (`SIDEBAR_WIDTH`) so sidebar and offset move together, and the Tooltip wrappers render in both states so collapsing never changes tree shape. Collapsed mode suspends group disclosure (nothing inert) and keeps every label as `sr-only` text. `BrandMark` is the ONE place the brand is drawn — the real logo replaces its body. The bell is a plain link to `/dashboard/notifications` (an honest placeholder): no dropdown, no badge, no polling — the old dropdown rendered invented orders and payouts.
- **Client components and `Intl`:** `formatMoney` uses the runtime's default locale, so server and browser can format the same figure differently. A client component must receive any price it renders on first paint PRE-FORMATTED from the server, and format client-side only after an interaction (`MealOptions` does both).

**customer-app only** (public, anonymous-first, performance-critical):

> **WHERE A FETCH GOES — three folders, and the split is not stylistic.**
>
> | Who needs it | Mechanism | Where |
> |---|---|---|
> | a Server Component render | direct `backendFetch` + `revalidate`/`tags` | `lib/data/*` |
> | a CLIENT component | route handler → `backendFetch` server-side | `app/api/**` |
> | nobody — it is display copy | plain export, no I/O | `constants/**` |
>
> `constants/` is for data with **no I/O**. `getHeroContent()` lived there and
> was a lie; it is now `lib/data/hero.ts`, and only `FALLBACK_HERO` — genuinely
> static copy — stayed behind in `constants/home/hero-fallback.ts`.
>
> **A Server Component must NOT fetch this app's own route handler.** Next's
> docs say to fetch directly, and here it costs three things: a second network
> hop to our own server, a second invocation, and — because a Server Component
> needs an ABSOLUTE url to call itself, which means reading headers — the
> static render. `/` is `○` only because nothing in its tree touches a Dynamic
> API. Route handlers exist for the **browser**, so the Clerk token never
> reaches client JS; that is their whole job.

- `lib/api/server.ts` attaches a Clerk token **when one exists and never errors when it does not** — the mirror of the backend's `attachCustomerContext`. The dashboards' `backendFetch` throws instead; do not copy that here.
- Anything carrying a token is `cache: "no-store"`. Only an explicitly `anonymous` read may opt into ISR — a cached response must not depend on who asked.
- `proxy.ts` (Next 16's middleware) lists **protected** routes rather than exempting public ones, so a forgotten route stays public instead of leaking. Browsing, storefronts and cart pricing all work signed-out.
- The visitor's location lives in a **cookie**, so the feed is a plain server render with no mount-fetch waterfall. It is untrusted input — `parseLocation` range-checks it, and a saved address travels as `addressId` so the server resolves the point itself.
  > `lib/location/cookie.ts` holds the PARSER and no `next/headers` import, so
  > the browser and the server share one definition of what a malformed value
  > means. `lib/location/server.ts` is the `cookies()` half — **importing it
  > makes a route dynamic**, which is why neither `/` nor `/city/[citySlug]`
  > does.
- Reads return a **state** (`no-location` / `ok` / `error`), never a bare throw or an empty array — see recurring bug class #4.
- `lib/format/money.ts` is the only place minor units become a decimal, and it reads `currency.minorUnitDigits`.
- Keep `"use client"` at the leaves. Today: `Navbar`, `NavLinks`, `MobileNav`, `LocationChip`, `ThemeToggle`, and the location page's `LocationWorkbench` + `DeliveryMap`. Cards, hero and menu are Server Components and must stay that way. `Navbar` is the one deliberate exception — see *Customer auth*.
- **Pages start with a fragment.** `<main>` in the root layout carries `.shell` (centred max-width + responsive side gutters) and `flex flex-1 flex-col`, so a page never repeats that wrapper. Vertical spacing is the page's own business. A section that must span the full screen width uses `.full-bleed`; `body` has `overflow-x: clip` so that 100vw section never adds a sideways scroll (`clip`, not `hidden`, which would break the sticky navbar).

**Browsing and setting a location are PUBLIC; saving is not** (explicit
direction). The gate goes where the commitment is: a coordinate is not one, an
order is. `/city/[slug]/location` stays open and writes only the session
cookie — the anonymous path performs **zero durable writes**, which is the
property that made gating it unnecessary. Authentication is required for
anything durable or personal: saving an address, checkout, orders,
subscriptions, account. **Clerk returns the customer to the page they were on**
— a `<SignInButton>` or link persists the current URL as `redirect_url` and
Clerk navigates back after sign-in; `fallbackRedirectUrl` only applies when
there is no `redirect_url`. Our `/sign-in` renders a plain `<SignIn />` with no
`forceRedirectUrl`, which would override it.

**SIGNING IN LANDS THE CUSTOMER IN THEIR OWN MARKET.** `/continue` is a
ROUTE HANDLER (`app/continue/route.ts`), so it can set the device's
`db_market` cookie on the redirect. Order: suspended → `/account`; signed in →
the backend's `defaultCitySlug` (explicit default city, else most recently
selected, else newest address's city); otherwise the market this DEVICE was
last in; otherwise `/city`. Every destination is checked against the operating
markets. `pending` and a failed account read fall through to the device's
market — a successful sign-in never ends on an error page.
> **Where each sign-in button points.** The navbar and mobile sheet use
> `useAfterAuthUrl()`: inside a market (`/city/<slug>/…`) they return to THAT
> page — signing in there is about that city, and its per-city default address
> applies the moment they are back; anywhere else they go to `/continue`.
> `<SignIn>`/`<SignUp>` pages keep `fallbackRedirectUrl="/continue"`, never
> `forceRedirectUrl`, so the in-page auth walls (`SaveAddressPanel`, later
> checkout) still return to the task via Clerk's own `redirect_url`.
>
> **It never writes the DELIVERY cookie.** Which address a market delivers to
> is resolved on the market page from the account's per-city default; copying
> it into this device's choice would erase the difference between the two and
> silently re-aim a borrowed browser.

**THE ACCOUNT SEAM: `/account` is the first protected route**, listed in
`proxy.ts` (Next 16's Proxy — the renamed `middleware`, which must sit at the
APP root beside `app/`). `auth.protect()` redirects with a `redirect_url`, so
Clerk returns the customer to the page they wanted, and the gate stays OUT of
the pages — which is why everything else keeps its static render. **Verified
from the build and a live walk**: `/account` and `/account/addresses` 307 to
`/sign-in?redirect_url=…`, while `/`, `/about`, `/city` and every market route
still answer 200 signed-out.

**`getAccount()` returns a STATE, and two of them are identity-specific.**
`pending` (503 `CUSTOMER_ACCOUNT_PENDING` — the token is valid and the webhook
has not landed; drawn as "setting up your account", never as an error) and
`suspended` (403). Collapsing either into a generic failure turns a system
working normally into a support ticket.

**THE ADDRESS BOOK MANAGES; THE LOCATION PAGE CREATES.** There is no "add
address" form under `/account` and there must not be one: an address is a PIN,
so creating it needs a map, a market and a coverage verdict — which is
`/city/[slug]/location`, already built. A second form would be a second
location experience, the thing that was just consolidated. "Add an address"
links to a market instead.
> **`SaveAddressPanel` is where the auth wall goes** — under a CONFIRMED pin,
> not in front of the map. Setting a point writes only a cookie and stays
> public; saving is durable and personal, so it needs a person. Signed out it
> offers `<SignInButton>` and Clerk returns them to the same page.
> **It offers to save wherever the point is in a KNOWN city**, including one we
> cannot serve yet — that address is a real destination and a real demand
> signal (the same rule the backend enforces). Only a point in no city has
> nothing to attach to.

**SELECTING an address and DEFAULTING it are different verbs**, with different
endpoints, and both are PER CITY. A picker that blurs them quietly rewrites a
durable preference to answer "where does tonight's order go".

| | | |
|---|---|---|
| Deliver here | `POST /api/location/address` | per DEVICE, per MARKET — the delivery cookie's entry for the address's city |
| Browse / deliver | `POST /api/location/browse` | per DEVICE, per MARKET — a view flag; the target is kept |
| Make default for \<city\> | `PATCH /api/account/addresses/:id/default` | durable — `ConsumerMarket.defaultAddressId` for the city the pin resolves into |
| Make default city | `POST /api/markets/select {isDefault:true}` | durable — `ConsumerMarket.isDefault`, where signing in lands |

> **Every cookie write is from the SERVER's own read.** The address handler
> finds the row in the caller's own book with their token (another person's id
> simply is not there) and keys the choice by the city the BACKEND resolved.
> A pin is keyed by the city its serviceability resolved into, never by the
> page it was dropped on.

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

**Menu** — `MenuItem` (vendor-level catalog: the dish) → `Meal` (one dish at one outlet, carrying only what varies by location: `priceMinorOverride`, `isAvailable`). `MenuSection` is vendor-owned and ordered by authored `position`. `ModifierGroup`/`ModifierOption` are **one primitive** for variants and addons — the selection rule is the only difference.

**Option selection, as enforced today (server-side, `validateSelection` in `lib/pricing/line.ts`, run by the stateless `POST /customer/v1/cart/price`):** a group with `minSelect` 0 is optional and zero choices is valid — the line is priced at the meal's own price with no delta; **nothing is ever pre-selected** (there is no default-option concept, and "Included" was removed from the customer UI because it read as one). A group with `minSelect ≥ 1` and too few choices makes that line a `REQUIRED_CHOICE_MISSING` problem: it is excluded from the totals and `canCheckout` is false. More than `maxSelect` is `TOO_MANY_CHOICES`; a sold-out or foreign option is `OPTION_UNAVAILABLE` / `OPTION_NOT_ON_ITEM`. Deltas are added to the outlet's list price and the line floors at 0. The customer APP has no cart UI yet (recover from `30facf5` with orders). The meal page has an option PREVIEW (`lib/meal/selection.ts`, checked by `scripts/check-meal-selection.ts`): it mirrors the rule above to tell someone early, and its figure is the outlet's LIST price (`wasPriceMinor ?? priceMinor`) plus the deltas as sent — **no offer and no tax applied, and never floored** (a negative sum shows no figure). A percentage offer applies to the dish WITH its options under the server's rounding; copying that client-side would drift. It does not call `POST /cart/price` per click on purpose: anonymous SSR traffic reaches the backend from the Next server's one IP, which shares one rate-limit bucket (see *Customer*).

**`portionSize` is descriptive free text** (≤ 60 chars, optional, on the dish, same at every outlet): how much one order is ("Serves 2", "500 g"), shown to customers beside the price on the storefront card and meal page. It changes no price, stock or option rule. A choice of sizes is a ModifierGroup, never this. It is customer-visible, so it is **screened** like the name and description (`INAPPROPRIATE_PORTION`); a change to it re-screens the dish.

**MENUS are an outlet's named, branded selection of the Meals it already sells** (explicit direction, `20261004090000_vendor_menus`). `Menu` belongs to ONE outlet (an outlet may have several); `MenuMeal` references that outlet's `Meal` rows and copies nothing — price, availability, options and moderation stay on the meal, and grouping is the dish's existing `MenuSection`. **Not `MenuSection`** (a vendor-wide heading) **and not `MenuItem`** (the dish).
- Ownership is the outlet's (`outlet.vendorId`, not copied onto the menu). Every read and write queries THROUGH it; another vendor's menu, outlet or meal is a 404 like a missing one. `MenuMeal`'s foreign keys include `outletId` (to `Menu(id, outletId)` and `Meal(id, outletId)`), so the DATABASE refuses a meal from another outlet even past a service bug.
- The logo is required and uses the meal-photo pipeline with its own `ImageProfile` (`MENU_LOGO_PROFILE`: same staging prefix and lifecycle rule, `menu-images/<vendorId>/` originals, `menus/` public WebP, `MENU_LOGO_SPEC`). Validation runs before any image is processed; a failed transaction discards what it published; a replaced logo's objects are deleted after commit (its keys are unique to that menu).
- The ERP READS menus under `VENDORS_MEALS_READ`, country-scoped through the vendor, at `/admin/v1/vendors/meals/menus[/:id]`, and has **no write route at all**. **No customer read touches menus** — `meals.menus.smoke.ts` checks the storefront is byte-identical with and without them.
- Deliberately not built: delete, scheduling/hours, publishing, customer display, moderation of menu name/description (not customer-visible yet — screen it the day it is).

**An option group belongs to ONE dish** (explicit direction; `MenuItemModifierGroup.groupId` is unique since `20261003090000_meal_owned_option_groups`, which gave every extra dish on a shared group its own copy, moderation state included). Groups are WRITTEN only inside the dish's save, as `modifierGroups: [{ id?, name, description, minSelect, maxSelect, options: [{ id?, … }] }]` — absent on update leaves them alone, `[]` clears them. **Reuse is a COPY** (no ids), independent from then on; there is no template or bulk-edit system and none should be half-built. `prepareDishGroups` is the isolation guarantee: an id that is not one of THIS dish's groups (or options) is a 404. The old `modifierGroupIds` field is refused (`UNSUPPORTED_FIELD`) and the standalone group writes answer 410 (`GROUPS_BELONG_TO_MEALS`) rather than being silently ignored. `planOptionWrites` revives a deleted option re-added by name and routes renames through placeholder names — `(groupId, name)` is unique and deleted rows keep their names. The dashboard edits groups as a DRAFT on the meal form; nothing is saved until the meal is. **A copy cannot launder a verdict:** fresh group content whose words (`groupContentKey`: name, description, choice names) match one of the vendor's FLAGGED or MANUALLY_REJECTED groups — attached or not — is held FLAGGED with `MATCHES_UNRESOLVED_GROUP`, never auto-approved by the word filter. **Groups on no dish** (left from the library era) are copy sources only: no meal save can reach them by id and their choices cannot be 86'd. Deploy order, compatibility and rollback for the migration: header of `scripts/audit/meal-owned-groups-predeploy.sql`. Composition order is fixed: `base + option deltas` → `− discount` → `± tax` → **commission on the discounted amount**.

**Tax** — its own module. `TaxCategory` (global) × `CountryTaxRate` (per country, `rateBps`, one `isStandard` enforced by a partial unique index) + `CountryTaxConfig` (inclusive/exclusive, remitter, local label). An unrated category falls back to the standard rate, **never to zero**. Vendors do not choose a tax category; the platform sells ready-cooked food only.

**Finance** — provider-agnostic. `PaymentProvider` (catalog) → `CountryProviderAccount` (per country + environment) → routed per **capability** by `resolveProviderGateway`. **No fallback, ever** — a missing route is an explicit config error. Cross-country routing is structurally impossible (composite same-country FKs). `bankVerificationMode` is `PROVIDER` or `MANUAL` (Kenya is MANUAL: no provider can resolve a KES bank account); the two paths never fall back to each other. Adapters: Flutterwave, dLocal (account validation only, Nigeria only).

**Discounts** — vendor-owned, merchant-funded. Two types (`PERCENTAGE_OFF_ITEMS`, `AMOUNT_OFF_ORDER`). State derived. Targeting is **explicit flags**, never inferred from an empty list. **Offers never stack** — the customer gets the single best one. Caps are recorded but **not enforced** (nothing increments them: no orders).

**Customer** — mostly public.

**RATE LIMITING keys on a VERIFIED identity first, an address second** (`config/rateLimit.ts`, `config/rateLimitKey.ts`). Our Next apps call the API server-side, so the TCP peer is always a Next server; keyed on `req.ip` alone, each app's users shared ONE budget, and the old identity branch never fired because the limiters ran before any auth.

| order (bootstrap/app.ts) | does |
|---|---|
| `identifyCaller` | verifies the bearer token if present (verifyClerkJwt: RS256, exp/nbf, issuer, azp) and sets `req.rateLimitPrincipal`; NEVER refuses — auth chains still do. Memoised per request (`verifyRequestToken`), so the chain does not verify twice |
| `general` | every request once: verified user `user:<app>:<sub>` 600 · anonymous by IP 300 · trusted server's cache fills 3000 |
| `expensive` | ALSO once, only on presigns, CSV exports and image-processing writes (`isExpensiveRoute`): 60 |

> Each limiter is its own instance, mounted ONCE. Module routers mount none: `customer.dashboard` used to be the global instance mounted again (150, not 300).
> Vendor and ERP need no forwarding — every backend call they make carries the user's token (checked). Only the customer app's ANONYMOUS calls need an address: `INTERNAL_PROXY_SECRET` (backend) = `BACKEND_INTERNAL_KEY` (customer app) in `x-db-internal-key` lets that server name the visitor in `x-db-client-ip` (one IP, IPv6 → /56); without it the header is ignored. Anonymous cached calls send the secret only (Next's fetch cache keys on headers); signed-in calls send neither; free-text search is per-request. `CLIENT_IP_HEADER` names the header the customer app's EDGE sets. `TRUST_PROXY`: hop count 1–3 or IP/CIDR/named-range list for a proxy in front of the API; `true`, larger counts and junk are refused at boot.
> **Why a secret and not `trust proxy` for the Next servers:** address-based trust needs the Next servers' egress addresses, which nothing in this repo pins (serverless egress is not stable). On a private network with fixed addresses, `TRUST_PROXY=<their subnet>` plus the customer app setting `X-Forwarded-For` would replace the secret.
> **Clerk:** the manual-verification path is deliberate — `@clerk/express`'s clerkMiddleware is per-instance and we trust four instances. `CLERK_AUTHORIZED_PARTIES` is REQUIRED in production (startup refuses without it, and refuses any entry that is not a bare origin): every browser origin a session can be minted on — customer app, vendor dashboard, ERP, plus any www/custom/preview domain. Courier has no web frontend. A token with no `azp` passes (Clerk's rule); Backend-API-minted tokens carry none — verified with real dev tokens. The JWKS clients are rate-limited because tokens are verified before the limiter.
> **Verified with REAL Clerk tokens** (dev instances, Backend-API sessions, revoked after): each instance's token authenticates on its own route and is charged once to `user:<app>:<sub>` (600); a customer token on a vendor route is 401 and still charged to that user; a broken signature is charged as anonymous (300).
>
> **Before production traffic** — all are unset in dev:
> | owner | setting | must match |
> |---|---|---|
> | backend | `CLERK_AUTHORIZED_PARTIES` | the frontends' exact origins (startup fails without it) |
> | backend | `INTERNAL_PROXY_SECRET` (≥32 chars) | customer app `BACKEND_INTERNAL_KEY` |
> | customer app | `CLIENT_IP_HEADER` | the header its edge SETS and overwrites (`x-real-ip`, `cf-connecting-ip`) |
> | backend | `TRUST_PROXY` | only if a proxy/LB fronts the API |
> Without the secret pair, every anonymous visitor of ONE customer-app server shares 300 / 15 min (both sides warn at startup in production). Vendor and ERP need nothing.
> **In-memory stores stay correct only while ONE backend process serves the API.** The moment there are two (a second container, autoscaling, PM2/cluster mode), each counts separately — limits silently multiply by the process count and reset on restart — and a shared store (Redis) becomes necessary.
> **An edge-only alternative** (Cloudflare / nginx `limit_req` / Vercel firewall per IP in front of the customer app, with the API reachable ONLY from the app servers) could replace the forwarding, giving those servers one large budget at the API. It is not simpler here: no such edge is configured in this repo, and it would need the API to be private. Revisit if one is adopted. Two auth chains: `customerAuthChain` (required — account, addresses) and `attachCustomerContext` (optional, never rejects — browsing, storefront, cart). A verified token with no row yet returns **503 `CUSTOMER_ACCOUNT_PENDING`**, not 401. Discovery = customer's point in a serviceable zone **AND** outlet cleared to sell **AND** within the outlet's radius, same city. `customer.visibility.ts` is the one definition of what a customer may see (FLAGGED content is hidden; `isAvailable: false` is shown greyed-out, not hidden). The cart is **stateless**: the client holds ids and quantities, the server prices from scratch every call.

---

## Current state

Everything through the **customer backend module + customer frontend scaffold** is shipped and verified. Latest migration: `20260913120000_drop_outlet_cuisine_and_repair_city_timezones`.

**ERP meal moderation (Phase 9) and Meals hardening (Phase 10) are built** — see
*Backend conventions → Meal moderation*. Latest migration:
`20261001090000_meal_status_and_option_group_notifications` (Phase 10 adds none).
Verified: `pnpm check-types` 5/5, backend `vitest run` **759/759**,
`meals.adminModeration` smoke **80/80**, `meals` smoke 244/244 (+1 known pin),
`customer.meals` smoke **83/83**, `customer.cityBrowse` 23/23,
`customer.moderation` 14/14, `customer.cuisines` 16/16,
`marketing.heroPromotion` 40/40; `next build` clean in admin- and
vendor-dashboard as of Phase 9 (neither changed in Phase 10).
**The ERP and vendor pages were built, not walked in a browser** (no browser
automation in that session; Clerk sign-in needed).

**Vendor meal-workflow fixes + meal-owned option groups are built.** Latest
migration: `20261003090000_meal_owned_option_groups` (data step proven first by
`scripts/audit/verify-meal-owned-groups-migration.ts` in a rolled-back
transaction). Saving a meal stays on its page (create lands on the new meal);
every menu/outlet write EXPIRES its cache (#18); readiness writes
`router.refresh()` so the layout banner clears (`lib/queries/server-refresh.ts`);
Go live is a `success` Button (`--success-strong`, 5.17:1 — the shared
`--success` is 4.01:1 under white) and "Take offline" became a confirmed
**Pause storefront**; meal cards have a fixed 4:3 clipped frame; cuisine vs
dietary chips (`FoodTagChips`); vendor-facing zone names are `publicName`.
Verified: `pnpm check-types` 5/5, backend `vitest run` **783/783**, vendor
`vitest run` **42/42**, `meals` smoke **255/255** (+1 known pin),
`meals.adminModeration` **81/81**, `customer.meals` **83/83**, vendor
`next build` clean. Not walked in a browser. The 401 after creating a meal is
still open — see recurring bug class #20.

**Vendor sidebar** (`utils/constants/nav-links.ts`): titled, collapsible groups — Get started (until live) / Operations (once live) / Menu / Sell / Store / Account. **Locations live in Store**, not under Settings. Active link = the MOST SPECIFIC href covering the path (`activeNavHref`), so `/meals/options` does not also light Meals; a closed group is `inert`. **Placeholder links (Dashboard, Orders, Subscriptions, Meal plans) are deliberate and must not be removed** — `nav-links.test.ts` pins every destination. The footer card shows the signed-in vendor from the session (it used to hard-code another business's name).
**Meals Phase 2.1 — reason-backed controls, controlled Other, CITY→COUNTRY escalation, `/meals` ERP domain** (migration `20261007090000_meal_escalations`, additive). Verified: check-types 5/5, backend **889/889**, `meals.reasons` **68/68**, `admin.scope` 31/31, `meals.listings` 112/112, `meals.adminModeration` 92/92, `meals` 257/257 (+1 pin), `meals.menus` 51/51, `customer.meals` 84/84, `customer.moderation` 14/14, `customer.cityBrowse` 23/23, admin `next build` clean. Not walked in a browser.
**One admin, one scope** (migration `20261006090000_admin_single_scope`): verified check-types 5/5, backend **876/876**, `admin.scope` **31/31**, `meals.listings` 112/112, `meals.adminModeration` 92/92, `meals.menus` 51/51, `meals` 257/257 (+1 pin), `customer.meals` 84/84, `customer.moderation` 14/14, admin `next build` clean, `migrate diff` empty. Not walked in a browser.
**Dish/listing authority reconciled** (no migration): CITY admins can no longer take dish-wide actions or read other cities' dishes. Verified: check-types 5/5, backend **864/864**, `meals.listings` **112/112**, `meals.adminModeration` 92/92, `meals` 257/257 (+1 pin), `customer.meals` 84/84. **Not walked in a browser** (no browser automation in that session either).
**ERP meal listings + per-listing hide/suspend are built** (latest migration `20261005090000_meal_listing_hidden`, one nullable column). Verified: check-types 5/5, backend **860/860**, `meals.listings` **94/94**, `meals.adminModeration` 92/92, `meals` 257/257 (+1 pin), `customer.meals` 84/84, `customer.cityBrowse` 23/23, `meals.menus` 51/51, `customer.moderation` 14/14, admin `next build` clean. Not walked in a browser.
**Vendor menus, the sidebar regroup, portion screening and the money-input fix are built** (latest migration `20261004090000_vendor_menus`, purely additive). Verified: check-types 5/5, backend **803/803**, vendor **59/59**, `meals.menus` **51/51**, `meals` 257/257 (+1 pin), `meals.adminModeration` 92/92, `customer.meals` 83/83, `customer.cityBrowse` 23/23, `vendor.outlets` 21/21, vendor `next build` clean. Admin and customer apps typechecked, not built (their dev servers held :3002/:3003). Not walked in a browser.
**Money inputs use `MoneyInput`** (currency as an in-flow prefix): absolutely positioning a symbol over an input with fixed padding made "KSh" overlap the amount. Vendor outlet routes now 404 another vendor's outlet, and the vendor outlet response carries `VendorOutletZone` (public name + capabilities), never the zone `level` or `operationalStatus`. Verified after that pass: backend **789/789**, vendor **42/42**, `meals` 255/255, `meals.adminModeration` **92/92**, `customer.meals` 83/83, `vendor.outlets` **21/21**, check-types 5/5, vendor build clean.

Verified green as of the market-navigation pass: `pnpm check-types` 5/5,
backend `vitest run` **695/695**, `customer.address` smoke **68/68** (per-city
defaults, your cities, the controller mapper), `scripts/check-market-rules.ts`
in customer-app **19/19**, and a curl walk of every market route against
`next dev` (browse → pin → browse → deliver → unlaunched area → doorways →
`/continue`). **`next build` was NOT run in that pass** (a dev server held
:3003) and signed-in flows were verified by smoke, not in a browser.
Earlier: backend `vitest run`
**686/686**, seven smoke tests (40/40 promotions, 16/16 the real-R2 hero image,
**35/35 markets + areas + point resolution + city viewport**, 39/39 cuisine
imagery/create/pagination incl. a real R2 round trip and the prefix guard,
**51/51 the saved delivery-address contract**, 14/14 customer moderation,
**23/23 city-wide browsing**), and `next build` clean in `customer-app`.
**Walked live** against `next start` + the real backend: all four market modes
(delivery, browse-no-location, browse-chosen, other-city cookie), the
storefront, `/continue`, `/discover` and `/account`'s auth redirect. The prerendered HTML was checked directly for the
customer-facing area names, for the ABSENCE of every `ZoneLevel` string and of
the operational zone names, and for the live cuisine tiles.
> Latest migration: `20260926090100_drop_consumer_address_is_default`.
> **The customer journey is `/` → `/city` → a market → a point → the feed.**
> `/` asks for nothing and carries no invented marketplace data; discovery is
> city-scoped; navigation is contextual and path-driven; there is ONE location
> experience. See *Location and markets*.
> **The geography/address foundation is done** — saved addresses require a
> pin and derive their geography from it, a selected address can no longer fall
> back to unrelated coordinates, country readiness gates point resolution, and
> customer-facing serviceability names zones by `publicName`.
> **The customer location flow is built on it**: `/city`, the city page as a
> marketplace entry point, and `/city/[slug]/location` (Mapbox pin + browser
> GPS, **no geocoder** — a search box would simply be a third source of the one
> primitive, `latitude + longitude`, which is why there is no provider
> abstraction waiting for it). See *Location and markets*; do not re-litigate
> the model when building on it.
> **`next build` caches fetches in `.next/cache`**, so a backend change can be
> invisible to a rebuild — `rm -rf .next/cache` before trusting prerendered
> output after a data-shape change.

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

**`/` CARRIES NO INVENTED MARKETPLACE DATA**, and nothing invented may be
added back. The bands are `Hero` (a published promotion, or `FALLBACK_HERO`),
`Categories` (the real global catalogue), `HowItWorks`, `EditorialBand`,
`MealPlans`, `Markets` (the real `/geo/markets` list) and `CtaBand`.
- **`PopularDishes` and `NeighbourhoodKitchens` were DELETED, not restyled.**
  They rendered invented kitchens, ratings, prices and delivery times on the
  first screen anyone sees. They were not replaced with better placeholders
  either: a landing page has no location, so there is no honest answer to
  "what is near you" to give here at all. That question belongs to
  `/city/[slug]/discover`, where a point exists to answer it.
- **`MealPlans` explains the product and shows no inventory** — no plan names,
  no prices, no "Most popular". Its photographs are atmosphere, uncaptioned.
  Real plans belong on a CITY page when a meal-plan read exists, because a plan
  is sold by an outlet in a market and there is no global one.
- `Markets` is the only counting the page does (`n cities`), straight off the
  read, and it removes itself when the read fails or nothing is open — a
  heading over an empty row would read as "we deliver nowhere".
Full-width tinted bands use `.full-bleed` with an inner `.shell`; card rows are
a sideways-swipe `.rail` on phones and a grid from tablet up, so there are **no
carousel arrows and no client JS**.

**Hero (`components/home/hero/`)** — copy on the left with the PAGE's own
actions (an `actions` prop: `/` invites you to choose a city, a city page to
browse or set a location — a promotion decides the words above them and must
never decide whether there is a way forward); a square photo with a floating
offer card on the right; stacked text-first on phones. It holds no client code
at all. The photo uses `loading="eager"` + `fetchPriority="high"`,
not `preload`: on phones it starts below the fold. Served as AVIF, ~57 KB at
640px wide. **Image spec:** square **1600 × 1600**, JPEG or WebP at q85–90,
under ~600 KB, food centred and kept out of the bottom-left third (the offer
card covers it). One square image serves every screen size, so no separate
mobile crop is needed while the frame is square. `/discover` does not exist yet.

**The navbar, footer, layout and both auth pages are styled, in light and dark.**
The mobile sheet is: header (logo + close) → "Menu" links with icons → an
"Appearance" Light/Dark/System segmented control (a dropdown inside a dialog is
awkward on a phone) → a footer with the auth actions.

**Verified in the design pass:** `pnpm check-types` 5/5, backend `vitest run`,
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

**The image round trip is PROVEN against real R2.**
`scripts/smoke/marketing.heroImage.smoke.ts` does what the ERP does — presign,
`PUT` the bytes over HTTPS, let the server re-encode and publish the
derivative — then **fetches the public URL anonymously** and checks the bytes
decode as a 1600×1600 WebP served `immutable`. That last step is the point:
every earlier step can succeed while the object is still unreachable, and the
failure would only ever show up as a broken image in a browser.
> **What it cannot cover: the browser's CORS preflight on the presigned PUT.**
> Node sends none. Hero originals go to the PRIVATE bucket — the same one
> vendor menu photos already use — so if vendor uploads work in a browser, so
> will these. If the ERP upload fails while this smoke test passes, the
> bucket's CORS policy is the thing to fix.

**The hero renders every part as optional.** Only the headline and the photo are
guaranteed; an absent eyebrow, lede or CTA removes its line rather than leaving
a hole, and **nothing substitutes invented copy for a field an admin left
blank** — a storefront-written eyebrow above marketing-written copy is worse
than no eyebrow. The fallback hero's "20% off your first meal plan" and
"10,000+ happy food lovers" are **gone**, not hidden: there is no discount and
there are no customers yet (principle 11).

**The hero is LIVE on both `/` and `/city/[citySlug]`.** `/` is still `○`
static (the city page has since become `ƒ` — see *Market scope*), both on a 60s revalidate —
verified by building and reading the prerendered HTML, not by inspection: the
published promotion's copy appears in both, the city page carries its own
`We deliver in Nairobi` band, and the invented placeholder figures appear in
neither. A visitor with no location gets the global promotion, which is the
landing page's ordinary default.

> **MODULARITY — read this before building the next section.** Editorial Band,
> Categories, PopularDishes and the rest will repeat most of this shape, and
> almost none of it should be re-invented. Already generic and reusable as-is:
> `lib/images/transform.ts` (any square crop), `publicMedia.storage.ts`,
> `revalidateStorefront` (add a tag to the storefront's allowlist), the priority
> tiers in `packages/types/src/enums/marketing.ts`, `TableFilterBar` and
> `SearchableSelect`. What is hero-SPECIFIC and would need generalising: the
> `HeroPromotion` table itself, `HERO_CROP` (a non-square section needs its own
> spec and possibly two crops), the key prefixes, and `resolveHeroPromotion`'s
> assumption of ONE winner — a section showing a row of cards resolves to a
> LIST, which is a different function, not a parameter. Decide deliberately
> whether the next section is a second table or a `section` discriminator on a
> shared one; do NOT default to copying the module.

### Market scope: city, delivery point, browse — and the customer's cities

**THREE THINGS, THREE HOMES.** Collapsing any two is the bug this design
exists to prevent.

| | Where it lives | Decides |
|---|---|---|
| marketplace city | the URL, `/city/[slug]` | which market you are in. Never a location |
| delivery choice | cookie `db_delivery`, **one entry per market** | deliver to an address / a pin, or browse — on THIS device |
| customer's cities + defaults | `ConsumerMarket` (backend) | your cities, the default city, each city's default address — durable, every device |

**`db_delivery` is PER MARKET** (`lib/location/cookie.ts`):
`{ v: 2, markets: { "<slug>": { mode: "deliver" | "browse", target, at } } }`.
A choice belongs to a place, so switching city needs no rule at all — Berlin
has no entry, so Berlin browses, and Nairobi's choice is still there on the way
back. **Browse keeps the target**, so "Deliver to Home" is one click away again;
browsing never deletes, never changes a default, never touches another market.
An address target is its id ONLY (no coordinates, no label): it is resolved
against the caller's book on every request, so a signed-out visitor or the next
person on the browser sees nothing of it. Capped at 12 markets, oldest dropped.
`db_market` is the market this device was last in — the navbar chip,
`/continue` and the doorways.
> The pre-v2 single-location cookie (`db_location`, `browseCitySlug`) is gone;
> v1 values simply read as "nothing chosen".

**`resolveMarketChoice` (`lib/market/resolve.ts`) IS the rule, and it is pure:**
this device's choice for the market → else the CITY's default address → else
browse. A remembered address that is no longer in this city's book (deleted,
pin moved, signed out) falls through to the default rather than failing, and
the page names the address it actually used — "· your Nairobi default".

**`getMarketScope` (`lib/market/context.ts`) is the ONE per-request answer**,
`cache()`d, shared by the market bar and every section on the page:

| scope | when | data |
|---|---|---|
| `delivery` | a target whose point is SERVICEABLE and in this city | narrowed — backend applies city → the outlet's own zone → the outlet's radius |
| `unavailable` | a target we cannot deliver to (area not launched, paused, now in another city) | CITY-WIDE, with "We can't deliver to Home — …" said once in the banner. City inventory is never hidden because delivery is unavailable |
| `browse` | chosen, or nothing to deliver to | CITY-WIDE, no distance/ETA claims |

> An address's verdict comes from the session (resolved in the same request);
> only a pin costs a serviceability call. **Zone availability and the outlet's
> radius are separate facts**, and the frontend decides neither.

**EVERY MARKET ROUTE IS DYNAMIC, deliberately** (explicit direction: the city
page itself narrows once an address applies). The market LAYOUT reads the
cookie and the session, so the bar is server-rendered from the same scope as
the page — the old browser-side bar could never see a per-city default and
went stale after its own changes. Crawlers carry no cookie and get the
city-wide page, i.e. the SEO content; the anonymous reads underneath stay
fetch-cached. `/`, `/about` and `/city` stay static. The way back to a static
shell, if ever needed, is Partial Prerendering — never client-fetching the
scope.

**THE SECTIONS ARE WRITTEN ONCE** (`components/market/MarketSections.tsx`):
`PlacesRow`, `MealsRow`, `MealPlansRow`, `OffersRow`, `CuisinesRow`. Each takes
the scope, titles itself for the mode ("Places that deliver to Home" /
"Places in Nairobi"), distinguishes failed / empty / not built yet, offers
"Browse all of <city>" instead of a dead end when delivering, and links to its
focused page. The city page and `/discover` compose them; they do not branch.

| route | what |
|---|---|
| `/city/[slug]` | the introduction + SEO page: hero, mode strip, places, meals, plans, offers, catalogue tiles, areas, editorial |
| `/city/[slug]/discover` | canonical exploration: mode banner, search + cuisine + toggles (sort only when delivering) applied to every row |
| `/places`, `/offers` | the full live lists (`PlacesList`; offers = places with `hasOffer` pinned) |
| `/meals` | the full live list (`MealsList`): search, cuisine, `hasOffer`, sort when delivering, paged at 24 |
| `/meal-plans` | the full list — SAMPLE until the read exists |

> **"Offers", not "discounts"** in anything a customer reads — `Discount` is the
> schema's word (the Places-not-Outlets rule).
>
> **In browse mode the SORT control is absent, not ignored** — every ordering
> is distance- or ETA-derived. `freeDelivery` is offered in both modes (it is
> the outlet's configured fee); `maxDeliveryMinutes` in neither.
>
> **Cuisine tiles link with the cuisine ID, not the slug** — the loader forwards
> `?cuisine=` as `cuisineId`. `robots: noindex` on every market page except the
> city page and meal plans, which are the SEO surfaces.

**SAMPLE DATA: allowed for MEAL PLANS only, and fenced** (explicit direction;
meals went live in Phase 8 and their fixtures and `MarketMeal` were deleted).
Rules:
- Only `lib/data/market/sample/` holds fixtures, and only `meal-plans.ts`
  imports it. That loader is the ONE function to change when the backend read
  lands; its comment names the endpoint. `MarketMealPlan` in
  `lib/data/market/types.ts` is the contract that read must return.
- **Off in production builds** (`SAMPLE_DATA_ENABLED`; `MARKET_SAMPLE_DATA=1`
  forces it on for a demo). Off, the loaders return `not-available` and the
  sections say the listing is coming — no invented inventory reaches a real
  customer.
- Every section rendering sample data shows the `SampleBadge`; the kitchens
  are named "(sample)" and carry no outlet id, so no card links anywhere and no
  real vendor is shown a menu they did not write.
- The sample adapter SIMULATES delivery scoping with a fixed `reaches` flag —
  it never computes geography. Places, meals, offers and cuisines are LIVE.

**MEALS ARE LIVE, and the UI uses `DiscoveryMeal` / `MealDetail` directly** —
no frontend copy of either type. `getMarketMeals` (`lib/data/market/meals.ts`)
picks the endpoint from the scope exactly like places: `delivery` → the
located feed (token, never cached), `browse`/`unavailable` → the city feed
(anonymous, 60s). No fallback between them and none to sample data; a located
read's `AUTH_REQUIRED` / `ADDRESS_NOT_FOUND` get their own words.
- **`mealParams` (`lib/data/market/meal-params.ts`) is the one mapper**, pure,
  checked by `scripts/check-meal-params.ts` (11). `openNow` and `freeDelivery`
  are PLACES filters the meals API does not read: they are not in `MealsQuery`,
  `FeedFilters` takes `toggles={["hasOffer"]}` on the meals page, and on
  `/discover` the meals row says those chips apply to places only instead of
  listing meals under them.
- **A meal card links to `/meals/<mealId>`** — flat, like `/store`, because a
  meal id carries no city; the page links back to the market the BACKEND names
  (`meal.city.slug`). Storefront menu rows link there too. Read-only: modifier
  groups are shown as information (rule + per-option delta as sent), never a
  form. No delivery claim on it — the read takes no location (deferred, see
  *Next up*). `/meals` is a doorway like `/meal-plans`.
- A page past the end says so and links to page 1 with the filters kept — an
  empty `meals` with `total > 0` is neither "no matches" nor "nothing here".

**THE STOREFRONT IS BUILT, AND IT IS READ-ONLY ON PURPOSE.**
`/store/[outletId]` + `lib/data/storefront.ts` + `components/storefront/*`,
recovered from `30facf5` per the recover-don't-rewrite rule. The CART was
deliberately left out of the recovery (`components/cart/*`, `lib/cart/*`,
`app/api/cart/price`, and `ItemSheet`): there is no `Order` model, so an "Add
to cart" would price a meal with nowhere to send it. The menu is the honest
half and it is the half that makes every card in the app lead somewhere real —
a whole storefront currently ships zero JavaScript. `MenuItemCard` goes back to
`"use client"` when orders land.
> **The route is FLAT, not `/city/[slug]/places/[outletId]`.** An outlet id
> carries no city, so nothing on that page could verify the slug names the
> market the kitchen is actually in — a mismatched pair would render a
> storefront under the wrong market's name, which is the "the URL is not the
> location" mistake the whole geography model exists to prevent. The hero's
> back link goes through the `/discover` DOORWAY, which resolves the
> customer's OWN market rather than one inferred from a link they were sent.
> `robots: noindex` — live prices and availability, reached without a
> location.

**VENDOR-CREATED CATEGORIES ARE REFUSED** (explicit direction, after analysis).
A controlled vocabulary is what filters, facets and analytics run on — the same
reason vendor-created dietary tags were refused. `MenuSection` already IS
vendor-authored categorisation of a vendor's own menu, so the half that matters
exists. If a platform-wide merchandising axis is ever added (Breakfast,
Healthy, Family Size — orthogonal to culinary origin, and the only genuinely
missing piece is meal-plan taxonomy), vendors ASSIGN from it and never extend
it; expressive freedom belongs in search keywords, not navigable categories.
Gating category creation behind a subscription tier was considered and
rejected: it monetises the one thing that most degrades the taxonomy. Sell
placement, not vocabulary.

`public/design-reference/` now holds three files: `design.png` (the light
landing page), `dark-theme.jpg` (the dark palette's source — near-neutral
grounds, vivid orange) and `mobile-dark-theme.jpg`. Retuning the dark theme is
editing the `.dark` block in `globals.css` — Clerk follows automatically.

**The footer is built and shipped.** `Footer.tsx` +
`constants/links/footer-links.ts`, a Server Component on `--surface-subtle` so
it ends the page rather than running on from the page ground above it.
**EVERY HREF IN IT GOES SOMEWHERE.** It held fifteen links to `"#"`, which
reads as a finished footer and behaves as a broken one — a customer clicks
"Track an order", nothing happens, and the conclusion they draw is about the
platform. Groups now SHRINK rather than filling with placeholders, a column
that would be empty is gone, and the legal row and the social row are empty
arrays the component drops entirely. Add a link back the moment its page
lands; nothing in `Footer.tsx` changes either way.
> The social icons' `icon` is a NAME resolved to a component inside
> `Footer.tsx` — the data file is imported by a Server Component and only
> JSON-serializable values may cross that boundary (bug class #5).

`next dev` (Next 16) writes `AGENTS.md` and a one-line `CLAUDE.md` into each app
directory and re-creates them if deleted. They are framework notes, not project
rules — this file is the rulebook. Commit them or set `agentRules: false`.

**Data is entered by hand, not seeded** (explicit direction). Dev DB holds 1 vendor outlet, 1 dish, 0 consumers. Nairobi's two zones **do not tile the city** — an outlet placed outside them is correctly `AREA_NOT_LAUNCHED` and will not be discoverable.

### Location and markets

**MARKET and DELIVERY POINT are two different things, and collapsing them is
the trap this design exists to avoid.**

| | | |
|---|---|---|
| **Market** | country + city | coarse, cacheable, drives *merchandising* — which promotion, which city page |
| **Point** | latitude + longitude | precise, and the ONLY thing that can drive a feed, a fee, an ETA or an order |

`resolveCustomerLocation(point)` is the sole chokepoint for a customer
location and resolves by **point-in-polygon against city boundaries**, so a
`cityId` cannot drive discovery: the feed filters by city AND a bounding box
around the point AND each outlet's radius from it. A city is a market, not a
location.

> **Do NOT substitute `City.latitude/longitude` for a missing point.** The
> column is commented "centroid — Mapbox fly-to only" and it is wrong twice
> over: Nairobi's zones **do not tile the city**, so the centroid can land
> outside every zone and report `AREA_NOT_LAUNCHED` for a city we plainly
> serve; and any fee or ETA measured from it is a number we cannot stand
> behind (principle 11). The city page asks for an address instead.

**`GET /customer/v1/geo/markets` — no auth at all**, the same posture as the
hero endpoint and for the same reason: "which cities do you deliver to" is
asked before anyone has a reason to have an account, and the answer is
identical for everyone. Two filters, both of which fail silently if dropped:
the country must be **`readyForCustomerOperations`** (`status: ACTIVE` is set
when vendors can onboard, months before a customer can buy anything), and the
city must have a **usable boundary** (`findCityForPoint` skips a city with no
geometry, so listing one offers a choice that resolves to nothing — bug class
#4 in a different hat). Built on the CACHED city geometry, so the heavy
boundary JSON is read at most once a minute however often the picker opens.
It exposes names and slugs only; geometry is operational detail.

**`Serviceability` carries `citySlug` and `countryId`**, attached in `withCity`
and **derived from the resolved city, never from the caller** — a
client-supplied country would let a visitor ask for another market's
promotions. Before this, country-scoped hero promotions were unreachable from
the frontend no matter how well they were modelled: nothing ever handed it a
countryId.

**Detection is on a CLICK, never on load.** Browsers penalise unprompted
geolocation prompts and visitors resent them. `LocationPicker` is a client
leaf so the hero's copy and LCP image never wait on it, and it loads the city
list when it is **opened**, not when it mounts. The city dropdown is the
shadcn **Select** (grouped by country via `SelectGroup`/`SelectLabel`) — on
the unified `radix-ui` package the app already depends on, so it added nothing.
> A native `<select>` is still the better *mobile* control, and that trade was
> made knowingly for visual consistency. When the city count passes ~15 the
> right move is neither: a **Combobox** (Popover + Command) with search —
> `cmdk` is already a dependency.

**A refusal always comes with somewhere to go** (explicit direction).
`GET /customer/v1/geo/cities/:citySlug` returns the city plus the **named
areas** we operate in, and the picker fetches it when a point lands inside a
city we know but cannot serve. "Not at your address, but here, here and here"
beats making someone guess. A point outside every city has no city to
describe, so the city list opens instead.

> **`areas` is NAMES ONLY, and that is a security boundary, not a shortcut.**
> Published: the zone's name. Withheld: its `level`, its `operationalStatus`,
> its geometry, and whether the platform or the vendor carries the food. The
> coverage footprint itself is not a secret — every competitor publishes
> theirs and it is discoverable by typing addresses — but `ZoneLevel` is
> internal vocabulary that maps out delivery capability and expansion plans,
> and the polygons would hand over the footprint exactly rather than roughly.
> This extends the existing rule that `Serviceability` exposes `zoneName` but
> never `level`.
>
> **Which zones become an area:** `ZONE_CAPABILITIES[level].canListOnDemand`,
> read through the capability map and never as `level >= X`.
> `REGISTRATION_ONLY` is therefore excluded — vendors may sign up there and
> nobody may sell, so naming it would advertise coverage that does not exist.
> `operationalStatus` is deliberately **not** consulted: level is structural
> and status is temporal, the two are modelled as orthogonal, and this list
> answers the durable question. Someone standing in a suspended zone learns
> that from their own serviceability verdict, which is the right place for it.
>
> **`Zone.publicName` is a REQUIRED second name, and required is the point.**
> `Zone.name` is written by and for operations — the dev database held
> `"Karen-Langata-SouthC-Upperhill Area"` — and the storefront now names the
> areas it covers, so those strings would ship verbatim. An OPTIONAL column
> with a fallback to `name` looks safe and fails silently: nobody fills it in
> and ops vocabulary reaches customers anyway. The migration backfilled every
> row from `name` and then narrowed the column to NOT NULL, so a pre-existing
> zone carries a placeholder that reads like ops until someone edits it —
> visible and fixable, unlike a silent fallback.
>
> `getCityDetail` maps `zone.publicName` and **never** `zone.name`; the smoke
> gives every fixture a different value in each column so that can never pass
> by accident. Prettifying `name` by splitting on punctuation was considered
> and refused: it is string surgery on admin data and it mangles
> "Dar-es-Salaam".

**Picking a city sets NO cookie.** It navigates to `/city/[citySlug]`. Only a
real point — from the browser, checked for coverage — is stored. `POST
/api/location` does the check, writes the cookie and returns the verdict in one
round trip; the **verdict is never stored**, because coverage changes when an
admin edits a zone and a cached answer would quietly start contradicting the
pages rendered from it.

**A SAVED ADDRESS IS THE DURABLE DELIVERY DESTINATION — and `ConsumerAddress`
is the only model that holds one.** No second location table, and no
`currentAddressId` column: WHICH address is selected right now is per-DEVICE
state (the cookie's `addressId`), while `isDefault` is the durable preference,
and the two are allowed to differ. The three concepts stay separate on purpose:

| | | |
|---|---|---|
| marketplace city | URL (`/city/[slug]`) | merchandising only, never a destination |
| selected address | cookie `addressId` (per device) | authoritative when present |
| default address | `ConsumerAddress.isDefault` | durable, changes only when asked |

> **The pin decides the geography; the request does not.** `latitude` and
> `longitude` are **required** (NOT NULL as of
> `20260923090000_consumer_address_requires_pin`) — an address with no pin
> cannot take part in serviceability, so it is not a destination and this model
> does not store one. `countryId` is **derived from the resolved city**, and a
> supplied one that disagrees is refused with `COUNTRY_MISMATCH` rather than
> silently corrected (the `INVALID_SCOPE` rule again). The typed `city` column
> survives as PRINT COPY and decides nothing — it may legitimately disagree
> with `serviceability.cityName`. **No stored `cityId` and no stored `zoneId`:**
> both are re-resolved on every read, because a boundary redraw would make a
> cached one wrong with nothing to refresh it (principle 4).
>
> A save is refused on geography in exactly one case — a point inside **no**
> operating city (`OUTSIDE_COVERAGE`). Inside a city we know, the address saves
> whatever its zone says: "not launched yet" and "paused" are temporary and are
> re-answered on every read, while "nowhere near a market" will not change.
>
> Addresses span cities and countries freely. **`ConsumerAccount.countryId` is
> a home-market hint** adopted from the FIRST address and never overwritten —
> it must never become delivery authority, and nothing filters on it.

**DEFAULTS ARE PER CITY, AND "YOUR CITIES" IS STORED** (`ConsumerMarket`,
migration `20260926090000_consumer_markets`; `ConsumerAddress.isDefault` was
dropped by `…090100`). A customer has a default address in Nairobi AND one in
Mombasa, and a default CITY. The rule is the pure `resolveCustomerMarkets`
(`customer.markets.ts`, unit-tested):
- a city's default address = the stored choice while that address still
  resolves into the city, else the city's NEWEST address — a city with
  addresses always has one;
- the default city = the explicit choice, else the most recently SELECTED city,
  else the newest address's city. Selecting a city never makes it the default;
- a city that stopped operating is dropped from the list entirely.
> The CITY is stored on the market row and never on the address: a market row
> records a CHOICE, which a boundary redraw cannot invalidate, while an
> address's city is re-resolved from its pin on every read. A stored default
> address is therefore a claim, checked on read.
>
> Saving an address upserts that city's row and makes it the city default if it
> has none. Deleting clears the pointer (FK `SetNull`) and the newest remaining
> address takes over. A city is recorded as "yours" when the customer ENTERS it
> (`RememberMarket` in the market layout, once per switch, best-effort) or saves
> an address there. A cap on the number of cities is planned, not built.

**A SELECTED ADDRESS IS AUTHORITATIVE.** When an address is the target, only
its `addressId` is sent; the backend resolves the point from the row after
checking it belongs to the caller. Coordinates from anywhere else are never
substituted for it — a label saying "Home" over data ranked around somewhere
else is worse than no answer.

**Country readiness gates POINT RESOLUTION, not just the city list.**
`getOperatingCities` filters on `country.readyForCustomerOperations`, so a
country that is ACTIVE for vendor onboarding but not open to customers resolves
to **no city** — previously a visitor who supplied coordinates could be told a
market was serviceable and shown its outlets while that same market was
deliberately absent from every list offered to them.

**Customer-facing serviceability names a zone by `publicName`.**
`resolveCapabilities` lives in `@repo/geo`, is shared with vendor and admin, and
rightly returns the OPERATIONAL `zone.name`; `withCity` in
`customer.geo.service.ts` is the single boundary where the customer's copy is
chosen, and it swaps in `publicName` for every customer-facing serviceability
there is. Before this, the cookie label and the `/discover` header could read
`"Karen-Langata-SouthC-Upperhill Area, Nairobi"`.

**GEOGRAPHIC EXISTENCE AND OPERATIONAL AVAILABILITY ARE DIFFERENT ANSWERS**,
and the address book keeps both:

| The point is… | Verdict | Stored? |
|---|---|---|
| in a city, in a live zone | `SERVICEABLE` | yes |
| in a city, in no zone or a paused one | `AREA_NOT_LAUNCHED` / `AREA_PAUSED` | **yes** — "we know where this is and cannot serve it *yet*" is a delivery address and a demand signal for wherever we open next |
| in no operating city | `OUTSIDE_COVERAGE` | **no** — `countryId` is an FK into countries we operate in, so the row cannot even be typed honestly. Revisit with the account work |

> Never collapse "we do not operate there" into "we do not know where that is",
> and never let a stored address imply coverage: serviceability is resolved on
> every read and the customer is always told the truth about today.

**THE JOURNEY IS `/` → `/city` → a market → a point → the feed**, and each
step asks for exactly one thing:

| | | |
|---|---|---|
| `/` | `○` static | the brand, and a way into a market. Asks for NOTHING — no location prompt, no account, no cookie |
| `/about` | `○` static, 1h | what DailyBread is, globally, including what a meal plan IS. Replaced the global `/meal-plans` in the navbar |
| `/city` | `○` static, 1h | the market directory, straight from `/geo/markets`. Cities grouped under their country — **country is a heading, never a link**, because you cannot order from a country. No `/country/[slug]`, and adding one would invent a marketplace that does not exist |
| `/city/[citySlug]` | `ƒ` | the market's introduction: CITY/COUNTRY promotion, then every section in the market's scope (see *Market scope*). The SEO surface — crawlers get the city-wide version |
| `/city/[citySlug]/discover` | `ƒ` | canonical exploration — filters over a row of each thing, each with a way to see the rest |
| `/city/[citySlug]/places` | `ƒ` dynamic | the full list of places, filtered, sorted and paged |
| `/city/[citySlug]/meals` · `/offers` | `ƒ` | all meals (live) · every place running an offer (live) |
| `/meals/[mealId]` | `ƒ` | one meal at one place, read-only: gallery, price + tax line, options as information, links to its store and its market |
| `/city/[citySlug]/meal-plans` | `ƒ` | meal plans in this market (sample) + how plans work |
| `/city/[citySlug]/location` | `ƒ` | the delivery-point picker; seeds the map with this market's anonymous pin. A PAGE, not a sheet — a map is the whole task, it survives a refresh, and every empty state links to it |
| `/store/[outletId]` | `ƒ` | one storefront: the kitchen, its menu, its hours. Read-only until orders exist |
| `/continue` | route handler | where sign-in lands when not returning to a market page. Default city → device's last market → `/city` |
| `/discover`, `/meals`, `/meal-plans` | `ƒ` | doorways (`lib/market/doorway.ts`): device's last market → signed-in default city → `/city`. `/discover` **forwards the query string** — the landing page's cuisine tiles arrive with `?cuisine=` |

> **`/` NEVER ASKS FOR A LOCATION.** The picker used to sit in the hero, so the
> landing page's primary action was a geolocation prompt fired at someone who
> had not yet been told what DailyBread is or where it operates. Browsers
> penalise that and visitors resent it, and it asked the wrong question first:
> "where are you?" only matters once you know we are in your city. **Verified by
> build output, not by inspection** — the chunks containing `getCurrentPosition`
> are not referenced by `/`'s HTML. Keep it that way.

**NAVIGATION IS TWO BARS, AND THE SPLIT IS THE SCOPE RULE.** The global bar
changes CITY; the market bar changes WHERE IN THAT CITY. Neither does the
other's job.

| | | |
|---|---|---|
| global navbar | root layout, every route | brand · **`CityPicker`** · Our cities · About · theme · auth |
| **market bar** | `app/city/[citySlug]/layout.tsx` | city name + country · Overview · Discover · Meals · Meal plans · Places · Offers · **`DeliveryPicker`** |

| picker | lists | does |
|---|---|---|
| `CityPicker` | "Your cities" (backend order; default city first; each row says in words "Default city", "You're here", or both) then "All cities". Signed out: the device's last city as "Recently visited" | **navigates only**; carries no location. OUTSIDE a market it splits into **[★ Nairobi →][▾]** — the left half links straight to the HOME market (`resolveHomeMarket` in `lib/market/home.ts`: the account's default city, else the device's last market; the same answer `/continue` lands on, served by `/api/markets/home`), so every global page is one click from your city while `/` stays global |
| `DeliveryPicker` | your addresses resolved INTO THIS CITY (city default marked), an anonymous pin, "Browse all of <city>", "Add an address", sign-in / manage | writes through route handlers, then `router.refresh()`; props come from the server scope, so it cannot disagree with the page |

> `CityPicker` loads on OPEN (and reloads each open — "Your cities" changes as
> you move) and reads `db_market` after mount; only TEXT changes, never the
> tree (bug class #12). It shows a `CommandInput` only at 8+ cities.
>
> **On phones the delivery control shares the city's row** and the tabs get
> their own swipe row: a Radix popover inside the mobile Sheet would open in a
> portal the sheet blocks. The city chip stays in the navbar at every width.
>
> Icons for the market tabs are resolved inside the client `MarketTabs`, never
> passed from the server bar (bug class #5).
>
> **"Delivering to" is GREEN** (`success`), in the bar and in the page banner:
> it is the one state that decides where food goes, so it should be seen at a
> glance and a wrong address caught before an order. The green carries the
> tint, border and a solid icon disc; the WORDS stay `foreground`, because
> `success` on the light page is ~3.3:1 and fails AA as small text. Browsing is
> neutral, "can't deliver here" is `warning`.

**`/` HAS A WAY BACK, AND STAYS GLOBAL.** The hero's actions are
`HeroCityActions` (explicit direction): a first visit sees [Choose your city];
once `/api/markets/home` names a home market (default city, else this device's
last market) it becomes [★ Continue to Nairobi][Explore other cities]. A client
leaf rendering the first-visit row on the server, so `/` stays `○`; plain links
only, so the post-mount swap shifts no Radix ids. It shares one memoised
request with the navbar chip (`lib/market/home-client.ts`). The old photographic
`ContinueToCity` strip was removed, and with it the city picture
`/api/markets/home` returned (`lib/data/city-image.ts` is gone) — the response
is name + slug; add an image back when per-city imagery exists. "How DailyBread works" is NOT a hero button: the
`HowItWorks` section carries a one-line intro and links to **`/how-it-works`**
(`HOW_IT_WORKS_PAGE`), the full explanation — static, and saying only what the
app does today (no checkout/payment claims until they exist).

**A place's LOGO is drawn by `OutletMark` everywhere it identifies the place**
(place cards, meal cards, the meal page). The place card used to show only the
cover photo while meal cards showed the logo — same vendor-profile images, two
different pictures, so one restaurant looked like two. The cover stays the
card's photograph; the mark sits beside the name.

**THEY ARE "PLACES", NOT KITCHENS, RESTAURANTS OR OUTLETS.** The label a
customer reads for a sellable vendor location is **Places**, and the route is
`/city/[slug]/places`:
- **Kitchens** collides with a real domain term — `VendorType` is a catalog a
  country admin curates (commercial kitchen, restaurant, café) — and it
  misdescribes a café.
- **Outlet** is the schema's word. Shipping it is the `Zone.name` mistake again:
  operator vocabulary reaching a customer.
- **Restaurants** is the market convention in Kenya and would be wrong the day a
  home caterer or cloud kitchen joins — and those are the meal-plan
  differentiator.
- **Places** is true for every vendor type and reads naturally: "12 places
  deliver to Westlands".

> **There is no GLOBAL `/discover` page** — only `/city/[slug]/discover`, and
> the bare route is a doorway. Outside a market, "discover" could resolve
> nothing and could only show what a location-free page is allowed to show,
> which is nothing about supply. This supersedes the earlier "no discover page
> at all" note: inside a market every row is real, which is what earned it.
> Search across meals, places and cuisines is still the thing that will cut
> across all of them, and it is not built.

**A CONFIRMED PIN IS "SETTLED", AND THE UI MUST SAY SO.** The location page
tracks WHICH point the verdict belongs to (`confirmedKey`), not merely that one
exists. While the pin matches it, the confirm button is replaced by a summary
naming the area — leaving a live "Confirm this location" under a location the
customer has already confirmed, and possibly saved, invites them to re-ask a
finished question. Moving the pin clears both the verdict and the confirmation,
so the button returns for what is now a different place.

**Meal plans are CITY-SCOPED** — `/city/[citySlug]/meal-plans`. A `MealPlan`
hangs off an OUTLET, which sits in a city, so there is no global meal-plan
page to build: `/about` explains the idea, the market page answers it. The
city page lists nothing yet and **does not claim there are no plans** — that
would be a statement about inventory from a page that has not asked. When the
read exists it drops in there, scoped by the city and then narrowed by the
customer's point.

**`/meal-plans` and `/discover` are DOORWAYS**, kept for old links and shaped
identically: the location cookie's city → that market's page, otherwise
`/city`. Neither resolves anything itself, and neither invents a city for a
visitor who has not chosen one.

> **There is ONE location experience.** Every "where should we deliver?"
> moment links to `/city/[slug]/location`; the navbar picker SELECTS an existing
> address and never creates one.

**The map draws no zones**, unlike the vendor picker, which draws them on
purpose: a merchant choosing where to build needs the operating map, while
publishing the polygons to an anonymous page hands over the coverage footprint
exactly rather than roughly — the same boundary `areas` (names only) holds.

**The centroid opens the view and is never a pin.** `CityMarket.viewport`
(`center` + `bounds`) exists so the location map starts looking at the city;
`DeliveryMap` has no way to report a point the customer did not place, and the
smoke proves why by resolving a city's own centroid to `AREA_NOT_LAUNCHED`.
`bounds` is a bounding box, so it is a *view*, never a coverage claim —
membership is point-in-polygon on the server, every time.

**A pin in another city is answered, not overwritten.** The URL city decided
which map opened; the point decides which city it is in. When the two differ
the page names the resolved city and offers to switch marketplace — it never
relabels the point as the URL's city, and the URL never mutates to follow the
pin. `/discover`'s not-serviceable panel makes the same distinction: a known
city gets its name and a link back to its map, a point in no city gets the
directory.

`/` deliberately stays location-free: a first-time visitor has no cookie
anyway, so personalising it would pay a per-request render to serve the global
promotion almost every time. **No middleware redirect from `/` to a located
page** — `db_market` is not `httpOnly` precisely so the navbar chip can name the
customer's market and take them back in one click. Revisit when returning
traffic dominates; it is one middleware line.

City slugs are **globally unique**, so no country segment is needed. The route
is `/city/[citySlug]` rather than a bare `/[citySlug]` on purpose: a
root-level dynamic segment would catch every future route, and a city named
"orders" would break the app. An unknown slug resolves from the shared market
cache and 404s, so a bot probing paths costs one cached read.

**Landing bands split by whether they need a market.** `Hero`, `Categories`,
`EditorialBand` and `CtaBand` render on both `/` and `/city/*`; `MealPlans`
(the explainer) only on `/`. Anything about supply lives under a market, where
the scope decides whether it is city-wide or narrowed to a point.

### City inventory is not deliverable inventory

`discoverCityOutlets` (`GET /customer/v1/discovery/cities/:citySlug/outlets`)
answers "what does DailyBread sell in this city?" with NO point. Anonymous and
cached per market, so it is safe on a static page.

It enforces the same visibility as the located feed — the outlet must be
sellable and its OWN zone must permit trading (`outletAreaAllowsSelling`, read
through `ZONE_CAPABILITIES`, never `level >= X`) — and drops exactly one
filter: the customer's distance. A kitchen 40 km from the centre is city
inventory even though no address near the centre could order from it.

`distanceMeters`, `eta` and `platformDelivers` come back **NULL**, never
invented, and `DiscoveryOutlet` types them nullable for that reason;
`OutletCard` drops the line rather than guessing. `maxDeliveryMinutes` is the
one filter refused entry, because it needs an ETA — and it is refused entry
rather than silently ignored.
> The smoke proves the gap directly: a point in a live zone is SERVICEABLE and
> the located feed still returns nothing (the outlet's radius does not reach
> it) while the city browse lists that same outlet. It also routes a real
> query object through the REAL controller, because a filter added to a
> service can typecheck perfectly and never reach it (bug class #1) — verified
> by deleting the mapper line and watching that assertion, and only that
> assertion, fail.

**A FACET MUST COVER THE SAME GROUND AS THE FILTER IT DRIVES.**
`availableCuisines` counted VENDOR-PROFILE cuisine links alone, while
`mergeCuisines` prints the vendor's cuisines **plus the cuisines of the dishes
the outlet sells** on every card, and `buildFilterWhere` matches on both. A
vendor who tagged their dishes and not their profile therefore got cuisines on
every card, a working `?cuisineId=`, and **no chip to click** — the dev
database produced an empty facet on every feed in the app. `countCuisines` now
takes OUTLET ids and counts through `mergeCuisines`, once per outlet: the list
is outlets, so the number beside a chip must be outlets. Same class of silent
gap as a request field that never reaches its mapper.

### Cuisines — the storefront taxonomy

**Three states, and only one of them belongs on a filter chip.**

| | | |
|---|---|---|
| CATALOGUED | the `Cuisine` row exists | global catalog |
| ENABLED | an admin switched it on for a country | `CuisineCountry` |
| AVAILABLE | a sellable outlet actually carries it in a city | derived, stored nowhere |

`GET /customer/v1/catalog/cuisines?countryId=&limit=` answers the first two and
**deliberately not the third**: availability is a property of a PLACE and this
read is cached per market, so mixing them would make a cached answer depend on
live supply. The feed already computes real availability from its own result
set, and that is the right home for it — a filter chip returning nothing is a
dead end, a marketing tile is an invitation.

- **`/` passes no country** and gets the global catalogue. A landing page has
  no location and cannot honestly narrow anything.
- **`/city/[citySlug]` passes its country id** and gets what that market has
  switched on.
- Ordering is `imageKey asc, name asc` — cuisines WITH a picture first (Postgres
  sorts NULLs last), alphabetical within each group so the row is stable
  between renders instead of shuffling as imagery is added.

**The band removes itself when there is nothing to show.** It does not fall
back to invented cuisines: a taxonomy the platform does not have is exactly the
fabrication principle 11 refuses, and a tile leading to a cuisine nobody cooks
is worse than no tile. A cuisine with no picture renders a tinted initial, so
one missing image does not leave a hole in the row.

**Imagery is CUISINE-ONLY.** `Cuisine` and `DietaryTag` are otherwise
column-for-column identical and `admin.foodTag.service.ts` is written once and
dispatched across both — but a cuisine tile is a photograph and a dietary tag
is a badge. Giving `DietaryTag` dormant image columns to preserve the symmetry
would mislead whoever reads it next, so imagery lives in its own narrow
`admin.cuisineImage.service.ts` and the shared `CatalogDelegate` (structural,
selecting only the common fields) keeps working untouched.

**The crop is 512px square, not the ~150 the tile needs.** This is a MASTER
that `next/image` resizes per width; storing exactly today's tile size would
mean re-uploading every picture the first time a design shows a cuisine larger.
512 WebP is ~30-60 KB, so the headroom is nearly free. `MIN_SOURCE_EDGE` (900)
still applies even though the output is smaller — it stops a thumbnail someone
found being passed off as artwork.

**Catalogue imagery needs GLOBAL scope**, the same rule the catalogue's name
and description already follow. A country lead curates which cuisines their
market offers; they do not re-photograph the platform's vocabulary.

**ERP routes mirror marketing exactly**: `/food-tags/cuisines/new`,
`/food-tags/cuisines/[slug]` (read-only, ships no uploader) and
`/food-tags/cuisines/[slug]/edit` (details + picture). **Cuisines use pages;
dietary tags keep the Sheet** — a dietary tag is a name and a sentence, which
is what a Sheet is for, while a cuisine also carries a photograph to upload,
preview and replace, and an upload that dies when a sheet is dismissed is a
bad trade.

> **The picture saves on its own**, separately from name and description.
> Nothing here has to change together, and an upload that only landed when
> some other form was submitted would be lost by a navigation.
>
> **Creating lands on `/edit`, not on the details page** — so the picture gets
> added while the admin is still thinking about that cuisine, instead of
> leaving a catalogue entry that renders a blank tile until somebody notices.
> That redirect depends on `createFoodTag` RETURNING THE SLUG; the smoke
> asserts it, because if it ever stopped the page would navigate to `/edit` on
> an empty segment and 404, which no type would catch.
>
> **A details page reached only by a hover underline reads as a page that does
> not exist.** The cuisine name was a link and nothing said so, and it was
> reported as missing. Rows now carry an explicit "See more". Worth
> generalising: a row that has somewhere to go should say so in words.

**THE CUISINE PAGES: global is the catalogue, the city is supply.**

| route | shows | a tile leads to |
|---|---|---|
| `/cuisines` | `○` every active cuisine | `/cuisines/<slug>` |
| `/cuisines/[slug]` | `●` per cuisine: what it is + "where to find it" (customer-open countries that enabled it × our cities) | that city's discover page, filtered |
| `/city/[slug]/cuisines` | `ƒ` the COUNTRY's enabled catalogue × this market's SUPPLY in its scope ("3 places" / "3 places reach you") | discover filtered — only when something is cooked; otherwise a dimmed, non-link tile |

> **The landing band's "All cuisines" goes to `/cuisines`, never to a city.**
> It used to share the tiles' base path, so "see all" on `/` walked the visitor
> into their default city's discover page — a question they had not asked.
> `Categories` now takes `citySlug` and derives both links from it.
>
> **One global details URL, and places are NOT on it** (pushback on "one page
> whose places vary by city"): a URL whose content changes with the reader's
> cookie cannot be shared or indexed honestly. Places belong to a market, so
> the city-scoped details page, when built, is `/city/<slug>/cuisines/<slug>`
> (delivery-aware like every market page) and the global page links to it.
>
> The list read is PAGED with a TOTAL (`page`/`pageSize`, `limit` kept as an
> alias); it used to stop silently at 48. Directories fetch every page, so
> nothing is truncated and `/cuisines` stays static. `description` joined the
> public payload deliberately — the cuisine-image smoke pins the key set.
> `GET /catalog/cuisines/:slug` lists only countries READY FOR CUSTOMERS.
> Smoke: `customer.cuisines.smoke.ts` (16).

**Pagination is server-side at 10 a page** (`FoodTagsCatalog` PAGE_SIZE, the
backend's `page`/`pageSize`/`totalPages`). Asserted in the smoke by checking
page 2 shares no row with page 1 — a client-side slice of one over-fetched
list would pass every other check.

### Next up
1. **The `Order` model** — the single largest schema decision left, and the blocker for: discount redemption and cap enforcement, commission actually charged, `resolvePayoutDestination` having somewhere to send money, `getOutletMealPlanReadiness` gating anything, and the vendor order feed. Design it deliberately *with* the Payments boundary rather than incidentally as whatever checkout needs.
2. **Payments module** — separate from tax and finance, per explicit direction. Finance keeps provider config/routing/credentials/adapters; Payments takes payment-intent/attempt/capture/refund orchestration, webhook reconciliation and `ProviderWebhookEvent`.
3. **Meal-plan cleanup, before orders** — `MealPlan` is outlet-scoped while `MenuItem` is vendor-scoped, and `MealPlanMeal` has **no day column** despite the concept being one meal per delivery day. Meal plans are this platform's differentiator; an Order model designed without them in view will need reshaping.
4. **The cart, with orders and not before** — recover `components/cart/*`, `lib/cart/*`, `app/api/cart/price` and `components/storefront/ItemSheet.tsx` from `30facf5` and put `MenuItemCard` back to `"use client"`. It was deliberately left out of the storefront recovery: a working "Add to cart" is a promise of a checkout that does not exist. The backend's `POST /cart/price` is already built and stateless.
5. **The meal-plan market read the sample layer still stands in for** — city-wide and point-scoped, resolved through the outlet like places and meals. Replace the body of `lib/data/market/meal-plans.ts`, move `MarketMealPlan` into `@repo/types`, delete `lib/data/market/sample/`. Needs the `MealPlanMeal` day column first. (Meals: done in Phase 8.)
6. **Delivery verdict on storefront and meal detail** (deferred from Phase 8 by explicit direction). The backend half is DONE — `GET /outlets/:id` returns `city` and accepts `addressId`/a point, answering `delivery.deliversHere`. What remains is the frontend: read this market's cookie choice for `store.city.slug` (or `meal.city.slug`) and ask again. `GET /meals/:id` takes no location, so meal detail would use the storefront verdict for its outlet. Until then neither page claims delivery.
7. **Outlet logos** (decided against for now). `Outlet.avatar` / `coverBanner` / `images` are DORMANT foundation columns: nothing writes them, no pipeline backs them, and their format is unknown — do not reuse them. The bounded shape when wanted: an `OUTLET_LOGO_PROFILE` on the existing `ImageProfile` pipeline (public WebP, like `MENU_LOGO_PROFILE`), nullable `Outlet.logo*` columns, the outlet editor's uploader, and `logoUrl = outlet logo ?? vendor logo` in the customer presenters — the contract already has `logoUrl`, so no response shape changes. Drop the dormant columns in the same migration.
8. **Cap on "your cities"** (planned): evict the oldest non-default `ConsumerMarket` row in `selectMarket`.

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
- **An authoring timezone for offers whose vendor spans timezones.** An offer's
  `startsAt`/`endsAt` are instants, and the vendor form enters them on the
  outlets' shared timezone (`getDiscountContext().timeZone`). When a vendor's
  outlets span zones there is no single right one, so the form falls back to the
  browser clock and says so. Daily windows are unaffected — they are always read
  on each outlet's own clock. Deliberately left out of Phase 6 (explicit
  direction): the fix is a schema decision (a zone per offer, or per-outlet
  dates), and no vendor spans timezones yet.
- **Sub-national tax rates.** Extension point is a nullable `cityId` + partial unique index; `resolveRateBps` is the only function that changes. No launch market needs it.
- **Vendor tax-registration status** — belongs to onboarding, which already captures the IDs.
- **Effective-dated commission schedules** — the scalar + audit-log model is sufficient; wait for a real pricing need.
- **Free-text "Other" category / vendor-created dietary tags.** Refused deliberately: a controlled vocabulary is what filters, facets and analytics run on, and a dietary tag is a *safety claim*. The right shape is a "request a tag" suggestion queue — not built.
- **KYC / PEP screening / data-retention tooling** — blocked on business and legal decisions, not on code. Do not invent a retention period.
- **City boundary/service-area Mapbox UI** and `Outlet.serviceMode` computation (`serviceMode`/`isUnzoned` were dropped as dead).
- **Admin-side image moderation** — needs an `ImageModerationProvider`. Photo
  takedown belongs with it: a soft-deleted or banned dish's public WebP master
  stays fetchable by URL until then.
- **Hard-delete integrity for dishes.** `Meal → MenuItem` and
  `MealPlanMeal → Meal` are `onDelete: Cascade`, so a HARD delete of a dish
  would silently empty meal plans (pinned as a `known(...)` line in
  `meals.smoke.ts`). No application path hard-deletes a dish, meal, outlet or
  vendor, so nothing reaches it today. The fix (`NoAction` on `MealPlanMeal.meal`,
  which still lets a whole-vendor delete cascade) belongs in the meal-plan
  cleanup in *Next up*, which reshapes `MealPlanMeal` anyway.
- **Orphaned meal-image objects.** Deleting a replaced photo's two objects is
  best-effort after commit and logs on failure; nothing sweeps what it misses.
  Only the staging prefix has a lifecycle rule. Add a sweep when volume
  justifies a job.

### External-API pause points
Each is a hard stop where the user provisions keys; each is then one adapter file behind an existing seam.
**Payment execution** (collection + payout providers, encrypted per-country credentials, internal ledger, idempotency, webhooks) · **Email** (`sendEmail` is the seam; swap SMTP for Resend/Postmark/SES) · **Content moderation** (`ContentModerationProvider`; `bad-words` is the current impl) · **Image moderation** (new interface needed) · **Document OCR** (new interface + `expiryDateSource`/`expiryDateConfidence` fields).

---

## Working agreement

Recon before building. Push back when the request is wrong, and say why. Copy Uber Eats / DoorDash / Bolt Food where a convention already exists — meal plans are the one part that is genuinely ours. Ask when two readings would produce materially different work; otherwise decide, state the assumption, and proceed.

**A feature is not done because it typechecks.** Every pass ends with: typecheck all apps, `vitest run`, and a **smoke test against the dev database that exercises every new Prisma query and cleans up after itself** — sweeping strays from an aborted earlier run before it starts. Assert on the *reason* a thing failed, not merely that it did: a test that passes because an unrelated error leaked is a test that proves nothing.
