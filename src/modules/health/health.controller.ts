import { Router } from 'express'
import { spawn } from 'node:child_process'
import { env } from '../../config/env'
import { prisma } from '../../lib/prisma'
import { storageService } from '../storage/storage.service'

export const healthRouter = Router()

async function checkCommandAvailable(command: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true })
})

healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    await storageService.ensureReady()
    const [hasSoffice, hasPdftoppm] = await Promise.all([
      checkCommandAvailable(env.SOFFICE_PATH, ['--version']),
      checkCommandAvailable('pdftoppm', ['-v']),
    ])
    const ok = hasSoffice && hasPdftoppm
    if (!ok) {
      return res.status(503).json({
        ok: false,
        checks: {
          db: true,
          storage: true,
          soffice: hasSoffice,
          pdftoppm: hasPdftoppm,
        },
      })
    }
    res.json({
      ok: true,
      checks: { db: true, storage: true, soffice: true, pdftoppm: true },
    })
  } catch {
    res.status(503).json({ ok: false })
  }
})
