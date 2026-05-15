import { promises as fs } from 'node:fs'
import path from 'node:path'
import { prisma } from '../../lib/prisma'
import { storageService } from '../storage/storage.service'

export class CleanupService {
  async purgeDeletedDocuments(maxCount = 10): Promise<number> {
    const docs = await prisma.document.findMany({
      where: { status: 'deleted', deletedAt: { not: null } },
      take: maxCount,
      orderBy: { deletedAt: 'asc' },
    })
    if (!docs.length) return 0

    for (const doc of docs) {
      await storageService.removeDocumentAssetsIfConfigured(doc.id).catch(() => {})
      const dir = path.join(storageService.getDocumentsDir(), doc.id)
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
      await prisma.document.delete({ where: { id: doc.id } })
    }
    return docs.length
  }
}

export const cleanupService = new CleanupService()
