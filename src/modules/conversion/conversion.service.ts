import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { DocumentStatus } from "@prisma/client";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { logger } from "../../lib/logger";
import { storageService } from "../storage/storage.service";
import { documentService } from "../documents/document.service";

type ProgressFn = (step: string, progress: number) => Promise<void>;

async function readJpegDimensions(
  filePath: string,
): Promise<{ width: number; height: number }> {
  const buffer = await fs.readFile(filePath);
  let offset = 0;
  if (buffer.readUInt16BE(offset) !== 0xffd8) {
    throw new Error(`Invalid JPEG file: ${filePath}`);
  }
  offset += 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xc0 || marker === 0xc2) {
      const blockLength = buffer.readUInt16BE(offset);
      if (blockLength < 7) break;
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return { width, height };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const blockLength = buffer.readUInt16BE(offset);
    offset += blockLength;
  }

  throw new Error(`Could not read JPEG dimensions: ${filePath}`);
}

async function runCommand(
  cmd: string,
  args: string[],
  cwd?: string,
): Promise<void> {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`${cmd} failed (${code}): ${stderr}`));
    });
  });
}

function isPdfMime(mime: string): boolean {
  return mime.toLowerCase() === "application/pdf";
}

export class ConversionService {
  async processDocument(
    documentId: string,
    updateProgress: ProgressFn,
  ): Promise<void> {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error(`Document ${documentId} not found`);

    const docDir = await storageService.ensureDocumentDir(documentId);
    const pdfPath = path.join(docDir, "source.pdf");
    const pagesDir = path.join(docDir, "pages");
    const thumbsDir = path.join(docDir, "thumbs");

    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.normalizing, errorMessage: null },
    });
    await updateProgress("normalizing", 10);

    // PDF: copie directe. Word, Excel, PowerPoint, etc. : LibreOffice → PDF puis pdftoppm.
    if (isPdfMime(doc.mimeType)) {
      await fs.copyFile(doc.sourcePath, pdfPath);
    } else {
      const outDir = docDir;
      await runCommand(env.SOFFICE_PATH, [
        "--headless",
        "--convert-to",
        "pdf",
        "--outdir",
        outDir,
        doc.sourcePath,
      ]);
      /** Le fichier d'entrée est `source.docx` (voir document.service), donc LibreOffice écrit `source.pdf`, pas `<originalName>.pdf`. */
      const convertedPdf = path.join(
        outDir,
        `${path.parse(doc.sourcePath).name}.pdf`,
      );
      await fs.copyFile(convertedPdf, pdfPath);
    }

    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.rasterizing, pdfPath },
    });
    await updateProgress("rasterizing", 45);

    const outputPrefix = path.join(pagesDir, "page");
    await runCommand("pdftoppm", ["-jpeg", "-r", "180", pdfPath, outputPrefix]);
    const thumbPrefix = path.join(thumbsDir, "thumb");
    await runCommand("pdftoppm", ["-jpeg", "-r", "72", pdfPath, thumbPrefix]);

    const files = (await fs.readdir(pagesDir))
      .filter((f) => f.toLowerCase().endsWith(".jpg"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const thumbs = (await fs.readdir(thumbsDir))
      .filter((f) => f.toLowerCase().endsWith(".jpg"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const pageRows = await Promise.all(
      files.map(async (imageFile, index) => {
        const imagePath = path.join(pagesDir, imageFile);
        const thumbFile = thumbs[index];
        const thumbPath = thumbFile
          ? path.join(thumbsDir, thumbFile)
          : imagePath;
        const dimensions = await readJpegDimensions(imagePath);
        return {
          documentId,
          pageIndex: index + 1,
          imagePath,
          thumbPath,
          width: dimensions.width,
          height: dimensions.height,
        };
      }),
    );

    await prisma.$transaction(async (tx) => {
      await tx.documentPage.deleteMany({ where: { documentId } });
      if (pageRows.length > 0) {
        await tx.documentPage.createMany({
          data: pageRows,
        });
      }
      await tx.document.update({
        where: { id: documentId },
        data: {
          status: DocumentStatus.ready,
          pageCount: files.length,
          pdfPath,
        },
      });
    });

    // await storageService.syncDocumentAssetsIfConfigured(documentId);

    // await updateProgress("done", 100);

    if (storageService.isSupabaseConfigured()) {
      await storageService.syncDocumentAssetsIfConfigured(documentId);
      await documentService.persistSupabasePublicUrls(documentId);
      await storageService.cleanupLocalDocument(documentId);
    }

    await updateProgress("done", 100);
  }

  async failDocument(documentId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ documentId, err: message }, "Document conversion failed");
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.failed, errorMessage: message },
    });
  }
}

export const conversionService = new ConversionService();
