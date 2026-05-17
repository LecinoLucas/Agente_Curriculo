import { cn } from "@/lib/utils";

export type Tab = {
  key: string;
  label: string;
  caption?: string;
};

type TabsProps = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex flex-col px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
            active === tab.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          )}
        >
          <span>{tab.label}</span>
          {tab.caption ? (
            <span className="text-xs font-normal text-muted-foreground">{tab.caption}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
