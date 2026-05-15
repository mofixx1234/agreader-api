-- CreateEnum
CREATE TYPE "LogoPosition" AS ENUM ('top_left', 'top_center', 'top_right', 'center_left', 'center', 'center_right', 'bottom_left', 'bottom_center', 'bottom_right');

-- AlterTable
ALTER TABLE "DocumentShare" ADD COLUMN     "logoImage" TEXT,
ADD COLUMN     "logoLinkUrl" TEXT,
ADD COLUMN     "logoOpacity" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "logoPosition" "LogoPosition" NOT NULL DEFAULT 'top_left',
ADD COLUMN     "logoSize" INTEGER;
