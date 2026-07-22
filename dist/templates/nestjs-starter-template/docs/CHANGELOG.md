# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-01-18

### Initial Release

Enterprise-grade NestJS starter template with comprehensive features extracted from production applications.

### Added

#### Core Features

- JWT authentication with access and refresh tokens
- Complete RBAC implementation with roles and permissions
- Winston logging with multiple transports (console, files, database)
- Sentry integration with environment-aware configuration
- Comprehensive instrumentation and monitoring
- Health checks (database, memory, disk)
- Request correlation IDs
- Performance tracking and slow request detection

#### Modules

- **Auth Module**: Complete authentication system
  - Local strategy (email/password)
  - JWT strategy
  - Refresh token rotation
  - Profile endpoint
- **Database Module**: Prisma integration
  - Query logging
  - Error handling
  - Shutdown hooks
- **Health Module**: Health check endpoints
  - Database ping
  - Memory checks
  - Disk space monitoring
- **Users Module**: Placeholder for user management

#### Common Infrastructure

- Custom decorators (@CurrentUser, @Roles, @RequirePermissions, @Public)
- Guards (JWT, Roles, Permissions)
- Global exception filter with Sentry integration
- Validation pipe with structured error responses
- Logging interceptor for HTTP requests
- Performance interceptor with metrics
- Request context middleware

#### Database

- Prisma schema with complete RBAC structure
- Seed file with default roles, permissions, and admin user
- Migration setup
- Database logging transport for Winston

#### Configuration

- Type-safe configuration system
- Environment-based settings
- Sentry configuration with APP_ENV awareness
- Multi-environment support (development, staging, production)

#### Developer Experience

- TypeScript path aliases (@common, @modules, @config)
- ESLint and Prettier configuration
- Husky and lint-staged setup
- Comprehensive documentation
- Swagger/OpenAPI integration
- Jest testing setup (unit and e2e)

#### Security

- Helmet for HTTP security headers
- CORS configuration
- Rate limiting/throttling
- Input validation
- Password hashing with bcrypt
- SQL injection protection via Prisma
- Data sanitization in logs and errors

#### Documentation

- README.md - Quick start and overview
- SETUP.md - Detailed setup guide
- CLAUDE.md - Claude Code integration
- FEATURES.md - Comprehensive feature documentation
- CHANGELOG.md - This file

### Design Decisions

#### Why Sentry Only in Dev/Staging?

- Reduces costs in production
- Focuses on catching bugs early
- Production errors should use different alerting
- Can be easily enabled in production if needed

#### Why Database Logging Transport?

- Queryable log history
- Critical error retention
- Audit trail capability
- Only warnings/errors to prevent bloat

#### Why Request IDs?

- Distributed tracing support
- Easy debugging across services
- Correlation of logs and errors
- Better error reporting

#### Why Prisma?

- Type safety
- Excellent TypeScript support
- Migration management
- Prevents SQL injection
- Great developer experience

### Breaking Changes

N/A - Initial release

### Known Issues

- None at this time

### Upgrade Guide

N/A - Initial release

---

## Version Format

This project follows [Semantic Versioning](https://semver.org/):

- MAJOR: Breaking changes
- MINOR: New features (backwards compatible)
- PATCH: Bug fixes (backwards compatible)

## Categories

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
