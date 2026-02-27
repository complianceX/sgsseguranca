import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none shadow-sm",
  {
    variants: {
      variant: {
        default:
          "bg-[#2563EB] text-white hover:bg-[#1E40AF] hover:-translate-y-px focus:ring-[#2563EB]",
        primary:
          "bg-[#2563EB] text-white hover:bg-[#1E40AF] hover:-translate-y-px focus:ring-[#2563EB]",
        success:
          "bg-[#16A34A] text-white hover:bg-[#15803D] hover:-translate-y-px focus:ring-[#16A34A]",
        warning:
          "bg-[#FACC15] text-[#111827] hover:bg-[#EAB308] hover:-translate-y-px focus:ring-[#FACC15]",
        secondary:
          "bg-[#E5E7EB] text-[#374151] hover:bg-[#D1D5DB] focus:ring-slate-500",
        destructive:
          "bg-[#DC2626] text-white hover:bg-[#B91C1C] hover:-translate-y-px focus:ring-red-500",
        ghost: "hover:bg-blue-50 text-slate-700",
        outline:
          "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, leftIcon, rightIcon, children, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!loading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
