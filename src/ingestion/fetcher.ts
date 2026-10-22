export interface EscalationFetchOptions {
  url: string;
  requiresJsHydration?: boolean;
  cdpEndpoint?: string; // e.g. 'http://127.0.0.1:9222' for Lightpanda or Obscura
  httpFetcher?: (url: string) => Promise<{ status: number; body: string }>;
  cdpFetcher?: (url: string, cdpEndpoint: string) => Promise<string>;
}

export interface EscalationFetchResult {
  stepUsed: 'STEP_1_HTTP_FETCH' | 'STEP_2_CDP_BROWSER';
  html: string;
}

async function defaultHttpFetcher(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Zwemkaart-SyncBot/1.0 (+https://zwemkaart.nl)',
      Accept: 'text/html,application/xhtml+xml,application/json',
    },
  });
  return {
    status: response.status,
    body: await response.text(),
  };
}

async function defaultCdpFetcher(url: string, cdpEndpoint: string): Promise<string> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.connectOverCDP(cdpEndpoint);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    const content = await page.content();
    await page.close();
    return content;
  } finally {
    await browser.close();
  }
}

export async function fetchWithEscalationLadder(
  options: EscalationFetchOptions
): Promise<EscalationFetchResult> {
  const httpFetch = options.httpFetcher ?? defaultHttpFetcher;
  const cdpFetch = options.cdpFetcher ?? defaultCdpFetcher;
  const cdpEndpoint = options.cdpEndpoint ?? process.env.CDP_ENDPOINT ?? 'http://127.0.0.1:9222';

  if (!options.requiresJsHydration) {
    const step1 = await httpFetch(options.url);
    if (step1.status >= 200 && step1.status < 300 && step1.body.length > 0) {
      return {
        stepUsed: 'STEP_1_HTTP_FETCH',
        html: step1.body,
      };
    }
  }

  const hydratedHtml = await cdpFetch(options.url, cdpEndpoint);
  return {
    stepUsed: 'STEP_2_CDP_BROWSER',
    html: hydratedHtml,
  };
}
