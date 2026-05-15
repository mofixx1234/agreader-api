import { Router } from "express";
import multer from "multer";
import { LogoPosition, PageDisposition, PageEffect } from "@prisma/client";
import { storageService } from "../storage/storage.service";
import { parsePageTurnSettingsBody } from "../../lib/pageTurnSettings";
import {
  customDocumentService,
  type CustomDocumentUpdateData,
} from "./custom-document.service";

const allowedLogoMimeTypes = ["image/png", "image/jpeg", "image/webp"];
const logoUploadMaxBytes = 5 * 1024 * 1024;

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: logoUploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    if (allowedLogoMimeTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Unsupported image file type"));
  },
});

const updateKeys = [
  "backgroundColor",
  "backgroundImage",
  "logoImage",
  "logoPosition",
  "logoSize",
  "logoOpacity",
  "logoLinkUrl",
  "pageEffect",
  "pageDisposition",
  "pageTurnSettings",
  "allowDownload",
  "allowShare",
  "allowPrint",
  "allowFullscreen",
  "allowPrevNext",
  "allowZoom",
  "allowFirstPage",
  "allowLastPage",
  "allowSearchText",
] as const;

const allowedUpdateKeys = new Set<string>(updateKeys);
const booleanKeys = [
  "allowDownload",
  "allowShare",
  "allowPrint",
  "allowFullscreen",
  "allowPrevNext",
  "allowZoom",
  "allowFirstPage",
  "allowLastPage",
  "allowSearchText",
] as const;

export const customDocumentRouter = Router();

customDocumentRouter.get(
  "/custom-documents/:documentId",
  async (req, res, next) => {
    try {
      const documentId = req.params.documentId;
      if (typeof documentId !== "string") {
        return res.status(400).json({ error: "documentId is required" });
      }
      const payload = await customDocumentService.getCustomDocument(documentId);
      if (!payload) return res.status(404).json({ error: "document not found" });
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

customDocumentRouter.patch(
  "/custom-documents/:documentId",
  async (req, res, next) => {
    try {
      const documentId = req.params.documentId;
      if (typeof documentId !== "string") {
        return res.status(400).json({ error: "documentId is required" });
      }
      const parsed = parseUpdateBody(req.body);
      if (!parsed.ok) return res.status(400).json({ error: parsed.error });
      const payload = await customDocumentService.updateCustomDocument(
        documentId,
        parsed.data,
      );
      if (!payload) return res.status(404).json({ error: "document not found" });
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

customDocumentRouter.patch(
  "/custom-documents/:documentId/logo",
  imageUpload.single("file"),
  async (req, res, next) => {
    try {
      const documentId = req.params.documentId;
      if (typeof documentId !== "string") {
        return res.status(400).json({ error: "documentId is required" });
      }
      if (!storageService.isSupabaseConfigured("images")) {
        return res.status(503).json({
          error: "Supabase images storage is not configured",
        });
      }

      const file = req.file;
      if (!file) return res.status(400).json({ error: "file is required" });

      const { fileTypeFromBuffer } = await import("file-type");
      const sniffed = await fileTypeFromBuffer(file.buffer);
      const effectiveMime = sniffed?.mime ?? file.mimetype;
      if (!allowedLogoMimeTypes.includes(effectiveMime)) {
        return res
          .status(415)
          .json({ error: `unsupported logo mime type: ${effectiveMime}` });
      }

      const payload = await customDocumentService.uploadLogo(documentId, {
        buffer: file.buffer,
        mimetype: effectiveMime,
      });
      if (!payload) return res.status(404).json({ error: "document not found" });
      return res.status(201).json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

customDocumentRouter.patch(
  "/custom-documents/:documentId/background-image",
  imageUpload.single("file"),
  async (req, res, next) => {
    try {
      const documentId = req.params.documentId;
      if (typeof documentId !== "string") {
        return res.status(400).json({ error: "documentId is required" });
      }
      if (!storageService.isSupabaseConfigured("images")) {
        return res.status(503).json({
          error: "Supabase images storage is not configured",
        });
      }

      const file = req.file;
      if (!file) return res.status(400).json({ error: "file is required" });

      const { fileTypeFromBuffer } = await import("file-type");
      const sniffed = await fileTypeFromBuffer(file.buffer);
      const effectiveMime = sniffed?.mime ?? file.mimetype;
      if (!allowedLogoMimeTypes.includes(effectiveMime)) {
        return res
          .status(415)
          .json({ error: `unsupported background image mime type: ${effectiveMime}` });
      }

      const payload = await customDocumentService.uploadBackgroundImage(documentId, {
        buffer: file.buffer,
        mimetype: effectiveMime,
      });
      if (!payload) return res.status(404).json({ error: "document not found" });
      return res.status(201).json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

function parseUpdateBody(
  body: unknown,
):
  | { ok: true; data: CustomDocumentUpdateData }
  | { ok: false; error: string } {
  if (!isPlainObject(body)) {
    return { ok: false, error: "request body must be an object" };
  }

  const unknownKeys = Object.keys(body).filter(
    (key) => !allowedUpdateKeys.has(key),
  );
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      error: `unsupported custom document fields: ${unknownKeys.join(", ")}`,
    };
  }

  const data: CustomDocumentUpdateData = {};

  for (const key of ["backgroundColor", "backgroundImage", "logoLinkUrl"] as const) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const value = body[key];
      if (value !== null && typeof value !== "string") {
        return { ok: false, error: `${key} must be a string or null` };
      }
      data[key] = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "logoImage")) {
    if (body.logoImage !== null) {
      return {
        ok: false,
        error: "logoImage must be uploaded with PATCH /custom-documents/:documentId/logo",
      };
    }
    data.logoImage = null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "logoPosition")) {
    if (!isEnumValue(body.logoPosition, LogoPosition)) {
      return { ok: false, error: "logoPosition is invalid" };
    }
    data.logoPosition = body.logoPosition;
  }

  if (Object.prototype.hasOwnProperty.call(body, "pageEffect")) {
    if (!isEnumValue(body.pageEffect, PageEffect)) {
      return { ok: false, error: "pageEffect is invalid" };
    }
    data.pageEffect = body.pageEffect;
  }

  if (Object.prototype.hasOwnProperty.call(body, "pageDisposition")) {
    if (!isEnumValue(body.pageDisposition, PageDisposition)) {
      return { ok: false, error: "pageDisposition is invalid" };
    }
    data.pageDisposition = body.pageDisposition;
  }

  if (Object.prototype.hasOwnProperty.call(body, "pageTurnSettings")) {
    if (body.pageTurnSettings === null) {
      data.pageTurnSettings = null;
    } else {
      const parsed = parsePageTurnSettingsBody(body.pageTurnSettings);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      data.pageTurnSettings = parsed.value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "logoSize")) {
    const value = body.logoSize;
    if (
      value !== null &&
      (typeof value !== "number" || !Number.isInteger(value) || value < 0)
    ) {
      return { ok: false, error: "logoSize must be a positive integer or null" };
    }
    data.logoSize = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "logoOpacity")) {
    const value = body.logoOpacity;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      return { ok: false, error: "logoOpacity must be a number between 0 and 1" };
    }
    data.logoOpacity = value;
  }

  for (const key of booleanKeys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const value = body[key];
      if (typeof value !== "boolean") {
        return { ok: false, error: `${key} must be a boolean` };
      }
      data[key] = value;
    }
  }

  return { ok: true, data };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEnumValue<T extends string>(
  value: unknown,
  enumObject: Record<string, T>,
): value is T {
  return typeof value === "string" && Object.values(enumObject).includes(value as T);
}
