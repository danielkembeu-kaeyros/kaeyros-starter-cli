import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  INestApplication,
  Optional,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { LoggerService } from '../../common/logging/logger.service';

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly fallbackLogger = new Logger('Prisma');

  constructor(@Optional() private readonly logger?: LoggerService) {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    super({
      adapter,
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Log queries in development
    if (process.env.NODE_ENV === 'development') {
      // @ts-expect-error - Prisma event types are not fully compatible with custom handlers
      this.$on('query', (e: { query: string; duration: number }) => {
        if (this.logger) {
          this.logger.logDatabaseQuery(e.query, e.duration, 'Prisma');
        }
      });
    }

    // @ts-expect-error - Prisma event types are not fully compatible with custom handlers
    this.$on('error', (e: { message: string; target: string }) => {
      if (this.logger) {
        this.logger.error(`Prisma Error: ${e.message}`, e.target, 'Prisma');
      } else {
        this.fallbackLogger.error(`Prisma Error: ${e.message}`, e.target);
      }
    });

    // @ts-expect-error - Prisma event types are not fully compatible with custom handlers
    this.$on('warn', (e: { message: string }) => {
      if (this.logger) {
        this.logger.warn(`Prisma Warning: ${e.message}`, 'Prisma');
      } else {
        this.fallbackLogger.warn(`Prisma Warning: ${e.message}`);
      }
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (this.logger) {
      this.logger.log('Database connected successfully', 'Prisma');
    } else {
      this.fallbackLogger.log('Database connected successfully');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    if (this.logger) {
      this.logger.log('Database disconnected', 'Prisma');
    } else {
      this.fallbackLogger.log('Database disconnected');
    }
  }

  async enableShutdownHooks(app: INestApplication): Promise<void> {
    process.on('beforeExit', async () => {
      await app.close();
    });
  }
}
