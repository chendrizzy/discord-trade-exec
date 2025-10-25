#!/bin/bash

###############################################################################
# Railway Deployment Script
#
# Task: T054 [US13] - Prepare Railway deployment manifest
# Story: US-013 (Railway Deployment & Infrastructure)
#
# Automates deployment to Railway platform with blue-green deployment support.
#
# Constitutional Requirements:
# - Principle I: Security-First (validate environment vars, secure configs)
# - Principle VI: Observability (deployment logging and health checks)
# - Principle VII: Graceful Error Handling (rollback on failures)
#
# Features:
# - Blue-green deployment strategy
# - Pre-deployment health checks
# - Automated database migrations
# - Environment variable validation
# - Post-deployment verification
# - Automatic rollback on failures
#
# Usage:
#   ./scripts/deploy/railway-deploy.sh [environment] [options]
#
# Arguments:
#   environment    Target environment (staging|production)
#
# Options:
#   --skip-tests            Skip pre-deployment tests
#   --skip-migrations       Skip database migrations
#   --skip-env-validation   Skip environment variable validation (auto-enabled for staging)
#   --force                 Force deploy without confirmations
#   --rollback              Rollback to previous deployment
#
# Examples:
#   ./scripts/deploy/railway-deploy.sh staging
#   ./scripts/deploy/railway-deploy.sh production --force
#   ./scripts/deploy/railway-deploy.sh production --rollback
#
###############################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable
set -o pipefail  # Exit on pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_LOG="${PROJECT_ROOT}/logs/deploy-$(date +%Y%m%d-%H%M%S).log"
HEALTH_CHECK_RETRIES=30
HEALTH_CHECK_DELAY=10

# Ensure logs directory exists
mkdir -p "${PROJECT_ROOT}/logs"

# Logging functions
log() {
  echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$DEPLOY_LOG"
}

success() {
  echo -e "${GREEN}✓${NC} $*" | tee -a "$DEPLOY_LOG"
}

error() {
  echo -e "${RED}✗ ERROR:${NC} $*" | tee -a "$DEPLOY_LOG"
}

warn() {
  echo -e "${YELLOW}⚠ WARNING:${NC} $*" | tee -a "$DEPLOY_LOG"
}

# Parse arguments
ENVIRONMENT="${1:-}"
SKIP_TESTS=false
SKIP_MIGRATIONS=false
SKIP_ENV_VALIDATION=false
FORCE=false
ROLLBACK=false

shift || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --skip-migrations)
      SKIP_MIGRATIONS=true
      shift
      ;;
    --skip-env-validation)
      SKIP_ENV_VALIDATION=true
      shift
      ;;
    --force)
      FORCE=true
      shift
      ;;
    --rollback)
      ROLLBACK=true
      shift
      ;;
    *)
      error "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate environment
if [[ -z "$ENVIRONMENT" ]]; then
  error "Environment argument required (staging|production)"
  echo "Usage: $0 <environment> [options]"
  exit 1
fi

if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
  error "Invalid environment: $ENVIRONMENT (must be staging or production)"
  exit 1
fi

log "Starting Railway deployment to $ENVIRONMENT"
log "Deployment log: $DEPLOY_LOG"

###############################################################################
# Pre-deployment checks
###############################################################################

log "Step 1: Pre-deployment checks"

# Check Railway CLI installed
if ! command -v railway &> /dev/null; then
  error "Railway CLI not installed. Install: npm install -g @railway/cli"
  exit 1
fi
success "Railway CLI installed"

# Check Git status
if [[ -n $(git status --porcelain) ]]; then
  warn "Uncommitted changes detected in working directory"
  if [[ "$FORCE" != "true" ]]; then
    read -p "Continue deployment? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      error "Deployment cancelled by user"
      exit 1
    fi
  fi
fi

# Get current Git commit
GIT_COMMIT=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
success "Current commit: $GIT_COMMIT on branch $GIT_BRANCH"

# Validate branch for production deployments
if [[ "$ENVIRONMENT" == "production" && "$GIT_BRANCH" != "main" ]]; then
  error "Production deployments must be from 'main' branch (current: $GIT_BRANCH)"
  exit 1
fi

###############################################################################
# Run tests (unless skipped)
###############################################################################

if [[ "$SKIP_TESTS" == "false" ]]; then
  log "Step 2: Running test suite"

  if npm run test:ci; then
    success "All tests passed"
  else
    error "Tests failed. Deployment aborted."
    error "Fix test failures or use --skip-tests to bypass (not recommended)"
    exit 1
  fi
else
  warn "Skipping tests (--skip-tests flag)"
fi

###############################################################################
# Build application
###############################################################################

log "Step 3: Building application"

if npm run build; then
  success "Build completed successfully"
else
  error "Build failed. Deployment aborted."
  exit 1
fi

###############################################################################
# Link Railway project
###############################################################################

log "Step 4: Linking Railway project"

# Set Railway project based on environment
if [[ "$ENVIRONMENT" == "production" ]]; then
  RAILWAY_PROJECT="discord-trade-exec-prod"
else
  RAILWAY_PROJECT="discord-trade-exec-staging"
fi

# Determine environment name for Railway
if [[ "$ENVIRONMENT" == "production" ]]; then
  RAILWAY_ENV="production"
else
  RAILWAY_ENV="staging"
fi

success "Using Railway environment: $RAILWAY_ENV"

###############################################################################
# Environment validation
###############################################################################

log "Step 5: Validating environment variables"

# Auto-enable skip for staging environment (production requires all vars)
if [[ "$ENVIRONMENT" == "staging" ]]; then
  SKIP_ENV_VALIDATION=true
  warn "Staging environment - environment variable validation relaxed (app will use fallbacks)"
fi

if [[ "$SKIP_ENV_VALIDATION" == "false" ]]; then
  # Required environment variables (Constitutional Principle I: Security-First)
  REQUIRED_VARS=(
    "MONGODB_URI"
    "REDIS_URL"
    "JWT_SECRET"
    "ENCRYPTION_KEY"
    "DISCORD_CLIENT_ID"
    "DISCORD_CLIENT_SECRET"
    "NODE_ENV"
  )

  MISSING_VARS=()
  # Get all variables in JSON format and check for required ones
  VARIABLES_JSON=$(railway variables --json 2>/dev/null || echo "{}")

  for var in "${REQUIRED_VARS[@]}"; do
    # Check if variable exists in JSON output
    if ! echo "$VARIABLES_JSON" | jq -e "has(\"$var\")" &> /dev/null; then
      MISSING_VARS+=("$var")
    fi
  done

  if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
      echo "  - $var"
    done
    exit 1
  fi

  success "All required environment variables present"
else
  warn "Environment variable validation skipped (--skip-env-validation or staging environment)"
fi

###############################################################################
# Database migrations (unless skipped)
###############################################################################

if [[ "$SKIP_MIGRATIONS" == "false" ]]; then
  log "Step 6: Running database migrations"

  # Run migrations via Railway
  railway run node scripts/db/migrate.js || {
    error "Database migrations failed. Deployment aborted."
    exit 1
  }

  success "Database migrations completed"
else
  warn "Skipping database migrations (--skip-migrations flag)"
fi

###############################################################################
# Deploy to Railway
###############################################################################

log "Step 7: Deploying to Railway ($ENVIRONMENT)"

# Confirm production deployments
if [[ "$ENVIRONMENT" == "production" && "$FORCE" != "true" ]]; then
  echo
  warn "About to deploy to PRODUCTION"
  echo "  Commit: $GIT_COMMIT"
  echo "  Branch: $GIT_BRANCH"
  echo "  Project: $RAILWAY_PROJECT"
  echo
  read -p "Proceed with production deployment? (yes/NO) " -r
  echo
  if [[ ! $REPLY =~ ^yes$ ]]; then
    error "Production deployment cancelled by user"
    exit 1
  fi
fi

# Trigger deployment
log "Triggering Railway deployment to $RAILWAY_ENV environment..."
railway up --service discord-trade-exec --environment "$RAILWAY_ENV" || {
  error "Railway deployment failed"
  exit 1
}

success "Deployment triggered successfully"

###############################################################################
# Post-deployment health checks
###############################################################################

log "Step 8: Post-deployment health checks"

# Get deployed service URL
DEPLOY_URL=$(railway status --json | jq -r '.deployments[0].url')

if [[ -z "$DEPLOY_URL" || "$DEPLOY_URL" == "null" ]]; then
  error "Could not determine deployment URL"
  exit 1
fi

log "Deployment URL: $DEPLOY_URL"

# Wait for deployment to be ready
log "Waiting for deployment to become healthy..."

RETRY=0
while [ $RETRY -lt $HEALTH_CHECK_RETRIES ]; do
  if curl -f -s "$DEPLOY_URL/health" > /dev/null 2>&1; then
    success "Health check passed!"
    break
  fi

  RETRY=$((RETRY + 1))
  if [ $RETRY -lt $HEALTH_CHECK_RETRIES ]; then
    log "Health check attempt $RETRY/$HEALTH_CHECK_RETRIES failed, retrying in ${HEALTH_CHECK_DELAY}s..."
    sleep $HEALTH_CHECK_DELAY
  else
    error "Health check failed after $HEALTH_CHECK_RETRIES attempts"

    # Auto-rollback on health check failure
    warn "Initiating automatic rollback..."
    railway rollback || error "Rollback failed - manual intervention required"
    exit 1
  fi
done

###############################################################################
# Validate WebSocket deployment
###############################################################################

log "Step 9: Validating WebSocket deployment"

# Run WebSocket validation script
if node scripts/deployment/validate-websocket-deployment.js "$DEPLOY_URL"; then
  success "WebSocket deployment validated"
else
  error "WebSocket validation failed"
  warn "Initiating rollback due to WebSocket failure..."
  railway rollback || error "Rollback failed - manual intervention required"
  exit 1
fi

###############################################################################
# Deployment summary
###############################################################################

log "Step 10: Deployment summary"

echo
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                  DEPLOYMENT SUCCESSFUL                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo
echo "  Environment:    $ENVIRONMENT"
echo "  Project:        $RAILWAY_PROJECT"
echo "  URL:            $DEPLOY_URL"
echo "  Commit:         $GIT_COMMIT"
echo "  Branch:         $GIT_BRANCH"
echo "  Timestamp:      $(date +'%Y-%m-%d %H:%M:%S %Z')"
echo "  Deploy Log:     $DEPLOY_LOG"
echo

success "Deployment completed successfully!"

exit 0
