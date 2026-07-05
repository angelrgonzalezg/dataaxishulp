import { forwardRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid, className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-28 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-ink-800 placeholder:text-ink-400 transition-all duration-200 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-ink-50',
          invalid
            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
            : 'border-ink-200 focus:border-brand-500 focus:ring-brand-100',
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = 'Textarea';
