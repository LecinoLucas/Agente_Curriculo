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
    <div className="tabs">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`tab-btn${active === tab.key ? " active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          <span className="tab-btn-label">{tab.label}</span>
          {tab.caption ? <span className="tab-btn-caption">{tab.caption}</span> : null}
        </button>
      ))}
    </div>
  );
}
