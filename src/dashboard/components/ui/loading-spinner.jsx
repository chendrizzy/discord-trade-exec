import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * LoadingSpinner Component - Displays a centered loading spinner with screen reader support
 *
 * @param {Object} props
 * @param {string} [props.className] - Additional CSS classes for the container
 * @param {string} [props.size='md'] - Size of the spinner ('sm', 'md', 'lg', 'xl')
 * @param {string} [props.text='Loading...'] - Text for screen readers
 * @param {boolean} [props.fullScreen=false] - Whether to take up full screen height
 */
const LoadingSpinner = React.forwardRef(({
  className,
  size = 'md',
  text = 'Loading...',
  fullScreen = false,
  ...props
}, ref) => {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-2',
    lg: 'h-12 w-12 border-3',
    xl: 'h-16 w-16 border-4',
  };

  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center justify-center",
        fullScreen ? "min-h-screen" : "min-h-[200px]",
        className
      )}
      role="status"
      aria-live="polite"
      {...props}
    >
      <div className="relative">
        <div
          className={cn(
            "animate-spin rounded-full border-solid border-slate-700 border-t-primary",
            sizeClasses[size] || sizeClasses.md
          )}
        />
        <span className="sr-only">{text}</span>
      </div>
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

/**
 * InlineSpinner Component - Small inline loading spinner
 */
const InlineSpinner = React.forwardRef(({
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn("inline-flex items-center", className)}
      role="status"
      aria-live="polite"
      {...props}
    >
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-slate-700 border-t-primary" />
      <span className="sr-only">Loading...</span>
    </div>
  );
});

InlineSpinner.displayName = 'InlineSpinner';

export { LoadingSpinner, InlineSpinner };
