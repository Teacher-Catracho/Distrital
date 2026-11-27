import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ActivityAssignmentMode,
  ActivityCompliance,
  BasicaScope,
  DistrictActivity,
  EducationLevel,
  ParcialNumber,
  School,
  UserProfile,
} from '../types/sace';
import {
  deleteDistrictActivity,
  markSchoolActivityCompliance,
  saveDistrictActivity,
  syncDirectorLinksForActivities,
} from '../services/activityComplianceService';
import {
  COMPLIANCE_GROUPS,
  PARCIALES,
  buildActivityDueDateTime,
  formatDueDateTime,
  formatShortDueDate,
  getActivityDeadlineInfo,
  getBasicaScope,
  getDefaultParcial,
  getParcialLabel,
  getTodayIsoDate,
  normalizeDueTime,
  schoolMatchesComplianceGroup,
  type SchoolComplianceGroupKey,
} from '../utils/saceCalculations';

interface ActivityComplianceAdminProps {
  year: number;
  schools: School[];
  users: UserProfile[];
  profile: UserProfile;
  activities: DistrictActivity[];
  compliances: ActivityCompliance[];
}

type MatrixFilterStatus = 'all' | 'pending' | 'completed';

const ASSIGNMENT_GROUP_OPTIONS: {
  key: SchoolComplianceGroupKey;
  label: string;
}[] = [
  { key: 'prebasica', label: 'Prebásica' },
  { key: 'basica_c1_2', label: 'Básica (I y II Ciclo · 1° a 6°)' },
  { key: 'basica_c1_2_3', label: 'Básica (I, II y III Ciclo · 1° a 9°)' },
  { key: 'media', label: 'Media' },
];

export function ActivityComplianceAdmin({
  year,
  schools,
  users,
  profile,
  activities,
  compliances,
}: ActivityComplianceAdminProps) {
  const [selectedParcial, setSelectedParcial] = useState<ParcialNumber>(getDefaultParcial());
  const [groupFilter, setGroupFilter] = useState<'all' | SchoolComplianceGroupKey>('all');
  const [statusFilter, setStatusFilter] = useState<MatrixFilterStatus>('all');
  const [search, setSearch] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const lastSyncSigRef = useRef<string>('');

  useEffect(() => {
    if (activities.length === 0 || schools.length === 0) return;
    const sig = `${activities.length}_${compliances.length}_${schools.map((s) => `${s.id}:${s.directorUid}`).join('|')}_${users.filter((u) => u.role === 'director').map((u) => `${u.uid}:${u.schoolId}`).join('|')}`;
    if (sig === lastSyncSigRef.current) return;
    lastSyncSigRef.current = sig;

    syncDirectorLinksForActivities(activities, compliances, schools, users, profile.uid).catch(
      (err) => console.error('Error syncing director links:', err)
    );
  }, [activities, compliances, schools, users, profile.uid]);

  // Create / Edit Activity Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<DistrictActivity | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formParcial, setFormParcial] = useState<ParcialNumber>(getDefaultParcial());
  const [formDueDate, setFormDueDate] = useState(getTodayIsoDate());
  const [formDueTime, setFormDueTime] = useState('23:59');
  const [formAssignmentMode, setFormAssignmentMode] = useState<ActivityAssignmentMode>('levels');
  const [formGroups, setFormGroups] = useState<SchoolComplianceGroupKey[]>([
    'prebasica',
    'basica_c1_2',
    'basica_c1_2_3',
    'media',
  ]);
  const [formSchoolIds, setFormSchoolIds] = useState<string[]>([]);
  const [formSchoolSearch, setFormSchoolSearch] = useState('');
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Activity Detail Modal State
  const [detailActivity, setDetailActivity] = useState<DistrictActivity | null>(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailTab, setDetailTab] = useState<'pending' | 'completed'>('pending');
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const activeSchools = useMemo(
    () =>
      schools
        .filter((s) => s.active !== false)
        .sort((a, b) => a.saceCode.localeCompare(b.saceCode, 'es')),
    [schools]
  );

  const hasBasicaC3OnlySchools = useMemo(
    () => activeSchools.some((s) => s.levels.includes('basica') && getBasicaScope(s) === 'c3'),
    [activeSchools]
  );

  const availableAssignmentOptions = useMemo(() => {
    if (!hasBasicaC3OnlySchools) return ASSIGNMENT_GROUP_OPTIONS;
    return [
      ...ASSIGNMENT_GROUP_OPTIONS.slice(0, 3),
      { key: 'basica_c3' as SchoolComplianceGroupKey, label: 'Básica (III Ciclo · 7° a 9°)' },
      ASSIGNMENT_GROUP_OPTIONS[3],
    ];
  }, [hasBasicaC3OnlySchools]);

  const yearActivities = useMemo(
    () =>
      activities
        .filter((a) => a.year === year && a.active !== false)
        .sort((a, b) =>
          buildActivityDueDateTime(a.dueDate, a.dueTime).localeCompare(
            buildActivityDueDateTime(b.dueDate, b.dueTime)
          )
        ),
    [activities, year]
  );

  const parcialActivities = useMemo(
    () => yearActivities.filter((a) => a.parcial === selectedParcial),
    [yearActivities, selectedParcial]
  );

  const complianceMap = useMemo(() => {
    const map = new Map<string, ActivityCompliance>();
    for (const c of compliances) {
      map.set(`${c.activityId}_${c.schoolId}`, c);
    }
    return map;
  }, [compliances]);

  const todayIso = getTodayIsoDate();

  // Compute school compliance rows
  const schoolRows = useMemo(() => {
    return activeSchools.map((school) => {
      const assigned = parcialActivities.filter((act) => act.targetSchoolIds.includes(school.id));
      const completedCount = assigned.filter(
        (act) => complianceMap.get(`${act.id}_${school.id}`)?.completed === true
      ).length;
      const totalCount = assigned.length;
      const pendingCount = totalCount - completedCount;
      const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

      return {
        school,
        assignedCount: totalCount,
        completedCount,
        pendingCount,
        pct,
      };
    });
  }, [activeSchools, parcialActivities, complianceMap]);

  // District KPIs for selected parcial
  const kpis = useMemo(() => {
    let totalExpected = 0;
    let totalCompleted = 0;
    let schoolsWithAssigned = 0;
    let schoolsFull = 0;

    for (const row of schoolRows) {
      if (row.assignedCount > 0) {
        schoolsWithAssigned++;
        totalExpected += row.assignedCount;
        totalCompleted += row.completedCount;
        if (row.completedCount === row.assignedCount) {
          schoolsFull++;
        }
      }
    }

    const avgPct = totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
    const totalPending = totalExpected - totalCompleted;

    return {
      activityCount: parcialActivities.length,
      avgPct,
      schoolsFull,
      schoolsWithAssigned,
      totalPending,
    };
  }, [schoolRows, parcialActivities.length]);

  // Filtered and grouped rows for matrix display
  const groupedSections = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matchesSearchAndStatus = (row: (typeof schoolRows)[number]) => {
      if (statusFilter === 'pending' && row.pendingCount === 0) return false;
      if (statusFilter === 'completed' && (row.assignedCount === 0 || row.pendingCount > 0)) {
        return false;
      }
      if (q) {
        return (
          row.school.name.toLowerCase().includes(q) ||
          row.school.saceCode.toLowerCase().includes(q) ||
          row.school.community.toLowerCase().includes(q) ||
          (row.school.directorDisplayName || '').toLowerCase().includes(q)
        );
      }
      return true;
    };

    if (groupFilter !== 'all') {
      const groupInfo = COMPLIANCE_GROUPS.find((g) => g.key === groupFilter);
      const filtered = schoolRows.filter(
        (r) => schoolMatchesComplianceGroup(r.school, groupFilter) && matchesSearchAndStatus(r)
      );
      return [
        {
          key: groupFilter,
          label: groupInfo?.label || 'Centros Educativos',
          rows: filtered,
        },
      ];
    }

    const groupsToShow: SchoolComplianceGroupKey[] = [
      'prebasica',
      'basica_c1_2',
      'basica_c1_2_3',
      ...(hasBasicaC3OnlySchools ? (['basica_c3'] as SchoolComplianceGroupKey[]) : []),
      'media',
    ];

    return groupsToShow
      .map((gKey) => {
        const groupInfo = COMPLIANCE_GROUPS.find((g) => g.key === gKey);
        const rows = schoolRows.filter(
          (r) => schoolMatchesComplianceGroup(r.school, gKey) && matchesSearchAndStatus(r)
        );
        return {
          key: gKey,
          label: groupInfo?.label || gKey,
          rows,
        };
      })
      .filter((sec) => sec.rows.length > 0);
  }, [schoolRows, groupFilter, statusFilter, search, hasBasicaC3OnlySchools]);

  // Preview target school IDs for the Create/Edit modal
  const computedTargetSchoolIds = useMemo(() => {
    if (formAssignmentMode === 'schools') {
      return formSchoolIds;
    }
    const matched = activeSchools.filter((s) =>
      formGroups.some((gKey) => schoolMatchesComplianceGroup(s, gKey))
    );
    return matched.map((s) => s.id);
  }, [formAssignmentMode, formGroups, formSchoolIds, activeSchools]);

  const modalFilteredSchools = useMemo(() => {
    const q = formSchoolSearch.trim().toLowerCase();
    if (!q) return activeSchools;
    return activeSchools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.saceCode.toLowerCase().includes(q) ||
        s.community.toLowerCase().includes(q)
    );
  }, [activeSchools, formSchoolSearch]);

  const openCreateModal = () => {
    setEditingActivity(null);
    setFormTitle('');
    setFormDescription('');
    setFormParcial(selectedParcial);
    setFormDueDate(getTodayIsoDate());
    setFormDueTime('23:59');
    setFormAssignmentMode('levels');
    setFormGroups(['prebasica', 'basica_c1_2', 'basica_c1_2_3', 'media']);
    setFormSchoolIds(activeSchools.map((s) => s.id));
    setFormSchoolSearch('');
    setFormError('');
    setConfirmDelete(false);
    setModalOpen(true);
  };

  const openEditModal = (act: DistrictActivity) => {
    setEditingActivity(act);
    setFormTitle(act.title);
    setFormDescription(act.description);
    setFormParcial(act.parcial);
    setFormDueDate(act.dueDate);
    setFormDueTime(normalizeDueTime(act.dueTime));
    setFormAssignmentMode(act.assignmentMode);

    const inferredGroups: SchoolComplianceGroupKey[] = [];
    if (act.targetLevels.includes('prebasica')) inferredGroups.push('prebasica');
    if (act.targetLevels.includes('basica')) {
      if (act.targetBasicaScopes.includes('c1_2')) inferredGroups.push('basica_c1_2');
      if (act.targetBasicaScopes.includes('c1_2_3')) inferredGroups.push('basica_c1_2_3');
      if (act.targetBasicaScopes.includes('c3')) inferredGroups.push('basica_c3');
    }
    if (act.targetLevels.includes('media')) inferredGroups.push('media');

    setFormGroups(
      inferredGroups.length > 0
        ? inferredGroups
        : ['prebasica', 'basica_c1_2', 'basica_c1_2_3', 'media']
    );
    setFormSchoolIds(act.targetSchoolIds);
    setFormSchoolSearch('');
    setFormError('');
    setConfirmDelete(false);
    setModalOpen(true);
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const title = formTitle.trim();
    if (title.length < 2) {
      setFormError('Ingresa un título descriptivo para la actividad (mínimo 2 caracteres).');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formDueDate)) {
      setFormError('Selecciona una fecha máxima de entrega válida.');
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(formDueTime)) {
      setFormError('Selecciona una hora de entrega máxima válida.');
      return;
    }
    if (computedTargetSchoolIds.length === 0) {
      setFormError('Selecciona al menos un nivel educativo o centro educativo.');
      return;
    }

    const targetLevels: EducationLevel[] = [];
    const targetBasicaScopes: BasicaScope[] = [];

    if (formAssignmentMode === 'levels') {
      if (formGroups.includes('prebasica')) targetLevels.push('prebasica');
      if (
        formGroups.includes('basica_c1_2') ||
        formGroups.includes('basica_c1_2_3') ||
        formGroups.includes('basica_c3')
      ) {
        targetLevels.push('basica');
        if (formGroups.includes('basica_c1_2')) targetBasicaScopes.push('c1_2');
        if (formGroups.includes('basica_c3')) targetBasicaScopes.push('c3');
        if (formGroups.includes('basica_c1_2_3')) targetBasicaScopes.push('c1_2_3');
      }
      if (formGroups.includes('media')) targetLevels.push('media');
    }

    setBusyKey('save_activity');
    try {
      await saveDistrictActivity({
        editingActivity,
        year,
        parcial: formParcial,
        title,
        description: formDescription,
        dueDate: formDueDate,
        dueTime: formDueTime,
        assignmentMode: formAssignmentMode,
        targetLevels,
        targetBasicaScopes,
        targetSchoolIds: computedTargetSchoolIds,
        schools: activeSchools,
        users,
        adminUid: profile.uid,
      });
      setSelectedParcial(formParcial);
      setModalOpen(false);
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteActivity = async () => {
    if (!editingActivity) return;
    setBusyKey('delete_activity');
    try {
      await deleteDistrictActivity(editingActivity.id);
      if (detailActivity?.id === editingActivity.id) {
        setDetailActivity(null);
      }
      setModalOpen(false);
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleCompliance = async (
    activity: DistrictActivity,
    school: School,
    overrideNote?: string
  ) => {
    const docId = `${activity.id}_${school.id}`;
    const existing = complianceMap.get(docId);
    const nextCompleted =
      overrideNote !== undefined
        ? (existing?.completed ?? false)
        : !(existing?.completed ?? false);

    setBusyKey(docId);
    try {
      await markSchoolActivityCompliance({
        activity,
        school,
        users,
        adminUid: profile.uid,
        completed: nextCompleted,
        note: overrideNote,
      });
      setFeedbackMsg(
        overrideNote !== undefined
          ? `${school.name}: observación guardada en "${activity.title}".`
          : nextCompleted
          ? `${school.name}: "${activity.title}" marcada como Cumplido.`
          : `${school.name}: "${activity.title}" actualizada a Pendiente.`
      );
    } finally {
      setBusyKey(null);
    }
  };

  const openDetailModal = (act: DistrictActivity) => {
    setDetailActivity(act);
    setDetailSearch('');
    setDetailTab('pending');
    const drafts: Record<string, string> = {};
    for (const s of activeSchools) {
      if (act.targetSchoolIds.includes(s.id)) {
        const c = complianceMap.get(`${act.id}_${s.id}`);
        drafts[s.id] = c?.note || '';
      }
    }
    setNoteDrafts(drafts);
  };

  const detailSchools = useMemo(() => {
    if (!detailActivity) return { pending: [], completed: [], total: 0 };
    const q = detailSearch.trim().toLowerCase();
    const assigned = activeSchools.filter((s) => detailActivity.targetSchoolIds.includes(s.id));
    const filtered = q
      ? assigned.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.saceCode.toLowerCase().includes(q) ||
            s.community.toLowerCase().includes(q) ||
            (s.directorDisplayName || '').toLowerCase().includes(q)
        )
      : assigned;

    const pending: { school: School; compliance?: ActivityCompliance }[] = [];
    const completed: { school: School; compliance?: ActivityCompliance }[] = [];

    for (const s of filtered) {
      const c = complianceMap.get(`${detailActivity.id}_${s.id}`);
      if (c?.completed) {
        completed.push({ school: s, compliance: c });
      } else {
        pending.push({ school: s, compliance: c });
      }
    }

    return { pending, completed, total: assigned.length };
  }, [detailActivity, activeSchools, complianceMap, detailSearch]);

  return (
    <div className="space-y-6">
      {/* Header + Parcial Selector + New Activity CTA */}
      <div className="bg-white border border-slate-200 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="font-display text-base font-bold text-slate-900">
            Control de Cumplimiento de Actividades y Evidencias ({year})
          </h2>
          <p className="text-xs text-slate-500">
            Marca en pantalla las evidencias recibidas en el grupo de WhatsApp distrital · Haz clic en cada celda para alternar Entregado / Pendiente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100">
            {PARCIALES.map((p) => {
              const count = yearActivities.filter((a) => a.parcial === p.value).length;
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
                  {count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Actividad
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-800">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedbackMsg}
          </span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            aria-label="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Actividades · {getParcialLabel(selectedParcial)}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {kpis.activityCount}
          </p>
          <p className="text-xs text-slate-500">Solicitadas en este parcial</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Cumplimiento promedio distrital</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${
              kpis.avgPct >= 80
                ? 'text-emerald-700'
                : kpis.avgPct >= 50
                ? 'text-blue-700'
                : 'text-amber-700'
            }`}
          >
            {kpis.avgPct}%
          </p>
          <p className="text-xs text-slate-500">Sobre actividades asignadas</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Centros al 100%</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {kpis.schoolsFull}{' '}
            <span className="text-sm font-normal text-slate-500">
              de {kpis.schoolsWithAssigned}
            </span>
          </p>
          <p className="text-xs text-slate-500">Todas las evidencias al día</p>
        </div>
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Evidencias pendientes</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums ${
              kpis.totalPending > 0 ? 'text-red-700' : 'text-emerald-700'
            }`}
          >
            {kpis.totalPending}
          </p>
          <p className="text-xs text-slate-500">Por verificar en WhatsApp</p>
        </div>
      </div>

      {/* Main Matrix Card */}
      <section className="bg-white border border-slate-200">
        {/* Matrix Filter Bar */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="matrix-group-filter" className="text-xs text-slate-600">
                Nivel:
              </label>
              <select
                id="matrix-group-filter"
                value={groupFilter}
                onChange={(e) =>
                  setGroupFilter(e.target.value as 'all' | SchoolComplianceGroupKey)
                }
                className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white"
              >
                <option value="all">Todos los niveles</option>
                {availableAssignmentOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  statusFilter === 'pending'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Con pendientes
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  statusFilter === 'completed'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Al 100%
              </button>
            </div>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar centro, SACE o comunidad..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 bg-white w-64 focus:outline-none focus:border-blue-700"
            />
          </div>
        </div>

        {/* Empty State or Matrix */}
        {parcialActivities.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="space-y-1 max-w-md mx-auto">
              <p className="text-sm font-semibold text-slate-900">
                Sin actividades registradas en {getParcialLabel(selectedParcial)} {year}
              </p>
              <p className="text-xs text-slate-500">
                Crea la primera actividad con su fecha máxima de entrega y asígnala por nivel educativo o seleccionando centros específicos.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Crear primera actividad
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto matrix-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#0f2b5b] text-white border-b border-slate-300">
                  <th className="px-2.5 py-3 text-center font-semibold w-10 border-r border-blue-900/60">
                    N°
                  </th>
                  <th className="px-3 py-3 text-left font-semibold whitespace-nowrap border-r border-blue-900/60">
                    Código SACE
                  </th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[210px] border-r border-blue-900/60">
                    Centro Educativo
                  </th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[130px] border-r border-blue-900/60">
                    Comunidad
                  </th>
                  <th className="px-2.5 py-3 text-left font-semibold whitespace-nowrap border-r border-blue-900/60">
                    Sector
                  </th>

                  {parcialActivities.map((act) => {
                    const pastDue =
                      getActivityDeadlineInfo(act.dueDate, false, todayIso, act.dueTime).state ===
                      'overdue';
                    const assignedCount = act.targetSchoolIds.length;
                    const doneForAct = activeSchools.filter(
                      (s) =>
                        act.targetSchoolIds.includes(s.id) &&
                        complianceMap.get(`${act.id}_${s.id}`)?.completed
                    ).length;

                    return (
                      <th
                        key={act.id}
                        className="px-2 py-2.5 text-center font-medium min-w-[128px] max-w-[160px] border-r border-blue-900/60 align-top"
                      >
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            onClick={() => openDetailModal(act)}
                            title={`${act.title}${act.description ? ` — ${act.description}` : ''}`}
                            className="text-left w-full hover:underline cursor-pointer"
                          >
                            <span className="block font-semibold text-white leading-tight line-clamp-2 text-[11px]">
                              {act.title}
                            </span>
                          </button>
                          <div className="flex items-center justify-between gap-1 text-[10px] text-blue-100 font-mono">
                            <span className={pastDue ? 'text-amber-300' : 'text-blue-200'}>
                              {formatDueDateTime(act.dueDate, act.dueTime)}
                            </span>
                            <span>
                              {doneForAct}/{assignedCount}
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-1 pt-0.5">
                            <button
                              type="button"
                              onClick={() => openDetailModal(act)}
                              title="Ver detalle y observaciones"
                              className="p-1 text-blue-200 hover:text-white hover:bg-blue-800/60 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(act)}
                              title="Editar actividad"
                              className="p-1 text-blue-200 hover:text-white hover:bg-blue-800/60 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </th>
                    );
                  })}

                  <th className="px-3 py-3 text-center font-semibold whitespace-nowrap border-r border-blue-900/60">
                    Completo
                  </th>
                  <th className="px-3 py-3 text-center font-semibold min-w-[125px] border-r border-blue-900/60">
                    Pendiente / Avance
                  </th>
                  <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">
                    % Cumplimiento
                  </th>
                </tr>
              </thead>

              <tbody>
                {groupedSections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8 + parcialActivities.length}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      No hay centros educativos que coincidan con el filtro aplicado.
                    </td>
                  </tr>
                ) : (
                  groupedSections.map((group) => (
                    <React.Fragment key={group.key}>
                      <tr className="bg-slate-200/85 border-y border-slate-300">
                        <td
                          colSpan={8 + parcialActivities.length}
                          className="px-3 py-1.5 text-[11px] font-bold tracking-wide text-slate-800 uppercase"
                        >
                          {group.label} · {group.rows.length}{' '}
                          {group.rows.length === 1 ? 'centro' : 'centros'}
                        </td>
                      </tr>

                      {group.rows.map(({ school, assignedCount, completedCount, pct }, idx) => (
                        <tr
                          key={`${group.key}_${school.id}`}
                          className="border-b border-slate-200 hover:bg-slate-50/90"
                        >
                          <td className="px-2.5 py-2 text-center font-mono text-slate-500 tabular-nums border-r border-slate-200">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap border-r border-slate-200">
                            {school.saceCode}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200">
                            <p className="font-medium text-slate-900 leading-snug">{school.name}</p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                              {school.directorDisplayName || 'Sin director vinculado'}
                            </p>
                          </td>
                          <td className="px-3 py-2 text-slate-600 border-r border-slate-200">
                            {school.community}
                          </td>
                          <td className="px-2.5 py-2 text-[11px] text-slate-600 whitespace-nowrap border-r border-slate-200">
                            {school.sector === 'no_gubernamental' ? 'No Gubernamental' : 'Gubernamental'}
                          </td>

                          {parcialActivities.map((act) => {
                            const isAssigned = act.targetSchoolIds.includes(school.id);
                            if (!isAssigned) {
                              return (
                                <td
                                  key={act.id}
                                  className="px-2 py-2 text-center text-slate-300 border-r border-slate-200 bg-slate-50/40"
                                  title="Esta actividad no fue asignada a este centro"
                                >
                                  —
                                </td>
                              );
                            }

                            const docId = `${act.id}_${school.id}`;
                            const record = complianceMap.get(docId);
                            const isCompleted = record?.completed === true;
                            const isPastDue = !isCompleted && act.dueDate < todayIso;
                            const isBusy = busyKey === docId;

                            return (
                              <td
                                key={act.id}
                                className="px-1.5 py-1.5 text-center border-r border-slate-200"
                              >
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleToggleCompliance(act, school)}
                                  title={
                                    isCompleted
                                      ? `Cumplido${record?.completedDate ? ` (${record.completedDate})` : ''}${record?.note ? ` · ${record.note}` : ''} · Clic para marcar pendiente`
                                      : `Pendiente (límite: ${act.dueDate})${record?.note ? ` · ${record.note}` : ''} · Clic para marcar como cumplido`
                                  }
                                  className={`w-full inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium border transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                                    isCompleted
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                      : isPastDue
                                      ? 'bg-red-50/70 border-red-200 text-red-700 hover:bg-red-100'
                                      : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-800'
                                  }`}
                                >
                                  {isCompleted ? (
                                    <>
                                      <Check className="w-3 h-3 shrink-0" />
                                      <span>Cumplido</span>
                                    </>
                                  ) : (
                                    <>
                                      <X className="w-3 h-3 shrink-0" />
                                      <span>Pendiente</span>
                                    </>
                                  )}
                                  {record?.note && (
                                    <MessageSquare className="w-2.5 h-2.5 shrink-0 opacity-75" />
                                  )}
                                </button>
                              </td>
                            );
                          })}

                          <td className="px-3 py-2 text-center font-mono tabular-nums whitespace-nowrap border-r border-slate-200 text-slate-900 font-semibold">
                            {assignedCount > 0 ? `${completedCount}/${assignedCount}` : '0/0'}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-200">
                            {assignedCount > 0 ? (
                              <div
                                className="w-full h-3 bg-red-600/85 overflow-hidden flex"
                                title={`Completado: ${pct}% · Pendiente: ${100 - pct}%`}
                              >
                                <div
                                  className="h-full bg-emerald-600 transition-all duration-200"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">Sin asignar</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            {assignedCount > 0 ? (
                              <span
                                className={
                                  pct === 100
                                    ? 'text-emerald-700'
                                    : pct >= 60
                                    ? 'text-slate-900'
                                    : 'text-red-700'
                                }
                              >
                                {pct}%
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create / Edit Activity Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                {editingActivity ? 'Editar Actividad Distrital' : 'Nueva Actividad Distrital'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveActivity} className="overflow-y-auto p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 border border-red-200 bg-red-50 text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="font-medium text-slate-700 block">
                    Título de la actividad *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={160}
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Ej. Mural Día del Cacique Lempira / IPCE SACE"
                    className="w-full px-3 py-2 border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-700 block">Parcial *</label>
                  <select
                    value={formParcial}
                    onChange={(e) => setFormParcial(Number(e.target.value) as ParcialNumber)}
                    className="w-full px-3 py-2 border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                  >
                    {PARCIALES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="activity-due-date"
                      className="font-medium text-slate-700 block"
                    >
                      Fecha máxima de entrega *
                    </label>
                    <input
                      id="activity-due-date"
                      type="date"
                      required
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full px-3 py-2 font-mono border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="activity-due-time"
                      className="font-medium text-slate-700 block"
                    >
                      Hora de entrega máxima *
                    </label>
                    <input
                      id="activity-due-time"
                      type="time"
                      required
                      value={formDueTime}
                      onChange={(e) => setFormDueTime(e.target.value)}
                      className="w-full px-3 py-2 font-mono border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="font-medium text-slate-700 block">
                    Evidencia requerida (envío por WhatsApp)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={600}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Ej. Enviar 2 fotografías y listado de asistencia firmado al grupo de WhatsApp distrital."
                    className="w-full px-3 py-2 border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                  />
                </div>
              </div>

              {/* Assignment Selector */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    Centros educativos asignados ({computedTargetSchoolIds.length})
                  </span>
                  <div className="flex items-center gap-1 p-1 bg-slate-100">
                    <button
                      type="button"
                      onClick={() => setFormAssignmentMode('levels')}
                      className={`px-3 py-1 text-xs font-medium cursor-pointer ${
                        formAssignmentMode === 'levels'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Por nivel educativo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (formAssignmentMode === 'levels') {
                          setFormSchoolIds(computedTargetSchoolIds);
                        }
                        setFormAssignmentMode('schools');
                      }}
                      className={`px-3 py-1 text-xs font-medium cursor-pointer ${
                        formAssignmentMode === 'schools'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Centros específicos manualmente
                    </button>
                  </div>
                </div>

                {formAssignmentMode === 'levels' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {availableAssignmentOptions.map((opt) => {
                      const checked = formGroups.includes(opt.key);
                      const count = activeSchools.filter((s) =>
                        schoolMatchesComplianceGroup(s, opt.key)
                      ).length;

                      return (
                        <label
                          key={opt.key}
                          className={`flex items-center justify-between gap-2 p-2.5 border cursor-pointer ${
                            checked
                              ? 'border-blue-300 bg-blue-50/50 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setFormGroups((prev) =>
                                  prev.includes(opt.key)
                                    ? prev.filter((k) => k !== opt.key)
                                    : [...prev, opt.key]
                                );
                              }}
                            />
                            <span className="font-medium">{opt.label}</span>
                          </span>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                            {count}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                        <input
                          type="text"
                          value={formSchoolSearch}
                          onChange={(e) => setFormSchoolSearch(e.target.value)}
                          placeholder="Filtrar centros por nombre o SACE..."
                          className="w-full pl-8 pr-3 py-1.5 border border-slate-300 bg-white"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const visibleIds = modalFilteredSchools.map((s) => s.id);
                            setFormSchoolIds((prev) =>
                              Array.from(new Set([...prev, ...visibleIds]))
                            );
                          }}
                          className="px-2.5 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                        >
                          Seleccionar visibles
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormSchoolIds([])}
                          className="px-2.5 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 cursor-pointer"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>

                    <div className="border border-slate-200 max-h-52 overflow-y-auto divide-y divide-slate-200">
                      {modalFilteredSchools.map((s) => {
                        const checked = formSchoolIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                          >
                            <span className="inline-flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  setFormSchoolIds((prev) =>
                                    prev.includes(s.id)
                                      ? prev.filter((id) => id !== s.id)
                                      : [...prev, s.id]
                                  )
                                }
                              />
                              <span className="font-mono text-slate-500 shrink-0">
                                {s.saceCode}
                              </span>
                              <span className="font-medium text-slate-900 truncate">{s.name}</span>
                            </span>
                            <span className="text-[11px] text-slate-500 shrink-0">
                              {s.community}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  {editingActivity && !confirmDelete && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar actividad
                    </button>
                  )}
                  {editingActivity && confirmDelete && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyKey === 'delete_activity'}
                        onClick={handleDeleteActivity}
                        className="px-3 py-2 text-xs font-medium bg-red-700 hover:bg-red-800 text-white cursor-pointer disabled:opacity-50"
                      >
                        Confirmar eliminación
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="px-3 py-2 text-xs border border-slate-300 bg-white cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={busyKey === 'save_activity'}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white font-medium cursor-pointer disabled:opacity-50"
                  >
                    {busyKey === 'save_activity'
                      ? 'Guardando...'
                      : editingActivity
                      ? 'Guardar cambios'
                      : 'Crear actividad'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Detail Modal (Inspect Delivered vs Pending + Notes) */}
      {detailActivity && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{getParcialLabel(detailActivity.parcial)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Calendar className="w-3 h-3" />
                    Fecha límite: {formatDueDateTime(detailActivity.dueDate, detailActivity.dueTime)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {detailSchools.completed.length}/{detailSchools.total} cumplidos
                  </span>
                </div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {detailActivity.title}
                </h3>
                {detailActivity.description && (
                  <p className="text-xs text-slate-600">{detailActivity.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailActivity(null)}
                className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
                aria-label="Cerrar detalle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
              <div className="flex items-center gap-1 p-1 bg-slate-200/70">
                <button
                  type="button"
                  onClick={() => setDetailTab('pending')}
                  className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    detailTab === 'pending'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendientes ({detailSchools.pending.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('completed')}
                  className={`px-3 py-1 text-xs font-medium cursor-pointer whitespace-nowrap ${
                    detailTab === 'completed'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cumplidos ({detailSchools.completed.length})
                </button>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={detailSearch}
                  onChange={(e) => setDetailSearch(e.target.value)}
                  placeholder="Filtrar centro..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 bg-white w-56"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-200">
              {(detailTab === 'pending' ? detailSchools.pending : detailSchools.completed).length ===
              0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  {detailTab === 'pending'
                    ? 'Todos los centros asignados ya cumplieron esta actividad.'
                    : 'Aún no hay centros marcados como cumplidos para esta actividad.'}
                </div>
              ) : (
                (detailTab === 'pending' ? detailSchools.pending : detailSchools.completed).map(
                  ({ school, compliance }) => {
                    const docId = `${detailActivity.id}_${school.id}`;
                    const isCompleted = compliance?.completed === true;
                    const draft = noteDrafts[school.id] ?? compliance?.note ?? '';
                    const isDirty = draft.trim() !== (compliance?.note || '');
                    const deadline = getActivityDeadlineInfo(
                      detailActivity.dueDate,
                      isCompleted,
                      todayIso,
                      detailActivity.dueTime
                    );

                    return (
                      <div
                        key={school.id}
                        className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
                      >
                        <div className="space-y-0.5 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-slate-500">
                              {school.saceCode}
                            </span>
                            <span className="text-xs font-semibold text-slate-900">
                              {school.name}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {school.community} ·{' '}
                            {school.directorDisplayName || 'Sin director asignado'} ·{' '}
                            <span
                              className={
                                deadline.state === 'completed'
                                  ? 'text-emerald-700 font-medium'
                                  : deadline.state === 'overdue'
                                  ? 'text-red-700 font-medium'
                                  : 'text-amber-700 font-medium'
                              }
                            >
                              {isCompleted && compliance?.completedDate
                                ? `Cumplido el ${formatShortDueDate(compliance.completedDate)}`
                                : deadline.label}
                            </span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <input
                            type="text"
                            maxLength={400}
                            value={draft}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [school.id]: e.target.value }))
                            }
                            placeholder="Observación (WhatsApp)..."
                            className="px-2.5 py-1.5 text-xs border border-slate-300 bg-white w-48"
                          />
                          {isDirty && (
                            <button
                              type="button"
                              disabled={busyKey === docId}
                              onClick={() =>
                                handleToggleCompliance(detailActivity, school, draft)
                              }
                              className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer"
                            >
                              Guardar nota
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busyKey === docId}
                            onClick={() => handleToggleCompliance(detailActivity, school)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                              isCompleted
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                                : 'bg-blue-700 border-blue-700 text-white hover:bg-blue-800'
                            }`}
                          >
                            {isCompleted ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Cumplido
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5" />
                                Marcar cumplido
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  }
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
