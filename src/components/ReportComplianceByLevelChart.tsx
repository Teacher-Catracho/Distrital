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
import { ArrowRight, BarChart3, ClipboardCheck } from 'lucide-react';
import type {
  AnnualReport,
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  ReportStatus,
  School,
} from '../types/sace';
import { MONTHS } from '../utils/saceCalculations';

interface ReportComplianceByLevelChartProps {
  year: number;
  schools: School[];
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  annualReports: AnnualReport[];
  onOpenReviews?: () => void;
}

type ReportKind = 'parteMensual' | 'monthly' | 'annual';
type MetricMode = 'percentage' | 'counts';

interface LevelCompliancePoint {
  level: EducationLevel;
  label: string;
  expected: number;
  completed: number;
  approved: number;
  inReview: number;
  pending: number;
  pct: number;
  color: string;
}

const LEVELS_META: { level: EducationLevel; label: string; color: string }[] = [
  { level: 'prebasica', label: 'Prebásica', color: '#d97706' },
  { level: 'basica', label: 'Básica', color: '#2563eb' },
  { level: 'media', label: 'Media', color: '#0f766e' },
];

const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  parteMensual: 'Parte Mensual',
  monthly: 'Movimientos-SACE',
  annual: 'Reporte Anual',
};

function ReportComplianceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: LevelCompliancePoint }>;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 shadow-sm px-3.5 py-2.5 text-xs space-y-2 min-w-[230px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900 flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 inline-block shrink-0"
            style={{ backgroundColor: pt.color }}
          />
          {pt.label}
        </span>
        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
          {pt.expected} {pt.expected === 1 ? 'centro' : 'centros'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Aprobados</span>
          <span className="font-mono font-semibold tabular-nums text-emerald-700">
            {pt.approved}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">En revisión</span>
          <span className="font-mono font-semibold tabular-nums text-blue-700">
            {pt.inReview}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Pendientes / sin envío</span>
          <span className="font-mono font-semibold tabular-nums text-red-700">
            {pt.pending}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Total esperados</span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {pt.expected}
          </span>
        </div>
      </div>
      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-4">
        <span className="font-semibold text-slate-900">Tasa de cumplimiento</span>
        <span className="font-mono font-bold tabular-nums text-slate-900">{pt.pct}%</span>
      </div>
    </div>
  );
}

export function ReportComplianceByLevelChart({
  year,
  schools,
  parteMensualReports,
  monthlyReports,
  annualReports,
  onOpenReviews,
}: ReportComplianceByLevelChartProps) {
  const currentMonth = new Date().getMonth() + 1;
  const [reportKind, setReportKind] = useState<ReportKind>('parteMensual');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [metricMode, setMetricMode] = useState<MetricMode>('percentage');

  const activeSchools = useMemo(
    () => schools.filter((s) => s.active !== false),
    [schools]
  );

  const monthLabel =
    MONTHS.find((m) => m.value === selectedMonth)?.label || String(selectedMonth);

  const chartData: LevelCompliancePoint[] = useMemo(() => {
    const statusBySchoolLevel = new Map<string, ReportStatus>();

    if (reportKind === 'parteMensual') {
      for (const r of parteMensualReports) {
        if (r.year === year && r.month === selectedMonth) {
          statusBySchoolLevel.set(`${r.schoolId}_${r.level}`, r.status);
        }
      }
    } else if (reportKind === 'monthly') {
      for (const r of monthlyReports) {
        if (r.year === year && r.month === selectedMonth) {
          statusBySchoolLevel.set(`${r.schoolId}_${r.level}`, r.status);
        }
      }
    } else {
      for (const r of annualReports) {
        if (r.year === year) {
          statusBySchoolLevel.set(`${r.schoolId}_${r.level}`, r.status);
        }
      }
    }

    return LEVELS_META.map(({ level, label, color }) => {
      const levelSchools = activeSchools.filter((s) =>
        s.levels.length > 0 ? s.levels.includes(level) : level === 'basica'
      );

      let approved = 0;
      let inReview = 0;

      for (const s of levelSchools) {
        const st = statusBySchoolLevel.get(`${s.id}_${level}`);
        if (st === 'approved') {
          approved++;
        } else if (st === 'submitted') {
          inReview++;
        }
      }

      const expected = levelSchools.length;
      const completed = approved + inReview;
      const pending = Math.max(0, expected - completed);
      const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0;

      return {
        level,
        label,
        expected,
        completed,
        approved,
        inReview,
        pending,
        pct,
        color,
      };
    });
  }, [
    activeSchools,
    parteMensualReports,
    monthlyReports,
    annualReports,
    reportKind,
    year,
    selectedMonth,
  ]);

  const overallTotals = useMemo(() => {
    const expected = chartData.reduce((sum, d) => sum + d.expected, 0);
    const completed = chartData.reduce((sum, d) => sum + d.completed, 0);
    const pct = expected > 0 ? Math.round((completed / expected) * 100) : 0;
    return { expected, completed, pct };
  }, [chartData]);

  return (
    <section className="bg-white border border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-700" />
            Tasa de Cumplimiento de Reportes por Nivel Educativo ({year})
          </h2>
          <p className="text-xs text-slate-500">
            {REPORT_KIND_LABELS[reportKind]}
            {reportKind !== 'annual' ? ` · ${monthLabel} ${year}` : ` · Año ${year}`} ·{' '}
            Cumplimiento global:{' '}
            <span className="font-mono font-semibold text-slate-700 tabular-nums">
              {overallTotals.pct}%
            </span>{' '}
            ({overallTotals.completed}/{overallTotals.expected} entregas)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100">
            {(Object.keys(REPORT_KIND_LABELS) as ReportKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setReportKind(k)}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  reportKind === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {REPORT_KIND_LABELS[k]}
              </button>
            ))}
          </div>

          {reportKind !== 'annual' && (
            <div className="flex items-center gap-2">
              <label htmlFor="report-compliance-month" className="text-xs text-slate-600">
                Mes:
              </label>
              <select
                id="report-compliance-month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
              >
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label} {m.value === currentMonth ? '(Actual)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

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
              % Tasa
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
              Desglose
            </button>
          </div>

          {onOpenReviews && (
            <button
              type="button"
              onClick={onOpenReviews}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap shrink-0"
            >
              Revisar envíos
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="p-5">
        {activeSchools.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-center px-4 bg-slate-50/70 border border-dashed border-slate-200">
            <p className="text-xs text-slate-500">
              Aún no hay centros educativos activos en el catálogo del distrito para calcular la tasa de cumplimiento por nivel.
            </p>
          </div>
        ) : (
          <div className="w-full h-[290px]">
            <ResponsiveContainer width="100%" height="100%">
              {metricMode === 'percentage' ? (
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
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
                  <Tooltip content={<ReportComplianceTooltip />} />
                  <Bar
                    dataKey="pct"
                    name="% Cumplimiento"
                    maxBarSize={76}
                    radius={[2, 2, 0, 0]}
                  >
                    {chartData.map((entry) => (
                      <Cell key={entry.level} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 12, fill: '#334155', fontWeight: 600 }}
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
                  <Tooltip content={<ReportComplianceTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
                    iconType="square"
                  />
                  <Bar
                    dataKey="approved"
                    name="Aprobados"
                    stackId="reports"
                    fill="#16a34a"
                    maxBarSize={76}
                  />
                  <Bar
                    dataKey="inReview"
                    name="En revisión"
                    stackId="reports"
                    fill="#2563eb"
                    maxBarSize={76}
                  />
                  <Bar
                    dataKey="pending"
                    name="Pendientes"
                    stackId="reports"
                    fill="#dc2626"
                    maxBarSize={76}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Level Breakdown Strip */}
      <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        {chartData.map((item) => (
          <div key={item.level} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 inline-block shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-semibold text-slate-800">{item.label}</span>
              </div>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {item.pct}%
              </span>
            </div>
            <p className="text-[11px] text-slate-600 font-mono tabular-nums">
              {item.completed}/{item.expected} enviados · {item.approved} aprob. · {item.inReview} rev. · {item.pending} pend.
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
