#!/bin/bash

# Broker Integrations - Staging Deployment Script
# Automates Phase 1.1: Deploy to Staging Environment

set -e  # Exit on error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STAGING_ENV=${STAGING_ENV:-"staging"}
DEPLOYMENT_LOG="deployment-$(date +%Y%m%d-%H%M%S).log"

echo "================================="
echo "Broker Integrations - Staging Deployment"
echo "================================="
echo ""

# Check prerequisites
echo "⏳ Checking prerequisites..."

if [ ! -f ".env.staging" ]; then
    echo -e "${RED}✗ .env.staging not found${NC}"
    echo "Please create .env.staging with required environment variables"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}✗ Docker Compose not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Load environment variables
echo "⏳ Loading staging environment variables..."
export $(cat .env.staging | grep -v '^#' | xargs)
export NODE_ENV=staging
echo -e "${GREEN}✓ Environment loaded${NC}"
echo ""

# Database backup
echo "⏳ Backing up staging database..."
BACKUP_ID="staging-$(date +%Y%m%d-%H%M%S)"
npm run db:backup:staging -- --backup-id=$BACKUP_ID 2>&1 | tee -a $DEPLOYMENT_LOG
echo -e "${GREEN}✓ Database backed up: $BACKUP_ID${NC}"
echo ""

# Run database migrations
echo "⏳ Running database migrations..."
npm run db:migrate:staging 2>&1 | tee -a $DEPLOYMENT_LOG
echo -e "${GREEN}✓ Migrations complete${NC}"
echo ""

# Build Docker images
echo "⏳ Building Docker images..."
docker-compose -f docker-compose.staging.yml build 2>&1 | tee -a $DEPLOYMENT_LOG
echo -e "${GREEN}✓ Images built${NC}"
echo ""

# Stop existing containers
echo "⏳ Stopping existing containers..."
docker-compose -f docker-compose.staging.yml down 2>&1 | tee -a $DEPLOYMENT_LOG
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# Start new containers
echo "⏳ Starting new containers..."
docker-compose -f docker-compose.staging.yml up -d 2>&1 | tee -a $DEPLOYMENT_LOG
echo -e "${GREEN}✓ Containers started${NC}"
echo ""

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Health check
echo "⏳ Running health checks..."
HEALTH_CHECK_PASSED=false
for i in {1..30}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        HEALTH_CHECK_PASSED=true
        break
    fi
    echo "  Attempt $i/30..."
    sleep 2
done

if [ "$HEALTH_CHECK_PASSED" = true ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "Rolling back deployment..."
    docker-compose -f docker-compose.staging.yml down
    npm run db:restore:staging -- --backup-id=$BACKUP_ID
    exit 1
fi

echo ""

# Verify services
echo "⏳ Verifying services..."
echo ""
docker-compose -f docker-compose.staging.yml ps

echo ""
echo "================================="
echo -e "${GREEN}✓ Deployment successful!${NC}"
echo "================================="
echo ""
echo "Deployment log: $DEPLOYMENT_LOG"
echo "Backup ID: $BACKUP_ID"
echo ""
echo "Next steps:"
echo "1. Test with paper trading accounts (scripts/deployment/test-paper-trading.sh)"
echo "2. Validate order types (npm run test:order-types:staging)"
echo "3. Stress test rate limiting (npm run test:rate-limit:staging)"
echo ""
echo "View logs: docker-compose -f docker-compose.staging.yml logs -f"
echo "Stop services: docker-compose -f docker-compose.staging.yml down"
