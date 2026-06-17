import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Building2,
  CheckCircle2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  XCircle,
} from "lucide-react";

import { PageHeader } from "../components/common/PageHeader";
import { DataTable } from "../components/common/DataTable";
import { Modal } from "../components/common/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TableCell, TableRow } from "@/components/ui/table";
import { useAuth } from "../features/auth/useAuth";
import { useAsyncState } from "../hooks/useAsyncState";
import { isAdmin } from "../shared/auth/roles";
import { formatErrorDetails, handleApiError } from "../shared/utils/errorHandler";
import { toast } from "../shared/utils/toast";
import {
  operationalMasterService,
  type CreateLocationGroupPayload,
  type CreateOperationalGroupPayload,
  type CreateOperationalUnitPayload,
  type LocationGroup,
  type LocationGroupType,
  type OperationalGroup,
  type OperationalUnit,
  type OperationalUnitType,
} from "../services/operationalMasterService";

type TabKey = "groups" | "locations" | "units";
type ActiveFilter = "all" | "active" | "inactive";
type ModalState =
  | { type: "group"; item?: OperationalGroup }
  | { type: "location"; item?: LocationGroup }
  | { type: "unit"; item?: OperationalUnit }
  | null;
type ToggleState =
  | { type: "group"; item: OperationalGroup }
  | { type: "location"; item: LocationGroup }
  | { type: "unit"; item: OperationalUnit }
  | null;

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  {
    key: "units",
    label: "Unidades operacionais",
    description: "Postos, filiais e locais reais onde a vaga acontece.",
  },
  {
    key: "locations",
    label: "Localidades",
    description: "Apoio para orientar RH e candidato por região.",
  },
  {
    key: "groups",
    label: "Grupos operacionais",
    description: "Agrupadores administrativos usados para organizar as unidades.",
  },
];

const LOCATION_TYPE_LABELS: Record<LocationGroupType, string> = {
  city: "Cidade",
  district: "Bairro/Distrito",
  corporate: "Corporativo",
  other: "Outro",
};

const UNIT_TYPE_LABELS: Record<OperationalUnitType, string> = {
  office: "Escritório",
  gas_station: "Posto",
  store: "Loja",
  other: "Outro",
};

function activeParam(value: ActiveFilter) {
  if (value === "active") return true;
  if (value === "inactive") return false;
  return undefined;
}

function statusBadge(isActive: boolean) {
  return isActive ? (
    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
      Ativo
    </Badge>
  ) : (
    <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
      Inativo
    </Badge>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

function cleanOptional(value: string) {
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function optionLabel(value: string | null | undefined, fallback = "-") {
  return value?.trim() ? value : fallback;
}

function createButtonLabel(activeTab: TabKey) {
  if (activeTab === "groups") return "Novo grupo operacional";
  if (activeTab === "locations") return "Nova localidade";
  return "Nova unidade operacional";
}

function titleDescription(activeTab: TabKey) {
  if (activeTab === "groups") return "Agrupadores administrativos que organizam as unidades operacionais.";
  if (activeTab === "locations") return "Base de localidades usada para orientar operação e candidato.";
  return "Hierarquia principal da operação: grupo operacional -> unidade operacional.";
}

function findGroup(groups: OperationalGroup[], id: string) {
  return groups.find((group) => group.id === id);
}

function unitGroupLabel(unit: OperationalUnit, groups: OperationalGroup[]) {
  const group = unit.group ?? findGroup(groups, unit.group_id);
  return group ? group.group_code : "-";
}

function resolveUnitGroup(unit: OperationalUnit, groups: OperationalGroup[]) {
  return unit.group ?? findGroup(groups, unit.group_id);
}

function findLocation(locations: LocationGroup[], id: string) {
  return locations.find((location) => location.id === id);
}

function compactText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function formatLocationSummary(city?: string | null, state?: string | null) {
  const safeCity = compactText(city);
  const safeState = compactText(state);
  if (safeCity && safeState) return `${safeCity}/${safeState}`;
  if (safeCity) return safeCity;
  if (safeState) return safeState;
  return null;
}

function buildCandidatePreview(input: {
  publicName?: string | null;
  city?: string | null;
  state?: string | null;
  referencePoint?: string | null;
  address?: string | null;
}) {
  const name = compactText(input.publicName);
  const location = formatLocationSummary(input.city, input.state);
  const reference = compactText(input.referencePoint) ?? compactText(input.address);
  const parts = [name, location, reference].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" — ") : null;
}

function actionErrorMessage(error: unknown, fallback: string) {
  const friendly = handleApiError(error);
  return formatErrorDetails(friendly)[0] ?? friendly.message ?? fallback;
}

function confirmModalTitle(toggle: ToggleState) {
  if (!toggle) return "";
  if (toggle.type === "group") {
    return toggle.item.is_active ? "Inativar grupo operacional" : "Reativar grupo operacional";
  }
  if (toggle.type === "location") {
    return toggle.item.is_active ? "Inativar localidade" : "Reativar localidade";
  }
  return toggle.item.is_active ? "Inativar unidade operacional" : "Reativar unidade operacional";
}

function confirmModalMessage(toggle: ToggleState) {
  if (!toggle) return "";
  if (toggle.type === "group") {
    return toggle.item.is_active
      ? "Este grupo operacional pode concentrar unidades usadas em vagas, candidaturas e pré-admissão. Ao inativar, novas configurações operacionais não devem usá-lo. Deseja continuar?"
      : "Ao reativar, o grupo operacional volta a ficar disponível para organizar unidades operacionais. Deseja continuar?";
  }
  if (toggle.type === "location") {
    return toggle.item.is_active
      ? "Esta localidade orienta o RH e o candidato sobre a região da operação. Ao inativar, novas unidades não devem depender dela. Deseja continuar?"
      : "Ao reativar, a localidade volta a poder ser vinculada a novas unidades operacionais. Deseja continuar?";
  }
  return toggle.item.is_active
    ? "Esta unidade operacional pode estar vinculada a vagas, candidaturas, pipeline ou pré-admissão. Ao inativar, ela não deve aparecer para novas candidaturas. Deseja continuar?"
    : "Ao reativar, a unidade operacional volta a ficar disponível para novas vagas e candidaturas quando vinculada pela operação. Deseja continuar?";
}

function confirmActionLabel(toggle: ToggleState) {
  if (!toggle) return "Confirmar";
  return toggle.item.is_active ? "Confirmar inativação" : "Confirmar reativação";
}

function SummaryTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-text-muted">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-text">{value}</p>
    </div>
  );
}

function Toolbar({
  search,
  setSearch,
  placeholder,
  activeFilter,
  setActiveFilter,
  hasActiveFilters,
  onClearFilters,
  children,
}: {
  search: string;
  setSearch: (value: string) => void;
  placeholder: string;
  activeFilter: ActiveFilter;
  setActiveFilter: (value: ActiveFilter) => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-surface px-3 py-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            className="h-9 rounded-lg border-border/80 bg-surface pl-8 pr-3 text-sm shadow-none"
          />
        </label>
      </div>
      <div className="flex flex-col gap-2 md:items-end">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <label className="block sm:w-[120px]">
            <span className="sr-only">Status</span>
            <Select
              value={activeFilter}
              onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
              className="h-9 rounded-lg border-border/80 bg-surface px-2.5 text-sm shadow-none"
            >
              <option value="all">Status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </Select>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">{children}</div>
        </div>
        {hasActiveFilters ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="h-7 px-2 text-xs text-text-muted hover:text-text"
            >
              Limpar filtros
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function GroupForm({
  item,
  saving,
  onCancel,
  onSubmit,
}: {
  item?: OperationalGroup;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateOperationalGroupPayload) => Promise<void>;
}) {
  const [groupCode, setGroupCode] = useState(item?.group_code ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      group_code: groupCode.trim(),
      name: name.trim(),
      description: cleanOptional(description),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 overflow-y-auto px-6 py-5">
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Código do grupo operacional
          <Input required value={groupCode} onChange={(event) => setGroupCode(event.target.value)} maxLength={50} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Nome do grupo operacional
          <Input required value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Descrição
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={1000}
          />
        </label>
        <p className="rounded-xl border border-border/70 bg-surface-muted px-3 py-2 text-sm text-text-muted">
          Use grupo operacional para o agrupador administrativo. O candidato não vê esse campo no portal.
        </p>
      </div>
      <FormActions saving={saving} onCancel={onCancel} submitLabel={item ? "Salvar grupo" : "Criar grupo"} />
    </form>
  );
}

function LocationForm({
  item,
  saving,
  onCancel,
  onSubmit,
}: {
  item?: LocationGroup;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateLocationGroupPayload) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [state, setState] = useState(item?.state ?? "");
  const [city, setCity] = useState(item?.city ?? "");
  const [type, setType] = useState<LocationGroupType>(item?.type ?? "city");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      name: name.trim(),
      state: state.trim().toUpperCase(),
      city: cleanOptional(city),
      type,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-text sm:col-span-2">
          Nome da localidade
          <Input required value={name} onChange={(event) => setName(event.target.value)} maxLength={255} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          UF
          <Input
            required
            value={state}
            onChange={(event) => setState(event.target.value)}
            minLength={2}
            maxLength={2}
            className="uppercase"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Tipo
          <Select value={type} onChange={(event) => setType(event.target.value as LocationGroupType)}>
            {Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text sm:col-span-2">
          Cidade
          <Input value={city} onChange={(event) => setCity(event.target.value)} maxLength={255} />
        </label>
      </div>
      <FormActions
        saving={saving}
        onCancel={onCancel}
        submitLabel={item ? "Salvar localidade" : "Criar localidade"}
      />
    </form>
  );
}

function UnitForm({
  item,
  groups,
  locations,
  saving,
  onCancel,
  onSubmit,
}: {
  item?: OperationalUnit;
  groups: OperationalGroup[];
  locations: LocationGroup[];
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: CreateOperationalUnitPayload) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState(item?.group_id ?? groups[0]?.id ?? "");
  const [locationGroupId, setLocationGroupId] = useState(item?.location_group_id ?? locations[0]?.id ?? "");
  const [branchCode, setBranchCode] = useState(item?.branch_code ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [publicName, setPublicName] = useState(item?.public_name ?? "");
  const [type, setType] = useState<OperationalUnitType>(item?.type ?? "gas_station");
  const [referencePoint, setReferencePoint] = useState(item?.reference_point ?? "");
  const [address, setAddress] = useState(item?.address ?? "");
  const [city, setCity] = useState(item?.city ?? "");
  const [state, setState] = useState(item?.state ?? "");
  const selectedLocation = findLocation(locations, locationGroupId);
  const candidatePreview = buildCandidatePreview({
    publicName,
    city: city || selectedLocation?.city,
    state: state || selectedLocation?.state,
    referencePoint,
    address,
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await onSubmit({
      group_id: groupId,
      location_group_id: locationGroupId,
      branch_code: branchCode.trim(),
      name: name.trim(),
      public_name: cleanOptional(publicName),
      type,
      reference_point: cleanOptional(referencePoint),
      address: cleanOptional(address),
      city: cleanOptional(city),
      state: cleanOptional(state)?.toUpperCase() ?? null,
    });
  }

  const canSubmit = Boolean(groupId && locationGroupId);

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Grupo operacional
          <Select required value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="" disabled>
              Selecione
            </option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.group_code} - {group.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Código interno da unidade
          <Input
            required
            value={branchCode}
            onChange={(event) => setBranchCode(event.target.value)}
            maxLength={50}
            placeholder="Código interno usado pela operação"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text sm:col-span-2">
          Nome interno da unidade operacional
          <Input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            placeholder="Nome técnico usado por RH e operação"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Localidade
          <Select required value={locationGroupId} onChange={(event) => setLocationGroupId(event.target.value)}>
            <option value="" disabled>
              Selecione
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} / {location.state}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Tipo
          <Select value={type} onChange={(event) => setType(event.target.value as OperationalUnitType)}>
            {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text sm:col-span-2">
          Nome público exibido ao candidato
          <Input value={publicName} onChange={(event) => setPublicName(event.target.value)} maxLength={255} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text sm:col-span-2">
          Ponto de referência
          <Input
            value={referencePoint}
            onChange={(event) => setReferencePoint(event.target.value)}
            maxLength={1000}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text sm:col-span-2">
          Endereço
          <Textarea value={address} onChange={(event) => setAddress(event.target.value)} maxLength={1000} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          Cidade
          <Input value={city} onChange={(event) => setCity(event.target.value)} maxLength={255} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-text">
          UF
          <Input
            value={state}
            onChange={(event) => setState(event.target.value)}
            minLength={state ? 2 : undefined}
            maxLength={2}
            className="uppercase"
          />
        </label>
        <div className="rounded-xl border border-border/70 bg-surface-muted px-4 py-3 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">
            Como o candidato verá
          </p>
          <p className="mt-2 text-sm font-medium text-text">
            {candidatePreview ?? "Nome público não informado. O candidato pode ver um nome técnico ou incompleto."}
          </p>
          {!compactText(publicName) ? (
            <p className="mt-2 text-sm text-amber-700">
              Nome público não informado. Preencha este campo para evitar exposição de nome técnico no portal.
            </p>
          ) : null}
          <p className="mt-2 text-xs text-text-muted">
            Grupo operacional e código interno ficam para uso administrativo. O portal usa nome público, cidade/UF e
            referência/endereço resumido.
          </p>
        </div>
        {!canSubmit ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">
            Cadastre pelo menos um grupo operacional e uma localidade antes de criar a unidade operacional.
          </p>
        ) : null}
      </div>
      <FormActions
        saving={saving}
        onCancel={onCancel}
        submitLabel={item ? "Salvar unidade operacional" : "Criar unidade operacional"}
        disabled={!canSubmit}
      />
    </form>
  );
}

function FormActions({
  saving,
  onCancel,
  submitLabel,
  disabled,
}: {
  saving: boolean;
  onCancel: () => void;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted px-6 py-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" disabled={saving || disabled}>
        {saving ? "Salvando..." : submitLabel}
      </Button>
    </div>
  );
}

export function EstruturaOperacionalPage() {
  const { user } = useAuth();
  const canWrite = isAdmin(user?.role);
  const [activeTab, setActiveTab] = useState<TabKey>("units");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [search, setSearch] = useState("");
  const [locationType, setLocationType] = useState<"" | LocationGroupType>("");
  const [unitType, setUnitType] = useState<"" | OperationalUnitType>("");
  const [unitGroupId, setUnitGroupId] = useState("");
  const [unitLocationId, setUnitLocationId] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [toggleState, setToggleState] = useState<ToggleState>(null);
  const [saving, setSaving] = useState(false);

  const groupsState = useAsyncState<{ data: OperationalGroup[]; total: number }>();
  const locationsState = useAsyncState<{ data: LocationGroup[]; total: number }>();
  const unitsState = useAsyncState<{ data: OperationalUnit[]; total: number }>();

  const loadGroups = () =>
    groupsState.run(() =>
      operationalMasterService.listOperationalGroups({
        page_size: 100,
        active: activeTab === "groups" ? activeParam(activeFilter) : undefined,
        search: activeTab === "groups" ? search || undefined : undefined,
      }),
    );

  const loadLocations = () =>
    locationsState.run(() =>
      operationalMasterService.listLocationGroups({
        page_size: 100,
        active: activeTab === "locations" ? activeParam(activeFilter) : undefined,
        search: activeTab === "locations" ? search || undefined : undefined,
        type: activeTab === "locations" ? locationType || undefined : undefined,
      }),
    );

  const loadUnits = () =>
    unitsState.run(() =>
      operationalMasterService.listOperationalUnits({
        page_size: 100,
        active: activeTab === "units" ? activeParam(activeFilter) : undefined,
        search: activeTab === "units" ? search || undefined : undefined,
        type: activeTab === "units" ? unitType || undefined : undefined,
        group_id: activeTab === "units" ? unitGroupId || undefined : undefined,
        location_group_id: activeTab === "units" ? unitLocationId || undefined : undefined,
      }),
    );

  const reloadAll = () => {
    void loadGroups();
    void loadLocations();
    void loadUnits();
  };

  useEffect(() => {
    reloadAll();
  }, []);

  useEffect(() => {
    if (activeTab === "groups") void loadGroups();
    if (activeTab === "locations") void loadLocations();
    if (activeTab === "units") void loadUnits();
  }, [activeTab, activeFilter, search, locationType, unitType, unitGroupId, unitLocationId]);

  const groups = groupsState.data?.data ?? [];
  const locations = locationsState.data?.data ?? [];
  const units = unitsState.data?.data ?? [];

  const activeGroups = useMemo(() => groups.filter((item) => item.is_active), [groups]);
  const activeLocations = useMemo(() => locations.filter((item) => item.is_active), [locations]);
  const currentTab = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

  function resetFilters() {
    setSearch("");
    setActiveFilter("all");
    setLocationType("");
    setUnitType("");
    setUnitGroupId("");
    setUnitLocationId("");
  }

  const hasActiveFilters =
    search.trim().length > 0 ||
    activeFilter !== "all" ||
    (activeTab === "locations" && locationType !== "") ||
    (activeTab === "units" &&
      (unitType !== "" || unitGroupId !== "" || unitLocationId !== ""));

  async function saveGroup(payload: CreateOperationalGroupPayload) {
    setSaving(true);
    try {
      if (modal?.type === "group" && modal.item) {
        await operationalMasterService.updateOperationalGroup(modal.item.id, payload);
        toast.success("Grupo atualizado.");
      } else {
        await operationalMasterService.createOperationalGroup(payload);
        toast.success("Grupo criado.");
      }
      setModal(null);
      reloadAll();
    } catch (error) {
      toast.error(actionErrorMessage(error, "Não foi possível salvar o grupo operacional."));
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation(payload: CreateLocationGroupPayload) {
    setSaving(true);
    try {
      if (modal?.type === "location" && modal.item) {
        await operationalMasterService.updateLocationGroup(modal.item.id, payload);
        toast.success("Localidade atualizada.");
      } else {
        await operationalMasterService.createLocationGroup(payload);
        toast.success("Localidade criada.");
      }
      setModal(null);
      reloadAll();
    } catch (error) {
      toast.error(actionErrorMessage(error, "Não foi possível salvar a localidade."));
    } finally {
      setSaving(false);
    }
  }

  async function saveUnit(payload: CreateOperationalUnitPayload) {
    setSaving(true);
    try {
      if (modal?.type === "unit" && modal.item) {
        await operationalMasterService.updateOperationalUnit(modal.item.id, payload);
        toast.success("Unidade operacional atualizada.");
      } else {
        await operationalMasterService.createOperationalUnit(payload);
        toast.success("Unidade operacional criada.");
      }
      setModal(null);
      reloadAll();
    } catch (error) {
      toast.error(actionErrorMessage(error, "Não foi possível salvar a unidade operacional."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleGroup(item: OperationalGroup) {
    try {
      await operationalMasterService.updateOperationalGroup(item.id, { is_active: !item.is_active });
      toast.success(item.is_active ? "Grupo operacional inativado." : "Grupo operacional reativado.");
      reloadAll();
    } catch (error) {
      toast.error(actionErrorMessage(error, "Não foi possível alterar o grupo operacional."));
    }
  }

  async function toggleLocation(item: LocationGroup) {
    try {
      await operationalMasterService.updateLocationGroup(item.id, { is_active: !item.is_active });
      toast.success(item.is_active ? "Localidade inativada." : "Localidade reativada.");
      reloadAll();
    } catch (error) {
      toast.error(actionErrorMessage(error, "Não foi possível alterar a localidade."));
    }
  }

  async function toggleUnit(item: OperationalUnit) {
    try {
      await operationalMasterService.updateOperationalUnit(item.id, { is_active: !item.is_active });
      toast.success(item.is_active ? "Unidade operacional inativada." : "Unidade operacional reativada.");
      reloadAll();
    } catch (error) {
      toast.error(actionErrorMessage(error, "Não foi possível alterar a unidade operacional."));
    }
  }

  async function confirmToggle() {
    if (!toggleState) return;
    const current = toggleState;
    setToggleState(null);
    if (current.type === "group") {
      await toggleGroup(current.item);
      return;
    }
    if (current.type === "location") {
      await toggleLocation(current.item);
      return;
    }
    await toggleUnit(current.item);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6 pb-12 sm:px-6">
      <PageHeader
        title="Estrutura Operacional"
        subtitle="Cadastre a hierarquia da operação com clareza: grupo operacional organiza as unidades operacionais, e o nome público define o que o candidato verá no portal."
        actions={
          <Button
            type="button"
            variant="secondary"
            onClick={reloadAll}
            className="h-10 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Unidades operacionais" value={units.length} icon={<Store className="h-4 w-4" />} />
        <SummaryTile label="Localidades" value={locations.length} icon={<MapPin className="h-4 w-4" />} />
        <SummaryTile label="Grupos operacionais" value={groups.length} icon={<Building2 className="h-4 w-4" />} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const nextTab = value as TabKey;
          setActiveTab(nextTab);
          resetFilters();
        }}
      >
        <TabsList
          aria-label="Cadastros da estrutura operacional"
          className="grid h-auto w-full grid-cols-1 gap-1 rounded-xl bg-surface-muted/70 p-1 sm:grid-cols-3"
        >
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.key}
              value={tab.key}
              className="h-auto min-h-[42px] justify-start rounded-lg px-3 py-2 text-left text-sm font-semibold data-[state=active]:bg-[hsl(var(--primary))] data-[state=active]:text-white"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-text">{currentTab.label}</h2>
            <p className="text-sm text-text-muted">{titleDescription(activeTab)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:justify-end">
            {!canWrite ? (
              <p className="rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-muted">
                Seu perfil pode visualizar, mas não criar ou editar cadastros.
              </p>
            ) : (
              <Button
                type="button"
                onClick={() =>
                  setModal({
                    type: activeTab === "groups" ? "group" : activeTab === "locations" ? "location" : "unit",
                  })
                }
                className="h-10 gap-2 px-4 shadow-none"
              >
                <Plus className="h-4 w-4" />
                {createButtonLabel(activeTab)}
              </Button>
            )}
          </div>
        </div>

        <Toolbar
          search={search}
          setSearch={setSearch}
          placeholder={
            activeTab === "groups"
              ? "Buscar por grupo ou nome"
              : activeTab === "locations"
                ? "Buscar por localidade, cidade ou UF"
                : "Buscar por grupo, código interno, nome ou referência"
          }
          activeFilter={activeFilter}
          setActiveFilter={setActiveFilter}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={() => resetFilters()}
        >
          {activeTab === "locations" ? (
            <Select
              aria-label="Tipo de localidade"
              value={locationType}
              onChange={(event) => setLocationType(event.target.value as "" | LocationGroupType)}
              className="h-9 min-w-[140px] rounded-lg border-border/80 bg-surface px-2.5 text-sm shadow-none"
            >
              <option value="">Tipo</option>
              {Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          ) : null}

          {activeTab === "units" ? (
            <>
              <Select
                aria-label="Grupo operacional da unidade"
                value={unitGroupId}
                onChange={(event) => setUnitGroupId(event.target.value)}
                className="h-9 min-w-[148px] rounded-lg border-border/80 bg-surface px-2.5 text-sm shadow-none"
              >
                <option value="">Grupo operacional</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.group_code} - {group.name}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Localidade da unidade"
                value={unitLocationId}
                onChange={(event) => setUnitLocationId(event.target.value)}
                className="h-9 min-w-[156px] rounded-lg border-border/80 bg-surface px-2.5 text-sm shadow-none"
              >
                <option value="">Localidade</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} / {location.state}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Tipo de unidade"
                value={unitType}
                onChange={(event) => setUnitType(event.target.value as "" | OperationalUnitType)}
                className="h-9 min-w-[120px] rounded-lg border-border/80 bg-surface px-2.5 text-sm shadow-none"
              >
                <option value="">Tipo</option>
                {Object.entries(UNIT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

        </Toolbar>

        {activeTab === "groups" ? (
          <DataTable
            columns={[
              { header: "Código" },
              { header: "Grupo operacional" },
              { header: "Status" },
              { header: "Atualizado" },
              { header: "Ações", className: "text-right" },
            ]}
            items={groups}
            loading={groupsState.loading}
            error={groupsState.error}
            empty={{
              icon: "🏢",
              title: "Nenhum grupo encontrado",
              description: "Crie grupos como Escritório ou Postos quando a base operacional estiver pronta.",
            }}
            rowKey={(item) => item.id}
            renderRow={(item) => (
              <TableRow>
                <TableCell className="font-mono text-sm font-semibold text-text">{item.group_code}</TableCell>
                <TableCell>
                  <div className="font-medium text-text">{item.name}</div>
                  <div className="text-xs text-text-muted">{optionLabel(item.description, "Agrupador administrativo")}</div>
                </TableCell>
                <TableCell>{statusBadge(item.is_active)}</TableCell>
                <TableCell className="text-text-muted">{formatDate(item.updated_at)}</TableCell>
                <TableCell>
                  <RowActions
                    canWrite={canWrite}
                    isActive={item.is_active}
                    onEdit={() => setModal({ type: "group", item })}
                    onToggle={() => setToggleState({ type: "group", item })}
                  />
                </TableCell>
              </TableRow>
            )}
          />
        ) : null}

        {activeTab === "locations" ? (
          <DataTable
            columns={[
              { header: "Localidade" },
              { header: "UF" },
              { header: "Tipo" },
              { header: "Status" },
              { header: "Ações", className: "text-right" },
            ]}
            items={locations}
            loading={locationsState.loading}
            error={locationsState.error}
            empty={{
              icon: "📍",
              title: "Nenhuma localidade encontrada",
              description: "Cadastre localidades humanas antes de vincular filiais e postos.",
            }}
            rowKey={(item) => item.id}
            renderRow={(item) => (
              <TableRow>
                <TableCell>
                  <div className="font-medium text-text">{item.name}</div>
                  <div className="text-xs text-text-muted">{optionLabel(item.city)}</div>
                </TableCell>
                <TableCell className="font-mono font-semibold text-text">{item.state}</TableCell>
                <TableCell>{LOCATION_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{statusBadge(item.is_active)}</TableCell>
                <TableCell>
                  <RowActions
                    canWrite={canWrite}
                    isActive={item.is_active}
                    onEdit={() => setModal({ type: "location", item })}
                    onToggle={() => setToggleState({ type: "location", item })}
                  />
                </TableCell>
              </TableRow>
            )}
          />
        ) : null}

        {activeTab === "units" ? (
          <>
            <div className="rounded-xl border border-border bg-surface px-4 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Hierarquia operacional</p>
              <p className="mt-2 text-sm text-text">
                Grupo operacional organiza as unidades operacionais. Nome público, cidade/UF e referência definem o
                preview exibido ao candidato no portal.
              </p>
            </div>
            <DataTable
              columns={[
                { header: "Grupo operacional" },
                { header: "Código interno" },
                { header: "Unidade operacional" },
                { header: "Como o candidato verá" },
                { header: "Status" },
                { header: "Atualizado" },
                { header: "Ações", className: "text-right" },
              ]}
              items={units}
              loading={unitsState.loading}
              error={unitsState.error}
              empty={{
                icon: "⛽",
                title: "Nenhuma unidade operacional encontrada",
                description: "Cadastre unidades reais somente depois de ter grupo operacional e localidade.",
              }}
              rowKey={(item) => item.id}
              renderRow={(item) => {
                const location = findLocation(locations, item.location_group_id);
                const group = resolveUnitGroup(item, groups);
                const preview = buildCandidatePreview({
                  publicName: item.public_name,
                  city: item.city ?? location?.city,
                  state: item.state ?? location?.state,
                  referencePoint: item.reference_point,
                  address: item.address,
                });

                return (
                  <TableRow>
                    <TableCell>
                      <div className="font-mono text-sm font-semibold text-text">{unitGroupLabel(item, groups)}</div>
                      <div className="text-xs text-text-muted">{optionLabel(group?.name, "Grupo não encontrado")}</div>
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold text-text">{item.branch_code}</TableCell>
                    <TableCell>
                      <div className="font-medium text-text">{item.name}</div>
                      <div className="text-xs text-text-muted">
                        {UNIT_TYPE_LABELS[item.type]}{location ? ` • ${location.name} / ${location.state}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-text">
                        {preview ?? "Nome público não informado. O candidato pode ver um nome técnico ou incompleto."}
                      </div>
                      {!compactText(item.public_name) ? (
                        <div className="text-xs text-amber-700">Preencha o nome público para o portal do candidato.</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{statusBadge(item.is_active)}</TableCell>
                    <TableCell className="text-text-muted">{formatDate(item.updated_at)}</TableCell>
                    <TableCell>
                      <RowActions
                        canWrite={canWrite}
                        isActive={item.is_active}
                        onEdit={() => setModal({ type: "unit", item })}
                        onToggle={() => setToggleState({ type: "unit", item })}
                      />
                    </TableCell>
                  </TableRow>
                );
              }}
            />
          </>
        ) : null}
      </section>

      {activeTab === "units" ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-4 text-sm text-text-muted shadow-sm">
          <div className="mb-2 flex items-center gap-2 font-semibold text-text">
            <SlidersHorizontal className="h-4 w-4" />
            Contrato operacional
          </div>
          <p>
            O candidato verá nome público, cidade/UF e ponto de referência ou endereço resumido. Grupo operacional e
            código interno da unidade ficam para uso do RH.
          </p>
        </div>
      ) : null}

      {modal ? (
        <Modal
          title={
            modal.type === "group"
              ? modal.item
                ? "Editar grupo operacional"
                : "Novo grupo operacional"
              : modal.type === "location"
                ? modal.item
                  ? "Editar localidade"
                  : "Nova localidade"
                : modal.item
                  ? "Editar unidade operacional"
                  : "Nova unidade operacional"
          }
          onClose={() => setModal(null)}
          contentClassName={modal.type === "unit" ? "sm:max-w-[720px]" : undefined}
        >
          {modal.type === "group" ? (
            <GroupForm
              item={modal.item}
              saving={saving}
              onCancel={() => setModal(null)}
              onSubmit={saveGroup}
            />
          ) : null}
          {modal.type === "location" ? (
            <LocationForm
              item={modal.item}
              saving={saving}
              onCancel={() => setModal(null)}
              onSubmit={saveLocation}
            />
          ) : null}
          {modal.type === "unit" ? (
            <UnitForm
              item={modal.item}
              groups={activeGroups}
              locations={activeLocations}
              saving={saving}
              onCancel={() => setModal(null)}
              onSubmit={saveUnit}
            />
          ) : null}
        </Modal>
      ) : null}

      {toggleState ? (
        <Modal title={confirmModalTitle(toggleState)} onClose={() => setToggleState(null)}>
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid gap-4 px-6 py-5">
              <div className="rounded-xl border border-border/70 bg-surface-muted px-4 py-3">
                <p className="text-sm font-medium text-text">
                  {toggleState.type === "group"
                    ? toggleState.item.name
                    : toggleState.type === "location"
                      ? `${toggleState.item.name} / ${toggleState.item.state}`
                      : toggleState.item.name}
                </p>
                <p className="mt-1 text-sm text-text-muted">{confirmModalMessage(toggleState)}</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-surface-muted px-6 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setToggleState(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void confirmToggle()}>
                {confirmActionLabel(toggleState)}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function RowActions({
  canWrite,
  isActive,
  onEdit,
  onToggle,
}: {
  canWrite: boolean;
  isActive: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  if (!canWrite) {
    return <div className="text-right text-xs text-text-muted">Somente leitura</div>;
  }

  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={onEdit} className="h-8 gap-1.5 px-2.5">
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onToggle} className="h-8 gap-1.5 px-2.5">
        {isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        {isActive ? "Inativar" : "Reativar"}
      </Button>
    </div>
  );
}
