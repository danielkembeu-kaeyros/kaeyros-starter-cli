import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';

/**
 * AWS S3 Service for file uploads
 *
 * Provides methods to upload files to S3 buckets using AWS SDK v3
 * Can be imported and used by other modules
 */
@Injectable()
export class AwsService {
  private readonly s3Client: S3Client;
  private readonly defaultBucket: string;
  private readonly logger = new Logger(AwsService.name);

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = this.configService.get<string>('aws.accessKeyId');
    const secretAccessKey = this.configService.get<string>('aws.secretAccessKey');
    const region = this.configService.get<string>('aws.region');

    if (!accessKeyId || !secretAccessKey || !region) {
      this.logger.warn('AWS credentials not configured. S3 upload functionality will not work.');
    }

    this.s3Client = new S3Client({
      credentials: {
        accessKeyId: accessKeyId || '',
        secretAccessKey: secretAccessKey || '',
      },
      region: region || 'us-east-1',
    });

    this.defaultBucket = this.configService.get<string>('aws.bucketName') || '';

    this.logger.log(`AWS S3 service initialized with region: ${region}`);
  }

  /**
   * Upload a file to S3
   * @param file - The file to upload (from multer)
   * @param bucketName - Optional bucket name (uses default if not provided)
   * @param customKey - Optional custom key/filename (generates timestamp-based key if not provided)
   * @returns The public URL of the uploaded file
   */
  async uploadFile(
    file: Express.Multer.File,
    bucketName?: string,
    customKey?: string,
  ): Promise<string> {
    const bucket = bucketName || this.defaultBucket;

    if (!bucket) {
      throw new Error('S3 bucket name not configured');
    }

    const key = customKey || `${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    try {
      this.logger.log(`Uploading file to S3: ${key} (${file.size} bytes)`);

      await this.s3Client.send(command);

      const region = this.configService.get<string>('aws.region') || 'us-east-1';
      const location = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

      this.logger.log(`File uploaded successfully: ${location}`);

      return location;
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Upload multiple files to S3
   * @param files - Array of files to upload
   * @param bucketName - Optional bucket name
   * @returns Array of public URLs
   */
  async uploadMultipleFiles(files: Express.Multer.File[], bucketName?: string): Promise<string[]> {
    const uploadPromises = files.map((file) => this.uploadFile(file, bucketName));
    return Promise.all(uploadPromises);
  }

  /**
   * Delete a file from S3
   * @param key - The key/filename to delete
   * @param bucketName - Optional bucket name
   */
  async deleteFile(key: string, bucketName?: string): Promise<void> {
    const bucket = bucketName || this.defaultBucket;

    if (!bucket) {
      throw new Error('S3 bucket name not configured');
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      this.logger.log(`Deleting file from S3: ${key}`);
      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file from S3: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get a presigned URL for temporary access to a private file
   * @param key - The key/filename
   * @param bucketName - Optional bucket name
   * @param expiresIn - Expiration time in seconds (default: 3600)
   * @returns Presigned URL
   */
  async getPresignedUrl(
    key: string,
    bucketName?: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const bucket = bucketName || this.defaultBucket;

    if (!bucket) {
      throw new Error('S3 bucket name not configured');
    }

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      this.logger.log(`Generated presigned URL for ${key} (expires in ${expiresIn}s)`);

      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error.message}`, error.stack);
      throw error;
    }
  }
  /**
   * Upload a file from filesystem to S3
   * @param filePath - Path to the file
   * @param bucketName - Optional bucket name
   * @param customKey - Optional custom key
   * @returns Public URL
   */
  async uploadFromFile(filePath: string, bucketName?: string, customKey?: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const bucket = bucketName || this.defaultBucket;
    if (!bucket) {
      throw new Error('S3 bucket name not configured');
    }

    const filename = path.basename(filePath);
    const key = customKey || `logs/${filename}`;
    const fileContent = fs.readFileSync(filePath);

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ContentType: 'text/plain', // Assuming logs are text
    });

    try {
      this.logger.log(`Uploading local file to S3: ${key}`);
      await this.s3Client.send(command);
      const region = this.configService.get<string>('aws.region') || 'us-east-1';
      const location = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;

      this.logger.log(`File uploaded successfully: ${location}`);
      return location;
    } catch (error) {
      this.logger.error(`Failed to upload file to S3: ${error.message}`, error.stack);
      throw error;
    }
  }
}
