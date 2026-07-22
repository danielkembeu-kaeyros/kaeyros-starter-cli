import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FilesService } from '../files.service';
import { PrismaService } from '../../../database/prisma.service';
import { OwnershipResolverRegistry } from '../../../../common/authz/ownership.registry';
import { STORAGE_PROVIDER } from '../../storage.types';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '../../../../common/exceptions/custom-exceptions';

describe('FilesService', () => {
  let module: TestingModule;
  let service: FilesService;

  const mockStorage = {
    put: jest.fn(),
    remove: jest.fn(),
    getDownloadUrl: jest.fn(),
    exists: jest.fn(),
  };

  const mockPrisma = {
    file: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockConfig = {
    // no STORAGE_ALLOWED_MIME / STORAGE_MAX_UPLOAD_BYTES -> defaults apply
    get: jest.fn().mockReturnValue(undefined),
  };

  const mockRegistry = {
    register: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: OwnershipResolverRegistry, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  afterEach(async () => {
    if (module) await module.close();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('registers the file ownership resolver', () => {
      service.onModuleInit();
      expect(mockRegistry.register).toHaveBeenCalledWith('file', expect.any(Function));
    });
  });

  describe('upload', () => {
    const base = {
      ownerAccountId: 'acc1',
      buffer: Buffer.from('hello'),
      originalName: 'pic.png',
      mimeType: 'image/png',
    };

    it('rejects a disallowed MIME type', async () => {
      await expect(
        service.upload({ ...base, mimeType: 'application/x-msdownload' }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it('rejects an oversize file', async () => {
      const big = Buffer.alloc(11 * 1024 * 1024);
      await expect(service.upload({ ...base, buffer: big })).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it('rejects an empty file', async () => {
      await expect(service.upload({ ...base, buffer: Buffer.alloc(0) })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mockStorage.put).not.toHaveBeenCalled();
    });

    it('stores the object and creates a DB row on the happy path', async () => {
      mockStorage.put.mockResolvedValue({ key: 'accounts/acc1/abc-pic.png', size: 5 });
      const created = { id: 'f1' };
      mockPrisma.file.create.mockResolvedValue(created);

      const result = await service.upload(base);

      expect(result).toBe(created);
      expect(mockStorage.put).toHaveBeenCalledWith(
        expect.objectContaining({
          body: base.buffer,
          mimeType: 'image/png',
          metadata: { accountId: 'acc1' },
          key: expect.stringContaining('accounts/acc1/'),
        }),
      );
      expect(mockPrisma.file.create).toHaveBeenCalledWith({
        data: {
          accountId: 'acc1',
          storageKey: 'accounts/acc1/abc-pic.png',
          filename: 'pic.png',
          mimeType: 'image/png',
          size: 5,
        },
      });
    });
  });

  describe('listOwn', () => {
    it('lists non-deleted files for an account', async () => {
      const rows = [{ id: 'f1' }];
      mockPrisma.file.findMany.mockResolvedValue(rows);

      const result = await service.listOwn('acc1');

      expect(result).toBe(rows);
      expect(mockPrisma.file.findMany).toHaveBeenCalledWith({
        where: { accountId: 'acc1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getDownloadUrl', () => {
    it('throws NotFoundException when the file is missing', async () => {
      mockPrisma.file.findFirst.mockResolvedValue(null);
      await expect(service.getDownloadUrl('f1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns a presigned url with metadata', async () => {
      mockPrisma.file.findFirst.mockResolvedValue({
        id: 'f1',
        storageKey: 'k',
        filename: 'pic.png',
        mimeType: 'image/png',
        size: 5,
      });
      mockStorage.getDownloadUrl.mockResolvedValue('https://signed.url');

      const result = await service.getDownloadUrl('f1');

      expect(result).toEqual({
        url: 'https://signed.url',
        filename: 'pic.png',
        mimeType: 'image/png',
        size: 5,
      });
      expect(mockStorage.getDownloadUrl).toHaveBeenCalledWith('k', {
        expiresIn: 3600,
        filename: 'pic.png',
      });
    });
  });

  describe('remove', () => {
    it('soft-deletes the row and best-effort removes from storage', async () => {
      mockPrisma.file.findFirst.mockResolvedValue({ id: 'f1', storageKey: 'k' });
      mockPrisma.file.update.mockResolvedValue({});
      mockStorage.remove.mockResolvedValue(undefined);

      await service.remove('f1');

      expect(mockPrisma.file.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(mockStorage.remove).toHaveBeenCalledWith('k');
    });

    it('throws NotFoundException when the file is missing', async () => {
      mockPrisma.file.findFirst.mockResolvedValue(null);
      await expect(service.remove('f1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not surface a storage removal failure', async () => {
      mockPrisma.file.findFirst.mockResolvedValue({ id: 'f1', storageKey: 'k' });
      mockPrisma.file.update.mockResolvedValue({});
      mockStorage.remove.mockRejectedValue(new Error('s3 down'));

      await expect(service.remove('f1')).resolves.toBeUndefined();
    });
  });
});
