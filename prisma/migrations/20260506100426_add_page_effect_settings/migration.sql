-- CreateEnum
CREATE TYPE "PageEffect" AS ENUM ('magazine', 'book', 'album', 'notebook', 'slider', 'cards', 'coverflow', 'one_page');

-- CreateEnum
CREATE TYPE "PageDisposition" AS ENUM ('adaptive', 'always_double_page', 'always_single_page');

-- AlterTable
ALTER TABLE "DocumentShare" ADD COLUMN     "pageDisposition" "PageDisposition" NOT NULL DEFAULT 'adaptive',
ADD COLUMN     "pageEffect" "PageEffect" NOT NULL DEFAULT 'notebook';
