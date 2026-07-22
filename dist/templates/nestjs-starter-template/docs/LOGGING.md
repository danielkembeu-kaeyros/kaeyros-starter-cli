# Logging System

Comprehensive logging documentation for the NestJS Starter application with Winston, S3 integration, and level-based rotation.

## Table of Contents

- [Overview](#overview)
- [Log Levels](#log-levels)
- [Log Storage Strategy](#log-storage-strategy)
- [S3 Integration](#s3-integration)
- [Accessing Logs](#accessing-logs)
- [Configuration](#configuration)
- [Best Practices](#best-practices)

## Overview

The application uses **Winston** for logging with a sophisticated multi-level logging strategy:

- ✅ **Size-based rotation** (20-50MB per file)
- ✅ **Level-based separation** (error, warn, info, combined)
- ✅ **Automatic S3 upload** on log rotation
- ✅ **Admin API endpoints** for log access
- ✅ **Structured JSON logging**
- ✅ **Exception and rejection handling**

### Why This Approach?

**Performance**: Files are kept small (20-50MB) for fast read/write operations
**Storage**: Automatic cleanup (7-30 days retention)
**Debugging**: Separate files by severity for faster troubleshooting
**Compliance**: S3 archival for audit and compliance requirements

## Log Levels

The application supports the following log levels:

| Level          | Description                  | File                                  | Max Size | Retention | Use Case                           |
| -------------- | ---------------------------- | ------------------------------------- | -------- | --------- | ---------------------------------- |
| **error**      | Error-level logs only        | `logs/error-YYYY-MM-DD.log[.gz]`      | 20MB     | 30 days   | Critical errors, exceptions        |
| **warn**       | Warning-level logs only      | `logs/warn-YYYY-MM-DD.log[.gz]`       | 20MB     | 14 days   | Potential issues, deprecated usage |
| **info**       | Info-level logs only         | `logs/info-YYYY-MM-DD.log[.gz]`       | 50MB     | 7 days    | General application flow           |
| **combined**   | All log levels               | `logs/combined-YYYY-MM-DD.log[.gz]`   | 50MB     | 7 days    | Complete debugging context         |
| **exceptions** | Uncaught exceptions          | `logs/exceptions-YYYY-MM-DD.log[.gz]` | 20MB     | 30 days   | Process crashes                    |
| **rejections** | Unhandled promise rejections | `logs/rejections-YYYY-MM-DD.log[.gz]` | 20MB     | 30 days   | Promise errors                     |

### Log Level Priority

```
error (highest) → warn → info → debug (lowest)
```

When you set log level to `info`, it will log `info`, `warn`, and `error` messages (but not `debug`).

## Log Storage Strategy

### File Naming Convention

```
logs/{level}-{date}.log[.gz]

Examples:
- logs/error-2024-01-15.log       (current day)
- logs/error-2024-01-14.log.gz    (rotated, compressed)
- logs/warn-2024-01-15.log
- logs/info-2024-01-15.log
- logs/combined-2024-01-15.log
```

### Rotation Strategy

**Size-Based Rotation**:

- Files rotate when they reach the configured size limit (20-50MB)
- Rotated files are automatically gzipped (70-90% compression)
- Multiple rotations can happen in a single day for high-traffic apps

**Time-Based Pattern**:

- Daily date pattern (`YYYY-MM-DD`)
- Files include the date for easy identification

**Example**: High-traffic error logs

```
logs/error-2024-01-15-01.log.gz  (first rotation)
logs/error-2024-01-15-02.log.gz  (second rotation)
logs/error-2024-01-15-03.log.gz  (third rotation)
logs/error-2024-01-15.log        (current, active)
```

### Retention Policy

- **Error logs**: 30 days (highest priority)
- **Warn logs**: 14 days
- **Info logs**: 7 days
- **Combined logs**: 7 days
- **Exceptions/Rejections**: 30 days

Old files are automatically deleted after the retention period.

## S3 Integration

### Automatic Upload

When a log file rotates (reaches size limit), it's **automatically uploaded to S3**:

```typescript
// winston.config.ts
transport.on('rotate', (oldFilename, _newFilename) => {
  awsService
    .uploadFromFile(oldFilename)
    .catch((err) => console.error(`Failed to upload ${level} log to S3:`, err));
});
```

### S3 Key Structure

```
logs/{level}-{date}.log[.gz]

Examples in S3:
s3://your-bucket/logs/error-2024-01-15.log.gz
s3://your-bucket/logs/warn-2024-01-15.log.gz
s3://your-bucket/logs/info-2024-01-15.log.gz
```

### Benefits

- ✅ **Durability**: 99.999999999% (11 9's) durability in S3
- ✅ **Offsite backup**: Logs survive server failures
- ✅ **Cost-effective**: S3 Standard-IA or Glacier for old logs
- ✅ **Compliance**: Meet audit requirements
- ✅ **Scalability**: No local disk space issues

## Accessing Logs

### API Endpoints (Admin Only)

All log endpoints require **ADMIN role** and **JWT authentication**.

#### 1. Get Available Log Levels

```bash
GET /api/logs/levels
Authorization: Bearer {admin_token}
```

**Response**:

```json
{
  "levels": ["error", "warn", "info", "combined", "exceptions", "rejections"],
  "description": {
    "error": "Only error-level logs",
    "warn": "Only warning-level logs",
    "info": "Only info-level logs",
    "combined": "All log levels combined",
    "exceptions": "Uncaught exceptions",
    "rejections": "Unhandled promise rejections"
  }
}
```

#### 2. Get All Log Levels for a Date

```bash
GET /api/logs/{date}
Authorization: Bearer {admin_token}

# Example
GET /api/logs/2024-01-15
```

**Response**:

```json
{
  "date": "2024-01-15",
  "logs": {
    "error": {
      "compressed": "https://s3.amazonaws.com/.../error-2024-01-15.log.gz?...",
      "uncompressed": "https://s3.amazonaws.com/.../error-2024-01-15.log?..."
    },
    "warn": {
      "compressed": "https://s3.amazonaws.com/.../warn-2024-01-15.log.gz?..."
    },
    "info": { ... },
    "combined": { ... },
    "exceptions": { ... },
    "rejections": { ... }
  },
  "note": "Links expire in 1 hour. If a link returns 404, the log file does not exist."
}
```

#### 3. Get Specific Log Level for a Date

```bash
GET /api/logs/{level}/{date}
Authorization: Bearer {admin_token}

# Examples
GET /api/logs/error/2024-01-15
GET /api/logs/warn/2024-01-15
GET /api/logs/combined/2024-01-15
```

**Response**:

```json
{
  "date": "2024-01-15",
  "level": "error",
  "urls": {
    "compressed": "https://s3.amazonaws.com/.../error-2024-01-15.log.gz?...",
    "uncompressed": "https://s3.amazonaws.com/.../error-2024-01-15.log?..."
  },
  "note": "Links expire in 1 hour..."
}
```

### Using Presigned URLs

1. Call the API endpoint to get presigned URLs
2. Click or download from the URL within 1 hour
3. URLs expire after 1 hour for security

**Example with curl**:

```bash
# Get presigned URL
RESPONSE=$(curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.example.com/api/logs/error/2024-01-15)

# Extract compressed URL
URL=$(echo $RESPONSE | jq -r '.urls.compressed')

# Download log file
curl "$URL" -o error-2024-01-15.log.gz

# View logs
gunzip error-2024-01-15.log.gz
cat error-2024-01-15.log | jq '.'
```

### Local File Access (Development)

In development, logs are stored locally in the `logs/` directory:

```bash
# View current error logs
tail -f logs/error-*.log

# View all logs (combined)
tail -f logs/combined-*.log

# Search for specific error
grep "PaymentFailed" logs/error-*.log

# View compressed logs
gunzip -c logs/error-2024-01-15.log.gz | less

# Count errors today
cat logs/error-$(date +%Y-%m-%d).log | wc -l
```

## Configuration

### Environment Variables

```bash
# .env
LOG_LEVEL=info              # Minimum log level (debug, info, warn, error)
LOG_FILE_ENABLED=true       # Enable file logging
LOG_DB_ENABLED=false        # Enable database logging (warn+ only)

# AWS S3 (for log uploads)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
AWS_S3_BUCKET=your-logs-bucket
```

### Winston Configuration

The logging configuration is in `src/common/logging/winston.config.ts`:

```typescript
// Customize log levels
export const winstonConfig = (configService, prisma, awsService) => ({
  level: configService.get('logging.level') || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata(),
  ),
  transports: [
    // Console, File, S3, Database
  ],
});
```

### Adjusting Rotation Settings

To change rotation limits, edit `src/common/logging/winston.config.ts`:

```typescript
// Example: Increase error log retention to 60 days
createRotateTransport('logs/error-%DATE%.log', 'error', '20m', '60d');

// Example: Reduce info log size to 20MB
createRotateTransport('logs/info-%DATE%.log', 'info', '20m', '7d');
```

## Best Practices

### 1. Use Appropriate Log Levels

```typescript
import { Logger } from '@nestjs/common';

export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  async processPayment(orderId: string, amount: number) {
    // INFO: Normal flow
    this.logger.log(`Processing payment for order ${orderId}: $${amount}`);

    try {
      const result = await this.paymentGateway.charge(amount);

      // INFO: Success
      this.logger.log(`Payment successful: ${result.transactionId}`);

      return result;
    } catch (error) {
      // ERROR: Failures
      this.logger.error(`Payment failed for order ${orderId}`, error.stack);
      throw error;
    }
  }

  async checkInventory(productId: string) {
    const stock = await this.getStock(productId);

    // WARN: Potential issues
    if (stock < 10) {
      this.logger.warn(`Low stock alert: Product ${productId} has ${stock} units`);
    }

    return stock;
  }
}
```

### 2. Include Context

```typescript
// ❌ Bad: No context
this.logger.error('Payment failed');

// ✅ Good: Rich context
this.logger.error('Payment failed', {
  orderId: order.id,
  userId: user.id,
  amount: order.total,
  gateway: 'stripe',
  errorCode: error.code,
  stack: error.stack,
});
```

### 3. Structured Logging

Logs are stored in JSON format for easy parsing:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "error",
  "message": "Payment failed",
  "context": "PaymentService",
  "metadata": {
    "orderId": "ord_123",
    "userId": "usr_456",
    "amount": 99.99,
    "gateway": "stripe",
    "errorCode": "card_declined"
  },
  "stack": "Error: Card declined\n    at ..."
}
```

This allows for easy searching and analysis:

```bash
# Find all payment errors
cat logs/error-*.log | jq 'select(.message | contains("Payment"))'

# Find errors for specific user
cat logs/error-*.log | jq 'select(.metadata.userId == "usr_456")'

# Count errors by type
cat logs/error-*.log | jq -r '.metadata.errorCode' | sort | uniq -c
```

### 4. Avoid Logging Sensitive Data

```typescript
// ❌ Bad: Logging passwords, tokens
this.logger.log(`User login: ${email} with password ${password}`);
this.logger.log(`API call with token: ${authToken}`);

// ✅ Good: Redact sensitive data
this.logger.log(`User login: ${email}`);
this.logger.log(`API call authenticated`);
```

### 5. Log Request IDs

Use the request ID for distributed tracing:

```typescript
// Auto-injected by LoggingInterceptor
this.logger.log(`Processing request`, { requestId: context.requestId });
```

### 6. Monitor Log Volume

```bash
# Check log file sizes
du -sh logs/*

# Count log entries per level
wc -l logs/*.log

# Monitor real-time error rate
watch -n 5 'wc -l logs/error-*.log'
```

## Troubleshooting

### Issue: Logs not uploading to S3

**Check**:

1. AWS credentials are configured correctly
2. S3 bucket exists and has write permissions
3. `LOG_FILE_ENABLED=true` in environment
4. Check winston config logs for upload errors

**Debug**:

```bash
# Enable verbose AWS logging
export AWS_SDK_LOAD_CONFIG=1
export AWS_SDK_LOG_LEVEL=debug
```

### Issue: Log files growing too large

**Solution**: Reduce `maxSize` in winston config:

```typescript
// Change from 50m to 20m
createRotateTransport('logs/info-%DATE%.log', 'info', '20m', '7d');
```

### Issue: Running out of disk space

**Solutions**:

1. Reduce retention days
2. Ensure S3 upload is working (can delete local files after upload)
3. Add cron job to clean old logs:

```bash
# crontab -e
0 2 * * * find /app/logs -name "*.log.gz" -mtime +7 -delete
```

### Issue: Can't access logs via API

**Check**:

1. User has ADMIN role
2. JWT token is valid
3. Date format is correct (YYYY-MM-DD)
4. S3 bucket permissions allow GetObject

## Advanced Usage

### Custom Log Transports

Add custom transports in `winston.config.ts`:

```typescript
import { Logtail } from '@logtail/winston';

// Send logs to Logtail/Datadog/etc
transports.push(
  new Logtail({
    sourceToken: process.env.LOGTAIL_TOKEN,
  }),
);
```

### Log Aggregation Services

For production, consider:

- **AWS CloudWatch**: Native AWS integration
- **Datadog**: Comprehensive monitoring + logs
- **Logtail**: Modern log management
- **Sentry**: Error tracking + logging

### Performance Monitoring

Use logs to track performance:

```typescript
const start = Date.now();
await this.expensiveOperation();
const duration = Date.now() - start;

this.logger.log(`Operation completed in ${duration}ms`, {
  operation: 'expensiveOperation',
  duration,
});
```

## Summary

✅ **Level-based logging** (error, warn, info, combined, exceptions, rejections)
✅ **Size-based rotation** (20-50MB files)
✅ **Automatic S3 archival** on rotation
✅ **Admin API endpoints** with presigned URLs
✅ **Structured JSON format** for easy parsing
✅ **Automatic retention** (7-30 days)
✅ **Comprehensive test coverage** (87.5%+ on logs module)

**Quick Start**:

```bash
# View logs locally
tail -f logs/combined-*.log

# Get logs via API
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.example.com/api/logs/error/2024-01-15

# Search logs
cat logs/error-*.log | jq 'select(.message | contains("Payment"))'
```

For questions or improvements, see the [Contributing Guide](../CONTRIBUTING.md).
