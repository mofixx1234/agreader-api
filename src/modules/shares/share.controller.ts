import { Router } from 'express'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { shareService } from './share.service'
import { logger } from '../../lib/logger'

export const shareRouter = Router()

shareRouter.post('/shares', async (req, res, next) => {
  try {
    const { documentId, ...rest } = req.body ?? {}
    if (!documentId || typeof documentId !== 'string') {
      return res.status(400).json({ error: 'documentId is required' })
    }
    const created = await shareService.createShare(documentId, rest)
    if (!created) return res.status(404).json({ error: 'document not found' })
    return res.status(201).json(created)
  } catch (error) {
    return next(error)
  }
})

shareRouter.patch('/shares/:id', async (req, res, next) => {
  try {
    const updated = await shareService.updateShare(req.params.id, req.body ?? {})
    if (!updated) return res.status(404).json({ error: 'share not found' })
    return res.json(updated)
  } catch (error) {
    return next(error)
  }
})

shareRouter.post('/shares/:token/verify-password', async (req, res, next) => {
  try {
    const password = req.body?.password
    if (typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'password is required' })
    }
    const ok = await shareService.verifyPassword(req.params.token, password)
    if (ok === null) return res.status(404).json({ error: 'share not found' })
    if (!ok) return res.status(401).json({ ok: false })
    return res.json({ ok: true })
  } catch (error) {
    return next(error)
  }
})

shareRouter.get('/shares/:token/view', async (req, res, next) => {
  try {
    const password =
      typeof req.query.password === 'string'
        ? req.query.password
        : typeof req.headers['x-share-password'] === 'string'
          ? req.headers['x-share-password']
          : undefined
    const payload = await shareService.getViewerPayload(req.params.token, {
      password,
      clientIp: req.ip ?? 'unknown',
      userAgent: req.get('user-agent') ?? 'unknown',
    })
    if (!payload.ok) {
      logger.warn({ token: req.params.token, reason: payload.error }, 'Share access denied')
      return res.status(payload.code).json({ error: payload.error })
    }
    return res.json(payload)
  } catch (error) {
    return next(error)
  }
})

shareRouter.get('/shares/:token/pages', async (req, res, next) => {
  try {
    const password =
      typeof req.query.password === 'string'
        ? req.query.password
        : typeof req.headers['x-share-password'] === 'string'
          ? req.headers['x-share-password']
          : undefined
    const payload = await shareService.getSharePages(req.params.token, password)
    if (!payload.ok) {
      logger.warn({ token: req.params.token, reason: payload.error }, 'Share pages denied')
      return res.status(payload.code).json({ error: payload.error })
    }
    return res.json(payload)
  } catch (error) {
    return next(error)
  }
})

shareRouter.get('/shares/:token/files/*path', async (req, res, next) => {
  try {
    const rawPath = (req.params as Record<string, string | string[] | undefined>).path
    const wildcard = Array.isArray(rawPath) ? rawPath.join('/') : rawPath
    if (!wildcard) return res.status(400).json({ error: 'path is required' })
    const password =
      typeof req.query.password === 'string'
        ? req.query.password
        : typeof req.headers['x-share-password'] === 'string'
          ? req.headers['x-share-password']
          : undefined
    const resolved = await shareService.resolveShareFile(req.params.token, wildcard, password)
    if (!resolved.ok) {
      logger.warn({ token: req.params.token, reason: resolved.error }, 'Share file denied')
      return res.status(resolved.code).json({ error: resolved.error })
    }
    await fs.access(resolved.absolutePath)
    return res.sendFile(path.resolve(resolved.absolutePath))
  } catch (error) {
    return next(error)
  }
})
