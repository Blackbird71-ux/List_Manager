import { defineConfig } from '@prisma/config'

// The Prisma CLI does not load .env files when prisma.config.ts is present.
// In the container DATABASE_URL is a real env var; locally fall back to dev.db.
export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',
  },
})
