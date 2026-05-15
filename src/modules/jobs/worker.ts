import { env } from '../../config/env'
import { logger } from '../../lib/logger'
import { jobService } from './job.service'
import { conversionService } from '../conversion/conversion.service'
import { cleanupService } from './cleanup.service'

let running = false
let loopCount = 0

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function startWorkerLoop(): Promise<void> {
  if (running) return
  running = true
  logger.info({ workerId: env.WORKER_ID }, 'Worker loop started')

  while (running) {
    try {
      await jobService.releaseStaleLocks()
      loopCount += 1
      if (loopCount % 40 === 0) {
        await cleanupService.purgeDeletedDocuments()
      }
      const job = await jobService.claimNext(env.WORKER_ID)
      if (!job) {
        await sleep(env.WORKER_POLL_MS)
        continue
      }

      logger.info({ jobId: job.id, documentId: job.documentId }, 'Processing conversion job')
      try {
        await conversionService.processDocument(job.documentId, async (step, progress) => {
          await jobService.setProgress(job.id, step, progress)
        })
        await jobService.markDone(job.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await conversionService.failDocument(job.documentId, error)
        if (job.attempt >= job.maxAttempts) {
          await jobService.markFailed(job.id, message)
        } else {
          await jobService.markRetry(job.id, job.attempt, message)
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Worker loop iteration failed')
      await sleep(env.WORKER_POLL_MS)
    }
  }
}

export function stopWorkerLoop(): void {
  running = false
}
