import { forwardRef } from "react";

import { cn } from "@/lib/utils";

export const Label = forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-sm font-medium text-foreground leading-none",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
