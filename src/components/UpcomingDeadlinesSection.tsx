import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
} from 'lucide-react';
import type {
  DistrictDeadlines,
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  School,
} from '../types/sace';
import {
  MONTHS,
  formatDateTimeEs,
  getDaysCountdownInfo,
  getDefaultMonthDeadlineStr,
  getSchoolLevelLabel,
  type DaysCountdownInfo,
} from '../utils/saceCalculations';

interface UpcomingDeadlinesSectionProps {
  year: number;
  school: School;
  deadlines: DistrictDeadlines | null;
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  onNavigate: (target: {
    section: 'parteMensual' | 'monthly';
    month: number;
    level: EducationLevel;
  }) => void;
}

interface UpcomingDeadlineRow {
  id: string;
  section: 'parteMensual' | 'monthly';
  kindLabel: string;
  month: number;
  monthLabel: string;
  deadlineStr: string;
  deadlineLabel: string;
  countdown: DaysCountdownInfo;
  allCompleted: boolean;
  completedCount: number;
  totalLevels: number;
  pendingLevels: EducationLevel[];
  targetLevel: EducationLevel;
}

export function UpcomingDeadlinesSection({
  year,
  school,
  deadlines,
  parteMensualReports,
  monthlyReports,
  onNavigate,
}: UpcomingDeadlinesSectionProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const availableLevels: EducationLevel[] = useMemo(
    () => (school.levels.length > 0 ? school.levels : ['basica']),
    [school.levels]
  );

  const items = useMemo<UpcomingDeadlineRow[]>(() => {
    const currentMonth = new Date(nowMs).getMonth() + 1;
    const rows: UpcomingDeadlineRow[] = [];
    const seen = new Set<string>();

    const addEntry = (
      section: 'parteMensual' | 'monthly',
      month: number,
      deadlineStr: string
    ) => {
      const key = `${section}_${month}`;
      if (seen.has(key) || !deadlineStr) return;

      const countdown = getDaysCountdownInfo(deadlineStr, nowMs);
      if (!countdown) return;

      seen.add(key);

      const reports = section === 'parteMensual' ? parteMensualReports : monthlyReports;
      const pendingLevels = availableLevels.filter((lvl) => {
        const rep = reports.find(
          (r) => r.year === year && r.month === month && r.level === lvl
        );
        return !rep || (rep.status !== 'submitted' && rep.status !== 'approved');
      });

      const completedCount = availableLevels.length - pendingLevels.length;
      const allCompleted = pendingLevels.length === 0;

      // Omit past deadlines that are already delivered across all levels
      if (countdown.isOverdue && allCompleted) return;

      const monthLabel = MONTHS.find((m) => m.value === month)?.label || `Mes ${month}`;

      rows.push({
        id: key,
        section,
        kindLabel: section === 'parteMensual' ? 'Parte Mensual' : 'Movimientos-SACE',
        month,
        monthLabel,
        deadlineStr,
        deadlineLabel: formatDateTimeEs(deadlineStr),
        countdown,
        allCompleted,
        completedCount,
        totalLevels: availableLevels.length,
        pendingLevels,
        targetLevel: pendingLevels[0] ?? availableLevels[0],
      });
    };

    const pmMonth = deadlines?.parteMensualMonth ?? currentMonth;
    const pmDeadline =
      deadlines?.parteMensualDeadline ?? getDefaultMonthDeadlineStr(year, pmMonth);
    addEntry('parteMensual', pmMonth, pmDeadline);

    if (deadlines?.parteMensualByMonth) {
      for (const [mKey, dStr] of Object.entries(deadlines.parteMensualByMonth)) {
        const mNum = Number(mKey);
        if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 && dStr) {
          addEntry('parteMensual', mNum, dStr);
        }
      }
    }

    const movMonth = deadlines?.movimientosMonth ?? currentMonth;
    const movDeadline =
      deadlines?.movimientosDeadline ?? getDefaultMonthDeadlineStr(year, movMonth);
    addEntry('monthly', movMonth, movDeadline);

    if (deadlines?.movimientosByMonth) {
      for (const [mKey, dStr] of Object.entries(deadlines.movimientosByMonth)) {
        const mNum = Number(mKey);
        if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 && dStr) {
          addEntry('monthly', mNum, dStr);
        }
      }
    }

    return rows.sort((a, b) => {
      if (a.allCompleted !== b.allCompleted) {
        return a.allCompleted ? 1 : -1;
      }
      if (a.countdown.targetMs !== b.countdown.targetMs) {
        return a.countdown.targetMs - b.countdown.targetMs;
      }
      return a.section.localeCompare(b.section);
    });
  }, [nowMs, deadlines, year, availableLevels, parteMensualReports, monthlyReports]);

  const pendingCount = items.filter((i) => !i.allCompleted).length;
  const visibleItems = showAll ? items : items.slice(0, 6);

  return (
    <section className="bg-white border border-slate-200">
      <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-700 shrink-0" />
            <span>Próximos Vencimientos — Reportes Mensuales ({year})</span>
          </h2>
          <p className="text-[11px] text-slate-500">
            Conteo regresivo de días según las fechas límite configuradas por el administrador del
            distrito.
          </p>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          {items.length > 0 && (
            <span
              className={`px-2.5 py-1 border font-medium tabular-nums ${
                pendingCount > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {pendingCount > 0
                ? `${pendingCount} ${pendingCount === 1 ? 'pendiente' : 'pendientes'}`
                : 'Al día'}
            </span>
          )}
          {items.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="text-xs font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
            >
              {showAll ? 'Ver menos' : `Ver todos (${items.length})`}
            </button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="px-5 py-5 text-xs text-slate-600">
          No hay fechas límite de reportes mensuales programadas por el administrador para {year}.
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {visibleItems.map((item) => {
            const { countdown } = item;
            const isCritical =
              !item.allCompleted &&
              (countdown.isOverdue || countdown.isToday || countdown.calendarDays <= 2);
            const isSoon =
              !item.allCompleted && !isCritical && countdown.calendarDays <= 7;

            const badgeClass = item.allCompleted
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : countdown.isOverdue || countdown.isToday
              ? 'bg-red-50 border-red-200 text-red-800'
              : isCritical || isSoon
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-slate-50 border-slate-200 text-slate-800';

            return (
              <div
                key={item.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`mt-0.5 p-2 border shrink-0 ${
                      item.section === 'parteMensual'
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    }`}
                  >
                    {item.section === 'parteMensual' ? (
                      <ClipboardList className="w-4 h-4" />
                    ) : (
                      <Calendar className="w-4 h-4" />
                    )}
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-semibold text-slate-900">
                        {item.kindLabel} · {item.monthLabel} {year}
                      </p>
                      {item.allCompleted && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          Entregado ({item.completedCount}/{item.totalLevels})
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-600">
                      Fecha límite:{' '}
                      <span className="font-mono font-medium text-slate-800">
                        {item.deadlineLabel}
                      </span>
                    </p>

                    {!item.allCompleted && (
                      <p className="text-[11px] text-slate-500">
                        Pendiente en:{' '}
                        {item.pendingLevels
                          .map((lvl) => getSchoolLevelLabel(lvl, school))
                          .join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <div
                    className={`min-w-[126px] px-3 py-1.5 border flex items-center justify-between gap-2 ${badgeClass}`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <div className="text-right leading-tight">
                      <p className="font-mono text-sm font-bold tabular-nums">
                        {countdown.headline}
                      </p>
                      <p className="text-[10px] font-medium opacity-90 whitespace-nowrap">
                        {countdown.sublabel}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onNavigate({
                        section: item.section,
                        month: item.month,
                        level: item.targetLevel,
                      })
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer whitespace-nowrap ${
                      item.allCompleted
                        ? 'border border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                        : countdown.isOverdue || countdown.isToday
                        ? 'bg-red-700 hover:bg-red-800 text-white'
                        : 'bg-blue-700 hover:bg-blue-800 text-white'
                    }`}
                  >
                    <span>{item.allCompleted ? 'Ver reporte' : 'Enviar a la distrital'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
