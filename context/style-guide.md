# Style Guide - Discord Trade Executor

## Component Patterns

### Cards

#### Basic Card Usage
```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';

// Standard card
<Card>
  <CardHeader>
    <CardTitle>Portfolio Overview</CardTitle>
    <CardDescription>View your trading performance</CardDescription>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>
```

#### Interactive Card
```jsx
// Add hover effects for clickable cards
<Card className="hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 cursor-pointer">
  <CardHeader>
    <CardTitle>Active Bots</CardTitle>
  </CardHeader>
  <CardContent>
    Click to configure
  </CardContent>
</Card>
```

#### Card with Animations
```jsx
// Staggered animation for cards in a grid
<Card
  className="animate-fade-in"
  style={{ animationDelay: '0.1s' }}
>
  <CardContent>Animated card</CardContent>
</Card>
```

### Stats

#### Basic Stat Display
```jsx
import { Stat } from '@/components/ui/stat';

// Simple stat
<Stat
  label="Total Value"
  value="$12,345.67"
/>
```

#### Stat with Trend
```jsx
// Stat with positive trend
<Stat
  label="Portfolio Value"
  value="$12,345.67"
  change="+5.2%"
  trend="up"
/>

// Stat with negative trend
<Stat
  label="24h P&L"
  value="-$234.50"
  change="-2.1%"
  trend="down"
/>
```

#### Stat in Grid Layout
```jsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  <Card className="p-6">
    <Stat
      label="Total Value"
      value="$12,345.67"
      change="+5.2%"
      trend="up"
    />
  </Card>
  <Card className="p-6">
    <Stat
      label="Active Bots"
      value="3 / 5"
    />
  </Card>
</div>
```

### Buttons

#### Button Variants
```jsx
import { Button } from '@/components/ui/button';

// Primary button (default)
<Button>Primary Action</Button>

// Secondary button
<Button variant="outline">Secondary Action</Button>

// Destructive button
<Button variant="destructive">Delete</Button>

// Ghost button
<Button variant="ghost">Cancel</Button>

// Link button
<Button variant="link">Learn More</Button>
```

#### Button Sizes
```jsx
// Small button
<Button size="sm">Small</Button>

// Default button
<Button>Default</Button>

// Large button
<Button size="lg">Large</Button>

// Icon button
<Button size="icon">
  <X className="h-4 w-4" />
</Button>
```

#### Full Width Button
```jsx
<Button className="w-full">
  Configure Settings
</Button>
```

### Badges

#### Badge Variants
```jsx
import { Badge } from '@/components/ui/badge';

// Default badge
<Badge>Default</Badge>

// Profit badge (green)
<Badge variant="profit">Running</Badge>

// Loss badge (red)
<Badge variant="loss">Stopped</Badge>

// Outline badge
<Badge variant="outline">Paused</Badge>
```

#### Animated Badge
```jsx
// Pulsing glow effect
<Badge
  variant="profit"
  className="animate-pulse-glow"
>
  Active
</Badge>
```

### Loading States

#### Full Page Loading
```jsx
import { LoadingSpinner } from '@/components/ui/loading-spinner';

// Centered loading spinner
<LoadingSpinner
  size="lg"
  text="Loading portfolio data..."
  fullScreen={true}
/>
```

#### Component Loading
```jsx
// Loading within a card
<Card>
  <CardContent>
    <LoadingSpinner
      size="md"
      text="Fetching latest trades..."
    />
  </CardContent>
</Card>
```

#### Inline Loading
```jsx
import { InlineSpinner } from '@/components/ui/loading-spinner';

// Small inline spinner
<Button disabled>
  <InlineSpinner className="mr-2" />
  Processing...
</Button>
```

### Empty States

#### Basic Empty State
```jsx
import { EmptyState } from '@/components/ui/empty-state';

// Simple empty state
<EmptyState
  title="No trades found"
  description="Your trading history will appear here once you execute your first trade."
/>
```

#### Empty State with Action
```jsx
// Empty state with call to action
<EmptyState
  title="No bots configured"
  description="Get started by creating your first trading bot. Configure your strategy and start trading automatically."
  actionLabel="Create Bot"
  onAction={() => navigate('/bots/new')}
/>
```

#### Empty State with Icon
```jsx
import { PlusCircle } from 'lucide-react';

<EmptyState
  title="No data available"
  description="Start by adding your first item."
  icon={<PlusCircle className="h-12 w-12" />}
  actionLabel="Add Item"
  onAction={handleAdd}
/>
```

## Color Usage

### Semantic Colors

#### Success/Profit Colors
```jsx
// Text
<div className="text-profit-text">+$1,234.56</div>

// Background
<div className="bg-profit-bg border border-profit-border p-4">
  Profit content
</div>

// Badge
<Badge variant="profit">Active</Badge>
```

#### Error/Loss Colors
```jsx
// Text
<div className="text-loss-text">-$234.56</div>

// Background
<div className="bg-loss-bg border border-loss-border p-4">
  Loss content
</div>

// Badge
<Badge variant="loss">Failed</Badge>
```

#### Warning Colors
```jsx
// Text
<div className="text-warning-text">Warning message</div>

// Background
<div className="bg-warning-bg border border-warning-border p-4">
  Warning content
</div>
```

#### Info Colors
```jsx
// Text
<div className="text-info-text">Information</div>

// Background
<div className="bg-info-bg border border-info-border p-4">
  Info content
</div>
```

### Text Colors

```jsx
// Primary text (highest contrast)
<h1 className="text-foreground">Main Heading</h1>

// Secondary text (good contrast)
<p className="text-muted-foreground">Supporting text</p>

// Slate colors (dark theme)
<div className="text-slate-50">Primary text</div>
<div className="text-slate-300">Secondary text</div>
<div className="text-slate-400">Tertiary text (use sparingly)</div>
```

## Animation

### Standard Animations

#### Fade In
```jsx
<div className="animate-fade-in">
  Content fades in
</div>
```

#### Slide In
```jsx
// From top
<div className="animate-slide-in-from-top">
  Slides from top
</div>

// From bottom
<div className="animate-slide-in-from-bottom">
  Slides from bottom
</div>

// From right
<div className="animate-slide-in-from-right">
  Slides from right
</div>
```

#### Scale In
```jsx
<div className="animate-scale-in">
  Scales up with fade
</div>
```

#### Staggered Animations
```jsx
// Cards appearing in sequence
<div className="grid grid-cols-3 gap-6">
  <Card className="animate-fade-in" style={{ animationDelay: '0.1s' }}>
    First card
  </Card>
  <Card className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
    Second card
  </Card>
  <Card className="animate-fade-in" style={{ animationDelay: '0.3s' }}>
    Third card
  </Card>
</div>
```

### Hover Effects

#### Button Hover
```jsx
<Button className="hover:bg-primary/90 hover:scale-105 transition-all duration-200">
  Hover me
</Button>
```

#### Card Hover
```jsx
<Card className="hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300">
  Interactive card
</Card>
```

## Accessibility

### ARIA Labels

#### Interactive Elements
```jsx
// Button with clear label
<Button aria-label="Close dialog" size="icon">
  <X className="h-4 w-4" />
</Button>

// Link with description
<a href="/settings" aria-label="Navigate to settings page">
  Settings
</a>
```

#### Data Displays
```jsx
// Stat with proper labeling
<div>
  <div id="portfolio-value-label" className="text-sm text-slate-300">
    Portfolio Value
  </div>
  <div
    className="text-2xl font-bold"
    aria-labelledby="portfolio-value-label"
    role="text"
  >
    $12,345.67
  </div>
</div>
```

#### Live Regions
```jsx
// Real-time updating data
<div aria-live="polite" aria-atomic="true">
  {portfolioValue}
</div>

// Critical alerts
<div aria-live="assertive" role="alert">
  {errorMessage}
</div>
```

### Keyboard Navigation

#### Tab Index
```jsx
// Make custom elements focusable
<div
  tabIndex={0}
  onKeyDown={(e) => e.key === 'Enter' && handleClick()}
  className="cursor-pointer"
>
  Clickable div
</div>
```

#### Focus Indicators
```jsx
// Custom focus styling
<Button className="focus-visible:outline-2 focus-visible:outline-primary focus-visible:ring-4 focus-visible:ring-primary/20">
  Focused button
</Button>
```

### Screen Reader Support

#### Skip Navigation
```jsx
// Add at top of app
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:p-4 focus:bg-primary focus:text-primary-foreground"
>
  Skip to main content
</a>
```

#### Visually Hidden Text
```jsx
// Hidden but available to screen readers
<span className="sr-only">
  Close dialog
</span>
<X aria-hidden="true" />
```

## Responsive Design

### Mobile-First Grid
```jsx
// Stack on mobile, 2 columns on tablet, 3 on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <Card>Card 1</Card>
  <Card>Card 2</Card>
  <Card>Card 3</Card>
</div>
```

### Responsive Text
```jsx
// Smaller on mobile, larger on desktop
<h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-bold">
  Responsive Heading
</h1>
```

### Responsive Spacing
```jsx
// Tighter spacing on mobile
<div className="space-y-4 md:space-y-6 lg:space-y-8">
  <div>Section 1</div>
  <div>Section 2</div>
</div>
```

### Hide/Show on Breakpoints
```jsx
// Hide on mobile, show on desktop
<div className="hidden md:block">
  Desktop only content
</div>

// Show on mobile, hide on desktop
<div className="block md:hidden">
  Mobile only content
</div>
```

## Layout Patterns

### Container
```jsx
// Centered container with padding
<div className="container mx-auto p-8">
  Content
</div>
```

### Flex Layouts
```jsx
// Space between items
<div className="flex items-center justify-between">
  <div>Left</div>
  <div>Right</div>
</div>

// Centered content
<div className="flex items-center justify-center min-h-screen">
  <div>Centered</div>
</div>

// Stack on mobile, row on desktop
<div className="flex flex-col md:flex-row gap-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

### Grid Layouts
```jsx
// Auto-fit grid
<div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
  <Card>Auto-sized card</Card>
  <Card>Auto-sized card</Card>
</div>

// Fixed columns with responsive
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  <Card>Card</Card>
</div>
```

## Best Practices

### Do's ✓

1. **Use semantic HTML**
   ```jsx
   <header>, <nav>, <main>, <section>, <article>, <footer>
   ```

2. **Provide ARIA labels for data**
   ```jsx
   <div aria-label="Portfolio value: $12,345.67">
   ```

3. **Use proper color contrast**
   ```jsx
   text-slate-300 on dark backgrounds (6:1 contrast)
   ```

4. **Include loading and empty states**
   ```jsx
   {loading ? <LoadingSpinner /> : <Content />}
   {!data.length && <EmptyState />}
   ```

5. **Make interactive elements keyboard accessible**
   ```jsx
   <div tabIndex={0} onKeyDown={handleKeyPress}>
   ```

### Don'ts ✗

1. **Don't use low contrast colors**
   ```jsx
   ❌ text-slate-400 on slate-900 (3.5:1 contrast - fails WCAG)
   ```

2. **Don't skip heading levels**
   ```jsx
   ❌ <h1> → <h3> (skips h2)
   ✓ <h1> → <h2> → <h3>
   ```

3. **Don't use div for buttons**
   ```jsx
   ❌ <div onClick={handleClick}>Click</div>
   ✓ <Button onClick={handleClick}>Click</Button>
   ```

4. **Don't animate layout properties**
   ```jsx
   ❌ transition-all (animates width, height, margin)
   ✓ transition-[transform,opacity] (GPU accelerated)
   ```

5. **Don't forget mobile touch targets**
   ```jsx
   ❌ <button className="p-1">Tiny</button>
   ✓ <Button size="icon" className="min-w-[44px] min-h-[44px]">
   ```

## Common Patterns

### Dashboard Card
```jsx
<Card className="p-6 animate-fade-in">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      Portfolio Value
    </h3>
    <Badge variant="profit">Active</Badge>
  </div>
  <div className="text-4xl font-black font-mono text-foreground">
    $12,345.67
  </div>
  <div className="text-xs text-profit-text flex items-center gap-1 mt-1">
    <span>▲</span>
    <span>+5.2% today</span>
  </div>
</Card>
```

### Action Card
```jsx
<Card className="hover:border-primary hover:shadow-2xl hover:scale-[1.02] transition-all duration-300">
  <CardHeader>
    <CardTitle>Risk Management</CardTitle>
    <CardDescription>Configure your trading risk parameters</CardDescription>
  </CardHeader>
  <CardContent>
    <Button className="w-full" onClick={() => navigate('/settings')}>
      Configure
    </Button>
  </CardContent>
</Card>
```

### Status List
```jsx
<Card>
  <CardHeader>
    <CardTitle>Exchange Connections</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="space-y-2" role="list">
      <div className="flex items-center justify-between" role="listitem">
        <span className="text-sm">Binance</span>
        <Badge variant="profit">Connected</Badge>
      </div>
      <div className="flex items-center justify-between" role="listitem">
        <span className="text-sm">Coinbase</span>
        <Badge variant="outline">Disconnected</Badge>
      </div>
    </div>
  </CardContent>
</Card>
```

## Testing Checklist

Before shipping any component:

- [ ] Color contrast verified with WebAIM checker
- [ ] Keyboard navigation tested (Tab, Enter, Space, Arrow keys)
- [ ] Screen reader tested (VoiceOver on macOS, NVDA on Windows)
- [ ] Responsive design tested at breakpoints: 375px, 768px, 1024px, 1440px
- [ ] Focus indicators visible and accessible
- [ ] Touch targets minimum 44x44px on mobile
- [ ] Loading states implemented
- [ ] Empty states implemented
- [ ] Error states implemented
- [ ] ARIA labels present on data visualizations
- [ ] Semantic HTML used correctly
- [ ] Heading hierarchy validated
- [ ] Animations performant (transform/opacity only)
- [ ] Console errors resolved
- [ ] TypeScript errors resolved
