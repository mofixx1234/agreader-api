import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from '../config/env'

const adapter = new PrismaPg({ connectionString: env.DATABASE_POOL_URL ?? env.DATABASE_URL })

export const prisma = new PrismaClient({
  adapter,
  log: ['warn', 'error'],
})
