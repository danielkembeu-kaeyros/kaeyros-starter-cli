#!/bin/sh
set -e

echo "========================================="
echo "Migration Script Starting..."
echo "Environment: ${ENVIRONMENT:-not set}"
echo "========================================="

echo "Checking prisma/migrations contents:"
ls -la prisma/migrations/ || echo "migrations folder not found!"

echo "Deploying migrations..."
# npx prisma migrate reset --force
npx prisma migrate deploy



echo "Seeding database..."
npx prisma db seed

echo "========================================="
echo "Migration script completed successfully"
echo "========================================="