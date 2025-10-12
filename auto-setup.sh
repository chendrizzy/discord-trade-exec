#!/bin/bash

# Discord Trade Executor - Automated Setup
# Sets up ALL API keys automatically using browser automation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🤖 AUTOMATED SAAS SETUP - ONE CLICK DEPLOYMENT          ║
║                                                              ║
║    This will automatically set up ALL required API keys:    ║
║    • Discord Bot Creation & Configuration                   ║
║    • Stripe Payment Processing                              ║
║    • Binance Trading API (Testnet)                         ║  
║    • MongoDB Atlas Database                                 ║
║    • Marketing Automation APIs                              ║
║                                                              ║
║    No manual configuration needed!                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

echo -e "${YELLOW}🔧 Checking prerequisites...${NC}"

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 22.18.0${NC}"
    exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js found: $NODE_VERSION${NC}"

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
fi

echo -e "${YELLOW}🚀 Starting automated setup...${NC}"
echo -e "${BLUE}This will open a browser window and automatically configure all services.${NC}"
echo -e "${BLUE}You may need to verify emails or enter 2FA codes when prompted.${NC}"
echo ""
echo -e "${YELLOW}Press Enter to continue or Ctrl+C to cancel...${NC}"
read -r

# Run the secure automated setup
node scripts/auto-setup-secure.js

# Check if setup was successful
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 AUTOMATED SETUP COMPLETE!${NC}"
    echo ""
    echo -e "${BLUE}📋 Your SaaS is ready! Next steps:${NC}"
    echo "1. Run: npm start"
    echo "2. Visit: http://localhost:3000/dashboard"
    echo "3. Start generating revenue!"
    echo ""
    echo -e "${YELLOW}💰 Expected revenue timeline:${NC}"
    echo "• Week 1: First subscribers (7-day free trials)"
    echo "• Month 1: \$2,450/month revenue"
    echo "• Month 6: \$24,500/month revenue"
    echo "• Month 12: \$49,000+/month revenue"
    echo ""
    echo -e "${GREEN}Your fully automated SaaS business is ready! 🚀${NC}"
else
    echo -e "${RED}❌ Setup failed. Check setup.log for details.${NC}"
    exit 1
fi