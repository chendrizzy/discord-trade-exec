# Design Principles - Discord Trade Executor

## Color System

### Base Colors
```css
/* Primary Backgrounds */
--bg-primary: #0f172a;      /* slate-900 - Main background */
--bg-secondary: #1e293b;    /* slate-800 - Card background */
--card: hsl(var(--card));   /* Card background from theme */

/* Text Colors (WCAG AA Compliant) */
--text-primary: #f8fafc;    /* slate-50 - 15:1 contrast ratio ✓ */
--text-secondary: #cbd5e1;  /* slate-300 - 6:1 contrast ratio ✓ */
--text-tertiary: #94a3b8;   /* slate-400 - Use sparingly, 4.5:1 minimum */
```

### Semantic Colors
```css
/* Trading-Specific Colors */
--profit: #4ade80;          /* green-400 - Gains/positive */
--profit-bg: #0a2f1a;       /* Profit background */
--profit-border: #1a5c3a;   /* Profit border */

--loss: #f87171;            /* red-400 - Losses/negative */
--loss-bg: #2f0a0a;         /* Loss background */
--loss-border: #5c1a1a;     /* Loss border */

--warning: #fbbf24;         /* yellow-400 - Warnings */
--info: #60a5fa;            /* blue-400 - Information */

/* Accent Colors */
--accent-primary: #3b82f6;  /* blue-500 - Primary actions */
--accent-gold: #c9a65a;     /* Gold accent for premium features */
```

### Color Contrast Requirements
All text must meet WCAG AA standards:
- Normal text: minimum 4.5:1 contrast ratio
- Large text (18pt+): minimum 3:1 contrast ratio
- Interactive elements: minimum 3:1 contrast ratio

**Approved Text Color Combinations:**
- `slate-50` on `slate-900` background: 15:1 ✓
- `slate-300` on `slate-900` background: 6:1 ✓
- `slate-300` on `slate-800` background: 5.5:1 ✓
- `green-400` on `slate-900` background: 7:1 ✓
- `red-400` on `slate-900` background: 6.5:1 ✓

**Deprecated Combinations (Do Not Use):**
- ❌ `slate-400` on dark backgrounds (3.5:1 - fails WCAG AA)
- ❌ `slate-500` on dark backgrounds (2.5:1 - fails WCAG AA)

## Typography

### Font Families
```css
font-family-sans: 'Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', sans-serif;
font-family-mono: 'JetBrains Mono', 'Courier New', monospace;
```

### Type Scale
```css
/* Headings */
text-5xl: 3rem (48px)      /* Page titles (h1) */
text-3xl: 1.875rem (30px)  /* Section headings (h2) */
text-2xl: 1.5rem (24px)    /* Subsection headings (h3) */
text-xl: 1.25rem (20px)    /* Card titles (h4) */

/* Body Text */
text-lg: 1.125rem (18px)   /* Large body text */
text-base: 1rem (16px)     /* Default body text */
text-sm: 0.875rem (14px)   /* Small text, labels */
text-xs: 0.75rem (12px)    /* Metadata, captions */
```

### Font Weights
```css
font-black: 900      /* Main page headings */
font-bold: 700       /* Emphasis, data values */
font-semibold: 600   /* Card titles, section headings */
font-medium: 500     /* Labels, button text */
font-normal: 400     /* Body text */
```

### Line Heights
```css
leading-none: 1      /* Tight headings */
leading-tight: 1.25  /* Card titles */
leading-normal: 1.5  /* Body text */
leading-relaxed: 1.75 /* Descriptive text */
```

## Spacing

### Standard Spacing Scale
```css
/* Component Spacing */
p-6: 1.5rem (24px)    /* Standard card padding */
p-8: 2rem (32px)      /* Container padding */
gap-6: 1.5rem (24px)  /* Grid gap */
gap-8: 2rem (32px)    /* Section gap */

/* Vertical Spacing */
space-y-1: 0.25rem (4px)   /* Tight vertical spacing (stats) */
space-y-2: 0.5rem (8px)    /* Small vertical spacing */
space-y-6: 1.5rem (24px)   /* Component spacing */
space-y-8: 2rem (32px)     /* Section spacing */

/* Margin */
mb-2: 0.5rem (8px)    /* Small margin bottom */
mb-3: 0.75rem (12px)  /* Medium margin bottom */
mb-6: 1.5rem (24px)   /* Large margin bottom */
mb-8: 2rem (32px)     /* Section margin bottom */
```

### Custom Spacing Tokens
```javascript
// tailwind.config.js
extend: {
  spacing: {
    'card': '1.5rem',      // Standard card padding
    'section': '2rem',     // Section spacing
    'container': '2rem',   // Container padding
  }
}
```

## Elevation & Shadows

### Card Elevation
```css
/* Default Card */
shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05)
border: 1px solid rgba(203, 213, 225, 0.1)

/* Elevated Card */
shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5)
border: 1px solid rgba(203, 213, 225, 0.2)

/* Hover State */
shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.75)
border: 2px solid var(--accent-primary)
```

### Focus Indicators
```css
/* Keyboard Focus (Required for Accessibility) */
focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
}
```

## Border Radius

### Standard Radii
```css
rounded-sm: 0.125rem (2px)   /* Small elements */
rounded-md: 0.375rem (6px)   /* Buttons */
rounded-lg: 0.5rem (8px)     /* Cards, inputs */
rounded-xl: 0.75rem (12px)   /* Large containers */
rounded-full: 9999px         /* Circular elements */
```

## Animations & Transitions

### Standard Transitions
```css
transition-all duration-200   /* Quick interactions */
transition-all duration-300   /* Standard transitions */
transition-all duration-500   /* Slow, dramatic transitions */
```

### Keyframe Animations
```javascript
// Available animations
animate-fade-in              // Fade in opacity
animate-slide-in-from-top    // Slide from top with fade
animate-slide-in-from-bottom // Slide from bottom with fade
animate-slide-in-from-right  // Slide from right with fade
animate-scale-in             // Scale up with fade
animate-pulse-glow           // Pulsing glow effect
animate-shimmer              // Shimmer loading effect
```

### Animation Delays
```css
/* Stagger animations for lists */
style={{ animationDelay: '0.1s' }}  /* First item */
style={{ animationDelay: '0.2s' }}  /* Second item */
style={{ animationDelay: '0.3s' }}  /* Third item */
```

## Accessibility

### Semantic HTML Requirements
```html
<!-- Page structure -->
<header role="banner">
<nav aria-label="Main navigation">
<main id="main-content" role="main">
<section aria-labelledby="section-id">
<article role="article">
<footer role="contentinfo">

<!-- Skip navigation -->
<a href="#main-content" class="sr-only focus:not-sr-only">
  Skip to main content
</a>
```

### ARIA Labels
```jsx
// Data visualizations
<div
  aria-labelledby="stat-label-id"
  aria-live="polite"
  role="text"
>
  {value}
</div>

// Interactive elements
<button aria-label="Close dialog">
  <X />
</button>

// Regions
<section
  role="region"
  aria-labelledby="heading-id"
>
```

### Heading Hierarchy
```html
<h1>Page Title</h1>           <!-- One per page -->
  <h2>Section Heading</h2>    <!-- Major sections -->
    <h3>Subsection Heading</h3> <!-- Subsections -->
```

### Touch Targets
```css
/* Minimum touch target size: 44x44px */
min-width: 44px;
min-height: 44px;
padding: 0.75rem; /* 12px */

/* Mobile touch target enhancement */
@media (hover: none) and (pointer: coarse) {
  button, a, [role="button"] {
    min-width: 44px;
    min-height: 44px;
    padding: 0.75rem;
  }
}
```

### Screen Reader Support
```css
/* Hide visually but keep for screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Show on focus */
.focus\:not-sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

## Responsive Design

### Breakpoints
```css
/* Mobile first approach */
sm: 640px    /* Small devices */
md: 768px    /* Tablets */
lg: 1024px   /* Laptops */
xl: 1280px   /* Desktops */
2xl: 1536px  /* Large desktops */
```

### Responsive Grid
```css
/* Standard responsive grid pattern */
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6

/* Common layouts */
grid-cols-1           /* Mobile: Stack */
md:grid-cols-2        /* Tablet: 2 columns */
lg:grid-cols-3        /* Desktop: 3 columns */
xl:grid-cols-4        /* Large: 4 columns */
```

### Mobile Considerations
- Increase vertical spacing on mobile: `space-y-4 md:space-y-6`
- Stack components: `flex-col md:flex-row`
- Hide non-essential content: `hidden md:block`
- Reduce font sizes: `text-2xl md:text-3xl lg:text-4xl`

## Component Patterns

### Card Pattern
```jsx
<Card className="hover:border-primary hover:shadow-2xl transition-all duration-300">
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>
    Content
  </CardContent>
</Card>
```

### Stat Display Pattern
```jsx
<Stat
  label="Total Value"
  value="$12,345.67"
  change="+5.2%"
  trend="up"
/>
```

### Loading Pattern
```jsx
<LoadingSpinner
  size="md"
  text="Loading portfolio data..."
/>
```

### Empty State Pattern
```jsx
<EmptyState
  title="No data available"
  description="Get started by adding your first trading bot"
  icon={<PlusIcon />}
  actionLabel="Add Bot"
  onAction={() => navigate('/bots/new')}
/>
```

## Interactive States

### Button States
```css
/* Default */
bg-primary text-primary-foreground

/* Hover */
hover:bg-primary/90

/* Active */
active:scale-95

/* Focus */
focus-visible:outline-2 focus-visible:outline-primary

/* Disabled */
disabled:opacity-50 disabled:cursor-not-allowed
```

### Card States
```css
/* Default */
border border-border/50

/* Hover */
hover:border-primary/50 hover:shadow-xl

/* Interactive */
cursor-pointer hover:scale-[1.02]

/* Active/Selected */
border-primary shadow-2xl
```

## Performance Considerations

### Code Splitting
```jsx
// Lazy load heavy components
const Chart = lazy(() => import('./Chart'));

// Wrap in Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Chart />
</Suspense>
```

### Animation Performance
```css
/* Use transform and opacity for animations (GPU accelerated) */
transform: translateY(0);
opacity: 1;

/* Avoid animating layout properties */
❌ height, width, top, left, margin, padding
✓ transform, opacity
```

## Design Checklist

Before shipping any UI component, verify:

- [ ] Color contrast meets WCAG AA (4.5:1 minimum)
- [ ] Semantic HTML elements used appropriately
- [ ] ARIA labels on data visualizations and interactive elements
- [ ] Proper heading hierarchy (h1 → h2 → h3)
- [ ] Visible focus indicators on all interactive elements
- [ ] Touch targets minimum 44x44px on mobile
- [ ] Responsive design tested at all breakpoints
- [ ] Loading and empty states implemented
- [ ] Error boundaries in place
- [ ] Animations use transform/opacity for performance
- [ ] Screen reader tested with VoiceOver/NVDA
- [ ] Keyboard navigation fully functional
- [ ] Dark theme colors consistent with design system

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [shadcn/ui Component Library](https://ui.shadcn.com/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
