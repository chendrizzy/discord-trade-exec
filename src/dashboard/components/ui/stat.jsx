import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Stat Component - Displays a labeled statistic with optional trend indicator
 *
 * @param {Object} props
 * @param {string} props.label - The label for the statistic
 * @param {string|number} props.value - The main value to display
 * @param {string} [props.change] - Optional change value (e.g., "+5.2%")
 * @param {'up'|'down'} [props.trend] - Trend direction for styling
 * @param {string} [props.labelId] - ID for the label element (accessibility)
 * @param {string} [props.className] - Additional CSS classes
 */
const Stat = React.forwardRef(({
  label,
  value,
  change,
  trend,
  labelId,
  className,
  ...props
}, ref) => {
  const generatedLabelId = labelId || `stat-label-${React.useId()}`;

  return (
    <div ref={ref} className={cn("space-y-1", className)} {...props}>
      <div
        id={generatedLabelId}
        className="text-sm text-slate-300"
      >
        {label}
      </div>
      <div
        className="text-2xl font-bold text-white"
        aria-labelledby={generatedLabelId}
        role="text"
      >
        {value}
      </div>
      {change && (
        <div
          className={cn(
            "text-sm font-medium",
            trend === 'up' ? "text-green-400" : trend === 'down' ? "text-red-400" : "text-slate-400"
          )}
          aria-label={`${trend === 'up' ? 'Increase' : trend === 'down' ? 'Decrease' : 'Change'} of ${change}`}
        >
          {trend === 'up' ? '+' : ''}{change}
        </div>
      )}
    </div>
  );
});

Stat.displayName = 'Stat';

export { Stat };
