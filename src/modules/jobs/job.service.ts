import { ConversionJobStatus, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { env } from '../../config/env'

export class JobService {
  async enqueue(documentId: string): Promise<void> {
    await prisma.conversionJob.upsert({
      where: { documentId },
      create: {
        documentId,
        status: ConversionJobStatus.pending,
        step: 'queued',
        progress: 0,
        maxAttempts: env.JOB_MAX_ATTEMPTS,
      },
      update: {
        status: ConversionJobStatus.pending,
        step: 'queued',
        progress: 0,
        runAfter: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    })

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'queued' },
    })
  }

  async setProgress(jobId: string, step: string, progress: number): Promise<void> {
    await prisma.conversionJob.update({
      where: { id: jobId },
      data: { step, progress },
    })
  }

  async markDone(jobId: string): Promise<void> {
    await prisma.conversionJob.update({
      where: { id: jobId },
      data: {
        status: ConversionJobStatus.done,
        step: 'done',
        progress: 100,
        endedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    })
  }

  async markRetry(jobId: string, attempt: number, message: string): Promise<void> {
    const delaySec = Math.min(120, 2 ** Math.max(1, attempt))
    await prisma.conversionJob.update({
      where: { id: jobId },
      data: {
        status: ConversionJobStatus.retry_wait,
        runAfter: new Date(Date.now() + delaySec * 1000),
        lastError: message,
        lockedAt: null,
        lockedBy: null,
      },
    })
  }

  async markFailed(jobId: string, message: string): Promise<void> {
    await prisma.conversionJob.update({
      where: { id: jobId },
      data: {
        status: ConversionJobStatus.failed,
        step: 'failed',
        lastError: message,
        endedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    })
  }

  async claimNext(workerId: string) {
    const lockDate = new Date()
    const jobs = await prisma.$queryRaw<
      Array<{ id: string; documentId: string; attempt: number; maxAttempts: number }>
    >(Prisma.sql`
      WITH picked AS (
        SELECT id
        FROM "ConversionJob"
        WHERE status IN ('pending','retry_wait')
          AND "runAfter" <= NOW()
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - interval '120 seconds')
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ConversionJob" j
      SET status='running',
          "lockedAt"=${lockDate},
          "lockedBy"=${workerId},
          "startedAt"=COALESCE("startedAt", NOW()),
          "attempt"="attempt"+1
      FROM picked
      WHERE j.id = picked.id
      RETURNING j.id, j."documentId", j.attempt, j."maxAttempts";
    `)
    return jobs[0] ?? null
  }

  async releaseStaleLocks(): Promise<number> {
    const updated = await prisma.conversionJob.updateMany({
      where: {
        status: ConversionJobStatus.running,
        lockedAt: { lt: new Date(Date.now() - env.WORKER_LOCK_TTL_MS) },
      },
      data: {
        status: ConversionJobStatus.pending,
        lockedAt: null,
        lockedBy: null,
      },
    })
    return updated.count
  }
}

export const jobService = new JobService()
