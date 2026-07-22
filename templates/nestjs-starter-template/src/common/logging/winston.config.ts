import { ConfigService } from '@nestjs/config';
import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { LoggingConfig } from '../../config/configuration';
import { DatabaseTransport } from './db-transport';
import { PrismaClient } from '@prisma/client';
import { AwsService } from '../../modules/aws/aws.service';

export const winstonConfig = (
  configService: ConfigService,
  prisma?: PrismaClient,
  awsService?: AwsService,
): WinstonModuleOptions => {
  const loggingConfig = configService.get<LoggingConfig>('logging');
  const nodeEnv = configService.get<string>('app.nodeEnv');

  const transports: winston.transport[] = [];

  // Console transport (not in test mode)
  if (nodeEnv !== 'test') {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.colorize({ all: true }),
          winston.format.printf(({ timestamp, level, message, context, ...meta }) => {
            const contextStr = context ? `[${context}] ` : '';
            const metaStr =
              Object.keys(meta).length && meta.timestamp !== timestamp
                ? ` ${JSON.stringify(meta)}`
                : '';
            return `${timestamp} ${level}: ${contextStr}${message}${metaStr}`;
          }),
        ),
      }),
    );
  }

  // File transport with size-based rotation and log levels
  if (loggingConfig?.fileEnabled) {
    const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

    // Helper function to create transport with S3 upload
    const createRotateTransport = (
      filename: string,
      level: string,
      maxSize: string,
      maxFiles: string,
    ) => {
      const transport = new DailyRotateFile({
        filename,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize,
        maxFiles,
        format: fileFormat,
        level,
      });

      if (awsService) {
        transport.on('rotate', (oldFilename, _newFilename) => {
          awsService
            .uploadFromFile(oldFilename)
            .catch((err) => console.error(`Failed to upload ${level} log to S3:`, err));
        });
      }

      return transport;
    };

    // Error logs only (highest priority, kept longest)
    transports.push(createRotateTransport('logs/error-%DATE%.log', 'error', '20m', '30d'));

    // Warn logs only
    transports.push(createRotateTransport('logs/warn-%DATE%.log', 'warn', '20m', '14d'));

    // Info logs only
    transports.push(createRotateTransport('logs/info-%DATE%.log', 'info', '50m', '7d'));

    // Combined logs (all levels) - for comprehensive debugging
    transports.push(createRotateTransport('logs/combined-%DATE%.log', 'debug', '50m', '7d'));
  }

  // Database transport (if enabled and Prisma client is provided)
  if (loggingConfig?.dbEnabled && prisma) {
    transports.push(
      new DatabaseTransport({
        prisma,
        level: 'warn', // Only log warnings and errors to DB
      }),
    );
  }

  return {
    level: loggingConfig?.level || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'context'] }),
    ),
    transports,
    // Exception handlers (uncaught exceptions)
    exceptionHandlers: [
      new DailyRotateFile({
        filename: 'logs/exceptions-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
    // Rejection handlers (unhandled promise rejections)
    rejectionHandlers: [
      new DailyRotateFile({
        filename: 'logs/rejections-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: '20m',
        maxFiles: '30d',
      }),
    ],
  };
};
