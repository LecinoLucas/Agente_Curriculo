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
  default: "shadow-sm bg-[hsl(var(--surface-muted))] border-border",
  blue: "border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm dark:border-indigo-900/30 dark:from-indigo-950/30 dark:to-blue-950/30",
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
