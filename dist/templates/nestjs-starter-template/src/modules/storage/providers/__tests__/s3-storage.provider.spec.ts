import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3StorageProvider } from '../s3-storage.provider';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('S3StorageProvider', () => {
  const mockSend = jest.fn();

  const CONFIG: Record<string, string> = {
    S3_BUCKET: 'test-bucket',
    S3_REGION: 'eu-central-1',
    S3_ACCESS_KEY_ID: 'access-key',
    S3_SECRET_ACCESS_KEY: 'secret-key',
  };

  const makeConfig = (values: Record<string, string | undefined>): ConfigService =>
    ({
      get: jest.fn((key: string) => values[key]),
    }) as unknown as ConfigService;

  const makeProvider = (values = CONFIG) => new S3StorageProvider(makeConfig(values));

  beforeEach(() => {
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send: mockSend }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(makeProvider()).toBeDefined();
  });

  describe('put', () => {
    it('sends a PutObjectCommand and returns key + size', async () => {
      mockSend.mockResolvedValue({});
      const provider = makeProvider();
      const body = Buffer.from('hello world');

      const result = await provider.put({
        key: 'acct/file.txt',
        body,
        mimeType: 'text/plain',
        metadata: { foo: 'bar' },
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'acct/file.txt',
        Body: body,
        ContentType: 'text/plain',
        Metadata: { foo: 'bar' },
      });
      expect(result).toEqual({ key: 'acct/file.txt', size: body.byteLength });
    });

    it('throws when the bucket is not configured', async () => {
      const provider = makeProvider({
        ...CONFIG,
        S3_BUCKET: undefined,
        'aws.bucketName': undefined,
      });

      await expect(
        provider.put({ key: 'k', body: Buffer.from('x'), mimeType: 'text/plain' }),
      ).rejects.toThrow('S3 bucket is not configured');
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('sends a DeleteObjectCommand', async () => {
      mockSend.mockResolvedValue({});
      const provider = makeProvider();

      await provider.remove('acct/file.txt');

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'acct/file.txt',
      });
    });

    it('is a no-op when the bucket is not configured', async () => {
      const provider = makeProvider({
        ...CONFIG,
        S3_BUCKET: undefined,
        'aws.bucketName': undefined,
      });

      await provider.remove('k');

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('getDownloadUrl', () => {
    it('returns a presigned URL built from a GetObjectCommand', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url');
      const provider = makeProvider();

      const url = await provider.getDownloadUrl('acct/file.txt', {
        filename: 'report.pdf',
        expiresIn: 120,
      });

      expect(url).toBe('https://signed-url');
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'acct/file.txt',
        ResponseContentDisposition: 'attachment; filename="report.pdf"',
      });
      const signArgs = (getSignedUrl as jest.Mock).mock.calls[0];
      expect(signArgs[1]).toBeInstanceOf(GetObjectCommand);
      expect(signArgs[2]).toEqual({ expiresIn: 120 });
    });

    it('defaults the expiry to 3600 seconds', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://signed-url');
      const provider = makeProvider();

      await provider.getDownloadUrl('acct/file.txt');

      expect((getSignedUrl as jest.Mock).mock.calls[0][2]).toEqual({ expiresIn: 3600 });
    });

    it('throws when the bucket is not configured', async () => {
      const provider = makeProvider({
        ...CONFIG,
        S3_BUCKET: undefined,
        'aws.bucketName': undefined,
      });

      await expect(provider.getDownloadUrl('k')).rejects.toThrow('S3 bucket is not configured');
    });
  });

  describe('exists', () => {
    it('returns true when HeadObject succeeds', async () => {
      mockSend.mockResolvedValue({});
      const provider = makeProvider();

      const result = await provider.exists('acct/file.txt');

      expect(result).toBe(true);
      expect(mockSend.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
      expect(HeadObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'acct/file.txt',
      });
    });

    it('returns false when HeadObject rejects (not found)', async () => {
      mockSend.mockRejectedValue(new Error('NotFound'));
      const provider = makeProvider();

      const result = await provider.exists('missing.txt');

      expect(result).toBe(false);
    });

    it('returns false when the bucket is not configured', async () => {
      const provider = makeProvider({
        ...CONFIG,
        S3_BUCKET: undefined,
        'aws.bucketName': undefined,
      });

      const result = await provider.exists('k');

      expect(result).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
