import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { ConfigService } from '@nestjs/config';
import { SentryConfig } from './configuration';

export function initializeSentry(configService: ConfigService): void {
  const sentryConfig = configService.get<SentryConfig>('sentry');
  const appEnv = configService.get<string>('app.appEnv');

  if (!sentryConfig?.enabled) {
    console.log('Sentry is disabled');
    return;
  }

  if (!sentryConfig.dsn) {
    console.warn('Sentry DSN is not configured. Skipping Sentry initialization.');
    return;
  }

  // Only initialize Sentry in dev and staging environments
  if (appEnv !== 'development' && appEnv !== 'staging') {
    console.log(`Sentry is not enabled for ${appEnv} environment`);
    return;
  }

  console.log(`Initializing Sentry for ${appEnv} environment...`);

  Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    debug: sentryConfig.debug,

    // Performance Monitoring
    tracesSampleRate: sentryConfig.tracesSampleRate,

    // Profiling
    profilesSampleRate: sentryConfig.profilesSampleRate,
    integrations: [
      // Add profiling integration
      nodeProfilingIntegration(),
      // Add other integrations
      Sentry.httpIntegration(),
      Sentry.nativeNodeFetchIntegration(),
    ],

    // Capture unhandled promise rejections
    beforeSend(event, _hint) {
      // You can modify or filter events here
      if (sentryConfig.debug) {
        console.log('Sentry event:', event);
      }

      // Don't send events in test environment
      if (process.env.NODE_ENV === 'test') {
        return null;
      }

      return event;
    },

    // Filter out sensitive data
    beforeBreadcrumb(breadcrumb, _hint) {
      // Modify breadcrumbs to remove sensitive data
      if (breadcrumb.category === 'http') {
        // Remove sensitive headers
        if (breadcrumb.data?.headers) {
          delete breadcrumb.data.headers.authorization;
          delete breadcrumb.data.headers.cookie;
        }
      }
      return breadcrumb;
    },
  });

  console.log('Sentry initialized successfully');
}

/**
 * Sentry error handler for NestJS exception filters
 */
export function captureSentryException(exception: unknown, context?: string): void {
  Sentry.withScope((scope) => {
    if (context) {
      scope.setTag('context', context);
    }

    if (exception instanceof Error) {
      Sentry.captureException(exception);
    } else {
      Sentry.captureMessage(String(exception), 'error');
    }
  });
}

/**
 * Capture custom metrics to Sentry
 */
export function captureSentryMetric(
  name: string,
  value: number,
  unit: string = 'millisecond',
  tags?: Record<string, string>,
): void {
  Sentry.metrics.gauge(name, value, {
    unit,
    tags,
  });
}
