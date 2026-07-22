# Docker Guide

Complete Docker setup for development and production environments.

## Overview

This application provides Docker configuration for:

- 🐳 **Development**: Hot reload, debugging, separate test DB
- 🚀 **Production**: Multi-stage builds, optimized images, security
- 🗄️ **PostgreSQL**: Containerized database
- 🔧 **pgAdmin**: Database management UI (optional)
- 🌐 **Nginx**: Reverse proxy for production (optional)

## Quick Start

### Development

```bash
# Start everything
npm run docker:dev

# Or manually
docker-compose up -d

# View logs
npm run docker:logs

# Stop
npm run docker:stop
```

Access:

- **API**: http://localhost:3000
- **Docs**: http://localhost:3000/docs
- **pgAdmin**: http://localhost:5050 (admin@admin.com / admin)

### Production

```bash
# Build production image
npm run docker:build:prod

# Start production stack
npm run docker:prod

# Stop
npm run docker:prod:stop
```

For complete documentation, see the full Docker guide in this file.
