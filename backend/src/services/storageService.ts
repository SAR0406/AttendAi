import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? 'attendai-files';
const PUBLIC_URL = process.env.R2_PUBLIC_URL ?? '';

/** Upload a buffer to R2, return the object key */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, publicUrl: `${PUBLIC_URL}/${key}` };
}

/** Delete an object from R2 */
export async function deleteFile(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Generate a pre-signed download URL (expires in 1 hour) */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn },
  );
}
