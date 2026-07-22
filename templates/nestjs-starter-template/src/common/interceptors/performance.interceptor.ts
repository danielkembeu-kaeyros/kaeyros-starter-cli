import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';
import { captureSentryMetric } from '../../config/sentry.config';
import { LoggerService } from '../logging/logger.service';

@Injectable()
export class PerformanceInterceptor implements NestInterceptor {
  private readonly enableMetrics: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.enableMetrics = this.configService.get<boolean>('monitoring.enableMetrics', false);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const { method, url, route } = request;
    const handler = context.getHandler().name;
    const controller = context.getClass().name;

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;

          // Log slow requests (> 1000ms)
          if (duration > 1000) {
            this.logger.warn(
              `Slow request detected: ${method} ${url} took ${duration}ms`,
              'Performance',
            );
          }

          // Send metrics to Sentry if enabled
          if (this.enableMetrics) {
            captureSentryMetric('http.request.duration', duration, 'millisecond', {
              method,
              route: route?.path || url,
              controller,
              handler,
            });
          }
        },
        error: (error) => {
          const duration = Date.now() - startTime;
          this.logger.error(
            `Request failed: ${method} ${url} after ${duration}ms - ${error.message}`,
            error.stack,
            'Performance',
          );
        },
      }),
    );
  }
}
