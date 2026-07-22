# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an enterprise-grade NestJS starter template with comprehensive authentication, RBAC, monitoring, and instrumentation. It's designed to be a solid foundation for building scalable backend applications.

## Development Commands

### Core Development

- `npm run start:dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start:prod` - Start production build
- `npm run lint` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier
- `npm run typecheck` - Run TypeScript type checking

### Testing

- `npm run test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run test:all` - Run all tests (includes test setup)
- `npm run test:setup` - Setup test database
- `npm run test:cov` - Run tests with coverage

### Database Operations

- `npm run db:generate` - Generate Prisma client
- `npm run db:migrate` - Run database migrations
- `npm run db:push` - Push schema to database
- `npm run db:studio` - Open Prisma Studio
- `npm run db:seed` - Seed database with initial data

## Architecture

### Core Structure

This is a NestJS application with a modular architecture using Prisma ORM and PostgreSQL. The system implements comprehensive RBAC with JWT authentication.

### Key Modules

- **Auth Module** (`src/modules/auth/`) - JWT authentication with local and JWT strategies
- **Database Module** (`src/modules/database/`) - Prisma service and database configuration
- **Health Module** (`src/modules/health/`) - Application health check endpoints
- **Users Module** (`src/modules/users/`) - User management with RBAC (placeholder for expansion)

### Common Infrastructure

- **Guards** (`src/common/guards/`) - Roles and permissions guards
- **Decorators** (`src/common/decorators/`) - Custom decorators for roles, permissions, current user, and public routes
- **Filters** (`src/common/filters/`) - Global exception handling with Sentry integration
- **Interceptors** (`src/common/interceptors/`) - Logging and performance monitoring
- **Logging** (`src/common/logging/`) - Winston-based logging with multiple transports including DB
- **Middleware** (`src/common/middleware/`) - Request context middleware for correlation IDs
- **Pipes** (`src/common/pipes/`) - Custom validation pipes
- **Utils** (`src/common/utils/`) - Utility functions like Prisma error handling

### Database Schema

The application uses Prisma with PostgreSQL. Key entities:

- **User** - User accounts with email/password
- **Role** - User roles (e.g., ADMIN, USER)
- **Permission** - Fine-grained permissions (format: `resource:action`)
- **UserRole** - Junction table for user-role assignment
- **RolePermission** - Junction table for role-permission assignment
- **RefreshToken** - JWT refresh token storage
- **Log** - Database storage for critical logs

All entities include audit fields (createdAt, updatedAt, createdBy, updatedBy) and support soft delete where applicable.

### Authentication & Authorization

- JWT-based authentication with refresh tokens
- Role-based access control with fine-grained permissions
- Permission format: `resource:action` (e.g., `users:read`, `products:create`)
- Guards can be combined: `@Roles()`, `@RequirePermissions()` decorators
- Routes can be marked public with `@Public()` decorator

### Monitoring & Instrumentation

- **Sentry Integration**: Configured to run only in dev and staging (based on APP_ENV)
- **Winston Logging**: Multiple transports (console, rotating files, database)
- **Performance Monitoring**: Request duration tracking, slow request warnings
- **Health Checks**: Database, memory, and disk health indicators
- **Request Context**: Correlation IDs for request tracking

### Configuration

- Environment-based configuration in `src/config/configuration.ts`
- Support for `.env.local` and `.env` files
- Typed configuration interfaces
- **Environment Variable Validation**: Application validates required env vars at startup
  - `DATABASE_URL` - Required in all environments
  - `JWT_SECRET` - Required in production
  - `JWT_REFRESH_SECRET` - Required in production
  - Missing required variables will throw descriptive errors and prevent startup
- Winston logging with file, console, and DB transports
- Swagger/OpenAPI documentation enabled at `/docs`
- Rate limiting via NestJS Throttler
- CORS and security headers configured
- Default admin credentials after seeding: admin@example.com / admin123

## Path Aliases

The project uses TypeScript path aliases for cleaner imports:

- `@/` - Maps to `src/`
- `@common/` - Maps to `src/common/`
- `@modules/` - Maps to `src/modules/`
- `@config/` - Maps to `src/config/`

Example:

```typescript
import { LoggerService } from '@common/logging/logger.service';
import { AuthService } from '@modules/auth/auth.service';
```

## Logging Strategy

### Log Levels

- **error** - Critical errors that need immediate attention
- **warn** - Warning messages (e.g., slow requests, deprecation notices)
- **info** - General informational messages
- **debug** - Detailed debugging information (dev only)
- **verbose** - Very detailed logging (dev only)

### Log Transports

1. **Console** - All logs in development (disabled in test)
2. **Rotating Files**:
   - `logs/application-YYYY-MM-DD.log` - All logs (info and above)
   - `logs/error-YYYY-MM-DD.log` - Error logs only
3. **Database** - Only warnings and errors (to prevent bloat)
4. **Sentry** - 5xx server errors only (when enabled)

## Sentry Configuration

Sentry is configured with environment-aware settings:

- **Enabled**: Only in `development` and `staging` environments
- **Check**: `APP_ENV` variable (not `NODE_ENV`)
- **Metrics**: Traces and profiling samples configurable via environment
- **Data Sanitization**: Automatically removes sensitive headers and fields

## Common Patterns

### Creating a Protected Endpoint

```typescript
@Controller('resource')
@UseGuards(JwtAuthGuard)
export class ResourceController {
  @Get()
  @Roles('ADMIN')
  async findAll() {
    // Only authenticated users with ADMIN role
  }

  @Post()
  @RequirePermissions('resource:create')
  async create() {
    // Only users with 'resource:create' permission
  }
}
```

### Creating a Public Endpoint

```typescript
@Controller('public')
export class PublicController {
  @Get()
  @Public()
  async publicData() {
    // No authentication required
  }
}
```

### Using the Logger

```typescript
export class MyService {
  constructor(private readonly logger: LoggerService) {}

  async doSomething() {
    this.logger.log('Starting operation', 'MyService');

    try {
      // ... operation
      this.logger.logPerformance('doSomething', Date.now() - start, 'MyService');
    } catch (error) {
      this.logger.error('Operation failed', error.stack, 'MyService');
      throw error;
    }
  }
}
```

### Handling Prisma Errors

```typescript
import { handlePrismaError } from '@common/utils/prisma-error-handler.util';

try {
  await this.prisma.user.create({ data });
} catch (error) {
  handlePrismaError(error);
}
```

## Testing

### Unit Tests

- Use Jest
- Located in `*.spec.ts` files next to source
- Mock Prisma and other dependencies

### E2E Tests

- Use Jest with supertest
- Located in `test/` directory
- Use separate test database
- Run with `npm run test:e2e`

## Important Notes

### Security

- Never commit `.env` files
- Change default admin password in production
- Use strong JWT secrets
- Review CORS origins before deploying
- Keep dependencies updated

### Performance

- Database queries are logged in development mode
- Slow requests (> 1000ms) are automatically logged as warnings
- Use appropriate indexes in Prisma schema

### Error Handling

- All endpoints use global exception filter
- Errors are logged and sent to Sentry (if enabled)
- Sensitive data is sanitized before logging
- Use custom exceptions from `@common/exceptions/`

## Additional Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
This is a starter template - it's meant to be customized and extended for specific use cases.
