import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../config/env";

export type StorageBucket = "documents" | "images";

export class StorageService {
  private root = path.resolve(env.STORAGE_ROOT);
  private supabaseUrl = env.SUPABASE_URL?.replace(/\/$/, "");
  private supabaseDocumentsBucket = env.SUPABASE_STORAGE_BUCKET;
  private supabaseImagesBucket = env.SUPABASE_IMAGES_BUCKET;
  private supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  private supabase: SupabaseClient | null = null;

  async cleanupLocalDocument(documentId: string): Promise<void> {
    const docDir = this.getDocumentDir(documentId);

    await fs.rm(docDir, {
      recursive: true,
      force: true,
    });
  }
  async ensureReady(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    await fs.mkdir(this.getUploadsDir(), { recursive: true });
    await fs.mkdir(this.getDocumentsDir(), { recursive: true });
  }

  getUploadsDir(): string {
    return path.join(this.root, "uploads");
  }

  getDocumentsDir(): string {
    return path.join(this.root, "documents");
  }

  getDocumentDir(documentId: string): string {
    return path.join(this.getDocumentsDir(), documentId);
  }

  async ensureDocumentDir(documentId: string): Promise<string> {
    const dir = this.getDocumentDir(documentId);
    await fs.mkdir(path.join(dir, "pages"), { recursive: true });
    await fs.mkdir(path.join(dir, "thumbs"), { recursive: true });
    return dir;
  }

  resolveDocumentPath(documentId: string, relativePath: string): string {
    return path.resolve(this.getDocumentDir(documentId), relativePath);
  }

  toRelativeStoragePath(absolutePath: string): string {
    return path.relative(this.root, absolutePath).replaceAll("\\", "/");
  }

  isSupabaseConfigured(bucket: StorageBucket = "documents"): boolean {
    return Boolean(
      this.supabaseUrl &&
        this.getSupabaseBucket(bucket) &&
        this.supabaseServiceRoleKey,
    );
  }

  /**
   * Converts an absolute local path (or already relative path) to a stable object key.
   */
  toObjectKey(storagePath: string): string {
    const normalized = storagePath.replaceAll("\\", "/");
    if (path.isAbsolute(storagePath)) {
      return this.toRelativeStoragePath(storagePath);
    }
    return normalized.replace(/^\/+/, "");
  }

  toSupabasePublicUrl(
    storagePath: string,
    bucket: StorageBucket = "documents",
  ): string {
    const supabaseBucket = this.getSupabaseBucket(bucket);
    if (!this.supabaseUrl || !supabaseBucket) {
      throw new Error("Supabase storage is not configured");
    }
    const objectKey = encodeURI(this.toObjectKey(storagePath));
    return `${this.supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${objectKey}`;
  }

  toPublicUrl(absolutePath: string): string {
    if (this.isSupabaseConfigured()) {
      return this.toSupabasePublicUrl(absolutePath);
    }
    const rel = this.toObjectKey(absolutePath);
    return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/files/${rel}`;
  }

  async uploadFileIfConfigured(
    storagePath: string,
    contentType?: string,
    bucket: StorageBucket = "documents",
  ): Promise<void> {
    if (!this.isSupabaseConfigured(bucket)) return;

    const client = this.getSupabaseClient();
    const supabaseBucket = this.getRequiredSupabaseBucket(bucket);

    const objectKey = this.toObjectKey(storagePath);

    const absolutePath = path.isAbsolute(storagePath)
      ? storagePath
      : path.join(this.root, storagePath);

    const body = await fs.readFile(absolutePath);

    // AUTO MIME DETECTION
    const ext = path.extname(storagePath).toLowerCase();

    let detectedContentType = contentType;

    if (!detectedContentType) {
      switch (ext) {
        case ".jpg":
        case ".jpeg":
          detectedContentType = "image/jpeg";
          break;

        case ".png":
          detectedContentType = "image/png";
          break;

        case ".pdf":
          detectedContentType = "application/pdf";
          break;

        case ".webp":
          detectedContentType = "image/webp";
          break;

        default:
          detectedContentType = "application/octet-stream";
      }
    }

    const { error } = await client.storage
      .from(supabaseBucket)
      .upload(objectKey, body, {
        upsert: true,
        contentType: detectedContentType,
        cacheControl: "3600",
      });

    if (error) {
      throw new Error(
        `Supabase upload failed for ${objectKey}: ${error.message}`,
      );
    }
  }

  async uploadBufferToSupabaseObject(
    objectKey: string,
    body: Buffer,
    contentType: string,
    bucket: StorageBucket = "images",
  ): Promise<string> {
    if (!this.isSupabaseConfigured(bucket)) {
      throw new Error("Supabase storage is not configured");
    }

    const client = this.getSupabaseClient();
    const supabaseBucket = this.getRequiredSupabaseBucket(bucket);
    const normalizedObjectKey = this.toObjectKey(objectKey);
    const { error } = await client.storage
      .from(supabaseBucket)
      .upload(normalizedObjectKey, body, {
        upsert: true,
        contentType,
        cacheControl: "3600",
      });

    if (error) {
      throw new Error(
        `Supabase upload failed for ${normalizedObjectKey}: ${error.message}`,
      );
    }

    return this.toSupabasePublicUrl(normalizedObjectKey, bucket);
  }

  async removeSupabasePublicUrlIfConfigured(
    publicUrl: string | null | undefined,
    bucket: StorageBucket = "images",
  ): Promise<void> {
    if (!publicUrl || !this.isSupabaseConfigured(bucket)) return;
    const objectKey = this.getObjectKeyFromSupabasePublicUrl(publicUrl, bucket);
    if (!objectKey) return;
    const { error } = await this.getSupabaseClient()
      .storage.from(this.getRequiredSupabaseBucket(bucket))
      .remove([objectKey]);
    if (error) {
      throw new Error(`Supabase remove failed for ${objectKey}: ${error.message}`);
    }
  }

  getDocumentCoverUrl(documentId: string): string {
    const relativePath = `documents/${documentId}/pages/page-1.jpg`;
    console.log("Generated cover URL for document", documentId, ":", relativePath);
    return this.toPublicUrl(relativePath);
  }

  async syncDocumentAssetsIfConfigured(documentId: string): Promise<void> {
    if (!this.isSupabaseConfigured()) return;

    const docDir = this.getDocumentDir(documentId);

    const filePaths = await this.walkFiles(docDir);

    await Promise.all(
      filePaths.map((filePath) => this.uploadFileIfConfigured(filePath)),
    );
  }
  async removeDocumentAssetsIfConfigured(documentId: string): Promise<void> {
    if (!this.isSupabaseConfigured()) return;
    const client = this.getSupabaseClient();
    const prefix = `documents/${documentId}`;
    const batchSize = 100;
    let offset = 0;

    while (true) {
      const { data, error } = await client.storage
        .from(this.getRequiredSupabaseBucket("documents"))
        .list(prefix, {
          limit: batchSize,
          offset,
        });
      if (error)
        throw new Error(`Supabase list failed for ${prefix}: ${error.message}`);
      if (!data || data.length === 0) break;
      const keys = data
        .filter((item) => item.name && item.name !== ".emptyFolderPlaceholder")
        .map((item) => `${prefix}/${item.name}`);
      if (keys.length > 0) {
        const { error: removeError } = await client.storage
          .from(this.getRequiredSupabaseBucket("documents"))
          .remove(keys);
        if (removeError) {
          throw new Error(
            `Supabase remove failed for ${prefix}: ${removeError.message}`,
          );
        }
      }
      if (data.length < batchSize) break;
      offset += batchSize;
    }
  }

  private getSupabaseBucket(bucket: StorageBucket): string | undefined {
    return bucket === "images"
      ? this.supabaseImagesBucket
      : this.supabaseDocumentsBucket;
  }

  private getRequiredSupabaseBucket(bucket: StorageBucket): string {
    const supabaseBucket = this.getSupabaseBucket(bucket);
    if (!supabaseBucket) {
      throw new Error("Supabase storage bucket is not configured");
    }
    return supabaseBucket;
  }

  private getObjectKeyFromSupabasePublicUrl(
    publicUrl: string,
    bucket: StorageBucket,
  ): string | null {
    if (!this.supabaseUrl) return null;
    let parsed: URL;
    try {
      parsed = new URL(publicUrl);
    } catch {
      return null;
    }
    const supabaseBase = new URL(this.supabaseUrl);
    if (parsed.origin !== supabaseBase.origin) return null;
    const supabaseBucket = this.getRequiredSupabaseBucket(bucket);
    const prefix = `/storage/v1/object/public/${supabaseBucket}/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(parsed.pathname.slice(prefix.length));
  }

  private getSupabaseClient(): SupabaseClient {
    if (!this.supabaseUrl || !this.supabaseServiceRoleKey) {
      throw new Error("Supabase client is not configured");
    }
    if (!this.supabase) {
      this.supabase = createClient(
        this.supabaseUrl,
        this.supabaseServiceRoleKey,
        {
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
    }
    return this.supabase;
  }

  private async walkFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.walkFiles(fullPath)));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
    return results;
  }
}

export const storageService = new StorageService();
