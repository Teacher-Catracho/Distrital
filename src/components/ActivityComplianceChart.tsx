import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, BarChart3, ListChecks } from 'lucide-react';
import type {
  ActivityCompliance,
  DistrictActivity,
  ParcialNumber,
  School,
} from '../types/sace';
import {
  PARCIALES,
  getDefaultParcial,
  getParcialLabel,
  schoolMatchesComplianceGroup,
  type SchoolComplianceGroupKey,
} from '../utils/saceCalculations';

interface ActivityComplianceChartProps {
  year: number;
  schools: School[];
  activities: DistrictActivity[];
  compliances: ActivityCompliance[];
  onOpenCompliance?: () => void;
}

type ChartMetricMode = 'percentage' | 'counts';

interface LevelProgressPoint {
  key: SchoolComplianceGroupKey;
  label: string;
  shortLabel: string;
  schoolsCount: number;
  expected: number;
  completed: number;
  pending: number;
  pct: number;
  color: string;
}

const LEVEL_GROUPS: {
  key: SchoolComplianceGroupKey;
  label: string;
  shortLabel: string;
  color: string;
}[] = [
  {
    key: 'prebasica',
    label: 'Prebásica',
    shortLabel: 'Prebásica',
    color: '#d97706',
  },
  {
    key: 'basica_c1_2',
    label: 'Básica I-II (1° a 6°)',
    shortLabel: 'Básica I-II',
    color: '#2563eb',
  },
  {
    key: 'basica_c1_2_3',
    label: 'Básica III Ciclo',
    shortLabel: 'Básica III Ciclo',
    color: '#7c3aed',
  },
  {
    key: 'media',
    label: 'Media',
    shortLabel: 'Media',
    color: '#0f766e',
  },
];

function ComplianceChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: LevelProgressPoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 shadow-sm px-3.5 py-2.5 text-xs space-y-2 min-w-[220px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{pt.label}</span>
        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
          {pt.schoolsCount} {pt.schoolsCount === 1 ? 'centro' : 'centros'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Cumplidas</span>
          <span className="font-mono font-semibold tabular-nums text-emerald-700">
            {pt.completed}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Pendientes</span>
          <span className="font-mono font-semibold tabular-nums text-red-700">
            {pt.pending}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Total esperadas</span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {pt.expected}
          </span>
        </div>
      </div>
      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-4">
        <span className="font-semibold text-slate-900">Nivel de cumplimiento</span>
        <span className="font-mono font-bold tabular-nums text-slate-900">{pt.pct}%</span>
      </div>
    </div>
  );
}

export function ActivityComplianceChart({
  year,
  schools,
  activities,
  compliances,
  onOpenCompliance,
}: ActivityComplianceChartProps) {
  const currentParcial = getDefaultParcial();
  const [selectedParcial, setSelectedParcial] = useState<ParcialNumber>(currentParcial);
  const [metricMode, setMetricMode] = useState<ChartMetricMode>('percentage');

  const activeSchools = useMemo(
    () => schools.filter((s) => s.active !== false),
    [schools]
  );

  const periodActivities = useMemo(
    () =>
      activities.filter(
        (a) => a.year === year && a.parcial === selectedParcial && a.active !== false
      ),
    [activities, year, selectedParcial]
  );

  const complianceMap = useMemo(() => {
    const map = new Map<string, ActivityCompliance>();
    for (const c of compliances) {
      map.set(`${c.activityId}_${c.schoolId}`, c);
    }
    return map;
  }, [compliances]);

  const chartData: LevelProgressPoint[] = useMemo(() => {
    return LEVEL_GROUPS.map((grp) => {
      const groupSchools = activeSchools.filter((s) =>
        schoolMatchesComplianceGroup(s, grp.key)
      );

      let expected = 0;
      let completed = 0;

      for (const s of groupSchools) {
        for (const act of periodActivities) {
          if (!act.targetSchoolIds.includes(s.id)) continue;
          expected++;
          if (complianceMap.get(`${act.id}_${s.id}`)?.completed === true) {
            completed++;
          }
        }
      }

      const pending = expected - completed;
      const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0;

      return {
        key: grp.key,
        label: grp.label,
        shortLabel: grp.shortLabel,
        schoolsCount: groupSchools.length,
        expected,
        completed,
        pending,
        pct,
        color: grp.color,
      };
    });
  }, [activeSchools, periodActivities, complianceMap]);

  const totals = useMemo(() => {
    const expected = chartData.reduce((sum, d) => sum + d.expected, 0);
    const completed = chartData.reduce((sum, d) => sum + d.completed, 0);
    const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0;
    return { expected, completed, pending: expected - completed, pct };
  }, [chartData]);

  return (
    <section className="bg-white border border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-blue-700" />
            Progreso de Cumplimiento de Actividades por Nivel ({year})
          </h2>
          <p className="text-xs text-slate-500">
            Comparativo entre Prebásica, Básica I-II, Básica III Ciclo y Media ·{' '}
            {getParcialLabel(selectedParcial)}
            {selectedParcial === currentParcial ? ' (Periodo actual)' : ''}
            {periodActivities.length > 0
              ? ` · ${periodActivities.length} ${periodActivities.length === 1 ? 'actividad' : 'actividades'}`
              : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setMetricMode('percentage')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                metricMode === 'percentage'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              % Cumplimiento
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('counts')}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                metricMode === 'counts'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cumplidas vs Pendientes
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="activity-chart-parcial" className="text-xs text-slate-600">
              Periodo:
            </label>
            <select
              id="activity-chart-parcial"
              value={selectedParcial}
              onChange={(e) => setSelectedParcial(Number(e.target.value) as ParcialNumber)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
            >
              {PARCIALES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label} {p.value === currentParcial ? '(Actual)' : ''}
                </option>
              ))}
            </select>
          </div>

          {onOpenCompliance && (
            <button
              type="button"
              onClick={onOpenCompliance}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              Gestionar matriz
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="p-5">
        {periodActivities.length === 0 || totals.expected === 0 ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-center px-4 bg-slate-50/70 border border-dashed border-slate-200 space-y-3">
            <div className="space-y-1 max-w-md">
              <p className="text-xs font-semibold text-slate-800">
                Sin actividades registradas en el {getParcialLabel(selectedParcial)} {year}
              </p>
              <p className="text-xs text-slate-500">
                Crea actividades en la sección &ldquo;Control de Cumplimiento&rdquo; para visualizar el avance comparativo entre Prebásica, Básica I-II, Básica III Ciclo y Media.
              </p>
            </div>
            {onOpenCompliance && (
              <button
                type="button"
                onClick={onOpenCompliance}
                className="px-3.5 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
              >
                Ir a Control de Cumplimiento
              </button>
            )}
          </div>
        ) : (
          <div className="w-full h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              {metricMode === 'percentage' ? (
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(val) => `${val}%`}
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip content={<ComplianceChartTooltip />} />
                  <Bar
                    dataKey="pct"
                    name="% Cumplimiento"
                    maxBarSize={68}
                    radius={[2, 2, 0, 0]}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={42}
                  />
                  <Tooltip content={<ComplianceChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    iconType="square"
                  />
                  <Bar
                    dataKey="completed"
                    name="Cumplidas"
                    stackId="compliance"
                    fill="#16a34a"
                    maxBarSize={68}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pendientes"
                    stackId="compliance"
                    fill="#dc2626"
                    maxBarSize={68}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Per-Level Summary Strip */}
      <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        {chartData.map((item) => (
          <div key={item.key} className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-slate-600">
              <span
                className="w-2.5 h-2.5 inline-block shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-slate-800">{item.shortLabel}</span>
            </div>
            <p className="font-mono font-bold text-slate-900 tabular-nums">
              {item.pct}%
              <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                ({item.completed}/{item.expected} entregas)
              </span>
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
