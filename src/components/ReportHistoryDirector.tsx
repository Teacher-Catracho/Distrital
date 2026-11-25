import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Calendar,
  ClipboardList,
  Download,
  History,
  MessageSquareWarning,
} from 'lucide-react';
import type {
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  ReportStatus,
  School,
} from '../types/sace';
import {
  MONTHS,
  computeParteMensualRow,
  getBasicaScope,
  getParteMensualGrades,
  getSchoolLevelLabel,
  totalNV,
} from '../utils/saceCalculations';
import { exportReportHistoryPdf } from '../utils/exportPdf';
import { StatusText } from './StatusText';

type HistoryReportKind = 'all' | 'parteMensual' | 'monthly';
type HistoryStatusFilter = 'all' | ReportStatus | 'missing';

interface ReportHistoryDirectorProps {
  year: number;
  school: School;
  directorName?: string;
  directorDni?: string;
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  onOpenReport: (target: {
    section: 'parteMensual' | 'monthly';
    month: number;
    level: EducationLevel;
  }) => void;
}

interface HistoryRowItem {
  key: string;
  month: number;
  monthLabel: string;
  kind: 'parteMensual' | 'monthly';
  kindLabel: string;
  level: EducationLevel;
  levelLabel: string;
  status: ReportStatus | 'missing';
  summaryText: string;
  reviewComment: string;
  updatedAtMs: number | null;
  updatedAtLabel: string;
}

function parseTimestampMs(ts: unknown): number | null {
  if (!ts) return null;
  if (typeof ts === 'object' && ts !== null) {
    if ('toDate' in ts && typeof (ts as { toDate: unknown }).toDate === 'function') {
      const d = (ts as { toDate: () => Date }).toDate();
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }
    if ('seconds' in ts && typeof (ts as { seconds: unknown }).seconds === 'number') {
      return (ts as { seconds: number }).seconds * 1000;
    }
  }
  return null;
}

function formatUpdatedDateTime(ms: number | null): string {
  if (ms === null) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-HN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReportHistoryDirector({
  year,
  school,
  directorName,
  directorDni,
  parteMensualReports,
  monthlyReports,
  onOpenReport,
}: ReportHistoryDirectorProps) {
  const availableLevels: EducationLevel[] =
    school.levels.length > 0 ? school.levels : ['basica'];

  const now = new Date();
  const currentCalendarYear = now.getFullYear();
  const currentCalendarMonth = now.getMonth() + 1;

  const [kindFilter, setKindFilter] = useState<HistoryReportKind>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | EducationLevel>('all');
  const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('all');
  const [includeCurrentMonth, setIncludeCurrentMonth] = useState(false);

  const visibleMonths = useMemo(() => {
    const maxMonth =
      year < currentCalendarYear
        ? 12
        : year > currentCalendarYear
        ? 0
        : includeCurrentMonth
        ? currentCalendarMonth
        : Math.max(0, currentCalendarMonth - 1);

    return MONTHS.filter((m) => m.value <= maxMonth).sort((a, b) => b.value - a.value);
  }, [year, currentCalendarYear, currentCalendarMonth, includeCurrentMonth]);

  const allHistoryRows = useMemo<HistoryRowItem[]>(() => {
    const basicaScope = getBasicaScope(school);
    const items: HistoryRowItem[] = [];

    for (const m of visibleMonths) {
      for (const lvl of availableLevels) {
        const levelLabel = getSchoolLevelLabel(lvl, school);

        // Parte Mensual
        const pm = parteMensualReports.find(
          (r) => r.year === year && r.month === m.value && r.level === lvl
        );
        let pmSummary = 'Sin registro guardado';
        if (pm) {
          const grades = getParteMensualGrades(lvl, lvl === 'basica' ? basicaScope : undefined);
          let matFinalTotal = 0;
          for (const g of grades) {
            const comp = computeParteMensualRow(pm.rows?.[g.key], pm.diasTrabajados || 0);
            matFinalTotal += totalNV(comp.matFinal);
          }
          const finalWord = lvl === 'prebasica' ? 'Mat. Actual' : 'Mat. Final';
          pmSummary = `${finalWord}: ${matFinalTotal} · ${pm.diasTrabajados || 0} días trab.`;
        }
        const pmUpdatedMs = parseTimestampMs(pm?.updatedAt);
        items.push({
          key: `pm_${year}_${m.value}_${lvl}`,
          month: m.value,
          monthLabel: m.label,
          kind: 'parteMensual',
          kindLabel: 'Parte Mensual',
          level: lvl,
          levelLabel,
          status: pm ? pm.status : 'missing',
          summaryText: pmSummary,
          reviewComment: pm?.reviewComment || '',
          updatedAtMs: pmUpdatedMs,
          updatedAtLabel: formatUpdatedDateTime(pmUpdatedMs),
        });

        // Movimientos-SACE
        const mr = monthlyReports.find(
          (r) => r.year === year && r.month === m.value && r.level === lvl
        );
        let mrSummary = 'Sin registro guardado';
        if (mr) {
          if (mr.noMovements) {
            mrSummary = 'Sin movimientos SACE';
          } else {
            const ing = mr.ingresos?.length || 0;
            const tras = mr.traslados?.length || 0;
            const des = mr.desertores?.length || 0;
            mrSummary = `${ing} ing. · ${tras} trasl. · ${des} des.`;
          }
        }
        const mrUpdatedMs = parseTimestampMs(mr?.updatedAt);
        items.push({
          key: `mr_${year}_${m.value}_${lvl}`,
          month: m.value,
          monthLabel: m.label,
          kind: 'monthly',
          kindLabel: 'Movimientos-SACE',
          level: lvl,
          levelLabel,
          status: mr ? mr.status : 'missing',
          summaryText: mrSummary,
          reviewComment: mr?.reviewComment || '',
          updatedAtMs: mrUpdatedMs,
          updatedAtLabel: formatUpdatedDateTime(mrUpdatedMs),
        });
      }
    }

    return items;
  }, [visibleMonths, availableLevels, school, parteMensualReports, monthlyReports, year]);

  const filteredRows = useMemo(() => {
    return allHistoryRows.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (levelFilter !== 'all' && item.level !== levelFilter) return false;
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      return true;
    });
  }, [allHistoryRows, kindFilter, levelFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = allHistoryRows.length;
    const approved = allHistoryRows.filter((r) => r.status === 'approved').length;
    const submitted = allHistoryRows.filter((r) => r.status === 'submitted').length;
    const returned = allHistoryRows.filter((r) => r.status === 'returned').length;
    const pendingOrDraft = allHistoryRows.filter(
      (r) => r.status === 'missing' || r.status === 'draft'
    ).length;
    return { total, approved, submitted, returned, pendingOrDraft };
  }, [allHistoryRows]);

  const handleExportPdf = () => {
    const kindLabel =
      kindFilter === 'all'
        ? 'Todos los tipos'
        : kindFilter === 'parteMensual'
        ? 'Parte Mensual'
        : 'Movimientos-SACE';
    const levelLabel =
      levelFilter === 'all' ? 'Todos los niveles' : getSchoolLevelLabel(levelFilter, school);
    const statusMap: Record<HistoryStatusFilter, string> = {
      all: 'Todos los estados',
      approved: 'Aprobado',
      submitted: 'Enviado a revisión',
      returned: 'Devuelto con observaciones',
      draft: 'Borrador',
      missing: 'Sin entrega',
    };

    const periodLabel =
      visibleMonths.length === 0
        ? `Año ${year}`
        : `${visibleMonths[visibleMonths.length - 1].label} – ${visibleMonths[0].label} ${year}`;

    exportReportHistoryPdf(
      filteredRows.map((r) => ({
        monthLabel: r.monthLabel,
        kindLabel: r.kindLabel,
        levelLabel: r.levelLabel,
        status: r.status,
        summaryText: r.summaryText,
        reviewComment: r.reviewComment,
        updatedAtLabel: r.updatedAtLabel,
      })),
      {
        year,
        schoolName: school.name,
        saceCode: school.saceCode,
        community: school.community,
        directorName: directorName || school.directorDisplayName,
        directorDni,
        periodLabel,
        filterSummary: `${kindLabel} · ${levelLabel} · ${statusMap[statusFilter]}`,
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & KPIs */}
      <div className="bg-white border border-slate-200 p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-blue-700 font-semibold">
            <History className="w-4 h-4 shrink-0" />
            <span>Trazabilidad Mensual · Año {year}</span>
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Historial de Reportes ({school.name})
          </h2>
          <p className="text-xs text-slate-600">
            Consulta el estado de envío y revisión distrital de los meses anteriores en Parte
            Mensual y Movimientos-SACE.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {year === currentCalendarYear && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeCurrentMonth}
                onChange={(e) => setIncludeCurrentMonth(e.target.checked)}
                className="h-3.5 w-3.5 accent-blue-700 cursor-pointer"
              />
              Incluir mes actual ({MONTHS.find((m) => m.value === currentCalendarMonth)?.label})
            </label>
          )}

          <button
            type="button"
            disabled={filteredRows.length === 0}
            onClick={handleExportPdf}
            title="Descargar respaldo en PDF para archivos personales"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5 text-red-700 shrink-0" />
            Exportar PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 space-y-1">
          <p className="text-xs text-slate-500">Reportes esperados en período</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 p-4 space-y-1">
          <p className="text-xs text-slate-500">Aprobados / En revisión</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.approved + stats.submitted}{' '}
            <span className="text-xs font-normal text-slate-500">
              ({stats.approved} aprob. · {stats.submitted} env.)
            </span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-4 space-y-1">
          <p className="text-xs text-slate-500">Devueltos con observaciones</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${
              stats.returned > 0 ? 'text-red-700' : 'text-slate-900'
            }`}
          >
            {stats.returned}
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-4 space-y-1">
          <p className="text-xs text-slate-500">Sin envío / Borrador</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${
              stats.pendingOrDraft > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {stats.pendingOrDraft}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1">
          {(
            [
              { key: 'all', label: 'Todos los reportes' },
              { key: 'parteMensual', label: 'Parte Mensual' },
              { key: 'monthly', label: 'Movimientos-SACE' },
            ] as { key: HistoryReportKind; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setKindFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap ${
                kindFilter === t.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          {availableLevels.length > 1 && (
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value as 'all' | EducationLevel)}
              className="px-2.5 py-1.5 border border-slate-300 bg-white"
            >
              <option value="all">Todos los niveles</option>
              {availableLevels.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {getSchoolLevelLabel(lvl, school)}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as HistoryStatusFilter)}
            className="px-2.5 py-1.5 border border-slate-300 bg-white"
          >
            <option value="all">Todos los estados</option>
            <option value="approved">Aprobado</option>
            <option value="submitted">Enviado a revisión</option>
            <option value="returned">Devuelto con observaciones</option>
            <option value="draft">Borrador</option>
            <option value="missing">Sin entrega</option>
          </select>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Mes</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Tipo de reporte</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Nivel</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Estado de envío</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">Resumen</th>
              <th className="px-4 py-2.5 text-left font-semibold text-slate-700">
                Última actualización
              </th>
              <th className="px-4 py-2.5 text-right font-semibold text-slate-700">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleMonths.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay meses anteriores disponibles para el año {year}.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay reportes en el historial que coincidan con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredRows.map((item) => (
                <tr key={item.key} className="hover:bg-slate-50/80">
                  <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                    {item.monthLabel} {year}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 text-slate-800 font-medium">
                      {item.kind === 'parteMensual' ? (
                        <ClipboardList className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      ) : (
                        <Calendar className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      )}
                      {item.kindLabel}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                    {item.levelLabel}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {item.status === 'missing' ? (
                      <span className="text-red-700 font-medium">Sin entrega</span>
                    ) : (
                      <StatusText status={item.status} />
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 max-w-xs">
                    <p className="font-mono text-[11px] tabular-nums">{item.summaryText}</p>
                    {item.reviewComment && (
                      <p className="mt-1 inline-flex items-start gap-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5">
                        <MessageSquareWarning className="w-3 h-3 text-amber-700 shrink-0 mt-0.5" />
                        <span>{item.reviewComment}</span>
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {item.updatedAtLabel}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenReport({
                          section: item.kind,
                          month: item.month,
                          level: item.level,
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 cursor-pointer"
                    >
                      {item.status === 'missing'
                        ? 'Registrar'
                        : item.status === 'returned' || item.status === 'draft'
                        ? 'Continuar'
                        : 'Ver reporte'}
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
