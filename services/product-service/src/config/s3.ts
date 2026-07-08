import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '@cloudcommerce/common';

const ENDPOINT = process.env.LOCALSTACK_ENDPOINT ?? 'http://localhost:4566';
const REGION   = process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const BUCKET   = process.env.S3_BUCKET ?? 'cloudcommerce-images';
const ACCESS_KEY_ID     = process.env.AWS_ACCESS_KEY_ID ?? 'test';
const SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';

// Lazy singleton S3 client (localstack uses path-style, detected by LOCALSTACK endpoint)
const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  ...(ENDPOINT.includes('localhost') || ENDPOINT.includes('localstack')
    ? { endpoint: ENDPOINT, forcePathStyle: true }
    : {}),
});

export interface UploadResult {
  imageKey: string;
  contentType: string;
}

/**
 * Upload a file buffer to LocalStack S3.
 * Returns the S3 object key so it can be stored in MongoDB.
 */
export async function uploadToS3(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<UploadResult> {
  const imageKey = `products/${Date.now()}-${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: imageKey,
      Body: buffer,
      ContentType: contentType,
      // LocalStack: make publicly readable for direct bucket URLs
      ACL: 'public-read' as never,
    })
  );

  logger.info('S3 upload complete', { imageKey, bucket: BUCKET });
  return { imageKey, contentType };
}