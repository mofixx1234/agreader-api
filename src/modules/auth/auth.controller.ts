// modules/auth/auth.controller.ts

import { Router } from 'express'
import {LoginDto } from './auth.type'
import { authService } from './auth.service'

export const authRouter = Router()

// =============================================
// REGISTER
// =============================================

authRouter.post(
  '/auth/register',
  async (req, res, next) => {
    try {
      const payload =
        await authService.register(req.body)

      return res.status(201).json(payload)
    } catch (error) {
      return next(error)
    }
  },
)

// =============================================
// LOGIN
// =============================================

authRouter.post(
  '/auth/login',
  async (req, res, next) => {
    try {
      const payload=
        await authService.login(req.body)

      return res.json(payload)
    } catch (error) {
      return next(error)
    }
  },
)

// =============================================
// ME
// =============================================

authRouter.get(
  '/auth/me',
  async (req, res, next) => {
    try {
      const authorization =
        req.headers.authorization

      if (!authorization) {
        return res.status(401).json({
          error: 'unauthorized',
        })
      }

      const token = authorization.replace(
        'Bearer ',
        '',
      )

      const decoded =
        authService.verifyAccessToken(token)

      return res.json(decoded)
    } catch (error) {
      return next(error)
    }
  },
)
// =============================================
// LOGOUT
// =============================================

authRouter.post(
  '/auth/logout',
  async (_req, res, next) => {
    try {
      return res.json({
        success: true,
        message: 'Logged out successfully',
      })
    } catch (error) {
      return next(error)
    }
  },
)