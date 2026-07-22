import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { PrismaService } from './modules/database/prisma.service';
import { VersioningType } from '@nestjs/common';
import { initializeSentry } from './config/sentry.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const configService = app.get(ConfigService);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  // Initialize Sentry (only in dev and staging)
  initializeSentry(configService);

  // Security middleware
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

  // CORS
  app.enableCors({
    origin: configService.get<string | string[]>('cors.origin'),
    credentials: true,
  });

  // Global prefix
  const globalPrefix = configService.get<string>('app.apiPrefix') || 'api';
  app.setGlobalPrefix(globalPrefix);

  // API versioning
  app.enableVersioning({
    type: VersioningType.URI,
  });

  // Swagger documentation
  if (configService.get<boolean>('swagger.enabled')) {
    const config = new DocumentBuilder()
      .setTitle('NestJS Starter API')
      .setDescription(
        `
# NestJS Enterprise Starter API

A production-ready, enterprise-grade NestJS API with comprehensive features.

## Features
- 🔐 **JWT Authentication** - Secure authentication with access and refresh tokens
- 👥 **RBAC** - Role-based access control with granular permissions
- 📊 **Monitoring** - Sentry integration and comprehensive logging
- 🛡️ **Security** - Helmet, CORS, rate limiting, input validation
- 📝 **Logging** - Winston with multiple transports (console, files, database)
- 🏥 **Health Checks** - Database, memory, and disk monitoring
- 📚 **Documentation** - Auto-generated OpenAPI/Swagger documentation

## Authentication

Most endpoints require authentication. Use the \`/auth/login\` endpoint to obtain an access token.

Include the access token in the Authorization header:
\`\`\`
Authorization: Bearer <your-access-token>
\`\`\`

## Rate Limiting

API requests are rate-limited to prevent abuse. Default limits:
- 100 requests per 60 seconds per IP address

## Error Responses

All errors follow a consistent format:
\`\`\`json
{
  "statusCode": 400,
  "timestamp": "2025-01-18T10:30:00.000Z",
  "path": "/api/endpoint",
  "method": "POST",
  "message": "Error description",
  "errorCode": "ErrorType",
  "requestId": "correlation-id"
}
\`\`\`

## Initial super admin

The very first super admin is provisioned by \`npm run db:seed\` from the
\`INITIAL_SUPER_ADMIN_EMAIL\` and \`INITIAL_SUPER_ADMIN_PASSWORD\` env vars.
No credentials are hardcoded; the seeded account has \`mustChangePassword=true\`
and must rotate its password on first login.

## Support

For issues and questions, please contact the development team.
        `,
      )
      .setVersion('1.0.0')
      .setContact('Development Team', 'https://example.com', 'dev@example.com')
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'JWT',
      )
      .addTag('Authentication', 'User authentication and authorization endpoints')
      .addTag('Health', 'Application health check endpoints')
      .addTag('Users', 'User management endpoints')
      .addServer(`http://localhost:${configService.get<number>('app.port')}`, 'Development')
      .addServer('https://staging-api.example.com', 'Staging')
      .addServer('https://api.example.com', 'Production')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(configService.get<string>('swagger.path') || 'docs', app, document, {
      customSiteTitle: 'NestJS Starter API Docs',
      customfavIcon: 'https://nestjs.com/img/logo-small.svg',
      customCss: `
        .topbar-wrapper img { content:url('https://nestjs.com/img/logo-small.svg'); width:40px; height:auto; }
        .swagger-ui .topbar { background-color: #1a1a1a; }
      `,
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        showCommonExtensions: true,
        docExpansion: 'list',
        defaultModelsExpandDepth: 3,
        defaultModelExpandDepth: 3,
      },
    });
  }

  // Enable shutdown hooks
  const prismaService = app.get(PrismaService);
  await prismaService.enableShutdownHooks(app);

  const port = configService.get<number>('app.port') || 3000;
  const appEnv = configService.get<string>('app.appEnv');

  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}/${globalPrefix}`, 'Bootstrap');
  logger.log(`Environment: ${appEnv}`, 'Bootstrap');

  if (configService.get<boolean>('swagger.enabled')) {
    logger.log(
      `Swagger documentation: http://localhost:${port}/${configService.get<string>('swagger.path')}`,
      'Bootstrap',
    );
  }

  if (configService.get<boolean>('sentry.enabled')) {
    logger.log('Sentry monitoring is enabled', 'Bootstrap');
  }
}

bootstrap().catch((error) => {
  console.error('Failed to start the application:', error);
  process.exit(1);
});
