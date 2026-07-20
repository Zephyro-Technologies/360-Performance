# 360 Performance

A Supabase-backed monorepo for a motorsports parts business: a public storefront and an
internal B2B dashboard, sharing **one** Postgres database.

- **`apps/web`** — the public storefront. Reads the database as the `anon` role,
  published data only, strictly read-only. There is no cart and no checkout; enquiries are
  handed off to WhatsApp.
- **`apps/admin`** — the internal dashboard and the only authoring tool: orders, invoicing and
  payments, purchasing, inventory and catalogue, customers, suppliers, expenses, investors,
  analytics and blog. Users sign in and act under server-enforced roles.

Financial integrity lives in the **database**, not the client: money totals, COGS, tax, FIFO
stock draws and profit splits are computed by Postgres functions and triggers, and the ledgers
(payments, stock movements, payouts, vendor advances) are append-only — corrections are
reversal rows, never edits or deletes.

## Layout

```
apps/admin              @360/admin      dashboard (React + Vite + TanStack Query)
apps/web                @360/web        storefront (React + Vite)
packages/ui             @360/ui         shadcn/ui primitives, sanitized Markdown renderer
packages/lib            @360/lib        formatting + WhatsApp deep links (no dependencies)
packages/supabase       @360/supabase   client factory, generated DB types, storage URLs
packages/rls-tests      @360/rls-tests  row-level-security negative suite (runs against a live DB)
supabase/               migrations, edge functions, seed, config
```

`@` resolves to each app's `src/`. The internal `@360/*` packages ship TypeScript source and are
transpiled by Vite — do not pre-bundle them, or Tailwind will not see their class names.

## Stack

React 18 · TypeScript · Vite 6 · Tailwind CSS 4 · React Router 7 (data mode) · zod ·
TanStack Query (admin) · Supabase (Postgres, RLS, Auth, Storage, Edge Functions).

## Getting started

Requires **Node ≥ 20**, **pnpm 11**, and Docker (for the local Supabase stack).

```bash
pnpm install

# Environment: copy the template into each app and fill in your Supabase project values.
cp .env.example apps/web/.env.local
cp .env.example apps/admin/.env.local

pnpm dev:admin      # dashboard
pnpm dev:web        # storefront
```

Only `VITE_*` variables reach the browser, and only the **anon** key belongs there. The
service-role key is used exclusively by Edge Functions and CI, and a production build fails
fast if the Supabase URL or anon key is missing.

## Commands

```bash
pnpm dev:admin | pnpm dev:web   # run one app
pnpm typecheck                  # tsc across both apps and the shared packages
pnpm lint                       # eslint
pnpm test                       # unit tests per app
pnpm build                      # production builds
pnpm ci                         # typecheck + lint + test + build
```

## Database

The local stack runs on offset ports (API `54421`, database `54422`).

```bash
supabase start                  # boot locally, applying migrations + seed
supabase migration up           # apply new migrations
supabase db reset               # replay everything from scratch
supabase gen types typescript --local > packages/supabase/src/types.ts
```

After any schema change, regenerate the types. If you add an internal table, revoke `anon`
from it and add it to the RLS suite — the security tests are what stop private data reaching
the public site.

```bash
supabase start                              # required: the suite runs against a real database
pnpm --filter @360/rls-tests test:rls
```

## Deployment

Both apps deploy to **Cloudflare Workers** as static assets — one Worker per app, each
configured by its own `wrangler.jsonc`. Security and caching headers ship with the build via
`apps/*/public/_headers`, so there is no host-side configuration to keep in sync.

| Worker | Root directory | Build command | Deploy command |
| --- | --- | --- | --- |
| `360-performance-web` | `apps/web` | `cd ../.. && pnpm --filter @360/web build` | `npx wrangler deploy` |
| `360-performance-admin` | `apps/admin` | `cd ../.. && pnpm --filter @360/admin build` | `npx wrangler deploy` |

Non-production branches use `npx wrangler versions upload`, which uploads a version and
returns a preview URL without promoting it to production.

Set `PNPM_VERSION` to match `packageManager` in `package.json` as a build variable — the build
image ships an older pnpm and does not read `packageManager` or `engines`. Node is pinned by
`.node-version` at the repository root.

The storefront's build additionally pre-renders per-product and per-post metadata, plus
`sitemap.xml` and `robots.txt`, so pages preview correctly for crawlers that do not execute
JavaScript. That step needs `VITE_SITE_URL`, `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
present **at build time** — without them it skips silently and every shared link previews as
the homepage.

## Licence

Proprietary. See `apps/*/ATTRIBUTIONS.md` for third-party notices.
