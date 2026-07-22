# Refresh Token Security

Comprehensive guide to the secure refresh token implementation with HTTP-only cookies.

## Overview

This application implements refresh tokens using **HTTP-only secure cookies**, following security best practices to prevent XSS attacks and token theft.

## Architecture

### Token Types

**Access Token** (JWT):

- **Lifetime**: 15 minutes (default)
- **Storage**: Client-side (memory/state management)
- **Transmission**: Authorization header
- **Use**: API authentication

**Refresh Token**:

- **Lifetime**: 7 days (default)
- **Storage**: HTTP-only cookie (server-controlled)
- **Transmission**: Automatic via cookie
- **Use**: Obtaining new access tokens

## HTTP-Only Cookie Configuration

### Cookie Settings

```typescript
res.cookie('refreshToken', token, {
  httpOnly: true, // Cannot be accessed by JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'strict', // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
});
```

### Security Properties

| Property   | Value             | Purpose                                     |
| ---------- | ----------------- | ------------------------------------------- |
| `httpOnly` | true              | Prevents JavaScript access (XSS protection) |
| `secure`   | true (production) | HTTPS-only transmission                     |
| `sameSite` | strict            | CSRF attack prevention                      |
| `maxAge`   | 7 days            | Automatic expiration                        |

## Token Flow

### 1. Login/Registration

```
User authenticates
  ↓
Access token generated (15min)
  ↓
Refresh token generated (7d)
  ↓
Refresh token stored in database
  ↓
Refresh token set as HTTP-only cookie
  ↓
Access token returned in response body
```

### 2. API Request

```
Client sends request
  ↓
Include: Authorization: Bearer <access_token>
  ↓
Cookie automatically includes refresh token
  ↓
Server validates access token
  ↓
Request processed
```

### 3. Token Refresh

```
Access token expires (after 15min)
  ↓
Client calls POST /api/auth/refresh
  ↓
Refresh token read from cookie
  ↓
Validate refresh token in database
  ↓
Check: not revoked, not expired, user active
  ↓
Old refresh token revoked
  ↓
New access token generated
  ↓
New refresh token generated
  ↓
New refresh token set in cookie
  ↓
New access token returned
```

### 4. Logout

```
User logs out
  ↓
Refresh token cookie cleared
  ↓
Client discards access token
  ↓
All sessions invalidated
```

## Database Storage

### RefreshToken Model

```prisma
model RefreshToken {
  id        String    @id @default(uuid())
  token     String    @unique      // Cryptographically secure random token
  userId    String
  expiresAt DateTime               // 7 days from creation
  isRevoked Boolean   @default(false)  // Manual revocation
  isActive  Boolean   @default(true)
  createdAt DateTime  @default(now())
  user      User      @relation(...)

  @@index([userId])
  @@index([token])
  @@index([expiresAt])
}
```

### Token Generation

```typescript
async generateRefreshToken(userId: string): Promise<string> {
  // 1. Revoke all existing refresh tokens for user
  await prisma.refreshToken.updateMany({
    where: { userId, isRevoked: false },
    data: { isRevoked: true }
  });

  // 2. Generate cryptographically secure token
  const tokenValue = crypto.randomBytes(64).toString('hex');

  // 3. Calculate expiry
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  // 4. Store in database
  const tokenRecord = await prisma.refreshToken.create({
    data: {
      token: tokenValue,
      userId,
      expiresAt,
    }
  });

  // 5. Sign JWT with token ID
  return jwt.sign({ tokenId: tokenRecord.id }, refreshSecret);
}
```

## Security Features

### 1. Token Rotation

**Problem**: Refresh token theft
**Solution**: Automatic rotation

- Every refresh generates a NEW token
- Old token is immediately revoked
- If stolen token used, original user's next refresh fails
- Signals potential compromise

```typescript
async refreshTokens(refreshToken: string) {
  // Validate and decode
  const payload = jwt.verify(refreshToken, refreshSecret);

  // Find token in database
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { id: payload.tokenId }
  });

  // Revoke old token
  await prisma.refreshToken.update({
    where: { id: payload.tokenId },
    data: { isRevoked: true }
  });

  // Generate new token
  const newRefreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken: newRefreshToken };
}
```

### 2. Token Revocation

**Scenarios for Revocation**:

1. **User Logout**: Token revoked immediately
2. **Password Reset**: All tokens revoked
3. **Token Refresh**: Old token revoked
4. **Security Event**: Manual revocation possible
5. **Account Deletion**: All tokens revoked

```typescript
// Revoke all tokens for user
await prisma.refreshToken.updateMany({
  where: { userId, isRevoked: false },
  data: { isRevoked: true },
});
```

### 3. Token Validation

Multiple validation layers:

```typescript
async refreshTokens(refreshToken: string) {
  // Layer 1: JWT signature validation
  const payload = jwt.verify(refreshToken, refreshSecret);

  // Layer 2: Database lookup
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { id: payload.tokenId }
  });

  // Layer 3: Revocation check
  if (tokenRecord.isRevoked) {
    throw new UnauthorizedException('Token has been revoked');
  }

  // Layer 4: Expiration check
  if (tokenRecord.expiresAt < new Date()) {
    throw new UnauthorizedException('Token has expired');
  }

  // Layer 5: User validation
  const user = await prisma.user.findUnique({
    where: { id: tokenRecord.userId }
  });

  if (!user || !user.isActive || user.deletedAt) {
    throw new UnauthorizedException('User not found or disabled');
  }

  // All checks passed ✓
}
```

### 4. XSS Protection

**Problem**: JavaScript malware stealing tokens
**Solution**: HTTP-only cookies

```typescript
// ❌ Vulnerable (stored in localStorage)
localStorage.setItem('refreshToken', token);
const token = localStorage.getItem('refreshToken'); // Accessible to XSS

// ✅ Secure (HTTP-only cookie)
res.cookie('refreshToken', token, { httpOnly: true });
// JavaScript cannot access this cookie
```

### 5. CSRF Protection

**Problem**: Cross-site request forgery
**Solution**: SameSite cookie attribute

```typescript
res.cookie('refreshToken', token, {
  sameSite: 'strict', // Cookie not sent on cross-site requests
});
```

### 6. Man-in-the-Middle Protection

**Problem**: Token interception
**Solution**: HTTPS + Secure flag

```typescript
res.cookie('refreshToken', token, {
  secure: true, // Cookie only sent over HTTPS
});
```

## API Endpoints

### POST /api/auth/login

**Response**:

```json
{
  "user": { ... },
  "tokens": {
    "accessToken": "eyJhbGc..." // Only access token in body
  }
}
```

**Cookie Set**:

```
Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

### POST /api/auth/refresh

**Request**: No body needed (cookie sent automatically)

**Response**:

```json
{
  "accessToken": "eyJhbGc..." // New access token
}
```

**Cookie Updated**:

```
Set-Cookie: refreshToken=<new_token>; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

### POST /api/auth/logout

**Response**:

```json
{
  "message": "Logout successful"
}
```

**Cookie Cleared**:

```
Set-Cookie: refreshToken=; HttpOnly; Secure; SameSite=Strict; Max-Age=0
```

## Client Implementation

### Frontend (React/Vue/Angular)

```typescript
// Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  credentials: 'include', // IMPORTANT: Send cookies
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const { user, tokens } = await response.json();

// Store access token in memory/state (NOT localStorage)
setAccessToken(tokens.accessToken);

// Refresh token automatically sent via cookie
```

```typescript
// API Request with access token
const response = await fetch('/api/protected-route', {
  credentials: 'include', // IMPORTANT: Send cookies
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

```typescript
// Refresh token
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  credentials: 'include', // IMPORTANT: Send cookies
});

const { accessToken } = await response.json();
setAccessToken(accessToken);
```

### Axios Configuration

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  withCredentials: true, // IMPORTANT: Send cookies
});

// Request interceptor (add access token)
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor (handle 401)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);

        // Retry original request
        error.config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(error.config);
      } catch {
        // Refresh failed, logout user
        logout();
      }
    }
    return Promise.reject(error);
  },
);
```

## Security Best Practices

### ✅ DO

1. **Use HTTPS in production**
   - Secure flag only works over HTTPS
   - Prevents token interception

2. **Store access tokens in memory**
   - Use React state, Vuex, etc.
   - Never localStorage for access tokens

3. **Set appropriate token lifetimes**
   - Access: Short (15min)
   - Refresh: Longer (7 days)

4. **Rotate refresh tokens**
   - Generate new on every refresh
   - Revoke old tokens

5. **Validate on every refresh**
   - Check database
   - Verify user state
   - Check expiration

6. **Log security events**
   - Failed refreshes
   - Multiple revoked token usage
   - Unusual patterns

### ❌ DON'T

1. **Store refresh tokens in localStorage**
   - Vulnerable to XSS
   - Use HTTP-only cookies instead

2. **Send refresh tokens in request body**
   - Can be intercepted
   - Can be logged
   - Use cookies instead

3. **Use long-lived access tokens**
   - Increases attack window
   - Keep access tokens short (15min)

4. **Skip HTTPS in production**
   - Tokens sent in plain text
   - Can be intercepted

5. **Ignore token rotation**
   - Stolen tokens work indefinitely
   - Rotate on every use

## Monitoring & Alerts

### Metrics to Track

1. **Token Refresh Rate**
   - Normal: ~every 15 minutes per active user
   - Abnormal: Multiple refreshes per second

2. **Failed Refresh Attempts**
   - Invalid tokens
   - Revoked tokens
   - Expired tokens

3. **Token Lifetime**
   - Average time before revocation
   - Unusual patterns

### Security Alerts

Set up alerts for:

```typescript
// Multiple failed refresh attempts
if (failedRefreshes > 5 in 1 minute) {
  alert('Possible token theft for user: ${userId}');
  revokeAllTokens(userId);
}

// Revoked token reuse
if (revokedTokenUsed) {
  alert('Revoked token used for user: ${userId}');
  revokeAllTokens(userId);
  notifyUser(userId);
}
```

## Troubleshooting

### Refresh Not Working

1. **Check credentials flag**

   ```typescript
   fetch(url, { credentials: 'include' });
   ```

2. **Verify CORS settings**

   ```typescript
   app.enableCors({
     origin: 'http://localhost:3000',
     credentials: true, // IMPORTANT
   });
   ```

3. **Check cookie domain**
   - Frontend and API on same domain/subdomain
   - Or proper CORS configuration

### Cookie Not Set

1. **HTTPS in production**
   - Secure flag requires HTTPS
   - Disable in development

2. **SameSite issues**
   - Use 'lax' if cross-site needed
   - 'strict' prevents all cross-site

3. **Domain mismatch**
   - Cookie domain must match request domain

## Testing

### Unit Tests

```typescript
describe('Refresh Token', () => {
  it('should rotate tokens on refresh', async () => {
    const { refreshToken: token1 } = await authService.login(user);
    const { refreshToken: token2 } = await authService.refreshTokens(token1);

    expect(token1).not.toBe(token2);

    // Old token should be revoked
    await expect(authService.refreshTokens(token1)).rejects.toThrow('Token has been revoked');
  });

  it('should revoke all tokens on password reset', async () => {
    await authService.login(user);
    await authService.resetPassword(token, newPassword);

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id, isRevoked: false },
    });

    expect(tokens).toHaveLength(0);
  });
});
```

### Integration Tests

```typescript
describe('POST /api/auth/refresh', () => {
  it('should set new refresh token cookie', async () => {
    const loginRes = await request(app).post('/api/auth/login').send({ email, password });

    const cookie = loginRes.headers['set-cookie'];

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', cookie);

    expect(refreshRes.headers['set-cookie']).toBeDefined();
    expect(refreshRes.body.accessToken).toBeDefined();
  });
});
```

## Migration Guide

If migrating from localStorage to HTTP-only cookies:

### Backend Changes

1. Update login/register to set cookie
2. Update refresh to read from cookie
3. Add logout endpoint to clear cookie

### Frontend Changes

1. Remove localStorage.setItem('refreshToken')
2. Add credentials: 'include' to all fetch calls
3. Update axios withCredentials: true
4. Remove refresh token from state management
5. Update CORS configuration

## Conclusion

This implementation provides:

- ✅ XSS Protection (HTTP-only cookies)
- ✅ CSRF Protection (SameSite)
- ✅ MITM Protection (HTTPS + Secure)
- ✅ Token Rotation (Automatic)
- ✅ Database Validation (Every refresh)
- ✅ Revocation Support (Manual + automatic)
- ✅ Audit Trail (All token operations logged)

**Result**: Industry-standard secure authentication system.
