# NestJS Enterprise Starter - Feature Documentation

## 🎯 Overview

This NestJS starter template was created by extracting and enhancing the best practices from a production application. It includes enterprise-grade features like comprehensive authentication, RBAC, advanced logging, Sentry monitoring, and complete instrumentation.

## ✨ Key Features

### 1. Authentication & Authorization

#### JWT Authentication

- **Access Tokens**: Short-lived tokens (15 min default) for API access
- **Refresh Tokens**: Long-lived tokens (7 days default) stored in database
- **Token Rotation**: Automatic token refresh with security best practices
- **Password Hashing**: bcrypt with configurable rounds

#### Strategies

- **Local Strategy**: Email/password authentication
- **JWT Strategy**: Token-based authentication
- Extensible for additional strategies (OAuth, SAML, etc.)

#### Password Reset

- **Secure Token Generation**: Cryptographically secure random tokens (32 bytes)
- **Token Expiration**: 1-hour validity for reset tokens
- **Email Integration Ready**: Infrastructure for sending reset emails (TODO: configure email service)
- **Security Features**:
  - Doesn't reveal if user exists
  - Invalidates old tokens on new request
  - Revokes all refresh tokens on password reset
  - Validates user active state
  - Token can only be used once
- **Endpoints**:
  - `POST /api/auth/request-password-reset` - Request a reset token
  - `POST /api/auth/reset-password` - Reset password with valid token

#### Decorators

- `@CurrentUser()` - Get current authenticated user
- `@Roles(...roles)` - Require specific roles
- `@RequirePermissions(...perms)` - Require specific permissions
- `@Public()` - Mark routes as publicly accessible
- `@Authorize({...})` - Flexible authorization with roles, permissions, and custom rules
  - `@AdminOnly()` - Shorthand for admin access
  - `@ModeratorOnly()` - Shorthand for moderator access
  - `@CanCreateUsers()` - Permission-based shortcuts
  - `@CanUpdateUsers()`, `@CanDeleteUsers()`, etc.

### 2. Role-Based Access Control (RBAC)

#### Complete RBAC Implementation

- **Roles**: User roles (e.g., ADMIN, USER)
- **Permissions**: Granular permissions in format `resource:action`
- **Many-to-Many**: Users can have multiple roles, roles can have multiple permissions
- **Guards**: Automatic enforcement via guards

#### Database Schema

```
User ←→ UserRole ←→ Role ←→ RolePermission ←→ Permission
```

#### Example Permissions

- `users:create`, `users:read`, `users:update`, `users:delete`
- `roles:create`, `roles:read`, `roles:update`, `roles:delete`
- Easily extensible for any resource

### 3. Common DTOs for API Development

#### PaginationDto

Standardized pagination for list endpoints:

```typescript
@Get()
async findAll(@Query() pagination: PaginationDto) {
  // pagination.page (default: 1, min: 1)
  // pagination.limit (default: 10, min: 1, max: 100)
  // pagination.offset (computed automatically)
}
```

#### BaseFiltersDto

Common filters applicable to most entities:

- **Date filters**: `date`, `startDate`, `endDate`
- **Audit filters**: `createdBy`, `updatedBy`
- **Common filters**: `search`, `isActive`, `includeDeleted`

Extend this DTO for resource-specific filters:

```typescript
export class UserFiltersDto extends BaseFiltersDto {
  @IsOptional()
  @IsEmail()
  email?: string;
}
```

#### API Versioning

`VersionInterceptor` automatically adds version metadata to responses:

```typescript
{
  ...responseData,
  _metadata: {
    version: 'v1',
    timestamp: '2025-01-18T10:30:00.000Z'
  }
}
```

Version extracted from: header (`api-version`), query param (`?version=v1`), or URL path (`/v1/`).

### 4. Advanced Logging with Winston

#### Multiple Transports

1. **Console Transport**
   - Enabled in development
   - Disabled in test mode
   - Colored output with timestamps
   - Structured logging format

2. **File Transport (Daily Rotation)**
   - `logs/application-YYYY-MM-DD.log` - Combined logs (info+)
   - `logs/error-YYYY-MM-DD.log` - Error logs only
   - Automatic compression (gzip) after rotation
   - Configurable retention (14 days for combined, 30 days for errors)
   - Max file size: 20MB

3. **Database Transport** (Custom Implementation)
   - Stores warnings and errors in PostgreSQL
   - Prevents log bloat by only storing critical logs
   - Queryable via Prisma
   - Includes context, trace, and metadata

4. **Exception/Rejection Handlers**
   - Catches unhandled exceptions
   - Catches unhandled promise rejections
   - Logged to separate files

#### LoggerService Methods

```typescript
log(message, context?)           // Info level
error(message, trace?, context?)  // Error level
warn(message, context?)           // Warning level
debug(message, context?)          // Debug level
verbose(message, context?)        // Verbose level

logWithMeta(level, message, meta, context?)  // With metadata
logPerformance(operation, durationMs, context?, meta?)  // Performance
logHttpRequest(method, url, statusCode, durationMs, userId?)  // HTTP
logDatabaseQuery(query, durationMs, context?)  // Database queries
```

### 4. Sentry Integration

#### Environment-Aware Configuration

- **Enabled**: Only in `development` and `staging` environments
- **Controlled by**: `APP_ENV` variable (not `NODE_ENV`)
- **Automatic**: No manual `Sentry.captureException()` needed for most errors

#### Features

- **Error Tracking**: Automatic capture of 5xx errors
- **Performance Monitoring**: Request tracing with configurable sample rates
- **Profiling**: Node.js profiling integration
- **Custom Metrics**: `captureSentryMetric()` helper function
- **Data Sanitization**: Automatic removal of sensitive headers and fields

#### Integrations

- HTTP request tracking
- Node.js native fetch tracking
- Performance profiling
- Custom breadcrumbs

### 5. Monitoring & Instrumentation

#### Request Tracking

- **Request IDs**: Unique UUID for each request (correlation IDs)
- **Request Context**: Start time, user ID, request metadata
- **Response Headers**: `X-Request-Id` header in all responses

#### Performance Monitoring

- **Request Duration**: Automatic tracking of all requests
- **Slow Request Detection**: Warnings for requests > 1000ms
- **Metrics**: Sent to Sentry when enabled
- **Database Queries**: Logged in development mode

#### Health Checks

- **Database**: Prisma ping check
- **Memory**: Heap and RSS memory checks
- **Disk**: Storage threshold monitoring
- **Endpoint**: `GET /api/health`

### 6. Exception Handling

#### Global Exception Filter

- Catches all exceptions application-wide
- Structured error responses with:
  - Status code
  - Timestamp
  - Request path and method
  - Error message and code
  - Request ID (for tracing)
  - Field name (for constraint violations)
  - Structured errors object (for validation)
  - Stack trace (development only)
- **Enhanced Validation Errors**: Field-level errors with nested object support
- **Sensitive Data Sanitization**: Automatically redacts passwords, tokens, API keys

#### Custom Exceptions

- `UnauthorizedException` (401)
- `ForbiddenException` (403)
- `NotFoundException` (404)
- `ConflictException` (409)
- `BadRequestException` (400)
- `InternalServerErrorException` (500)
- `UnprocessableEntityException` (422)

#### Enhanced Prisma Error Handling

Comprehensive handling of 20+ Prisma error codes:

- **P2002** - Unique constraint violations (409 Conflict)
  - Extracts field name from constraint
  - User-friendly messages for common fields
  - Composite unique constraint detection
- **P2001** - Record not found (400 Bad Request)
- **P2003** - Foreign key constraint failed (400 Bad Request)
- **P2011** - Null constraint violation (400 Bad Request)
- **P2014** - Relation violation (400 Bad Request)
- **P2025** - Record to update not found (400 Bad Request)
- And many more...

#### Validation Error Format

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "errorCode": "ValidationError",
  "errors": {
    "email": ["must be a valid email"],
    "password": ["must be at least 6 characters"],
    "address.city": ["should not be empty"]
  }
}
```

### 7. Security

#### Built-in Security Features

- **Helmet**: HTTP security headers
- **CORS**: Configurable CORS policy
- **Rate Limiting**: Throttler module (configurable TTL and limit)
- **Password Hashing**: bcrypt with configurable rounds
- **Input Validation**: class-validator with ValidationPipe
- **SQL Injection Protection**: Prisma ORM prevents SQL injection
- **XSS Protection**: Helmet middleware

#### Data Sanitization

- Removes sensitive headers before logging (authorization, cookie)
- Redacts sensitive fields (password, token, secret, apiKey, creditCard)
- Environment-based stack trace exposure

### 8. AWS S3 File Storage

#### Features

- **File Upload**: Single and multiple file uploads to S3
- **File Deletion**: Remove files from S3 buckets
- **Presigned URLs**: Generate temporary access URLs for private files
- **Configurable**: Bucket name, region, and credentials via environment variables
- **Logging**: Comprehensive logging of all S3 operations
- **Exportable Service**: Use AwsService in any module

#### Endpoints

- `POST /api/aws/upload` - Upload single file
- `POST /api/aws/upload-multiple` - Upload up to 10 files
- `DELETE /api/aws/:key` - Delete file by key
- `GET /api/aws/presigned-url/:key` - Get temporary access URL

#### Usage in Other Modules

```typescript
// Import AwsModule in your module
@Module({
  imports: [AwsModule],
  // ...
})
export class YourModule {}

// Inject AwsService
constructor(private readonly awsService: AwsService) {}

// Upload file
const url = await this.awsService.uploadFile(file);

// Upload multiple files
const urls = await this.awsService.uploadMultipleFiles(files);

// Delete file
await this.awsService.deleteFile('file-key');

// Get presigned URL (default 1 hour expiry)
const url = await this.awsService.getPresignedUrl('file-key', undefined, 3600);
```

#### Configuration

```env
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=your-bucket-name
```

### 9. Database (Prisma)

#### Features

- **Type Safety**: Full TypeScript support
- **Migrations**: Version-controlled schema changes
- **Seeding**: Automated initial data setup
- **Prisma Studio**: Visual database browser
- **Query Logging**: Development mode logging
- **Error Events**: Automatic error and warning handling

#### Schema Highlights

- Audit fields on all entities (createdAt, updatedAt, createdBy, etc.)
- Soft delete support (deletedAt, deletedBy)
- Indexes for performance optimization
- Cascade deletes for referential integrity

### 10. Configuration Management

#### Type-Safe Configuration

```typescript
interface Configuration {
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
}
```

#### Environment Variables

- `.env.local` overrides `.env`
- Validation and defaults
- Global access via `ConfigService`

### 10. API Documentation

#### Swagger/OpenAPI

- Auto-generated from code
- Interactive API explorer
- Request/response schemas
- Authentication support
- Configurable endpoint (default: `/docs`)
- Can be disabled in production

### 11. Testing Support

#### Unit Testing

- Jest configuration
- Path aliases support
- Coverage reporting
- Located next to source files

#### E2E Testing

- Separate Jest config
- Supertest for HTTP testing
- Test database setup script
- Isolated test environment

### 12. Developer Experience

#### TypeScript Path Aliases

```typescript
import { LoggerService } from '@common/logging/logger.service';
import { AuthService } from '@modules/auth/auth.service';
import configuration from '@config/configuration';
```

#### Code Quality

- **ESLint**: TypeScript-aware linting
- **Prettier**: Consistent code formatting
- **Husky**: Git hooks (optional)
- **lint-staged**: Pre-commit linting
- **Type Checking**: `npm run typecheck`

#### Hot Reload

- Automatic restart on file changes
- Fast compilation with incremental builds
- Debug mode support

## 📊 Instrumentation Flow

```
Request
  ↓
RequestContextMiddleware (adds requestId, startTime)
  ↓
JwtAuthGuard (validates JWT, attaches user to request)
  ↓
RolesGuard / PermissionsGuard (checks authorization)
  ↓
LoggingInterceptor (logs HTTP request/response)
  ↓
PerformanceInterceptor (tracks duration, detects slow requests)
  ↓
Controller → Service
  ↓
Exception Filter (catches errors, logs to Winston/Sentry)
  ↓
Response (with X-Request-Id header)
```

## 🔧 Extensibility Points

### Easy to Add

1. **New Modules**: Follow the existing module pattern
2. **New Permissions**: Add to seed file and RBAC logic
3. **New Roles**: Create in seed and assign permissions
4. **Custom Transports**: Extend Winston configuration
5. **Additional Strategies**: Add new Passport strategies
6. **More Health Checks**: Extend health controller

### Designed for Growth

- Modular architecture
- Dependency injection
- Interface-based design
- Clear separation of concerns

## 📈 Performance Considerations

### Optimizations

- Connection pooling (Prisma)
- Request-level caching (easily addable)
- Lazy loading of modules
- Efficient query patterns
- Indexed database fields

### Monitoring

- Automatic slow request detection
- Database query timing
- Memory usage tracking
- Disk space monitoring

## 📋 Best Practices

### Query Filtering

When implementing GET endpoints, always consider:

#### Soft Delete Filtering

```typescript
// Default: Exclude soft-deleted records
const users = await prisma.user.findMany({
  where: {
    deletedAt: null, // Only active records
  },
});

// Optional: Include deleted if explicitly requested
if (filters.includeDeleted) {
  // Remove deletedAt filter
}
```

#### Active Status Filtering

```typescript
// Filter by active status
const users = await prisma.user.findMany({
  where: {
    isActive: filters.isActive !== undefined ? filters.isActive : true,
    deletedAt: null,
  },
});
```

#### Using BaseFiltersDto

The starter provides `BaseFiltersDto` for common filtering needs:

```typescript
@Get()
async findAll(@Query() filters: BaseFiltersDto) {
  const where: Prisma.UserWhereInput = {
    ...(filters.isActive !== undefined && { isActive: filters.isActive }),
    ...(filters.includeDeleted !== true && { deletedAt: null }),
    ...(filters.createdBy && { createdBy: filters.createdBy }),
    ...(filters.search && {
      OR: [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { firstName: { contains: filters.search, mode: 'insensitive' } },
      ],
    }),
  };

  return prisma.user.findMany({ where });
}
```

### Authentication State Management

The authentication system automatically validates:

- ✅ User exists
- ✅ User is active (`isActive: true`)
- ✅ User is not soft-deleted (`deletedAt: null`)

This is enforced at:

1. **Login** (`validateUser` in auth.service.ts:55)
2. **JWT Validation** (`validateJwtPayload` in auth.service.ts:325)
3. **Token Refresh** (`refreshTokens` in auth.service.ts:266)

Inactive or deleted users are immediately rejected with `UnauthorizedException`.

### Pagination

Use `PaginationDto` for consistent pagination:

```typescript
@Get()
async findAll(
  @Query() pagination: PaginationDto,
  @Query() filters: BaseFiltersDto,
) {
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where: buildWhereClause(filters),
      skip: pagination.offset,
      take: pagination.limit,
    }),
    prisma.user.count({
      where: buildWhereClause(filters),
    }),
  ]);

  return {
    items,
    total,
    page: pagination.page,
    limit: pagination.limit,
    totalPages: Math.ceil(total / pagination.limit),
  };
}
```

## 🚀 Production Ready

### Includes

- ✅ Environment-based configuration
- ✅ Structured logging
- ✅ Error tracking
- ✅ Performance monitoring
- ✅ Health checks
- ✅ Security best practices
- ✅ Database migrations
- ✅ Seed data
- ✅ API documentation
- ✅ Type safety
- ✅ Input validation
- ✅ Comprehensive error handling

### Production Checklist

See README.md for complete deployment checklist.

## 📚 Documentation

- **README.md**: Quick start and overview
- **SETUP.md**: Detailed setup instructions
- **CLAUDE.md**: Claude Code integration guide
- **FEATURES.md**: This file - comprehensive feature list

---

Built with ❤️ using NestJS best practices
