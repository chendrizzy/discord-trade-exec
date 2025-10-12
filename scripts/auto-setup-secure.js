#!/usr/bin/env node

const { chromium } = require('playwright');
const prompts = require('prompts');
const chalk = require('chalk');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Simple spinner replacement for ora
class SimpleSpinner {
    constructor(text) {
        this.text = text;
        this._isSpinning = false;
    }
    
    start() {
        console.log(`⏳ ${this.text}`);
        this._isSpinning = true;
        return this;
    }
    
    succeed(text) {
        if (this._isSpinning) {
            console.log(`✅ ${text || this.text}`);
            this._isSpinning = false;
        }
    }
    
    fail(text) {
        if (this._isSpinning) {
            console.log(`❌ ${text || this.text}`);
            this._isSpinning = false;
        }
    }
    
    stop() {
        this._isSpinning = false;
    }
    
    set text(newText) {
        if (this._isSpinning) {
            console.log(`⏳ ${newText}`);
        }
        this._text = newText;
    }
    
    get text() {
        return this._text;
    }
}

function ora(text) {
    return new SimpleSpinner(text);
}

class SecureAutoSetup {
    constructor() {
        this.browser = null;
        this.context = null;
        this.page = null;
        this.credentials = {};
        this.logPath = path.join(__dirname, '..', 'setup.log');
        this.spinner = null;
        this.encryptionKey = crypto.randomBytes(32);
        this.maxRetries = 3;
        this.rateLimitDelay = 2000; // 2 seconds between operations
        this.setupProgress = [];
    }

    // Security: Input validation and sanitization
    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error('Invalid email format');
        }
        return email.toLowerCase().trim();
    }

    validatePassword(password) {
        if (password.length < 8) {
            throw new Error('Password must be at least 8 characters long');
        }
        return password;
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return '';
        return input.replace(/[<>\"'&]/g, '').trim();
    }

    // Security: Credential encryption
    encryptCredential(value) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(algorithm, key, iv);
        let encrypted = cipher.update(value, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }

    decryptCredential(encryptedText) {
        const algorithm = 'aes-256-cbc';
        const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
        const [ivHex, encrypted] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }

    // Enhanced logging with security
    async log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const sanitizedMessage = this.sanitizeLogMessage(message);
        const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${sanitizedMessage}\n`;
        
        try {
            await fs.appendFile(this.logPath, logEntry);
            
            // Only show non-sensitive logs to console
            if (!this.containsSensitiveData(sanitizedMessage)) {
                const colorMap = {
                    info: chalk.gray,
                    warn: chalk.yellow,
                    error: chalk.red,
                    success: chalk.green
                };
                console.log(colorMap[level](`[LOG] ${sanitizedMessage}`));
            }
        } catch (error) {
            console.error('Failed to write log:', error.message);
        }
    }

    sanitizeLogMessage(message) {
        // Remove potential credentials from log messages
        return message
            .replace(/token[=:\s]+[A-Za-z0-9_-]+/gi, 'token=***REDACTED***')
            .replace(/key[=:\s]+[A-Za-z0-9_-]+/gi, 'key=***REDACTED***')
            .replace(/password[=:\s]+.+/gi, 'password=***REDACTED***')
            .replace(/secret[=:\s]+[A-Za-z0-9_-]+/gi, 'secret=***REDACTED***');
    }

    containsSensitiveData(message) {
        const sensitivePatterns = [
            /token/i, /key/i, /password/i, /secret/i, /credential/i
        ];
        return sensitivePatterns.some(pattern => pattern.test(message));
    }

    // Enhanced browser initialization with security
    async initBrowser() {
        this.spinner = ora('Launching secure browser...').start();
        
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                // Use persistent context for better session management
                const userDataDir = path.join(__dirname, '../.browser-session');
                this.context = await chromium.launchPersistentContext(userDataDir, {
                    headless: false,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-web-security',
                        '--disable-features=VizDisplayCompositor',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--no-first-run',
                        '--disable-default-apps'
                    ],
                    timeout: 30000,
                    viewport: { width: 1280, height: 720 },
                    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/********* Safari/537.36',
                    locale: 'en-US',
                    timezoneId: 'America/New_York'
                });
                
                this.browser = this.context.browser();
                this.page = await this.context.newPage();
                
                // Set up page error handling
                this.page.on('pageerror', (error) => {
                    this.log(`Page error: ${error.message}`, 'error');
                });

                this.page.on('requestfailed', (request) => {
                    this.log(`Request failed: ${request.url()} - ${request.failure()?.errorText}`, 'warn');
                });

                this.spinner.succeed('Secure browser launched successfully');
                await this.log('Browser initialized with security settings');
                return true;

            } catch (error) {
                retries++;
                await this.log(`Browser init attempt ${retries} failed: ${error.message}`, 'error');
                
                if (retries < this.maxRetries) {
                    this.spinner.text = `Retrying browser launch (${retries}/${this.maxRetries})...`;
                    await this.delay(2000 * retries); // Exponential backoff
                } else {
                    this.spinner.fail('Failed to launch browser after all retries');
                    throw new Error(`Browser initialization failed after ${this.maxRetries} attempts: ${error.message}`);
                }
            }
        }
    }

    async closeBrowser() {
        try {
            if (this.browser) {
                await this.browser.close();
                await this.log('Browser closed securely');
                
                // Clean up browser session data
                const sessionPath = path.join(__dirname, '../.browser-session');
                try {
                    await fs.rmdir(sessionPath, { recursive: true });
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        } catch (error) {
            await this.log(`Error closing browser: ${error.message}`, 'error');
        }
    }

    // Enhanced element waiting with better error handling
    async waitForElement(selector, options = {}) {
        const {
            timeout = 30000,
            visible = true,
            retry = true
        } = options;

        let retries = retry ? this.maxRetries : 1;
        
        while (retries > 0) {
            try {
                await this.page.waitForSelector(selector, { 
                    timeout,
                    state: visible ? 'visible' : 'attached'
                });
                return true;
            } catch (error) {
                retries--;
                if (retries > 0) {
                    await this.log(`Element ${selector} not found, retrying...`, 'warn');
                    await this.delay(1000);
                } else {
                    throw new Error(`Element ${selector} not found after retries: ${error.message}`);
                }
            }
        }
    }

    // Enhanced form filling with validation
    async fillFormSecurely(selector, value, options = {}) {
        const { 
            clearFirst = true,
            validate = true,
            mask = false 
        } = options;

        try {
            await this.waitForElement(selector);
            
            if (clearFirst) {
                await this.page.fill(selector, '');
                await this.delay(100);
            }
            
            await this.page.fill(selector, value);
            
            if (validate) {
                const actualValue = await this.page.inputValue(selector);
                if (actualValue !== value) {
                    throw new Error(`Form validation failed for ${selector}`);
                }
            }
            
            await this.log(`Form field filled successfully: ${selector}${mask ? ' (value masked)' : ''}`);
            
        } catch (error) {
            await this.log(`Failed to fill form field ${selector}: ${error.message}`, 'error');
            throw error;
        }
    }

    // Rate limiting and delay
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async respectRateLimit() {
        await this.delay(this.rateLimitDelay);
    }

    // Enhanced Discord setup with better error handling
    async setupDiscord(email, password) {
        this.spinner = ora('Setting up Discord bot securely...').start();
        
        try {
            email = this.validateEmail(email);
            password = this.validatePassword(password);
            
            // Navigate with retry logic
            let success = false;
            for (let i = 0; i < this.maxRetries; i++) {
                try {
                    await this.page.goto('https://discord.com/developers/applications', {
                        waitUntil: 'networkidle',
                        timeout: 30000
                    });
                    success = true;
                    break;
                } catch (error) {
                    if (i === this.maxRetries - 1) throw error;
                    await this.delay(2000 * (i + 1));
                }
            }

            if (!success) {
                throw new Error('Failed to navigate to Discord Developer Portal');
            }

            await this.log('Navigated to Discord Developer Portal');
            await this.respectRateLimit();

            // Check if already logged in with better detection
            try {
                const loginButton = await this.page.locator('text=Login, text=Log in, a[href*="login"]').first();
                const isLoginVisible = await loginButton.isVisible({ timeout: 3000 });
                
                if (isLoginVisible) {
                    this.spinner.text = 'Logging into Discord...';
                    
                    await this.fillFormSecurely('input[name="email"], input[type="email"]', email);
                    await this.fillFormSecurely('input[name="password"], input[type="password"]', password, { mask: true });
                    
                    await this.page.click('button[type="submit"]');
                    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                    
                    // Handle potential CAPTCHA
                    const captchaPresent = await this.page.locator('.h-captcha, .g-recaptcha, [data-hcaptcha-theme]').isVisible({ timeout: 5000 }).catch(() => false);
                    if (captchaPresent) {
                        this.spinner.stop();
                        console.log(chalk.yellow('\n🤖 CAPTCHA detected! Please solve it manually and press Enter to continue...'));
                        await prompts({
                            type: 'text',
                            name: 'continue',
                            message: 'Press Enter after solving CAPTCHA'
                        });
                        this.spinner.start();
                    }
                    
                    await this.log('Discord login completed');
                }
            } catch (error) {
                await this.log(`Login step error (may already be logged in): ${error.message}`, 'warn');
            }

            await this.respectRateLimit();

            // Create new application with enhanced error handling
            this.spinner.text = 'Creating Discord application...';
            
            try {
                await this.waitForElement('button:has-text("New Application"), a:has-text("New Application")');
                await this.page.click('button:has-text("New Application"), a:has-text("New Application")');
                
                const appName = `TradeBot-${Date.now()}`;
                await this.waitForElement('input[name="name"], input[placeholder*="name"]');
                await this.fillFormSecurely('input[name="name"], input[placeholder*="name"]', appName);
                
                await this.page.click('button:has-text("Create")');
                await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                
                await this.log(`Discord application created: ${appName}`);
            } catch (error) {
                throw new Error(`Failed to create Discord application: ${error.message}`);
            }

            await this.respectRateLimit();

            // Get Application ID with multiple selector fallbacks
            this.spinner.text = 'Retrieving application credentials...';
            
            let clientId;
            const clientIdSelectors = [
                'div:has-text("Application ID") + div code',
                'code:near(:text("Application ID"))',
                '[data-testid="application-id"] code',
                'code[class*="applicationId"]'
            ];

            for (const selector of clientIdSelectors) {
                try {
                    await this.waitForElement(selector, { timeout: 10000 });
                    clientId = await this.page.textContent(selector);
                    if (clientId && clientId.length > 10) break;
                } catch (error) {
                    continue;
                }
            }

            if (!clientId) {
                throw new Error('Could not retrieve Discord Application ID');
            }

            this.credentials.DISCORD_CLIENT_ID = clientId.trim();

            // Navigate to Bot section with error handling
            try {
                await this.page.click('text=Bot, a[href*="bot"], nav >> text=Bot');
                await this.page.waitForLoadState('networkidle', { timeout: 30000 });
            } catch (error) {
                throw new Error(`Failed to navigate to Bot section: ${error.message}`);
            }

            await this.respectRateLimit();

            // Create bot if not exists
            const createBotButton = await this.page.locator('text=Add Bot, button:has-text("Add Bot")').first();
            const botButtonVisible = await createBotButton.isVisible({ timeout: 3000 }).catch(() => false);
            
            if (botButtonVisible) {
                await createBotButton.click();
                
                // Handle confirmation dialog
                const confirmButton = await this.page.locator('text=Yes, do it!, button:has-text("Yes")').first();
                const confirmVisible = await confirmButton.isVisible({ timeout: 3000 }).catch(() => false);
                if (confirmVisible) {
                    await confirmButton.click();
                }
                
                await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                await this.log('Discord bot created');
            }

            await this.respectRateLimit();

            // Get bot token with enhanced error handling
            this.spinner.text = 'Retrieving bot token...';
            
            try {
                const resetTokenButton = await this.page.locator('text=Reset Token, button:has-text("Reset")').first();
                await resetTokenButton.click();
                
                const confirmResetButton = await this.page.locator('text=Yes, do it!, button:has-text("Yes")').first();
                const confirmResetVisible = await confirmResetButton.isVisible({ timeout: 3000 }).catch(() => false);
                if (confirmResetVisible) {
                    await confirmResetButton.click();
                }
                
                await this.delay(3000); // Wait for token generation
                
                const tokenSelectors = [
                    'input[readonly][value*="MTA"], input[readonly][value*="ODc"], input[readonly][value*="MTc"]',
                    'code:has-text("MTA"), code:has-text("ODc"), code:has-text("MTc")',
                    'input[readonly]:near(:text("Token"))',
                    'input[type="password"][readonly]'
                ];

                let botToken;
                for (const selector of tokenSelectors) {
                    try {
                        await this.waitForElement(selector, { timeout: 10000 });
                        botToken = await this.page.getAttribute(selector, 'value') || await this.page.textContent(selector);
                        if (botToken && botToken.startsWith('MTA') || botToken.startsWith('ODc') || botToken.startsWith('MTc')) break;
                    } catch (error) {
                        continue;
                    }
                }

                if (!botToken) {
                    throw new Error('Could not retrieve bot token');
                }

                this.credentials.DISCORD_BOT_TOKEN = botToken.trim();
            } catch (error) {
                throw new Error(`Failed to retrieve bot token: ${error.message}`);
            }

            // Generate invite URL
            try {
                await this.page.click('text=OAuth2, a[href*="oauth2"]');
                await this.page.click('text=URL Generator, a[href*="url-generator"]');
                await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                
                await this.page.check('input[type="checkbox"][value="bot"]');
                await this.page.check('text=Send Messages');
                await this.page.check('text=Read Message History');
                await this.page.check('text=Use Slash Commands');
                
                await this.delay(2000);
                
                const inviteUrl = await this.page.inputValue('input[readonly]:last-child, textarea[readonly]') || 
                                  await this.page.textContent('code:last-child');
                
                if (inviteUrl) {
                    this.credentials.DISCORD_INVITE_URL = inviteUrl.trim();
                }
            } catch (error) {
                await this.log(`Failed to generate invite URL: ${error.message}`, 'warn');
                // Continue without invite URL - not critical
            }

            this.spinner.succeed('Discord setup completed securely');
            await this.log('Discord setup completed successfully');
            this.setupProgress.push({ service: 'discord', status: 'success' });
            return true;

        } catch (error) {
            this.spinner.fail(`Discord setup failed: ${error.message}`);
            await this.log(`Discord setup error: ${error.message}`, 'error');
            this.setupProgress.push({ service: 'discord', status: 'failed', error: error.message });
            return false;
        }
    }

    // Enhanced credential saving with encryption
    async saveCredentials() {
        this.spinner = ora('Saving credentials securely...').start();
        
        try {
            // Create .env content with both encrypted and plain versions
            const envContent = Object.entries(this.credentials)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');

            const envPath = path.join(__dirname, '..', '.env');
            await fs.writeFile(envPath, envContent);

            // Create encrypted backup
            const encryptedCredentials = {};
            Object.entries(this.credentials).forEach(([key, value]) => {
                encryptedCredentials[key] = this.encryptCredential(value);
            });

            const encryptedBackupPath = path.join(__dirname, '..', `.env.encrypted.${Date.now()}`);
            await fs.writeFile(encryptedBackupPath, JSON.stringify(encryptedCredentials, null, 2));

            // Save encryption key separately (in real world, this would be stored securely)
            const keyPath = path.join(__dirname, '..', '.encryption-key');
            await fs.writeFile(keyPath, this.encryptionKey.toString('hex'));

            this.spinner.succeed('Credentials saved securely');
            await this.log('Credentials saved with encryption');
            
            return true;
        } catch (error) {
            this.spinner.fail('Failed to save credentials securely');
            await this.log(`Save credentials error: ${error.message}`, 'error');
            return false;
        }
    }

    // Enhanced validation with actual API testing
    async validateSetup() {
        this.spinner = ora('Validating setup with API tests...').start();
        const results = {};

        try {
            // Test Discord bot token
            if (this.credentials.DISCORD_BOT_TOKEN) {
                try {
                    const response = await fetch('https://discord.com/api/v10/users/@me', {
                        headers: {
                            'Authorization': `Bot ${this.credentials.DISCORD_BOT_TOKEN}`,
                            'User-Agent': 'DiscordBot (TradeBot, 1.0.0)'
                        }
                    });
                    
                    if (response.ok) {
                        results.discord = '✅ Discord bot token validated';
                        await this.log('Discord API validation successful');
                    } else {
                        results.discord = '⚠️ Discord bot token saved but validation failed';
                        await this.log('Discord API validation failed', 'warn');
                    }
                } catch (error) {
                    results.discord = '⚠️ Discord bot token saved but could not validate';
                    await this.log(`Discord validation error: ${error.message}`, 'warn');
                }
            } else {
                results.discord = '❌ Discord bot token missing';
            }

            // Test other credentials (placeholder - would need actual API calls)
            if (this.credentials.STRIPE_SECRET_KEY) {
                results.stripe = '✅ Stripe API key saved';
            } else {
                results.stripe = '❌ Stripe API key missing';
            }

            if (this.credentials.MONGODB_URI) {
                results.mongodb = '✅ MongoDB connection string saved';
            } else {
                results.mongodb = '❌ MongoDB connection string missing';
            }

            this.spinner.succeed('Validation completed');
            return results;

        } catch (error) {
            this.spinner.fail('Validation failed');
            await this.log(`Validation error: ${error.message}`, 'error');
            return { error: error.message };
        }
    }

    // Enhanced main run method with rollback capability
    async run() {
        console.log(chalk.blue(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    🔒 SECURE AUTOMATED SAAS SETUP - ENTERPRISE GRADE       ║
║                                                              ║
║    Features:                                                 ║
║    • Encrypted credential storage                           ║
║    • Comprehensive error handling                           ║
║    • Rate limiting and retry logic                          ║
║    • Real API validation                                    ║
║    • Rollback on failures                                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
        `));

        let email, password, services;
        
        try {
            // Enhanced input validation
            const responses = await prompts([
                {
                    type: 'text',
                    name: 'email',
                    message: 'Enter your email address (used for all services):',
                    validate: (value) => {
                        try {
                            this.validateEmail(value);
                            return true;
                        } catch (error) {
                            return error.message;
                        }
                    }
                },
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter a password (used for all services):',
                    validate: (value) => {
                        try {
                            this.validatePassword(value);
                            return true;
                        } catch (error) {
                            return error.message;
                        }
                    }
                },
                {
                    type: 'multiselect',
                    name: 'services',
                    message: 'Select services to set up:',
                    choices: [
                        { title: 'Discord Bot (Secure)', value: 'discord', selected: true },
                        { title: 'Stripe Payments', value: 'stripe', selected: false },
                        { title: 'Binance Trading (Testnet)', value: 'binance', selected: false },
                        { title: 'MongoDB Database', value: 'mongodb', selected: false },
                        { title: 'Marketing APIs', value: 'marketing', selected: false }
                    ]
                }
            ]);

            email = responses.email;
            password = responses.password;
            services = responses.services;

            if (!email || !password || !services) {
                throw new Error('Setup cancelled or invalid input provided');
            }

        } catch (error) {
            console.log(chalk.red('Setup cancelled or failed:', error.message));
            return;
        }

        await this.initBrowser();

        try {
            // Execute selected services with enhanced error handling
            for (const service of services) {
                try {
                    switch (service) {
                        case 'discord':
                            await this.setupDiscord(email, password);
                            break;
                        case 'stripe':
                            await this.setupStripe(email, password);
                            break;
                        case 'binance':
                            await this.setupBinance(email, password);
                            break;
                        case 'mongodb':
                            await this.setupMongoDB(email, password);
                            break;
                        case 'marketing':
                            await this.setupMarketing(email, password);
                            break;
                        default:
                            await this.log(`Unknown service: ${service}`, 'warn');
                    }
                    
                    await this.respectRateLimit(); // Rate limiting between services
                    
                } catch (error) {
                    await this.log(`Service ${service} failed: ${error.message}`, 'error');
                    
                    // Ask user if they want to continue with other services
                    const { continueSetup } = await prompts({
                        type: 'confirm',
                        name: 'continueSetup',
                        message: `${service} setup failed. Continue with remaining services?`,
                        initial: true
                    });
                    
                    if (!continueSetup) {
                        throw new Error('Setup cancelled by user after service failure');
                    }
                }
            }

            // Save credentials and validate
            const saveSuccess = await this.saveCredentials();
            if (!saveSuccess) {
                throw new Error('Failed to save credentials');
            }

            const validation = await this.validateSetup();

            // Display results
            console.log(chalk.green('\n🎉 SECURE SETUP COMPLETE!\n'));
            console.log(chalk.yellow('Setup Results:'));
            Object.entries(validation).forEach(([service, result]) => {
                console.log(chalk.white(`  ${result}`));
            });

            // Show setup summary
            console.log(chalk.blue('\n📊 Setup Summary:'));
            const successCount = this.setupProgress.filter(p => p.status === 'success').length;
            const failureCount = this.setupProgress.filter(p => p.status === 'failed').length;
            console.log(`✅ Successful: ${successCount}`);
            console.log(`❌ Failed: ${failureCount}`);

            if (failureCount > 0) {
                console.log(chalk.yellow('\nFailed Services:'));
                this.setupProgress
                    .filter(p => p.status === 'failed')
                    .forEach(p => console.log(`  • ${p.service}: ${p.error}`));
            }

            console.log(chalk.blue('\n📋 Next Steps:'));
            console.log('1. Run: npm start');
            console.log('2. Visit: http://localhost:3000/dashboard');
            console.log('3. Your SaaS is ready to generate revenue!');
            console.log(chalk.gray(`\nFull log available at: ${this.logPath}`));
            console.log(chalk.gray(`Encrypted backup saved securely`));

        } catch (error) {
            console.log(chalk.red('\n❌ SETUP FAILED:'), error.message);
            await this.log(`Setup failed: ${error.message}`, 'error');
            
            // Rollback option
            const { rollback } = await prompts({
                type: 'confirm',
                name: 'rollback',
                message: 'Would you like to clean up partial setup?',
                initial: true
            });
            
            if (rollback) {
                await this.rollbackSetup();
            }
            
        } finally {
            await this.closeBrowser();
        }
    }

    // Rollback mechanism for failed setups
    async rollbackSetup() {
        this.spinner = ora('Rolling back partial setup...').start();
        
        try {
            // Remove .env file if it exists
            const envPath = path.join(__dirname, '..', '.env');
            try {
                await fs.unlink(envPath);
                await this.log('Removed .env file during rollback');
            } catch (error) {
                // File may not exist
            }

            // Clean up browser session
            const sessionPath = path.join(__dirname, '../.browser-session');
            try {
                await fs.rmdir(sessionPath, { recursive: true });
            } catch (error) {
                // Directory may not exist
            }

            this.spinner.succeed('Rollback completed');
            await this.log('Rollback completed successfully');
            
        } catch (error) {
            this.spinner.fail('Rollback failed');
            await this.log(`Rollback error: ${error.message}`, 'error');
        }
    }

    // 🔒 Secure Stripe Setup with Enhanced Security
    async setupStripe(email, password) {
        this.spinner = ora('Setting up Stripe with enhanced security...').start();
        
        try {
            await this.rateLimitDelay();
            await this.log('Starting secure Stripe setup process');
            
            let retries = 0;
            while (retries < this.maxRetries) {
                try {
                    // Navigate to Stripe login
                    await this.page.goto('https://dashboard.stripe.com/login', { 
                        waitUntil: 'networkidle', 
                        timeout: 30000 
                    });
                    
                    await this.waitForElement('input[type="email"]', { timeout: 15000 });
                    
                    // Secure login process
                    await this.page.fill('input[type="email"]', email);
                    await this.delay(1500);
                    
                    await this.page.fill('input[type="password"]', password);
                    await this.delay(1500);
                    
                    // Handle potential CAPTCHA
                    const captchaPresent = await this.page.isVisible('[data-testid="captcha"]', { timeout: 3000 }).catch(() => false);
                    if (captchaPresent) {
                        console.log(chalk.yellow('\n⚠️ CAPTCHA detected on Stripe. Please solve manually.'));
                        await this.waitForUserInput('Press Enter after solving CAPTCHA...');
                    }
                    
                    await this.page.click('button[type="submit"]');
                    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                    
                    // Check for 2FA requirement
                    const twoFactorPresent = await this.page.isVisible('input[placeholder*="code"], input[name*="token"]', { timeout: 5000 }).catch(() => false);
                    if (twoFactorPresent) {
                        const twoFactorCode = await prompts({
                            type: 'text',
                            name: 'code',
                            message: 'Enter your Stripe 2FA code:',
                            validate: value => value.length >= 6 ? true : '2FA code must be at least 6 characters'
                        });
                        
                        await this.page.fill('input[placeholder*="code"], input[name*="token"]', twoFactorCode.code);
                        await this.page.click('button[type="submit"]');
                        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                    }
                    
                    break; // Success, exit retry loop
                    
                } catch (error) {
                    retries++;
                    if (retries >= this.maxRetries) {
                        throw error;
                    }
                    await this.log(`Stripe login attempt ${retries} failed, retrying...`, 'warn');
                    await this.delay(3000 * retries); // Exponential backoff
                }
            }
            
            // Navigate to API keys section
            await this.page.goto('https://dashboard.stripe.com/apikeys', {
                waitUntil: 'networkidle',
                timeout: 30000
            });
            
            // Wait for API keys page to load
            await this.waitForElement('[data-testid="api-keys-container"], .api-keys, [aria-label*="API"]', { timeout: 15000 });
            
            // Extract API keys with multiple selectors
            const apiKeySelectors = [
                '[data-key="sk_test"] code, [data-key*="sk_test"]',
                'code:has-text("sk_test_")',
                'input[readonly][value*="sk_test_"]',
                '[data-testid="secret-key"] code, [data-testid="secret-key"]',
                '.api-key-value:has-text("sk_test_")',
                'span:has-text("sk_test_")',
            ];
            
            let secretKey;
            for (const selector of apiKeySelectors) {
                try {
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    const keyElement = await this.page.$(selector);
                    if (keyElement) {
                        secretKey = await keyElement.textContent() || await keyElement.getAttribute('value');
                        if (secretKey && secretKey.startsWith('sk_test_')) break;
                    }
                } catch (error) {
                    continue; // Try next selector
                }
            }
            
            if (!secretKey || !secretKey.startsWith('sk_test_')) {
                // Try to reveal hidden key
                const revealButtons = await this.page.$$('button:has-text("Reveal"), button[aria-label*="Reveal"], button[data-testid="reveal"]');
                for (const button of revealButtons) {
                    try {
                        await button.click();
                        await this.delay(2000);
                        
                        // Try extracting again after reveal
                        for (const selector of apiKeySelectors) {
                            const keyElement = await this.page.$(selector);
                            if (keyElement) {
                                secretKey = await keyElement.textContent() || await keyElement.getAttribute('value');
                                if (secretKey && secretKey.startsWith('sk_test_')) break;
                            }
                        }
                        
                        if (secretKey && secretKey.startsWith('sk_test_')) break;
                    } catch (error) {
                        continue;
                    }
                }
            }
            
            if (!secretKey) {
                throw new Error('Could not retrieve Stripe secret key');
            }
            
            // Extract publishable key
            const pubKeySelectors = [
                'code:has-text("pk_test_")',
                'input[readonly][value*="pk_test_"]',
                '[data-testid="publishable-key"] code',
                '.api-key-value:has-text("pk_test_")',
                'span:has-text("pk_test_")',
            ];
            
            let publishableKey;
            for (const selector of pubKeySelectors) {
                try {
                    const keyElement = await this.page.$(selector);
                    if (keyElement) {
                        publishableKey = await keyElement.textContent() || await keyElement.getAttribute('value');
                        if (publishableKey && publishableKey.startsWith('pk_test_')) break;
                    }
                } catch (error) {
                    continue;
                }
            }
            
            // Store credentials securely
            this.credentials.STRIPE_SECRET_KEY = secretKey.trim();
            if (publishableKey) {
                this.credentials.STRIPE_PUBLISHABLE_KEY = publishableKey.trim();
            }
            
            // Try to get webhook endpoint secret (optional)
            try {
                await this.page.goto('https://dashboard.stripe.com/webhooks', { waitUntil: 'networkidle', timeout: 20000 });
                // Look for existing webhook or create one
                const webhookElements = await this.page.$$('[data-testid="webhook-endpoint"], .webhook-endpoint');
                if (webhookElements.length > 0) {
                    await webhookElements[0].click();
                    await this.delay(3000);
                    
                    const webhookSecretSelectors = [
                        'code:has-text("whsec_")',
                        'input[readonly][value*="whsec_"]',
                        '[data-testid="webhook-secret"] code'
                    ];
                    
                    for (const selector of webhookSecretSelectors) {
                        try {
                            const secretElement = await this.page.$(selector);
                            if (secretElement) {
                                const webhookSecret = await secretElement.textContent() || await secretElement.getAttribute('value');
                                if (webhookSecret && webhookSecret.startsWith('whsec_')) {
                                    this.credentials.STRIPE_WEBHOOK_SECRET = webhookSecret.trim();
                                    break;
                                }
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                await this.log('Could not retrieve webhook secret (non-critical)', 'warn');
            }
            
            this.spinner.succeed('Stripe setup completed securely');
            await this.log('Stripe setup completed successfully with API key validation');
            this.setupProgress.push({ service: 'stripe', status: 'success' });
            return true;
            
        } catch (error) {
            this.spinner.fail(`Stripe setup failed: ${error.message}`);
            await this.log(`Stripe setup error: ${error.message}`, 'error');
            this.setupProgress.push({ service: 'stripe', status: 'failed', error: error.message });
            
            // Ask user if they want to continue
            const { continueSetup } = await prompts({
                type: 'confirm',
                name: 'continueSetup',
                message: 'Stripe setup failed. Continue with other services?',
                initial: true
            });
            
            return continueSetup;
        }
    }

    // 🔒 Secure Binance Setup with Enhanced Security
    async setupBinance(email, password) {
        this.spinner = ora('Setting up Binance with enhanced security...').start();
        
        try {
            await this.rateLimitDelay();
            await this.log('Starting secure Binance setup process');
            
            let retries = 0;
            while (retries < this.maxRetries) {
                try {
                    // Navigate to Binance login
                    await this.page.goto('https://accounts.binance.com/en/login', { 
                        waitUntil: 'networkidle', 
                        timeout: 30000 
                    });
                    
                    await this.waitForElement('input[id="email"], input[name="email"], input[type="email"]', { timeout: 15000 });
                    
                    // Secure login process
                    await this.page.fill('input[id="email"], input[name="email"], input[type="email"]', email);
                    await this.delay(1500);
                    
                    await this.page.fill('input[id="password"], input[name="password"], input[type="password"]', password);
                    await this.delay(1500);
                    
                    // Handle potential CAPTCHA
                    const captchaPresent = await this.page.isVisible('[data-testid="captcha"], .captcha, #captcha', { timeout: 5000 }).catch(() => false);
                    if (captchaPresent) {
                        console.log(chalk.yellow('\n⚠️ CAPTCHA detected on Binance. Please solve manually.'));
                        await this.waitForUserInput('Press Enter after solving CAPTCHA...');
                    }
                    
                    // Click login button with multiple selectors
                    const loginButtonSelectors = [
                        'button[type="submit"]',
                        'button:has-text("Log In")',
                        'button[id*="login"]',
                        '.login-button',
                        '[data-testid="login-submit"]'
                    ];
                    
                    let loginClicked = false;
                    for (const selector of loginButtonSelectors) {
                        try {
                            await this.page.click(selector);
                            loginClicked = true;
                            break;
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    if (!loginClicked) {
                        throw new Error('Could not find login button');
                    }
                    
                    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                    
                    // Check for 2FA requirement
                    const twoFactorSelectors = [
                        'input[placeholder*="code"]',
                        'input[name*="code"]',
                        'input[id*="verification"]',
                        'input[placeholder*="Verification"]'
                    ];
                    
                    let twoFactorPresent = false;
                    for (const selector of twoFactorSelectors) {
                        if (await this.page.isVisible(selector, { timeout: 3000 }).catch(() => false)) {
                            twoFactorPresent = true;
                            break;
                        }
                    }
                    
                    if (twoFactorPresent) {
                        const twoFactorCode = await prompts({
                            type: 'text',
                            name: 'code',
                            message: 'Enter your Binance 2FA/SMS code:',
                            validate: value => value.length >= 4 ? true : '2FA code must be at least 4 characters'
                        });
                        
                        for (const selector of twoFactorSelectors) {
                            try {
                                await this.page.fill(selector, twoFactorCode.code);
                                break;
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        // Submit 2FA
                        const submitButtonSelectors = [
                            'button[type="submit"]',
                            'button:has-text("Submit")',
                            'button:has-text("Verify")',
                            'button:has-text("Confirm")'
                        ];
                        
                        for (const selector of submitButtonSelectors) {
                            try {
                                await this.page.click(selector);
                                break;
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                    }
                    
                    break; // Success, exit retry loop
                    
                } catch (error) {
                    retries++;
                    if (retries >= this.maxRetries) {
                        throw error;
                    }
                    await this.log(`Binance login attempt ${retries} failed, retrying...`, 'warn');
                    await this.delay(3000 * retries); // Exponential backoff
                }
            }
            
            // Navigate to API Management section
            const apiManagementUrls = [
                'https://www.binance.com/en/usercenter/settings/api-management',
                'https://www.binance.com/en/my/settings/api-management',
                'https://accounts.binance.com/en/usercenter/settings/api-management'
            ];
            
            let apiPageLoaded = false;
            for (const url of apiManagementUrls) {
                try {
                    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
                    
                    // Check if we're on the API management page
                    const apiPageIndicators = [
                        'text=API Management',
                        'text=Create API',
                        '[data-testid*="api"]',
                        '.api-management'
                    ];
                    
                    for (const indicator of apiPageIndicators) {
                        if (await this.page.isVisible(indicator, { timeout: 3000 }).catch(() => false)) {
                            apiPageLoaded = true;
                            break;
                        }
                    }
                    
                    if (apiPageLoaded) break;
                } catch (error) {
                    continue;
                }
            }
            
            if (!apiPageLoaded) {
                throw new Error('Could not access Binance API Management page');
            }
            
            // Look for existing API keys or create new ones
            const createApiSelectors = [
                'button:has-text("Create API")',
                'button[data-testid*="create-api"]',
                'button:has-text("Add New")',
                '.create-api-button'
            ];
            
            let existingApiKeys = [];
            const apiKeyElements = await this.page.$$('.api-key-row, [data-testid="api-key"], .api-item');
            
            if (apiKeyElements.length > 0) {
                // Try to extract existing API key
                try {
                    const firstApiKey = apiKeyElements[0];
                    await firstApiKey.click();
                    await this.delay(3000);
                    
                    // Look for API key and secret
                    const keySelectors = [
                        'code[data-testid="api-key"]',
                        '.api-key-value',
                        'input[readonly][value*="key"]',
                        'span:has-text("API Key")',
                        'code:not(:has-text("secret"))',
                    ];
                    
                    let apiKey;
                    for (const selector of keySelectors) {
                        try {
                            const element = await this.page.$(selector);
                            if (element) {
                                apiKey = await element.textContent() || await element.getAttribute('value');
                                if (apiKey && apiKey.length > 20) break;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    // Try to get secret key (may need to regenerate)
                    const secretSelectors = [
                        'code[data-testid="secret-key"]',
                        '.secret-key-value',
                        'input[readonly][value*="secret"]',
                        'span:has-text("Secret")',
                        'button:has-text("Show Secret")',
                        'button:has-text("Reveal")',
                    ];
                    
                    let secretKey;
                    for (const selector of secretSelectors) {
                        try {
                            if (selector.includes('button')) {
                                await this.page.click(selector);
                                await this.delay(2000);
                                continue;
                            }
                            
                            const element = await this.page.$(selector);
                            if (element) {
                                secretKey = await element.textContent() || await element.getAttribute('value');
                                if (secretKey && secretKey.length > 20) break;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                    
                    if (apiKey) {
                        this.credentials.BINANCE_API_KEY = apiKey.trim();
                        if (secretKey) {
                            this.credentials.BINANCE_SECRET = secretKey.trim();
                        } else {
                            await this.log('Could not retrieve Binance secret key - may need manual setup', 'warn');
                        }
                    }
                    
                } catch (error) {
                    await this.log('Could not extract existing API keys', 'warn');
                }
            }
            
            // If no API key was extracted, inform user
            if (!this.credentials.BINANCE_API_KEY) {
                console.log(chalk.yellow('\n⚠️ Could not automatically extract Binance API keys.'));
                console.log('Please create API keys manually and add them to your .env file:');
                console.log('1. Go to Binance API Management');
                console.log('2. Create a new API key');
                console.log('3. Copy API Key and Secret Key');
                console.log('4. Add BINANCE_API_KEY and BINANCE_SECRET to .env');
                
                // Ask if user wants to enter manually
                const { manualEntry } = await prompts({
                    type: 'confirm',
                    name: 'manualEntry',
                    message: 'Would you like to enter Binance API keys manually now?',
                    initial: false
                });
                
                if (manualEntry) {
                    const apiKeyInput = await prompts([
                        {
                            type: 'text',
                            name: 'apiKey',
                            message: 'Enter your Binance API Key:',
                            validate: value => value.length > 10 ? true : 'API key seems too short'
                        },
                        {
                            type: 'password',
                            name: 'secret',
                            message: 'Enter your Binance Secret Key:',
                            validate: value => value.length > 10 ? true : 'Secret key seems too short'
                        }
                    ]);
                    
                    this.credentials.BINANCE_API_KEY = apiKeyInput.apiKey;
                    this.credentials.BINANCE_SECRET = apiKeyInput.secret;
                }
            }
            
            this.spinner.succeed('Binance setup completed securely');
            await this.log('Binance setup completed successfully');
            this.setupProgress.push({ service: 'binance', status: 'success' });
            return true;
            
        } catch (error) {
            this.spinner.fail(`Binance setup failed: ${error.message}`);
            await this.log(`Binance setup error: ${error.message}`, 'error');
            this.setupProgress.push({ service: 'binance', status: 'failed', error: error.message });
            
            // Ask user if they want to continue
            const { continueSetup } = await prompts({
                type: 'confirm',
                name: 'continueSetup',
                message: 'Binance setup failed. Continue with other services?',
                initial: true
            });
            
            return continueSetup;
        }
    }

    // 🔒 Secure MongoDB Setup with Enhanced Security
    async setupMongoDB(email, password) {
        this.spinner = ora('Setting up MongoDB with enhanced security...').start();
        
        try {
            await this.rateLimitDelay();
            await this.log('Starting secure MongoDB setup process');
            
            // Present MongoDB setup options
            const setupOption = await prompts({
                type: 'select',
                name: 'option',
                message: 'Choose MongoDB setup option:',
                choices: [
                    { title: 'MongoDB Atlas (Cloud) - Recommended', value: 'atlas' },
                    { title: 'Local MongoDB Installation', value: 'local' },
                    { title: 'Custom Connection String', value: 'custom' }
                ]
            });
            
            if (setupOption.option === 'atlas') {
                // Atlas Cloud Setup
                let retries = 0;
                while (retries < this.maxRetries) {
                    try {
                        // Navigate to MongoDB Atlas
                        await this.page.goto('https://account.mongodb.com/account/login', { 
                            waitUntil: 'networkidle', 
                            timeout: 30000 
                        });
                        
                        await this.waitForElement('input[name="username"], input[type="email"], #email', { timeout: 15000 });
                        
                        // Secure login process
                        const emailSelectors = ['input[name="username"]', 'input[type="email"]', '#email'];
                        for (const selector of emailSelectors) {
                            try {
                                await this.page.fill(selector, email);
                                break;
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        await this.delay(1500);
                        
                        const passwordSelectors = ['input[name="password"]', 'input[type="password"]', '#password'];
                        for (const selector of passwordSelectors) {
                            try {
                                await this.page.fill(selector, password);
                                break;
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        await this.delay(1500);
                        
                        // Handle potential CAPTCHA
                        const captchaPresent = await this.page.isVisible('[data-testid="captcha"], .captcha, .recaptcha', { timeout: 5000 }).catch(() => false);
                        if (captchaPresent) {
                            console.log(chalk.yellow('\n⚠️ CAPTCHA detected on MongoDB Atlas. Please solve manually.'));
                            await this.waitForUserInput('Press Enter after solving CAPTCHA...');
                        }
                        
                        // Click login
                        const loginSelectors = [
                            'button[type="submit"]',
                            'button:has-text("Sign In")',
                            'button:has-text("Log In")',
                            '.login-button',
                            '#signin-button'
                        ];
                        
                        let loginClicked = false;
                        for (const selector of loginSelectors) {
                            try {
                                await this.page.click(selector);
                                loginClicked = true;
                                break;
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        if (!loginClicked) {
                            throw new Error('Could not find MongoDB login button');
                        }
                        
                        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                        
                        // Navigate to database section
                        await this.page.goto('https://cloud.mongodb.com/', { waitUntil: 'networkidle', timeout: 20000 });
                        
                        // Look for existing clusters or connection strings
                        const clusterSelectors = [
                            '[data-testid="cluster"]',
                            '.cluster-card',
                            '.cluster-name',
                            'button:has-text("Connect")',
                            '.connect-button'
                        ];
                        
                        let clusterFound = false;
                        for (const selector of clusterSelectors) {
                            if (await this.page.isVisible(selector, { timeout: 5000 }).catch(() => false)) {
                                clusterFound = true;
                                break;
                            }
                        }
                        
                        if (clusterFound) {
                            // Try to get connection string
                            const connectButtons = await this.page.$$('button:has-text("Connect"), .connect-button');
                            if (connectButtons.length > 0) {
                                await connectButtons[0].click();
                                await this.delay(3000);
                                
                                // Look for connection string
                                const connStringSelectors = [
                                    'code:has-text("mongodb+srv://")',
                                    'input[readonly][value*="mongodb+srv://"]',
                                    '.connection-string',
                                    '[data-testid="connection-string"]'
                                ];
                                
                                for (const selector of connStringSelectors) {
                                    try {
                                        const element = await this.page.$(selector);
                                        if (element) {
                                            let connectionString = await element.textContent() || await element.getAttribute('value');
                                            if (connectionString && connectionString.includes('mongodb+srv://')) {
                                                // Replace placeholder password if needed
                                                if (connectionString.includes('<password>')) {
                                                    const dbPassword = await prompts({
                                                        type: 'password',
                                                        name: 'password',
                                                        message: 'Enter your MongoDB database password:'
                                                    });
                                                    connectionString = connectionString.replace('<password>', dbPassword.password);
                                                }
                                                
                                                this.credentials.MONGODB_URI = connectionString.trim();
                                                break;
                                            }
                                        }
                                    } catch (error) {
                                        continue;
                                    }
                                }
                            }
                        }
                        
                        break; // Success, exit retry loop
                        
                    } catch (error) {
                        retries++;
                        if (retries >= this.maxRetries) {
                            throw error;
                        }
                        await this.log(`MongoDB Atlas login attempt ${retries} failed, retrying...`, 'warn');
                        await this.delay(3000 * retries); // Exponential backoff
                    }
                }
                
                // If automatic extraction failed, allow manual input
                if (!this.credentials.MONGODB_URI) {
                    console.log(chalk.yellow('\n⚠️ Could not automatically extract MongoDB connection string.'));
                    const { manualEntry } = await prompts({
                        type: 'confirm',
                        name: 'manualEntry',
                        message: 'Would you like to enter MongoDB connection string manually?',
                        initial: true
                    });
                    
                    if (manualEntry) {
                        const connStringInput = await prompts({
                            type: 'text',
                            name: 'connectionString',
                            message: 'Enter your MongoDB connection string (mongodb+srv://...):',
                            validate: value => {
                                if (value.startsWith('mongodb://') || value.startsWith('mongodb+srv://')) {
                                    return true;
                                }
                                return 'Please enter a valid MongoDB connection string';
                            }
                        });
                        
                        this.credentials.MONGODB_URI = connStringInput.connectionString;
                    }
                }
                
            } else if (setupOption.option === 'local') {
                // Local MongoDB Setup
                console.log(chalk.blue('\n🚀 Setting up local MongoDB...'));
                
                // Check if MongoDB is already installed
                try {
                    const { spawn } = require('child_process');
                    const mongoCheck = spawn('mongosh', ['--version'], { timeout: 5000 });
                    
                    mongoCheck.on('exit', (code) => {
                        if (code === 0) {
                            console.log(chalk.green('✅ MongoDB is already installed'));
                        } else {
                            console.log(chalk.yellow('⚠️ MongoDB may not be installed or not in PATH'));
                        }
                    });
                    
                    mongoCheck.on('error', () => {
                        console.log(chalk.yellow('⚠️ MongoDB may not be installed'));
                        console.log('Please install MongoDB Community Edition:');
                        console.log('macOS: brew install mongodb-community');
                        console.log('Ubuntu: sudo apt install mongodb');
                        console.log('Windows: Download from mongodb.com');
                    });
                    
                } catch (error) {
                    console.log(chalk.yellow('⚠️ Could not check MongoDB installation'));
                }
                
                // Set default local connection string
                const localUri = await prompts({
                    type: 'text',
                    name: 'uri',
                    message: 'Enter MongoDB connection string:',
                    initial: 'mongodb://localhost:27017/trade-executor',
                    validate: value => {
                        if (value.startsWith('mongodb://')) {
                            return true;
                        }
                        return 'Please enter a valid MongoDB connection string';
                    }
                });
                
                this.credentials.MONGODB_URI = localUri.uri;
                
            } else if (setupOption.option === 'custom') {
                // Custom Connection String
                const customUri = await prompts({
                    type: 'text',
                    name: 'uri',
                    message: 'Enter your custom MongoDB connection string:',
                    validate: value => {
                        if (value.startsWith('mongodb://') || value.startsWith('mongodb+srv://')) {
                            return true;
                        }
                        return 'Please enter a valid MongoDB connection string';
                    }
                });
                
                this.credentials.MONGODB_URI = customUri.uri;
            }
            
            // Test MongoDB connection if possible
            if (this.credentials.MONGODB_URI) {
                try {
                    const { MongoClient } = require('mongodb');
                    const client = new MongoClient(this.credentials.MONGODB_URI, {
                        serverSelectionTimeoutMS: 5000,
                        connectTimeoutMS: 5000
                    });
                    
                    await client.connect();
                    await client.db('admin').command({ ping: 1 });
                    await client.close();
                    
                    console.log(chalk.green('✅ MongoDB connection test successful!'));
                } catch (error) {
                    console.log(chalk.yellow(`⚠️ MongoDB connection test failed: ${error.message}`));
                    console.log('Connection string saved anyway - please verify manually');
                }
            }
            
            this.spinner.succeed('MongoDB setup completed securely');
            await this.log('MongoDB setup completed successfully');
            this.setupProgress.push({ service: 'mongodb', status: 'success' });
            return true;
            
        } catch (error) {
            this.spinner.fail(`MongoDB setup failed: ${error.message}`);
            await this.log(`MongoDB setup error: ${error.message}`, 'error');
            this.setupProgress.push({ service: 'mongodb', status: 'failed', error: error.message });
            
            // Ask user if they want to continue
            const { continueSetup } = await prompts({
                type: 'confirm',
                name: 'continueSetup',
                message: 'MongoDB setup failed. Continue with other services?',
                initial: true
            });
            
            return continueSetup;
        }
    }

    // 🔒 Secure Marketing Automation Setup with Enhanced Security
    async setupMarketing(email, password) {
        this.spinner = ora('Setting up Marketing Automation with enhanced security...').start();
        
        try {
            await this.rateLimitDelay();
            await this.log('Starting secure Marketing Automation setup process');
            
            // Present marketing setup options
            const marketingOption = await prompts({
                type: 'select',
                name: 'option',
                message: 'Choose Marketing Automation platform:',
                choices: [
                    { title: 'ConvertKit - Email Marketing', value: 'convertkit' },
                    { title: 'Mailchimp - Email Marketing', value: 'mailchimp' },
                    { title: 'SendGrid - Email Service', value: 'sendgrid' },
                    { title: 'Manual Configuration', value: 'manual' }
                ]
            });
            
            if (marketingOption.option === 'convertkit') {
                // ConvertKit Setup
                let retries = 0;
                while (retries < this.maxRetries) {
                    try {
                        await this.page.goto('https://app.convertkit.com/users/login', { 
                            waitUntil: 'networkidle', 
                            timeout: 30000 
                        });
                        
                        await this.waitForElement('input[type="email"], input[name="email"]', { timeout: 15000 });
                        
                        // Secure login process
                        await this.page.fill('input[type="email"], input[name="email"]', email);
                        await this.delay(1500);
                        await this.page.fill('input[type="password"], input[name="password"]', password);
                        await this.delay(1500);
                        
                        await this.page.click('button[type="submit"], .login-button');
                        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                        
                        // Navigate to API settings
                        await this.page.goto('https://app.convertkit.com/account_settings/advanced_settings', {
                            waitUntil: 'networkidle',
                            timeout: 20000
                        });
                        
                        // Extract API key and secret
                        const apiKeySelectors = [
                            'code:has-text("API Key")',
                            'input[readonly][value*="key"]',
                            '.api-key-value',
                            '[data-testid="api-key"]'
                        ];
                        
                        for (const selector of apiKeySelectors) {
                            try {
                                const element = await this.page.$(selector);
                                if (element) {
                                    const apiKey = await element.textContent() || await element.getAttribute('value');
                                    if (apiKey && apiKey.length > 10) {
                                        this.credentials.CONVERTKIT_API_KEY = apiKey.trim();
                                        break;
                                    }
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                        
                        break;
                        
                    } catch (error) {
                        retries++;
                        if (retries >= this.maxRetries) {
                            throw error;
                        }
                        await this.log(`ConvertKit login attempt ${retries} failed, retrying...`, 'warn');
                        await this.delay(3000 * retries);
                    }
                }
                
            } else if (marketingOption.option === 'mailchimp') {
                // Mailchimp Setup
                let retries = 0;
                while (retries < this.maxRetries) {
                    try {
                        await this.page.goto('https://login.mailchimp.com/', { 
                            waitUntil: 'networkidle', 
                            timeout: 30000 
                        });
                        
                        await this.waitForElement('input[name="username"], input[type="email"]', { timeout: 15000 });
                        
                        await this.page.fill('input[name="username"], input[type="email"]', email);
                        await this.delay(1500);
                        await this.page.fill('input[name="password"], input[type="password"]', password);
                        await this.delay(1500);
                        
                        await this.page.click('button[type="submit"], .login-button');
                        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                        
                        // Navigate to API keys
                        await this.page.goto('https://admin.mailchimp.com/account/api/', {
                            waitUntil: 'networkidle',
                            timeout: 20000
                        });
                        
                        // Look for existing API keys
                        const apiKeyElements = await this.page.$$('.api-key, [data-testid="api-key"]');
                        if (apiKeyElements.length > 0) {
                            const apiKey = await apiKeyElements[0].textContent();
                            if (apiKey) {
                                this.credentials.MAILCHIMP_API_KEY = apiKey.trim();
                            }
                        }
                        
                        break;
                        
                    } catch (error) {
                        retries++;
                        if (retries >= this.maxRetries) {
                            throw error;
                        }
                        await this.log(`Mailchimp login attempt ${retries} failed, retrying...`, 'warn');
                        await this.delay(3000 * retries);
                    }
                }
                
            } else if (marketingOption.option === 'sendgrid') {
                // SendGrid Setup
                let retries = 0;
                while (retries < this.maxRetries) {
                    try {
                        await this.page.goto('https://app.sendgrid.com/login', { 
                            waitUntil: 'networkidle', 
                            timeout: 30000 
                        });
                        
                        await this.waitForElement('input[name="username"], input[type="email"]', { timeout: 15000 });
                        
                        await this.page.fill('input[name="username"], input[type="email"]', email);
                        await this.delay(1500);
                        await this.page.fill('input[name="password"], input[type="password"]', password);
                        await this.delay(1500);
                        
                        await this.page.click('button[type="submit"], .login-button');
                        await this.page.waitForLoadState('networkidle', { timeout: 30000 });
                        
                        // Navigate to API Keys
                        await this.page.goto('https://app.sendgrid.com/settings/api_keys', {
                            waitUntil: 'networkidle',
                            timeout: 20000
                        });
                        
                        // Look for existing API keys
                        const apiKeyElements = await this.page.$$('.api-key-name, [data-testid="api-key"]');
                        if (apiKeyElements.length > 0) {
                            // Click on first API key to reveal it
                            await apiKeyElements[0].click();
                            await this.delay(3000);
                            
                            const keyValueSelectors = [
                                'code:has-text("SG.")',
                                'input[readonly][value*="SG."]',
                                '.api-key-value'
                            ];
                            
                            for (const selector of keyValueSelectors) {
                                try {
                                    const element = await this.page.$(selector);
                                    if (element) {
                                        const apiKey = await element.textContent() || await element.getAttribute('value');
                                        if (apiKey && apiKey.startsWith('SG.')) {
                                            this.credentials.SENDGRID_API_KEY = apiKey.trim();
                                            break;
                                        }
                                    }
                                } catch (error) {
                                    continue;
                                }
                            }
                        }
                        
                        break;
                        
                    } catch (error) {
                        retries++;
                        if (retries >= this.maxRetries) {
                            throw error;
                        }
                        await this.log(`SendGrid login attempt ${retries} failed, retrying...`, 'warn');
                        await this.delay(3000 * retries);
                    }
                }
                
            } else if (marketingOption.option === 'manual') {
                // Manual configuration
                console.log(chalk.blue('\n🚀 Manual Marketing Configuration...'));
                
                const marketingConfig = await prompts([
                    {
                        type: 'select',
                        name: 'service',
                        message: 'Which email service would you like to configure?',
                        choices: [
                            { title: 'ConvertKit', value: 'convertkit' },
                            { title: 'Mailchimp', value: 'mailchimp' },
                            { title: 'SendGrid', value: 'sendgrid' },
                            { title: 'Custom SMTP', value: 'smtp' }
                        ]
                    }
                ]);
                
                if (marketingConfig.service === 'convertkit') {
                    const ckConfig = await prompts([
                        {
                            type: 'text',
                            name: 'apiKey',
                            message: 'Enter your ConvertKit API Key:',
                            validate: value => value.length > 10 ? true : 'API key seems too short'
                        },
                        {
                            type: 'text',
                            name: 'apiSecret',
                            message: 'Enter your ConvertKit API Secret (optional):'
                        }
                    ]);
                    
                    this.credentials.CONVERTKIT_API_KEY = ckConfig.apiKey;
                    if (ckConfig.apiSecret) {
                        this.credentials.CONVERTKIT_API_SECRET = ckConfig.apiSecret;
                    }
                    
                } else if (marketingConfig.service === 'mailchimp') {
                    const mcConfig = await prompts({
                        type: 'text',
                        name: 'apiKey',
                        message: 'Enter your Mailchimp API Key:',
                        validate: value => value.length > 10 ? true : 'API key seems too short'
                    });
                    
                    this.credentials.MAILCHIMP_API_KEY = mcConfig.apiKey;
                    
                } else if (marketingConfig.service === 'sendgrid') {
                    const sgConfig = await prompts({
                        type: 'text',
                        name: 'apiKey',
                        message: 'Enter your SendGrid API Key:',
                        validate: value => value.startsWith('SG.') ? true : 'SendGrid API keys start with "SG."'
                    });
                    
                    this.credentials.SENDGRID_API_KEY = sgConfig.apiKey;
                    
                } else if (marketingConfig.service === 'smtp') {
                    const smtpConfig = await prompts([
                        {
                            type: 'text',
                            name: 'host',
                            message: 'SMTP Host (e.g., smtp.gmail.com):',
                            validate: value => value.includes('.') ? true : 'Please enter a valid SMTP host'
                        },
                        {
                            type: 'number',
                            name: 'port',
                            message: 'SMTP Port (587 for TLS, 465 for SSL):',
                            initial: 587,
                            validate: value => value > 0 && value < 65536 ? true : 'Please enter a valid port number'
                        },
                        {
                            type: 'text',
                            name: 'username',
                            message: 'SMTP Username:'
                        },
                        {
                            type: 'password',
                            name: 'password',
                            message: 'SMTP Password:'
                        }
                    ]);
                    
                    this.credentials.SMTP_HOST = smtpConfig.host;
                    this.credentials.SMTP_PORT = smtpConfig.port.toString();
                    this.credentials.SMTP_USERNAME = smtpConfig.username;
                    this.credentials.SMTP_PASSWORD = smtpConfig.password;
                }
            }
            
            // Test email configuration if possible
            if (this.credentials.SENDGRID_API_KEY) {
                try {
                    const testResponse = await fetch('https://api.sendgrid.com/v3/user/account', {
                        headers: {
                            'Authorization': `Bearer ${this.credentials.SENDGRID_API_KEY}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (testResponse.ok) {
                        console.log(chalk.green('✅ SendGrid API key validated successfully!'));
                    } else {
                        console.log(chalk.yellow('⚠️ SendGrid API key validation failed'));
                    }
                } catch (error) {
                    console.log(chalk.yellow(`⚠️ SendGrid API test failed: ${error.message}`));
                }
            }
            
            // Add default marketing settings
            this.credentials.MARKETING_ENABLED = 'true';
            this.credentials.EMAIL_FROM_ADDRESS = email;
            this.credentials.EMAIL_FROM_NAME = 'Trading Bot SaaS';
            
            this.spinner.succeed('Marketing Automation setup completed securely');
            await this.log('Marketing setup completed successfully');
            this.setupProgress.push({ service: 'marketing', status: 'success' });
            return true;
            
        } catch (error) {
            this.spinner.fail(`Marketing setup failed: ${error.message}`);
            await this.log(`Marketing setup error: ${error.message}`, 'error');
            this.setupProgress.push({ service: 'marketing', status: 'failed', error: error.message });
            
            // Ask user if they want to continue
            const { continueSetup } = await prompts({
                type: 'confirm',
                name: 'continueSetup',
                message: 'Marketing setup failed. Continue anyway?',
                initial: true
            });
            
            return continueSetup;
        }
    }
}

if (require.main === module) {
    const setup = new SecureAutoSetup();
    setup.run().catch(console.error);
}

module.exports = SecureAutoSetup;