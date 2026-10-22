import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates the Cloudflare Build Output Specification v0 directory
 * (`.cloudflare/output/v0`) from Astro's static `./dist` directory
 * so `cf deploy --prebuilt` can deploy directly to Cloudflare Workers Static Assets.
 */
export function prepareCloudflareBuildOutput(rootDir = process.cwd()): void {
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error(`Missing Astro build output at ${distDir}. Run 'astro build' first.`);
  }

  const outputV0Dir = path.join(rootDir, '.cloudflare', 'output', 'v0');
  const defaultWorkerDir = path.join(outputV0Dir, 'workers', 'default');
  const workerAssetsDir = path.join(defaultWorkerDir, 'assets');

  fs.rmSync(outputV0Dir, { recursive: true, force: true });
  fs.mkdirSync(workerAssetsDir, { recursive: true });

  const rootConfig = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '974cf738d84477d95d11ec01739e67bd',
    buildContext: {
      isPreview: false,
      mode: 'production',
    },
  };

  const workerConfig = {
    name: 'allezwembaden-nl',
    compatibilityDate: '2026-10-01',
    workersDev: true,
    assets: {
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: '404-page',
    },
  };

  fs.writeFileSync(
    path.join(outputV0Dir, 'config.json'),
    JSON.stringify(rootConfig, null, 2),
    'utf-8'
  );

  fs.writeFileSync(
    path.join(defaultWorkerDir, 'worker.config.json'),
    JSON.stringify(workerConfig, null, 2),
    'utf-8'
  );

  fs.cpSync(distDir, workerAssetsDir, { recursive: true, dereference: true });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepareCloudflareBuildOutput();
}
