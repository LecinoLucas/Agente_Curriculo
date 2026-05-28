import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import React from "react";

type AdminQuickActionProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onButtonClick: () => void;
  variant?: "default" | "blue";
};

const variantClasses: Record<string, string> = {
  default: "border-border bg-surface-muted shadow-sm",
  blue: "border-border bg-[linear-gradient(135deg,hsl(var(--accent-soft)),hsl(var(--surface)))] shadow-sm",
};

export function AdminQuickAction({
  icon,
  title,
  description,
  buttonLabel,
  onButtonClick,
  variant = "default",
}: AdminQuickActionProps) {
  return (
    <Card className={variantClasses[variant]}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onButtonClick}>{buttonLabel}</Button>
      </CardContent>
    </Card>
  );
}
