import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates the Cloudflare Build Output Specification v0 directory
 * (`.cloudflare/output/v0`) from Astro's static `./dist` directory
 * and bundles `src/worker.ts` (if present) to enable dynamic D1 API endpoints
 * alongside Cloudflare Workers Static Assets.
 */
export async function prepareCloudflareBuildOutput(rootDir = process.cwd()): Promise<void> {
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error(`Missing Astro build output at ${distDir}. Run 'astro build' first.`);
  }

  const outputV0Dir = path.join(rootDir, '.cloudflare', 'output', 'v0');
  const defaultWorkerDir = path.join(outputV0Dir, 'workers', 'default');
  const workerAssetsDir = path.join(defaultWorkerDir, 'assets');
  const workerBundleDir = path.join(defaultWorkerDir, 'bundle');

  fs.rmSync(outputV0Dir, { recursive: true, force: true });
  fs.mkdirSync(workerAssetsDir, { recursive: true });

  const workerEntry = path.join(rootDir, 'src', 'worker.ts');
  let hasBundle = false;
  if (fs.existsSync(workerEntry)) {
    fs.mkdirSync(workerBundleDir, { recursive: true });
    const { build } = await import('vite');
    await build({
      build: {
        lib: {
          entry: workerEntry,
          formats: ['es'],
          fileName: () => 'index.js',
        },
        outDir: workerBundleDir,
        emptyOutDir: true,
      },
      publicDir: false,
      configFile: false,
      logLevel: 'warn',
    });
    hasBundle = true;
  }

  const rootConfig = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? '974cf738d84477d95d11ec01739e67bd',
    buildContext: {
      isPreview: false,
      mode: 'production',
    },
  };

  const workerConfig: Record<string, unknown> = {
    name: 'zwemkaart-nl',
    compatibilityDate: '2026-10-01',
    workersDev: true,
    domains: ['zwemkaart.nl', 'www.zwemkaart.nl'],
    assets: {
      htmlHandling: 'drop-trailing-slash',
      notFoundHandling: '404-page',
      runWorkerFirst: true,
    },
    env: {
      ASSETS: {
        type: 'assets',
      },
      DB: {
        type: 'd1',
        name: 'allezwembaden-db',
        id: process.env.CF_D1_DATABASE_ID ?? '71048f11-08e6-4747-88c6-b6dc4da58b80',
      },
    },
  };

  if (hasBundle) {
    workerConfig.manifest = {
      type: 'complete',
      mainModule: 'index.js',
      modules: {
        'index.js': { type: 'esm' },
      },
    };
  }

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
  prepareCloudflareBuildOutput().catch((err) => {
    console.error('Failed to prepare Cloudflare build output:', err);
    process.exit(1);
  });
}
