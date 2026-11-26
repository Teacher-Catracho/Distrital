import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Eye,
  FileSpreadsheet,
  Filter,
  RotateCcw,
  Search,
} from 'lucide-react';
import type {
  AnnualReport,
  BasicaAnnualData,
  BasicaScope,
  CenterTypeFilter,
  DistrictCode,
  EducationLevel,
  MediaAnnualData,
  ModalityType,
  MonthlyReport,
  MovementRow,
  ParteMensualReport,
  PrebasicaAnnualData,
  ReportStatus,
  School,
  SectorType,
} from '../types/sace';
import {
  BASICA_ALL_GRADES,
  BASICA_CENTER_TYPE_LABELS,
  BASICA_CYCLE_1_2,
  BASICA_CYCLE_3,
  BASICA_SCOPE_SHORT_LABELS,
  CENTER_TYPE_FILTER_OPTIONS,
  DISTRICT_OPTIONS,
  LEVEL_LABELS,
  MEDIA_GRADES,
  MONTHS,
  PREBASICA_GRADES,
  computeParteMensualRow,
  getBasicaGradesForScope,
  getBasicaScope,
  getCenterTypeFilterLabel,
  getDistrictLabel,
  getParteMensualGrades,
  getSchoolCenterTypesSummary,
  getSchoolLevelLabel,
  normalizeBasicaCenterType,
  normalizePrebasicaCenterType,
  schoolMatchesBasicaScope,
  schoolMatchesCenterTypeFilter,
} from '../utils/saceCalculations';
import {
  exportStatisticalExplorerExcel,
  type StatisticalExplorerExcelRow,
} from '../utils/exportExcel';
import { StatusText } from './StatusText';

interface StatisticalReportsExplorerProps {
  year: number;
  schools: School[];
  parteMensualReports: ParteMensualReport[];
  monthlyReports: MonthlyReport[];
  annualReports: AnnualReport[];
  onInspectParteMensual?: (report: ParteMensualReport) => void;
  onInspectMonthly?: (report: MonthlyReport) => void;
  onInspectAnnual?: (report: AnnualReport) => void;
}

type StatSource = 'parteMensual' | 'annual' | 'monthly';
type StatusScope = 'submitted_and_approved' | ReportStatus | 'all';
type ViewTab = 'grades' | 'levels_types' | 'schools' | 'movements';
type ChartDimension = 'grade' | 'level' | 'centerType';
type ChartMetric = 'enrollment_nv' | 'movements' | 'outcomes';

interface StatBucket {
  key: string;
  label: string;
  subLabel?: string;
  level?: EducationLevel;
  schoolsCount: number;
  reportsCount: number;
  matInicialN: number;
  matInicialV: number;
  ingresosN: number;
  ingresosV: number;
  trasladosN: number;
  trasladosV: number;
  desertoresN: number;
  desertoresV: number;
  matFinalN: number;
  matFinalV: number;
  asistenciaMediaSum: number;
  aprobadosN: number;
  aprobadosV: number;
  reprobadosN: number;
  reprobadosV: number;
  egresadosN: number;
  egresadosV: number;
}

interface SchoolStatRow extends StatBucket {
  schoolId: string;
  saceCode: string;
  schoolName: string;
  community: string;
  districtLabel: string;
  levelLabel: string;
  centerTypeLabel: string;
  sectorLabel: string;
  modalityLabel: string;
  status?: ReportStatus;
  hasReport: boolean;
  reportMonth?: number;
  parteRef?: ParteMensualReport;
  annualRef?: AnnualReport;
  monthlyRef?: MonthlyReport;
}

interface NominalMovementItem {
  id: string;
  month: number;
  schoolId: string;
  schoolName: string;
  saceCode: string;
  level: EducationLevel;
  tipo: 'Ingreso' | 'Traslado' | 'Desertor';
  row: MovementRow;
}

const SECTOR_LABELS: Record<SectorType, string> = {
  gubernamental: 'Gubernamental',
  no_gubernamental: 'No Gubernamental',
};

const MODALITY_LABELS: Record<ModalityType, string> = {
  presencial: 'Presencial',
  isemed: 'ISEMED',
  acelerado: 'Acelerado',
};

const GRADE_DEFS_ALL: { key: string; level: EducationLevel; label: string; shortLabel: string }[] = [
  ...PREBASICA_GRADES.map((g) => ({
    key: g.key,
    level: 'prebasica' as EducationLevel,
    label: g.label,
    shortLabel: g.edadesLabel === 'PRIMERO' ? 'Preb. 1°' : g.edadesLabel === 'SEGUNDO' ? 'Preb. 2°' : 'Preb. 3°',
  })),
  ...BASICA_ALL_GRADES.map((g) => ({
    key: g.key,
    level: 'basica' as EducationLevel,
    label: `${g.label} (${g.shortLabel})`,
    shortLabel: g.shortLabel,
  })),
  ...MEDIA_GRADES.map((g, idx) => ({
    key: g.key,
    level: 'media' as EducationLevel,
    label: `${g.label} (${10 + idx}°)`,
    shortLabel: `${10 + idx}°`,
  })),
];

function emptyBucket(key: string, label: string, subLabel?: string, level?: EducationLevel): StatBucket {
  return {
    key,
    label,
    subLabel,
    level,
    schoolsCount: 0,
    reportsCount: 0,
    matInicialN: 0,
    matInicialV: 0,
    ingresosN: 0,
    ingresosV: 0,
    trasladosN: 0,
    trasladosV: 0,
    desertoresN: 0,
    desertoresV: 0,
    matFinalN: 0,
    matFinalV: 0,
    asistenciaMediaSum: 0,
    aprobadosN: 0,
    aprobadosV: 0,
    reprobadosN: 0,
    reprobadosV: 0,
    egresadosN: 0,
    egresadosV: 0,
  };
}

function clampSchoolMonth(month: number): number {
  if (month < 2) return 2;
  if (month > 11) return 11;
  return month;
}

function getBucketRatePct(b: StatBucket, source: StatSource): number {
  if (source === 'parteMensual') {
    const matFinalT = b.matFinalN + b.matFinalV;
    return matFinalT > 0 ? Math.max(0, Math.min(100, (b.asistenciaMediaSum / matFinalT) * 100)) : 0;
  }
  if (source === 'annual') {
    const aprobT = b.aprobadosN + b.aprobadosV;
    const reprobT = b.reprobadosN + b.reprobadosV;
    return aprobT + reprobT > 0 ? (aprobT / (aprobT + reprobT)) * 100 : 0;
  }
  return 0;
}

function getGradeLevelFromKey(gradeKey: string): EducationLevel | null {
  if (PREBASICA_GRADES.some((g) => g.key === gradeKey)) return 'prebasica';
  if (BASICA_ALL_GRADES.some((g) => g.key === gradeKey)) return 'basica';
  if (MEDIA_GRADES.some((g) => g.key === gradeKey)) return 'media';
  return null;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function movementMatchesGrade(gradoSeccion: string, gradeKey: string): boolean {
  if (gradeKey === 'all') return true;
  const text = normalizeText(gradoSeccion || '');
  if (!text) return false;

  const patterns: Record<string, RegExp> = {
    prekinder: /\b(pre[\s-]*kinder|prekinder|1\s*°?\s*pre|primero\s*pre)\b/,
    kinder: /\b(kinder|2\s*°?\s*pre|segundo\s*pre)\b/,
    preparatoria: /\b(preparatoria|prepa|3\s*°?\s*pre|tercero\s*pre)\b/,
    g1: /\b(1|1°|1ro|primero)\b/,
    g2: /\b(2|2°|2do|segundo)\b/,
    g3: /\b(3|3°|3ro|tercero)\b/,
    g4: /\b(4|4°|4to|cuarto)\b/,
    g5: /\b(5|5°|5to|quinto)\b/,
    g6: /\b(6|6°|6to|sexto)\b/,
    g7: /\b(7|7°|7mo|septimo)\b/,
    g8: /\b(8|8°|8vo|octavo)\b/,
    g9: /\b(9|9°|9no|noveno)\b/,
    decimo: /\b(10|10°|10mo|decimo)\b/,
    undecimo: /\b(11|11°|11vo|undecimo)\b/,
    duodecimo: /\b(12|12°|12vo|duodecimo)\b/,
  };

  const rx = patterns[gradeKey];
  return rx ? rx.test(text) : true;
}

function resolveLevelCenterTypeBucket(
  level: EducationLevel,
  school?: School
): { key: string; label: string } {
  if (level === 'prebasica') {
    const t = normalizePrebasicaCenterType(school?.prebasicaType);
    if (t) return { key: `prebasica:${t}`, label: `Prebásica · ${t}` };
    return { key: 'prebasica:unassigned', label: 'Prebásica · Sin tipo asignado' };
  }
  if (level === 'basica') {
    const scope = getBasicaScope(school);
    if (scope === 'c1_2') {
      const bt = normalizeBasicaCenterType(school?.basicaType);
      if (bt) {
        return {
          key: `basica:c1_2:${bt}`,
          label: `Básica (1° a 6°) · ${BASICA_CENTER_TYPE_LABELS[bt]}`,
        };
      }
      return { key: 'basica:c1_2:unassigned', label: 'Básica (1° a 6°) · Sin tipo asignado' };
    }
    if (scope === 'c3') {
      return { key: 'basica:c3', label: 'Básica (7° a 9°) · III Ciclo' };
    }
    return { key: 'basica:c1_2_3', label: 'Básica (1° a 9°) · I, II y III Ciclo' };
  }
  return { key: 'media', label: 'Media (10° a 12°)' };
}

const CENTER_TYPE_BUCKET_ORDER: string[] = [
  'prebasica:Normal',
  'prebasica:CEP-U',
  'prebasica:CCPREB',
  'prebasica:unassigned',
  'basica:c1_2:normal',
  'basica:c1_2:proheco',
  'basica:c1_2:unassigned',
  'basica:c1_2_3',
  'basica:c3',
  'media',
];

function StatChartTooltip({
  active,
  payload,
  source,
  metric,
}: {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: {
      name: string;
      ninas: number;
      varones: number;
      totalMat: number;
      ingresos: number;
      traslados: number;
      desertores: number;
      aprobados: number;
      reprobados: number;
      reportsCount: number;
    };
  }>;
  source: StatSource;
  metric: ChartMetric;
}) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const pt = payload[0].payload;

  return (
    <div className="bg-white border border-slate-200 shadow-sm px-3.5 py-2.5 text-xs space-y-1.5 min-w-[220px]">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-1.5">
        <span className="font-semibold text-slate-900">{pt.name}</span>
        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
          {pt.reportsCount} {pt.reportsCount === 1 ? 'reporte' : 'reportes'}
        </span>
      </div>
      {source === 'monthly' || metric === 'movements' ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-emerald-700">Ingresos</span>
            <span className="font-mono font-semibold tabular-nums">{pt.ingresos.toLocaleString('es-HN')}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-amber-700">Traslados</span>
            <span className="font-mono font-semibold tabular-nums">{pt.traslados.toLocaleString('es-HN')}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-red-700">Desertores</span>
            <span className="font-mono font-semibold tabular-nums">{pt.desertores.toLocaleString('es-HN')}</span>
          </div>
        </div>
      ) : metric === 'outcomes' && source === 'annual' ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-emerald-700">Aprobados</span>
            <span className="font-mono font-semibold tabular-nums">{pt.aprobados.toLocaleString('es-HN')}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-red-700">Reprobados</span>
            <span className="font-mono font-semibold tabular-nums">{pt.reprobados.toLocaleString('es-HN')}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-4">
            <span className="text-pink-700">Niñas (N)</span>
            <span className="font-mono font-semibold tabular-nums">{pt.ninas.toLocaleString('es-HN')}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-blue-700">Varones (V)</span>
            <span className="font-mono font-semibold tabular-nums">{pt.varones.toLocaleString('es-HN')}</span>
          </div>
          <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-4">
            <span className="font-semibold text-slate-900">Matrícula Final</span>
            <span className="font-mono font-bold tabular-nums text-slate-900">
              {pt.totalMat.toLocaleString('es-HN')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function StatisticalReportsExplorer({
  year,
  schools,
  parteMensualReports,
  monthlyReports,
  annualReports,
  onInspectParteMensual,
  onInspectMonthly,
  onInspectAnnual,
}: StatisticalReportsExplorerProps) {
  const defaultMonth = clampSchoolMonth(new Date().getMonth() + 1);

  // Filters
  const [source, setSource] = useState<StatSource>('parteMensual');
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(defaultMonth);
  const [levelFilter, setLevelFilter] = useState<'all' | EducationLevel>('all');
  const [basicaScopeFilter, setBasicaScopeFilter] = useState<'all' | BasicaScope>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [centerTypeFilter, setCenterTypeFilter] = useState<CenterTypeFilter>('all');
  const [districtFilter, setDistrictFilter] = useState<'all' | DistrictCode | 'unassigned'>('all');
  const [sectorFilter, setSectorFilter] = useState<'all' | SectorType>('all');
  const [modalityFilter, setModalityFilter] = useState<'all' | ModalityType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusScope>('submitted_and_approved');
  const [schoolIdFilter, setSchoolIdFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [includeMissingSchools, setIncludeMissingSchools] = useState<boolean>(false);

  // View controls
  const [activeTab, setActiveTab] = useState<ViewTab>('grades');
  const [chartDimension, setChartDimension] = useState<ChartDimension>('grade');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('enrollment_nv');

  const schoolById = useMemo(() => {
    const map = new Map<string, School>();
    for (const s of schools) map.set(s.id, s);
    return map;
  }, [schools]);

  const effectiveMonth: number =
    selectedMonth === 'all' ? defaultMonth : selectedMonth;

  // Report counts per month for selector hints
  const monthReportCounts = useMemo(() => {
    const counts: Record<number, number> = {};
    const list =
      source === 'parteMensual'
        ? parteMensualReports
        : source === 'monthly'
        ? monthlyReports
        : [];
    for (const r of list) {
      if (r.year === year) {
        counts[r.month] = (counts[r.month] || 0) + 1;
      }
    }
    return counts;
  }, [source, parteMensualReports, monthlyReports, year]);

  // Dynamic grade options according to selected level & básica cycle
  const availableGradeOptions = useMemo(() => {
    if (levelFilter === 'prebasica') {
      return GRADE_DEFS_ALL.filter((g) => g.level === 'prebasica');
    }
    if (levelFilter === 'basica') {
      if (basicaScopeFilter === 'c1_2') {
        const keys = new Set(BASICA_CYCLE_1_2.map((g) => g.key));
        return GRADE_DEFS_ALL.filter((g) => g.level === 'basica' && keys.has(g.key as never));
      }
      if (basicaScopeFilter === 'c3') {
        const keys = new Set(BASICA_CYCLE_3.map((g) => g.key));
        return GRADE_DEFS_ALL.filter((g) => g.level === 'basica' && keys.has(g.key as never));
      }
      return GRADE_DEFS_ALL.filter((g) => g.level === 'basica');
    }
    if (levelFilter === 'media') {
      return GRADE_DEFS_ALL.filter((g) => g.level === 'media');
    }
    return GRADE_DEFS_ALL;
  }, [levelFilter, basicaScopeFilter]);

  const availableCenterTypeOptions = useMemo(() => {
    return CENTER_TYPE_FILTER_OPTIONS.filter((opt) => {
      if (opt.value === 'all') return true;
      if (levelFilter === 'prebasica') return opt.value.startsWith('prebasica:');
      if (levelFilter === 'basica') {
        if (basicaScopeFilter === 'c3') return false;
        return opt.value.startsWith('basica:');
      }
      if (levelFilter === 'media') return false;
      return true;
    });
  }, [levelFilter, basicaScopeFilter]);

  // Does a school pass metadata filters?
  const schoolPassesMetaFilters = (s: School | undefined, targetLevel?: EducationLevel): boolean => {
    if (!s) return false;
    if (s.active === false) return false;

    if (districtFilter === 'unassigned') {
      if (s.district) return false;
    } else if (districtFilter !== 'all' && s.district !== districtFilter) {
      return false;
    }

    if (sectorFilter !== 'all' && s.sector !== sectorFilter) return false;
    if (modalityFilter !== 'all' && s.modality !== modalityFilter) return false;

    if (schoolIdFilter !== 'all' && s.id !== schoolIdFilter) return false;

    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery);
      const hay = normalizeText(`${s.name} ${s.saceCode} ${s.community}`);
      if (!hay.includes(q)) return false;
    }

    if (centerTypeFilter !== 'all') {
      if (!schoolMatchesCenterTypeFilter(s, centerTypeFilter)) return false;
      if (targetLevel) {
        if (centerTypeFilter.startsWith('prebasica:') && targetLevel !== 'prebasica') return false;
        if (centerTypeFilter.startsWith('basica:') && targetLevel !== 'basica') return false;
      }
    }

    if (targetLevel) {
      if (levelFilter !== 'all' && targetLevel !== levelFilter) return false;
      if (targetLevel === 'basica' && basicaScopeFilter !== 'all') {
        if (basicaScopeFilter === 'c1_2_3') {
          if (getBasicaScope(s) !== 'c1_2_3') return false;
        } else if (!schoolMatchesBasicaScope(s, basicaScopeFilter)) {
          return false;
        }
      }
      if ((levelFilter === 'all' || levelFilter === 'basica') && basicaScopeFilter !== 'all' && targetLevel !== 'basica') {
        return false;
      }
    } else {
      if (levelFilter !== 'all' && !s.levels.includes(levelFilter)) return false;
      if (levelFilter === 'basica' && basicaScopeFilter !== 'all') {
        if (basicaScopeFilter === 'c1_2_3') {
          if (getBasicaScope(s) !== 'c1_2_3') return false;
        } else if (!schoolMatchesBasicaScope(s, basicaScopeFilter)) {
          return false;
        }
      }
    }

    if (gradeFilter !== 'all') {
      const gradeLevel = getGradeLevelFromKey(gradeFilter);
      if (gradeLevel) {
        if (targetLevel && targetLevel !== gradeLevel) return false;
        if (!s.levels.includes(gradeLevel)) return false;
        if (gradeLevel === 'basica') {
          const validGrades = getBasicaGradesForScope(getBasicaScope(s));
          if (!validGrades.some((g) => g.key === gradeFilter)) return false;
        }
      }
    }

    return true;
  };

  // Filtered school dropdown options
  const matchingSchoolsForSelect = useMemo(() => {
    return schools
      .filter((s) => {
        if (s.active === false) return false;
        if (districtFilter === 'unassigned') {
          if (s.district) return false;
        } else if (districtFilter !== 'all' && s.district !== districtFilter) {
          return false;
        }
        if (sectorFilter !== 'all' && s.sector !== sectorFilter) return false;
        if (modalityFilter !== 'all' && s.modality !== modalityFilter) return false;
        if (levelFilter !== 'all' && !s.levels.includes(levelFilter)) return false;
        if (centerTypeFilter !== 'all' && !schoolMatchesCenterTypeFilter(s, centerTypeFilter)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [schools, districtFilter, sectorFilter, modalityFilter, levelFilter, centerTypeFilter]);

  const statusMatches = (status: ReportStatus): boolean => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'submitted_and_approved') {
      return status === 'submitted' || status === 'approved';
    }
    return status === statusFilter;
  };

  // Allowed grades inside a report given active filters
  const getAllowedGradesForReport = (
    level: EducationLevel,
    school?: School
  ): { key: string; label: string }[] => {
    let grades: { key: string; label: string }[] = [];
    if (level === 'prebasica') {
      grades = getParteMensualGrades('prebasica');
    } else if (level === 'basica') {
      const schoolScope = getBasicaScope(school);
      const effectiveScope: BasicaScope =
        basicaScopeFilter === 'c1_2'
          ? 'c1_2'
          : basicaScopeFilter === 'c3'
          ? 'c3'
          : schoolScope;
      grades = getBasicaGradesForScope(effectiveScope).map((g) => ({
        key: g.key,
        label: `${g.label} (${g.shortLabel})`,
      }));
    } else {
      grades = MEDIA_GRADES.map((g, i) => ({
        key: g.key,
        label: `${g.label} (${10 + i}°)`,
      }));
    }

    if (gradeFilter !== 'all') {
      grades = grades.filter((g) => g.key === gradeFilter);
    }
    return grades;
  };

  // Core aggregation across active source and filters
  const aggregation = useMemo(() => {
    const gradeMap = new Map<string, StatBucket>();
    for (const def of GRADE_DEFS_ALL) {
      gradeMap.set(
        def.key,
        emptyBucket(def.key, def.label, LEVEL_LABELS[def.level], def.level)
      );
    }

    const levelMap = new Map<EducationLevel, StatBucket>([
      ['prebasica', emptyBucket('prebasica', 'Prebásica', 'Nivel Prebásica', 'prebasica')],
      ['basica', emptyBucket('basica', 'Básica', 'Nivel Básica', 'basica')],
      ['media', emptyBucket('media', 'Media', 'Nivel Media', 'media')],
    ]);

    const centerTypeMap = new Map<string, StatBucket>();
    const schoolRows: SchoolStatRow[] = [];
    const nominalMovements: NominalMovementItem[] = [];

    // Expected active school-level pairs matching current filters
    const expectedPairs: { school: School; level: EducationLevel }[] = [];
    for (const s of schools) {
      const sLevels: EducationLevel[] = s.levels.length > 0 ? s.levels : ['basica'];
      for (const lvl of sLevels) {
        if (schoolPassesMetaFilters(s, lvl)) {
          expectedPairs.push({ school: s, level: lvl });
          const ct = resolveLevelCenterTypeBucket(lvl, s);
          if (!centerTypeMap.has(ct.key)) {
            centerTypeMap.set(ct.key, emptyBucket(ct.key, ct.label, LEVEL_LABELS[lvl], lvl));
          }
          centerTypeMap.get(ct.key)!.schoolsCount += 1;
          levelMap.get(lvl)!.schoolsCount += 1;
        }
      }
    }

    const reportedPairKeys = new Set<string>();

    if (source === 'parteMensual') {
      const subset = parteMensualReports.filter((r) => {
        if (r.year !== year) return false;
        if (r.month !== effectiveMonth) return false;
        if (!statusMatches(r.status)) return false;
        const sch = schoolById.get(r.schoolId);
        return schoolPassesMetaFilters(sch, r.level);
      });

      for (const rep of subset) {
        const sch = schoolById.get(rep.schoolId);
        const allowedGrades = getAllowedGradesForReport(rep.level, sch);
        if (allowedGrades.length === 0) continue;

        reportedPairKeys.add(`${rep.schoolId}_${rep.level}`);

        const ct = resolveLevelCenterTypeBucket(rep.level, sch);
        if (!centerTypeMap.has(ct.key)) {
          centerTypeMap.set(ct.key, emptyBucket(ct.key, ct.label, LEVEL_LABELS[rep.level], rep.level));
        }
        const ctBucket = centerTypeMap.get(ct.key)!;
        const lvlBucket = levelMap.get(rep.level)!;

        ctBucket.reportsCount += 1;
        lvlBucket.reportsCount += 1;

        const schRow: SchoolStatRow = {
          ...emptyBucket(
            `${rep.schoolId}_${rep.level}`,
            rep.schoolName,
            rep.saceCode,
            rep.level
          ),
          schoolId: rep.schoolId,
          saceCode: rep.saceCode,
          schoolName: rep.schoolName,
          community: sch?.community || rep.lugar || '',
          districtLabel: getDistrictLabel(sch?.district),
          levelLabel: getSchoolLevelLabel(rep.level, sch),
          centerTypeLabel: ct.label,
          sectorLabel: sch ? SECTOR_LABELS[sch.sector] : '—',
          modalityLabel: sch ? MODALITY_LABELS[sch.modality] : '—',
          status: rep.status,
          hasReport: true,
          reportMonth: rep.month,
          parteRef: rep,
          reportsCount: 1,
          schoolsCount: 1,
        };

        const dias = rep.diasTrabajados || 0;
        for (const g of allowedGrades) {
          const c = computeParteMensualRow(rep.rows?.[g.key], dias);
          const gBucket = gradeMap.get(g.key);
          const targets = [gBucket, ctBucket, lvlBucket, schRow];
          for (const t of targets) {
            if (!t) continue;
            t.matInicialN += c.matInicial.n;
            t.matInicialV += c.matInicial.v;
            t.ingresosN += c.ingresos.n;
            t.ingresosV += c.ingresos.v;
            t.trasladosN += c.traslados.n;
            t.trasladosV += c.traslados.v;
            t.desertoresN += c.desertores.n;
            t.desertoresV += c.desertores.v;
            t.matFinalN += c.matFinal.n;
            t.matFinalV += c.matFinal.v;
            t.asistenciaMediaSum += c.asistenciaMedia.t;
          }
          if (gBucket) {
            gBucket.reportsCount += 1;
          }
        }
        schoolRows.push(schRow);
      }
    } else if (source === 'annual') {
      const subset = annualReports.filter((r) => {
        if (r.year !== year) return false;
        if (!statusMatches(r.status)) return false;
        const sch = schoolById.get(r.schoolId);
        return schoolPassesMetaFilters(sch, r.level);
      });

      for (const rep of subset) {
        const sch = schoolById.get(rep.schoolId);
        const allowedGrades = getAllowedGradesForReport(rep.level, sch);
        if (allowedGrades.length === 0) continue;

        reportedPairKeys.add(`${rep.schoolId}_${rep.level}`);

        const ct = resolveLevelCenterTypeBucket(rep.level, sch);
        if (!centerTypeMap.has(ct.key)) {
          centerTypeMap.set(ct.key, emptyBucket(ct.key, ct.label, LEVEL_LABELS[rep.level], rep.level));
        }
        const ctBucket = centerTypeMap.get(ct.key)!;
        const lvlBucket = levelMap.get(rep.level)!;

        ctBucket.reportsCount += 1;
        lvlBucket.reportsCount += 1;

        const schRow: SchoolStatRow = {
          ...emptyBucket(
            `${rep.schoolId}_${rep.level}`,
            rep.schoolName,
            rep.saceCode,
            rep.level
          ),
          schoolId: rep.schoolId,
          saceCode: rep.saceCode,
          schoolName: rep.schoolName,
          community: sch?.community || rep.community || '',
          districtLabel: getDistrictLabel(sch?.district),
          levelLabel: getSchoolLevelLabel(rep.level, sch),
          centerTypeLabel: ct.label,
          sectorLabel: SECTOR_LABELS[sch?.sector || rep.sector],
          modalityLabel: MODALITY_LABELS[sch?.modality || rep.modality],
          status: rep.status,
          hasReport: true,
          annualRef: rep,
          reportsCount: 1,
          schoolsCount: 1,
        };

        const estMap: Record<string, {
          matInicial?: { n?: number; v?: number };
          ingresos?: { n?: number; v?: number };
          traslados?: { n?: number; v?: number };
          desertores?: { n?: number; v?: number };
          matFinal?: { n?: number; v?: number };
          aprobados?: { n?: number; v?: number };
          reprobados?: { n?: number; v?: number };
          egresados?: { n?: number; v?: number };
        }> =
          rep.level === 'prebasica'
            ? ((rep.data as PrebasicaAnnualData | undefined)?.estadisticoFinal || {})
            : rep.level === 'basica'
            ? ((rep.data as BasicaAnnualData | undefined)?.estadisticoFinal || {})
            : ((rep.data as MediaAnnualData | undefined)?.estadisticoFinal || {});

        for (const g of allowedGrades) {
          const r = estMap[g.key];
          const gBucket = gradeMap.get(g.key);
          const targets = [gBucket, ctBucket, lvlBucket, schRow];
          if (r) {
            for (const t of targets) {
              if (!t) continue;
              t.matInicialN += r.matInicial?.n || 0;
              t.matInicialV += r.matInicial?.v || 0;
              t.ingresosN += r.ingresos?.n || 0;
              t.ingresosV += r.ingresos?.v || 0;
              t.trasladosN += r.traslados?.n || 0;
              t.trasladosV += r.traslados?.v || 0;
              t.desertoresN += r.desertores?.n || 0;
              t.desertoresV += r.desertores?.v || 0;
              t.matFinalN += r.matFinal?.n || 0;
              t.matFinalV += r.matFinal?.v || 0;
              t.aprobadosN += r.aprobados?.n || 0;
              t.aprobadosV += r.aprobados?.v || 0;
              t.reprobadosN += r.reprobados?.n || 0;
              t.reprobadosV += r.reprobados?.v || 0;
              t.egresadosN += r.egresados?.n || 0;
              t.egresadosV += r.egresados?.v || 0;
            }
          }
          if (gBucket) {
            gBucket.reportsCount += 1;
          }
        }
        schoolRows.push(schRow);
      }
    } else {
      // Movimientos-SACE
      const subset = monthlyReports.filter((r) => {
        if (r.year !== year) return false;
        if (selectedMonth !== 'all' && r.month !== selectedMonth) return false;
        if (!statusMatches(r.status)) return false;
        const sch = schoolById.get(r.schoolId);
        return schoolPassesMetaFilters(sch, r.level);
      });

      const schoolAggMap = new Map<string, SchoolStatRow>();

      for (const rep of subset) {
        const sch = schoolById.get(rep.schoolId);
        reportedPairKeys.add(`${rep.schoolId}_${rep.level}`);

        const ct = resolveLevelCenterTypeBucket(rep.level, sch);
        if (!centerTypeMap.has(ct.key)) {
          centerTypeMap.set(ct.key, emptyBucket(ct.key, ct.label, LEVEL_LABELS[rep.level], rep.level));
        }
        const ctBucket = centerTypeMap.get(ct.key)!;
        const lvlBucket = levelMap.get(rep.level)!;

        ctBucket.reportsCount += 1;
        lvlBucket.reportsCount += 1;

        const pairKey = `${rep.schoolId}_${rep.level}`;
        if (!schoolAggMap.has(pairKey)) {
          schoolAggMap.set(pairKey, {
            ...emptyBucket(pairKey, rep.schoolName, rep.saceCode, rep.level),
            schoolId: rep.schoolId,
            saceCode: rep.saceCode,
            schoolName: rep.schoolName,
            community: sch?.community || '',
            districtLabel: getDistrictLabel(sch?.district),
            levelLabel: getSchoolLevelLabel(rep.level, sch),
            centerTypeLabel: ct.label,
            sectorLabel: sch ? SECTOR_LABELS[sch.sector] : '—',
            modalityLabel: sch ? MODALITY_LABELS[sch.modality] : '—',
            status: rep.status,
            hasReport: true,
            reportMonth: rep.month,
            monthlyRef: rep,
            reportsCount: 0,
            schoolsCount: 1,
          });
        }
        const schRow = schoolAggMap.get(pairKey)!;
        schRow.reportsCount += 1;
        schRow.status = rep.status;
        schRow.monthlyRef = rep;

        const processMovList = (
          list: MovementRow[] | undefined,
          kind: 'Ingreso' | 'Traslado' | 'Desertor'
        ) => {
          for (const row of list || []) {
            if (gradeFilter !== 'all' && !movementMatchesGrade(row.gradoSeccion, gradeFilter)) {
              continue;
            }
            nominalMovements.push({
              id: `${rep.id}_${kind}_${row.id}`,
              month: rep.month,
              schoolId: rep.schoolId,
              schoolName: rep.schoolName,
              saceCode: rep.saceCode,
              level: rep.level,
              tipo: kind,
              row,
            });
            const isF = row.sexo === 'F';
            const targets = [ctBucket, lvlBucket, schRow];

            // Also attribute to matching grade bucket if possible
            const allowedForLevel = getAllowedGradesForReport(rep.level, sch);
            const matchedGrade = allowedForLevel.find((g) =>
              movementMatchesGrade(row.gradoSeccion, g.key)
            );
            if (matchedGrade && gradeMap.has(matchedGrade.key)) {
              targets.push(gradeMap.get(matchedGrade.key)!);
            }

            for (const t of targets) {
              if (kind === 'Ingreso') {
                if (isF) t.ingresosN += 1;
                else t.ingresosV += 1;
              } else if (kind === 'Traslado') {
                if (isF) t.trasladosN += 1;
                else t.trasladosV += 1;
              } else {
                if (isF) t.desertoresN += 1;
                else t.desertoresV += 1;
              }
            }
          }
        };

        processMovList(rep.ingresos, 'Ingreso');
        processMovList(rep.traslados, 'Traslado');
        processMovList(rep.desertores, 'Desertor');
      }

      for (const row of schoolAggMap.values()) {
        schoolRows.push(row);
      }
    }

    // Add missing schools if toggled on
    const missingSchoolRows: SchoolStatRow[] = [];
    for (const { school, level } of expectedPairs) {
      const pairKey = `${school.id}_${level}`;
      if (!reportedPairKeys.has(pairKey)) {
        const ct = resolveLevelCenterTypeBucket(level, school);
        missingSchoolRows.push({
          ...emptyBucket(pairKey, school.name, school.saceCode, level),
          schoolId: school.id,
          saceCode: school.saceCode,
          schoolName: school.name,
          community: school.community,
          districtLabel: getDistrictLabel(school.district),
          levelLabel: getSchoolLevelLabel(level, school),
          centerTypeLabel: ct.label,
          sectorLabel: SECTOR_LABELS[school.sector],
          modalityLabel: MODALITY_LABELS[school.modality],
          hasReport: false,
          schoolsCount: 1,
        });
      }
    }

    const gradeRows = GRADE_DEFS_ALL.filter((def) => {
      if (levelFilter !== 'all' && def.level !== levelFilter) return false;
      if (centerTypeFilter.startsWith('prebasica:') && def.level !== 'prebasica') return false;
      if (centerTypeFilter.startsWith('basica:') && def.level !== 'basica') return false;
      if ((levelFilter === 'all' || levelFilter === 'basica') && basicaScopeFilter !== 'all') {
        if (def.level !== 'basica') return false;
        if (
          basicaScopeFilter === 'c1_2' &&
          !BASICA_CYCLE_1_2.some((g) => g.key === def.key)
        ) {
          return false;
        }
        if (
          basicaScopeFilter === 'c3' &&
          !BASICA_CYCLE_3.some((g) => g.key === def.key)
        ) {
          return false;
        }
      }
      if (gradeFilter !== 'all' && def.key !== gradeFilter) return false;
      const b = gradeMap.get(def.key)!;
      if (source === 'monthly') {
        return (
          b.ingresosN + b.ingresosV + b.trasladosN + b.trasladosV + b.desertoresN + b.desertoresV > 0 ||
          gradeFilter === def.key
        );
      }
      return b.reportsCount > 0 || gradeFilter === def.key;
    }).map((def) => gradeMap.get(def.key)!);

    const levelRows = Array.from(levelMap.values()).filter(
      (b) => b.schoolsCount > 0 || b.reportsCount > 0
    );

    const centerTypeRows = Array.from(centerTypeMap.values())
      .filter((b) => b.schoolsCount > 0 || b.reportsCount > 0)
      .sort((a, b) => {
        const ia = CENTER_TYPE_BUCKET_ORDER.indexOf(a.key);
        const ib = CENTER_TYPE_BUCKET_ORDER.indexOf(b.key);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      });

    schoolRows.sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'es'));
    missingSchoolRows.sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'es'));

    const allDisplaySchools = includeMissingSchools
      ? [...schoolRows, ...missingSchoolRows]
      : schoolRows;

    // Grand totals across the active level/centerType buckets
    const totals = emptyBucket('total', 'TOTAL');
    for (const r of centerTypeRows) {
      totals.schoolsCount += r.schoolsCount;
      totals.reportsCount += r.reportsCount;
      totals.matInicialN += r.matInicialN;
      totals.matInicialV += r.matInicialV;
      totals.ingresosN += r.ingresosN;
      totals.ingresosV += r.ingresosV;
      totals.trasladosN += r.trasladosN;
      totals.trasladosV += r.trasladosV;
      totals.desertoresN += r.desertoresN;
      totals.desertoresV += r.desertoresV;
      totals.matFinalN += r.matFinalN;
      totals.matFinalV += r.matFinalV;
      totals.asistenciaMediaSum += r.asistenciaMediaSum;
      totals.aprobadosN += r.aprobadosN;
      totals.aprobadosV += r.aprobadosV;
      totals.reprobadosN += r.reprobadosN;
      totals.reprobadosV += r.reprobadosV;
      totals.egresadosN += r.egresadosN;
      totals.egresadosV += r.egresadosV;
    }

    return {
      expectedCount: expectedPairs.length,
      reportedCount: schoolRows.length,
      missingCount: missingSchoolRows.length,
      gradeRows,
      levelRows,
      centerTypeRows,
      schoolRows: allDisplaySchools,
      nominalMovements,
      totals,
    };
  }, [
    schools,
    parteMensualReports,
    monthlyReports,
    annualReports,
    source,
    year,
    effectiveMonth,
    selectedMonth,
    levelFilter,
    basicaScopeFilter,
    gradeFilter,
    centerTypeFilter,
    districtFilter,
    sectorFilter,
    modalityFilter,
    statusFilter,
    schoolIdFilter,
    searchQuery,
    includeMissingSchools,
    schoolById,
  ]);

  // Chart series builder
  const chartSeries = useMemo(() => {
    const sourceRows =
      chartDimension === 'grade'
        ? aggregation.gradeRows.map((b) => ({
            ...b,
            chartName:
              GRADE_DEFS_ALL.find((g) => g.key === b.key)?.shortLabel || b.label,
          }))
        : chartDimension === 'level'
        ? aggregation.levelRows.map((b) => ({ ...b, chartName: b.label }))
        : aggregation.centerTypeRows.map((b) => ({
            ...b,
            chartName: b.label
              .replace('Prebásica · ', 'Preb. ')
              .replace('Básica (1° a 6°) · ', 'Bás 1-6° ')
              .replace('Básica (1° a 9°) · I, II y III Ciclo', 'Bás 1-9°')
              .replace('Básica (7° a 9°) · III Ciclo', 'Bás 7-9°')
              .replace('Media (10° a 12°)', 'Media'),
          }));

    return sourceRows.map((r) => ({
      name: r.chartName,
      fullName: r.label,
      ninas: r.matFinalN,
      varones: r.matFinalV,
      totalMat: r.matFinalN + r.matFinalV,
      ingresos: r.ingresosN + r.ingresosV,
      traslados: r.trasladosN + r.trasladosV,
      desertores: r.desertoresN + r.desertoresV,
      aprobados: r.aprobadosN + r.aprobadosV,
      reprobados: r.reprobadosN + r.reprobadosV,
      reportsCount: r.reportsCount,
    }));
  }, [aggregation, chartDimension]);

  const hasCustomFilters =
    levelFilter !== 'all' ||
    basicaScopeFilter !== 'all' ||
    gradeFilter !== 'all' ||
    centerTypeFilter !== 'all' ||
    districtFilter !== 'all' ||
    sectorFilter !== 'all' ||
    modalityFilter !== 'all' ||
    statusFilter !== 'submitted_and_approved' ||
    schoolIdFilter !== 'all' ||
    searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setLevelFilter('all');
    setBasicaScopeFilter('all');
    setGradeFilter('all');
    setCenterTypeFilter('all');
    setDistrictFilter('all');
    setSectorFilter('all');
    setModalityFilter('all');
    setStatusFilter('submitted_and_approved');
    setSchoolIdFilter('all');
    setSearchQuery('');
  };

  const activePeriodLabel =
    source === 'annual'
      ? `Año ${year}`
      : source === 'monthly' && selectedMonth === 'all'
      ? `Todo el año ${year}`
      : `${MONTHS.find((m) => m.value === effectiveMonth)?.label || effectiveMonth} ${year}`;

  const activeSourceLabel =
    source === 'parteMensual'
      ? 'Parte Mensual'
      : source === 'annual'
      ? 'Cuadro Estadístico Anual'
      : 'Movimientos-SACE';

  const filterSummaryParts: string[] = [
    levelFilter === 'all' ? 'Todos los niveles' : `Nivel: ${LEVEL_LABELS[levelFilter]}`,
  ];
  if (basicaScopeFilter !== 'all') {
    filterSummaryParts.push(`Básica: ${BASICA_SCOPE_SHORT_LABELS[basicaScopeFilter]}`);
  }
  if (gradeFilter !== 'all') {
    const gLabel = GRADE_DEFS_ALL.find((g) => g.key === gradeFilter)?.label || gradeFilter;
    filterSummaryParts.push(`Grado: ${gLabel}`);
  }
  if (centerTypeFilter !== 'all') {
    filterSummaryParts.push(`Tipo: ${getCenterTypeFilterLabel(centerTypeFilter)}`);
  }
  if (districtFilter !== 'all') {
    filterSummaryParts.push(
      districtFilter === 'unassigned' ? 'Sin distrito' : getDistrictLabel(districtFilter)
    );
  }
  if (sectorFilter !== 'all') filterSummaryParts.push(`Sector: ${SECTOR_LABELS[sectorFilter]}`);
  if (modalityFilter !== 'all') {
    filterSummaryParts.push(`Modalidad: ${MODALITY_LABELS[modalityFilter]}`);
  }
  if (schoolIdFilter !== 'all') {
    filterSummaryParts.push(`Centro: ${schoolById.get(schoolIdFilter)?.name || schoolIdFilter}`);
  }

  const handleExportExcel = () => {
    const mapBucketToExcel = (b: StatBucket, secondary?: string, third?: string): StatisticalExplorerExcelRow => ({
      label: b.label,
      secondaryLabel: secondary,
      thirdLabel: third,
      schoolsCount: b.schoolsCount,
      reportsCount: b.reportsCount,
      matInicialN: b.matInicialN,
      matInicialV: b.matInicialV,
      ingresosN: b.ingresosN,
      ingresosV: b.ingresosV,
      trasladosN: b.trasladosN,
      trasladosV: b.trasladosV,
      desertoresN: b.desertoresN,
      desertoresV: b.desertoresV,
      matFinalN: b.matFinalN,
      matFinalV: b.matFinalV,
      aprobadosN: b.aprobadosN,
      aprobadosV: b.aprobadosV,
      reprobadosN: b.reprobadosN,
      reprobadosV: b.reprobadosV,
      egresadosN: b.egresadosN,
      egresadosV: b.egresadosV,
      ratePct: getBucketRatePct(b, source),
    });

    exportStatisticalExplorerExcel({
      year,
      sourceLabel: activeSourceLabel,
      periodLabel: activePeriodLabel,
      filterSummary: filterSummaryParts.join(' · '),
      includeAnnualOutcomeCols: source === 'annual',
      rateColumnLabel:
        source === 'parteMensual'
          ? '% Asistencia'
          : source === 'annual'
          ? '% Aprobación'
          : 'Total Mov.',
      gradeRows: aggregation.gradeRows.map((g) => mapBucketToExcel(g, g.subLabel)),
      centerTypeRows: aggregation.centerTypeRows.map((c) => mapBucketToExcel(c)),
      schoolRows: aggregation.schoolRows
        .filter((s) => s.hasReport)
        .map((s) => mapBucketToExcel(s, s.saceCode, s.centerTypeLabel)),
    });
  };

  const totalMatFinal = aggregation.totals.matFinalN + aggregation.totals.matFinalV;
  const totalIngresos = aggregation.totals.ingresosN + aggregation.totals.ingresosV;
  const totalTraslados = aggregation.totals.trasladosN + aggregation.totals.trasladosV;
  const totalDesertores = aggregation.totals.desertoresN + aggregation.totals.desertoresV;
  const totalMovimientos = totalIngresos + totalTraslados + totalDesertores;
  const totalAprobados = aggregation.totals.aprobadosN + aggregation.totals.aprobadosV;
  const totalReprobados = aggregation.totals.reprobadosN + aggregation.totals.reprobadosV;
  const totalEgresados = aggregation.totals.egresadosN + aggregation.totals.egresadosV;
  const overallRatePct = getBucketRatePct(aggregation.totals, source);

  return (
    <div className="space-y-6">
      {/* Header + Filter Matrix */}
      <section className="bg-white border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-display text-base font-bold text-slate-900 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-700 shrink-0" />
              Explorador de Reportes Estadísticos ({year})
            </h1>
            <p className="text-xs text-slate-600">
              Consulta y filtra las estadísticas distritales por nivel educativo, ciclo, grado, tipo de centro, distrito, sector, modalidad y estado de envío.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {hasCustomFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Restablecer filtros
              </button>
            )}
            <button
              type="button"
              onClick={handleExportExcel}
              disabled={aggregation.reportedCount === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar Excel (.xlsx)
            </button>
          </div>
        </div>

        {/* Source Selector + Period */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => {
                setSource('parteMensual');
                if (selectedMonth === 'all') setSelectedMonth(defaultMonth);
                if (activeTab === 'movements') setActiveTab('grades');
                if (chartMetric === 'outcomes') setChartMetric('enrollment_nv');
              }}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                source === 'parteMensual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Parte Mensual
            </button>
            <button
              type="button"
              onClick={() => {
                setSource('annual');
                if (activeTab === 'movements') setActiveTab('grades');
              }}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                source === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cuadros Anuales
            </button>
            <button
              type="button"
              onClick={() => {
                setSource('monthly');
                setChartMetric('movements');
              }}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                source === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Movimientos-SACE
            </button>
          </div>

          <div className="text-xs text-slate-500">
            <span>{activeSourceLabel}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-medium text-slate-700">{activePeriodLabel}</span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums text-slate-700">
              {aggregation.reportedCount}/{aggregation.expectedCount} entregas incluidas
            </span>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 text-xs pt-2 border-t border-slate-100">
          {source !== 'annual' && (
            <div>
              <label htmlFor="stat-filter-month" className="block font-medium text-slate-700 mb-1">
                Mes evaluado
              </label>
              <select
                id="stat-filter-month"
                value={source === 'parteMensual' ? effectiveMonth : selectedMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedMonth(val === 'all' ? 'all' : Number(val));
                }}
                className="w-full px-2.5 py-2 border border-slate-300 bg-white"
              >
                {source === 'monthly' && (
                  <option value="all">
                    Todos los meses ({monthlyReports.filter((r) => r.year === year).length})
                  </option>
                )}
                {MONTHS.map((m) => {
                  const cnt = monthReportCounts[m.value] || 0;
                  return (
                    <option key={m.value} value={m.value}>
                      {m.label} ({cnt})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="stat-filter-level" className="block font-medium text-slate-700 mb-1">
              Nivel educativo
            </label>
            <select
              id="stat-filter-level"
              value={levelFilter}
              onChange={(e) => {
                const nextLevel = e.target.value as 'all' | EducationLevel;
                setLevelFilter(nextLevel);
                if (nextLevel !== 'basica' && nextLevel !== 'all') {
                  setBasicaScopeFilter('all');
                }
                if (nextLevel === 'media' && centerTypeFilter !== 'all') {
                  setCenterTypeFilter('all');
                } else if (
                  nextLevel === 'prebasica' &&
                  centerTypeFilter.startsWith('basica:')
                ) {
                  setCenterTypeFilter('all');
                } else if (
                  nextLevel === 'basica' &&
                  centerTypeFilter.startsWith('prebasica:')
                ) {
                  setCenterTypeFilter('all');
                }
                if (gradeFilter !== 'all') {
                  const gradeLvl = getGradeLevelFromKey(gradeFilter);
                  if (nextLevel !== 'all' && gradeLvl !== nextLevel) {
                    setGradeFilter('all');
                  }
                }
                setSchoolIdFilter('all');
              }}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todos los niveles</option>
              <option value="prebasica">Prebásica</option>
              <option value="basica">Básica</option>
              <option value="media">Media</option>
            </select>
          </div>

          {(levelFilter === 'all' || levelFilter === 'basica') && (
            <div>
              <label htmlFor="stat-filter-scope" className="block font-medium text-slate-700 mb-1">
                Ciclo de Básica
              </label>
              <select
                id="stat-filter-scope"
                value={basicaScopeFilter}
                onChange={(e) => {
                  const nextScope = e.target.value as 'all' | BasicaScope;
                  setBasicaScopeFilter(nextScope);
                  if (nextScope === 'c3' && centerTypeFilter.startsWith('basica:')) {
                    setCenterTypeFilter('all');
                  }
                  if (gradeFilter !== 'all') {
                    if (
                      nextScope === 'c1_2' &&
                      !BASICA_CYCLE_1_2.some((g) => g.key === gradeFilter)
                    ) {
                      setGradeFilter('all');
                    } else if (
                      nextScope === 'c3' &&
                      !BASICA_CYCLE_3.some((g) => g.key === gradeFilter)
                    ) {
                      setGradeFilter('all');
                    }
                  }
                  setSchoolIdFilter('all');
                }}
                className="w-full px-2.5 py-2 border border-slate-300 bg-white"
              >
                <option value="all">Todos los ciclos</option>
                <option value="c1_2">I y II Ciclo (1° a 6°)</option>
                <option value="c3">III Ciclo (7° a 9°)</option>
                <option value="c1_2_3">Completos (1° a 9°)</option>
              </select>
            </div>
          )}

          <div>
            <label htmlFor="stat-filter-grade" className="block font-medium text-slate-700 mb-1">
              Grado específico
            </label>
            <select
              id="stat-filter-grade"
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todos los grados</option>
              {levelFilter === 'all' ? (
                <>
                  <optgroup label="Prebásica">
                    {availableGradeOptions
                      .filter((g) => g.level === 'prebasica')
                      .map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Básica">
                    {availableGradeOptions
                      .filter((g) => g.level === 'basica')
                      .map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Media">
                    {availableGradeOptions
                      .filter((g) => g.level === 'media')
                      .map((g) => (
                        <option key={g.key} value={g.key}>
                          {g.label}
                        </option>
                      ))}
                  </optgroup>
                </>
              ) : (
                availableGradeOptions.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-ctype" className="block font-medium text-slate-700 mb-1">
              Tipo de centro
            </label>
            <select
              id="stat-filter-ctype"
              value={centerTypeFilter}
              onChange={(e) => {
                const nextType = e.target.value as CenterTypeFilter;
                setCenterTypeFilter(nextType);
                if (nextType.startsWith('prebasica:') && levelFilter === 'basica') {
                  setLevelFilter('all');
                }
                if (nextType.startsWith('basica:') && levelFilter === 'prebasica') {
                  setLevelFilter('all');
                }
                setSchoolIdFilter('all');
              }}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              {availableCenterTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-district" className="block font-medium text-slate-700 mb-1">
              Distrito
            </label>
            <select
              id="stat-filter-district"
              value={districtFilter}
              onChange={(e) => {
                setDistrictFilter(e.target.value as 'all' | DistrictCode | 'unassigned');
                setSchoolIdFilter('all');
              }}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todos los distritos</option>
              {DISTRICT_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
              <option value="unassigned">Sin distrito asignado</option>
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-sector" className="block font-medium text-slate-700 mb-1">
              Sector
            </label>
            <select
              id="stat-filter-sector"
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value as 'all' | SectorType);
                setSchoolIdFilter('all');
              }}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todos los sectores</option>
              <option value="gubernamental">Gubernamental</option>
              <option value="no_gubernamental">No Gubernamental</option>
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-modality" className="block font-medium text-slate-700 mb-1">
              Modalidad
            </label>
            <select
              id="stat-filter-modality"
              value={modalityFilter}
              onChange={(e) => {
                setModalityFilter(e.target.value as 'all' | ModalityType);
                setSchoolIdFilter('all');
              }}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todas las modalidades</option>
              <option value="presencial">Presencial</option>
              <option value="isemed">ISEMED</option>
              <option value="acelerado">Acelerado</option>
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-status" className="block font-medium text-slate-700 mb-1">
              Estado del reporte
            </label>
            <select
              id="stat-filter-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusScope)}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="submitted_and_approved">Enviados y Aprobados</option>
              <option value="approved">Solo Aprobados</option>
              <option value="submitted">En revisión</option>
              <option value="returned">Devueltos</option>
              <option value="draft">Borradores</option>
              <option value="all">Todos los estados</option>
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-school" className="block font-medium text-slate-700 mb-1">
              Centro educativo
            </label>
            <select
              id="stat-filter-school"
              value={schoolIdFilter}
              onChange={(e) => setSchoolIdFilter(e.target.value)}
              className="w-full px-2.5 py-2 border border-slate-300 bg-white"
            >
              <option value="all">Todos ({matchingSchoolsForSelect.length})</option>
              {matchingSchoolsForSelect.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.saceCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stat-filter-search" className="block font-medium text-slate-700 mb-1">
              Buscar centro / SACE
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                id="stat-filter-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre, SACE o comunidad..."
                className="w-full pl-8 pr-3 py-2 border border-slate-300 bg-white"
              />
            </div>
          </div>
        </div>

        {/* Clean unboxed active filter summary */}
        <p className="text-[11px] text-slate-500 pt-1">
          Vista activa: {filterSummaryParts.join(' · ')}
        </p>
      </section>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Reportes en la consulta</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {aggregation.reportedCount}
            <span className="text-sm font-normal text-slate-400 ml-1">
              / {aggregation.expectedCount}
            </span>
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {aggregation.expectedCount > 0
              ? `${Math.round((aggregation.reportedCount / aggregation.expectedCount) * 100)}% cobertura`
              : 'Sin centros coincidentes'}
            {aggregation.missingCount > 0 ? ` · ${aggregation.missingCount} sin envío` : ''}
          </p>
        </div>

        {source === 'monthly' ? (
          <div className="bg-white border border-slate-200 p-5 space-y-1">
            <p className="text-xs text-slate-500">Total Movimientos-SACE</p>
            <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {totalMovimientos.toLocaleString('es-HN')}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {aggregation.nominalMovements.filter((m) => m.row.sexo === 'F').length} F ·{' '}
              {aggregation.nominalMovements.filter((m) => m.row.sexo === 'M').length} M
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 p-5 space-y-1">
            <p className="text-xs text-slate-500">
              {levelFilter === 'prebasica' ? 'Matrícula Actual / Final' : 'Matrícula Final'}
            </p>
            <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
              {totalMatFinal.toLocaleString('es-HN')}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums">
              {aggregation.totals.matFinalN.toLocaleString('es-HN')} niñas ·{' '}
              {aggregation.totals.matFinalV.toLocaleString('es-HN')} varones
            </p>
          </div>
        )}

        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">Movimientos Estadísticos</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            +{totalIngresos.toLocaleString('es-HN')}
            <span className="text-sm font-normal text-slate-500 ml-2">
              -{ (totalTraslados + totalDesertores).toLocaleString('es-HN') }
            </span>
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {totalIngresos} ing. · {totalTraslados} trasl. · {totalDesertores} des.
          </p>
        </div>

        <div className="bg-white border border-slate-200 p-5 space-y-1">
          <p className="text-xs text-slate-500">
            {source === 'parteMensual'
              ? 'Asistencia Media (%)'
              : source === 'annual'
              ? 'Tasa de Aprobación Anual'
              : 'Centros sin Movimientos'}
          </p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {source === 'monthly'
              ? aggregation.schoolRows.filter((s) => s.monthlyRef?.noMovements).length
              : `${overallRatePct.toFixed(1)}%`}
          </p>
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            {source === 'parteMensual'
              ? `Asist. media: ${aggregation.totals.asistenciaMediaSum.toFixed(1)}`
              : source === 'annual'
              ? `${totalAprobados.toLocaleString('es-HN')} aprob. · ${totalReprobados.toLocaleString('es-HN')} reprob. · ${totalEgresados.toLocaleString('es-HN')} egr.`
              : `${aggregation.nominalMovements.length} registros nominales`}
          </p>
        </div>
      </div>

      {/* Interactive Chart Section */}
      <section className="bg-white border border-slate-200">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-700" />
              Comparativo Gráfico ({activeSourceLabel} · {activePeriodLabel})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 p-1 bg-slate-100">
              <button
                type="button"
                onClick={() => setChartDimension('grade')}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  chartDimension === 'grade'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Grado
              </button>
              <button
                type="button"
                onClick={() => setChartDimension('level')}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  chartDimension === 'level'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Nivel
              </button>
              <button
                type="button"
                onClick={() => setChartDimension('centerType')}
                className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  chartDimension === 'centerType'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Por Tipo de Centro
              </button>
            </div>

            {source !== 'monthly' && (
              <div className="flex items-center gap-1 p-1 bg-slate-100">
                <button
                  type="button"
                  onClick={() => setChartMetric('enrollment_nv')}
                  className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                    chartMetric === 'enrollment_nv'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Matrícula (N / V)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetric('movements')}
                  className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                    chartMetric === 'movements'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Movimientos
                </button>
                {source === 'annual' && (
                  <button
                    type="button"
                    onClick={() => setChartMetric('outcomes')}
                    className={`px-2.5 py-1 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                      chartMetric === 'outcomes'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Aprob. / Reprob.
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-5">
          {chartSeries.length === 0 ? (
            <div className="h-[240px] flex flex-col items-center justify-center text-center bg-slate-50 border border-dashed border-slate-200 px-4 space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                No hay datos para graficar con los filtros actuales
              </p>
              <p className="text-xs text-slate-500">
                Prueba seleccionando otro mes, ampliando el estado del reporte o restableciendo los filtros.
              </p>
            </div>
          ) : (
            <div className="w-full h-[290px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartSeries}
                  margin={{ top: 10, right: 16, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    width={46}
                  />
                  <Tooltip
                    content={
                      <StatChartTooltip
                        source={source}
                        metric={source === 'monthly' ? 'movements' : chartMetric}
                      />
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} iconType="square" />
                  {source === 'monthly' || chartMetric === 'movements' ? (
                    <>
                      <Bar dataKey="ingresos" name="Ingresos" fill="#16a34a" maxBarSize={38} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="traslados" name="Traslados" fill="#d97706" maxBarSize={38} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="desertores" name="Desertores" fill="#dc2626" maxBarSize={38} radius={[2, 2, 0, 0]} />
                    </>
                  ) : chartMetric === 'outcomes' && source === 'annual' ? (
                    <>
                      <Bar dataKey="aprobados" name="Aprobados" fill="#16a34a" maxBarSize={42} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="reprobados" name="Reprobados" fill="#dc2626" maxBarSize={42} radius={[2, 2, 0, 0]} />
                    </>
                  ) : (
                    <>
                      <Bar dataKey="ninas" name="Niñas (N)" fill="#db2777" maxBarSize={42} radius={[2, 2, 0, 0]} />
                      <Bar dataKey="varones" name="Varones (V)" fill="#2563eb" maxBarSize={42} radius={[2, 2, 0, 0]} />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Detailed Statistical Tables */}
      <section className="bg-white border border-slate-200">
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab('grades')}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'grades'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Desglose por Grado ({aggregation.gradeRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('levels_types')}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'levels_types'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Nivel y Tipo de Centro ({aggregation.centerTypeRows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('schools')}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'schools'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Por Centro Educativo ({aggregation.schoolRows.length})
            </button>
            {source === 'monthly' && (
              <button
                type="button"
                onClick={() => setActiveTab('movements')}
                className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'movements'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Listado Nominal ({aggregation.nominalMovements.length})
              </button>
            )}
          </div>

          {activeTab === 'schools' && aggregation.missingCount > 0 && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMissingSchools}
                onChange={(e) => setIncludeMissingSchools(e.target.checked)}
              />
              Incluir centros sin reporte ({aggregation.missingCount})
            </label>
          )}
        </div>

        {/* TAB 1: BY GRADE */}
        {activeTab === 'grades' && (
          <div className="overflow-x-auto matrix-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="px-4 py-2.5 text-left font-semibold">Grado</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Nivel</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Rep.</th>
                  {source !== 'monthly' && (
                    <th className="px-3 py-2.5 text-right font-semibold">Mat. Inicial (N / V / T)</th>
                  )}
                  <th className="px-3 py-2.5 text-right font-semibold">Ingresos</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Traslados</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Desertores</th>
                  {source !== 'monthly' && (
                    <>
                      <th className="px-3 py-2.5 text-right font-semibold">Mat. Final N</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Mat. Final V</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Mat. Final T</th>
                    </>
                  )}
                  {source === 'annual' && (
                    <>
                      <th className="px-3 py-2.5 text-right font-semibold">Aprobados</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Reprobados</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Egresados</th>
                    </>
                  )}
                  <th className="px-4 py-2.5 text-right font-semibold">
                    {source === 'parteMensual'
                      ? '% Asist.'
                      : source === 'annual'
                      ? '% Aprob.'
                      : 'Total Mov.'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregation.gradeRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
                      No hay registros por grado para la combinación de filtros aplicada.
                    </td>
                  </tr>
                ) : (
                  <>
                    {aggregation.gradeRows.map((g) => {
                      const matInitT = g.matInicialN + g.matInicialV;
                      const matFinT = g.matFinalN + g.matFinalV;
                      const ingT = g.ingresosN + g.ingresosV;
                      const trasT = g.trasladosN + g.trasladosV;
                      const desT = g.desertoresN + g.desertoresV;
                      const aprobT = g.aprobadosN + g.aprobadosV;
                      const reprobT = g.reprobadosN + g.reprobadosV;
                      const egrT = g.egresadosN + g.egresadosV;
                      const rate = getBucketRatePct(g, source);

                      return (
                        <tr key={g.key} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                            {g.label}
                          </td>
                          <td className="px-3 py-2.5 text-slate-600">{g.subLabel}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {g.reportsCount}
                          </td>
                          {source !== 'monthly' && (
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                              {g.matInicialN} / {g.matInicialV} / <strong>{matInitT}</strong>
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                            {ingT}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-700">
                            {trasT}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-700">
                            {desT}
                          </td>
                          {source !== 'monthly' && (
                            <>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {g.matFinalN.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {g.matFinalV.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                                {matFinT.toLocaleString('es-HN')}
                              </td>
                            </>
                          )}
                          {source === 'annual' && (
                            <>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                                {aprobT.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-700">
                                {reprobT.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {egrT.toLocaleString('es-HN')}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                            {source === 'monthly'
                              ? (ingT + trasT + desT).toLocaleString('es-HN')
                              : `${rate.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-50/70 border-t-2 border-slate-300 font-semibold">
                      <td className="px-4 py-2.5 text-slate-900">TOTAL FILTRADO</td>
                      <td className="px-3 py-2.5 text-slate-500">—</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                        {aggregation.reportedCount}
                      </td>
                      {source !== 'monthly' && (
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                          {aggregation.totals.matInicialN} / {aggregation.totals.matInicialV} /{' '}
                          {aggregation.totals.matInicialN + aggregation.totals.matInicialV}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-800">
                        {totalIngresos}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-800">
                        {totalTraslados}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-800">
                        {totalDesertores}
                      </td>
                      {source !== 'monthly' && (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {aggregation.totals.matFinalN.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {aggregation.totals.matFinalV.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                            {totalMatFinal.toLocaleString('es-HN')}
                          </td>
                        </>
                      )}
                      {source === 'annual' && (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-800">
                            {totalAprobados.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-800">
                            {totalReprobados.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {totalEgresados.toLocaleString('es-HN')}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                        {source === 'monthly'
                          ? totalMovimientos.toLocaleString('es-HN')
                          : `${overallRatePct.toFixed(1)}%`}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: BY LEVEL & CENTER TYPE */}
        {activeTab === 'levels_types' && (
          <div className="overflow-x-auto matrix-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="px-4 py-2.5 text-left font-semibold">Nivel y Tipo de Centro</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Centros</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Reportes</th>
                  {source !== 'monthly' && (
                    <th className="px-3 py-2.5 text-right font-semibold">Mat. Inicial</th>
                  )}
                  <th className="px-3 py-2.5 text-right font-semibold">Ingresos</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Traslados</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Desertores</th>
                  {source !== 'monthly' && (
                    <>
                      <th className="px-3 py-2.5 text-right font-semibold">Mat. Final N</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Mat. Final V</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Mat. Final T</th>
                    </>
                  )}
                  {source === 'annual' && (
                    <>
                      <th className="px-3 py-2.5 text-right font-semibold">Aprobados</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Reprobados</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Egresados</th>
                    </>
                  )}
                  <th className="px-4 py-2.5 text-right font-semibold">
                    {source === 'parteMensual'
                      ? '% Asist.'
                      : source === 'annual'
                      ? '% Aprob.'
                      : 'Total Mov.'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregation.centerTypeRows.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
                      No hay centros ni reportes que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  <>
                    {aggregation.centerTypeRows.map((ct) => {
                      const matInitT = ct.matInicialN + ct.matInicialV;
                      const matFinT = ct.matFinalN + ct.matFinalV;
                      const ingT = ct.ingresosN + ct.ingresosV;
                      const trasT = ct.trasladosN + ct.trasladosV;
                      const desT = ct.desertoresN + ct.desertoresV;
                      const aprobT = ct.aprobadosN + ct.aprobadosV;
                      const reprobT = ct.reprobadosN + ct.reprobadosV;
                      const egrT = ct.egresadosN + ct.egresadosV;
                      const rate = getBucketRatePct(ct, source);

                      return (
                        <tr key={ct.key} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                            {ct.label}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                            {ct.schoolsCount}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                            {ct.reportsCount}
                          </td>
                          {source !== 'monthly' && (
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                              {matInitT.toLocaleString('es-HN')}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                            {ingT}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-700">
                            {trasT}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-700">
                            {desT}
                          </td>
                          {source !== 'monthly' && (
                            <>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {ct.matFinalN.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {ct.matFinalV.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                                {matFinT.toLocaleString('es-HN')}
                              </td>
                            </>
                          )}
                          {source === 'annual' && (
                            <>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-700">
                                {aprobT.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-700">
                                {reprobT.toLocaleString('es-HN')}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700">
                                {egrT.toLocaleString('es-HN')}
                              </td>
                            </>
                          )}
                          <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                            {source === 'monthly'
                              ? (ingT + trasT + desT).toLocaleString('es-HN')
                              : `${rate.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-amber-50/70 border-t-2 border-slate-300 font-semibold">
                      <td className="px-4 py-2.5 text-slate-900">TOTAL DISTRITAL FILTRADO</td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                        {aggregation.expectedCount}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                        {aggregation.reportedCount}
                      </td>
                      {source !== 'monthly' && (
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                          {(
                            aggregation.totals.matInicialN + aggregation.totals.matInicialV
                          ).toLocaleString('es-HN')}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-800">
                        {totalIngresos}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-amber-800">
                        {totalTraslados}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-800">
                        {totalDesertores}
                      </td>
                      {source !== 'monthly' && (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {aggregation.totals.matFinalN.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {aggregation.totals.matFinalV.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                            {totalMatFinal.toLocaleString('es-HN')}
                          </td>
                        </>
                      )}
                      {source === 'annual' && (
                        <>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-800">
                            {totalAprobados.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-red-800">
                            {totalReprobados.toLocaleString('es-HN')}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-900">
                            {totalEgresados.toLocaleString('es-HN')}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-slate-900">
                        {source === 'monthly'
                          ? totalMovimientos.toLocaleString('es-HN')
                          : `${overallRatePct.toFixed(1)}%`}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: BY SCHOOL */}
        {activeTab === 'schools' && (
          <div className="overflow-x-auto matrix-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="px-4 py-2.5 text-left font-semibold">Código SACE</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Centro Educativo</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Nivel / Tipo de Centro</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Distrito · Sector</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Estado</th>
                  {source !== 'monthly' && (
                    <th className="px-3 py-2.5 text-right font-semibold">Mat. Final (N / V / T)</th>
                  )}
                  <th className="px-3 py-2.5 text-right font-semibold">Ing. / Tras. / Des.</th>
                  <th className="px-3 py-2.5 text-right font-semibold">
                    {source === 'parteMensual'
                      ? '% Asist.'
                      : source === 'annual'
                      ? '% Aprob.'
                      : 'Total Mov.'}
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregation.schoolRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No hay centros educativos con reportes para los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  aggregation.schoolRows.map((row) => {
                    const matFinT = row.matFinalN + row.matFinalV;
                    const ingT = row.ingresosN + row.ingresosV;
                    const trasT = row.trasladosN + row.trasladosV;
                    const desT = row.desertoresN + row.desertoresV;
                    const rate = getBucketRatePct(row, source);
                    const sch = schoolById.get(row.schoolId);
                    const typeSummary = sch ? getSchoolCenterTypesSummary(sch) : '';

                    return (
                      <tr key={row.key} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          {row.saceCode}
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-900">{row.schoolName}</p>
                          <p className="text-[11px] text-slate-500">
                            {row.community || 'Omoa'}
                            {typeSummary ? ` · ${typeSummary}` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">
                          <p>{row.levelLabel}</p>
                          <p className="text-[11px] text-slate-500">{row.centerTypeLabel}</p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {row.districtLabel} · {row.sectorLabel}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.hasReport && row.status ? (
                            <StatusText status={row.status} />
                          ) : (
                            <span className="text-slate-400">Sin reporte</span>
                          )}
                        </td>
                        {source !== 'monthly' && (
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-800 whitespace-nowrap">
                            {row.hasReport ? (
                              <>
                                {row.matFinalN} / {row.matFinalV} / <strong>{matFinT}</strong>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {row.hasReport ? `${ingT} / ${trasT} / ${desT}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900">
                          {!row.hasReport
                            ? '—'
                            : source === 'monthly'
                            ? ingT + trasT + desT
                            : `${rate.toFixed(1)}%`}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.hasReport ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (source === 'parteMensual' && row.parteRef) {
                                  onInspectParteMensual?.(row.parteRef);
                                } else if (source === 'annual' && row.annualRef) {
                                  onInspectAnnual?.(row.annualRef);
                                } else if (source === 'monthly' && row.monthlyRef) {
                                  onInspectMonthly?.(row.monthlyRef);
                                }
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Inspeccionar
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Pendiente</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: NOMINAL MOVEMENTS (Movimientos-SACE only) */}
        {activeTab === 'movements' && source === 'monthly' && (
          <div className="overflow-x-auto matrix-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700">
                  <th className="px-4 py-2.5 text-left font-semibold">Mes</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Centro Educativo</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Nivel</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Grado / Sección</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Estudiante</th>
                  <th className="px-3 py-2.5 text-left font-semibold">RNE</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Sexo</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Acción / Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {aggregation.nominalMovements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                      No hay movimientos nominales registrados con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  aggregation.nominalMovements.slice(0, 250).map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">
                        {MONTHS.find((m) => m.value === item.month)?.label || item.month}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-900">{item.schoolName}</p>
                        <p className="text-[11px] font-mono text-slate-500">{item.saceCode}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{LEVEL_LABELS[item.level]}</td>
                      <td
                        className={`px-3 py-2.5 font-semibold ${
                          item.tipo === 'Ingreso'
                            ? 'text-emerald-700'
                            : item.tipo === 'Traslado'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {item.tipo}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{item.row.gradoSeccion || '—'}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {item.row.nombre || '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-600">{item.row.rne || '—'}</td>
                      <td className="px-3 py-2.5 text-center font-mono">{item.row.sexo}</td>
                      <td className="px-4 py-2.5 text-slate-600">{item.row.accion || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {aggregation.nominalMovements.length > 250 && (
              <p className="px-5 py-2.5 text-[11px] text-slate-500 border-t border-slate-200">
                Mostrando los primeros 250 registros de {aggregation.nominalMovements.length}. Aplica filtros adicionales para acotar la lista.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
