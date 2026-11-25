import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock, Search } from 'lucide-react';
import type {
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  ReportStatus,
  School,
} from '../types/sace';
import { MONTHS, getSchoolLevelLabel } from '../utils/saceCalculations';
import { StatusText } from './StatusText';

interface MonthlyComplianceWidgetProps {
  year: number;
  schools: School[];
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  onInspectParteMensual?: (report: ParteMensualReport) => void;
  onInspectMonthly?: (report: MonthlyReport) => void;
}

type FilterMode = 'pending' | 'all' | 'completed';
type ComplianceKind = 'parteMensual' | 'monthly';

export function MonthlyComplianceWidget({
  year,
  schools,
  parteMensualReports,
  monthlyReports,
  onInspectParteMensual,
  onInspectMonthly,
}: MonthlyComplianceWidgetProps) {
  const currentMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [kind, setKind] = useState<ComplianceKind>('parteMensual');
  const [filterMode, setFilterMode] = useState<FilterMode>('pending');
  const [search, setSearch] = useState('');

  const activeSchools = useMemo(() => schools.filter((s) => s.active !== false), [schools]);
  const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label || String(selectedMonth);

  const schoolMetrics = useMemo(() => {
    const sourceList: {
      id: string;
      year: number;
      month: number;
      schoolId: string;
      level: EducationLevel;
      status: ReportStatus;
      raw: ParteMensualReport | MonthlyReport;
    }[] =
      kind === 'parteMensual'
        ? parteMensualReports
            .filter((r) => r.year === year && r.month === selectedMonth)
            .map((r) => ({
              id: r.id,
              year: r.year,
              month: r.month,
              schoolId: r.schoolId,
              level: r.level,
              status: r.status,
              raw: r,
            }))
        : monthlyReports
            .filter((r) => r.year === year && r.month === selectedMonth)
            .map((r) => ({
              id: r.id,
              year: r.year,
              month: r.month,
              schoolId: r.schoolId,
              level: r.level,
              status: r.status,
              raw: r,
            }));

    const rows = activeSchools.map((school) => {
      const levels: EducationLevel[] =
        school.levels.length > 0 ? school.levels : (['basica'] as EducationLevel[]);

      const levelDetails = levels.map((lvl) => {
        const rep = sourceList.find((r) => r.schoolId === school.id && r.level === lvl) || null;
        const done = rep?.status === 'submitted' || rep?.status === 'approved';
        const approved = rep?.status === 'approved';
        return { level: lvl, report: rep, done, approved };
      });

      const doneCount = levelDetails.filter((d) => d.done).length;
      const approvedCount = levelDetails.filter((d) => d.approved).length;
      const isComplete = doneCount === levels.length;
      const isFullyApproved = approvedCount === levels.length;

      return {
        school,
        levels,
        levelDetails,
        doneCount,
        approvedCount,
        isComplete,
        isFullyApproved,
      };
    });

    const total = rows.length;
    const completed = rows.filter((r) => r.isComplete).length;
    const approved = rows.filter((r) => r.isFullyApproved).length;
    const inReview = rows.filter((r) => r.isComplete && !r.isFullyApproved).length;
    const pending = rows.filter((r) => !r.isComplete).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const approvedPct = total > 0 ? Math.round((approved / total) * 100) : 0;

    return { rows, total, completed, approved, inReview, pending, percentage, approvedPct };
  }, [activeSchools, parteMensualReports, monthlyReports, kind, year, selectedMonth]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schoolMetrics.rows.filter((item) => {
      if (filterMode === 'pending' && item.isComplete) return false;
      if (filterMode === 'completed' && !item.isComplete) return false;
      if (q) {
        return (
          item.school.name.toLowerCase().includes(q) ||
          item.school.saceCode.toLowerCase().includes(q) ||
          item.school.community.toLowerCase().includes(q) ||
          (item.school.directorDisplayName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [schoolMetrics.rows, filterMode, search]);

  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (schoolMetrics.percentage / 100) * circumference;

  return (
    <section className="bg-white border border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-bold text-slate-900">
            Cumplimiento de Reporte Mensual (
            {kind === 'parteMensual' ? 'Parte Mensual' : 'Movimientos-SACE'})
          </h2>
          <p className="text-xs text-slate-500">
            Seguimiento de entregas por centro educativo · {monthLabel} {year}
            {selectedMonth === currentMonth ? ' · Mes actual' : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setKind('parteMensual')}
              className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                kind === 'parteMensual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Parte Mensual
            </button>
            <button
              type="button"
              onClick={() => setKind('monthly')}
              className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                kind === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Movimientos-SACE
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="compliance-month" className="text-xs text-slate-600">
              Mes:
            </label>
            <select
              id="compliance-month"
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
        </div>
      </div>

      {/* Progress Summary Strip */}
      <div className="p-5 border-b border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-5 flex items-center gap-5">
          <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 84 84" aria-hidden="true">
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke="#e2e8f0"
                strokeWidth="8"
              />
              <circle
                cx="42"
                cy="42"
                r={radius}
                fill="none"
                stroke={
                  schoolMetrics.percentage === 100
                    ? '#16a34a'
                    : schoolMetrics.percentage >= 50
                    ? '#1d4ed8'
                    : '#d97706'
                }
                strokeWidth="8"
                strokeLinecap="butt"
                strokeDasharray={circumference}
                strokeDashoffset={strokeOffset}
                className="transition-all duration-300"
              />
            </svg>
            <span className="absolute font-mono text-base font-bold text-slate-900 tabular-nums">
              {schoolMetrics.percentage}%
            </span>
          </div>

          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">
              <span className="font-mono tabular-nums">{schoolMetrics.completed}</span> de{' '}
              <span className="font-mono tabular-nums">{schoolMetrics.total}</span> centros han completado el mes
            </p>
            <div className="w-full h-2.5 bg-slate-100 overflow-hidden flex">
              <div
                className="h-full bg-emerald-600 transition-all duration-300"
                style={{ width: `${schoolMetrics.approvedPct}%` }}
                title={`Aprobados: ${schoolMetrics.approved}`}
              />
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{
                  width: `${Math.max(0, schoolMetrics.percentage - schoolMetrics.approvedPct)}%`,
                }}
                title={`En revisión: ${schoolMetrics.inReview}`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                Aprobados: <strong className="font-mono tabular-nums">{schoolMetrics.approved}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-700" />
                En revisión: <strong className="font-mono tabular-nums">{schoolMetrics.inReview}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-amber-700" />
                Pendientes: <strong className="font-mono tabular-nums">{schoolMetrics.pending}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="lg:col-span-7 flex flex-wrap items-center justify-between lg:justify-end gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                filterMode === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendientes ({schoolMetrics.pending})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('completed')}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                filterMode === 'completed'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Completados ({schoolMetrics.completed})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todos ({schoolMetrics.total})
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar centro, SACE o director..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 bg-white w-56 focus:outline-none focus:border-blue-700"
            />
          </div>
        </div>
      </div>

      {/* Schools List */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Código SACE</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Centro Educativo</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Director(a)</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">
                Estado por nivel ({monthLabel})
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-slate-700">Avance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {activeSchools.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Aún no hay centros educativos activos en el catálogo del distrito.
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {filterMode === 'pending' && !search.trim()
                    ? `Todos los centros educativos han completado el reporte de ${monthLabel} ${year}.`
                    : 'No hay centros que coincidan con el filtro seleccionado.'}
                </td>
              </tr>
            ) : (
              visibleRows.map(({ school, levelDetails, doneCount, levels }) => (
                <tr key={school.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                    {school.saceCode}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-slate-900">{school.name}</p>
                    <p className="text-[11px] text-slate-500">{school.community}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {school.directorDisplayName || (
                      <span className="text-amber-700 font-medium">Sin director asignado</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {levelDetails.map(({ level, report }) => (
                        <div key={level} className="inline-flex items-center gap-1.5">
                          <span className="font-medium text-slate-700">
                            {getSchoolLevelLabel(level, school)}:
                          </span>
                          {report ? (
                            kind === 'parteMensual' && onInspectParteMensual ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onInspectParteMensual(report.raw as ParteMensualReport)
                                }
                                className="hover:underline cursor-pointer"
                              >
                                <StatusText status={report.status} />
                              </button>
                            ) : kind === 'monthly' && onInspectMonthly ? (
                              <button
                                type="button"
                                onClick={() => onInspectMonthly(report.raw as MonthlyReport)}
                                className="hover:underline cursor-pointer"
                              >
                                <StatusText status={report.status} />
                              </button>
                            ) : (
                              <StatusText status={report.status} />
                            )
                          ) : (
                            <span className="text-red-700 font-medium">Sin entrega</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                    <span
                      className={
                        doneCount === levels.length
                          ? 'text-emerald-700 font-semibold'
                          : doneCount > 0
                          ? 'text-amber-700 font-semibold'
                          : 'text-red-700 font-semibold'
                      }
                    >
                      {doneCount}/{levels.length}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
