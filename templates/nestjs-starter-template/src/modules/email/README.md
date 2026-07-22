# Email Module

A comprehensive email service module for NestJS with support for multiple email providers and templating.

## Features

- ✅ **Multi-provider support**: SMTP, AWS SES, SendGrid
- ✅ **Template system**: Handlebars-based email templates
- ✅ **Template caching**: Compiled templates are cached for performance
- ✅ **Preview mode**: Use Ethereal Email for testing in development
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Comprehensive logging**: All email operations are logged
- ✅ **Pre-built templates**: Password reset, welcome email, email verification

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Email Provider Selection
EMAIL_PROVIDER=smtp # smtp | ses | sendgrid
EMAIL_FROM=noreply@example.com
EMAIL_FROM_NAME=Your App Name
EMAIL_PREVIEW_MODE=true # Set to false in production

# SMTP Configuration (for EMAIL_PROVIDER=smtp)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000
```

### Provider-Specific Setup

#### SMTP (Gmail Example)

1. Enable 2-factor authentication on your Google account
2. Generate an app-specific password
3. Use the app password in `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
```

#### AWS SES

```env
EMAIL_PROVIDER=ses
AWS_SES_REGION=us-east-1
AWS_SES_ACCESS_KEY_ID=your-access-key
AWS_SES_SECRET_ACCESS_KEY=your-secret-key
```

#### SendGrid

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=your-sendgrid-api-key
```

## Usage

### Import the Module

```typescript
import { EmailModule } from './modules/email/email.module';

@Module({
  imports: [EmailModule],
  // ...
})
export class YourModule {}
```

### Inject the Service

```typescript
import { EmailService } from './modules/email/email.service';

@Injectable()
export class YourService {
  constructor(private readonly emailService: EmailService) {}

  async someMethod() {
    await this.emailService.sendEmail({
      to: 'user@example.com',
      subject: 'Hello',
      html: '<p>Hello World!</p>',
    });
  }
}
```

### Send Emails

#### Send Simple Email

```typescript
const result = await this.emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Welcome',
  html: '<h1>Welcome to our platform!</h1>',
  text: 'Welcome to our platform!', // Optional plain text version
});

if (result.success) {
  console.log('Email sent:', result.messageId);
  if (result.previewUrl) {
    console.log('Preview:', result.previewUrl);
  }
} else {
  console.error('Failed to send email:', result.error);
}
```

#### Send Email with Template

```typescript
const result = await this.emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Password Reset',
  template: 'password-reset',
  context: {
    userName: 'John Doe',
    resetUrl: 'https://example.com/reset?token=abc123',
  },
});
```

#### Send Password Reset Email

```typescript
const result = await this.emailService.sendPasswordResetEmail(
  'user@example.com',
  'reset-token-here',
  'John Doe', // Optional
);
```

#### Send Welcome Email

```typescript
const result = await this.emailService.sendWelcomeEmail('user@example.com', 'John Doe');
```

#### Send Email Verification

```typescript
const result = await this.emailService.sendEmailVerification(
  'user@example.com',
  'verification-token-here',
  'John Doe', // Optional
);
```

## Available Templates

### 1. Password Reset (`password-reset.hbs`)

**Context Variables:**

- `userName` - User's name
- `resetUrl` - Password reset URL
- `resetToken` - Reset token (shown as fallback)
- `expiryTime` - Token expiry time

### 2. Welcome Email (`welcome.hbs`)

**Context Variables:**

- `userName` - User's name
- `loginUrl` - Login page URL

### 3. Email Verification (`email-verification.hbs`)

**Context Variables:**

- `userName` - User's name
- `verificationUrl` - Email verification URL
- `verificationToken` - Verification token

## Creating Custom Templates

1. Create a new `.hbs` file in `src/modules/email/templates/`
2. Use Handlebars syntax for variables: `{{variableName}}`
3. Use the `{{currentYear}}` helper for dynamic year

Example template:

```html
<!DOCTYPE html>
<html>
  <body>
    <h1>Hello {{userName}}!</h1>
    <p>Your custom message here.</p>
    <p>&copy; {{currentYear}} Your Company</p>
  </body>
</html>
```

## Email Options

```typescript
interface EmailOptions {
  to: string | string[]; // Recipient(s)
  subject: string; // Email subject
  html?: string; // HTML content
  text?: string; // Plain text content
  template?: string; // Template name
  context?: Record<string, any>; // Template variables
  attachments?: EmailAttachment[]; // File attachments
  cc?: string | string[]; // CC recipients
  bcc?: string | string[]; // BCC recipients
  replyTo?: string; // Reply-to address
}
```

## Preview Mode (Development)

When `EMAIL_PREVIEW_MODE=true` or in development environment:

- Emails are sent to Ethereal Email (fake SMTP)
- Preview URLs are logged to console
- Click the preview URL to see the email in browser
- No real emails are sent

**Example log output:**

```
Email preview URL: https://ethereal.email/message/abc123
```

## Testing

```bash
npm test -- email.service.spec.ts
```

## Troubleshooting

### Gmail SMTP Issues

If you get authentication errors with Gmail:

1. Enable 2FA on your Google account
2. Create an app-specific password
3. Use the app password, not your regular password

### Connection Verification

```typescript
const isConnected = await this.emailService.verifyConnection();
if (!isConnected) {
  console.error('Email service not configured properly');
}
```

### Email Not Sending

1. Check logs for error messages
2. Verify environment variables are set correctly
3. Test connection with `verifyConnection()`
4. In production, ensure `EMAIL_PREVIEW_MODE=false`

## Security Best Practices

1. ✅ Never commit email credentials to version control
2. ✅ Use environment variables for all sensitive data
3. ✅ Use app-specific passwords for Gmail
4. ✅ Implement rate limiting on email endpoints
5. ✅ Validate email addresses before sending
6. ✅ Don't reveal if email exists (security through obscurity)

## Integration with Other Modules

The email service is already integrated with:

- **Auth Module**: Password reset emails
- Future: Email verification, welcome emails

## Advanced Usage

### Custom Handlebars Helpers

Add custom helpers in `email.service.ts`:

```typescript
private registerHandlebarsHelpers(): void {
  handlebars.registerHelper('currentYear', () => new Date().getFullYear());
  handlebars.registerHelper('uppercase', (str: string) => str.toUpperCase());
}
```

Use in templates:

```html
<p>{{uppercase userName}}</p>
```

## Performance

- Templates are compiled once and cached in memory
- Reused for subsequent emails with the same template
- Clear cache: Restart the application

## Future Enhancements

- [ ] Email queue with retry logic (Bull/BullMQ)
- [ ] Email analytics tracking
- [ ] Unsubscribe functionality
- [ ] Email scheduling
- [ ] Bulk email sending
- [ ] Email templates via database
- [ ] Rich text editor for templates
