import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  icon?: ReactNode;
}

const base =
  'h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-ink-800 placeholder:text-ink-400 transition-all duration-200 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-ink-50';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid, icon, className, ...props }, ref) => {
    const control = (
      <input
        ref={ref}
        className={cn(
          base,
          invalid
            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
            : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100',
          icon ? 'pl-10' : '',
          className,
        )}
        {...props}
      />
    );

    if (!icon) return control;

    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
          {icon}
        </span>
        {control}
      </div>
    );
  },
);

Input.displayName = 'Input';
