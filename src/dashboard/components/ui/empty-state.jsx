import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * EmptyState Component - Displays an empty state with optional action
 *
 * @param {Object} props
 * @param {string} props.title - Main heading for the empty state
 * @param {string} [props.description] - Optional description text
 * @param {React.ReactNode} [props.icon] - Optional icon component
 * @param {string} [props.actionLabel] - Label for the action button
 * @param {Function} [props.onAction] - Callback when action button is clicked
 * @param {string} [props.className] - Additional CSS classes
 */
const EmptyState = React.forwardRef(({
  title,
  description,
  icon,
  actionLabel,
  onAction,
  className,
  ...props
}, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center",
        className
      )}
      role="status"
      aria-live="polite"
      {...props}
    >
      {icon && (
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-800 text-slate-400">
          {icon}
        </div>
      )}

      <h3 className="mb-2 text-xl font-semibold text-white">
        {title}
      </h3>

      {description && (
        <p className="mb-6 max-w-md text-sm text-slate-300">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <Button
          onClick={onAction}
          variant="default"
          className="mt-2"
          aria-label={actionLabel}
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
});

EmptyState.displayName = 'EmptyState';

/**
 * EmptyStateIcon Component - Simple icon wrapper for empty states
 */
const EmptyStateIcon = ({ children, className }) => {
  return (
    <div className={cn("h-12 w-12", className)} aria-hidden="true">
      {children}
    </div>
  );
};

EmptyStateIcon.displayName = 'EmptyStateIcon';

export { EmptyState, EmptyStateIcon };
