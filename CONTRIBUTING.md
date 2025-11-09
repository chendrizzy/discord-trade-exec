# Contributing to Discord Trade Executor

Thank you for your interest in contributing to Discord Trade Executor! This document provides guidelines and instructions for contributing to the project.

## 📜 Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors. We pledge to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Trolling, insulting/derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission
- Other conduct which could reasonably be considered inappropriate in a professional setting

## 🚀 Getting Started

### Prerequisites

- Node.js >= 22.11.0
- MongoDB Atlas account (free tier works)
- Redis instance (required for queues/caching)
- Discord bot account
- Alpaca brokerage account (free sandbox available)

### Development Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/yourusername/discord-trade-exec.git
cd discord-trade-exec

# 2. Install dependencies
npm install

# 3. Copy environment template
cp .env.example .env

# 4. Configure your .env file with credentials
# (See .env.example for required variables)

# 5. Run database migrations
npm run db:migrate

# 6. Start development servers
npm run dev          # Backend server
npm run dev:dashboard  # Frontend dashboard (separate terminal)
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test suite
npm test -- tests/unit/services/TradeExecutionService.test.js

# Run integration tests only
npm test -- tests/integration
```

### Code Quality

```bash
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Run type checks (if using TypeScript)
npm run typecheck
```

## 🔧 Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bugfix-name
```

**Branch Naming Convention:**
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test improvements
- `chore/` - Maintenance tasks

### 2. Make Changes

- Write clean, readable code
- Follow existing code style and patterns
- Add comments for complex logic
- Update documentation as needed
- Ensure tests pass locally

### 3. Write Tests

**All new features must include tests.** We aim for:
- Unit tests for business logic
- Integration tests for API endpoints
- E2E tests for critical user flows

**Test Coverage Requirements:**
- Minimum 80% coverage for new code
- 100% coverage for critical paths (authentication, trade execution, billing)

**Example Test Structure:**

```javascript
describe('TradeExecutionService', () => {
  describe('executeTrade', () => {
    it('should execute a valid market order', async () => {
      // Arrange
      const tradeSignal = { /* ... */ };

      // Act
      const result = await service.executeTrade(tradeSignal);

      // Assert
      expect(result.status).toBe('executed');
      expect(result.orderId).toBeDefined();
    });

    it('should reject trades exceeding risk limits', async () => {
      // Arrange
      const oversizedTrade = { /* ... */ };

      // Act & Assert
      await expect(service.executeTrade(oversizedTrade))
        .rejects.toThrow('Risk limit exceeded');
    });
  });
});
```

### 4. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `docs:` - Documentation changes
- `test:` - Test additions/updates
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements
- `style:` - Code style changes (formatting, etc.)

**Examples:**

```bash
git commit -m "feat(adapters): Add Schwab broker adapter with OAuth2 flow"
git commit -m "fix(risk): Prevent negative position sizes in risk calculator"
git commit -m "docs(readme): Update installation instructions for Redis setup"
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:

**PR Title:** Same format as commit messages
**PR Description:**
- What does this PR do?
- Why is this change needed?
- How was it tested?
- Screenshots (for UI changes)
- Related issues (if any)

**PR Template:**

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

## 🏦 Adding New Broker Adapters

**All broker adapters must extend `BrokerAdapter` base class:**

```javascript
// src/brokers/adapters/YourBrokerAdapter.js
import BrokerAdapter from '../BrokerAdapter.js';

export default class YourBrokerAdapter extends BrokerAdapter {
  constructor(credentials) {
    super('yourbroker', credentials);
  }

  async connect() {
    // Implement OAuth2 or API key authentication
  }

  async disconnect() {
    // Clean up connections
  }

  async getAccountInfo() {
    // Return standardized account object
  }

  async getPositions() {
    // Return array of standardized position objects
  }

  async placeOrder(order) {
    // Execute trade and return standardized order object
  }

  async cancelOrder(orderId) {
    // Cancel order and return result
  }

  async getOrderStatus(orderId) {
    // Return standardized order status
  }
}
```

**Required Tests for Broker Adapters:**

```javascript
describe('YourBrokerAdapter', () => {
  // Connection tests
  it('should authenticate with valid credentials');
  it('should handle authentication failures');

  // Order execution tests
  it('should place market orders');
  it('should place limit orders');
  it('should place stop orders');
  it('should handle order rejections');

  // Position management tests
  it('should retrieve current positions');
  it('should calculate position P&L correctly');

  // Error handling tests
  it('should handle network timeouts');
  it('should handle API rate limits');
});
```

## 🔐 Security Guidelines

**NEVER commit sensitive data:**
- API keys, secrets, tokens
- Database credentials
- Private keys or certificates
- User data or credentials

**Use environment variables for all sensitive configuration.**

**Security Checklist:**
- [ ] No hardcoded credentials
- [ ] Input validation on all user data
- [ ] SQL injection prevention (use parameterized queries)
- [ ] XSS prevention (sanitize outputs)
- [ ] CSRF protection enabled
- [ ] Rate limiting on API endpoints
- [ ] Secure credential storage (encrypted in DB)
- [ ] OAuth2 flows follow security best practices

## 📝 Documentation

**Update documentation when you:**
- Add new features
- Change existing behavior
- Add new environment variables
- Add new API endpoints
- Add new broker adapters

**Documentation Locations:**
- `README.md` - Project overview and quick start
- `docs/guides/` - Setup guides and tutorials
- `docs/api/` - API reference
- `openspec/` - Technical specifications
- Inline code comments - Complex logic explanations

## 🐛 Bug Reports

**Before filing a bug:**
1. Check existing issues for duplicates
2. Test with latest version
3. Reproduce in clean environment

**Bug Report Template:**

```markdown
**Describe the bug**
Clear description of what the bug is

**To Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen

**Screenshots**
If applicable

**Environment:**
- OS: [e.g. macOS 14.1]
- Node version: [e.g. 22.11.0]
- Browser: [e.g. Chrome 120]

**Additional context**
Any other relevant information
```

## 💡 Feature Requests

**Feature Request Template:**

```markdown
**Is your feature request related to a problem?**
Clear description of the problem

**Describe the solution you'd like**
What you want to happen

**Describe alternatives you've considered**
Other approaches you've thought about

**Additional context**
Mockups, examples, use cases
```

## 🎯 Project Priorities

**Current Focus (Alpha Phase):**
1. Alpaca broker stability
2. Security hardening (MFA completion)
3. Test coverage improvements
4. Documentation completeness

**Upcoming (Beta Phase):**
1. Additional broker integrations (IBKR, Schwab)
2. Advanced signal parsing (ML/NLP)
3. Mobile app development
4. Multi-broker portfolio view

## 📞 Getting Help

- **Documentation:** Check [docs/](docs/INDEX.md) first
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/discord-trade-exec/discussions)
- **Issues:** [GitHub Issues](https://github.com/yourusername/discord-trade-exec/issues)
- **Discord:** Join our developer Discord (link TBD)

## 🏅 Recognition

Contributors will be:
- Listed in release notes
- Credited in documentation
- Eligible for "Contributor" badge on Discord
- Featured in monthly contributor highlights

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License (see [LICENSE](LICENSE) file).

---

**Thank you for contributing to Discord Trade Executor!** 🚀

Every contribution, no matter how small, helps make automated trading more accessible and reliable.
