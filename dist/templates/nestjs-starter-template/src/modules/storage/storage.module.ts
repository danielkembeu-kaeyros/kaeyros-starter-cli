import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER, StorageProvider } from './storage.types';
import { S3StorageProvider } from './providers/s3-storage.provider';

/**
 * Wires the active StorageProvider implementation behind the
 * STORAGE_PROVIDER token. The provider name is read from
 * STORAGE_PROVIDER env (`s3` is the only one shipped today; local /
 * cloudinary / azure are drop-ins).
 */
@Global()
@Module({
  providers: [
    S3StorageProvider,
    {
      provide: STORAGE_PROVIDER,
      useFactory: (configService: ConfigService, s3: S3StorageProvider): StorageProvider => {
        const name = configService.get<string>('STORAGE_PROVIDER', 's3');
        switch (name) {
          case 's3':
            return s3;
          default:
            throw new Error(`Unsupported STORAGE_PROVIDER: ${name}`);
        }
      },
      inject: [ConfigService, S3StorageProvider],
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
