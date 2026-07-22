import Transport from 'winston-transport';
import { PrismaClient } from '@prisma/client';

interface DBTransportOptions extends Transport.TransportStreamOptions {
  prisma: PrismaClient;
  tableName?: string;
}

/**
 * Custom Winston transport that saves logs to database using Prisma
 */
export class DatabaseTransport extends Transport {
  private prisma: PrismaClient;
  private tableName: string;

  constructor(opts: DBTransportOptions) {
    super(opts);
    this.prisma = opts.prisma;
    this.tableName = opts.tableName || 'Log';
  }

  async log(
    info: {
      level: string;
      message: string;
      context?: string;
      trace?: string;
      meta?: Record<string, unknown>;
    },
    callback: () => void,
  ): Promise<void> {
    setImmediate(() => {
      this.emit('logged', info);
    });

    try {
      // Only log errors and warnings to database to avoid bloat
      if (info.level === 'error' || info.level === 'warn') {
        await this.prisma.log.create({
          data: {
            level: info.level,
            message: info.message,
            context: info.context || null,
            trace: info.trace || null,
            meta: info.meta ? JSON.stringify(info.meta) : null,
          },
        });
      }
    } catch (error) {
      // Fail silently to avoid logging loops
      console.error('Failed to write log to database:', error);
    }

    callback();
  }
}
