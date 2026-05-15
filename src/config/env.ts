import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('/v1'),
  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1),
  UPLOAD_MAX_MB: z.coerce.number().int().positive().default(100),
  ALLOWED_MIME_TYPES: z.string().min(1),
  STORAGE_ROOT: z.string().default('./storage'),
  FRONTEND_DIST_DIR: z.string().min(1).optional(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).optional(),
  SUPABASE_IMAGES_BUCKET: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  WORKER_ID: z.string().default('worker-local-1'),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(1500),
  WORKER_LOCK_TTL_MS: z.coerce.number().int().positive().default(120000),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Exécutable LibreOffice (ex. /usr/bin/soffice). Sur Supabase il n’y a pas de worker Node : l’API doit tourner sur une machine avec LibreOffice installé. */
  SOFFICE_PATH: z.string().min(1).default('soffice'),
  JWT_SECRET: z.string().min(1).default('your_jwt_secret_key'),
  JWT_EXPIRES_IN: z.string().min(1).default('1h'),
})

export const env = envSchema.parse(process.env)

export const allowedMimeTypes = env.ALLOWED_MIME_TYPES.split(',')
  .map((m) => m.trim().toLowerCase())
  .filter(Boolean)
