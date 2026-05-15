import { createApp } from './app'
import { env } from './config/env'
import { logger } from './lib/logger'
import { storageService } from './modules/storage/storage.service'
import { startWorkerLoop, stopWorkerLoop } from './modules/jobs/worker'
import { prisma } from './lib/prisma'

async function bootstrap() {
  await storageService.ensureReady()
  const app = createApp()
  const server = app.listen(env.PORT, () => {
    // logger.info({ port: env.PORT }, 'API listening')
    console.log(`API listening on port ${env.PORT}`)
  })

  startWorkerLoop().catch((error) => logger.error({ err: error }, 'Worker crashed'))

  const shutdown = async () => {
    logger.info('Shutting down')
    stopWorkerLoop()
    server.close()
    await prisma.$disconnect()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

bootstrap().catch(async (error) => {
  logger.error({ err: error }, 'Fatal bootstrap error')
  await prisma.$disconnect()
  process.exit(1)
})
