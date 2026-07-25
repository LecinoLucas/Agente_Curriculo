# Dashboard tab — design spec

Date: 2026-07-25

## Purpose

Add a new top-level "Dashboard" tab, distinct from the existing "Central RH" (`/rh`), showing real recruitment activity as trend charts (using a proper charting library) instead of static numeric cards. Same target audience as Central RH: `admin`, `hr`, `recruiter`, `viewer`.

## Scope

- New backend endpoint returning daily trend data for 3 real metrics.
- New frontend route `/dashboard` (currently a placeholder that redirects to `/rh` — this spec replaces that redirect with the real page).
- New top-level nav item next to "Central RH".
- Charts built with **Recharts** (chosen over Visx and Tremor/shadcn-charts: best fit for composable, themeable dashboard charts without pulling in a parallel design system or D3-level boilerplate).

Out of scope: no changes to `/rh` (Central RH) or `/admin/bi` (Admin BI) content. No new database tables — all data is aggregated from existing models at request time.

## Backend

### Endpoint

`GET /api/v1/rh/dashboard/trends?days={7|14|30}` (default `14`)

Role gate: identical to existing `/rh/dashboard` routes — `require_roles(ADMIN, HR, RECRUITER, VIEWER)`.

Lives in `backend/src/interface/api/routers/rh_dashboard.py`, alongside the existing `_load_summary` / `_load_pipeline_funnel` helpers.

### Aggregation

For the requested window (`days` calendar days ending today, in `America/Sao_Paulo`), compute 3 daily series, grouped by local calendar day, zero-filled for days with no activity:

- **`candidates`**: count of `CandidateModel` rows where `created_at` falls on that local day, excluding `deleted_at` / `archived_at` — mirrors the existing `new_candidates` summary filter.
- **`interviews`**: count of `InterviewScheduleModel` rows where `scheduled_start` falls on that local day AND `status` is in `_ACTIVE_INTERVIEW_STATUSES` (`scheduled`, `rescheduled`) — same filter already used for `interviews_today`.
- **`hires`**: count of `PreAdmissionCaseModel` rows where `status == "admitted"` and `updated_at` falls on that local day — mirrors the existing `admitted_this_month` filter, bucketed daily instead of monthly.

Implementation approach: one grouped SQL query per metric using
`sa.cast(sa.func.timezone("America/Sao_Paulo", <timestamp_col>), sa.Date)` as the group-by key, bounded by the UTC range for the window (reusing the existing `_day_bounds` helper for the end boundary). Results are merged in Python into a contiguous list of `days` points (oldest → newest), filling `0` for dates absent from the query results.

### Schemas

In `backend/src/interface/api/schemas/rh_dashboard_schemas.py`:

```python
class RhDashboardTrendPoint(BaseModel):
    date: date
    candidates: int
    interviews: int
    hires: int

class RhDashboardTrendsResponse(BaseModel):
    days: int
    points: list[RhDashboardTrendPoint]
```

## Frontend

### Route & navigation

- `frontend/src/app/AppRouter.tsx`: replace the existing placeholder
  `<Route path="dashboard" element={<Navigate to="/rh" replace />} />`
  with `protectedPage(<DashboardPage />, RH_DASHBOARD_ROLES)`.
- `frontend/src/components/layout/AppShell.tsx`: add a new top-level `NavGroup` (`isDropdown: false`, single item), positioned right after "Central RH", labeled "Dashboard", roles `RH_DASHBOARD_ROLES`, icon `Activity` in `ICON_MAP` (distinct from `LayoutGrid` used by Central RH and `BarChart3` already used by Admin BI).

### Service

`frontend/src/services/rhDashboardService.ts`: add
```ts
export type RhDashboardTrendPoint = { date: string; candidates: number; interviews: number; hires: number };
export type RhDashboardTrendsResponse = { days: number; points: RhDashboardTrendPoint[] };

async getTrends(days: 7 | 14 | 30 = 14): Promise<RhDashboardTrendsResponse> {
  return httpRequest(`/api/v1/rh/dashboard/trends?days=${days}`);
}
```

### Page

New `frontend/src/pages/DashboardPage.tsx`, following the same loading pattern as `RhDashboardPage.tsx` (independent fetches for trends and pipeline funnel, each with its own loading/error state).

New components under `frontend/src/features/dashboard/components/`:

- **`RecruitmentTrendsChartCard.tsx`** — the centerpiece. A Recharts `AreaChart` (`ResponsiveContainer` wrapper) with 3 gradient-filled series (Candidatos / Entrevistas / Contratações), shared date X-axis, custom themed tooltip, legend with colored dots, dashed grid using `hsl(var(--border))`. Series colors drawn from existing semantic tokens: `hsl(var(--primary))` (candidatos), `hsl(var(--brand-glow))` (entrevistas), `hsl(var(--success))` (contratações) — consistent with the palette already used in `AdminBiPage`'s `CHART_COLORS`. Card chrome (border, radius, shadow) matches the current functionalist style (hairline border, no glow decoration — the only "glow" is the chart's own gradient fill defs, which is a data visualization, not decorative chrome).
- **Period toggle** (7 / 14 / 30 dias) — a small segmented control in the card header, driving the `days` param passed to `getTrends`.
- **Period totals strip** — 3 compact inline stat tiles below the chart, summing each series over the selected window, using the same 3 colors as the chart legend.

The existing `RecruitmentPipelineFunnelCard` (`frontend/src/features/rh-dashboard/components/RecruitmentPipelineFunnelCard.tsx`) is reused as-is in a second row, fed by the existing `rhDashboardService.getPipelineFunnel()` call — no changes needed to that component.

### Dependency

Add `recharts` to `frontend/package.json`.

## Error handling

- Trends fetch and funnel fetch are independent (same pattern as `RhDashboardPage.loadAllRealData`): one failing doesn't block the other.
- Chart card: skeleton while loading, `EmptyState` with retry on error, "sem dados no período" empty state if the window has zero activity across all 3 series (distinct from a fetch error).
- Period toggle re-fetches trends only (funnel is period-independent, matching its current behavior on `/rh`).

## Testing

- **Backend**: pytest in `backend/tests/` covering the new route — role gate (non-RH roles get 403), correct per-day bucketing across a São Paulo day boundary, zero-fill for days with no rows, and the interview status filter (only `scheduled`/`rescheduled` counted).
- **Frontend**: RTL test for `DashboardPage` — mock `rhDashboardService.getTrends` and `getPipelineFunnel`, assert period totals render correctly, chart card renders (via container/testid, not asserting SVG path internals), and period toggle triggers a re-fetch with the new `days` value.
