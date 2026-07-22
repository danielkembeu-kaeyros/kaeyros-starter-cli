export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

export interface AppConfig {
  nodeEnv: string;
  appEnv: 'development' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
  frontendUrl: string;
}

export interface CorsConfig {
  origin: string | string[];
}

export interface ThrottleConfig {
  ttl: number;
  limit: number;
}

export interface LoggingConfig {
  level: string;
  fileEnabled: boolean;
  filePath: string;
  dbEnabled: boolean;
}

export interface HealthCheckConfig {
  enabled: boolean;
}

export interface SwaggerConfig {
  enabled: boolean;
  path: string;
}

export interface SentryConfig {
  dsn: string;
  enabled: boolean;
  tracesSampleRate: number;
  profilesSampleRate: number;
  environment: string;
  release: string;
  debug: boolean;
}

export interface MonitoringConfig {
  enableMetrics: boolean;
  enableTracing: boolean;
  enableProfiling: boolean;
}

export interface SecurityConfig {
  bcryptRounds: number;
  emailVerificationTtlMinutes: number;
  passwordResetTtlMinutes: number;
  loginLockoutThreshold: number;
  loginLockoutDurationMinutes: number;
  verificationCodeLength: number;
  loginOtpTtlMinutes: number;
}

export interface AwsConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;
}

export interface EmailConfig {
  provider: 'smtp' | 'ses' | 'sendgrid';
  from: string;
  fromName: string;
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  ses: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
  sendgrid: {
    apiKey: string;
  };
  previewMode: boolean;
}

export interface I18nConfig {
  defaultLanguage: string;
  fallbackLanguage: string;
  supportedLanguages: string[];
}

export interface Configuration {
  database: DatabaseConfig;
  jwt: JwtConfig;
  app: AppConfig;
  cors: CorsConfig;
  throttle: ThrottleConfig;
  logging: LoggingConfig;
  healthCheck: HealthCheckConfig;
  swagger: SwaggerConfig;
  sentry: SentryConfig;
  monitoring: MonitoringConfig;
  security: SecurityConfig;
  aws: AwsConfig;
  email: EmailConfig;
  i18n: I18nConfig;
}

/**
 * Validates that a required environment variable is present
 * @param key - The environment variable key
 * @param value - The environment variable value
 * @throws Error if the value is missing or empty
 */
function requireEnv(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
        `Please set ${key} in your .env file or environment.`,
    );
  }
  return value;
}

export default (): Configuration => {
  const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || 'development') as
    | 'development'
    | 'staging'
    | 'production';

  return {
    database: {
      url: requireEnv('DATABASE_URL', process.env.DATABASE_URL),
    },
    jwt: {
      // Required (min 32 chars) in staging/production — enforced at startup by
      // validateEnv. Dev/test fall back to these clearly-insecure defaults.
      secret: process.env.JWT_SECRET || 'change-this-secret-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret-in-production',
      refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    },
    app: {
      nodeEnv: process.env.NODE_ENV || 'development',
      appEnv,
      port: parseInt(process.env.PORT || '3000', 10),
      apiPrefix: process.env.API_PREFIX || 'api',
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    },
    cors: {
      origin: process.env.CORS_ORIGIN
        ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
        : ['http://localhost:3000', 'http://localhost:3001'],
    },
    throttle: {
      ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      fileEnabled: process.env.LOG_FILE_ENABLED === 'true',
      filePath: process.env.LOG_FILE_PATH || 'logs/application.log',
      dbEnabled: process.env.LOG_DB_ENABLED === 'true',
    },
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
    },
    swagger: {
      enabled: process.env.SWAGGER_ENABLED !== 'false',
      path: process.env.SWAGGER_PATH || 'docs',
    },
    sentry: {
      dsn: process.env.SENTRY_DSN || '',
      // Only enable Sentry in dev and staging based on APP_ENV
      enabled:
        process.env.SENTRY_ENABLED === 'true' &&
        (appEnv === 'development' || appEnv === 'staging') &&
        !!process.env.SENTRY_DSN,
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
      environment: process.env.SENTRY_ENVIRONMENT || appEnv,
      release: process.env.SENTRY_RELEASE || `nestjs-starter@${process.env.npm_package_version}`,
      debug: process.env.SENTRY_DEBUG === 'true',
    },
    monitoring: {
      enableMetrics: process.env.ENABLE_METRICS === 'true',
      enableTracing: process.env.ENABLE_TRACING === 'true',
      enableProfiling: process.env.ENABLE_PROFILING === 'true',
    },
    security: {
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
      emailVerificationTtlMinutes: parseInt(process.env.EMAIL_VERIFICATION_TTL_MINUTES || '15', 10),
      passwordResetTtlMinutes: parseInt(process.env.PASSWORD_RESET_TTL_MINUTES || '60', 10),
      loginLockoutThreshold: parseInt(process.env.LOGIN_LOCKOUT_THRESHOLD || '5', 10),
      loginLockoutDurationMinutes: parseInt(process.env.LOGIN_LOCKOUT_DURATION_MINUTES || '15', 10),
      verificationCodeLength: parseInt(process.env.VERIFICATION_CODE_LENGTH || '6', 10),
      loginOtpTtlMinutes: parseInt(process.env.LOGIN_OTP_TTL_MINUTES || '5', 10),
    },
    aws: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      region: process.env.AWS_REGION || 'us-east-1',
      bucketName: process.env.AWS_S3_BUCKET_NAME || '',
    },
    email: {
      provider: (process.env.EMAIL_PROVIDER || 'smtp') as 'smtp' | 'ses' | 'sendgrid',
      from: process.env.EMAIL_FROM || 'noreply@example.com',
      fromName: process.env.EMAIL_FROM_NAME || 'NestJS Starter',
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER || '',
          pass: process.env.SMTP_PASS || '',
        },
      },
      ses: {
        region: process.env.AWS_SES_REGION || process.env.AWS_REGION || 'us-east-1',
        accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey:
          process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '',
      },
      sendgrid: {
        apiKey: process.env.SENDGRID_API_KEY || '',
      },
      previewMode: process.env.EMAIL_PREVIEW_MODE === 'true' || appEnv === 'development',
    },
    i18n: {
      defaultLanguage: process.env.I18N_DEFAULT_LANGUAGE || 'en',
      fallbackLanguage: process.env.I18N_FALLBACK_LANGUAGE || 'en',
      supportedLanguages: process.env.I18N_SUPPORTED_LANGUAGES
        ? process.env.I18N_SUPPORTED_LANGUAGES.split(',').map((lang) => lang.trim())
        : ['en', 'fr'],
    },
  };
};
