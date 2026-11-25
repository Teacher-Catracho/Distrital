import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Info,
} from 'lucide-react';
import type {
  ActivityCompliance,
  DistrictActivity,
  ParcialNumber,
  School,
} from '../types/sace';
import {
  PARCIALES,
  formatShortDueDate,
  getActivityDeadlineInfo,
  getDefaultParcial,
  getParcialLabel,
  getTodayIsoDate,
} from '../utils/saceCalculations';

interface ActivityComplianceDirectorProps {
  year: number;
  school: School;
  activities: DistrictActivity[];
  compliances: ActivityCompliance[];
}

type DirectorFilterMode = 'pending' | 'all' | 'completed';

export function ActivityComplianceDirector({
  year,
  school,
  activities,
  compliances,
}: ActivityComplianceDirectorProps) {
  const [selectedParcial, setSelectedParcial] = useState<ParcialNumber>(getDefaultParcial());
  const [filterMode, setFilterMode] = useState<DirectorFilterMode>('pending');

  const todayIso = getTodayIsoDate();

  const complianceByActivity = useMemo(() => {
    const map = new Map<string, ActivityCompliance>();
    for (const c of compliances) {
      if (c.schoolId === school.id) {
        map.set(c.activityId, c);
      }
    }
    return map;
  }, [compliances, school.id]);

  const yearActivities = useMemo(
    () =>
      activities.filter(
        (a) => a.year === year && a.active !== false && a.targetSchoolIds.includes(school.id)
      ),
    [activities, year, school.id]
  );

  const parcialActivities = useMemo(() => {
    const items = yearActivities
      .filter((a) => a.parcial === selectedParcial)
      .map((act) => {
        const comp = complianceByActivity.get(act.id);
        const completed = comp?.completed === true;
        const deadline = getActivityDeadlineInfo(act.dueDate, completed, todayIso);
        return { act, comp, completed, deadline };
      });

    const priorityRank = {
      overdue: 0,
      due_soon: 1,
      pending: 2,
      completed: 3,
    };

    return items.sort((a, b) => {
      const rankDiff = priorityRank[a.deadline.state] - priorityRank[b.deadline.state];
      if (rankDiff !== 0) return rankDiff;
      return a.act.dueDate.localeCompare(b.act.dueDate);
    });
  }, [yearActivities, selectedParcial, complianceByActivity, todayIso]);

  const stats = useMemo(() => {
    const total = parcialActivities.length;
    const completed = parcialActivities.filter((i) => i.completed).length;
    const pending = total - completed;
    const overdue = parcialActivities.filter((i) => i.deadline.state === 'overdue').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, overdue, pct };
  }, [parcialActivities]);

  const visibleItems = useMemo(() => {
    if (filterMode === 'pending') return parcialActivities.filter((i) => !i.completed);
    if (filterMode === 'completed') return parcialActivities.filter((i) => i.completed);
    return parcialActivities;
  }, [parcialActivities, filterMode]);

  return (
    <div className="space-y-6">
      {/* Header & Parcial Selector */}
      <div className="bg-white border border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-bold text-slate-900">
            Actividades y Evidencias del Centro ({year})
          </h2>
          <p className="text-xs text-slate-500">
            Consulta tus actividades asignadas, fechas máximas de entrega y validación de evidencias enviadas por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100">
          {PARCIALES.map((p) => {
            const parcialList = yearActivities.filter((a) => a.parcial === p.value);
            const pendingCount = parcialList.filter(
              (a) => !complianceByActivity.get(a.id)?.completed
            ).length;
            const active = selectedParcial === p.value;

            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setSelectedParcial(p.value)}
                className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.label}
                {pendingCount > 0 ? ` (${pendingCount} pend.)` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* WhatsApp Notice */}
      <div className="bg-blue-50/60 border border-blue-200 px-4 py-3 flex items-start gap-2.5 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <p>
          Envía las evidencias de cada actividad directamente al grupo oficial de{' '}
          <strong>WhatsApp del Distrito N° 18-B</strong> antes de la fecha máxima. La Dirección
          Distrital marcará cada actividad como <strong>Cumplido</strong> tras verificar tu envío.
        </p>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Asignadas · {getParcialLabel(selectedParcial)}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Cumplidas y validadas</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {stats.completed}
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Pendientes de entrega</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${
              stats.overdue > 0
                ? 'text-red-700'
                : stats.pending > 0
                ? 'text-amber-700'
                : 'text-emerald-700'
            }`}
          >
            {stats.pending}
            {stats.overdue > 0 && (
              <span className="text-xs font-sans font-normal text-red-700 ml-2">
                ({stats.overdue} {stats.overdue === 1 ? 'vencida' : 'vencidas'})
              </span>
            )}
          </p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Cumplimiento del parcial</span>
            <span className="font-mono font-bold text-slate-900 tabular-nums">{stats.pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                stats.pct === 100
                  ? 'bg-emerald-600'
                  : stats.pct >= 50
                  ? 'bg-blue-700'
                  : 'bg-amber-600'
              }`}
              style={{ width: `${stats.pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Activities Table */}
      <section className="bg-white border border-slate-200">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-700" />
            Listado de Actividades · {getParcialLabel(selectedParcial)} {year}
          </h3>

          <div className="flex items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                filterMode === 'pending'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendientes ({stats.pending})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('completed')}
              className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                filterMode === 'completed'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cumplidas ({stats.completed})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                filterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas ({stats.total})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-5 py-2.5 text-left font-semibold text-slate-700">
                  Actividad y Evidencia Solicitada
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                  Fecha Máxima
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                  Plazo / Registro
                </th>
                <th className="px-4 py-2.5 text-left font-semibold text-slate-700 whitespace-nowrap">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {parcialActivities.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    No hay actividades asignadas a tu centro educativo en el{' '}
                    {getParcialLabel(selectedParcial)} {year}.
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    {filterMode === 'pending'
                      ? `Has cumplido todas las actividades del ${getParcialLabel(selectedParcial)} ${year}.`
                      : 'No hay actividades en esta categoría.'}
                  </td>
                </tr>
              ) : (
                visibleItems.map(({ act, comp, completed, deadline }) => (
                  <tr key={act.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 max-w-lg">
                      <p className="font-semibold text-slate-900 text-sm">{act.title}</p>
                      {act.description && (
                        <p className="text-xs text-slate-600 mt-1">{act.description}</p>
                      )}
                      {comp?.note && (
                        <p className="text-[11px] text-slate-700 mt-1.5">
                          <span className="font-semibold">Observación Distrital:</span> {comp.note}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 font-mono text-slate-800">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatShortDueDate(act.dueDate)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {completed ? (
                        <span className="text-emerald-800 font-medium">
                          {comp?.completedDate
                            ? `Validada el ${formatShortDueDate(comp.completedDate)}`
                            : 'Validada por Dirección'}
                        </span>
                      ) : (
                        <span
                          className={
                            deadline.state === 'overdue'
                              ? 'text-red-700 font-semibold'
                              : deadline.state === 'due_soon'
                              ? 'text-amber-700 font-semibold'
                              : 'text-slate-600'
                          }
                        >
                          {deadline.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {completed ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          Cumplido
                        </span>
                      ) : deadline.state === 'overdue' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          Vencida
                        </span>
                      ) : deadline.state === 'due_soon' ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-amber-700">
                          <Clock className="w-4 h-4 shrink-0" />
                          Por vencer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                          <Clock className="w-4 h-4 shrink-0" />
                          Pendiente
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
