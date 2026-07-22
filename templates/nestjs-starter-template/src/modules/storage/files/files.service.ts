import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { OwnershipResolverRegistry } from '../../../common/authz/ownership.registry';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '../../../common/exceptions/custom-exceptions';
import { STORAGE_PROVIDER, StorageProvider } from '../storage.types';

const DEFAULT_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;

interface UploadInput {
  ownerAccountId: string;
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly allowedMime: string[];
  private readonly maxBytes: number;

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly registry: OwnershipResolverRegistry,
  ) {
    const configured = this.configService.get<string>('STORAGE_ALLOWED_MIME');
    this.allowedMime = configured
      ? configured
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_ALLOWED_MIME;
    const maxConfigured = this.configService.get<number>('STORAGE_MAX_UPLOAD_BYTES');
    this.maxBytes = maxConfigured ?? DEFAULT_MAX_BYTES;
  }

  onModuleInit(): void {
    this.registry.register('file', async (id) => {
      const file = await this.prisma.file.findFirst({
        where: { id, deletedAt: null },
        select: { accountId: true },
      });
      return file ? { ownerAccountId: file.accountId } : null;
    });
  }

  async upload(input: UploadInput) {
    if (!this.allowedMime.includes(input.mimeType)) {
      throw new UnsupportedMediaTypeException(
        `MIME type ${input.mimeType} is not allowed. Allowed: ${this.allowedMime.join(', ')}`,
      );
    }
    if (input.buffer.byteLength > this.maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${this.maxBytes}-byte limit`);
    }
    if (input.buffer.byteLength === 0) {
      throw new BadRequestException('Empty file');
    }

    const key = this.buildKey(input.ownerAccountId, input.originalName);
    const result = await this.storage.put({
      key,
      body: input.buffer,
      mimeType: input.mimeType,
      metadata: { accountId: input.ownerAccountId },
    });

    return this.prisma.file.create({
      data: {
        accountId: input.ownerAccountId,
        storageKey: result.key,
        filename: sanitizeFilename(input.originalName),
        mimeType: input.mimeType,
        size: result.size,
      },
    });
  }

  async listOwn(accountId: string) {
    return this.prisma.file.findMany({
      where: { accountId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const file = await this.prisma.file.findFirst({ where: { id, deletedAt: null } });
    if (!file) throw new NotFoundException('File not found');
    return file;
  }

  async getDownloadUrl(id: string) {
    const file = await this.findOne(id);
    const url = await this.storage.getDownloadUrl(file.storageKey, {
      expiresIn: 3600,
      filename: file.filename,
    });
    return { url, filename: file.filename, mimeType: file.mimeType, size: file.size };
  }

  async remove(id: string) {
    const file = await this.findOne(id);
    await this.prisma.file.update({ where: { id }, data: { deletedAt: new Date() } });
    // Best-effort hard-delete in storage; failure here doesn't undo the soft delete.
    await this.storage.remove(file.storageKey).catch(() => {
      // swallowed — cron sweeps orphaned objects later if needed
    });
  }

  // ---------------------------------------------------------------------------

  private buildKey(accountId: string, originalName: string): string {
    const safe = sanitizeFilename(originalName);
    const uniq = crypto.randomBytes(8).toString('hex');
    return `accounts/${accountId}/${uniq}-${safe}`;
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
}
