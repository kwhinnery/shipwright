import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

export interface IconButtonProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "aria-label" | "children"
  > {
  icon: LucideIcon;
  label: string;
}

export function IconButton({
  icon: Icon,
  label,
  className,
  title = label,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  const classes = className ? `icon-button ${className}` : "icon-button";

  return (
    <button
      {...buttonProps}
      type={type}
      className={classes}
      aria-label={label}
      title={title}
    >
      <Icon
        aria-hidden="true"
        focusable="false"
        size={18}
        strokeWidth={1.5}
      />
    </button>
  );
}
