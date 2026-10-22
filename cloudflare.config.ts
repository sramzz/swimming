import { bindings, defineConfig } from 'cf/config';

export default defineConfig({
  accountId: '974cf738d84477d95d11ec01739e67bd',
  worker: {
    name: 'allezwembaden-nl',
    compatibilityDate: '2026-10-01',
    workersDev: true,
    assets: {
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: '404-page',
    },
    env: {
      DB: bindings.d1({
        name: 'allezwembaden-db',
        id: process.env.CF_D1_DATABASE_ID ?? '71048f11-08e6-4747-88c6-b6dc4da58b80',
      }),
    },
  },
});
