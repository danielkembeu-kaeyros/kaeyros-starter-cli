#!/bin/bash
# Development Docker helper script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🐳 NestJS Starter - Docker Development${NC}"
echo ""

# Check if .env exists, if not copy from .env.docker
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from .env.docker...${NC}"
    cp .env.docker .env
    echo -e "${GREEN}✅ .env file created${NC}"
fi

# Function to start services
start() {
    echo -e "${GREEN}🚀 Starting development environment...${NC}"
    docker-compose up -d
    echo ""
    echo -e "${GREEN}✅ Development environment started!${NC}"
    echo -e "${YELLOW}📝 App: http://localhost:3000${NC}"
    echo -e "${YELLOW}📚 Docs: http://localhost:3000/docs${NC}"
    echo -e "${YELLOW}🗄️  pgAdmin: http://localhost:5050 (admin@admin.com / admin)${NC}"
    echo ""
    echo -e "${GREEN}View logs with: docker-compose logs -f app${NC}"
}

# Function to stop services
stop() {
    echo -e "${YELLOW}🛑 Stopping development environment...${NC}"
    docker-compose down
    echo -e "${GREEN}✅ Development environment stopped${NC}"
}

# Function to restart services
restart() {
    echo -e "${YELLOW}🔄 Restarting development environment...${NC}"
    docker-compose restart
    echo -e "${GREEN}✅ Development environment restarted${NC}"
}

# Function to view logs
logs() {
    docker-compose logs -f app
}

# Function to run migrations
migrate() {
    echo -e "${GREEN}🔄 Running database migrations...${NC}"
    docker-compose exec app npx prisma migrate dev
    echo -e "${GREEN}✅ Migrations completed${NC}"
}

# Function to seed database
seed() {
    echo -e "${GREEN}🌱 Seeding database...${NC}"
    docker-compose exec app npx prisma db seed
    echo -e "${GREEN}✅ Database seeded${NC}"
}

# Function to reset database
reset() {
    echo -e "${RED}⚠️  This will delete all data!${NC}"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}🗑️  Resetting database...${NC}"
        docker-compose exec app npx prisma migrate reset --force
        echo -e "${GREEN}✅ Database reset${NC}"
    fi
}

# Function to open shell
shell() {
    docker-compose exec app sh
}

# Function to run tests
test() {
    echo -e "${GREEN}🧪 Running tests...${NC}"
    docker-compose exec app npm test
}

# Function to clean up
clean() {
    echo -e "${YELLOW}🧹 Cleaning up Docker resources...${NC}"
    docker-compose down -v
    docker system prune -f
    echo -e "${GREEN}✅ Cleanup completed${NC}"
}

# Main script
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    migrate)
        migrate
        ;;
    seed)
        seed
        ;;
    reset)
        reset
        ;;
    shell)
        shell
        ;;
    test)
        test
        ;;
    clean)
        clean
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|logs|migrate|seed|reset|shell|test|clean}"
        echo ""
        echo "Commands:"
        echo "  start    - Start development environment"
        echo "  stop     - Stop development environment"
        echo "  restart  - Restart development environment"
        echo "  logs     - View application logs"
        echo "  migrate  - Run database migrations"
        echo "  seed     - Seed the database"
        echo "  reset    - Reset database (WARNING: deletes all data)"
        echo "  shell    - Open shell in app container"
        echo "  test     - Run tests"
        echo "  clean    - Clean up Docker resources"
        exit 1
        ;;
esac
