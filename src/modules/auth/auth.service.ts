// modules/auth/auth.service.ts

import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

import { prisma } from '../../lib/prisma'
import { env } from '../../config/env'

import {LoginDto, RegisterDto,} from './auth.type'

export const authService = {
  // =============================================
  // REGISTER
  // =============================================

  async register(payload: RegisterDto) {
    const exists = await prisma.userAdmin.findUnique({
      where: {
        email: payload.email,
      },
    })

    if (exists) {
      throw new Error('email already exists')
    }

    const passwordHash = await bcrypt.hash(
      payload.password,
      10,
    )

    const user = await prisma.userAdmin.create({
      data: {
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        passwordHash,
      },
    })

    const accessToken = this.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    })

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },

      accessToken,
    }
  },

  // =============================================
  // LOGIN
  // =============================================

  async login(payload: LoginDto) {
    const user = await prisma.userAdmin.findUnique({
      where: {
        email: payload.email,
      },
    })

    if (!user) {
      throw new Error('invalid credentials')
    }

    const validPassword = await bcrypt.compare(
      payload.password,
      user.passwordHash,
    )

    if (!validPassword) {
      throw new Error('invalid credentials')
    }

    if (user.status !== 'active') {
      throw new Error('account disabled')
    }

    await prisma.userAdmin.update({
      where: {
        id: user.id,
      },

      data: {
        lastLoginAt: new Date(),
      },
    })

    const accessToken = this.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    })

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },

      accessToken,
    }
  },

  // =============================================
  // VERIFY TOKEN
  // =============================================

  verifyAccessToken(token: string) {
    return jwt.verify(
      token,
      env.JWT_SECRET,
    )
  },

  // =============================================
  // GENERATE TOKEN
  // =============================================

  generateAccessToken(payload: {
    id: string
    email: string
    role: string
  }) {
    return jwt.sign(
      {
        sub: payload.id,
        email: payload.email,
        role: payload.role,
      },

      env.JWT_SECRET,

      {
        expiresIn: '7d',
      },
    )
  },
}