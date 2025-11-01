import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './ui/card';
import { EmptyState } from './ui';
import { BarChart3, DollarSign, TrendingUp } from 'lucide-react';

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm text-muted-foreground mb-2">{label}</p>
        {payload.map((entry, index) => (
          <div key={index} className="flex justify-between items-center gap-4 mb-1">
            <span className="text-xs" style={{ color: entry.color }}>
              {entry.name}:
            </span>
            <span className="text-sm font-mono font-bold" style={{ color: entry.color }}>
              ${entry.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function RevenueMetricsChart({ data, height = 400, showLegend = true }) {
  // Default to empty array if no data
  const chartData = data || [];

  if (chartData.length === 0) {
    return (
      <EmptyState
        title="No Revenue Data"
        description="Revenue data will appear here once transactions are recorded."
        icon={<DollarSign className="h-12 w-12" />}
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorMRR" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorLTV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
        <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={value => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        {showLegend && (
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="line"
            formatter={value => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
          />
        )}
        <Area
          type="monotone"
          dataKey="mrr"
          stroke="#eab308"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorMRR)"
          animationDuration={500}
          name="MRR"
        />
        <Area
          type="monotone"
          dataKey="ltv"
          stroke="#4ade80"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorLTV)"
          animationDuration={500}
          name="LTV per User"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// MRR Trend Chart (single metric focus)
export function MRRTrendChart({ data, height = 300 }) {
  const chartData = data || [];

  if (chartData.length === 0) {
    return (
      <EmptyState
        title="No MRR Data"
        description="Monthly recurring revenue data will appear here once subscriptions are active."
        icon={<TrendingUp className="h-12 w-12" />}
      />
    );
  }

  const latestValue = chartData[chartData.length - 1]?.mrr || 0;
  const firstValue = chartData[0]?.mrr || 0;
  const isPositive = latestValue >= firstValue;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id="colorMRRLine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
        <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={value => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                  <p className="text-sm text-muted-foreground mb-1">{label}</p>
                  <p className={`text-lg font-bold font-mono ${isPositive ? 'text-profit-text' : 'text-loss-text'}`}>
                    ${payload[0].value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              );
            }
            return null;
          }}
        />
        <Area
          type="monotone"
          dataKey="mrr"
          stroke={isPositive ? '#4ade80' : '#f87171'}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorMRRLine)"
          animationDuration={500}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Tier Revenue Breakdown Chart
export function TierRevenueChart({ data, height = 350 }) {
  const chartData = data || [];

  if (chartData.length === 0) {
    return (
      <EmptyState
        title="No Tier Revenue Data"
        description="Subscription tier revenue breakdown will appear here once users subscribe to different tiers."
        icon={<BarChart3 className="h-12 w-12" />}
      />
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorBasic" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6b7280" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorPro" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorPremium" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
        <XAxis dataKey="period" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={value => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="square"
          formatter={value => <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>}
        />
        <Area
          type="monotone"
          dataKey="basic"
          stackId="1"
          stroke="#6b7280"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorBasic)"
          animationDuration={500}
          name="Basic Tier"
        />
        <Area
          type="monotone"
          dataKey="pro"
          stackId="1"
          stroke="#4ade80"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorPro)"
          animationDuration={500}
          name="Pro Tier"
        />
        <Area
          type="monotone"
          dataKey="premium"
          stackId="1"
          stroke="#eab308"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorPremium)"
          animationDuration={500}
          name="Premium Tier"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Compact chart for cards/dashboards
export function RevenueSparkline({ data, metric = 'mrr', height = 60 }) {
  const chartData = data || [];

  if (chartData.length === 0) {
    return <div className="h-full w-full bg-muted/20 rounded" />;
  }

  const latestValue = chartData[chartData.length - 1]?.[metric] || 0;
  const firstValue = chartData[0]?.[metric] || 0;
  const isPositive = latestValue >= firstValue;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
        <Line
          type="monotone"
          dataKey={metric}
          stroke={isPositive ? '#4ade80' : '#f87171'}
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
