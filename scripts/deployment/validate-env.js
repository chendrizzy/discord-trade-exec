#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * Validates all required environment variables are set before deployment
 * Based on: docs/deployment/RELEASE_READY_CHECKLIST.md Section 2.3
 *
 * Usage:
 *   node scripts/deployment/validate-env.js
 *   npm run validate:env
 *
 * Exit Codes:
 *   0 - All required variables valid
 *   1 - Missing required variables or validation errors
 *   2 - Optional variables missing (warning only)
 */

const chalk = require('chalk');

// ============================================================================
// Environment Variable Definitions
// ============================================================================

const ENV_VARIABLES = {
  // Core Application (P0 - CRITICAL)
  core: {
    priority: 'P0',
    variables: [
      { name: 'NODE_ENV', required: true, validate: val => ['development', 'staging', 'production'].includes(val), description: 'Application environment' },
      { name: 'PORT', required: true, validate: val => !isNaN(parseInt(val)), description: 'Server port' },
      { name: 'DATABASE_URL', required: true, validate: val => val.startsWith('mongodb://') || val.startsWith('mongodb+srv://') || val.startsWith('postgres://'), description: 'Database connection string' },
      { name: 'REDIS_URL', required: true, validate: val => val.startsWith('redis://') || val.startsWith('rediss://'), description: 'Redis connection string' },
      { name: 'SESSION_SECRET', required: true, validate: val => val.length >= 32, description: 'Session encryption secret (min 32 chars)' },
      { name: 'JWT_SECRET', required: true, validate: val => val.length >= 32, description: 'JWT encryption secret (min 32 chars)' }
    ]
  },

  // Domain & URLs (P0 - CRITICAL)
  domains: {
    priority: 'P0',
    variables: [
      { name: 'DASHBOARD_URL', required: true, validate: val => val.startsWith('https://'), description: 'Dashboard URL (must use HTTPS)' },
      { name: 'LANDING_PAGE_URL', required: true, validate: val => val.startsWith('https://'), description: 'Landing page URL (must use HTTPS)' },
      { name: 'DISCORD_CALLBACK_URL', required: true, validate: val => val.startsWith('https://') && val.includes('/auth/discord/callback'), description: 'Discord OAuth callback URL' }
    ]
  },

  // Discord OAuth (P0 - CRITICAL)
  discord: {
    priority: 'P0',
    variables: [
      { name: 'DISCORD_CLIENT_ID', required: true, validate: val => /^\d{17,19}$/.test(val), description: 'Discord OAuth client ID (17-19 digits)' },
      { name: 'DISCORD_CLIENT_SECRET', required: true, validate: val => val.length >= 32, description: 'Discord OAuth client secret' },
      { name: 'DISCORD_BOT_TOKEN', required: true, validate: val => val.length >= 50, description: 'Discord bot token' }
    ]
  },

  // Discord Bot (P1 - HIGH, optional for initial deployment)
  discordBot: {
    priority: 'P1',
    variables: [
      { name: 'DISCORD_GUILD_ID', required: false, validate: val => /^\d{17,19}$/.test(val), description: 'Test server ID (17-19 digits)' },
      { name: 'DISCORD_INVITE_URL', required: false, validate: val => val.startsWith('https://discord.gg/'), description: 'Discord invite link' }
    ]
  },

  // Polar.sh Billing (P1 - HIGH)
  polar: {
    priority: 'P1',
    variables: [
      { name: 'POLAR_ACCESS_TOKEN', required: false, validate: val => val.length > 0, description: 'Polar.sh API access token' },
      { name: 'POLAR_WEBHOOK_SECRET', required: false, validate: val => val.length >= 16, description: 'Polar.sh webhook secret' },
      { name: 'POLAR_PRODUCT_BASIC', required: false, validate: val => val.length > 0, description: 'Polar product ID for Basic tier' },
      { name: 'POLAR_PRODUCT_PRO', required: false, validate: val => val.length > 0, description: 'Polar product ID for Pro tier' },
      { name: 'POLAR_PRODUCT_PREMIUM', required: false, validate: val => val.length > 0, description: 'Polar product ID for Premium tier' },
      { name: 'POLAR_CHECKOUT_URL', required: false, validate: val => val.startsWith('https://'), description: 'Polar checkout link' }
    ]
  },

  // Monitoring (P1 - HIGH)
  monitoring: {
    priority: 'P1',
    variables: [
      { name: 'SENTRY_DSN', required: false, validate: val => val.startsWith('https://'), description: 'Sentry.io DSN for error tracking' },
      { name: 'PIPELINE_ENABLE_MONITORING', required: false, validate: val => ['true', 'false'].includes(val), description: 'Enable monitoring features' }
    ]
  },

  // Email Service (P2 - MEDIUM)
  email: {
    priority: 'P2',
    variables: [
      { name: 'EMAIL_SERVICE_API_KEY', required: false, validate: val => val.length > 0, description: 'SendGrid/Mailgun API key or SMTP credentials' }
    ]
  },

  // Analytics (P3 - LOW, optional)
  analytics: {
    priority: 'P3',
    variables: [
      { name: 'GOOGLE_ANALYTICS_ID', required: false, validate: val => val.startsWith('G-') || val.startsWith('UA-'), description: 'GA4 property ID' },
      { name: 'MIXPANEL_TOKEN', required: false, validate: val => val.length > 0, description: 'Mixpanel analytics token' }
    ]
  },

  // Broker API Keys (P3 - LOW, for testing)
  brokers: {
    priority: 'P3',
    variables: [
      { name: 'ALPACA_API_KEY', required: false, validate: val => val.length > 0, description: 'Alpaca paper trading API key' },
      { name: 'ALPACA_SECRET_KEY', required: false, validate: val => val.length > 0, description: 'Alpaca paper trading secret key' },
      { name: 'TRADIER_ACCESS_TOKEN', required: false, validate: val => val.length > 0, description: 'Tradier sandbox access token' }
    ]
  }
};

// ============================================================================
// Validation Logic
// ============================================================================

class EnvValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  /**
   * Validate a single environment variable
   */
  validateVariable(varDef) {
    const value = process.env[varDef.name];

    // Check if required variable is missing
    if (varDef.required && !value) {
      this.errors.push({
        name: varDef.name,
        description: varDef.description,
        issue: 'MISSING (required)'
      });
      return false;
    }

    // Optional variable missing
    if (!varDef.required && !value) {
      this.warnings.push({
        name: varDef.name,
        description: varDef.description,
        issue: 'Not set (optional)'
      });
      return true; // Not an error
    }

    // Variable exists, validate format
    if (value && varDef.validate && !varDef.validate(value)) {
      this.errors.push({
        name: varDef.name,
        description: varDef.description,
        issue: 'INVALID FORMAT',
        value: this.maskSensitive(varDef.name, value)
      });
      return false;
    }

    // Variable valid
    this.successes.push({
      name: varDef.name,
      description: varDef.description,
      value: this.maskSensitive(varDef.name, value)
    });
    return true;
  }

  /**
   * Mask sensitive values in output
   */
  maskSensitive(name, value) {
    const sensitiveKeywords = ['SECRET', 'TOKEN', 'KEY', 'PASSWORD', 'DSN'];
    const isSensitive = sensitiveKeywords.some(keyword => name.includes(keyword));

    if (isSensitive && value.length > 8) {
      return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    }

    // Mask URLs but show domain
    if (name.includes('URL') && value.startsWith('https://')) {
      try {
        const url = new URL(value);
        return `https://${url.hostname}${url.pathname}`;
      } catch (error) {
        // Invalid URL format, return as-is (validation will catch it)
        return value;
      }
    }

    return value;
  }

  /**
   * Validate all variables in a category
   */
  validateCategory(categoryName, category) {
    console.log(chalk.bold(`\n${'='.repeat(80)}`));
    console.log(chalk.bold(`${categoryName.toUpperCase()} (${category.priority})`));
    console.log(chalk.bold(`${'='.repeat(80)}\n`));

    let allValid = true;
    for (const varDef of category.variables) {
      const isValid = this.validateVariable(varDef);
      if (!isValid && varDef.required) {
        allValid = false;
      }
    }

    return allValid;
  }

  /**
   * Run validation for all categories
   */
  validateAll() {
    console.log(chalk.bold.blue('\n🔍 ENVIRONMENT VARIABLE VALIDATION\n'));
    console.log(chalk.gray(`Based on: docs/deployment/RELEASE_READY_CHECKLIST.md Section 2.3`));
    console.log(chalk.gray(`Current environment: ${process.env.NODE_ENV || 'unknown'}\n`));

    let allCategoriesValid = true;

    // Validate each category
    for (const [categoryName, category] of Object.entries(ENV_VARIABLES)) {
      const isValid = this.validateCategory(categoryName, category);
      if (!isValid) {
        allCategoriesValid = false;
      }
    }

    return allCategoriesValid;
  }

  /**
   * Print validation summary
   */
  printSummary() {
    console.log(chalk.bold(`\n${'='.repeat(80)}`));
    console.log(chalk.bold('VALIDATION SUMMARY'));
    console.log(chalk.bold(`${'='.repeat(80)}\n`));

    // Print errors
    if (this.errors.length > 0) {
      console.log(chalk.bold.red(`❌ ERRORS (${this.errors.length}):\n`));
      for (const error of this.errors) {
        console.log(chalk.red(`  ✗ ${error.name}`));
        console.log(chalk.gray(`    Description: ${error.description}`));
        console.log(chalk.red(`    Issue: ${error.issue}`));
        if (error.value) {
          console.log(chalk.gray(`    Current value: ${error.value}`));
        }
        console.log('');
      }
    }

    // Print warnings
    if (this.warnings.length > 0) {
      console.log(chalk.bold.yellow(`⚠️  WARNINGS (${this.warnings.length}):\n`));
      for (const warning of this.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning.name}`));
        console.log(chalk.gray(`    Description: ${warning.description}`));
        console.log(chalk.yellow(`    Issue: ${warning.issue}`));
        console.log('');
      }
    }

    // Print successes
    if (this.successes.length > 0) {
      console.log(chalk.bold.green(`✅ VALID (${this.successes.length}):\n`));
      for (const success of this.successes) {
        console.log(chalk.green(`  ✓ ${success.name}`));
        console.log(chalk.gray(`    Value: ${success.value}`));
      }
      console.log('');
    }

    // Final status
    console.log(chalk.bold(`${'='.repeat(80)}\n`));

    if (this.errors.length === 0) {
      console.log(chalk.bold.green('✅ ALL REQUIRED VARIABLES VALID\n'));
      if (this.warnings.length > 0) {
        console.log(chalk.yellow(`⚠️  ${this.warnings.length} optional variable(s) not set (see warnings above)\n`));
      }
      return 0;
    } else {
      console.log(chalk.bold.red(`❌ VALIDATION FAILED: ${this.errors.length} error(s)\n`));
      console.log(chalk.gray('Fix the errors above before deploying to production.\n'));
      return 1;
    }
  }

  /**
   * Print helpful tips
   */
  printTips() {
    console.log(chalk.bold.cyan('💡 HELPFUL TIPS:\n'));
    console.log(chalk.gray('1. Generate secure secrets:'));
    console.log(chalk.white('   openssl rand -base64 32\n'));
    console.log(chalk.gray('2. Set variables in Railway:'));
    console.log(chalk.white('   Railway Dashboard → Project → Variables\n'));
    console.log(chalk.gray('3. Test locally with .env file:'));
    console.log(chalk.white('   cp .env.example .env\n'));
    console.log(chalk.gray('4. See checklist for more details:'));
    console.log(chalk.white('   docs/deployment/RELEASE_READY_CHECKLIST.md Section 2.3\n'));
  }
}

// ============================================================================
// Main Execution
// ============================================================================

function main() {
  const validator = new EnvValidator();

  // Run validation
  validator.validateAll();

  // Print summary
  const exitCode = validator.printSummary();

  // Print helpful tips if there are errors
  if (exitCode !== 0) {
    validator.printTips();
  }

  // Exit with appropriate code
  process.exit(exitCode);
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { EnvValidator, ENV_VARIABLES };
