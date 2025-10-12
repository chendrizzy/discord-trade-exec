const express = require('express');
const performanceTracker = require('./performance-tracker');
const rateLimiter = require('./rate-limiter');

class AnalyticsDashboard {
    constructor() {
        this.app = null;
    }

    /**
     * Create Express routes for the analytics dashboard
     * @param {express.Application} app - Express app instance
     */
    setupRoutes(app) {
        this.app = app;

        // Analytics dashboard HTML page
        app.get('/dashboard', (req, res) => {
            res.send(this.generateDashboardHTML());
        });

        // API endpoints for dashboard data
        app.get('/api/metrics', (req, res) => {
            try {
                const metrics = performanceTracker.getMetrics();
                res.json({
                    success: true,
                    timestamp: new Date().toISOString(),
                    data: metrics
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        app.get('/api/health', (req, res) => {
            try {
                const health = performanceTracker.getHealthStatus();
                res.json({
                    success: true,
                    timestamp: new Date().toISOString(),
                    data: health
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        app.get('/api/rate-limiting', (req, res) => {
            try {
                const rateLimitStats = rateLimiter.getStats();
                res.json({
                    success: true,
                    timestamp: new Date().toISOString(),
                    data: rateLimitStats
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Combined dashboard data
        app.get('/api/dashboard-data', (req, res) => {
            try {
                const data = {
                    metrics: performanceTracker.getMetrics(),
                    health: performanceTracker.getHealthStatus(),
                    rateLimiting: rateLimiter.getStats(),
                    timestamp: new Date().toISOString()
                };
                
                res.json({
                    success: true,
                    data
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        console.log('\u2713 Analytics dashboard routes configured');
        console.log('  - Dashboard UI: http://localhost:3000/dashboard');
        console.log('  - Metrics API: http://localhost:3000/api/metrics');
        console.log('  - Health API: http://localhost:3000/api/health');
    }

    /**
     * Generate the HTML dashboard page
     * @private
     */
    generateDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Discord Trade Executor - Analytics Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1a1a1a;
            color: #ffffff;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        
        .header .subtitle {
            font-size: 1.1rem;
            opacity: 0.9;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: #2d2d2d;
            padding: 20px;
            border-radius: 10px;
            border-left: 4px solid #667eea;
            transition: transform 0.2s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-5px);
        }
        
        .stat-card.warning {
            border-left-color: #f39c12;
        }
        
        .stat-card.error {
            border-left-color: #e74c3c;
        }
        
        .stat-card.success {
            border-left-color: #27ae60;
        }
        
        .stat-title {
            font-size: 1.2rem;
            margin-bottom: 15px;
            color: #667eea;
        }
        
        .stat-value {
            font-size: 2rem;
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .stat-description {
            font-size: 0.9rem;
            opacity: 0.7;
        }
        
        .health-status {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 0.9rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .health-healthy {
            background: #27ae60;
            color: white;
        }
        
        .health-warning {
            background: #f39c12;
            color: white;
        }
        
        .health-critical {
            background: #e74c3c;
            color: white;
        }
        
        .section {
            background: #2d2d2d;
            margin: 20px 0;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        
        .section-title {
            font-size: 1.5rem;
            margin-bottom: 20px;
            color: #667eea;
            border-bottom: 2px solid #667eea;
            padding-bottom: 10px;
        }
        
        .metric-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 0;
            border-bottom: 1px solid #444;
        }
        
        .metric-row:last-child {
            border-bottom: none;
        }
        
        .metric-label {
            font-weight: 500;
        }
        
        .metric-value {
            font-weight: bold;
            color: #667eea;
        }
        
        .refresh-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: bold;
            transition: all 0.3s ease;
            margin: 10px 5px;
        }
        
        .refresh-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }
        
        .controls {
            text-align: center;
            margin: 30px 0;
        }
        
        .loading {
            text-align: center;
            padding: 20px;
            color: #667eea;
        }
        
        .error {
            background: #e74c3c;
            color: white;
            padding: 15px;
            border-radius: 5px;
            margin: 10px 0;
        }
        
        @keyframes pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
        }
        
        .pulse {
            animation: pulse 2s infinite;
        }
        
        .banned-ips {
            max-height: 200px;
            overflow-y: auto;
            background: #333;
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
        }
        
        .banned-ip {
            padding: 5px;
            margin: 2px 0;
            background: #444;
            border-radius: 3px;
            font-family: monospace;
            font-size: 0.9rem;
        }
        
        .timestamp {
            text-align: center;
            color: #999;
            font-size: 0.9rem;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 Discord Trade Executor</h1>
            <div class="subtitle">Real-time Analytics Dashboard</div>
        </div>
        
        <div class="controls">
            <button class="refresh-btn" onclick="loadDashboardData()">🔄 Refresh Data</button>
            <button class="refresh-btn" onclick="toggleAutoRefresh()">⏰ Auto-refresh: <span id="auto-status">OFF</span></button>
        </div>
        
        <div id="loading" class="loading pulse" style="display: none;">
            ⏳ Loading dashboard data...
        </div>
        
        <div id="error" class="error" style="display: none;"></div>
        
        <div id="dashboard-content">
            <!-- Dashboard content will be inserted here -->
        </div>
        
        <div class="timestamp">
            <div>Last updated: <span id="last-updated">Never</span></div>
        </div>
    </div>
    
    <script>
        let autoRefreshInterval = null;
        let autoRefreshEnabled = false;
        
        async function loadDashboardData() {
            const loadingEl = document.getElementById('loading');
            const errorEl = document.getElementById('error');
            const contentEl = document.getElementById('dashboard-content');
            
            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            
            try {
                const response = await fetch('/api/dashboard-data');
                const result = await response.json();
                
                if (!result.success) {
                    throw new Error(result.error || 'Failed to load data');
                }
                
                renderDashboard(result.data);
                document.getElementById('last-updated').textContent = new Date().toLocaleString();
                
            } catch (error) {
                console.error('Dashboard error:', error);
                errorEl.textContent = 'Failed to load dashboard data: ' + error.message;
                errorEl.style.display = 'block';
            } finally {
                loadingEl.style.display = 'none';
            }
        }
        
        function renderDashboard(data) {
            const { metrics, health, rateLimiting } = data;
            
            const html = \`
                <div class="stats-grid">
                    <div class="stat-card \${getHealthClass(health.status)}">
                        <div class="stat-title">System Status</div>
                        <div class="stat-value">
                            <span class="health-status health-\${health.status}">\${health.status}</span>
                        </div>
                        <div class="stat-description">Overall system health</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Webhooks</div>
                        <div class="stat-value">\${metrics.webhooks.total}</div>
                        <div class="stat-description">\${metrics.webhooks.successRate}% success rate</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Trades</div>
                        <div class="stat-value">\${metrics.trades.total}</div>
                        <div class="stat-description">\${metrics.trades.successRate}% success rate</div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-title">Uptime</div>
                        <div class="stat-value">\${metrics.system.uptimeFormatted}</div>
                        <div class="stat-description">System running time</div>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">📊 Performance Metrics</div>
                    <div class="metric-row">
                        <span class="metric-label">Average Response Time</span>
                        <span class="metric-value">\${metrics.webhooks.avgResponseTime}ms</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Average Parsing Time</span>
                        <span class="metric-value">\${metrics.webhooks.avgParsingTime}ms</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Average Trade Execution</span>
                        <span class="metric-value">\${metrics.trades.avgExecutionTime}ms</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Active Requests</span>
                        <span class="metric-value">\${metrics.system.activeRequests}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Memory Usage (RSS)</span>
                        <span class="metric-value">\${formatBytes(metrics.system.memoryUsage.rss)}</span>
                    </div>
                </div>
                
                <div class="section">
                    <div class="section-title">🛡️ Rate Limiting</div>
                    <div class="metric-row">
                        <span class="metric-label">Requests Allowed</span>
                        <span class="metric-value">\${rateLimiting.requestsAllowed}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Requests Blocked</span>
                        <span class="metric-value">\${rateLimiting.requestsBlocked}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Block Rate</span>
                        <span class="metric-value">\${rateLimiting.blockRate}%</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Active IPs</span>
                        <span class="metric-value">\${rateLimiting.activeIPs}</span>
                    </div>
                    <div class="metric-row">
                        <span class="metric-label">Banned IPs</span>
                        <span class="metric-value">\${rateLimiting.bannedIPs}</span>
                    </div>
                    \${rateLimiting.bannedIPsList.length > 0 ? \`
                        <div class="banned-ips">
                            \${rateLimiting.bannedIPsList.map(ban => 
                                \`<div class="banned-ip">\${ban.ip} (\${ban.timeRemaining}s remaining)</div>\`
                            ).join('')}
                        </div>
                    \` : ''}
                </div>
                
                <div class="section">
                    <div class="section-title">🏥 Health Checks</div>
                    \${Object.entries(health.checks).map(([key, check]) => \`
                        <div class="metric-row">
                            <span class="metric-label">\${key.charAt(0).toUpperCase() + key.slice(1)}</span>
                            <span class="metric-value">
                                <span class="health-status health-\${check.status}">\${check.status}</span>
                                <small style="margin-left: 10px; opacity: 0.7;">\${check.message}</small>
                            </span>
                        </div>
                    \`).join('')}
                </div>
            \`;
            
            document.getElementById('dashboard-content').innerHTML = html;
        }
        
        function getHealthClass(status) {
            switch (status) {
                case 'healthy': return 'success';
                case 'warning': return 'warning';
                case 'critical': return 'error';
                default: return '';
            }
        }
        
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function toggleAutoRefresh() {
            if (autoRefreshEnabled) {
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
                autoRefreshEnabled = false;
                document.getElementById('auto-status').textContent = 'OFF';
            } else {
                autoRefreshInterval = setInterval(loadDashboardData, 5000); // 5 seconds
                autoRefreshEnabled = true;
                document.getElementById('auto-status').textContent = 'ON';
            }
        }
        
        // Load initial data
        document.addEventListener('DOMContentLoaded', loadDashboardData);
    </script>
</body>
</html>
        `;
    }

    /**
     * Generate summary statistics for quick overview
     * @returns {Object} - Summary stats
     */
    generateSummary() {
        const metrics = performanceTracker.getMetrics();
        const health = performanceTracker.getHealthStatus();
        const rateLimitStats = rateLimiter.getStats();

        return {
            overview: {
                status: health.status,
                uptime: metrics.system.uptimeFormatted,
                totalWebhooks: metrics.webhooks.total,
                totalTrades: metrics.trades.total,
                successRate: metrics.webhooks.successRate
            },
            performance: {
                avgResponseTime: metrics.webhooks.avgResponseTime,
                avgParsingTime: metrics.webhooks.avgParsingTime,
                avgExecutionTime: metrics.trades.avgExecutionTime,
                memoryUsage: this.formatBytes(metrics.system.memoryUsage.rss)
            },
            security: {
                rateLimitBlockRate: rateLimitStats.blockRate,
                bannedIPs: rateLimitStats.bannedIPs,
                activeIPs: rateLimitStats.activeIPs
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Format bytes in human readable format
     * @private
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = AnalyticsDashboard;