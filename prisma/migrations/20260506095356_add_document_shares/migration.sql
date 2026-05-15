-- CreateTable
CREATE TABLE "DocumentShare" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "maxViews" INTEGER,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "allowShare" BOOLEAN NOT NULL DEFAULT true,
    "allowPrint" BOOLEAN NOT NULL DEFAULT true,
    "allowFullscreen" BOOLEAN NOT NULL DEFAULT true,
    "allowPrevNext" BOOLEAN NOT NULL DEFAULT true,
    "allowZoom" BOOLEAN NOT NULL DEFAULT true,
    "allowFirstPage" BOOLEAN NOT NULL DEFAULT true,
    "allowLastPage" BOOLEAN NOT NULL DEFAULT true,
    "allowSearchText" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentShare_token_key" ON "DocumentShare"("token");

-- CreateIndex
CREATE INDEX "DocumentShare_documentId_idx" ON "DocumentShare"("documentId");

-- CreateIndex
CREATE INDEX "DocumentShare_isActive_expiresAt_idx" ON "DocumentShare"("isActive", "expiresAt");

-- AddForeignKey
ALTER TABLE "DocumentShare" ADD CONSTRAINT "DocumentShare_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
