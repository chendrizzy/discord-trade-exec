import { Bot, TrendingUp, Shield, Zap, BarChart3, Users } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

export function Landing() {
  const handleGetStarted = () => {
    window.location.href = '/auth/discord';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20">
      {/* Skip Navigation Link for Keyboard Users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>

      {/* Hero Section */}
      <div id="main-content" className="container mx-auto px-4 pt-20 pb-16">
        <div className="text-center max-w-4xl mx-auto space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tight">
              Automated Trading
              <span className="block mt-2 bg-gradient-to-r from-gold-500 to-gold-300 bg-clip-text text-transparent">
                Made Simple
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto">
              Execute trades automatically from Discord signals. Connect your brokers, set your rules, and let the bot
              do the rest.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" onClick={handleGetStarted} className="text-lg px-8 py-6">
              <Bot className="mr-2 h-5 w-5" />
              Get Started Free
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8 py-6" onClick={() => window.location.href = '#features'}>
              Learn More
            </Button>
          </div>

          <div className="flex flex-wrap gap-6 justify-center text-sm text-muted-foreground pt-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-500" />
              <span>Encrypted Credentials</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-gold-500" />
              <span>Instant Execution</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span>Multi-Broker Support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div id="features" className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything You Need to Trade Smarter</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Connect your Discord community to your trading accounts with enterprise-grade security and lightning-fast execution.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Card>
            <CardHeader>
              <div className="mb-4">
                <Bot className="h-12 w-12 text-gold-500" />
              </div>
              <CardTitle>Discord Integration</CardTitle>
              <CardDescription>
                Receive trading signals directly from your Discord communities. Parse signals automatically and execute
                trades in milliseconds.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4">
                <TrendingUp className="h-12 w-12 text-blue-500" />
              </div>
              <CardTitle>Multi-Broker Support</CardTitle>
              <CardDescription>
                Connect Alpaca, Charles Schwab, TD Ameritrade, Interactive Brokers, and crypto exchanges. Trade stocks,
                options, and crypto from one platform.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4">
                <Shield className="h-12 w-12 text-green-500" />
              </div>
              <CardTitle>Bank-Level Security</CardTitle>
              <CardDescription>
                Your credentials are encrypted with AES-256-GCM and AWS KMS. OAuth2 tokens are automatically refreshed
                and securely stored.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4">
                <BarChart3 className="h-12 w-12 text-purple-500" />
              </div>
              <CardTitle>Risk Management</CardTitle>
              <CardDescription>
                Set position limits, daily loss caps, and stop-losses. Automated risk controls protect your capital
                24/7.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4">
                <Zap className="h-12 w-12 text-gold-500" />
              </div>
              <CardTitle>Lightning Fast</CardTitle>
              <CardDescription>
                WebSocket real-time updates, optimized order routing, and sub-second execution. Never miss a trade
                opportunity.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-4">
                <Users className="h-12 w-12 text-pink-500" />
              </div>
              <CardTitle>Signal Providers</CardTitle>
              <CardDescription>
                Subscribe to professional signal providers or create your own. Track performance, manage subscriptions,
                and grow your community.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* How It Works Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start trading in minutes with our simple 3-step process
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-gold-500/10 flex items-center justify-center text-2xl font-bold text-gold-500">
              1
            </div>
            <h3 className="text-xl font-semibold">Connect Discord</h3>
            <p className="text-muted-foreground">
              Sign in with your Discord account. Join trading signal channels and communities.
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-2xl font-bold text-blue-500">
              2
            </div>
            <h3 className="text-xl font-semibold">Link Your Brokers</h3>
            <p className="text-muted-foreground">
              Securely connect your trading accounts via OAuth2. Set your risk parameters and preferences.
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-2xl font-bold text-green-500">
              3
            </div>
            <h3 className="text-xl font-semibold">Automate Trading</h3>
            <p className="text-muted-foreground">
              Signals are automatically parsed and executed. Monitor performance in real-time from your dashboard.
            </p>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto text-center">
          <div>
            <div className="text-4xl md:text-5xl font-bold text-gold-500 mb-2">99.9%</div>
            <div className="text-sm text-muted-foreground">Uptime SLA</div>
          </div>
          <div>
            <div className="text-4xl md:text-5xl font-bold text-blue-500 mb-2">&lt;100ms</div>
            <div className="text-sm text-muted-foreground">Avg Execution</div>
          </div>
          <div>
            <div className="text-4xl md:text-5xl font-bold text-green-500 mb-2">5+</div>
            <div className="text-sm text-muted-foreground">Broker Integrations</div>
          </div>
          <div>
            <div className="text-4xl md:text-5xl font-bold text-purple-500 mb-2">AES-256</div>
            <div className="text-sm text-muted-foreground">Encryption</div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16">
        <Card className="max-w-3xl mx-auto bg-gradient-to-br from-gold-500/10 to-gold-300/10 border-gold-500/20">
          <CardContent className="p-12 text-center space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold">Ready to Automate Your Trading?</h2>
            <p className="text-lg text-muted-foreground">
              Join thousands of traders using Discord Trade Executor to streamline their workflow and never miss an
              opportunity.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" onClick={handleGetStarted} className="text-lg px-8 py-6">
                <Bot className="mr-2 h-5 w-5" />
                Start Trading Free
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-lg px-8 py-6"
                onClick={() => (window.location.href = '#features')}
              >
                View Pricing
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Discord Trade Executor</h3>
              <p className="text-sm text-muted-foreground">
                Automated trading platform for Discord communities.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="#features" className="hover:text-foreground transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-foreground transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/dashboard" className="hover:text-foreground transition-colors">
                    Dashboard
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/docs" className="hover:text-foreground transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="/support" className="hover:text-foreground transition-colors">
                    Support
                  </a>
                </li>
                <li>
                  <a href="/api" className="hover:text-foreground transition-colors">
                    API
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>
                  <a href="/terms" className="hover:text-foreground transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-foreground transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/security" className="hover:text-foreground transition-colors">
                    Security
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
            <p>&copy; 2025 Discord Trade Executor. All rights reserved.</p>
            <p className="mt-2">
              <strong>Disclaimer:</strong> Trading involves substantial risk of loss. This platform does not provide
              financial advice. You are solely responsible for your trading decisions.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
