# Internationalization (i18n)

Complete multi-language support for the NestJS Starter application.

## Overview

This application supports multiple languages using `nestjs-i18n`. Currently supported languages:

- 🇬🇧 **English** (en) - Default
- 🇫🇷 **French** (fr)

## Features

- ✅ **Multiple Language Support**: English and French out of the box
- ✅ **Automatic Language Detection**: From headers, query params, or custom header
- ✅ **Translation Files**: JSON-based translation files
- ✅ **Parameter Substitution**: Dynamic values in translations
- ✅ **Fallback Language**: Defaults to English if translation missing
- ✅ **Type-Safe**: Full TypeScript support
- ✅ **Hot Reload**: Translations reload in development

## Configuration

### Environment Variables

Add to `.env`:

```env
I18N_DEFAULT_LANGUAGE=en
I18N_FALLBACK_LANGUAGE=en
I18N_SUPPORTED_LANGUAGES=en,fr
```

### Translation Files Structure

```
src/i18n/
├── en/
│   ├── common.json       # Common translations
│   ├── auth.json         # Authentication messages
│   └── email.json        # Email templates
└── fr/
    ├── common.json
    ├── auth.json
    └── email.json
```

## Language Detection

The system detects language in this order:

1. **Query Parameter**: `?lang=fr`
2. **Accept-Language Header**: `Accept-Language: fr-FR`
3. **Custom Header**: `x-lang: fr`
4. **Default**: Falls back to `en`

### Examples

```bash
# Using query parameter
curl "http://localhost:3000/api/auth/login?lang=fr"

# Using Accept-Language header
curl -H "Accept-Language: fr-FR" http://localhost:3000/api/auth/login

# Using custom header
curl -H "x-lang: fr" http://localhost:3000/api/auth/login
```

## Using Translations

### In Controllers

```typescript
import { I18nService } from 'nestjs-i18n';

@Controller('example')
export class ExampleController {
  constructor(private readonly i18n: I18nService) {}

  @Get()
  async example() {
    // Simple translation
    const message = await this.i18n.translate('common.app.welcome');
    // Returns: "Welcome to NestJS Starter" (en) or "Bienvenue sur NestJS Starter" (fr)

    // Translation with parameters
    const error = await this.i18n.translate('common.validation.minLength', {
      args: { min: 6 },
    });
    // Returns: "Must be at least 6 characters long"

    return { message };
  }
}
```

### In Services

```typescript
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class AuthService {
  constructor(private readonly i18n: I18nService) {}

  async login(email: string, password: string) {
    if (!user) {
      const message = await this.i18n.translate('auth.login.invalidCredentials');
      throw new UnauthorizedException(message);
    }
  }
}
```

### Getting Current Language

Use the `@I18nLang()` decorator:

```typescript
import { I18nLang } from '@common/decorators/i18n-lang.decorator';

@Get()
async findAll(@I18nLang() lang: string) {
  console.log(`Current language: ${lang}`); // "en" or "fr"
  // Use lang for language-specific logic
}
```

### With Context

```typescript
import { I18nContext } from 'nestjs-i18n';

@Get()
async example() {
  const i18n = I18nContext.current();
  const message = await i18n.translate('common.app.welcome');
  const lang = i18n.lang; // Current language
}
```

## Translation Files

### Common Translations (`common.json`)

General application messages, errors, and validation:

```json
{
  "app": {
    "name": "NestJS Starter",
    "welcome": "Welcome to NestJS Starter"
  },
  "errors": {
    "internalServerError": "Internal server error",
    "notFound": "Resource not found",
    "unauthorized": "Unauthorized access"
  },
  "validation": {
    "isEmail": "Must be a valid email address",
    "minLength": "Must be at least {min} characters long"
  }
}
```

### Auth Translations (`auth.json`)

Authentication-specific messages:

```json
{
  "login": {
    "success": "Login successful",
    "invalidCredentials": "Invalid email or password"
  },
  "register": {
    "success": "Registration successful",
    "emailExists": "User with this email already exists"
  },
  "emailVerification": {
    "success": "Email verified successfully!",
    "invalidCode": "Invalid verification code"
  }
}
```

### Email Translations (`email.json`)

Email template content:

```json
{
  "passwordReset": {
    "subject": "Password Reset Request",
    "greeting": "Hello {userName}",
    "button": "Reset Password"
  },
  "welcome": {
    "subject": "Welcome to NestJS Starter",
    "greeting": "Hello {userName}"
  }
}
```

## Parameter Substitution

Use `{parameterName}` in translations:

```json
{
  "greeting": "Hello {userName}!",
  "minLength": "Must be at least {min} characters",
  "between": "Must be between {min} and {max}"
}
```

Usage:

```typescript
await this.i18n.translate('greeting', { args: { userName: 'John' } });
// Returns: "Hello John!"

await this.i18n.translate('minLength', { args: { min: 6 } });
// Returns: "Must be at least 6 characters"

await this.i18n.translate('between', { args: { min: 1, max: 100 } });
// Returns: "Must be between 1 and 100"
```

## Validation Messages

### Class Validator Integration

```typescript
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class LoginDto {
  @IsEmail({}, { message: i18nValidationMessage('auth.validation.emailInvalid') })
  email: string;

  @IsNotEmpty({ message: i18nValidationMessage('auth.validation.passwordRequired') })
  @MinLength(6, {
    message: i18nValidationMessage('auth.validation.passwordMinLength'),
  })
  password: string;
}
```

## Email Templates with i18n

### Multilingual Email Service

```typescript
async sendWelcomeEmail(to: string, userName: string, lang: string = 'en') {
  // Get translations for the specified language
  const subject = await this.i18n.translate('email.welcome.subject', { lang });
  const greeting = await this.i18n.translate('email.welcome.greeting', {
    lang,
    args: { userName }
  });

  return this.sendEmail({
    to,
    subject,
    template: `welcome-${lang}`,  // Use language-specific template
    context: {
      greeting,
      userName,
      // ... other context
    }
  });
}
```

### Template Structure

Create language-specific templates:

```
templates/
├── welcome-en.hbs
├── welcome-fr.hbs
├── password-reset-en.hbs
└── password-reset-fr.hbs
```

Or use a single template with i18n context:

```handlebars
<html>
  <body>
    <h1>{{greeting}}</h1>
    <p>{{body}}</p>
    <a href='{{actionUrl}}'>{{buttonText}}</a>
  </body>
</html>
```

## Adding New Languages

### 1. Create Translation Files

```bash
mkdir src/i18n/es
touch src/i18n/es/common.json
touch src/i18n/es/auth.json
touch src/i18n/es/email.json
```

### 2. Add Translations

Copy English translations and translate:

```json
// src/i18n/es/auth.json
{
  "login": {
    "success": "Inicio de sesión exitoso",
    "invalidCredentials": "Correo o contraseña inválidos"
  }
}
```

### 3. Update Configuration

```env
I18N_SUPPORTED_LANGUAGES=en,fr,es
```

That's it! The language will be automatically available.

## Best Practices

### 1. **Organize by Feature**

Group related translations in separate files:

- `common.json` - Shared messages
- `auth.json` - Authentication
- `users.json` - User management
- `products.json` - Products
- etc.

### 2. **Use Nested Keys**

```json
{
  "user": {
    "profile": {
      "title": "User Profile",
      "edit": "Edit Profile",
      "save": "Save Changes"
    }
  }
}
```

### 3. **Consistent Naming**

```json
{
  "errors": {
    "notFound": "Not found",
    "unauthorized": "Unauthorized"
  },
  "success": {
    "created": "Created successfully",
    "updated": "Updated successfully"
  }
}
```

### 4. **Parameter Names**

Use descriptive parameter names:

```json
{
  "userGreeting": "Hello {userName}, you have {messageCount} new messages",
  "dateRange": "Showing results from {startDate} to {endDate}"
}
```

### 5. **Fallback Strategy**

Always provide English translations as fallback:

```typescript
const message = await this.i18n.translate('some.key', {
  lang: userLang,
  defaultValue: 'Fallback message',
});
```

## Testing

### Unit Tests

```typescript
describe('I18n', () => {
  let i18n: I18nService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        I18nModule.forRoot({
          /* config */
        }),
      ],
    }).compile();

    i18n = module.get<I18nService>(I18nService);
  });

  it('should translate to English', async () => {
    const message = await i18n.translate('auth.login.success', { lang: 'en' });
    expect(message).toBe('Login successful');
  });

  it('should translate to French', async () => {
    const message = await i18n.translate('auth.login.success', { lang: 'fr' });
    expect(message).toBe('Connexion réussie');
  });

  it('should use fallback for missing translation', async () => {
    const message = await i18n.translate('missing.key', {
      lang: 'fr',
      defaultValue: 'Fallback',
    });
    expect(message).toBe('Fallback');
  });
});
```

### Integration Tests

```typescript
describe('POST /api/auth/login', () => {
  it('should return French error message', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('x-lang', 'fr')
      .send({ email: 'wrong@example.com', password: 'wrong' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Email ou mot de passe invalide');
  });
});
```

## Troubleshooting

### Translation Not Working

1. **Check file exists**: Verify translation file in `src/i18n/{lang}/`
2. **Check key path**: Ensure correct nested path (e.g., `auth.login.success`)
3. **Restart server**: Translations cached, restart to reload
4. **Check language code**: Use correct language code (en, fr, not en-US)

### Language Not Detected

1. **Check header format**: `Accept-Language: fr` or `x-lang: fr`
2. **Check query param**: `?lang=fr`
3. **Check supported languages**: Verify language in `I18N_SUPPORTED_LANGUAGES`

### Missing Translations

Use fallback:

```typescript
await this.i18n.translate('key', {
  lang,
  defaultValue: 'Default message',
});
```

## API Examples

### Login with French

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "x-lang: fr" \
  -d '{
    "email": "user@example.com",
    "password": "wrongpassword"
  }'

# Response:
{
  "statusCode": 401,
  "message": "Email ou mot de passe invalide",
  "error": "Unauthorized"
}
```

### Register with French

```bash
curl -X POST http://localhost:3000/api/auth/register?lang=fr \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nouveau@example.com",
    "password": "motdepasse123"
  }'

# Response:
{
  "message": "Inscription réussie",
  "user": { ... }
}
```

## Frontend Integration

### React Example

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'x-lang': localStorage.getItem('language') || 'en'
  }
});

// Language switcher
function LanguageSwitcher() {
  const [lang, setLang] = useState('en');

  const changeLanguage = (newLang: string) => {
    setLang(newLang);
    localStorage.setItem('language', newLang);
    api.defaults.headers['x-lang'] = newLang;
  };

  return (
    <select value={lang} onChange={(e) => changeLanguage(e.target.value)}>
      <option value="en">English</option>
      <option value="fr">Français</option>
    </select>
  );
}
```

### Vue Example

```typescript
// plugins/axios.ts
import axios from 'axios';
import { useI18n } from 'vue-i18n';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
});

api.interceptors.request.use((config) => {
  const { locale } = useI18n();
  config.headers['x-lang'] = locale.value;
  return config;
});
```

## Performance

### Translation Caching

Translations are automatically cached in memory. To clear cache:

```typescript
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class CacheService {
  constructor(private readonly i18n: I18nService) {}

  async clearI18nCache() {
    // Restart app or use watch mode for hot reload
  }
}
```

### Lazy Loading

Translations are loaded at startup. For large applications, consider:

1. **Split by feature**: Separate files per feature
2. **On-demand loading**: Load translations when needed
3. **CDN hosting**: Host translation files on CDN

## Migration Guide

### From Hardcoded Strings

Before:

```typescript
throw new UnauthorizedException('Invalid credentials');
```

After:

```typescript
const message = await this.i18n.translate('auth.login.invalidCredentials');
throw new UnauthorizedException(message);
```

### From Other i18n Libraries

1. Convert translation files to JSON format
2. Update import statements
3. Replace translation function calls
4. Update DTOs to use `i18nValidationMessage`

## Summary

✅ **Fully Configured**: i18n ready with English and French
✅ **Easy to Extend**: Add new languages in minutes
✅ **Type-Safe**: Full TypeScript support
✅ **Flexible Detection**: Multiple language detection methods
✅ **Well-Organized**: Clear file structure
✅ **Production-Ready**: Tested and optimized

Add more languages, extend translations, and provide a truly global user experience!
