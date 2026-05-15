import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import crypto from 'node:crypto'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { env } from './config/env'
import { healthRouter } from './modules/health/health.controller'
import { documentRouter } from './modules/documents/document.controller'
import { shareRouter } from './modules/shares/share.controller'
import { authRouter } from './modules/auth/auth.controller'
import { customDocumentRouter } from './modules/custom-documents/custom-document.controller'

function resolveFrontendDistDir(): string {
  const configured = env.FRONTEND_DIST_DIR?.trim()
  return path.resolve(configured || path.join(process.cwd(), 'public'))
}

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use(helmet())
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))
  app.use(morgan('dev'))
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID()
    res.setHeader('x-request-id', req.requestId)
    next()
  })
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
    }),
  )

  app.use('/', healthRouter)
  app.use(env.API_PREFIX, documentRouter)
  app.use(env.API_PREFIX, shareRouter)
  app.use(env.API_PREFIX, authRouter)
  app.use(env.API_PREFIX, customDocumentRouter)

  const frontendDistDir = resolveFrontendDistDir()
  const frontendIndexPath = path.join(frontendDistDir, 'index.html')
  if (existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistDir, { index: false }))
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next()
      if (req.path.startsWith(env.API_PREFIX)) return next()
      return res.sendFile(frontendIndexPath)
    })
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message })
  })

  return app
}
