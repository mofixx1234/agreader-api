-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'admin', 'moderator', 'support');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'suspended', 'disabled');

-- CreateTable
CREATE TABLE "UserAdmin" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserAdmin_email_key" ON "UserAdmin"("email");

-- CreateIndex
CREATE INDEX "UserAdmin_email_idx" ON "UserAdmin"("email");

-- CreateIndex
CREATE INDEX "UserAdmin_role_idx" ON "UserAdmin"("role");

-- CreateIndex
CREATE INDEX "UserAdmin_status_idx" ON "UserAdmin"("status");
