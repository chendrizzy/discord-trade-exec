import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        profit: 'border-profit-border bg-profit-bg text-profit-text',
        loss: 'border-loss-border bg-loss-bg text-loss-text',
        warning: 'border-warning-border bg-warning-bg text-warning-text',
        info: 'border-info-border bg-info-bg text-info-text',
        gold: 'border-transparent bg-gold-600 text-black font-bold'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
