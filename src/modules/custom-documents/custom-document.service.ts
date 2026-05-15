import crypto from "node:crypto";
import {
  LogoPosition,
  PageDisposition,
  PageEffect,
  Prisma,
} from "@prisma/client";
import type { PageTurnSettings } from "../../lib/pageTurnSettings";
import { prisma } from "../../lib/prisma";
import { storageService } from "../storage/storage.service";

const customDocumentSelect = {
  id: true,
  backgroundColor: true,
  backgroundImage: true,
  logoImage: true,
  logoPosition: true,
  logoSize: true,
  logoOpacity: true,
  logoLinkUrl: true,
  pageEffect: true,
  pageDisposition: true,
  pageTurnSettings: true,
  allowDownload: true,
  allowShare: true,
  allowPrint: true,
  allowFullscreen: true,
  allowPrevNext: true,
  allowZoom: true,
  allowFirstPage: true,
  allowLastPage: true,
  allowSearchText: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

type CustomDocumentRecord = Prisma.DocumentGetPayload<{
  select: typeof customDocumentSelect;
}>;

function toPrismaNullableJson(
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export type CustomDocumentUpdateData = Partial<{
  backgroundColor: string | null;
  backgroundImage: string | null;
  logoImage: string | null;
  logoPosition: LogoPosition;
  logoSize: number | null;
  logoOpacity: number;
  logoLinkUrl: string | null;
  pageEffect: PageEffect;
  pageDisposition: PageDisposition;
  pageTurnSettings: PageTurnSettings | null;
  allowDownload: boolean;
  allowShare: boolean;
  allowPrint: boolean;
  allowFullscreen: boolean;
  allowPrevNext: boolean;
  allowZoom: boolean;
  allowFirstPage: boolean;
  allowLastPage: boolean;
  allowSearchText: boolean;
}>;

export class CustomDocumentService {
  async getCustomDocument(documentId: string) {
    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: customDocumentSelect,
    });
    if (!existing) return null;
    return this.toPayload(existing);
  }

  async updateCustomDocument(
    documentId: string,
    data: CustomDocumentUpdateData,
  ) {
    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: customDocumentSelect,
    });
    if (!existing) return null;

    if (Object.keys(data).length === 0) {
      return this.toPayload(existing);
    }

    const { pageTurnSettings, ...rest } = data;
    const updateData: Prisma.DocumentUpdateInput = { ...rest };
    if (Object.prototype.hasOwnProperty.call(data, "pageTurnSettings")) {
      updateData.pageTurnSettings = toPrismaNullableJson(pageTurnSettings);
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: updateData,
      select: customDocumentSelect,
    });

    if (Object.prototype.hasOwnProperty.call(data, "logoImage") && !data.logoImage) {
      await storageService.removeSupabasePublicUrlIfConfigured(
        existing.logoImage,
        "images",
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(data, "backgroundImage") &&
      !data.backgroundImage
    ) {
      await storageService.removeSupabasePublicUrlIfConfigured(
        existing.backgroundImage,
        "images",
      );
    }

    return this.toPayload(updated);
  }

  async uploadLogo(
    documentId: string,
    file: { buffer: Buffer; mimetype: string },
  ) {
    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, logoImage: true },
    });
    if (!existing) return null;

    const objectKey = `logos/${documentId}/${crypto.randomUUID()}.${this.getImageExtension(file.mimetype)}`;
    const logoImage = await storageService.uploadBufferToSupabaseObject(
      objectKey,
      file.buffer,
      file.mimetype,
      "images",
    );

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { logoImage },
      select: customDocumentSelect,
    });

    await storageService.removeSupabasePublicUrlIfConfigured(
      existing.logoImage,
      "images",
    );

    return this.toPayload(updated);
  }

  async uploadBackgroundImage(
    documentId: string,
    file: { buffer: Buffer; mimetype: string },
  ) {
    const existing = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, backgroundImage: true },
    });
    if (!existing) return null;

    const objectKey = `backgrounds/${documentId}/${crypto.randomUUID()}.${this.getImageExtension(file.mimetype)}`;
    const backgroundImage = await storageService.uploadBufferToSupabaseObject(
      objectKey,
      file.buffer,
      file.mimetype,
      "images",
    );

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: { backgroundImage },
      select: customDocumentSelect,
    });

    await storageService.removeSupabasePublicUrlIfConfigured(
      existing.backgroundImage,
      "images",
    );

    return this.toPayload(updated);
  }

  private toPayload(doc: CustomDocumentRecord) {
    return {
      documentId: doc.id,
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
        pageTurnSettings: doc.pageTurnSettings as PageTurnSettings | null,
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
      updatedAt: doc.updatedAt,
    };
  }

  private getImageExtension(mimetype: string): "jpg" | "png" | "webp" {
    if (mimetype === "image/jpeg") return "jpg";
    if (mimetype === "image/png") return "png";
    if (mimetype === "image/webp") return "webp";
    throw new Error(`Unsupported logo mime type: ${mimetype}`);
  }
}

export const customDocumentService = new CustomDocumentService();
