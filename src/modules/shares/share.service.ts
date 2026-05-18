import { env } from '../../config/env'
import crypto from 'node:crypto'
import path from 'node:path'
import {
  DocumentStatus,
  PageDisposition,
  PageEffect,
  LogoPosition,
  Prisma,
} from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { logger } from '../../lib/logger'
import { storageService } from '../storage/storage.service'

type ShareWithDocument = Prisma.DocumentShareGetPayload<{ include: { document: true } }>

type AccessValidationResult =
  | { ok: false; code: 401 | 403 | 404 | 410; error: string }
  | { ok: true; share: ShareWithDocument }

const RECENT_VIEWS_TTL_MS = 10 * 60 * 1000
const recentViewRegistry = new Map<string, number>()

function toPrismaNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

function cleanupRecentViewRegistry(now: number): void {
  for (const [key, seenAt] of recentViewRegistry.entries()) {
    if (now - seenAt > RECENT_VIEWS_TTL_MS) recentViewRegistry.delete(key)
  }
}

function fingerprintClient(ip: string, userAgent: string): string {
  return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex')
}

export class ShareService {
  async createShare(documentId: string, data?: Partial<Prisma.DocumentShareUncheckedCreateInput>) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } })
    if (!doc) return null
    const token = crypto.randomBytes(24).toString('base64url')
    const pageTurnSettings =
      data?.pageTurnSettings !== undefined ? data.pageTurnSettings : doc.pageTurnSettings
    const created = await prisma.documentShare.create({
      data: {
        documentId,
        token,
        title: data?.title ?? null,
        isActive: data?.isActive ?? true,
        expiresAt: data?.expiresAt ? new Date(data.expiresAt) : null,
        passwordHash: data?.passwordHash ?? null,
        maxViews: data?.maxViews ?? null,
        backgroundColor: data?.backgroundColor ?? null,
        backgroundImage: data?.backgroundImage ?? null,
        logoImage: data?.logoImage ?? null,
        logoPosition: data?.logoPosition ?? LogoPosition.top_left,
        logoSize: data?.logoSize ?? null,
        logoOpacity: data?.logoOpacity ?? 1,
        logoLinkUrl: data?.logoLinkUrl ?? null,
        pageEffect: data?.pageEffect ?? PageEffect.notebook,
        pageDisposition: data?.pageDisposition ?? PageDisposition.adaptive,
        pageTurnSettings: toPrismaNullableJson(pageTurnSettings),
        allowDownload: data?.allowDownload ?? true,
        allowShare: data?.allowShare ?? true,
        allowPrint: data?.allowPrint ?? true,
        allowFullscreen: data?.allowFullscreen ?? true,
        allowPrevNext: data?.allowPrevNext ?? true,
        allowZoom: data?.allowZoom ?? true,
        allowFirstPage: data?.allowFirstPage ?? true,
        allowLastPage: data?.allowLastPage ?? true,
        allowSearchText: data?.allowSearchText ?? false,
      },
    })
    logger.info({ shareId: created.id, documentId }, 'Share created')
    return created
  }

  async updateShare(shareId: string, data: Prisma.DocumentShareUpdateInput) {
    const existing = await prisma.documentShare.findUnique({ where: { id: shareId } })
    if (!existing) return null
    return prisma.documentShare.update({ where: { id: shareId }, data })
  }

  async verifyPassword(token: string, password: string): Promise<boolean | null> {
    const share = await prisma.documentShare.findUnique({ where: { token } })
    if (!share) return null
    if (!share.passwordHash) return true
    const hash = crypto.createHash('sha256').update(password).digest('hex')
    return hash === share.passwordHash
  }

  async getViewerPayload(
    token: string,
    opts: { password?: string; clientIp: string; userAgent: string },
  ) {
    const validated = await this.validateTokenAccess(token, opts.password)
    if (!validated.ok) return validated

    const { share } = validated
    if (share.document.status !== DocumentStatus.ready) {
      return { ok: false as const, code: 409 as const, error: 'document is not ready' }
    }

    await this.incrementViewCountSafely(share, opts.clientIp, opts.userAgent)

    return {
      ok: true as const,
      shareId: share.id,
      token: share.token,
      title: share.title,
      document: {
        id: share.document.id,
        originalName: share.document.originalName,
        pageCount: share.document.pageCount,
      },
      appearance: {
        backgroundColor: share.backgroundColor,
        backgroundImage: share.backgroundImage,
        logoImage: share.logoImage,
        logoPosition: share.logoPosition,
        logoSize: share.logoSize,
        logoOpacity: share.logoOpacity,
        logoLinkUrl: share.logoLinkUrl,
        pageEffect: share.pageEffect,
        pageDisposition: share.pageDisposition,
        pageTurnSettings: share.pageTurnSettings,
      },
      permissions: {
        allowDownload: share.allowDownload,
        allowShare: share.allowShare,
        allowPrint: share.allowPrint,
        allowFullscreen: share.allowFullscreen,
        allowPrevNext: share.allowPrevNext,
        allowZoom: share.allowZoom,
        allowFirstPage: share.allowFirstPage,
        allowLastPage: share.allowLastPage,
        allowSearchText: share.allowSearchText,
      },
      viewCount: share.viewCount + 1,
      expiresAt: share.expiresAt,
    }
  }

  async getSharePages(token: string, password?: string) {
    const validated = await this.validateTokenAccess(token, password)
    if (!validated.ok) return validated
    const share = validated.share
    if (share.document.status !== DocumentStatus.ready) {
      return { ok: false as const, code: 409 as const, error: 'document is not ready' }
    }
    const pages = await prisma.documentPage.findMany({
      where: { documentId: share.documentId },
      orderBy: { pageIndex: 'asc' },
    })

    return {
      ok: true as const,
      documentId: share.documentId,
      pageCount: pages.length,
      pages: pages.map((page) => {
        const imageFileUrl = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/shares/${share.token}/files/${path.relative(storageService.getDocumentDir(share.documentId), page.imagePath).replaceAll('\\', '/')}`
        const thumbFileUrl = page.thumbPath
          ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/shares/${share.token}/files/${path.relative(storageService.getDocumentDir(share.documentId), page.thumbPath).replaceAll('\\', '/')}`
          : null

        return {
          pageIndex: page.pageIndex,
          imageUrl: page.imagePublicUrl ?? imageFileUrl,
          thumbUrl: page.thumbPublicUrl ?? thumbFileUrl,
          width: page.width,
          height: page.height,
        }
      }),
    }
  }

  async resolveShareFile(token: string, relativePath: string, password?: string) {
    const validated = await this.validateTokenAccess(token, password)
    if (!validated.ok) return validated
    const share = validated.share
    const docRoot = storageService.getDocumentDir(share.documentId)
    const candidate = storageService.resolveDocumentPath(share.documentId, relativePath)
    if (!candidate.startsWith(docRoot)) {
      return { ok: false as const, code: 403 as const, error: 'forbidden' }
    }
    return { ok: true as const, absolutePath: candidate }
  }

  async hasPermission(
    token: string,
    permission: keyof Pick<
      Prisma.DocumentShareUncheckedCreateInput,
      | 'allowDownload'
      | 'allowShare'
      | 'allowPrint'
      | 'allowFullscreen'
      | 'allowPrevNext'
      | 'allowZoom'
      | 'allowFirstPage'
      | 'allowLastPage'
      | 'allowSearchText'
    >,
    password?: string,
    documentId?: string,
  ): Promise<boolean> {
    const validated = await this.validateTokenAccess(token, password)
    if (!validated.ok) return false
    if (documentId && validated.share.documentId !== documentId) return false
    return Boolean(validated.share[permission])
  }

  private async validateTokenAccess(token: string, password?: string): Promise<AccessValidationResult> {
    const share = await prisma.documentShare.findUnique({
      where: { token },
      include: { document: true },
    })
    if (!share) return { ok: false, code: 404, error: 'share not found' }
    if (!share.isActive) return { ok: false, code: 403, error: 'share is inactive' }
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      return { ok: false, code: 410, error: 'share has expired' }
    }
    if (typeof share.maxViews === 'number' && share.viewCount >= share.maxViews) {
      return { ok: false, code: 403, error: 'view limit reached' }
    }
    if (share.passwordHash) {
      if (!password) return { ok: false, code: 401, error: 'password required' }
      const hash = crypto.createHash('sha256').update(password).digest('hex')
      if (hash !== share.passwordHash) return { ok: false, code: 401, error: 'invalid password' }
    }
    return { ok: true, share }
  }

  private async incrementViewCountSafely(
    share: ShareWithDocument,
    clientIp: string,
    userAgent: string,
  ): Promise<void> {
    const now = Date.now()
    cleanupRecentViewRegistry(now)
    const visitorKey = `${share.id}:${fingerprintClient(clientIp, userAgent)}`
    const seenAt = recentViewRegistry.get(visitorKey)
    if (typeof seenAt === 'number' && now - seenAt <= RECENT_VIEWS_TTL_MS) return
    recentViewRegistry.set(visitorKey, now)
    await prisma.documentShare.update({
      where: { id: share.id },
      data: { viewCount: { increment: 1 } },
    })
    logger.info({ shareId: share.id }, 'Share view counted')
  }
}

export const shareService = new ShareService()
