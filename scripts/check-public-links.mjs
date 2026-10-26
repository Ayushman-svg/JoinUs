#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CLIENT_ROOT = path.resolve(REPO_ROOT, 'client');

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

function extractInternalLinks(fileContent, relativePath) {
  const links = [];
  const linkRegex = /(?:to|href)=(?:["']([^"']+)["']|\{["']([^"']+)["']\})/g;
  let match;
  while ((match = linkRegex.exec(fileContent)) !== null) {
    const rawTarget = match[1] || match[2];
    if (!rawTarget) continue;
    if (
      rawTarget.startsWith('http://') ||
      rawTarget.startsWith('https://') ||
      rawTarget.startsWith('mailto:') ||
      rawTarget.startsWith('tel:') ||
      rawTarget.startsWith('javascript:')
    ) {
      continue;
    }
    links.push({ target: rawTarget, file: relativePath });
  }
  return links;
}

function validateLink(target, validRoutes, validIds) {
  if (target.startsWith('#')) {
    const anchor = target.slice(1);
    if (!validIds.has(anchor)) {
      return { ok: false, reason: `Anchor '#${anchor}' does not match any element id` };
    }
    return { ok: true };
  }

  const [pathname, anchor] = target.split('#');
  const isRouteValid =
    validRoutes.has(pathname) ||
    (pathname === '' && target.startsWith('#')) ||
    Array.from(validRoutes).some((r) => {
      if (r === '*') return false;
      const regex = new RegExp(`^${r.replace(/:[a-zA-Z0-9_]+/g, '[^/]+')}$`);
      return regex.test(pathname);
    });

  if (!isRouteValid) {
    return { ok: false, reason: `Pathname '${pathname}' is not registered in App.jsx` };
  }

  if (anchor && !validIds.has(anchor)) {
    return { ok: false, reason: `Anchor '#${anchor}' on route '${pathname}' does not match any element id` };
  }

  return { ok: true };
}

console.log('[check-public-links] Verifying internal links on public pages...');
const routes = getAppRoutes();
const ids = getAllPublicIds();

let totalLinksChecked = 0;
const brokenLinks = [];

for (const relFile of PUBLIC_FILES) {
  const filePath = path.resolve(CLIENT_ROOT, relFile);
  if (!fs.existsSync(filePath)) {
    console.error(`[check-public-links] File missing: ${relFile}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const links = extractInternalLinks(content, relFile);

  for (const link of links) {
    totalLinksChecked += 1;
    const res = validateLink(link.target, routes, ids);
    if (!res.ok) {
      brokenLinks.push({ file: link.file, target: link.target, reason: res.reason });
    }
  }
}

if (brokenLinks.length > 0) {
  console.error(`[check-public-links] FAILED: Found ${brokenLinks.length} broken internal link(s):`);
  console.error(JSON.stringify(brokenLinks, null, 2));
  process.exit(1);
}

console.log(`[check-public-links] PASSED: All ${totalLinksChecked} internal links across ${PUBLIC_FILES.length} public files are valid.`);
process.exit(0);
