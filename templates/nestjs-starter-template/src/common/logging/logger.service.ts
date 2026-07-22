import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { Logger } from 'winston';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Inject } from '@nestjs/common';

@Injectable()
export class LoggerService implements NestLoggerService {
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}

  /**
   * Write a log message
   */
  log(message: string, context?: string): void {
    this.logger.info(message, { context });
  }

  /**
   * Write an error message
   */
  error(message: string, trace?: string, context?: string): void {
    this.logger.error(message, { trace, context });
  }

  /**
   * Write a warning message
   */
  warn(message: string, context?: string): void {
    this.logger.warn(message, { context });
  }

  /**
   * Write a debug message
   */
  debug(message: string, context?: string): void {
    this.logger.debug(message, { context });
  }

  /**
   * Write a verbose message
   */
  verbose(message: string, context?: string): void {
    this.logger.verbose(message, { context });
  }

  /**
   * Write a log with additional metadata
   */
  logWithMeta(
    level: string,
    message: string,
    meta: Record<string, unknown>,
    context?: string,
  ): void {
    this.logger.log(level, message, { ...meta, context });
  }

  /**
   * Log performance metrics
   */
  logPerformance(
    operation: string,
    durationMs: number,
    context?: string,
    additionalMeta?: Record<string, unknown>,
  ): void {
    this.logger.info(`Performance: ${operation} completed in ${durationMs}ms`, {
      context: context || 'Performance',
      durationMs,
      operation,
      ...additionalMeta,
    });
  }

  /**
   * Log HTTP request
   */
  logHttpRequest(
    method: string,
    url: string,
    statusCode: number,
    durationMs: number,
    userId?: string,
  ): void {
    this.logger.info(`${method} ${url} ${statusCode} - ${durationMs}ms`, {
      context: 'HTTP',
      method,
      url,
      statusCode,
      durationMs,
      userId,
    });
  }

  /**
   * Log database query
   */
  logDatabaseQuery(query: string, durationMs: number, context?: string): void {
    this.logger.debug(`Database Query: ${query} - ${durationMs}ms`, {
      context: context || 'Database',
      query,
      durationMs,
    });
  }
}
