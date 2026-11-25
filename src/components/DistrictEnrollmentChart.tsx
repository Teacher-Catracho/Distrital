import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, TrendingUp } from 'lucide-react';
import type { EducationLevel, ParteMensualReport } from '../types/sace';
import {
  MONTHS,
  aggregateParteMensualReports,
  computeBasicaCycleEnrollmentFromParteMensual,
  totalNV,
} from '../utils/saceCalculations';

interface DistrictEnrollmentChartProps {
  year: number;
  parteMensualReports: ParteMensualReport[];
}

type ChartType = 'line' | 'bar';
type ScopeMode = 'submitted_and_approved' | 'all';
type ViewMode = 'levels' | 'cycles';

interface MonthlyChartPoint {
  month: number;
  shortLabel: string;
  fullLabel: string;
  prebasica: number;
  basica: number;
  basicaC12: number;
  basicaC3: number;
  media: number;
  total: number;
  reportCount: number;
}

const COLORS = {
  prebasica: '#d97706',
  basica: '#1d4ed8',
  basicaC12: '#2563eb',
  basicaC3: '#7c3aed',
  media: '#0f766e',
};

function EnrollmentTooltip({
  active,
  payload,
  viewMode,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthlyChartPoint }>;
  viewMode: ViewMode;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 shadow-sm px-3.5 py-2.5 text-xs space-y-2 min-w-[220px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{pt.fullLabel}</span>
        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
          {pt.reportCount} {pt.reportCount === 1 ? 'reporte' : 'reportes'}
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span
              className="w-2.5 h-2.5 inline-block shrink-0"
              style={{ backgroundColor: COLORS.prebasica }}
            />
            Prebásica
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {pt.prebasica.toLocaleString('es-HN')}
          </span>
        </div>

        {viewMode === 'levels' ? (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-700">
              <span
                className="w-2.5 h-2.5 inline-block shrink-0"
                style={{ backgroundColor: COLORS.basica }}
              />
              Básica (1°-9°)
            </span>
            <span className="font-mono font-semibold tabular-nums text-slate-900">
              {pt.basica.toLocaleString('es-HN')}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span
                  className="w-2.5 h-2.5 inline-block shrink-0"
                  style={{ backgroundColor: COLORS.basicaC12 }}
                />
                Básica I y II Ciclo (1°-6°)
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {pt.basicaC12.toLocaleString('es-HN')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-slate-700">
                <span
                  className="w-2.5 h-2.5 inline-block shrink-0"
                  style={{ backgroundColor: COLORS.basicaC3 }}
                />
                Básica III Ciclo (7°-9°)
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900">
                {pt.basicaC3.toLocaleString('es-HN')}
              </span>
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span
              className="w-2.5 h-2.5 inline-block shrink-0"
              style={{ backgroundColor: COLORS.media }}
            />
            Media
          </span>
          <span className="font-mono font-semibold tabular-nums text-slate-900">
            {pt.media.toLocaleString('es-HN')}
          </span>
        </div>
      </div>
      <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-4">
        <span className="font-semibold text-slate-900">Total Distrital</span>
        <span className="font-mono font-bold tabular-nums text-slate-900">
          {pt.total.toLocaleString('es-HN')}
        </span>
      </div>
    </div>
  );
}

export function DistrictEnrollmentChart({
  year,
  parteMensualReports,
}: DistrictEnrollmentChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [scope, setScope] = useState<ScopeMode>('submitted_and_approved');
  const [viewMode, setViewMode] = useState<ViewMode>('levels');

  const yearReports = useMemo(
    () => parteMensualReports.filter((r) => r.year === year),
    [parteMensualReports, year]
  );

  const scopedReports = useMemo(() => {
    if (scope === 'all') return yearReports;
    return yearReports.filter((r) => r.status === 'submitted' || r.status === 'approved');
  }, [yearReports, scope]);

  const chartData: MonthlyChartPoint[] = useMemo(() => {
    return MONTHS.map((m) => {
      const monthSubset = scopedReports.filter((r) => r.month === m.value);

      const sumForLevel = (lvl: Exclude<EducationLevel, 'basica'>): number => {
        const lvlReports = monthSubset.filter((r) => r.level === lvl);
        if (lvlReports.length === 0) return 0;
        const agg = aggregateParteMensualReports(lvlReports, lvl);
        return Math.max(0, totalNV(agg.total.matFinal));
      };

      const prebasica = sumForLevel('prebasica');
      const basicaReports = monthSubset.filter((r) => r.level === 'basica');
      const basicaCycles = computeBasicaCycleEnrollmentFromParteMensual(basicaReports);
      const media = sumForLevel('media');

      return {
        month: m.value,
        shortLabel: m.label.slice(0, 3),
        fullLabel: `${m.label} ${year}`,
        prebasica,
        basica: basicaCycles.total,
        basicaC12: basicaCycles.c12,
        basicaC3: basicaCycles.c3,
        media,
        total: prebasica + basicaCycles.total + media,
        reportCount: monthSubset.length,
      };
    });
  }, [scopedReports, year]);

  const latestActivePoint = useMemo(() => {
    const withData = chartData.filter((d) => d.reportCount > 0);
    return withData.length > 0 ? withData[withData.length - 1] : null;
  }, [chartData]);

  const hasDraftsOnly = scopedReports.length === 0 && yearReports.length > 0;

  return (
    <section className="bg-white border border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-bold text-slate-900">
            Evolución Mensual de Matrícula del Distrito ({year})
          </h2>
          <p className="text-xs text-slate-500">
            {viewMode === 'levels'
              ? 'Comparativo mensual de Matrícula Final / Actual por nivel educativo (Prebásica, Básica y Media)'
              : 'Comparativo mensual desglosado con subniveles de Básica: I y II Ciclo (1°-6°) y III Ciclo (7°-9°)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setViewMode('levels')}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                viewMode === 'levels'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por nivel
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cycles')}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                viewMode === 'cycles'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Con ciclos de Básica
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setScope('submitted_and_approved')}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                scope === 'submitted_and_approved'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Enviados y aprobados
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                scope === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Incl. borradores
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setChartType('line')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                chartType === 'line'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Líneas
            </button>
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                chartType === 'bar'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Barras
            </button>
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="p-5">
        {scopedReports.length === 0 ? (
          <div className="h-[260px] flex flex-col items-center justify-center text-center px-4 bg-slate-50/70 border border-dashed border-slate-200 space-y-3">
            <div className="space-y-1 max-w-md">
              <p className="text-xs font-semibold text-slate-800">
                {hasDraftsOnly
                  ? `No hay Partes Mensuales enviados o aprobados en ${year}`
                  : `Sin registros de Parte Mensual en ${year}`}
              </p>
              <p className="text-xs text-slate-500">
                {hasDraftsOnly
                  ? `Existen ${yearReports.length} reportes en borrador. Puedes incluir borradores para previsualizar la evolución de matrícula.`
                  : 'La gráfica comparativa se actualizará automáticamente conforme los directores registren su Parte Mensual cada mes.'}
              </p>
            </div>
            {hasDraftsOnly && (
              <button
                type="button"
                onClick={() => setScope('all')}
                className="px-3.5 py-1.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
              >
                Incluir borradores en la gráfica
              </button>
            )}
          </div>
        ) : (
          <div className="w-full h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={48}
                  />
                  <Tooltip content={<EnrollmentTooltip viewMode={viewMode} />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                    iconType="square"
                  />
                  <Line
                    type="monotone"
                    dataKey="prebasica"
                    name="Prebásica"
                    stroke={COLORS.prebasica}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, strokeWidth: 1.5, fill: '#ffffff' }}
                    activeDot={{ r: 5 }}
                  />
                  {viewMode === 'levels' ? (
                    <Line
                      type="monotone"
                      dataKey="basica"
                      name="Básica"
                      stroke={COLORS.basica}
                      strokeWidth={2.5}
                      dot={{ r: 3.5, strokeWidth: 1.5, fill: '#ffffff' }}
                      activeDot={{ r: 5 }}
                    />
                  ) : (
                    <>
                      <Line
                        type="monotone"
                        dataKey="basicaC12"
                        name="Básica I y II Ciclo (1°-6°)"
                        stroke={COLORS.basicaC12}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, strokeWidth: 1.5, fill: '#ffffff' }}
                        activeDot={{ r: 5 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="basicaC3"
                        name="Básica III Ciclo (7°-9°)"
                        stroke={COLORS.basicaC3}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, strokeWidth: 1.5, fill: '#ffffff' }}
                        activeDot={{ r: 5 }}
                      />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="media"
                    name="Media"
                    stroke={COLORS.media}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, strokeWidth: 1.5, fill: '#ffffff' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={48}
                  />
                  <Tooltip content={<EnrollmentTooltip viewMode={viewMode} />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
                    iconType="square"
                  />
                  <Bar
                    dataKey="prebasica"
                    name="Prebásica"
                    fill={COLORS.prebasica}
                    radius={[2, 2, 0, 0]}
                  />
                  {viewMode === 'levels' ? (
                    <Bar
                      dataKey="basica"
                      name="Básica"
                      fill={COLORS.basica}
                      radius={[2, 2, 0, 0]}
                    />
                  ) : (
                    <>
                      <Bar
                        dataKey="basicaC12"
                        name="Básica I y II Ciclo (1°-6°)"
                        fill={COLORS.basicaC12}
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="basicaC3"
                        name="Básica III Ciclo (7°-9°)"
                        fill={COLORS.basicaC3}
                        radius={[2, 2, 0, 0]}
                      />
                    </>
                  )}
                  <Bar
                    dataKey="media"
                    name="Media"
                    fill={COLORS.media}
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Latest reported month summary strip */}
      {latestActivePoint && (
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/70 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div>
            <p className="text-slate-500">Último mes con datos</p>
            <p className="font-semibold text-slate-900 mt-0.5">{latestActivePoint.fullLabel}</p>
          </div>
          <div>
            <p className="text-slate-500">Prebásica</p>
            <p className="font-mono font-bold text-amber-700 tabular-nums mt-0.5">
              {latestActivePoint.prebasica.toLocaleString('es-HN')}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Básica (I-II / III)</p>
            <p className="font-mono font-bold text-blue-700 tabular-nums mt-0.5">
              {latestActivePoint.basica.toLocaleString('es-HN')}
              <span className="text-[11px] font-normal text-slate-500 ml-1.5">
                ({latestActivePoint.basicaC12.toLocaleString('es-HN')} /{' '}
                {latestActivePoint.basicaC3.toLocaleString('es-HN')})
              </span>
            </p>
          </div>
          <div>
            <p className="text-slate-500">Media / Total Distrital</p>
            <p className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
              <span className="text-teal-700">
                {latestActivePoint.media.toLocaleString('es-HN')}
              </span>
              <span className="text-slate-400 font-normal mx-1.5">/</span>
              <span>{latestActivePoint.total.toLocaleString('es-HN')}</span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
