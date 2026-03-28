import fs from 'fs';
import path from 'path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { supabase } from '../db/client.js';

// ─── Provider interface ────────────────────────────────────────────────────────

interface StorageProvider {
  uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string; publicUrl: string }>;
  deleteFile(key: string): Promise<void>;
  getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
}

// ─── S3-compatible provider (Cloudflare R2, AWS S3, Backblaze B2, MinIO) ──────
//     All four services expose an S3-compatible API so the same client works.

class S3CompatibleProvider implements StorageProvider {
  private s3: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor(s3: S3Client, bucket: string, publicUrl: string) {
    this.s3 = s3;
    this.bucket = bucket;
    this.publicUrl = publicUrl;
  }

  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string; publicUrl: string }> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, publicUrl: `${this.publicUrl}/${key}` };
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
}

// ─── Supabase Storage provider ─────────────────────────────────────────────────
//     Uses the Supabase project already configured in this app (no new account
//     or billing required – 1 GB is included in the free tier).

class SupabaseStorageProvider implements StorageProvider {
  private bucket: string;

  constructor() {
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'attendai-files';
  }

  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string; publicUrl: string }> {
    const { error } = await supabase.storage
      .from(this.bucket)
      .upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    const {
      data: { publicUrl },
    } = supabase.storage.from(this.bucket).getPublicUrl(key);
    return { key, publicUrl };
  }

  async deleteFile(key: string): Promise<void> {
    const { error } = await supabase.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`Supabase delete failed: ${error.message}`);
  }

  async getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresIn);
    if (error || !data) throw new Error(`Supabase presign failed: ${error?.message}`);
    return data.signedUrl;
  }
}

// ─── Local filesystem provider (development / self-hosted) ─────────────────────
//     Stores files on disk. getPresignedUrl returns a plain public URL because
//     there is nothing to sign – serve the uploads folder with a static handler.

class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private publicUrl: string;

  constructor() {
    this.basePath = process.env.LOCAL_STORAGE_PATH ?? './uploads';
    this.publicUrl =
      process.env.LOCAL_STORAGE_PUBLIC_URL ?? 'http://localhost:3001/uploads';
  }

  async uploadFile(
    key: string,
    body: Buffer,
    _contentType: string,
  ): Promise<{ key: string; publicUrl: string }> {
    const filePath = path.join(this.basePath, key);
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, body);
    } catch (err) {
      throw new Error(`Local storage write failed: ${(err as Error).message}`);
    }
    return { key, publicUrl: `${this.publicUrl}/${key}` };
  }

  async deleteFile(key: string): Promise<void> {
    const filePath = path.join(this.basePath, key);
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Local storage delete failed: ${(err as Error).message}`);
      }
    }
  }

  async getPresignedUrl(key: string, _expiresIn = 3600): Promise<string> {
    const filePath = path.join(this.basePath, key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Local storage: file not found: ${key}`);
    }
    return `${this.publicUrl}/${key}`;
  }
}

// ─── Factory – select provider via STORAGE_PROVIDER env var ───────────────────

function createProvider(): StorageProvider {
  const provider = (process.env.STORAGE_PROVIDER ?? 'r2').toLowerCase();

  switch (provider) {
    // ── Cloudflare R2 (original default) ─────────────────────────────────────
    case 'r2': {
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
        },
      });
      return new S3CompatibleProvider(
        s3,
        process.env.R2_BUCKET_NAME ?? 'attendai-files',
        process.env.R2_PUBLIC_URL ?? '',
      );
    }

    // ── AWS S3 ────────────────────────────────────────────────────────────────
    case 's3': {
      const s3 = new S3Client({
        region: process.env.AWS_REGION ?? 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
        },
      });
      return new S3CompatibleProvider(
        s3,
        process.env.AWS_S3_BUCKET ?? 'attendai-files',
        process.env.AWS_S3_PUBLIC_URL ?? '',
      );
    }

    // ── Backblaze B2 (10 GB free, no card required) ───────────────────────────
    case 'backblaze': {
      const s3 = new S3Client({
        region: process.env.B2_REGION ?? 'us-west-004',
        endpoint: process.env.B2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.B2_APPLICATION_KEY_ID ?? '',
          secretAccessKey: process.env.B2_APPLICATION_KEY ?? '',
        },
      });
      return new S3CompatibleProvider(
        s3,
        process.env.B2_BUCKET_NAME ?? 'attendai-files',
        process.env.B2_PUBLIC_URL ?? '',
      );
    }

    // ── MinIO (self-hosted, free) ─────────────────────────────────────────────
    case 'minio': {
      const s3 = new S3Client({
        region: 'us-east-1', // MinIO ignores region but the SDK requires a value
        endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
        forcePathStyle: true, // required for MinIO
        credentials: {
          accessKeyId: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
          secretAccessKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
        },
      });
      return new S3CompatibleProvider(
        s3,
        process.env.MINIO_BUCKET ?? 'attendai-files',
        process.env.MINIO_PUBLIC_URL ?? '',
      );
    }

    // ── Supabase Storage (already in project, 1 GB free) ─────────────────────
    case 'supabase':
      return new SupabaseStorageProvider();

    // ── Local filesystem (development / self-hosted) ──────────────────────────
    case 'local':
      return new LocalStorageProvider();

    default:
      throw new Error(
        `Unknown STORAGE_PROVIDER "${provider}". ` +
          'Valid options: r2 | s3 | backblaze | minio | supabase | local',
      );
  }
}

const storageProvider = createProvider();

/** Upload a buffer, return the object key and its public URL */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  return storageProvider.uploadFile(key, body, contentType);
}

/** Delete an object */
export async function deleteFile(key: string): Promise<void> {
  return storageProvider.deleteFile(key);
}

/** Generate a pre-signed download URL (expires in 1 hour by default) */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return storageProvider.getPresignedUrl(key, expiresIn);
}
