interface BadgeProps {
  children: React.ReactNode;
  variant?: "primary" | "accent" | "success" | "warning" | "danger" | "muted" | "outline";
  size?: "sm" | "md";
  className?: string;
}

const variants = {
  primary: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  accent: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  muted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  outline: "border border-current text-slate-600 dark:text-slate-400",
};

const sizes = {
  sm: "text-xs px-2 py-0.5 rounded-full",
  md: "text-sm px-3 py-1 rounded-full",
};

export default function Badge({ children, variant = "muted", size = "sm", className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center font-medium gap-1 ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
}
