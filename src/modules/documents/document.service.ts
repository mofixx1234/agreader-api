import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ConversionJobStatus, DocumentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { storageService } from "../storage/storage.service";
import { jobService } from "../jobs/job.service";

export class DocumentService {
  async createFromUpload(file: Express.Multer.File) {
    const id = crypto.randomUUID();
    const docDir = await storageService.ensureDocumentDir(id);
    const sourcePath = path.join(
      docDir,
      `source${path.extname(file.originalname) || ""}`,
    );
    await fs.copyFile(file.path, sourcePath);
    await fs.unlink(file.path).catch(() => {});
    await storageService.uploadFileIfConfigured(sourcePath, file.mimetype);

    const doc = await prisma.document.create({
      data: {
        id,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: BigInt(file.size),
        sourcePath,
        sourcePublicUrl: storageService.isSupabaseConfigured()
          ? storageService.toSupabasePublicUrl(sourcePath)
          : null,
        status: DocumentStatus.uploaded,
      },
    });

    await jobService.enqueue(doc.id);
    return { documentId: doc.id, status: DocumentStatus.queued };
  }

  async getDocument(documentId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { conversionJob: true },
    });
    if (!doc) return null;
    return {
      documentId: doc.id,
      status: doc.status,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes.toString(),
      pageCount: doc.pageCount,
      sourceUrl: storageService.toPublicUrl(doc.sourcePath),
      pdfUrl: doc.pdfPath ? storageService.toPublicUrl(doc.pdfPath) : null,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      conversion: doc.conversionJob
        ? {
            status: doc.conversionJob.status,
            step: doc.conversionJob.step,
            progress: doc.conversionJob.progress,
            attempt: doc.conversionJob.attempt,
            maxAttempts: doc.conversionJob.maxAttempts,
            runAfter: doc.conversionJob.runAfter,
            lastError: doc.conversionJob.lastError,
          }
        : null,
    };
  }

  async getProgress(documentId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { conversionJob: true },
    });
    if (!doc) return null;
    return {
      documentId: doc.id,
      status: doc.status,
      step: doc.conversionJob?.step ?? "queued",
      progress: doc.conversionJob?.progress ?? 0,
      errorMessage: doc.errorMessage ?? doc.conversionJob?.lastError ?? null,
    };
  }

  async getPages(documentId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { pages: { orderBy: { pageIndex: "asc" } } },
    });
    if (!doc) return null;
    return {
      documentId: doc.id,
      status: doc.status,
      pageCount: doc.pageCount,
      pages: doc.pages.map((p) => ({
        pageIndex: p.pageIndex,
        imageUrl: storageService.toPublicUrl(p.imagePath),
        width: p.width,
        height: p.height,
        thumbUrl: p.thumbPath ? storageService.toPublicUrl(p.thumbPath) : null,
      })),
    };
  }

  /**
   * Persiste les URLs publiques Supabase Storage en base (Postgres) après upload des fichiers.
   */
  async persistSupabasePublicUrls(documentId: string): Promise<void> {
    if (!storageService.isSupabaseConfigured()) return;
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { pages: { orderBy: { pageIndex: "asc" } } },
    });
    if (!doc) return;
    await prisma.document.update({
      where: { id: documentId },
      data: {
        sourcePublicUrl: storageService.toSupabasePublicUrl(doc.sourcePath),
        pdfPublicUrl: doc.pdfPath
          ? storageService.toSupabasePublicUrl(doc.pdfPath)
          : null,
      },
    });
    for (const p of doc.pages) {
      await prisma.documentPage.update({
        where: { id: p.id },
        data: {
          imagePublicUrl: storageService.toSupabasePublicUrl(p.imagePath),
          thumbPublicUrl: p.thumbPath
            ? storageService.toSupabasePublicUrl(p.thumbPath)
            : null,
        },
      });
    }
  }

  /**
   * Vue « publique » sans token : uniquement des URLs Supabase Storage
   * (champs *PublicUrl en base, ou dérivées des chemins si anciens enregistrements).
   * `allowShare` ne bloque pas cet endpoint : il est renvoyé dans `permissions` pour l’UI lecteur.
   */
  async getPublicView(documentId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { pages: { orderBy: { pageIndex: "asc" } } },
    });
    if (!doc) return null;

    if (!storageService.isSupabaseConfigured()) {
      return {
        ok: false as const,
        code: 503 as const,
        error: "public view requires Supabase storage configuration",
      };
    }

    const sourceUrl = doc.allowDownload
      ? (doc.sourcePublicUrl ??
        storageService.toSupabasePublicUrl(doc.sourcePath))
      : null;
    const pdfUrl =
      doc.allowDownload && doc.pdfPath
        ? (doc.pdfPublicUrl ??
          storageService.toSupabasePublicUrl(doc.pdfPath))
        : null;

    return {
      ok: true as const,
      documentId: doc.id,
      status: doc.status,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes.toString(),
      pageCount: doc.pageCount,
      sourceUrl,
      pdfUrl,
      appearance: {
        backgroundColor: doc.backgroundColor,
        backgroundImage: doc.backgroundImage,
        logoImage: doc.logoImage,
        logoPosition: doc.logoPosition,
        logoSize: doc.logoSize,
        logoOpacity: doc.logoOpacity,
        logoLinkUrl: doc.logoLinkUrl,
        pageEffect: doc.pageEffect,
        pageDisposition: doc.pageDisposition,
        pageTurnSettings: doc.pageTurnSettings,
      },
      permissions: {
        allowDownload: doc.allowDownload,
        allowShare: doc.allowShare,
        allowPrint: doc.allowPrint,
        allowFullscreen: doc.allowFullscreen,
        allowPrevNext: doc.allowPrevNext,
        allowZoom: doc.allowZoom,
        allowFirstPage: doc.allowFirstPage,
        allowLastPage: doc.allowLastPage,
        allowSearchText: doc.allowSearchText,
      },
      pages: doc.pages.map((p) => ({
        pageIndex: p.pageIndex,
        imageUrl:
          p.imagePublicUrl ??
          storageService.toSupabasePublicUrl(p.imagePath),
        width: p.width,
        height: p.height,
        thumbUrl: p.thumbPath
          ? (p.thumbPublicUrl ??
            storageService.toSupabasePublicUrl(p.thumbPath))
          : null,
      })),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  async retry(documentId: string) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return null;
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.queued, errorMessage: null },
    });
    await prisma.conversionJob.upsert({
      where: { documentId },
      create: {
        documentId,
        status: ConversionJobStatus.pending,
        step: "queued",
      },
      update: {
        status: ConversionJobStatus.pending,
        step: "queued",
        progress: 0,
        lastError: null,
        runAfter: new Date(),
      },
    });
    return { ok: true };
  }

  async delete(documentId: string) {
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) return null;
    await prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.deleted, deletedAt: new Date() },
    });
    return { ok: true };
  }

  async getAllDocuments() {
    const documents = await prisma.document.findMany({
      where: {
        status: {
          not: DocumentStatus.deleted,
        },
      },
      include: {
        conversionJob: true,
        pages: {
          orderBy: { pageIndex: "asc" },
          take: 1,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return documents.map((doc) => ({
      documentId: doc.id,
      status: doc.status,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes.toString(),
      pageCount: doc.pageCount,

      coverUrl:
        doc.pageCount > 0 && doc.pages[0]
          ? (doc.pages[0].imagePublicUrl ??
            storageService.toPublicUrl(doc.pages[0].imagePath))
          : null,

      pdfUrl: doc.pdfPath ? storageService.toPublicUrl(doc.pdfPath) : null,

      errorMessage: doc.errorMessage,

      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,

      conversion: doc.conversionJob
        ? {
            status: doc.conversionJob.status,
            step: doc.conversionJob.step,
            progress: doc.conversionJob.progress,
            attempt: doc.conversionJob.attempt,
            maxAttempts: doc.conversionJob.maxAttempts,
            runAfter: doc.conversionJob.runAfter,
            lastError: doc.conversionJob.lastError,
          }
        : null,
    }));
  }
}

export const documentService = new DocumentService();
