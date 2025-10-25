import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ArrowLeft } from 'lucide-react';

export function TermsOfService() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button variant="ghost" onClick={() => window.history.back()} className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">Terms of Service</CardTitle>
            <p className="text-sm text-muted-foreground">Last Updated: January 2025</p>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">1. Agreement to Terms</h2>
              <p>
                By accessing or using Discord Trade Executor ("Service", "we", "us", or "our"), you agree to be bound
                by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access
                the Service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
              <p>Discord Trade Executor is an automated trading platform that:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Connects to your Discord communities to receive trading signals</li>
                <li>Integrates with trading brokers (stocks and crypto) via OAuth2 and API keys</li>
                <li>Executes trades automatically based on configured signals and risk parameters</li>
                <li>Provides portfolio monitoring, analytics, and risk management tools</li>
                <li>Offers subscription-based access to signal providers and advanced features</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">3. Account Registration</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">3.1 Discord Authentication</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>You must have a valid Discord account to use the Service</li>
                <li>You authorize us to access your Discord profile information for authentication</li>
                <li>You are responsible for maintaining the security of your Discord account</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">3.2 Broker Connections</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>You may connect trading brokers (Alpaca, Schwab, TD Ameritrade, etc.) to automate trading</li>
                <li>You authorize the Service to access your broker account on your behalf via OAuth2</li>
                <li>You are solely responsible for ensuring you have proper permissions from your broker</li>
                <li>You must comply with your broker's terms of service and trading policies</li>
              </ul>
            </section>

            <section className="mb-8 bg-destructive/10 p-6 rounded-lg border border-destructive/20">
              <h2 className="text-2xl font-semibold mb-4 text-destructive">4. Financial Disclaimers</h2>

              <h3 className="text-xl font-semibold mb-2">4.1 Not Financial Advice</h3>
              <p className="font-bold text-destructive">
                THE SERVICE DOES NOT PROVIDE FINANCIAL, INVESTMENT, TAX, OR LEGAL ADVICE.
              </p>
              <p className="mt-2">
                All trading signals, analytics, and information provided through the Service are for informational and
                educational purposes only. You are solely responsible for your own trading decisions.
              </p>

              <h3 className="text-xl font-semibold mb-2 mt-4">4.2 Trading Risks</h3>
              <p className="font-bold text-destructive">TRADING INVOLVES SUBSTANTIAL RISK OF LOSS</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Past performance does not guarantee future results</li>
                <li>You may lose some or all of your invested capital</li>
                <li>Automated trading does not eliminate risk</li>
                <li>Market conditions can change rapidly</li>
                <li>System failures, network issues, and other technical problems may occur</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">4.3 No Guarantees</h3>
              <p>We make NO GUARANTEES regarding:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Trading profitability or performance</li>
                <li>Accuracy of signals or analytics</li>
                <li>Uptime or availability of the Service</li>
                <li>Compatibility with all brokers or exchanges</li>
                <li>Error-free operation</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">5. Subscription and Billing</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>The Service offers various subscription tiers with different features</li>
                <li>Pricing is displayed on our website and may change with notice</li>
                <li>Subscriptions auto-renew unless canceled</li>
                <li>Subscription fees are generally non-refundable</li>
                <li>You may cancel your subscription at any time through your account settings</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">6. Use of Service</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">Permitted Use</h3>
              <p>You may use the Service to:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Receive and execute trading signals from authorized providers</li>
                <li>Monitor your portfolio and trading performance</li>
                <li>Configure risk management parameters</li>
                <li>Access analytics and reporting features</li>
              </ul>

              <h3 className="text-xl font-semibold mb-2 mt-4">Prohibited Use</h3>
              <p>You may NOT:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Use the Service for illegal activities or securities fraud</li>
                <li>Manipulate markets or engage in wash trading</li>
                <li>Share your account credentials with others</li>
                <li>Reverse engineer, decompile, or attempt to extract source code</li>
                <li>Bypass rate limits, security measures, or access controls</li>
                <li>Resell or redistribute the Service without authorization</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">7. Intellectual Property</h2>
              <p>
                The Service, including all code, designs, logos, and content, is our property and protected by
                copyright, trademark, and other intellectual property laws. You may not copy, modify, distribute, or
                create derivative works.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">8. Data and Privacy</h2>
              <p>We collect and process:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Discord profile information (username, ID, avatar)</li>
                <li>Broker credentials (encrypted with AES-256-GCM and AWS KMS)</li>
                <li>Trading activity and portfolio data</li>
                <li>Usage analytics and performance metrics</li>
              </ul>
              <p className="mt-4">
                See our{' '}
                <a href="/privacy" className="text-gold-500 hover:underline">
                  Privacy Policy
                </a>{' '}
                for complete details.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">9. Liability and Disclaimers</h2>

              <h3 className="text-xl font-semibold mb-2 mt-4">Disclaimer of Warranties</h3>
              <p className="font-bold">
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              </p>

              <h3 className="text-xl font-semibold mb-2 mt-4">Limitation of Liability</h3>
              <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>WE ARE NOT LIABLE FOR ANY TRADING LOSSES OR FINANCIAL DAMAGES</li>
                <li>OUR LIABILITY IS LIMITED TO THE AMOUNT YOU PAID FOR THE SERVICE IN THE PAST 12 MONTHS</li>
                <li>WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
                <li>WE ARE NOT LIABLE FOR THIRD-PARTY ACTIONS (brokers, signal providers, etc.)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">10. Modifications to Service and Terms</h2>
              <p>
                We may modify, add, or remove features at any time. We may update these Terms from time to time.
                Material changes will be communicated 30 days in advance. Continued use after changes constitutes
                acceptance.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
              <p className="font-semibold">Discord Trade Executor</p>
              <p>Email: support@yourdomain.com</p>
              <p>Website: https://yourdomain.com</p>
              <p className="mt-2">For legal inquiries: legal@yourdomain.com</p>
            </section>

            <section className="mb-8 bg-gold-500/10 p-6 rounded-lg border border-gold-500/20">
              <h2 className="text-2xl font-semibold mb-4">Acknowledgment</h2>
              <p className="font-semibold">
                BY USING THE SERVICE, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THESE
                TERMS OF SERVICE.
              </p>
              <p className="mt-4">
                YOU FURTHER ACKNOWLEDGE THE SUBSTANTIAL RISKS INVOLVED IN AUTOMATED TRADING AND ACCEPT FULL
                RESPONSIBILITY FOR YOUR TRADING DECISIONS AND OUTCOMES.
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
