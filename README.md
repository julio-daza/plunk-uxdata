# plunk-uxdata

[Plunk](https://github.com/useplunk/plunk) — the open-source email platform by
[useplunk](https://www.useplunk.com) — rebuilt with **Uxdata** branding (name, logo,
favicons) for Uxdata's self-hosted instance (dashboard `plunk.uxdata.co`, API
`plunk-api.uxdata.co`).

This repo does **not** fork Plunk. It holds only the branding and a patch script; CI
checks out the upstream tag, applies the patch and builds the upstream Dockerfile.
Plunk is licensed under the **GNU AGPL-3.0** (see [`LICENSE`](LICENSE), copied from
upstream, copyright its authors). Because the modified program is served over a network,
its complete corresponding source is: upstream at the tag in [`UPSTREAM_VERSION`](UPSTREAM_VERSION)
+ the changes in this repository (`patch/`, `brand/`). Every image carries the commit it
was built from (`org.opencontainers.image.revision`).

## Layout

| Path | What |
| --- | --- |
| `UPSTREAM_VERSION` | Upstream git tag that is built (e.g. `v0.15.0`). |
| `BRAND_REVISION` | Integer, bumped on every change of this repo for the same upstream version. |
| `brand/src/` | Uxdata source SVGs (isotipo + wordmark). |
| `brand/web/` | Generated files copied over `apps/web/public/` (logo, favicons, PWA icons, og image). |
| `brand/generate.mjs` | Regenerates `brand/web/` (`cd brand && npm install && node generate.mjs`). Local only. |
| `patch/apply.sh` | `patch/apply.sh <upstream-checkout>`: copies the assets and runs `patch/brand.mjs`. |
| `patch/brand.mjs` | Anchored string replacements ("Plunk" → "Uxdata" in user-visible text only) + a guard. |
| `.github/workflows/build.yml` | Build → `ghcr.io/julio-daza/plunk-uxdata:<version>-uxdata.<rev>` → optional deploy. |

What is rebranded: browser title/meta/PWA name, favicons, the logo and name in the
dashboard, login/signup/reset/verify and onboarding screens, the public
unsubscribe/manage/subscribe pages ("Sent with Uxdata"), dashboard copy, and the system
emails Plunk sends to dashboard users (logo, footer, verification text). What is **not**
touched: code identifiers, `@plunk/*` packages, `X-Plunk-*` headers, env vars, the DB,
the docs wiki, and texts only reachable with Stripe billing on (off when self-hosting).

## Safety nets (why upgrades are cheap)

- Every replacement names the exact string it expects; if upstream moved it, `apply.sh`
  fails and prints the missing anchor.
- After replacing, a guard scans `apps/web/src`, `apps/web/public`,
  `packages/email/src` and `packages/ui/src` for any "Plunk" left in a non-comment line. Anything not listed in
  `ALLOWED_LEFTOVERS` fails the build — a new upstream string is caught, not shipped.
- `apply.sh` refuses a checkout whose tag differs from `UPSTREAM_VERSION`, and a missing
  upstream asset.
- CI refuses to overwrite an existing version tag built from another commit.

## Build and deploy

- Push to `main` → builds and pushes `:<version>-uxdata.<rev>` and `:sha-<commit>`.
- Deploy (after `uxdata-infra` pins that exact tag in `stack/docker-compose.yml` and is
  synced): `gh workflow run build.yml -f deploy=true`. It reuses the already built image,
  moves `:latest`, and calls the VPS forced command `deploy plunk <tag>` (health check on
  `http://plunk:8080/health`, automatic rollback to the previous image).
- Secrets: `UXDATA_DEPLOY_KEY`, `UXDATA_KNOWN_HOSTS` (same as every Uxdata app repo; see
  the uxdata-infra README).

## Bump the upstream version

1. Read the upstream release notes (Prisma migrations run on every start and are
   forward-only).
2. `echo v0.X.Y > UPSTREAM_VERSION`, `echo 1 > BRAND_REVISION`.
3. Dry run locally:
   `git clone -q --depth 1 --branch v0.X.Y https://github.com/useplunk/plunk /tmp/plunk && patch/apply.sh /tmp/plunk`.
   Fix any missing anchor / new leftover in `patch/brand.mjs`, re-run until it prints
   `branding OK`.
4. Commit + push → CI builds `0.X.Y-uxdata.1`.
5. In `uxdata-infra`: pin `ghcr.io/julio-daza/plunk-uxdata:0.X.Y-uxdata.1`, commit,
   `scripts/sync.sh`, then `gh workflow run build.yml -f deploy=true` here.

Brand-only change (same upstream): bump `BRAND_REVISION`, then steps 4-5.

## Rollback

Upstream image: set `image: ghcr.io/useplunk/plunk:0.15.0` (or the previous
`plunk-uxdata` tag) for `plunk` in `uxdata-infra/stack/docker-compose.yml`, sync, and on
the VPS `sudo docker compose up -d plunk`. Same DB, same env: branding is the only
difference between the images.
