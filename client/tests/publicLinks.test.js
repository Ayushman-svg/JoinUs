import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_ROOT = path.resolve(__dirname, '..');

// All public page and layout component files
const PUBLIC_FILES = [
  'src/components/public/PublicHeader.jsx',
  'src/components/public/PublicFooter.jsx',
  'src/components/public/PublicLayout.jsx',
  'src/pages/LandingPage.jsx',
  'src/pages/public/FeaturesPage.jsx',
  'src/pages/public/SecurityPage.jsx',
  'src/pages/public/TermsPage.jsx',
  'src/pages/public/PrivacyPage.jsx',
];

// Read App.jsx to extract known client routes
function getAppRoutes() {
  const appPath = path.resolve(CLIENT_ROOT, 'src/App.jsx');
  const content = fs.readFileSync(appPath, 'utf8');
  const routeRegex = /path="([^"]+)"/g;
  const routes = new Set();
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    routes.add(match[1]);
  }
  return routes;
}

// Extract all id="..." attributes defined across public layout & pages
function getAllPublicIds() {
  const ids = new Set();
  const idRegex = /id="([^"]+)"/g;
  for (const relFile of PUBLIC_FILES) {
    const filePath = path.resolve(CLIENT_ROOT, relFile);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    let match;
    while ((match = idRegex.exec(content)) !== null) {
      ids.add(match[1]);
    }
  }
  return ids;
}

// Extract all internal links from a given JSX content
function extractInternalLinks(fileContent, relativePath) {
  const links = [];
  // Matches to="..." or to={'...'} or href="..." or href={'...'}
  const linkRegex = /(?:to|href)=(?:["']([^"']+)["']|\{["']([^"']+)["']\})/g;
  let match;

  while ((match = linkRegex.exec(fileContent)) !== null) {
    const rawTarget = match[1] || match[2];
    if (!rawTarget) continue;

    // Filter out external URLs, mailto, tel, javascript:
    if (
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('tel:') ||
      rawTarget.startsWith('javascript:')
    ) {
      continue;
    }

    links.push({
      target: rawTarget,
      file: relativePath,
    });
  }

  return links;
}

// Validate a specific link against routes and IDs
export function validateLink(target, validRoutes, validIds) {
  // Hash-only links like "#join-input" or "#main-content"
  if (target.startsWith('#')) {
    const anchor = target.slice(1);
    if (!validIds.has(anchor)) {
      return { ok: false, reason: `Anchor '#${anchor}' does not match any element id on public pages` };
    }
    return { ok: true };
  }

  // Parse path and optional hash: e.g. "/#faq" or "/features"
  const [pathname, anchor] = target.split('#');

  // Verify pathname matches a known route
  // Standard routes or route patterns like "/m/:code"
  const isRouteValid =
    validRoutes.has(pathname) ||
    (pathname === '' && target.startsWith('#')) ||
    Array.from(validRoutes).some((r) => {
      if (r === '*') return false;
      const regex = new RegExp(`^${r.replace(/:[a-zA-Z0-9_]+/g, '[^/]+')}$`);
      return regex.test(pathname);
    });

  if (!isRouteValid) {
    return { ok: false, reason: `Pathname '${pathname}' is not registered in App.jsx routes` };
  }

  // If there is a hash on a path (e.g. "/#faq"), verify the anchor id exists
  if (anchor && !validIds.has(anchor)) {
    return { ok: false, reason: `Anchor '#${anchor}' on route '${pathname}' does not match any element id` };
  }

  return { ok: true };
}

describe('Public Pages Internal Link Validator', () => {
  const routes = getAppRoutes();
  const ids = getAllPublicIds();

  it('detects and registers all standard App.jsx routes', () => {
    assert.ok(routes.has('/'), 'Missing root route /');
    assert.ok(routes.has('/features'), 'Missing /features route');
    assert.ok(routes.has('/security'), 'Missing /security route');
    assert.ok(routes.has('/terms'), 'Missing /terms route');
    assert.ok(routes.has('/privacy'), 'Missing /privacy route');
    assert.ok(routes.has('/login'), 'Missing /login route');
    assert.ok(routes.has('/register'), 'Missing /register route');
  });

  it('detects all standard anchor IDs across public pages', () => {
    assert.ok(ids.has('main-content'), 'Missing #main-content skip link anchor');
    assert.ok(ids.has('features'), 'Missing #features section anchor');
    assert.ok(ids.has('how-it-works'), 'Missing #how-it-works section anchor');
    assert.ok(ids.has('faq'), 'Missing #faq section anchor');
    assert.ok(ids.has('join-input'), 'Missing #join-input form anchor');
  });

  it('fails if an internal link is broken or points to a non-existent page/anchor', () => {
    const invalidRouteTest = validateLink('/broken-page', routes, ids);
    assert.equal(invalidRouteTest.ok, false);
    assert.match(invalidRouteTest.reason, /not registered/);

    const invalidAnchorTest = validateLink('/#non-existent-section', routes, ids);
    assert.equal(invalidAnchorTest.ok, false);
    assert.match(invalidAnchorTest.reason, /does not match any element id/);

    const invalidHashOnlyTest = validateLink('#non-existent-anchor', routes, ids);
    assert.equal(invalidHashOnlyTest.ok, false);
    assert.match(invalidHashOnlyTest.reason, /does not match any element id/);
  });

  it('verifies that EVERY internal link on all public pages and components is valid', () => {
    const allLinks = [];
    for (const relFile of PUBLIC_FILES) {
      const filePath = path.resolve(CLIENT_ROOT, relFile);
      assert.ok(fs.existsSync(filePath), `Public file does not exist: ${relFile}`);
      const content = fs.readFileSync(filePath, 'utf8');
      const fileLinks = extractInternalLinks(content, relFile);
      allLinks.push(...fileLinks);
    }

    assert.ok(allLinks.length > 0, 'No internal links found across public pages');

    const brokenLinks = [];
    for (const link of allLinks) {
      const result = validateLink(link.target, routes, ids);
      if (!result.ok) {
        brokenLinks.push({
          file: link.file,
          target: link.target,
          reason: result.reason,
        });
      }
    }

    assert.deepEqual(
      brokenLinks,
      [],
      `Found broken internal link(s) on public pages:\n${JSON.stringify(brokenLinks, null, 2)}`
    );
  });

  it('strictly enforces prohibitions: no pricing, testimonials, invented numbers, or fake partner logos', () => {
    const forbiddenPatterns = [
      { name: 'Pricing link or route', pattern: /(?:href|to)=["'][^"']*pricing/i },
      { name: 'Pricing text', pattern: /\bpricing\b/i },
      { name: 'Testimonials section', pattern: /\btestimonials?\b/i },
      { name: 'Invented user count', pattern: /\b[0-9]{2,3}[kKmM]\+?\s+(?:users|customers|downloads|teams)\b/i },
      { name: 'Fake 99.999% SLA claim', pattern: /99\.999%/ },
      { name: 'Partner or customer logos section', pattern: /\bpartner-logos\b|\btrusted by\b/i },
      { name: 'Claiming to be Zoom or Zoom logo', pattern: /\bzoom logo\b|\bofficial zoom\b/i },
    ];

    const violations = [];
    for (const relFile of PUBLIC_FILES) {
      const filePath = path.resolve(CLIENT_ROOT, relFile);
      const content = fs.readFileSync(filePath, 'utf8');

      for (const { name, pattern } of forbiddenPatterns) {
        if (pattern.test(content)) {
          violations.push({ file: relFile, violation: name });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      `Found forbidden content on public pages:\n${JSON.stringify(violations, null, 2)}`
    );
  });
});
