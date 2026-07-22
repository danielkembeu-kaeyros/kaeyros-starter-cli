import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_PIPE, APP_INTERCEPTOR } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { I18nModule, AcceptLanguageResolver, QueryResolver, HeaderResolver } from 'nestjs-i18n';
import * as path from 'path';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { winstonConfig } from './common/logging/winston.config';
import { AuthzModule } from './common/authz/authz.module';
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { SmsModule } from './modules/sms/sms.module';
import { StorageModule } from './modules/storage/storage.module';
import { FilesModule } from './modules/storage/files/files.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { HealthModule } from './modules/health/health.module';
import { AwsModule } from './modules/aws/aws.module';
import { AwsService } from './modules/aws/aws.service';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { LoggerService } from './common/logging/logger.service';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { PerformanceInterceptor } from './common/interceptors/performance.interceptor';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { PrismaService } from './modules/database/prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
      // Fail-fast: validate the whole environment at startup. A missing or
      // malformed required variable aborts the boot with one aggregated error.
      validate: validateEnv,
    }),
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule, DatabaseModule, AwsModule],
      useFactory: (configService: ConfigService, prisma: PrismaService, awsService: AwsService) =>
        winstonConfig(configService, prisma, awsService),
      inject: [ConfigService, PrismaService, AwsService],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get<number>('throttle.ttl', 60) * 1000,
          limit: configService.get<number>('throttle.limit', 100),
        },
      ],
      inject: [ConfigService],
    }),
    DatabaseModule,
    AuthModule,
    AuthzModule,
    UsersModule,
    AdminModule,
    AuditModule,
    SmsModule,
    StorageModule,
    FilesModule,
    JobsModule,
    HealthModule,
    AwsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: PerformanceInterceptor,
    },
    LoggerService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
