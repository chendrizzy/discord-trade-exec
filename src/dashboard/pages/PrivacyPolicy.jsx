import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ArrowLeft } from 'lucide-react';

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      {/* Skip Navigation Link for Keyboard Users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      <div id="main-content" className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" onClick={() => window.history.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Privacy Policy</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
              <p>
                Discord Trade Executor ("we", "us", "our") is committed to protecting your privacy. This Privacy Policy
                explains how we collect, use, disclose, and safeguard your information when you use our automated trading
                platform ("Service").
              </p>
              <p className="mt-4 font-semibold">
                By using the Service, you consent to the data practices described in this policy.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">2.1 Account Information</h3>
              <p className="font-semibold">Discord Profile Data (via OAuth):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Discord username and user ID</li>
                <li>Email address (if publicly available)</li>
                <li>Profile avatar/picture</li>
                <li>Discriminator number</li>
              </ul>
              <p className="mt-2">We collect this information when you authenticate using Discord OAuth. We do NOT store your Discord password.</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">2.2 Broker Connection Data</h3>
              <p className="font-semibold">OAuth Tokens:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access tokens from connected brokers (Alpaca, Schwab, TD Ameritrade, etc.)</li>
                <li>Refresh tokens for automatic token renewal</li>
                <li>Token expiration timestamps</li>
                <li>OAuth state and nonce values</li>
              </ul>

              <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="font-semibold text-green-700 dark:text-green-400">Encryption:</p>
                <p className="mt-2">All broker credentials are encrypted using:</p>
                <ul className="list-disc pl-6 space-y-1 mt-2">
                  <li>AES-256-GCM symmetric encryption</li>
                  <li>AWS KMS (Key Management Service) for key management</li>
                  <li>Unique encryption keys per tenant/community</li>
                </ul>
              </div>

              <p className="mt-4 font-semibold">We do NOT store your broker account password or login credentials.</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">2.3 Trading Activity Data</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Account balances and buying power</li>
                <li>Open positions and pending orders</li>
                <li>Historical trades and fills</li>
                <li>Profit/loss calculations</li>
                <li>Asset allocations</li>
                <li>Trading signals received from Discord</li>
                <li>Signal execution results</li>
                <li>Risk management settings</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">2.4 Usage and Analytics Data</h3>
              <p>We collect technical information to improve the Service:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>IP address and geolocation (country/region only)</li>
                <li>Browser type and version</li>
                <li>Operating system</li>
                <li>Device type (desktop, mobile, tablet)</li>
                <li>Pages visited and features used</li>
                <li>API response times and error rates</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">2.5 Subscription and Billing Data</h3>
              <p>Payment information (processed by Polar.sh):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Subscription tier and status</li>
                <li>Billing email</li>
                <li>Payment method type (card brand, last 4 digits)</li>
                <li>Transaction history</li>
              </ul>
              <p className="mt-2 font-semibold">
                We do NOT store complete credit card numbers or CVV codes. Payment processing is handled securely by our payment provider.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">3.1 Core Service Functionality</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Authentication:</strong> Verify your identity via Discord OAuth</li>
                <li><strong>Trading Automation:</strong> Execute trades on your behalf using connected brokers</li>
                <li><strong>Portfolio Monitoring:</strong> Track your holdings and performance</li>
                <li><strong>Risk Management:</strong> Enforce position limits and stop-losses</li>
                <li><strong>Signal Distribution:</strong> Deliver trading signals from providers</li>
                <li><strong>Analytics:</strong> Generate reports and performance metrics</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">3.2 Service Improvement</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Product development and feature identification</li>
                <li>Bug fixes and reliability improvements</li>
                <li>Performance optimization</li>
                <li>A/B testing of new features</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">3.3 Communication</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Service updates and new feature notifications</li>
                <li>Security alerts about suspicious activity</li>
                <li>Billing notices and payment confirmations</li>
                <li>Support responses</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">4. Information Sharing and Disclosure</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">4.1 We DO Share Information With:</h3>

              <p className="font-semibold mt-4">Service Providers:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>AWS (Amazon Web Services):</strong> Hosting, KMS encryption, cloud infrastructure</li>
                <li><strong>MongoDB Atlas:</strong> Database storage and management</li>
                <li><strong>Polar.sh:</strong> Subscription billing and payment processing</li>
                <li><strong>Redis Cloud/Railway:</strong> Caching and session management</li>
                <li><strong>Sentry.io:</strong> Error tracking and monitoring (optional)</li>
              </ul>
              <p className="mt-2 text-sm">These providers have access only to perform tasks on our behalf and are obligated to protect your data.</p>

              <p className="font-semibold mt-4">Broker APIs:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>We send your OAuth tokens to broker APIs to execute trades</li>
                <li>Brokers receive only the information necessary for trading (symbol, quantity, order type)</li>
                <li>Each broker has their own privacy policy governing their data use</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">4.2 We DO NOT:</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>❌ Sell your personal data to advertisers or data brokers</li>
                <li>❌ Share your trading activity with competitors</li>
                <li>❌ Provide your email to third-party marketers</li>
                <li>❌ Disclose your positions or strategies publicly</li>
                <li>❌ Use your data to trade against you</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">4.3 Aggregated and Anonymized Data</h3>
              <p>We may share aggregated, non-personally-identifiable data:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Overall platform statistics (total users, trades per day)</li>
                <li>Industry trends and market insights</li>
                <li>Performance benchmarks (anonymized)</li>
              </ul>
              <p className="mt-2">This data cannot be used to identify individual users.</p>
            </section>

            <section className="mb-8 bg-green-500/10 p-6 rounded-lg border border-green-500/20">
              <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>

              <h3 className="text-xl font-semibold mb-2">5.1 Encryption</h3>

              <p className="font-semibold">At Rest:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Broker credentials: AES-256-GCM encryption</li>
                <li>Database: Encrypted MongoDB Atlas deployment</li>
                <li>Backups: Encrypted with separate keys</li>
                <li>AWS KMS: Enterprise-grade key management</li>
              </ul>

              <p className="font-semibold mt-4">In Transit:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>HTTPS/TLS 1.3 for all web traffic</li>
                <li>WSS (WebSocket Secure) for real-time updates</li>
                <li>OAuth 2.0 for broker authorization</li>
                <li>Secure API connections to all third parties</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">5.2 Access Controls</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Multi-Factor Authentication (MFA): Optional TOTP support</li>
                <li>Session Management: Secure cookie-based sessions</li>
                <li>API Rate Limiting: Prevents brute-force attacks</li>
                <li>RBAC: Role-based access control for admin functions</li>
                <li>Principle of Least Privilege: Staff access limited to necessary data only</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">5.3 Infrastructure Security</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Regular Security Audits: Third-party penetration testing</li>
                <li>Dependency Scanning: Automated vulnerability detection</li>
                <li>Secure Development: Code reviews and security-focused CI/CD</li>
                <li>Incident Response Plan: Documented breach notification procedures</li>
                <li>Backup and Recovery: Regular backups with geographic redundancy</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Data Retention</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">Active Account Data</h3>
              <p>We retain your data as long as your account is active:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Profile information: Stored indefinitely while account exists</li>
                <li>Trading history: Retained for accounting and tax purposes</li>
                <li>Broker connections: Maintained until you disconnect</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Deleted Account Data</h3>
              <p>When you delete your account:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Immediate:</strong> Access revoked, broker connections terminated</li>
                <li><strong>30 days:</strong> Personal data deleted from production systems</li>
                <li><strong>90 days:</strong> Data purged from backups and archives</li>
                <li><strong>Indefinite:</strong> Legal/regulatory data retained as required by law</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Legal Hold</h3>
              <p>Some data may be retained beyond standard retention periods:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Tax records: 7 years (IRS requirement)</li>
                <li>Legal disputes: Until resolution</li>
                <li>Regulatory investigations: Until closure</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Your Privacy Rights</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">7.1 Access and Portability</h3>
              <p>You have the right to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>View</strong> your personal data through the dashboard</li>
                <li><strong>Export</strong> your data in machine-readable format (JSON)</li>
                <li><strong>Request a copy</strong> of all data we hold about you</li>
              </ul>
              <p className="mt-2 text-sm"><strong>How to access:</strong> Dashboard → Settings → Privacy → Download My Data</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">7.2 Correction and Update</h3>
              <p>You can:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Edit</strong> your profile information in Settings</li>
                <li><strong>Update</strong> risk parameters and trading preferences</li>
                <li><strong>Request corrections</strong> to inaccurate data</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">7.3 Deletion and Erasure</h3>
              <p>You can:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Disconnect brokers</strong> individually (Settings → Brokers → Disconnect)</li>
                <li><strong>Delete your account</strong> entirely (Settings → Account → Delete Account)</li>
                <li><strong>Request data deletion</strong> by emailing privacy@yourdomain.com</li>
              </ul>
              <p className="mt-2 text-sm font-semibold">Important: Account deletion is irreversible and results in loss of all data.</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">7.4 Objection and Restriction</h3>
              <p>You can:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Opt out of marketing emails (unsubscribe link in emails)</li>
                <li>Disable certain analytics cookies (browser settings)</li>
                <li>Restrict processing for specific purposes (contact us)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. International Data Transfers</h2>
              <p>Your data may be processed in:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>United States:</strong> Primary hosting (AWS US-East-1)</li>
                <li><strong>European Union:</strong> Optional data residency</li>
                <li><strong>Other regions:</strong> As required for service providers</li>
              </ul>
              <p className="mt-4">We ensure international transfers comply with applicable laws:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Standard Contractual Clauses (SCCs) for EU data</li>
                <li>Adequacy decisions where applicable</li>
                <li>Provider agreements with data protection commitments</li>
              </ul>
              <p className="mt-4">By using the Service, you consent to international data transfers as described.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. California Privacy Rights (CCPA)</h2>
              <p>If you are a California resident, you have additional rights:</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">Right to Know</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Categories of personal information collected</li>
                <li>Sources of personal information</li>
                <li>Business purpose for collecting</li>
                <li>Categories of third parties we share with</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Right to Delete</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Request deletion of personal information</li>
                <li>Subject to legal/regulatory exceptions</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Right to Opt-Out</h3>
              <p className="font-semibold">We do NOT sell personal information - No opt-out necessary</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">Non-Discrimination</h3>
              <p>We will NOT discriminate against you for exercising CCPA rights. Same service quality regardless of privacy choices.</p>

              <p className="mt-4 text-sm"><strong>How to exercise:</strong> Email privacy@yourdomain.com or use Dashboard → Settings → Privacy</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. European Privacy Rights (GDPR)</h2>
              <p>If you are in the European Economic Area (EEA), you have additional rights:</p>

              <h3 className="text-xl font-semibold mb-2 mt-4">Legal Basis for Processing</h3>
              <p>We process your data under these legal bases:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Contract:</strong> To provide the Service you requested</li>
                <li><strong>Consent:</strong> For optional features (marketing emails, cookies)</li>
                <li><strong>Legitimate Interest:</strong> For fraud prevention, service improvement</li>
                <li><strong>Legal Obligation:</strong> To comply with laws</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Data Controller</h3>
              <p>Discord Trade Executor is the data controller for your personal data.</p>
              <p className="mt-2">
                <strong>Contact:</strong><br />
                Email: privacy@yourdomain.com<br />
                Address: [Your Business Address]
              </p>

              <h3 className="text-xl font-semibold mb-2 mt-4">Supervisory Authority</h3>
              <p>
                You have the right to lodge a complaint with your local data protection authority if you believe we have
                violated your privacy rights.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Cookies and Tracking</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">Types of Cookies</h3>

              <p className="font-semibold">Essential Cookies (Cannot be disabled):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Session authentication</li>
                <li>CSRF protection</li>
                <li>Load balancing</li>
              </ul>

              <p className="font-semibold mt-4">Analytics Cookies (Optional):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Page views and click tracking</li>
                <li>Feature usage statistics</li>
                <li>Performance monitoring</li>
              </ul>

              <p className="font-semibold mt-4">Preference Cookies (Optional):</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Theme selection (dark/light mode)</li>
                <li>Language preference</li>
                <li>Dashboard layout</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Cookie Management</h3>
              <p>Most browsers allow you to refuse or delete cookies. Visit your browser's help section for instructions.</p>
              <p className="mt-2 text-sm"><strong>Note:</strong> Disabling essential cookies may break core functionality.</p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">12. Changes to This Privacy Policy</h2>
              <p>We may update this Privacy Policy:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Material changes:</strong> 30 days advance notice via email</li>
                <li><strong>Minor updates:</strong> Notification in dashboard</li>
                <li><strong>Effective date:</strong> Updated at top of policy</li>
              </ul>
              <p className="mt-4">
                Continued use of the Service after changes constitutes acceptance of the updated policy.
              </p>
              <p className="mt-4">
                If you disagree with changes, you must stop using the Service and delete your account.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
              <p>For privacy-related questions, concerns, or requests:</p>
              <p className="mt-4">
                <strong>Email:</strong> privacy@yourdomain.com<br />
                <strong>Support:</strong> support@yourdomain.com<br />
                <strong>Website:</strong> https://yourdomain.com
              </p>
              <p className="mt-4">
                <strong>Data Protection Inquiries:</strong><br />
                GDPR requests: gdpr@yourdomain.com<br />
                CCPA requests: ccpa@yourdomain.com
              </p>
              <p className="mt-4"><strong>Response Time:</strong> We aim to respond within 30 days.</p>
            </section>

            <section className="mb-8 bg-gold-500/10 p-6 rounded-lg border border-gold-500/20">
              <h2 className="text-2xl font-semibold mb-4">Acknowledgment</h2>
              <p className="font-semibold">
                BY USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ AND UNDERSTOOD THIS PRIVACY POLICY AND CONSENT
                TO THE COLLECTION, USE, AND DISCLOSURE OF YOUR INFORMATION AS DESCRIBED.
              </p>
            </section>

            <p className="text-center text-sm text-muted-foreground mt-8 pt-8 border-t border-border">
              Version 1.0 - Effective January 2025
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
