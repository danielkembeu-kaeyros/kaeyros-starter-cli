import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';

interface VersionedResponse {
  _metadata: {
    version: string;
    timestamp: string;
  };
  [key: string]: unknown;
}

type InterceptorResponse = VersionedResponse | unknown[];

/**
 * Interceptor that adds API version metadata to responses
 *
 * Version can be extracted from:
 * - Header: api-version
 * - Query param: version
 * - URL path: /v1/, /v2/, etc.
 *
 * Defaults to 'v1' if no version is found
 */
@Injectable()
export class VersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<InterceptorResponse> {
    const request = context.switchToHttp().getRequest<Request>();
    const version = this.extractVersionFromRequest(request);

    return next.handle().pipe(
      map((data: unknown) => {
        // If data is an array, preserve it as-is
        if (Array.isArray(data)) {
          return data;
        }

        // For objects, spread them and add metadata
        return {
          ...((data as object) || {}),
          _metadata: {
            version,
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }

  private extractVersionFromRequest(request: Request): string {
    return (
      (request.headers['api-version'] as string) ||
      (request.query?.version as string) ||
      this.extractVersionFromUrl(request.url) ||
      'v1'
    );
  }

  private extractVersionFromUrl(url: string): string | null {
    const versionMatch = url.match(/\/v(\d+)\//);
    return versionMatch ? `v${versionMatch[1]}` : null;
  }
}
