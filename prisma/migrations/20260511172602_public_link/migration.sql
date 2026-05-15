-- CreateTable
CREATE TABLE "PublicLink" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicLink_slug_key" ON "PublicLink"("slug");

-- CreateIndex
CREATE INDEX "PublicLink_documentId_idx" ON "PublicLink"("documentId");

-- CreateIndex
CREATE INDEX "PublicLink_isActive_expiresAt_idx" ON "PublicLink"("isActive", "expiresAt");

-- AddForeignKey
ALTER TABLE "PublicLink" ADD CONSTRAINT "PublicLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
