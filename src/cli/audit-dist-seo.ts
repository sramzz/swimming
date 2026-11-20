import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DistSeoAuditReport {
  totalHtmlFiles: number;
  totalIndexablePages: number;
  sitemapUrlCount: number;
  totalInternalLinksChecked: number;
  missingTitle: string[];
  duplicateTitles: Array<{ title: string; urls: string[] }>;
  missingDescription: string[];
  duplicateDescriptions: Array<{ description: string; urls: string[] }>;
  missingH1: string[];
  canonicalMismatch: Array<{ url: string; canonical: string | null }>;
  sitemapMissingInDist: string[];
  distMissingInSitemap: string[];
  missingJsonLd: string[];
  invalidJsonLd: Array<{ url: string; error: string }>;
  missingOgImage: string[];
  brokenOgImageAsset: Array<{ url: string; ogImage: string }>;
  badTextTokens: Array<{ url: string; field: string; token: string }>;
  brokenInternalLinks: Array<{ sourceUrl: string; href: string }>;
}

const BAD_TOKEN_PATTERNS = [
  { token: 'undefined', regex: /\bundefined\b/ },
  { token: 'NaN', regex: /\bNaN\b/ },
  { token: '[object Object]', regex: /\[object Object\]/ },
];

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
  amp: '&',
};

/**
 * Decodes standard HTML entities and numeric character references in a single pass.
 * Prevents double-decoding (e.g. &#38;amp; stays &amp;).
 */
export function unescapeHtml(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|([a-zA-Z]+));/g, (match, hex, dec, named) => {
    if (named) {
      const lower = named.toLowerCase();
      if (NAMED_ENTITIES[lower] !== undefined) {
        return NAMED_ENTITIES[lower];
      }
      return match;
    }
    if (dec !== undefined) {
      const code = parseInt(dec, 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    if (hex !== undefined) {
      const code = parseInt(hex, 16);
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return match;
  });
}

/**
 * Extracts the value of a specific attribute from an HTML tag attribute string.
 * Supports both double quotes and single quotes, preserving inner quotes of the other type.
 */
export function extractAttr(tagAttrs: string, attrName: string): string | null {
  const re = new RegExp(`(?:^|\\s)${attrName}=(?:"([^"]*)"|'([^']*)')`, 'i');
  const match = re.exec(tagAttrs);
  if (!match) return null;
  return match[1] !== undefined ? match[1] : (match[2] ?? null);
}

/**
 * Extracts meta tag content by name or property, handling arbitrary attribute order.
 */
export function extractMeta(
  html: string,
  attrKey: 'name' | 'property',
  attrValue: string
): string | null {
  const metaRegex = /<meta\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;
  const targetLower = attrValue.toLowerCase();

  while ((match = metaRegex.exec(html)) !== null) {
    const attrs = match[1];
    const keyVal =
      extractAttr(attrs, attrKey) ??
      (attrKey === 'property'
        ? extractAttr(attrs, 'name')
        : extractAttr(attrs, 'property'));

    if (keyVal && keyVal.toLowerCase() === targetLower) {
      const rawContent = extractAttr(attrs, 'content');
      if (rawContent !== null) {
        return unescapeHtml(rawContent).trim();
      }
    }
  }
  return null;
}

/**
 * Extracts canonical href from <link rel="canonical" href="...">
 */
export function extractCanonical(html: string): string | null {
  const linkRegex = /<link\s+([^>]+)>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1];
    const rel = extractAttr(attrs, 'rel');
    if (rel && rel.toLowerCase() === 'canonical') {
      const href = extractAttr(attrs, 'href');
      if (href !== null) {
        return unescapeHtml(href).trim();
      }
    }
  }
  return null;
}

/**
 * Extracts page title from <title> tag.
 */
export function extractTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const decoded = unescapeHtml(match[1]).trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * Extracts text content of first <h1> tag.
 */
export function extractH1(html: string): string | null {
  const match = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (!match) return null;
  const stripped = match[1].replace(/<[^>]+>/g, ' ');
  const decoded = unescapeHtml(stripped).trim();
  return decoded.length > 0 ? decoded : null;
}

/**
 * Extracts all JSON-LD script block contents.
 */
export function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const regex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

/**
 * Strips scripts, styles, svgs, and html tags to produce visible body text.
 */
export function stripVisibleText(html: string): string {
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  let text = bodyMatch ? bodyMatch[1] : html;
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ');
  text = text.replace(/<[^>]+>/g, ' ');
  return unescapeHtml(text);
}

/**
 * Normalizes an internal href:
 * - strips protocol/domain if pointing to https://zwemkaart.nl
 * - rejects protocol-relative (//) and external schemes
 * - strips query and hash
 * - strips trailing slash unless root '/'
 */
export function normalizeInternalHref(rawHref: string): string | null {
  let clean = unescapeHtml(rawHref).trim();
  if (clean.startsWith('https://zwemkaart.nl/')) {
    clean = clean.slice('https://zwemkaart.nl'.length);
  }
  if (!clean.startsWith('/') || clean.startsWith('//')) {
    return null;
  }
  clean = clean.split('#')[0].split('?')[0];
  if (clean.length === 0) return null;
  if (clean !== '/' && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }
  return clean.length > 0 ? clean : null;
}

/**
 * Checks whether any audit criteria failed.
 */
export function hasAuditFailures(report: DistSeoAuditReport): boolean {
  return (
    report.totalIndexablePages < 4800 ||
    report.missingTitle.length > 0 ||
    report.duplicateTitles.length > 0 ||
    report.missingDescription.length > 0 ||
    report.duplicateDescriptions.length > 0 ||
    report.missingH1.length > 0 ||
    report.canonicalMismatch.length > 0 ||
    report.sitemapMissingInDist.length > 0 ||
    report.distMissingInSitemap.length > 0 ||
    report.missingJsonLd.length > 0 ||
    report.invalidJsonLd.length > 0 ||
    report.missingOgImage.length > 0 ||
    report.brokenOgImageAsset.length > 0 ||
    report.badTextTokens.length > 0 ||
    report.brokenInternalLinks.length > 0
  );
}

interface HtmlFileInfo {
  fullPath: string;
  relPath: string;
  route: string;
  isIndexable: boolean;
}

/**
 * Recursively scans the dist directory, indexes static files and HTML routes,
 * validates against sitemap.xml, and runs comprehensive SEO & internal link checks.
 */
export async function auditDistDirectory(distDir?: string): Promise<DistSeoAuditReport> {
  const targetDir = distDir ? path.resolve(distDir) : path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(targetDir)) {
    throw new Error(`Dist directory not found at: ${targetDir}. Run "pnpm build" first.`);
  }

  const report: DistSeoAuditReport = {
    totalHtmlFiles: 0,
    totalIndexablePages: 0,
    sitemapUrlCount: 0,
    totalInternalLinksChecked: 0,
    missingTitle: [],
    duplicateTitles: [],
    missingDescription: [],
    duplicateDescriptions: [],
    missingH1: [],
    canonicalMismatch: [],
    sitemapMissingInDist: [],
    distMissingInSitemap: [],
    missingJsonLd: [],
    invalidJsonLd: [],
    missingOgImage: [],
    brokenOgImageAsset: [],
    badTextTokens: [],
    brokenInternalLinks: [],
  };

  const allStaticFiles = new Set<string>();
  const htmlFiles: HtmlFileInfo[] = [];
  const knownHtmlRoutes = new Set<string>();

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(targetDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const normalizedRel = '/' + relPath.split(path.sep).join('/');
        allStaticFiles.add(normalizedRel);

        if (entry.name.endsWith('.html')) {
          report.totalHtmlFiles++;
          let route: string;
          if (relPath === 'index.html') {
            route = '/';
          } else if (relPath.endsWith(`${path.sep}index.html`) || relPath.endsWith('/index.html')) {
            const cutLen = relPath.endsWith(`${path.sep}index.html`)
              ? `${path.sep}index.html`.length
              : '/index.html'.length;
            route = '/' + relPath.slice(0, -cutLen).split(path.sep).join('/');
          } else {
            route = '/' + relPath.slice(0, -'.html'.length).split(path.sep).join('/');
          }

          const is404 = relPath === '404.html' || route === '/404';
          htmlFiles.push({
            fullPath,
            relPath,
            route,
            isIndexable: !is404,
          });
        }
      }
    }
  }

  walk(targetDir);

  // Check sitemap.xml
  const sitemapPath = path.join(targetDir, 'sitemap.xml');
  const sitemapLocs = new Set<string>();
  if (fs.existsSync(sitemapPath)) {
    const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
    const locMatches = sitemapContent.matchAll(/<loc>([^<]+)<\/loc>/g);
    for (const m of locMatches) {
      sitemapLocs.add(unescapeHtml(m[1]).trim());
    }
    report.sitemapUrlCount = sitemapLocs.size;
  }

  const titlesMap = new Map<string, string[]>();
  const descsMap = new Map<string, string[]>();

  // Pre-register routes for indexable pages
  for (const file of htmlFiles) {
    if (file.isIndexable) {
      knownHtmlRoutes.add(file.route);
    }
  }

  // Check sitemap parity against indexable routes
  if (fs.existsSync(sitemapPath)) {
    for (const file of htmlFiles) {
      if (file.isIndexable) {
        const expectedUrl =
          file.route === '/' ? 'https://zwemkaart.nl/' : `https://zwemkaart.nl${file.route}`;
        if (!sitemapLocs.has(expectedUrl)) {
          report.distMissingInSitemap.push(expectedUrl);
        }
      }
    }

    for (const sitemapUrl of sitemapLocs) {
      const route =
        sitemapUrl === 'https://zwemkaart.nl/'
          ? '/'
          : sitemapUrl.replace(/^https:\/\/zwemkaart\.nl/, '');
      if (!knownHtmlRoutes.has(route)) {
        report.sitemapMissingInDist.push(sitemapUrl);
      }
    }
  }

  const aTagRegex = /<a\b([^>]*)>/gi;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file.fullPath, 'utf-8');
    let title: string | null = null;
    let desc: string | null = null;
    let h1: string | null = null;

    // Indexable pages checks
    if (file.isIndexable) {
      report.totalIndexablePages++;

      // 1. Title
      title = extractTitle(html);
      if (!title) {
        report.missingTitle.push(file.route);
      } else {
        if (!titlesMap.has(title)) titlesMap.set(title, []);
        titlesMap.get(title)!.push(file.route);
      }

      // 2. Meta description
      desc = extractMeta(html, 'name', 'description');
      if (!desc) {
        report.missingDescription.push(file.route);
      } else {
        if (!descsMap.has(desc)) descsMap.set(desc, []);
        descsMap.get(desc)!.push(file.route);
      }

      // 3. H1
      h1 = extractH1(html);
      if (!h1) {
        report.missingH1.push(file.route);
      }

      // 4. Canonical
      const canonical = extractCanonical(html);
      const expectedCanonical =
        file.route === '/' ? 'https://zwemkaart.nl/' : `https://zwemkaart.nl${file.route}`;
      if (canonical !== expectedCanonical) {
        report.canonicalMismatch.push({ url: file.route, canonical });
      }

      // 5. JSON-LD
      const jsonLdBlocks = extractJsonLdBlocks(html);
      if (jsonLdBlocks.length === 0) {
        report.missingJsonLd.push(file.route);
      } else {
        for (const block of jsonLdBlocks) {
          try {
            JSON.parse(block);
          } catch (err) {
            report.invalidJsonLd.push({
              url: file.route,
              error: (err as Error).message,
            });
          }
        }
      }

      // 6. OG Image
      const ogImage = extractMeta(html, 'property', 'og:image');
      if (!ogImage) {
        report.missingOgImage.push(file.route);
      } else {
        let assetTarget = ogImage;
        if (assetTarget.startsWith('https://zwemkaart.nl/')) {
          assetTarget = assetTarget.slice('https://zwemkaart.nl'.length);
        }
        if (assetTarget.startsWith('/')) {
          const cleanAsset = assetTarget.split('?')[0].split('#')[0];
          if (!allStaticFiles.has(cleanAsset)) {
            report.brokenOgImageAsset.push({ url: file.route, ogImage });
          }
        }
      }
    }

    // Bad text tokens check (on both indexable pages and 404)
    // Quick substring check to avoid regex stripping on millions of characters when clean
    if (
      html.includes('undefined') ||
      html.includes('NaN') ||
      html.includes('[object Object]')
    ) {
      const titleText = title ?? extractTitle(html) ?? '';
      const descText = desc ?? extractMeta(html, 'name', 'description') ?? '';
      const h1Text = h1 ?? extractH1(html) ?? '';
      const bodyText = stripVisibleText(html);

      for (const { token, regex } of BAD_TOKEN_PATTERNS) {
        if (regex.test(titleText)) {
          report.badTextTokens.push({ url: file.route, field: 'title', token });
        }
        if (regex.test(descText)) {
          report.badTextTokens.push({ url: file.route, field: 'description', token });
        }
        if (regex.test(h1Text)) {
          report.badTextTokens.push({ url: file.route, field: 'h1', token });
        }
        if (regex.test(bodyText)) {
          report.badTextTokens.push({ url: file.route, field: 'body', token });
        }
      }
    }

    // Internal links check (all HTML files including 404.html)
    let aMatch: RegExpExecArray | null;
    aTagRegex.lastIndex = 0;
    while ((aMatch = aTagRegex.exec(html)) !== null) {
      const attrs = aMatch[1];
      const rawHref = extractAttr(attrs, 'href');
      if (!rawHref) continue;

      const normalized = normalizeInternalHref(rawHref);
      if (!normalized) continue;

      report.totalInternalLinksChecked++;
      if (!knownHtmlRoutes.has(normalized) && !allStaticFiles.has(normalized)) {
        report.brokenInternalLinks.push({
          sourceUrl: file.route,
          href: rawHref,
        });
      }
    }
  }

  // Populate duplicate titles and descriptions
  for (const [title, urls] of titlesMap.entries()) {
    if (urls.length > 1) {
      report.duplicateTitles.push({ title, urls });
    }
  }

  for (const [description, urls] of descsMap.entries()) {
    if (urls.length > 1) {
      report.duplicateDescriptions.push({ description, urls });
    }
  }

  // Sort lists deterministically
  report.missingTitle.sort();
  report.duplicateTitles.sort((a, b) => a.title.localeCompare(b.title));
  report.missingDescription.sort();
  report.duplicateDescriptions.sort((a, b) => a.description.localeCompare(b.description));
  report.missingH1.sort();
  report.canonicalMismatch.sort((a, b) => a.url.localeCompare(b.url));
  report.sitemapMissingInDist.sort();
  report.distMissingInSitemap.sort();
  report.missingJsonLd.sort();
  report.invalidJsonLd.sort((a, b) => a.url.localeCompare(b.url));
  report.missingOgImage.sort();
  report.brokenOgImageAsset.sort((a, b) => a.url.localeCompare(b.url));
  report.badTextTokens.sort((a, b) => a.url.localeCompare(b.url) || a.field.localeCompare(b.field));
  report.brokenInternalLinks.sort(
    (a, b) => a.sourceUrl.localeCompare(b.sourceUrl) || a.href.localeCompare(b.href)
  );

  return report;
}

// CLI entry point
const isCliEntry =
  !process.env.VITEST &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCliEntry) {
  auditDistDirectory()
    .then((report) => {
      const nf = new Intl.NumberFormat('en-US');
      console.log('='.repeat(65));
      console.log('        Zwemkaart.nl Post-Build dist/ SEO & Link Audit');
      console.log('='.repeat(65));
      console.log(`Total HTML Files:               ${nf.format(report.totalHtmlFiles)}`);
      console.log(`Total Indexable Pages:          ${nf.format(report.totalIndexablePages)}`);
      console.log(`Sitemap URLs:                   ${nf.format(report.sitemapUrlCount)}`);
      console.log(`Internal Links Checked:         ${nf.format(report.totalInternalLinksChecked)}`);
      console.log('-'.repeat(65));
      console.log(`Missing Title:                  ${nf.format(report.missingTitle.length)}`);
      console.log(`Duplicate Titles:               ${nf.format(report.duplicateTitles.length)}`);
      console.log(`Missing Meta Description:       ${nf.format(report.missingDescription.length)}`);
      console.log(`Duplicate Meta Descriptions:    ${nf.format(report.duplicateDescriptions.length)}`);
      console.log(`Missing H1:                     ${nf.format(report.missingH1.length)}`);
      console.log(`Canonical Mismatches:           ${nf.format(report.canonicalMismatch.length)}`);
      console.log(`Sitemap Missing in Dist:        ${nf.format(report.sitemapMissingInDist.length)}`);
      console.log(`Dist Missing in Sitemap:        ${nf.format(report.distMissingInSitemap.length)}`);
      console.log(`Missing JSON-LD:                ${nf.format(report.missingJsonLd.length)}`);
      console.log(`Invalid JSON-LD:                ${nf.format(report.invalidJsonLd.length)}`);
      console.log(`Missing OG Image:               ${nf.format(report.missingOgImage.length)}`);
      console.log(`Broken OG Image Assets:         ${nf.format(report.brokenOgImageAsset.length)}`);
      console.log(`Bad Text Tokens:                ${nf.format(report.badTextTokens.length)}`);
      console.log(`Broken Internal Links:          ${nf.format(report.brokenInternalLinks.length)}`);
      console.log('='.repeat(65));

      const failures = hasAuditFailures(report);
      if (failures) {
        console.error('\n❌ SEO AUDIT FAILED with detected issue(s):');
        if (report.totalIndexablePages < 4800) {
          console.error(
            `  - Total indexable pages (${report.totalIndexablePages}) is below minimum threshold (4,800)!`
          );
        }
        if (report.missingTitle.length > 0) {
          console.error(`  - Missing Title (${report.missingTitle.length}):`);
          report.missingTitle.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.duplicateTitles.length > 0) {
          console.error(`  - Duplicate Titles (${report.duplicateTitles.length}):`);
          report.duplicateTitles.slice(0, 5).forEach((d) =>
            console.error(`      "${d.title}": [${d.urls.slice(0, 3).join(', ')}]`)
          );
        }
        if (report.missingDescription.length > 0) {
          console.error(`  - Missing Meta Description (${report.missingDescription.length}):`);
          report.missingDescription.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.duplicateDescriptions.length > 0) {
          console.error(`  - Duplicate Meta Descriptions (${report.duplicateDescriptions.length}):`);
          report.duplicateDescriptions.slice(0, 5).forEach((d) =>
            console.error(`      "${d.description}": [${d.urls.slice(0, 3).join(', ')}]`)
          );
        }
        if (report.missingH1.length > 0) {
          console.error(`  - Missing H1 (${report.missingH1.length}):`);
          report.missingH1.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.canonicalMismatch.length > 0) {
          console.error(`  - Canonical Mismatches (${report.canonicalMismatch.length}):`);
          report.canonicalMismatch.slice(0, 5).forEach((c) =>
            console.error(`      ${c.url} -> ${c.canonical}`)
          );
        }
        if (report.sitemapMissingInDist.length > 0) {
          console.error(`  - Sitemap Missing in Dist (${report.sitemapMissingInDist.length}):`);
          report.sitemapMissingInDist.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.distMissingInSitemap.length > 0) {
          console.error(`  - Dist Missing in Sitemap (${report.distMissingInSitemap.length}):`);
          report.distMissingInSitemap.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.missingJsonLd.length > 0) {
          console.error(`  - Missing JSON-LD (${report.missingJsonLd.length}):`);
          report.missingJsonLd.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.invalidJsonLd.length > 0) {
          console.error(`  - Invalid JSON-LD (${report.invalidJsonLd.length}):`);
          report.invalidJsonLd.slice(0, 5).forEach((j) =>
            console.error(`      ${j.url}: ${j.error}`)
          );
        }
        if (report.missingOgImage.length > 0) {
          console.error(`  - Missing OG Image (${report.missingOgImage.length}):`);
          report.missingOgImage.slice(0, 5).forEach((u) => console.error(`      ${u}`));
        }
        if (report.brokenOgImageAsset.length > 0) {
          console.error(`  - Broken OG Image Assets (${report.brokenOgImageAsset.length}):`);
          report.brokenOgImageAsset.slice(0, 5).forEach((o) =>
            console.error(`      ${o.url} -> ${o.ogImage}`)
          );
        }
        if (report.badTextTokens.length > 0) {
          console.error(`  - Bad Text Tokens (${report.badTextTokens.length}):`);
          report.badTextTokens.slice(0, 5).forEach((t) =>
            console.error(`      ${t.url} [${t.field}]: contains "${t.token}"`)
          );
        }
        if (report.brokenInternalLinks.length > 0) {
          console.error(`  - Broken Internal Links (${report.brokenInternalLinks.length}):`);
          report.brokenInternalLinks.slice(0, 5).forEach((l) =>
            console.error(`      ${l.sourceUrl} -> ${l.href}`)
          );
        }
        process.exit(1);
      }

      console.log('\n✅ All SEO and internal link audit checks passed cleanly! Zero errors detected.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error during dist SEO audit:', err);
      process.exit(1);
    });
}
