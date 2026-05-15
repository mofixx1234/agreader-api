-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "pdfPublicUrl" TEXT,
ADD COLUMN     "sourcePublicUrl" TEXT;

-- AlterTable
ALTER TABLE "DocumentPage" ADD COLUMN     "imagePublicUrl" TEXT,
ADD COLUMN     "thumbPublicUrl" TEXT;
