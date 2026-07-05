import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid, className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'h-11 w-full appearance-none rounded-xl border bg-white px-3.5 pr-10 text-sm text-ink-800 transition-all duration-200 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-ink-50',
            invalid
              ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
              : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100',
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      </div>
    );
  },
);

Select.displayName = 'Select';
