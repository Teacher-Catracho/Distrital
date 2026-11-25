import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, BellRing, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type {
  ActivityCompliance,
  AnnualReport,
  DistrictActivity,
  DistrictDeadlines,
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  School,
} from '../types/sace';
import {
  MONTHS,
  evaluate48HourWindow,
  formatDateTimeEs,
  getDefaultMonthDeadlineStr,
  getParcialLabel,
  getSchoolLevelLabel,
} from '../utils/saceCalculations';

export interface DeadlineNavigationTarget {
  section: 'parteMensual' | 'monthly' | 'annual' | 'activities';
  month?: number;
  level?: EducationLevel;
}

interface StatisticalDeadlineAlertProps {
  year: number;
  school: School;
  deadlines: DistrictDeadlines | null;
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  annualReports: AnnualReport[];
  activities: DistrictActivity[];
  compliances: ActivityCompliance[];
  onNavigate: (target: DeadlineNavigationTarget) => void;
}

interface UrgentDeadlineItem {
  id: string;
  title: string;
  detail: string;
  deadlineLabel: string;
  remainingLabel: string;
  hoursRemaining: number;
  actionLabel: string;
  target: DeadlineNavigationTarget;
}

export function StatisticalDeadlineAlert({
  year,
  school,
  deadlines,
  parteMensualReports,
  monthlyReports,
  annualReports,
  activities,
  compliances,
  onNavigate,
}: StatisticalDeadlineAlertProps) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [collapsed, setCollapsed] = useState(false);

  // Refresh live countdown every 60 seconds
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

  const urgentItems = useMemo<UrgentDeadlineItem[]>(() => {
    const items: UrgentDeadlineItem[] = [];
    const currentMonth = new Date(nowMs).getMonth() + 1;

    const addedItemIds = new Set<string>();

    const checkParteMonth = (targetMonth: number, targetDeadline: string) => {
      const id = `parte_${year}_${targetMonth}`;
      if (addedItemIds.has(id) || !targetDeadline) return;
      const pmWindow = evaluate48HourWindow(targetDeadline, nowMs);
      if (!pmWindow?.isWithin48Hours) return;

      const missingLevels = availableLevels.filter((lvl) => {
        const rep = parteMensualReports.find(
          (r) => r.year === year && r.month === targetMonth && r.level === lvl
        );
        return !rep || (rep.status !== 'submitted' && rep.status !== 'approved');
      });
      if (missingLevels.length > 0) {
        const monthName = MONTHS.find((m) => m.value === targetMonth)?.label || `Mes ${targetMonth}`;
        addedItemIds.add(id);
        items.push({
          id,
          title: `Parte Mensual · ${monthName} ${year}`,
          detail: `Pendiente en: ${missingLevels
            .map((l) => getSchoolLevelLabel(l, school))
            .join(', ')}`,
          deadlineLabel: formatDateTimeEs(targetDeadline),
          remainingLabel: pmWindow.formattedRemaining,
          hoursRemaining: pmWindow.hoursRemaining,
          actionLabel: 'Completar Parte Mensual',
          target: { section: 'parteMensual', month: targetMonth, level: missingLevels[0] },
        });
      }
    };

    const pmMonth = deadlines?.parteMensualMonth ?? currentMonth;
    const pmDeadline =
      deadlines?.parteMensualDeadline ?? getDefaultMonthDeadlineStr(year, pmMonth);
    checkParteMonth(pmMonth, pmDeadline);
    if (deadlines?.parteMensualByMonth) {
      for (const [mKey, dStr] of Object.entries(deadlines.parteMensualByMonth)) {
        const mNum = Number(mKey);
        if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 && dStr) {
          checkParteMonth(mNum, dStr);
        }
      }
    }

    const checkMovimientosMonth = (targetMonth: number, targetDeadline: string) => {
      const id = `mov_${year}_${targetMonth}`;
      if (addedItemIds.has(id) || !targetDeadline) return;
      const movWindow = evaluate48HourWindow(targetDeadline, nowMs);
      if (!movWindow?.isWithin48Hours) return;

      const missingLevels = availableLevels.filter((lvl) => {
        const rep = monthlyReports.find(
          (r) => r.year === year && r.month === targetMonth && r.level === lvl
        );
        return !rep || (rep.status !== 'submitted' && rep.status !== 'approved');
      });
      if (missingLevels.length > 0) {
        const monthName = MONTHS.find((m) => m.value === targetMonth)?.label || `Mes ${targetMonth}`;
        addedItemIds.add(id);
        items.push({
          id,
          title: `Movimientos-SACE · ${monthName} ${year}`,
          detail: `Pendiente en: ${missingLevels
            .map((l) => getSchoolLevelLabel(l, school))
            .join(', ')}`,
          deadlineLabel: formatDateTimeEs(targetDeadline),
          remainingLabel: movWindow.formattedRemaining,
          hoursRemaining: movWindow.hoursRemaining,
          actionLabel: 'Completar Movimientos',
          target: { section: 'monthly', month: targetMonth, level: missingLevels[0] },
        });
      }
    };

    const movMonth = deadlines?.movimientosMonth ?? currentMonth;
    const movDeadline =
      deadlines?.movimientosDeadline ?? getDefaultMonthDeadlineStr(year, movMonth);
    checkMovimientosMonth(movMonth, movDeadline);
    if (deadlines?.movimientosByMonth) {
      for (const [mKey, dStr] of Object.entries(deadlines.movimientosByMonth)) {
        const mNum = Number(mKey);
        if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 && dStr) {
          checkMovimientosMonth(mNum, dStr);
        }
      }
    }

    const annDeadline = deadlines?.annualDeadline ?? `${year}-11-30T23:59`;
    const annWindow = evaluate48HourWindow(annDeadline, nowMs);
    if (annWindow?.isWithin48Hours) {
      const missingLevels = availableLevels.filter((lvl) => {
        const rep = annualReports.find((r) => r.year === year && r.level === lvl);
        return !rep || (rep.status !== 'submitted' && rep.status !== 'approved');
      });
      if (missingLevels.length > 0) {
        items.push({
          id: `annual_${year}`,
          title: `Cuadros Estadísticos Anuales ${year}`,
          detail: `Pendiente en: ${missingLevels
            .map((l) => getSchoolLevelLabel(l, school))
            .join(', ')}`,
          deadlineLabel: formatDateTimeEs(annDeadline),
          remainingLabel: annWindow.formattedRemaining,
          hoursRemaining: annWindow.hoursRemaining,
          actionLabel: 'Completar Cuadro Anual',
          target: { section: 'annual', level: missingLevels[0] },
        });
      }
    }

    const completedSet = new Set(
      compliances
        .filter((c) => c.schoolId === school.id && c.completed)
        .map((c) => c.activityId)
    );
    for (const act of activities) {
      if (act.year !== year || act.active === false) continue;
      if (!act.targetSchoolIds.includes(school.id) || completedSet.has(act.id)) continue;
      const actWindow = evaluate48HourWindow(act.dueDate, nowMs);
      if (actWindow?.isWithin48Hours) {
        items.push({
          id: `act_${act.id}`,
          title: act.title,
          detail: `${getParcialLabel(act.parcial)} · Evidencia pendiente de validación`,
          deadlineLabel: formatDateTimeEs(`${act.dueDate}T23:59`),
          remainingLabel: actWindow.formattedRemaining,
          hoursRemaining: actWindow.hoursRemaining,
          actionLabel: 'Ver actividad',
          target: { section: 'activities' },
        });
      }
    }

    return items.sort((a, b) => a.hoursRemaining - b.hoursRemaining);
  }, [
    nowMs,
    deadlines,
    year,
    availableLevels,
    parteMensualReports,
    monthlyReports,
    annualReports,
    activities,
    compliances,
    school,
  ]);

  if (urgentItems.length === 0) {
    return null;
  }

  const mostUrgentHours = urgentItems[0].hoursRemaining;
  const isCritical = mostUrgentHours < 24;

  return (
    <section
      role="alert"
      aria-live="polite"
      className={`border ${
        isCritical
          ? 'bg-red-50/75 border-red-300'
          : 'bg-amber-50/80 border-amber-300'
      }`}
    >
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`p-2 border shrink-0 ${
              isCritical
                ? 'bg-red-100 border-red-200 text-red-700'
                : 'bg-amber-100 border-amber-200 text-amber-800'
            }`}
          >
            {isCritical ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <BellRing className="w-4 h-4" />
            )}
          </div>
          <div className="space-y-0.5 min-w-0">
            <h2
              className={`font-display text-sm font-bold ${
                isCritical ? 'text-red-900' : 'text-amber-950'
              }`}
            >
              Aviso de Entrega Próxima (menos de 48 horas)
            </h2>
            <p className={`text-xs ${isCritical ? 'text-red-800' : 'text-amber-900'}`}>
              Tienes{' '}
              <strong className="font-mono tabular-nums">{urgentItems.length}</strong>{' '}
              {urgentItems.length === 1
                ? 'cuadro o actividad próxima a vencer.'
                : 'cuadros o actividades próximas a vencer.'}{' '}
              Completa y envía tu información antes de la fecha límite distrital.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border bg-white cursor-pointer whitespace-nowrap shrink-0 ${
            isCritical
              ? 'border-red-200 text-red-800 hover:bg-red-50'
              : 'border-amber-200 text-amber-900 hover:bg-amber-50'
          }`}
        >
          {collapsed ? (
            <>
              <span>Ver detalles ({urgentItems.length})</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>Ocultar detalles</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {!collapsed && (
        <div
          className={`border-t divide-y bg-white ${
            isCritical ? 'border-red-200 divide-red-100' : 'border-amber-200 divide-amber-100'
          }`}
        >
          {urgentItems.map((item) => {
            const itemCritical = item.hoursRemaining < 24;
            return (
              <div
                key={item.id}
                className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                  <p className="text-[11px] text-slate-600">{item.detail}</p>
                  <p className="text-[11px] text-slate-500">
                    Fecha límite: <span className="font-mono">{item.deadlineLabel}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-mono font-semibold tabular-nums whitespace-nowrap ${
                      itemCritical ? 'text-red-700' : 'text-amber-800'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {item.remainingLabel}
                  </span>

                  <button
                    type="button"
                    onClick={() => onNavigate(item.target)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white cursor-pointer whitespace-nowrap ${
                      itemCritical
                        ? 'bg-red-700 hover:bg-red-800'
                        : 'bg-amber-700 hover:bg-amber-800'
                    }`}
                  >
                    <span>{item.actionLabel}</span>
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
