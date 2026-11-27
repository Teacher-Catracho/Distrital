import { useEffect, useMemo, useState } from 'react';
import { Calendar, ClipboardCheck, ClipboardList, FileBarChart2 } from 'lucide-react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ActivityCompliance,
  AnnualReport,
  DistrictActivity,
  DistrictDeadlines,
  EducationLevel,
  MonthlyReport,
  ParteMensualReport,
  School,
  UserProfile,
} from '../types/sace';
import {
  DEFAULT_YEAR,
  MONTHS,
  buildActivityDueDateTime,
  formatDueDateTime,
  formatShortDueDate,
  getActivityDeadlineInfo,
  getParcialLabel,
  getSchoolLevelLabel,
  getTodayIsoDate,
} from '../utils/saceCalculations';
import { ActivityComplianceDirector } from './ActivityComplianceDirector';
import { BasicaAnnualEditor } from './BasicaAnnualEditor';
import { MediaAnnualEditor } from './MediaAnnualEditor';
import { MovimientosSaceEditor } from './MovimientosSaceEditor';
import { ParteMensualEditor } from './ParteMensualEditor';
import { PrebasicaAnnualEditor } from './PrebasicaAnnualEditor';
import { ReportHistoryDirector } from './ReportHistoryDirector';
import { StatisticalDeadlineAlert } from './StatisticalDeadlineAlert';
import { StatusText } from './StatusText';
import { UpcomingDeadlinesSection } from './UpcomingDeadlinesSection';

export type DirectorSection =
  | 'overview'
  | 'parteMensual'
  | 'monthly'
  | 'annual'
  | 'history'
  | 'activities';

interface DirectorDashboardProps {
  profile: UserProfile;
  school: School;
  activeSection: DirectorSection;
  onSectionChange: (section: DirectorSection) => void;
}

const LEVEL_DISPLAY_ORDER: Record<EducationLevel, number> = {
  prebasica: 0,
  basica: 1,
  media: 2,
};

const SCHOOL_MONTHS = MONTHS.filter((m) => m.value >= 2 && m.value <= 11);

function clampSchoolMonth(month: number): number {
  if (month < 2) return 2;
  if (month > 11) return 11;
  return month;
}

export function DirectorDashboard({
  profile,
  school,
  activeSection,
  onSectionChange,
}: DirectorDashboardProps) {
  const availableLevels = useMemo(() => {
    const raw: EducationLevel[] =
      school.levels.length > 0 ? school.levels : ['basica'];
    return [...raw].sort(
      (a, b) => (LEVEL_DISPLAY_ORDER[a] ?? 99) - (LEVEL_DISPLAY_ORDER[b] ?? 99)
    );
  }, [school.levels]);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [selectedLevel, setSelectedLevel] = useState<EducationLevel>(availableLevels[0]);
  const [selectedMonth, setSelectedMonth] = useState<number>(() =>
    clampSchoolMonth(new Date().getMonth() + 1)
  );
  const [parteMensualReports, setParteMensualReports] = useState<ParteMensualReport[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReport[]>([]);
  const [annualReports, setAnnualReports] = useState<AnnualReport[]>([]);
  const [activities, setActivities] = useState<DistrictActivity[]>([]);
  const [activityCompliances, setActivityCompliances] = useState<ActivityCompliance[]>([]);
  const [districtDeadlines, setDistrictDeadlines] = useState<DistrictDeadlines | null>(null);

  useEffect(() => {
    if (!availableLevels.includes(selectedLevel)) {
      setSelectedLevel(availableLevels[0]);
    }
  }, [availableLevels, selectedLevel]);

  useEffect(() => {
    const pQuery = query(
      collection(db, 'parteMensualReports'),
      where('directorUid', '==', profile.uid)
    );
    const unsubP = onSnapshot(
      pQuery,
      (snap) => {
        setParteMensualReports(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ParteMensualReport, 'id'>) }))
            .filter((r) => r.year === year)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'parteMensualReports')
    );

    const mQuery = query(
      collection(db, 'monthlyReports'),
      where('directorUid', '==', profile.uid)
    );
    const unsubM = onSnapshot(
      mQuery,
      (snap) => {
        setMonthlyReports(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<MonthlyReport, 'id'>) }))
            .filter((r) => r.year === year)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'monthlyReports')
    );

    const aQuery = query(
      collection(db, 'annualReports'),
      where('directorUid', '==', profile.uid)
    );
    const unsubA = onSnapshot(
      aQuery,
      (snap) => {
        setAnnualReports(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AnnualReport, 'id'>) }))
            .filter((r) => r.year === year)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'annualReports')
    );

    const actQuery = query(
      collection(db, 'activities'),
      where('assignedDirectorUids', 'array-contains', profile.uid)
    );
    const unsubAct = onSnapshot(
      actQuery,
      (snap) => {
        setActivities(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<DistrictActivity, 'id'>) }))
            .filter((a) => a.year === year && a.active !== false)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activities')
    );

    const compQuery = query(
      collection(db, 'activityCompliances'),
      where('directorUid', '==', profile.uid)
    );
    const unsubComp = onSnapshot(
      compQuery,
      (snap) => {
        setActivityCompliances(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityCompliance, 'id'>) }))
            .filter((c) => c.year === year)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'activityCompliances')
    );

    const deadlinesDocId = `deadlines_${year}`;
    const unsubDeadlines = onSnapshot(
      doc(db, 'districtConfig', deadlinesDocId),
      (snap) => {
        if (snap.exists()) {
          setDistrictDeadlines({
            id: snap.id,
            ...(snap.data() as Omit<DistrictDeadlines, 'id'>),
          });
        } else {
          setDistrictDeadlines(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `districtConfig/${deadlinesDocId}`)
    );

    return () => {
      unsubP();
      unsubM();
      unsubA();
      unsubAct();
      unsubComp();
      unsubDeadlines();
    };
  }, [profile.uid, year]);

  const pendingActivities = useMemo(() => {
    const todayIso = getTodayIsoDate();
    const completedSet = new Set(
      activityCompliances
        .filter((c) => c.schoolId === school.id && c.completed)
        .map((c) => c.activityId)
    );
    return activities
      .filter((a) => a.targetSchoolIds.includes(school.id) && !completedSet.has(a.id))
      .map((a) => ({
        activity: a,
        deadline: getActivityDeadlineInfo(a.dueDate, false, todayIso, a.dueTime),
      }))
      .sort((a, b) =>
        buildActivityDueDateTime(a.activity.dueDate, a.activity.dueTime).localeCompare(
          buildActivityDueDateTime(b.activity.dueDate, b.activity.dueTime)
        )
      );
  }, [activities, activityCompliances, school.id]);

  return (
    <div className="space-y-6">
      {/* Context controls bar */}
      <div className="bg-white border border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{school.name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{school.saceCode}</span>
          <span aria-hidden="true">·</span>
          <span>{school.community}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-600">Año:</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-mono border border-slate-300 bg-white"
            >
              {[2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {activeSection !== 'overview' &&
            activeSection !== 'activities' &&
            activeSection !== 'history' && (
            <div className="flex items-center gap-1 p-1 bg-slate-100">
              {availableLevels.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setSelectedLevel(lvl)}
                  className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    selectedLevel === lvl
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {getSchoolLevelLabel(lvl, school)}
                </button>
              ))}
            </div>
          )}

          {(activeSection === 'monthly' || activeSection === 'parteMensual') && (
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-600">Mes:</label>
              <select
                value={clampSchoolMonth(selectedMonth)}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
              >
                {SCHOOL_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <StatisticalDeadlineAlert
        year={year}
        school={school}
        deadlines={districtDeadlines}
        parteMensualReports={parteMensualReports}
        monthlyReports={monthlyReports}
        annualReports={annualReports}
        activities={activities}
        compliances={activityCompliances}
        onNavigate={(target) => {
          if (target.month) {
            setSelectedMonth(target.month);
          }
          if (target.level && availableLevels.includes(target.level)) {
            setSelectedLevel(target.level);
          }
          onSectionChange(target.section);
        }}
      />

      {activeSection === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Niveles habilitados</p>
              <p className="font-display text-lg font-bold text-slate-900">
                {availableLevels.map((l) => getSchoolLevelLabel(l, school)).join(' · ')}
              </p>
            </div>
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Parte Mensual ({year})</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {
                  parteMensualReports.filter(
                    (r) => r.status === 'approved' || r.status === 'submitted'
                  ).length
                }
                <span className="text-sm font-normal text-slate-500"> enviados/aprobados</span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Movimientos-SACE ({year})</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {monthlyReports.filter((r) => r.status === 'approved' || r.status === 'submitted').length}
                <span className="text-sm font-normal text-slate-500"> enviados/aprobados</span>
              </p>
            </div>
            <div className="bg-white border border-slate-200 p-5 space-y-1">
              <p className="text-xs text-slate-500">Cuadros Anuales ({year})</p>
              <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                {annualReports.filter((r) => r.status === 'approved' || r.status === 'submitted').length}{' '}
                <span className="text-sm font-normal text-slate-500">
                  de {availableLevels.length} niveles
                </span>
              </p>
            </div>
          </div>

          <UpcomingDeadlinesSection
            year={year}
            school={school}
            deadlines={districtDeadlines}
            parteMensualReports={parteMensualReports}
            monthlyReports={monthlyReports}
            onNavigate={(target) => {
              setSelectedMonth(target.month);
              if (availableLevels.includes(target.level)) {
                setSelectedLevel(target.level);
              }
              onSectionChange(target.section);
            }}
          />

          {/* Pending Activities Quick Overview */}
          <div className="bg-white border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4">
              <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-blue-700" />
                Actividades y Evidencias Pendientes ({year})
              </h2>
              <button
                type="button"
                onClick={() => onSectionChange('activities')}
                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
              >
                Ver tablero de cumplimiento ({pendingActivities.length} pend.)
              </button>
            </div>
            {pendingActivities.length === 0 ? (
              <div className="px-5 py-4 text-xs text-slate-600">
                {activities.length === 0
                  ? 'No hay actividades asignadas a tu centro en este año lectivo.'
                  : 'No tienes actividades pendientes de evidencia en WhatsApp.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {pendingActivities.slice(0, 4).map(({ activity, deadline }) => (
                  <div
                    key={activity.id}
                    className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{activity.title}</p>
                      <p className="text-[11px] text-slate-500">
                        {getParcialLabel(activity.parcial)} · Fecha máxima:{' '}
                        <span className="font-mono">
                          {formatDueDateTime(activity.dueDate, activity.dueTime)}
                        </span>
                      </p>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        deadline.state === 'overdue'
                          ? 'text-red-700'
                          : deadline.state === 'due_soon'
                          ? 'text-amber-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {deadline.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Parte Mensual status table */}
            <div className="bg-white border border-slate-200">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-blue-700" />
                  Estado de Parte Mensual ({year})
                </h2>
                <button
                  type="button"
                  onClick={() => onSectionChange('parteMensual')}
                  className="text-xs font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Ir a Parte Mensual
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Mes</th>
                      {availableLevels.map((lvl) => (
                        <th key={lvl} className="px-4 py-2 text-left font-semibold text-slate-700">
                          {getSchoolLevelLabel(lvl, school)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {MONTHS.map((m) => (
                      <tr key={m.value} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-900">{m.label}</td>
                        {availableLevels.map((lvl) => {
                          const rep = parteMensualReports.find(
                            (r) => r.month === m.value && r.level === lvl
                          );
                          return (
                            <td key={lvl} className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLevel(lvl);
                                  setSelectedMonth(m.value);
                                  onSectionChange('parteMensual');
                                }}
                                className="text-left hover:underline cursor-pointer"
                              >
                                {rep ? (
                                  <StatusText status={rep.status} />
                                ) : (
                                  <span className="text-slate-400">Sin iniciar</span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Movimientos-SACE status table */}
            <div className="bg-white border border-slate-200">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-700" />
                  Estado de Movimientos-SACE Mensuales ({year})
                </h2>
                <button
                  type="button"
                  onClick={() => onSectionChange('monthly')}
                  className="text-xs font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Ir a captura mensual
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2 text-left font-semibold text-slate-700">Mes</th>
                      {availableLevels.map((lvl) => (
                        <th key={lvl} className="px-4 py-2 text-left font-semibold text-slate-700">
                          {getSchoolLevelLabel(lvl, school)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {MONTHS.map((m) => (
                      <tr key={m.value} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium text-slate-900">{m.label}</td>
                        {availableLevels.map((lvl) => {
                          const rep = monthlyReports.find(
                            (r) => r.month === m.value && r.level === lvl
                          );
                          return (
                            <td key={lvl} className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedLevel(lvl);
                                  setSelectedMonth(m.value);
                                  onSectionChange('monthly');
                                }}
                                className="text-left hover:underline cursor-pointer"
                              >
                                {rep ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <StatusText status={rep.status} />
                                    {rep.noMovements && (
                                      <span className="text-[11px] font-medium text-slate-500">
                                        · Sin movimientos SACE
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Sin iniciar</span>
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onSectionChange('history')}
              className="px-3.5 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-blue-700 cursor-pointer"
            >
              Ver historial completo de meses anteriores →
            </button>
          </div>

          <div className="bg-white border border-slate-200">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileBarChart2 className="w-4 h-4 text-blue-700" />
                Cuadros Estadísticos Anuales ({year})
              </h2>
              <button
                type="button"
                onClick={() => onSectionChange('annual')}
                className="text-xs font-medium text-blue-700 hover:underline cursor-pointer whitespace-nowrap"
              >
                Ir a cuadros anuales
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {availableLevels.map((lvl) => {
                const rep = annualReports.find((r) => r.level === lvl);
                return (
                  <div
                    key={lvl}
                    className="px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        Cuadros Anuales · {getSchoolLevelLabel(lvl, school)}
                      </p>
                      {rep ? (
                        <StatusText status={rep.status} />
                      ) : (
                        <span className="text-xs text-slate-400">Pendiente de registro</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLevel(lvl);
                        onSectionChange('annual');
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 cursor-pointer whitespace-nowrap"
                    >
                      {rep ? 'Abrir cuadro' : 'Iniciar captura'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeSection === 'parteMensual' && (
        <ParteMensualEditor
          year={year}
          month={selectedMonth}
          level={selectedLevel}
          school={school}
          profile={profile}
        />
      )}

      {activeSection === 'monthly' && (
        <MovimientosSaceEditor
          year={year}
          month={selectedMonth}
          level={selectedLevel}
          school={school}
          profile={profile}
        />
      )}

      {activeSection === 'annual' && selectedLevel === 'prebasica' && (
        <PrebasicaAnnualEditor year={year} school={school} profile={profile} />
      )}

      {activeSection === 'annual' && selectedLevel === 'basica' && (
        <BasicaAnnualEditor year={year} school={school} profile={profile} />
      )}

      {activeSection === 'annual' && selectedLevel === 'media' && (
        <MediaAnnualEditor year={year} school={school} profile={profile} />
      )}

      {activeSection === 'history' && (
        <ReportHistoryDirector
          year={year}
          school={school}
          directorName={profile.displayName}
          directorDni={profile.dni}
          parteMensualReports={parteMensualReports}
          monthlyReports={monthlyReports}
          onOpenReport={(target) => {
            setSelectedMonth(target.month);
            setSelectedLevel(target.level);
            onSectionChange(target.section);
          }}
        />
      )}

      {activeSection === 'activities' && (
        <ActivityComplianceDirector
          year={year}
          school={school}
          activities={activities}
          compliances={activityCompliances}
        />
      )}
    </div>
  );
}
