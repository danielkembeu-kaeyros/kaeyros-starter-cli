/**
 * Storage abstraction
 * -------------------
 * Application code depends on `StorageProvider` and never imports an SDK
 * directly. Providers (S3, local, Cloudinary, Azure) implement this surface
 * and are wired by the factory in storage.module.ts.
 *
 * Per-account key prefix is enforced server-side — callers do not pick the
 * S3 key. The provider receives the resolved key from FilesService and
 * never trusts user-supplied paths.
 */

export interface StoragePutInput {
  /** Object key, already prefixed and sanitised by FilesService. */
  key: string;
  /** Raw bytes. */
  body: Buffer;
  /** Validated MIME type. */
  mimeType: string;
  /** Optional metadata pairs the provider may attach (e.g. S3 metadata). */
  metadata?: Record<string, string>;
}

export interface StoragePutResult {
  key: string;
  size: number;
}

export interface StoragePresignOptions {
  /** TTL in seconds. */
  expiresIn?: number;
  /** Suggested filename surfaced to the browser via Content-Disposition. */
  filename?: string;
}

export interface StorageProvider {
  /** Upload bytes at the resolved key. Idempotent — overwriting is allowed. */
  put(input: StoragePutInput): Promise<StoragePutResult>;

  /** Delete the object. Idempotent — already-absent keys succeed. */
  remove(key: string): Promise<void>;

  /** Issue a presigned GET URL for download. NEVER returns a PUT URL. */
  getDownloadUrl(key: string, opts?: StoragePresignOptions): Promise<string>;

  /** Check existence without downloading. */
  exists(key: string): Promise<boolean>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
