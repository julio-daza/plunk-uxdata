// Applies the Uxdata branding to a clean Plunk checkout. Called by patch/apply.sh.
//
//   node patch/brand.mjs <upstream-dir> <dashboard-url>
//
// Two safety nets so an upstream upgrade never ships a half-branded dashboard:
//   1. Every replacement names the exact anchor it expects. If an anchor is missing
//      (upstream renamed/moved it) the script fails and lists it.
//   2. After replacing, a guard scans the user-facing sources for any "Plunk" still in
//      a string/JSX line. Anything not in ALLOWED_LEFTOVERS fails the build, so NEW
//      upstream strings are caught instead of silently shipping.
// Idempotent: an anchor that is already branded counts as applied.
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';

const [, , root, dashboardUrl] = process.argv;
if (!root || !dashboardUrl) {
  console.error('usage: node patch/brand.mjs <upstream-dir> <dashboard-url>');
  process.exit(64);
}

const NAME = 'Uxdata';
const W = 'apps/web';

// [file, from, to, min occurrences]. `from` is an exact string, not a regex.
const REPLACEMENTS = [
  // Browser title, meta, PWA name
  [`${W}/src/pages/_app.tsx`, 'titleTemplate="%s | Plunk" defaultTitle="Plunk | Email Platform Dashboard"', `titleTemplate="%s | ${NAME}" defaultTitle="${NAME} | Email"`, 1],
  [`${W}/src/pages/_app.tsx`, "titleLabel !== 'Plunk'", `titleLabel !== '${NAME}'`, 1],
  [`${W}/src/pages/_document.tsx`, 'content="Plunk | Email Platform Dashboard"', `content="${NAME} | Email"`, 3],
  [`${W}/src/pages/_document.tsx`, 'with Plunk, the open-source email platform.', `with ${NAME}.`, 3],
  [`${W}/src/pages/_document.tsx`, 'content="https://next-app.useplunk.com/api/og?title=Email%20Platform%20Dashboard"', `content="${dashboardUrl}/assets/og.png"`, 2],
  [`${W}/src/pages/_document.tsx`, '<meta name="apple-mobile-web-app-title" content="Plunk" />', `<meta name="apple-mobile-web-app-title" content="${NAME}" />`, 1],
  [`${W}/src/pages/_document.tsx`, '<meta name="application-name" content="Plunk" />', `<meta name="application-name" content="${NAME}" />`, 1],
  [`${W}/src/pages/_document.tsx`, 'color="#5bbad5"', 'color="#000000"', 1],
  [`${W}/public/favicon/site.webmanifest`, '"Plunk"', `"${NAME}"`, 2],

  // Logo + name in the dashboard chrome, the full-screen loader and the auth/onboarding screens
  ['packages/ui/src/components/atoms/Loader.tsx', 'alt="Plunk"', `alt="${NAME}"`, 1],
  [`${W}/src/components/DashboardLayout.tsx`, 'alt="Plunk"', `alt="${NAME}"`, 2],
  [`${W}/src/components/DashboardLayout.tsx`, 'text-neutral-900">Plunk</h1>', `text-neutral-900">${NAME}</h1>`, 2],
  [`${W}/src/components/onboarding/OnboardingLayout.tsx`, 'text-neutral-900">Plunk</span>', `text-neutral-900">${NAME}</span>`, 1],
  [`${W}/src/pages/auth/login.tsx`, 'text-neutral-900">Plunk</span>', `text-neutral-900">${NAME}</span>`, 1],
  [`${W}/src/pages/auth/signup.tsx`, 'text-neutral-900">Plunk</span>', `text-neutral-900">${NAME}</span>`, 1],
  [`${W}/src/pages/auth/reset-password.tsx`, 'text-neutral-900">Plunk</span>', `text-neutral-900">${NAME}</span>`, 1],
  [`${W}/src/pages/auth/verify-email.tsx`, 'text-neutral-900">Plunk</span>', `text-neutral-900">${NAME}</span>`, 1],
  [`${W}/src/pages/projects/create.tsx`, 'text-neutral-900">Plunk</span>', `text-neutral-900">${NAME}</span>`, 1],

  // Public pages recipients see (unsubscribe / manage / subscribe): "Sent with <provider>"
  [`${W}/src/components/list-management/ListManagement.tsx`, '\n        Plunk\n      </a>', `\n        ${NAME}\n      </a>`, 1],

  // Dashboard copy
  [`${W}/src/components/TeamSettings.tsx`, 'Their Plunk account', `Their ${NAME} account`, 1],
  [`${W}/src/components/DomainsSettings.tsx`, 'instead of a Plunk one', `instead of a ${NAME} one`, 1],
  [`${W}/src/pages/settings/index.tsx`, 'integrate with the Plunk API', `integrate with the ${NAME} API`, 1],
  [`${W}/src/pages/index.tsx`, 'Use these keys to integrate with Plunk', `Use these keys to integrate with ${NAME}`, 1],
  [`${W}/src/pages/templates/create.tsx`, 'no Plunk footer', `no ${NAME} footer`, 1],
  [`${W}/src/pages/templates/create.tsx`, 'Use the Plunk variables', `Use the ${NAME} variables`, 1],
  [`${W}/src/pages/templates/[id].tsx`, 'no Plunk footer', `no ${NAME} footer`, 1],
  [`${W}/src/pages/templates/[id].tsx`, 'Use the Plunk variables', `Use the ${NAME} variables`, 1],
  [`${W}/src/pages/campaigns/create.tsx`, 'no Plunk footer', `no ${NAME} footer`, 1],
  [`${W}/src/pages/campaigns/create.tsx`, 'Use the Plunk variables', `Use the ${NAME} variables`, 1],
  [`${W}/src/pages/campaigns/[id].tsx`, 'no Plunk footer', `no ${NAME} footer`, 1],
  [`${W}/src/pages/campaigns/[id].tsx`, 'Use the Plunk variables', `Use the ${NAME} variables`, 1],
  [`${W}/src/pages/campaigns/[id].tsx`, 'Plunk will send it for you', `${NAME} will send it for you`, 1],
  [`${W}/src/pages/onboarding/index.tsx`, 'Wire Plunk into your app', `Wire ${NAME} into your app`, 1],
  [`${W}/src/pages/onboarding/index.tsx`, 'Welcome to Plunk', `Welcome to ${NAME}`, 2],
  [`${W}/src/pages/onboarding/index.tsx`, 'How do you plan to use Plunk?', `How do you plan to use ${NAME}?`, 1],
  [`${W}/src/pages/onboarding/developer.tsx`, "'Hello from Plunk'", `'Hello from ${NAME}'`, 1],
  [`${W}/src/pages/account/index.tsx`, 'delete your Plunk account', `delete your ${NAME} account`, 1],
  [`${W}/src/pages/account/index.tsx`, 'sign up again to use Plunk', `sign up again to use ${NAME}`, 1],

  // /api/og image (link previews of dashboard pages)
  [`${W}/src/pages/api/og.tsx`, '\n              Plunk\n            </span>', `\n              ${NAME}\n            </span>`, 1],
  [`${W}/src/pages/api/og.tsx`, '\n            next-app.useplunk.com\n', `\n            ${new URL(dashboardUrl).host}\n`, 1],

  // System emails the platform sends to dashboard users (verification, password reset, domain status)
  ['packages/email/src/common/Header.tsx', 'src="https://www.useplunk.com/assets/logo.png"', `src="${dashboardUrl}/assets/logo.png"`, 1],
  ['packages/email/src/common/Header.tsx', 'alt="Plunk"', `alt="${NAME}"`, 1],
  ['packages/email/src/common/Footer.tsx', 'This email was sent by Plunk. .', `This email was sent by ${NAME}.`, 1],
  ['packages/email/src/common/Footer.tsx', '\n          Plunk\n        </Link>', `\n          ${NAME}\n        </Link>`, 1],
  ['packages/email/src/emails/EmailVerification.tsx', 'get started with Plunk.', `get started with ${NAME}.`, 1],
  ['packages/email/src/emails/EmailVerification.tsx', "sign up for Plunk,", `sign up for ${NAME},`, 1],

  // Strings that surface from shared/api code (not covered by the guard: those trees are
  // full of X-Plunk-* headers and identifiers that must NOT change)
  ['packages/shared/src/template/engine.ts', 'is not available in Plunk templates', `is not available in ${NAME} templates`, 1],
  ['apps/api/src/services/CampaignService.ts', "project.name || 'Plunk'", `project.name || '${NAME}'`, 1],
];

// "Plunk" that is intentionally left: only reachable with Stripe billing on (off in
// self-hosting), or not rendered to users. Matched as file + substring of the line.
const ALLOWED_LEFTOVERS = [
  [`${W}/src/components/QuickStart.tsx`, 'Remove Plunk branding'], // billing only
  [`${W}/src/pages/index.tsx`, 'Upgrade to remove Plunk branding'], // billing only
  [`${W}/src/pages/index.tsx`, 'Your emails currently include Plunk branding'], // billing only
  [`${W}/src/pages/index.tsx`, "'%cPlunk%c  Built for developers"], // devtools console greeting
  ['packages/email/src/emails/CardVerificationFailed.tsx', 'Because Plunk bills for usage'], // billing only
];

// Where the guard looks: everything a dashboard user or an email recipient can see.
const GUARD_DIRS = [`${W}/src`, `${W}/public`, 'packages/email/src', 'packages/ui/src'];

const failures = [];
let applied = 0;
let already = 0;

for (const [file, from, to, min] of REPLACEMENTS) {
  const path = join(root, file);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    failures.push(`missing file: ${file}`);
    continue;
  }
  const count = text.split(from).length - 1;
  if (count === 0) {
    if (text.includes(to)) {
      already++;
      continue;
    }
    failures.push(`anchor not found in ${file}: ${JSON.stringify(from)}`);
    continue;
  }
  if (count < min) {
    failures.push(`anchor found ${count}x (expected >= ${min}) in ${file}: ${JSON.stringify(from)}`);
    continue;
  }
  writeFileSync(path, text.split(from).join(to));
  applied++;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(tsx?|jsx?|json|webmanifest|xml|html|svg)$/.test(name)) yield p;
  }
}

const isComment = line => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(line);
const leftovers = [];
for (const dir of GUARD_DIRS) {
  for (const path of walk(join(root, dir))) {
    const file = relative(root, path);
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (!line.includes('Plunk') || isComment(line)) return;
        if (ALLOWED_LEFTOVERS.some(([f, s]) => f === file && line.includes(s))) return;
        leftovers.push(`${file}:${i + 1}: ${line.trim()}`);
      });
  }
}

if (leftovers.length) {
  failures.push(
    'user-visible "Plunk" left (new upstream string? add a REPLACEMENT or, if it is never shown, an ALLOWED_LEFTOVERS entry):\n    ' +
      leftovers.join('\n    '),
  );
}

if (failures.length) {
  console.error(`branding FAILED (${failures.length}):\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`branding OK: ${applied} replacements applied, ${already} already branded`);
