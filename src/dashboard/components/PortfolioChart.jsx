import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Mock portfolio data
const generatePortfolioData = () => {
  const data = [];
  const now = new Date();
  const startValue = 120000;

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const randomChange = (Math.random() - 0.45) * 2000;
    const value = startValue + randomChange * (30 - i) / 10;

    data.push({
      date: date.toISOString().split('T')[0],
      value: parseFloat(value.toFixed(2)),
      displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    });
  }

  return data;
};

const portfolioData = generatePortfolioData();

// Custom tooltip component
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isProfit = data.value >= portfolioData[0].value;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm text-muted-foreground mb-1">{data.displayDate}</p>
        <p className={`text-lg font-bold font-mono ${isProfit ? 'text-profit-text' : 'text-loss-text'}`}>
          ${data.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
      </div>
    );
  }
  return null;
};

// Sparkline variant (for KPI cards)
export function PortfolioSparkline() {
  const latestValue = portfolioData[portfolioData.length - 1].value;
  const firstValue = portfolioData[0].value;
  const isPositive = latestValue >= firstValue;

  return (
    <ResponsiveContainer width="100%" height={60}>
      <LineChart data={portfolioData} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={isPositive ? '#4ade80' : '#f87171'}
          strokeWidth={2}
          dot={false}
          animationDuration={300}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Full chart variant (for Analytics tab)
export function PortfolioChart() {
  const latestValue = portfolioData[portfolioData.length - 1].value;
  const firstValue = portfolioData[0].value;
  const isPositive = latestValue >= firstValue;

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={portfolioData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0.3} />
            <stop offset="95%" stopColor={isPositive ? '#4ade80' : '#f87171'} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
        <XAxis
          dataKey="displayDate"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={isPositive ? '#4ade80' : '#f87171'}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorValue)"
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Performance metrics chart (for Analytics tab)
export function PerformanceMetricsChart() {
  const metricsData = [
    { month: 'Jan', profit: 4500, loss: -2100, net: 2400 },
    { month: 'Feb', profit: 5200, loss: -1800, net: 3400 },
    { month: 'Mar', profit: 3800, loss: -2500, net: 1300 },
    { month: 'Apr', profit: 6100, loss: -1500, net: 4600 },
    { month: 'May', profit: 5800, loss: -2200, net: 3600 },
    { month: 'Jun', profit: 4900, loss: -1900, net: 3000 },
  ];

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={metricsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f87171" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.2} />
        <XAxis
          dataKey="month"
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="hsl(var(--muted-foreground))"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
        />
        <Area
          type="monotone"
          dataKey="profit"
          stroke="#4ade80"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorProfit)"
          animationDuration={500}
        />
        <Area
          type="monotone"
          dataKey="loss"
          stroke="#f87171"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorLoss)"
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
