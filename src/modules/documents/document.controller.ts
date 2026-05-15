import { Router } from "express";
import multer from "multer";
import path from "node:path";
import { promises as fs } from "node:fs";
import { allowedMimeTypes, env } from "../../config/env";
import { storageService } from "../storage/storage.service";
import {
  isUploadCandidateAllowed,
  resolveUploadMimeType,
} from "./document-mime";
import { documentService } from "./document.service";
import { shareService } from "../shares/share.service";

const upload = multer({
  dest: path.join(env.STORAGE_ROOT, "uploads"),
  limits: { fileSize: env.UPLOAD_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (isUploadCandidateAllowed(file.originalname, file.mimetype))
      cb(null, true);
    else cb(new Error("Unsupported file type"));
  },
});

export const documentRouter = Router();

documentRouter.post(
  "/documents/upload",
  upload.single("file"),
  async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "file is required" });
      const { fileTypeFromFile } = await import("file-type");
      const sniffed = await fileTypeFromFile(file.path);
      const effectiveMime = resolveUploadMimeType(
        file.originalname,
        file.mimetype,
        sniffed?.mime,
      );
      if (!allowedMimeTypes.includes(effectiveMime)) {
        await fs.unlink(file.path).catch(() => {});
        return res
          .status(415)
          .json({ error: `unsupported mime type: ${effectiveMime}` });
      }
      await storageService.ensureReady();
      const created = await documentService.createFromUpload({
        ...file,
        mimetype: effectiveMime,
      });
      return res.status(201).json(created);
    } catch (error) {
      return next(error);
    }
  },
);

documentRouter.get("/documents", async (req, res, next) => {
  try {
    const documents = await documentService.getAllDocuments();

    return res.status(200).json(documents);
  } catch (error) {
    return next(error);
  }
});

documentRouter.get("/documents/:id", async (req, res, next) => {
  try {
    const doc = await documentService.getDocument(req.params.id);
    if (!doc) return res.status(404).json({ error: "not found" });
    return res.json(doc);
  } catch (error) {
    return next(error);
  }
});

documentRouter.get("/documents/:id/progress", async (req, res, next) => {
  try {
    const payload = await documentService.getProgress(req.params.id);
    if (!payload) return res.status(404).json({ error: "not found" });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

documentRouter.get("/documents/:id/pages", async (req, res, next) => {
  try {
    const payload = await documentService.getPages(req.params.id);
    if (!payload) return res.status(404).json({ error: "not found" });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

// Route temporaire pour récupérer une vue publique d’un document
// sans token de partage, basée directement sur le modèle Document.
documentRouter.get(
  "/documents/:id/public",
  async (req, res, next) => {
    try {
      const payload = await documentService.getPublicView(req.params.id);
      if (!payload) return res.status(404).json({ error: "not found" });
      if (!payload.ok) {
        return res.status(payload.code).json({ error: payload.error });
      }
      return res.json(payload);
    } catch (error) {
      return next(error);
    }
  },
);

documentRouter.post("/documents/:id/retry", async (req, res, next) => {
  try {
    const payload = await documentService.retry(req.params.id);
    if (!payload) return res.status(404).json({ error: "not found" });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

documentRouter.delete("/documents/:id", async (req, res, next) => {
  try {
    const payload = await documentService.delete(req.params.id);
    if (!payload) return res.status(404).json({ error: "not found" });
    return res.status(202).json(payload);
  } catch (error) {
    return next(error);
  }
});

documentRouter.get("/files/*path", async (req, res, next) => {
  try {
    const rawPath = (
      req.params as Record<string, string | string[] | undefined>
    ).path;
    const wildcard = Array.isArray(rawPath) ? rawPath.join("/") : rawPath;
    if (!wildcard) return res.status(400).json({ error: "path is required" });
    const root = path.resolve(env.STORAGE_ROOT);
    const candidate = path.resolve(root, wildcard);
    if (!candidate.startsWith(root))
      return res.status(403).json({ error: "forbidden" });
    const relativeStoragePath = path
      .relative(root, candidate)
      .replaceAll("\\", "/");
    const docMatch = relativeStoragePath.match(/^documents\/([^/]+)\/(.+)$/);
    if (docMatch) {
      const token =
        typeof req.query.token === "string"
          ? req.query.token
          : typeof req.headers["x-share-token"] === "string"
            ? req.headers["x-share-token"]
            : undefined;
      if (!token)
        return res.status(401).json({ error: "share token is required" });
      const password =
        typeof req.query.password === "string"
          ? req.query.password
          : typeof req.headers["x-share-password"] === "string"
            ? req.headers["x-share-password"]
            : undefined;
      const documentId = docMatch[1];
      const pathInDocument = docMatch[2];
      if (!documentId || !pathInDocument)
        return res.status(403).json({ error: "forbidden" });
      const resolved = await shareService.resolveShareFile(
        token,
        pathInDocument,
        password,
      );
      if (!resolved.ok)
        return res.status(resolved.code).json({ error: resolved.error });
      const expectedPath = path.resolve(root, relativeStoragePath);
      if (path.resolve(resolved.absolutePath) !== expectedPath) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (
        relativeStoragePath.endsWith(".pdf") &&
        !(await shareService.hasPermission(
          token,
          "allowDownload",
          password,
          documentId,
        ))
      ) {
        return res
          .status(403)
          .json({ error: "download is not allowed for this share" });
      }
    }
    await fs.access(candidate);
    return res.sendFile(candidate);
  } catch (error) {
    return next(error);
  }
});
