import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SCREENS } from "../config/adminConfig";

type RoleCardProps = {
  label: string;
  description: string;
  roleKey: string;
};

export function RoleCard({ label, description, roleKey }: RoleCardProps) {
  const accessible = SCREENS.filter((s) => s.roles.includes(roleKey as any));

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{label}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {accessible.map((s) => (
            <li key={s.path} className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="text-green-500">✓</span>
              {s.label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
