import { Test, TestingModule } from '@nestjs/testing';
import { AwsService } from '../aws.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../common/logging/logger.service';
import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Mock the AWS SDK v3
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('AwsService', () => {
  let module: TestingModule;
  let service: AwsService;
  let configService: ConfigService;
  let logger: LoggerService;

  const mockS3Send = jest.fn();

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logDatabaseQuery: jest.fn(),
  };

  beforeEach(async () => {
    // Mock S3Client
    (S3Client as jest.Mock).mockImplementation(() => ({
      send: mockS3Send,
    }));

    module = await Test.createTestingModule({
      providers: [
        AwsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<AwsService>(AwsService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<LoggerService>(LoggerService);

    // Mock config values for S3 initialization
    jest.spyOn(configService, 'get').mockImplementation((key: string) => {
      switch (key) {
        case 'aws.accessKeyId':
          return 'test-access-key';
        case 'aws.secretAccessKey':
          return 'test-secret-key';
        case 'aws.region':
          return 'us-east-1';
        case 'aws.bucketName':
          return 'test-bucket';
        default:
          return undefined;
      }
    });
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    it('should upload a file to S3 and return the URL', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 100,
        destination: '/tmp',
        filename: 'test.txt',
        path: '/tmp/test.txt',
        buffer: Buffer.from('test content'),
        stream: new Readable(),
      };

      mockS3Send.mockResolvedValue({});

      const result = await service.uploadFile(mockFile);

      expect(result).toContain('test-bucket.s3.us-east-1.amazonaws.com');
      expect(result).toContain('test.txt');
      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should throw an error if bucket name is not configured', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        size: 100,
        destination: '/tmp',
        filename: 'test.txt',
        path: '/tmp/test.txt',
        buffer: Buffer.from('test content'),
        stream: new Readable(),
      };

      // Temporarily set defaultBucket to undefined to simulate missing config
      const originalBucket = service['defaultBucket'];
      service['defaultBucket'] = undefined;

      await expect(service.uploadFile(mockFile)).rejects.toThrow(
        'S3 bucket name not configured',
      );

      // Restore original bucket
      service['defaultBucket'] = originalBucket;
    });
  });

  describe('uploadMultipleFiles', () => {
    it('should upload multiple files to S3', async () => {
      const mockFiles: Express.Multer.File[] = [
        {
          fieldname: 'file1',
          originalname: 'test1.txt',
          encoding: '7bit',
          mimetype: 'text/plain',
          size: 100,
          destination: '/tmp',
          filename: 'test1.txt',
          path: '/tmp/test1.txt',
          buffer: Buffer.from('test content 1'),
          stream: new Readable(),
        },
        {
          fieldname: 'file2',
          originalname: 'test2.txt',
          encoding: '7bit',
          mimetype: 'text/plain',
          size: 200,
          destination: '/tmp',
          filename: 'test2.txt',
          path: '/tmp/test2.txt',
          buffer: Buffer.from('test content 2'),
          stream: new Readable(),
        },
      ];

      mockS3Send.mockResolvedValue({});

      const result = await service.uploadMultipleFiles(mockFiles);

      expect(result).toHaveLength(2);
      expect(result[0]).toContain('test-bucket.s3.us-east-1.amazonaws.com');
      expect(result[1]).toContain('test-bucket.s3.us-east-1.amazonaws.com');
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteFile', () => {
    it('should delete a file from S3', async () => {
      const key = 'test-file.txt';
      mockS3Send.mockResolvedValue({});

      await service.deleteFile(key);

      expect(mockS3Send).toHaveBeenCalled();
    });

    it('should throw an error if bucket name is not configured for deletion', async () => {
      // Temporarily set defaultBucket to undefined to simulate missing config
      const originalBucket = service['defaultBucket'];
      service['defaultBucket'] = undefined;

      await expect(service.deleteFile('test-file.txt')).rejects.toThrow(
        'S3 bucket name not configured',
      );

      // Restore original bucket
      service['defaultBucket'] = originalBucket;
    });
  });

  describe('getPresignedUrl', () => {
    it('should throw an error if bucket name is not configured for presigned URL', async () => {
      // Temporarily set defaultBucket to undefined to simulate missing config
      const originalBucket = service['defaultBucket'];
      service['defaultBucket'] = undefined;

      await expect(service.getPresignedUrl('test-file.txt')).rejects.toThrow(
        'S3 bucket name not configured',
      );

      // Restore original bucket
      service['defaultBucket'] = originalBucket;
    });

    it('should generate a presigned URL for a file', async () => {
      const key = 'test-file.txt';
      const expires = 3600;
      const expectedUrl =
        'https://test-bucket.s3.us-east-1.amazonaws.com/test-file.txt?X-Amz-Signature=...';

      // Mock the getSignedUrl function
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
      getSignedUrl.mockResolvedValue(expectedUrl);

      const result = await service.getPresignedUrl(key, undefined, expires);

      expect(result).toBe(expectedUrl);
      expect(getSignedUrl).toHaveBeenCalled();
    });
  });
});
