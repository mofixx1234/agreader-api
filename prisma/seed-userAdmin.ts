// prisma/seed-userAdmin.ts

import 'dotenv/config'

import bcrypt from 'bcrypt'
import { PrismaClient } from '@prisma/client'

import { prisma } from '../src/lib/prisma'
// const prisma = new PrismaClient()

async function main() {
  // =============================================
  // CONFIG
  // =============================================

  const email = 'admin@flipbook.com'
  const password = 'Admin123@'

  // =============================================
  // CHECK EXISTING USER
  // =============================================

  const existingUser =
    await prisma.userAdmin.findUnique({
      where: {
        email,
      },
    })

  if (existingUser) {
    console.log(
      '❌ Admin already exists',
    )

    return
  }

  // =============================================
  // HASH PASSWORD
  // =============================================

  const passwordHash =
    await bcrypt.hash(password, 10)

  // =============================================
  // CREATE USER
  // =============================================

  const user =
    await prisma.userAdmin.create({
      data: {
        firstName: 'Super',
        lastName: 'Admin',

        email,

        passwordHash,

        role: 'super_admin',

        status: 'active',
      },
    })

  console.log(
    '✅ Admin created successfully',
  )

  console.log({
    id: user.id,
    email: user.email,
    password,
  })
}

main()
  .catch((error) => {
    console.error(error)

    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })