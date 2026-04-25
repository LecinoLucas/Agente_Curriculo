import { lazy, Suspense, useEffect, useState } from "react";

import { PageHeader } from "../components/common/PageHeader";
import { Tabs } from "../components/common/Tabs";

const CandidatosPage = lazy(() =>
  import("./CandidatosPage").then((m) => ({ default: m.CandidatosPage }))
);
const VagasPage = lazy(() =>
  import("./VagasPage").then((m) => ({ default: m.VagasPage }))
);
const SkillsPage = lazy(() =>
  import("./SkillsPage").then((m) => ({ default: m.SkillsPage }))
);

type TabKey = "candidatos" | "vagas" | "skills";

const TAB_STORAGE_KEY = "cadastros_active_tab";

function TabFallback() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white px-8 py-10 text-center text-sm text-gray-500 shadow-sm">
        Carregando…
      </div>
    </div>
  );
}

export function CadastroCentralizadoPage() {
  const [activeTab, setActiveTab] = useState<TabKey>(() => {
    const stored = localStorage.getItem(TAB_STORAGE_KEY) as TabKey | null;
    const validKeys: TabKey[] = ["candidatos", "vagas", "skills"];
    return stored && validKeys.includes(stored) ? stored : "candidatos";
  });

  useEffect(() => {
    localStorage.setItem(TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "candidatos", label: "Candidatos" },
    { key: "vagas", label: "Vagas" },
    { key: "skills", label: "Skills" },
  ];

  function renderTab() {
    switch (activeTab) {
      case "candidatos":
        return <CandidatosPage />;
      case "vagas":
        return <VagasPage />;
      case "skills":
        return <SkillsPage />;
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6 pb-12">
      <PageHeader
        title="Central de cadastros"
        subtitle="Gerencie candidatos, vagas e skills"
      />

      <Tabs
        tabs={tabs}
        active={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
      />

      <Suspense fallback={<TabFallback />}>
        {renderTab()}
      </Suspense>
    </div>
  );
}
