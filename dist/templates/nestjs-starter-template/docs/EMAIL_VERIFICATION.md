# Email Verification System

Complete email verification system with 5-digit verification codes.

## Overview

After registration, users receive a 5-digit verification code via email. They must verify their email to confirm account ownership and unlock full access.

## Features

- ✅ **5-Digit Codes**: Easy to type, secure verification codes
- ✅ **24-Hour Expiry**: Codes expire after 24 hours
- ✅ **One-Time Use**: Codes can only be used once
- ✅ **Code Invalidation**: Previous codes invalidated when requesting new one
- ✅ **Automatic on Registration**: Verification code sent immediately
- ✅ **Resend Capability**: Users can request new codes
- ✅ **Database Tracking**: All verification attempts logged

## Database Schema

### User Model Updates

```prisma
model User {
  // ... existing fields
  isEmailVerified    Boolean             @default(false)
  emailVerifiedAt    DateTime?
  emailVerifications EmailVerification[]
}
```

### Email Verification Model

```prisma
model EmailVerification {
  id        String    @id @default(uuid())
  userId    String
  code      String    // 5-digit code
  expiresAt DateTime  // 24 hours from creation
  isUsed    Boolean   @default(false)
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  user      User      @relation(...)

  @@index([userId])
  @@index([code])
  @@index([expiresAt])
}
```

## User Flow

### 1. Registration

```
User registers
  ↓
Account created (isEmailVerified: false)
  ↓
5-digit code generated
  ↓
Email sent with verification code
  ↓
User logs in (access granted but email unverified)
```

### 2. Email Verification

```
User receives code via email
  ↓
User submits code via /api/auth/verify-email
  ↓
System validates code
  ↓
User.isEmailVerified = true
  ↓
User.emailVerifiedAt = now()
  ↓
Code marked as used
```

### 3. Resend Code

```
User requests new code
  ↓
Previous active codes invalidated
  ↓
New 5-digit code generated
  ↓
New email sent
```

## API Endpoints

### Verify Email (POST /api/auth/verify-email)

**Authentication**: Required (JWT)

**Request Body**:

```json
{
  "code": "12345"
}
```

**Success Response (200)**:

```json
{
  "message": "Email verified successfully! You can now access all features."
}
```

**Error Responses**:

- `400`: Invalid or expired code
- `401`: Not authenticated
- `404`: User not found

**Example**:

```bash
curl -X POST http://localhost:3000/api/auth/verify-email \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "12345"}'
```

### Resend Verification Code (POST /api/auth/resend-verification)

**Authentication**: Required (JWT)

**Request Body**: None

**Success Response (200)**:

```json
{
  "message": "Verification code has been sent to your email"
}
```

**Error Responses**:

- `401`: Not authenticated
- `404`: User not found

**Example**:

```bash
curl -X POST http://localhost:3000/api/auth/resend-verification \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## Code Generation

Verification codes are 5 random digits (10000-99999):

```typescript
private generateVerificationCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}
```

## Security Features

### 1. Code Expiration

- Codes expire after 24 hours
- Expired codes are automatically invalidated
- Users receive clear error messages

### 2. One-Time Use

- Codes can only be used once
- After successful verification, code is marked as used
- Used codes cannot be reused

### 3. Code Invalidation

- Requesting new code invalidates all previous active codes
- Prevents code spam/abuse
- User always has only one valid code

### 4. Database Security

- Codes stored in database (not just email)
- All verification attempts tracked
- Audit trail for security monitoring

### 5. User State Validation

- Checks if user exists
- Validates user is active
- Prevents verification of deleted accounts

## Email Template

Verification emails include:

- User's name (if provided)
- Large, centered 5-digit code
- Clear instructions
- Expiry warning (24 hours)
- Professional styling

Example:

```
Hello John!

Your verification code is:

  12345

Enter this code to verify your email address.

Important: This code expires in 24 hours.
```

## Validation Rules

### Code Format

- **Length**: Exactly 5 digits
- **Pattern**: `^\d{5}$`
- **Type**: String (not number, to preserve leading zeros)

### DTO Validation

```typescript
class VerifyEmailDto {
  @Length(5, 5)
  @Matches(/^\d{5}$/)
  code: string;
}
```

## Implementation Guide

### 1. Check if Email is Verified

```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
});

if (!user.isEmailVerified) {
  throw new ForbiddenException('Please verify your email first');
}
```

### 2. Require Verification for Specific Routes

Create a decorator:

```typescript
// @common/decorators/verified-email.decorator.ts
export const RequireVerifiedEmail = () => SetMetadata('requireVerifiedEmail', true);
```

Create a guard:

```typescript
// @common/guards/verified-email.guard.ts
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
    });

    if (!user.isEmailVerified) {
      throw new ForbiddenException('Email verification required');
    }

    return true;
  }
}
```

Usage:

```typescript
@UseGuards(JwtAuthGuard, VerifiedEmailGuard)
@Get('premium-feature')
async premiumFeature() {
  // Only accessible to verified users
}
```

## Testing

### Manual Testing

1. Register a new user
2. Check email for verification code
3. Submit code to /api/auth/verify-email
4. Verify user.isEmailVerified = true

### Unit Tests

```typescript
describe('Email Verification', () => {
  it('should generate 5-digit code', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^\d{5}$/);
  });

  it('should verify email with valid code', async () => {
    const result = await authService.verifyEmail(userId, '12345');
    expect(result.message).toContain('verified successfully');
  });

  it('should reject invalid code', async () => {
    await expect(authService.verifyEmail(userId, '99999')).rejects.toThrow(
      'Invalid verification code',
    );
  });

  it('should reject expired code', async () => {
    // Create expired code
    // Test rejection
  });
});
```

## Monitoring

### Metrics to Track

1. **Verification Rate**: % of users who verify within 24h
2. **Code Resend Rate**: How often users request new codes
3. **Failed Attempts**: Invalid code submissions
4. **Time to Verify**: How long users take to verify

### Logs

All verification operations are logged:

```
Email verification code generated for user: user@example.com
Email verified successfully for user: user@example.com
Failed verification attempt for user: user@example.com (invalid code)
```

## Troubleshooting

### Code Not Received

1. Check spam folder
2. Verify email service is configured
3. Check logs for email sending errors
4. Use resend verification endpoint

### Code Invalid

1. Check if code expired (24h limit)
2. Verify correct code (no typos)
3. Request new code
4. Check if code was already used

### Already Verified

If user tries to verify again:

- System returns "Email is already verified"
- No error thrown
- User can proceed normally

## Best Practices

### For Development

1. Use email preview mode to see codes
2. Check console logs for verification codes
3. Use test email services (Ethereal Email)

### For Production

1. Enable real email provider
2. Set EMAIL_PREVIEW_MODE=false
3. Monitor verification rates
4. Set up alerts for failed emails
5. Consider SMS as backup verification method

## Future Enhancements

- [ ] SMS verification as alternative
- [ ] Magic link verification (in addition to code)
- [ ] Configurable code length
- [ ] Configurable expiry time
- [ ] Rate limiting on resend
- [ ] Analytics dashboard
- [ ] Email verification required middleware
- [ ] Verification reminder emails
