import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToolbarProps extends React.HTMLAttributes<HTMLDivElement> {}

const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-surface p-3 shadow-sm",
          className
        )}
        {...props}
      />
    );
  }
);
Toolbar.displayName = "Toolbar";

export { Toolbar };
