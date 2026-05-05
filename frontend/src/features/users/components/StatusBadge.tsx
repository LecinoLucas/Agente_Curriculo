import { cn } from "@/lib/utils";
import { STATUS_CLASS, STATUS_LABEL } from "../utils/userFormatters";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        STATUS_CLASS[status] ?? "bg-gray-100 text-gray-500 border-gray-200",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
