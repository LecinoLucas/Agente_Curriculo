import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import React from "react";

type AdminQuickActionProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  buttonLabel: string;
  onButtonClick: () => void;
  variant?: "default" | "blue" | "amber" | "cyan" | "emerald";
};

const variantClasses: Record<string, string> = {
  default: "border-gray-200 shadow-sm",
  blue: "border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm dark:border-indigo-900/30 dark:from-indigo-950/30 dark:to-blue-950/30",
  amber: "border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm dark:border-amber-900/30 dark:from-amber-950/30 dark:to-orange-950/20",
  cyan: "border-cyan-100 bg-gradient-to-br from-cyan-50 to-sky-50 shadow-sm dark:border-cyan-900/30 dark:from-cyan-950/30 dark:to-sky-950/20",
  emerald: "border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm dark:border-emerald-900/30 dark:from-emerald-950/30 dark:to-teal-950/20",
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
