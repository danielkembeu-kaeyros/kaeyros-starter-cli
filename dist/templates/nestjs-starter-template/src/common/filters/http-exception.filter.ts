import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { LoggerService } from '../logging/logger.service';
import { captureSentryException } from '../../config/sentry.config';
import { ConfigService } from '@nestjs/config';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly sentryEnabled: boolean;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService,
  ) {
    this.sentryEnabled = this.configService.get<boolean>('sentry.enabled', false);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let errorCode: string;
    let field: string | undefined;
    let errors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;

        // Handle validation errors with detailed field-level errors
        if (responseObj.errors && typeof responseObj.errors === 'object') {
          message = (responseObj.message as string) || 'Validation failed';
          errorCode = (responseObj.errorCode as string) || 'ValidationError';
          errors = responseObj.errors as Record<string, string[]>;
        } else if (Array.isArray(responseObj.message)) {
          // Handle array of messages from NestJS built-in ValidationPipe
          message = 'Validation failed';
          errorCode = 'ValidationError';
          errors = this.formatArrayMessagesToErrors(responseObj.message as string[]);
        } else {
          message = (responseObj.message as string) || exception.message;
          errorCode =
            (responseObj.errorCode as string) ||
            (responseObj.error as string) ||
            exception.constructor.name;
        }
      } else {
        message = exceptionResponse as string;
        errorCode = exception.constructor.name;
      }
    } else if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      exception.code === 'P2002'
    ) {
      // Handle unique constraint violation
      const prismaError = this.handlePrismaUniqueConstraintError(exception);
      status = prismaError.status;
      message = prismaError.message;
      errorCode = prismaError.errorCode;
      field = prismaError.field;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Handle other Prisma errors
      const prismaError = this.handlePrismaError(exception);
      status = prismaError.status;
      message = prismaError.message;
      errorCode = prismaError.errorCode;
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message;
      errorCode = exception.constructor.name;
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      errorCode = 'InternalServerError';
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      errorCode,
      requestId: request.requestId,
      ...(field && { field }),
      ...(errors && { errors }),
      ...(process.env.NODE_ENV === 'development' &&
        exception instanceof Error && {
          stack: exception.stack,
        }),
    };

    // Log the error
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : undefined,
      'ExceptionFilter',
    );

    // Log additional context
    this.logger.logWithMeta(
      'error',
      'Exception details',
      {
        exception: exception instanceof Error ? exception.message : exception,
        request: {
          url: request.url,
          method: request.method,
          headers: this.sanitizeHeaders(request.headers),
          body: this.sanitizeBody(request.body),
          query: request.query,
          params: request.params,
          requestId: request.requestId,
          userId: (request['user'] as { id?: string } | undefined)?.id,
        },
      },
      'ExceptionFilter',
    );

    // Send to Sentry if enabled and it's a server error (5xx)
    if (this.sentryEnabled && status >= 500) {
      captureSentryException(exception, 'ExceptionFilter');
    }

    response.status(status).json(errorResponse);
  }

  /**
   * Remove sensitive headers from logging
   */
  private sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized = { ...headers };
    delete sanitized.authorization;
    delete sanitized.cookie;
    return sanitized;
  }

  /**
   * Remove sensitive data from request body
   */
  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sanitized = { ...(body as Record<string, unknown>) };
    // Remove common sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  /**
   * Handle Prisma unique constraint violations (P2002)
   */
  private handlePrismaUniqueConstraintError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    errorCode: string;
    field?: string;
  } {
    const meta = exception.meta as { target?: string[] };
    const fields = meta?.target || [];

    // Map field names to user-friendly messages
    const fieldMessages: Record<string, string> = {
      email: 'This email is already in use',
      username: 'This username is already taken',
      name: 'This name is already in use',
    };

    // Handle composite unique constraints
    if (fields.length > 1) {
      return {
        status: HttpStatus.CONFLICT,
        message: `A record with these values already exists: ${fields.join(', ')}`,
        errorCode: 'DUPLICATE_RECORD',
      };
    }

    // Handle single field unique constraints
    const field = fields[0];
    const message = fieldMessages[field] || `This ${field} is already in use`;

    return {
      status: HttpStatus.CONFLICT,
      message,
      errorCode: 'DUPLICATE_FIELD',
      field,
    };
  }

  /**
   * Handle other Prisma errors
   */
  private handlePrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    errorCode: string;
  } {
    const errorMessages: Record<string, string> = {
      P2000: 'The provided value is too long for this field',
      P2001: 'The record you are looking for does not exist',
      P2003: 'Foreign key constraint failed',
      P2004: 'A database constraint failed',
      P2010: 'Raw query failed',
      P2011: 'Null constraint violation',
      P2012: 'Missing a required value',
      P2013: 'Missing the required argument',
      P2014: 'The change would violate the required relation',
      P2015: 'A related record could not be found',
      P2016: 'Query interpretation error',
      P2017: 'The records are not connected',
      P2018: 'The required connected records were not found',
      P2019: 'Input error',
      P2020: 'Value out of range for the type',
      P2021: 'The table does not exist in the current database',
      P2022: 'The column does not exist in the current database',
      P2023: 'Inconsistent column data',
      P2025: 'The record to update was not found',
      P2026: 'The query parameter is not supported by the database',
    };

    const message =
      errorMessages[exception.code] || 'A database error occurred. Please try again later';

    return {
      status: HttpStatus.BAD_REQUEST,
      message,
      errorCode: exception.code,
    };
  }

  /**
   * Format array of error messages to structured field errors
   * Used when NestJS built-in ValidationPipe returns array of messages
   */
  private formatArrayMessagesToErrors(messages: string[]): Record<string, string[]> {
    const errors: Record<string, string[]> = {};

    messages.forEach((msg) => {
      // Try to extract field name from message (format: "field: error message")
      const match = msg.match(/^([^:]+):\s*(.+)$/);
      if (match) {
        const field = match[1].trim();
        const error = match[2].trim();
        if (!errors[field]) {
          errors[field] = [];
        }
        errors[field].push(error);
      } else {
        // If no field name, put in generic 'validation' key
        if (!errors['validation']) {
          errors['validation'] = [];
        }
        errors['validation'].push(msg);
      }
    });

    return errors;
  }
}
