export default {
  name: 'allezwembaden-nl',
  compatibilityDate: '2026-10-01',
  assets: {
    directory: './dist',
  },
  d1Databases: [
    {
      binding: 'DB',
      databaseName: 'allezwembaden-db',
      databaseId: process.env.CF_D1_DATABASE_ID ?? 'local-dev-d1',
    },
  ],
};
