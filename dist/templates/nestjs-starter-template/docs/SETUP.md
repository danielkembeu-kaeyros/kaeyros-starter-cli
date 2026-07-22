# Setup Guide

This guide will walk you through setting up the NestJS Enterprise Starter from scratch.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** >= 18.0.0 ([Download](https://nodejs.org/))
- **npm** >= 9.0.0 (comes with Node.js)
- **PostgreSQL** >= 13 ([Download](https://www.postgresql.org/download/))
- **Git** (optional, for cloning)

## Step 1: Clone or Download

```bash
# If using git
git clone <repository-url>
cd nestjs-starter

# Or download and extract the ZIP
```

## Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:

- NestJS core and platform
- Prisma and Prisma Client
- Authentication packages (JWT, Passport)
- Winston for logging
- Sentry for monitoring
- And more...

## Step 3: Database Setup

### Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE nestjs_starter;

# Create user (optional)
CREATE USER nestjs_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE nestjs_starter TO nestjs_user;

# Exit psql
\q
```

### Configure Environment Variables

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and update the following:

   ```env
   # Database
   DATABASE_URL="postgresql://nestjs_user:your_password@localhost:5432/nestjs_starter?schema=public"

   # Application
   APP_ENV=development
   PORT=3000

   # JWT Secrets (CHANGE THESE!)
   JWT_SECRET=your-super-secret-jwt-key-change-this
   JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this

   # Sentry (optional - for monitoring)
   SENTRY_DSN=your-sentry-dsn-here
   SENTRY_ENABLED=true
   ```

## Step 4: Generate Prisma Client and Run Migrations

```bash
# Generate Prisma Client
npm run db:generate

# Run database migrations
npm run db:migrate

# The migration will prompt you to name it, e.g., "initial"
```

## Step 5: Seed the Database

```bash
npm run db:seed
```

This will create:

- Default permissions (users:_, roles:_)
- ADMIN role (with all permissions)
- USER role (with read permissions only)
- Admin user (admin@example.com / admin123)

**⚠️ Important**: Change the admin password after first login!

## Step 6: Start the Development Server

```bash
npm run start:dev
```

The server should start on `http://localhost:3000` (or your configured port).

You should see output similar to:

```
Application is running on: http://localhost:3000/api
Environment: development
Swagger documentation: http://localhost:3000/docs
Database connected successfully
```

## Step 7: Test the Installation

### Using Swagger UI

1. Open your browser and navigate to `http://localhost:3000/docs`
2. Try the `/api/auth/login` endpoint with:
   ```json
   {
     "email": "admin@example.com",
     "password": "admin123"
   }
   ```
3. You should receive an access token and refresh token

### Using cURL

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'

# Get profile (replace YOUR_ACCESS_TOKEN with the token from login)
curl -X GET http://localhost:3000/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Health check (no auth required)
curl http://localhost:3000/api/health
```

## Step 8: Configure Monitoring (Optional)

### Sentry Setup

1. Create a free account at [sentry.io](https://sentry.io)
2. Create a new project (Node.js)
3. Copy your DSN
4. Update `.env`:
   ```env
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   SENTRY_ENABLED=true
   ```

Sentry will only run in `development` and `staging` environments (controlled by `APP_ENV`).

## Step 9: Set Up Logging

Logs are automatically configured with multiple transports:

### Console Logs

- Enabled in development
- Disabled in test mode
- Colored output with timestamps

### File Logs

Enable file logging in `.env`:

```env
LOG_FILE_ENABLED=true
LOG_FILE_PATH=logs/application.log
```

Logs will be written to:

- `logs/application-YYYY-MM-DD.log` - All logs
- `logs/error-YYYY-MM-DD.log` - Error logs only

### Database Logs

Enable database logging in `.env`:

```env
LOG_DB_ENABLED=true
```

Only warnings and errors will be stored in the database to prevent bloat.

## Troubleshooting

### Database Connection Issues

**Error**: "Can't reach database server"

**Solution**:

1. Ensure PostgreSQL is running: `sudo service postgresql status`
2. Verify connection string in `.env`
3. Check database user permissions
4. Test connection: `psql -U your_user -d nestjs_starter`

### Migration Failures

**Error**: "Migration failed"

**Solution**:

1. Drop and recreate database (development only):
   ```sql
   DROP DATABASE nestjs_starter;
   CREATE DATABASE nestjs_starter;
   ```
2. Run migrations again: `npm run db:migrate`

### Port Already in Use

**Error**: "Port 3000 is already in use"

**Solution**:

1. Change port in `.env`:
   ```env
   PORT=3001
   ```
2. Or kill the process using port 3000:

   ```bash
   # Linux/Mac
   lsof -ti:3000 | xargs kill -9

   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

### Prisma Client Generation Issues

**Error**: "Prisma Client not generated"

**Solution**:

```bash
npx prisma generate
```

## Next Steps

Now that your setup is complete:

1. **Change Admin Password**: Login and update the default admin password
2. **Explore the Code**: Check out the modular structure in `src/`
3. **Read the Docs**: Review `README.md` and `CLAUDE.md`
4. **Create Your First Module**: Use NestJS CLI:
   ```bash
   nest generate module features/your-feature
   nest generate controller features/your-feature
   nest generate service features/your-feature
   ```
5. **Set Up Git Hooks**: If using version control:
   ```bash
   npx husky install
   ```

## Development Tools

### Prisma Studio

Visual database browser:

```bash
npm run db:studio
```

### TypeScript Checking

Run type checking without building:

```bash
npm run typecheck
```

### Linting and Formatting

```bash
npm run lint    # Lint and fix
npm run format  # Format code
```

## Production Deployment

See `README.md` for the production deployment checklist.

## Support

If you encounter issues:

1. Check this guide and `README.md`
2. Review error logs in `logs/` directory
3. Check Sentry dashboard (if configured)
4. Open an issue on GitHub

---

Happy coding! 🚀
