import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  StorageProvider,
  StoragePresignOptions,
  StoragePutInput,
  StoragePutResult,
} from '../storage.types';

/**
 * S3-backed StorageProvider.
 *
 * Notes:
 *  - getDownloadUrl uses GetObjectCommand (fixes review S1 #4); presigned
 *    PUTs are intentionally not exposed.
 *  - Credentials and bucket are sourced from S3_* env vars via
 *    ConfigService; AWS_* vars remain as the fallback so winston log
 *    archival keeps working while phase 10 migrates it.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    this.bucket =
      this.configService.get<string>('S3_BUCKET') ||
      this.configService.get<string>('aws.bucketName') ||
      '';
    this.region =
      this.configService.get<string>('S3_REGION') ||
      this.configService.get<string>('aws.region') ||
      'us-east-1';

    const accessKeyId =
      this.configService.get<string>('S3_ACCESS_KEY_ID') ||
      this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey =
      this.configService.get<string>('S3_SECRET_ACCESS_KEY') ||
      this.configService.get<string>('aws.secretAccessKey');

    if (!this.bucket || !accessKeyId || !secretAccessKey) {
      this.logger.warn(
        'S3 storage is not fully configured. Uploads will fail until S3_* env vars are set.',
      );
    }

    this.client = new S3Client({
      region: this.region,
      ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
    });
  }

  async put(input: StoragePutInput): Promise<StoragePutResult> {
    if (!this.bucket) throw new Error('S3 bucket is not configured');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.mimeType,
        Metadata: input.metadata,
      }),
    );
    return { key: input.key, size: input.body.byteLength };
  }

  async remove(key: string): Promise<void> {
    if (!this.bucket) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getDownloadUrl(key: string, opts: StoragePresignOptions = {}): Promise<string> {
    if (!this.bucket) throw new Error('S3 bucket is not configured');
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(opts.filename && {
        ResponseContentDisposition: `attachment; filename="${opts.filename.replace(/"/g, '')}"`,
      }),
    });
    return getSignedUrl(this.client, command, { expiresIn: opts.expiresIn ?? 3600 });
  }

  async exists(key: string): Promise<boolean> {
    if (!this.bucket) return false;
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
