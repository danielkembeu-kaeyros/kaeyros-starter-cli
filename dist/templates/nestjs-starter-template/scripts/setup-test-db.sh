#!/bin/bash

echo "Setting up test database..."

# Load environment variables from .env file if DATABASE_URL_TEST is not set
if [ -z "$DATABASE_URL_TEST" ] && [ -f .env ]; then
  export $(grep -v '^#' .env | grep DATABASE_URL_TEST | xargs)
fi

# Load from .env.local if it exists and DATABASE_URL_TEST is still not set
if [ -z "$DATABASE_URL_TEST" ] && [ -f .env.local ]; then
  export $(grep -v '^#' .env.local | grep DATABASE_URL_TEST | xargs)
fi

# Check if DATABASE_URL_TEST is set
if [ -z "$DATABASE_URL_TEST" ]; then
  echo "❌ ERROR: DATABASE_URL_TEST environment variable is not set"
  echo "Please set DATABASE_URL_TEST in your .env or .env.local file"
  echo "Example: DATABASE_URL_TEST=\"postgresql://user:password@localhost:5432/nestjs_starter_test?schema=public\""
  exit 1
fi

# Use DATABASE_URL_TEST for migrations
export DATABASE_URL="$DATABASE_URL_TEST"

echo "Using test database: $(echo $DATABASE_URL_TEST | sed 's/:[^:@]*@/:****@/')"

# Run migrations
npx prisma migrate deploy

echo "Test database setup complete!"
