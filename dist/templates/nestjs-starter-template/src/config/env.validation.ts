import 'reflect-metadata';
import { plainToInstance, Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

/**
 * Fail-fast environment validation
 * ---------------------------------
 * `validateEnv` is wired into `ConfigModule.forRoot({ validate })`, so it runs
 * once at startup — before any module initializes. If a required variable is
 * missing or malformed the process refuses to boot with a single, aggregated
 * error listing every problem at once, rather than failing deep inside a
 * request handler later.
 *
 * Strictness is env-aware (see {@link isProdLike}):
 *  - `DATABASE_URL` is required in every environment.
 *  - Secrets and provider credentials are required only when the app runs in a
 *    "prod-like" environment (`APP_ENV`/`NODE_ENV` of `staging` or `production`).
 *    Development and test stay frictionless with the safe defaults baked into
 *    `configuration.ts`.
 */

export enum AppEnvironment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum EmailProvider {
  Smtp = 'smtp',
  Ses = 'ses',
  Sendgrid = 'sendgrid',
}

export enum SmsProviderName {
  Twilio = 'twilio',
  Null = 'null',
}

export enum StorageProviderName {
  S3 = 's3',
}

/**
 * Resolved deployment environment. `APP_ENV` wins over `NODE_ENV`, mirroring
 * the precedence in `configuration.ts`.
 */
function resolveAppEnv(env: EnvironmentVariables): string {
  return env.APP_ENV ?? env.NODE_ENV ?? 'development';
}

/** True for `staging`/`production`, where secrets must be explicitly provided. */
function isProdLike(env: EnvironmentVariables): boolean {
  const appEnv = resolveAppEnv(env);
  return appEnv === AppEnvironment.Staging || appEnv === AppEnvironment.Production;
}

function isS3Required(env: EnvironmentVariables): boolean {
  return (
    isProdLike(env) && (env.STORAGE_PROVIDER ?? StorageProviderName.S3) === StorageProviderName.S3
  );
}

function isTwilioRequired(env: EnvironmentVariables): boolean {
  return isProdLike(env) && (env.SMS_PROVIDER ?? SmsProviderName.Twilio) === SmsProviderName.Twilio;
}

function emailProviderOf(env: EnvironmentVariables): string {
  return env.EMAIL_PROVIDER ?? EmailProvider.Smtp;
}

export class EnvironmentVariables {
  // --- Application -----------------------------------------------------------
  @IsOptional()
  @IsEnum(NodeEnvironment, {
    message: 'NODE_ENV must be one of: development, test, production',
  })
  NODE_ENV?: NodeEnvironment;

  @IsOptional()
  @IsEnum(AppEnvironment, {
    message: 'APP_ENV must be one of: development, test, staging, production',
  })
  APP_ENV?: AppEnvironment;

  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt({ message: 'PORT must be an integer' })
  @Min(0)
  @Max(65535)
  PORT?: number;

  // --- Database (always required) -------------------------------------------
  @IsNotEmpty({ message: 'DATABASE_URL is required (e.g. postgresql://user:pass@host:5432/db)' })
  DATABASE_URL!: string;

  // --- JWT (required in staging/production) ---------------------------------
  @ValidateIf(isProdLike)
  @MinLength(32, {
    message: 'JWT_SECRET must be set to at least 32 characters in staging/production',
  })
  JWT_SECRET?: string;

  @ValidateIf(isProdLike)
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET must be set to at least 32 characters in staging/production',
  })
  JWT_REFRESH_SECRET?: string;

  // --- Storage --------------------------------------------------------------
  @IsOptional()
  @IsEnum(StorageProviderName, { message: 'STORAGE_PROVIDER must be one of: s3' })
  STORAGE_PROVIDER?: StorageProviderName;

  // S3_BUCKET is required in prod-like envs unless the legacy AWS_S3_BUCKET_NAME is set.
  @ValidateIf((env) => isS3Required(env) && !env.AWS_S3_BUCKET_NAME)
  @IsNotEmpty({
    message:
      'S3_BUCKET (or AWS_S3_BUCKET_NAME) is required when STORAGE_PROVIDER=s3 in staging/production',
  })
  S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  AWS_S3_BUCKET_NAME?: string;

  @ValidateIf((env) => isS3Required(env) && !env.AWS_ACCESS_KEY_ID)
  @IsNotEmpty({
    message:
      'S3_ACCESS_KEY_ID (or AWS_ACCESS_KEY_ID) is required when STORAGE_PROVIDER=s3 in staging/production',
  })
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  AWS_ACCESS_KEY_ID?: string;

  @ValidateIf((env) => isS3Required(env) && !env.AWS_SECRET_ACCESS_KEY)
  @IsNotEmpty({
    message:
      'S3_SECRET_ACCESS_KEY (or AWS_SECRET_ACCESS_KEY) is required when STORAGE_PROVIDER=s3 in staging/production',
  })
  S3_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  AWS_SECRET_ACCESS_KEY?: string;

  // --- SMS (Twilio creds required in prod-like envs when provider=twilio) ---
  @IsOptional()
  @IsEnum(SmsProviderName, { message: 'SMS_PROVIDER must be one of: twilio, null' })
  SMS_PROVIDER?: SmsProviderName;

  @ValidateIf(isTwilioRequired)
  @IsNotEmpty({
    message: 'TWILIO_ACCOUNT_SID is required when SMS_PROVIDER=twilio in staging/production',
  })
  TWILIO_ACCOUNT_SID?: string;

  @ValidateIf(isTwilioRequired)
  @IsNotEmpty({
    message: 'TWILIO_AUTH_TOKEN is required when SMS_PROVIDER=twilio in staging/production',
  })
  TWILIO_AUTH_TOKEN?: string;

  @ValidateIf(isTwilioRequired)
  @IsNotEmpty({
    message: 'TWILIO_FROM_NUMBER is required when SMS_PROVIDER=twilio in staging/production',
  })
  TWILIO_FROM_NUMBER?: string;

  // --- Email (provider-specific creds required in prod-like envs) -----------
  @IsOptional()
  @IsEnum(EmailProvider, { message: 'EMAIL_PROVIDER must be one of: smtp, ses, sendgrid' })
  EMAIL_PROVIDER?: EmailProvider;

  @ValidateIf((env) => isProdLike(env) && emailProviderOf(env) === EmailProvider.Smtp)
  @IsNotEmpty({ message: 'SMTP_HOST is required when EMAIL_PROVIDER=smtp in staging/production' })
  SMTP_HOST?: string;

  @ValidateIf((env) => isProdLike(env) && emailProviderOf(env) === EmailProvider.Smtp)
  @IsNotEmpty({ message: 'SMTP_USER is required when EMAIL_PROVIDER=smtp in staging/production' })
  SMTP_USER?: string;

  @ValidateIf((env) => isProdLike(env) && emailProviderOf(env) === EmailProvider.Smtp)
  @IsNotEmpty({ message: 'SMTP_PASS is required when EMAIL_PROVIDER=smtp in staging/production' })
  SMTP_PASS?: string;

  @ValidateIf((env) => isProdLike(env) && emailProviderOf(env) === EmailProvider.Sendgrid)
  @IsNotEmpty({
    message: 'SENDGRID_API_KEY is required when EMAIL_PROVIDER=sendgrid in staging/production',
  })
  SENDGRID_API_KEY?: string;

  // --- Logging --------------------------------------------------------------
  @IsOptional()
  @IsIn(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'], {
    message: 'LOG_LEVEL must be a valid winston level',
  })
  LOG_LEVEL?: string;
}

/**
 * Validates `process.env` against {@link EnvironmentVariables} and throws a
 * single aggregated error if anything is missing or malformed. Returns the
 * (coerced) validated object on success so `ConfigModule` can use it.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    // Keep undefined for unset vars so @ValidateIf/@IsOptional behave predictably.
    exposeDefaultValues: false,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
    forbidUnknownValues: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => {
        const constraints = error.constraints ? Object.values(error.constraints) : ['is invalid'];
        return constraints.map((message) => `  - ${message}`).join('\n');
      })
      .join('\n');

    throw new Error(
      `Invalid environment configuration — the application cannot start.\n` +
        `Fix the following ${errors.length} problem(s) in your .env / environment:\n` +
        `${details}\n`,
    );
  }

  return validated;
}
