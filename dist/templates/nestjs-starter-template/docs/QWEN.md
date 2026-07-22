# Qwen Code Context - NestJS Enterprise Starter

## Project Overview

This is a production-ready, enterprise-grade NestJS starter template featuring comprehensive authentication, RBAC, advanced logging with Winston, Sentry monitoring, AWS S3 integration, and complete instrumentation. The project is designed to provide a solid foundation for building scalable enterprise applications with security and monitoring features already implemented.

**Key Technologies:**

- **NestJS** (v10.4.15) - Node.js framework with TypeScript support
- **TypeScript** (v5.7.2) - Type-safe JavaScript superset
- **Prisma ORM** (v6.2.0) - Database toolkit and ORM
- **PostgreSQL** - Primary database
- **JWT** - Token-based authentication
- **Winston** - Advanced logging
- **Sentry** - Error monitoring and performance tracking
- **AWS SDK** - S3 file storage integration

## Project Architecture

### Directory Structure

```
nestjs-starter/
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma          # Database schema definition
│   └── seed.ts                # Database seeding script
├── scripts/                   # Utility scripts
├── src/                       # Main source code
│   ├── common/                # Shared utilities and components
│   │   ├── decorators/        # Custom decorators (CurrentUser, Roles, etc.)
│   │   ├── filters/           # Exception filters
│   │   ├── guards/            # Authorization guards
│   │   ├── interceptors/      # Request/response interceptors
│   │   ├── logging/           # Winston logging configuration
│   │   ├── middleware/        # Custom middleware
│   │   ├── pipes/             # Validation pipes
│   │   └── utils/             # Utility functions
│   ├── config/                # Configuration files
│   │   ├── configuration.ts   # App configuration schema
│   │   └── sentry.config.ts   # Sentry monitoring setup
│   ├── modules/               # Feature modules
│   │   ├── auth/              # Authentication and authorization
│   │   ├── aws/               # AWS S3 integration
│   │   ├── database/          # Database module
│   │   ├── health/            # Health check module
│   │   └── users/             # Users module
│   ├── types/                 # TypeScript type definitions
│   ├── app.module.ts          # Root application module
│   └── main.ts                # Application entry point
├── test/                      # E2E tests
├── logs/                      # Generated log files
└── dist/                      # Compiled output
```

### Core Modules

1. **Auth Module** - JWT-based authentication with refresh tokens, RBAC, password reset functionality
2. **Database Module** - Prisma ORM integration with PostgreSQL
3. **AWS Module** - S3 file upload/download capabilities
4. **Health Module** - Application health monitoring
5. **Users Module** - Placeholder for user management

### Database Schema

The database uses PostgreSQL with Prisma ORM and includes:

- **User** - Core user entity with audit fields
- **Role** - Role-based access control
- **Permission** - Granular permissions system
- **UserRole** - Junction table connecting users and roles
- **RolePermission** - Junction table connecting roles and permissions
- **RefreshToken** - Token management for authentication
- **PasswordReset** - Password reset functionality
- **Log** - Database logging

## Building and Running

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0
- PostgreSQL database

### Installation

1. Install dependencies: `npm install`
2. Set up environment: `cp .env.example .env`
3. Configure database connection in `.env`
4. Generate Prisma client: `npm run db:generate`
5. Run migrations: `npm run db:migrate`
6. Seed database: `npm run db:seed`
7. Start development server: `npm run start:dev`

### Key Commands

```bash
# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start in debug mode

# Production
npm run build              # Build for production
npm run start:prod         # Start production build

# Testing
npm run test               # Run unit tests
npm run test:e2e           # Run e2e tests
npm run test:all           # Run all tests
npm run test:cov           # Run tests with coverage

# Database
npm run db:generate        # Generate Prisma client
npm run db:migrate         # Run migrations
npm run db:push            # Push schema changes
npm run db:studio          # Open Prisma Studio
npm run db:seed            # Seed database

# Code Quality
npm run lint               # Lint and fix
npm run format             # Format with Prettier
npm run typecheck          # Check TypeScript types
```

### Default Credentials

- **Email**: `kaeyros.admin@yopmail.com`
- **Password**: `passwordAdmin`

## Development Conventions

### Security Practices

- JWT token-based authentication with refresh tokens
- RBAC (Role-Based Access Control) with granular permissions
- Password hashing with bcrypt
- Helmet for HTTP security headers
- CORS configuration with origin restrictions
- Rate limiting via NestJS Throttler
- Input validation with class-validator/class-transformer
- Automatic sanitization of sensitive data (passwords, tokens) from logs

### Monitoring and Observability

- Sentry integration for error tracking (development and staging only)
- Winston logger with multiple transports (console, file, database)
- Request correlation IDs for distributed tracing
- Performance metrics and slow request tracking
- Health checks for database, memory, and disk
- Structured logging with metadata

### Authentication Decorators

- `@CurrentUser()` - Get current authenticated user
- `@Roles()` - Require specific roles
- `@RequirePermissions()` - Require specific permissions
- `@Authorize()` - Flexible authorization with multiple rules
- `@Public()` - Mark routes as public (no auth required)

### Common DTOs

- `PaginationDto` - Standardized pagination (page, limit, offset)
- `BaseFiltersDto` - Common filters (date ranges, audit fields, search)
- VersionInterceptor for API versioning

### Git Hooks

- Pre-commit: Linting, formatting, and type checking
- Pre-push: Full lint, type check, and test run

## Environment Configuration

### Required Variables

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for JWT access tokens
- `JWT_REFRESH_SECRET` - Secret for JWT refresh tokens

### Optional Variables

- `APP_ENV` - Application environment (dev/staging/prod)
- `PORT` - Server port (default: 3000)
- `API_PREFIX` - API prefix (default: api)
- `SENTRY_DSN` - Sentry DSN for error tracking
- `LOG_LEVEL` - Logging level (default: info)
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_S3_BUCKET_NAME` - S3 bucket name

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/profile` - Get current user profile (protected)
- `POST /api/auth/request-password-reset` - Request password reset token
- `POST /api/auth/reset-password` - Reset password with valid token

### AWS S3 File Upload

- `POST /api/aws/upload` - Upload single file to S3
- `POST /api/aws/upload-multiple` - Upload multiple files (max 10)
- `DELETE /api/aws/:key` - Delete file from S3
- `GET /api/aws/presigned-url/:key` - Get presigned URL for temporary access

### Health

- `GET /api/health` - Application health check

## RBAC System

The application implements a complete Role-Based Access Control system:

### Permissions Format

- Format: `resource:action` (e.g., `users:read`, `users:create`)

### Default Roles

- **ADMIN** - Full access to all resources (16 permissions)
- **MODERATOR** - Limited administrative access (6 permissions)
- **USER** - Basic user access (2 permissions)

## Type Aliases

The project uses TypeScript path aliases for clean imports:

- `@/*` - Maps to `src/*`
- `@common/*` - Maps to `src/common/*`
- `@modules/*` - Maps to `src/modules/*`
- `@config/*` - Maps to `src/config/*`
- `@types/*` - Maps to `src/types/*`

## Testing Strategy

The application includes comprehensive testing setup:

- Unit tests with Jest
- E2E tests with Supertest
- Test coverage reporting
- Database-specific test setup script

## Deployment Considerations

For production deployment:

1. Change default admin credentials
2. Set strong JWT secrets
3. Configure production database
4. Set `NODE_ENV=production`
5. Configure Sentry DSN for production if needed
6. Disable Swagger in production
7. Configure CORS origins properly
8. Adjust rate limiting settings
9. Set up SSL/TLS
10. Configure logging levels appropriately

The application is designed for enterprise usage with comprehensive logging, monitoring, security measures, and scalability considerations already implemented.
