import { cn } from "@/lib/utils";
import { ROLE_CLASS, ROLE_LABEL } from "../utils/userFormatters";

export function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        ROLE_CLASS[role] ?? "bg-gray-100 text-gray-600 border-gray-200",
      )}
    >
      {ROLE_LABEL[role] ?? role}
    </span>
  );
}
