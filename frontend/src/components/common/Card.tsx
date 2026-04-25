import { type PropsWithChildren } from "react";
import {
  Card as ShadCard,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CardProps = PropsWithChildren<{
  title: string;
  description?: string;
  className?: string;
}>;

export function Card({ title, description, className, children }: CardProps) {
  return (
    <ShadCard className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </ShadCard>
  );
}
