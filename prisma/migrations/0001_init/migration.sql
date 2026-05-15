-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'queued', 'normalizing', 'rasterizing', 'optimizing', 'ready', 'failed', 'deleted');

-- CreateEnum
CREATE TYPE "ConversionJobStatus" AS ENUM ('pending', 'running', 'retry_wait', 'done', 'failed');

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "pdfPath" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "imagePath" TEXT NOT NULL,
    "thumbPath" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "ConversionJobStatus" NOT NULL DEFAULT 'pending',
    "step" TEXT NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageIndex_key" ON "DocumentPage"("documentId", "pageIndex");

-- CreateIndex
CREATE INDEX "DocumentPage_documentId_idx" ON "DocumentPage"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionJob_documentId_key" ON "ConversionJob"("documentId");

-- CreateIndex
CREATE INDEX "ConversionJob_status_runAfter_idx" ON "ConversionJob"("status", "runAfter");

-- AddForeignKey
ALTER TABLE "DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionJob" ADD CONSTRAINT "ConversionJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
