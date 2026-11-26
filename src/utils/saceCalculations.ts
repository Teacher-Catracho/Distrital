import type {
  ANACount,
  AdminPosition,
  AnnualReport,
  BasicaAgeKey,
  BasicaAnnualData,
  BasicaCenterType,
  BasicaEgresadoAgeKey,
  BasicaEvalAreaGradeCell,
  BasicaEvalAreaKey,
  BasicaGradeKey,
  BasicaScope,
  BasicaSubjectKey,
  CanonicalBasicaCenterType,
  CanonicalPrebasicaCenterType,
  CenterTypeFilter,
  DistrictCode,
  EducationLevel,
  EstadisticoRow,
  EvaluacionFinalRow,
  FMCount,
  IBAECount,
  MediaAgeKey,
  MediaAnnualData,
  MediaDecimoSubjectKey,
  MediaGradeKey,
  MediaResumenSubjectKey,
  MediaUndecimoSubjectKey,
  NVCount,
  ParcialNumber,
  ParteMensualComputedRow,
  ParteMensualReport,
  ParteMensualRow,
  PrebasicaAgeKey,
  PrebasicaAnnualData,
  PrebasicaCenterType,
  PrebasicaGradeKey,
  ReportStatus,
  School,
  UserRole,
  ValidationAlert,
} from '../types/sace';

export const PRIMARY_ADMIN_USERNAME = '1613199100383';
export const DEFAULT_YEAR = 2026;
export const SACE_AUTH_EMAIL_DOMAIN = 'sace18b.omoa.hn';
export const PRIMARY_ADMIN_EMAIL = `sace.${PRIMARY_ADMIN_USERNAME}@${SACE_AUTH_EMAIL_DOMAIN}`;

export const ADMIN_POSITION_LABELS: Record<AdminPosition, string> = {
  administrador: 'Administrador Distrital',
  asistente_tecnico: 'Asistente Técnico (Admin)',
};

export function getAdminPositionLabel(position?: AdminPosition): string {
  return position === 'asistente_tecnico'
    ? ADMIN_POSITION_LABELS.asistente_tecnico
    : ADMIN_POSITION_LABELS.administrador;
}

export function isValidEmailAddress(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function normalizeSaceCodeForAuth(saceCode: string): string {
  return saceCode.trim().toUpperCase().replace(/\s+/g, '');
}

export function saceCodeToAuthEmail(saceCode: string): string {
  const clean = saceCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `sace.${clean}@${SACE_AUTH_EMAIL_DOMAIN}`;
}

export function isSyntheticSaceEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.toLowerCase().endsWith(`@${SACE_AUTH_EMAIL_DOMAIN}`));
}

export function formatAccountIdentifier(
  email: string | null | undefined,
  saceCode?: string,
  role?: UserRole
): string {
  if (isSyntheticSaceEmail(email)) {
    if (role === 'admin') {
      return saceCode ? `Usuario: ${saceCode}` : 'Acceso con usuario institucional';
    }
    return saceCode ? `Código SACE: ${saceCode}` : 'Acceso con Código SACE';
  }
  return email || '';
}

export const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
] as const;

export const LEVEL_LABELS: Record<EducationLevel, string> = {
  prebasica: 'Prebásica',
  basica: 'Básica',
  media: 'Media',
};

export const DISTRICT_OPTIONS: { value: DistrictCode; label: string }[] = [
  { value: '18', label: 'Distrito 18' },
  { value: '18-B', label: 'Distrito 18-B' },
];

export function getDistrictLabel(district?: DistrictCode | string): string {
  if (district === '18') return 'Distrito 18';
  if (district === '18-B') return 'Distrito 18-B';
  return 'Sin distrito';
}

export const BASICA_SCOPE_LABELS: Record<BasicaScope, string> = {
  c1_2: 'I y II Ciclo (1° a 6°)',
  c3: 'III Ciclo (7° a 9°)',
  c1_2_3: 'I, II y III Ciclo (1° a 9°)',
};

export const BASICA_SCOPE_SHORT_LABELS: Record<BasicaScope, string> = {
  c1_2: 'I y II Ciclo',
  c3: 'III Ciclo',
  c1_2_3: 'I, II y III Ciclo',
};

export function getBasicaScope(
  schoolOrScope?: Pick<School, 'basicaScope'> | BasicaScope | null
): BasicaScope {
  if (!schoolOrScope) return 'c1_2_3';
  if (typeof schoolOrScope === 'string') return schoolOrScope;
  return schoolOrScope.basicaScope || 'c1_2_3';
}

export function getSchoolLevelLabel(
  level: EducationLevel,
  schoolOrScope?: Pick<School, 'basicaScope'> | BasicaScope | null
): string {
  if (level !== 'basica' || !schoolOrScope) {
    return LEVEL_LABELS[level];
  }
  const scope = getBasicaScope(schoolOrScope);
  return `Básica (${BASICA_SCOPE_SHORT_LABELS[scope]})`;
}

export const PREBASICA_CENTER_TYPES: CanonicalPrebasicaCenterType[] = [
  'Normal',
  'CEP-U',
  'CCPREB',
];

export function normalizePrebasicaCenterType(
  value?: string | null
): CanonicalPrebasicaCenterType | undefined {
  if (!value) return undefined;
  if (value === 'Normal' || value === 'CEPB') return 'Normal';
  if (value === 'CEP-U') return 'CEP-U';
  if (value === 'CCPREB' || value === 'CCEPREB') return 'CCPREB';
  return undefined;
}

export const BASICA_CENTER_TYPES: CanonicalBasicaCenterType[] = ['normal', 'proheco'];

export const BASICA_CENTER_TYPE_LABELS: Record<BasicaCenterType, string> = {
  normal: 'Normal',
  gubernamental: 'Normal',
  proheco: 'PROHECO',
};

export function normalizeBasicaCenterType(
  value?: string | null
): CanonicalBasicaCenterType | undefined {
  if (!value) return undefined;
  if (value === 'normal' || value === 'gubernamental') return 'normal';
  if (value === 'proheco') return 'proheco';
  return undefined;
}

export const CENTER_TYPE_FILTER_OPTIONS: { value: CenterTypeFilter; label: string }[] = [
  { value: 'all', label: 'Todos los tipos de centro' },
  { value: 'prebasica:Normal', label: 'Prebásica · Normal' },
  { value: 'prebasica:CEP-U', label: 'Prebásica · CEP-U' },
  { value: 'prebasica:CCPREB', label: 'Prebásica · CCPREB' },
  { value: 'basica:normal', label: 'Básica (1° a 6°) · Normal' },
  { value: 'basica:proheco', label: 'Básica (1° a 6°) · PROHECO' },
];

export function getCenterTypeFilterLabel(filter: CenterTypeFilter): string {
  return CENTER_TYPE_FILTER_OPTIONS.find((o) => o.value === filter)?.label || 'Todos los tipos de centro';
}

export function schoolMatchesCenterTypeFilter(
  school: Pick<School, 'levels' | 'basicaScope' | 'prebasicaType' | 'basicaType'> | undefined,
  filter: CenterTypeFilter
): boolean {
  if (filter === 'all') return true;
  if (!school) return false;
  if (filter.startsWith('prebasica:')) {
    if (!school.levels.includes('prebasica')) return false;
    const expected = filter.slice('prebasica:'.length) as CanonicalPrebasicaCenterType;
    return normalizePrebasicaCenterType(school.prebasicaType) === expected;
  }
  if (filter.startsWith('basica:')) {
    if (!school.levels.includes('basica')) return false;
    if (getBasicaScope(school) !== 'c1_2') return false;
    const expected = filter.slice('basica:'.length) as CanonicalBasicaCenterType;
    return normalizeBasicaCenterType(school.basicaType) === expected;
  }
  return true;
}

export function getSchoolCenterTypesSummary(
  school: Pick<School, 'levels' | 'basicaScope' | 'prebasicaType' | 'basicaType'>
): string {
  const parts: string[] = [];
  const preType = normalizePrebasicaCenterType(school.prebasicaType);
  if (school.levels.includes('prebasica') && preType) {
    parts.push(`Prebásica: ${preType}`);
  }
  const basType = normalizeBasicaCenterType(school.basicaType);
  if (school.levels.includes('basica') && getBasicaScope(school) === 'c1_2' && basType) {
    parts.push(`Básica (1° a 6°): ${BASICA_CENTER_TYPE_LABELS[basType]}`);
  }
  return parts.join(' · ');
}

export function schoolMatchesBasicaScope(
  school: Pick<School, 'levels' | 'basicaScope'>,
  scope: BasicaScope
): boolean {
  if (!school.levels.includes('basica')) return false;
  const sScope = getBasicaScope(school);
  if (scope === 'c1_2_3') return true;
  if (scope === 'c1_2') return sScope === 'c1_2' || sScope === 'c1_2_3';
  return sScope === 'c3' || sScope === 'c1_2_3';
}

export const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Borrador',
  submitted: 'Enviado a revisión',
  approved: 'Aprobado',
  returned: 'Devuelto con observaciones',
};

export const PREBASICA_GRADES: {
  key: PrebasicaGradeKey;
  shortLabel: string;
  edadesLabel: string;
  label: string;
}[] = [
  { key: 'prekinder', shortLabel: '1°', edadesLabel: 'PRIMERO', label: 'Pre-kínder (1°)' },
  { key: 'kinder', shortLabel: '2°', edadesLabel: 'SEGUNDO', label: 'Kínder (2°)' },
  { key: 'preparatoria', shortLabel: '3°', edadesLabel: 'TERCERO', label: 'Preparatoria (3°)' },
];

export const PREBASICA_AGES: { key: PrebasicaAgeKey; label: string }[] = [
  { key: 'a3', label: '3 años' },
  { key: 'a4', label: '4 años' },
  { key: 'a5', label: '5 años' },
  { key: 'a6', label: '6 años' },
  { key: 'a7', label: '7 años' },
];

export const BASICA_CYCLE_1_2: { key: BasicaGradeKey; shortLabel: string; label: string }[] = [
  { key: 'g1', shortLabel: '1°', label: 'Primero' },
  { key: 'g2', shortLabel: '2°', label: 'Segundo' },
  { key: 'g3', shortLabel: '3°', label: 'Tercero' },
  { key: 'g4', shortLabel: '4°', label: 'Cuarto' },
  { key: 'g5', shortLabel: '5°', label: 'Quinto' },
  { key: 'g6', shortLabel: '6°', label: 'Sexto' },
];

export const BASICA_CYCLE_3: { key: BasicaGradeKey; shortLabel: string; label: string }[] = [
  { key: 'g7', shortLabel: '7°', label: 'Séptimo' },
  { key: 'g8', shortLabel: '8°', label: 'Octavo' },
  { key: 'g9', shortLabel: '9°', label: 'Noveno' },
];

export const BASICA_ALL_GRADES = [...BASICA_CYCLE_1_2, ...BASICA_CYCLE_3];

export function getBasicaGradesForScope(scope?: BasicaScope) {
  if (scope === 'c1_2') return BASICA_CYCLE_1_2;
  if (scope === 'c3') return BASICA_CYCLE_3;
  return BASICA_ALL_GRADES;
}

export const BASICA_AGES: { key: BasicaAgeKey; label: string }[] = [
  { key: 'a5', label: '5 años' },
  { key: 'a6', label: '6 años' },
  { key: 'a7', label: '7 años' },
  { key: 'a8', label: '8 años' },
  { key: 'a9', label: '9 años' },
  { key: 'a10', label: '10 años' },
  { key: 'a11', label: '11 años' },
  { key: 'a12', label: '12 años' },
  { key: 'a13', label: '13 años' },
  { key: 'a14', label: '14 años' },
  { key: 'a15', label: '15 años' },
  { key: 'a16plus', label: '16 años y más' },
];

export const BASICA_SUBJECTS: { key: BasicaSubjectKey; label: string }[] = [
  { key: 'cienciasNaturales', label: 'Ciencias Naturales' },
  { key: 'educacionArtistica', label: 'Educación Artística' },
  { key: 'educacionCivica', label: 'Educación Cívica' },
  { key: 'educacionFisica', label: 'Educación Física' },
  { key: 'espanol', label: 'Español' },
  { key: 'estudiosSociales', label: 'Estudios Sociales' },
  { key: 'ingles', label: 'Inglés' },
  { key: 'matematicas', label: 'Matemáticas' },
  { key: 'tecnologia', label: 'Tecnología' },
];

export const BASICA_RESUMEN_SUBJECTS: { key: BasicaSubjectKey; label: string }[] = [
  { key: 'matematicas', label: 'Matemáticas' },
  { key: 'cienciasNaturales', label: 'Ciencias Naturales' },
  { key: 'educacionFisica', label: 'Educación Física' },
  { key: 'tecnologia', label: 'Tecnología' },
  { key: 'espanol', label: 'Español' },
  { key: 'ingles', label: 'Inglés' },
  { key: 'educacionArtistica', label: 'Educación Artística' },
  { key: 'estudiosSociales', label: 'Estudios Sociales' },
  { key: 'educacionCivica', label: 'Cívica' },
];

export const BASICA_EVAL_AREAS: { key: BasicaEvalAreaKey; label: string }[] = [
  { key: 'espanol', label: 'COMUNICACIÓN / ESPAÑOL' },
  { key: 'matematicas', label: 'MATEMÁTICAS' },
  { key: 'cienciasNaturales', label: 'CIENCIAS NATURALES' },
  { key: 'cienciasSociales', label: 'CIENCIAS SOCIALES' },
];

export const BASICA_EGRESADOS_AGES: { key: BasicaEgresadoAgeKey; label: string }[] = [
  { key: 'e10', label: '10 años de edad cumplidos' },
  { key: 'e11', label: '11 años de edad cumplidos' },
  { key: 'e12', label: '12 años de edad cumplidos' },
  { key: 'e13', label: '13 años de edad cumplidos' },
  { key: 'e14', label: '14 años de edad cumplidos' },
  { key: 'e15', label: '15 años de edad cumplidos' },
  { key: 'e16', label: '16 años de edad cumplidos' },
  { key: 'e17', label: '17 años de edad cumplidos' },
  { key: 'e18', label: '18 años de edad cumplidos' },
  { key: 'e19_24', label: '19 a 24 años' },
  { key: 'e25_29', label: '25 a 29 años' },
  { key: 'e30_34', label: '30 a 34 años' },
  { key: 'e35plus', label: '35 años y más' },
];

export const MEDIA_GRADES: { key: MediaGradeKey; label: string }[] = [
  { key: 'decimo', label: 'Décimo' },
  { key: 'undecimo', label: 'Undécimo' },
  { key: 'duodecimo', label: 'Duodécimo' },
];

export const MEDIA_AGES: { key: MediaAgeKey; label: string }[] = [
  { key: 'a10', label: '10 años' },
  { key: 'a11', label: '11 años' },
  { key: 'a12', label: '12 años' },
  { key: 'a13', label: '13 años' },
  { key: 'a14', label: '14 años' },
  { key: 'a15', label: '15 años' },
  { key: 'a16', label: '16 años' },
  { key: 'a17', label: '17 años' },
  { key: 'a18', label: '18 años' },
  { key: 'a19', label: '19 años' },
  { key: 'a20', label: '20 años' },
  { key: 'a21plus', label: '21 años y más' },
];

export const MEDIA_DECIMO_SUBJECTS: { key: MediaDecimoSubjectKey; label: string }[] = [
  { key: 'biologia', label: 'Biología' },
  { key: 'educacionFisica', label: 'Educación Física y Deportes' },
  { key: 'espanol', label: 'Español' },
  { key: 'psicologia', label: 'Fundamentos de Psicología' },
  { key: 'fisica', label: 'Física' },
  { key: 'historiaHonduras', label: 'Historia de Honduras' },
  { key: 'informatica', label: 'Informática' },
  { key: 'ingles', label: 'Inglés' },
  { key: 'matematicas', label: 'Matemáticas' },
  { key: 'quimica', label: 'Química' },
  { key: 'sociologia', label: 'Sociología' },
];

export const MEDIA_UNDECIMO_SUBJECTS: { key: MediaUndecimoSubjectKey; label: string }[] = [
  { key: 'biologia2', label: 'Biología II' },
  { key: 'artistica', label: 'Educación y Apreciación Artística' },
  { key: 'espanol2', label: 'Español II' },
  { key: 'filosofia', label: 'Filosofía' },
  { key: 'fisica', label: 'Física' },
  { key: 'antropologia', label: 'Antropología' },
  { key: 'economia', label: 'Introducción a la Economía' },
  { key: 'ingles2', label: 'Inglés II' },
  { key: 'matematicas2', label: 'Matemáticas II' },
  { key: 'quimica2', label: 'Química II' },
  { key: 'historiaUniversal', label: 'Historia Universal' },
];

export const MEDIA_RESUMEN_SUBJECTS: { key: MediaResumenSubjectKey; label: string }[] = [
  { key: 'matematicas', label: 'Matemáticas' },
  { key: 'espanol', label: 'Español' },
  { key: 'sociologia', label: 'Sociología' },
  { key: 'biologia', label: 'Biología' },
  { key: 'psicologia', label: 'Fundamento de Psicología' },
  { key: 'fisica', label: 'Física' },
  { key: 'quimica', label: 'Química' },
  { key: 'historiaHonduras', label: 'Historia de Honduras' },
  { key: 'informatica', label: 'Informática' },
  { key: 'ingles', label: 'Inglés' },
  { key: 'educacionFisica', label: 'Educación Física y Deportes' },
];

export const emptyNV = (): NVCount => ({ n: 0, v: 0 });
export const emptyANA = (): ANACount => ({ a: 0, na: 0 });
export const emptyIBAE = (): IBAECount => ({ i: 0, b: 0, a: 0, e: 0 });
export const emptyFM = (): FMCount => ({ f: 0, m: 0 });

export const emptyEstadisticoRow = (): EstadisticoRow => ({
  matInicial: emptyNV(),
  matFinal: emptyNV(),
  ingresos: emptyNV(),
  desertores: emptyNV(),
  traslados: emptyNV(),
  aprobados: emptyNV(),
  reprobados: emptyNV(),
  egresados: emptyNV(),
});

export const emptyEvaluacionFinalRow = (): EvaluacionFinalRow => ({
  matInicial: emptyNV(),
  matFinal: emptyNV(),
  ingresos: emptyNV(),
  desertores: emptyNV(),
  traslados: emptyNV(),
  evaluados: emptyNV(),
  inicial: emptyNV(),
  basico: emptyNV(),
  avanzado: emptyNV(),
  excelente: emptyNV(),
  repitentesEvaluados: emptyNV(),
});

export function createEmptyPrebasicaData(): PrebasicaAnnualData {
  const estadisticoFinal = {} as Record<PrebasicaGradeKey, EstadisticoRow>;
  const matriculaEdades = {} as Record<PrebasicaGradeKey, Record<PrebasicaAgeKey, NVCount>>;
  for (const g of PREBASICA_GRADES) {
    estadisticoFinal[g.key] = emptyEstadisticoRow();
    const ageMap = {} as Record<PrebasicaAgeKey, NVCount>;
    for (const age of PREBASICA_AGES) {
      ageMap[age.key] = emptyNV();
    }
    matriculaEdades[g.key] = ageMap;
  }
  return {
    estadisticoFinal,
    matriculaEdades,
  };
}

export function normalizePrebasicaData(
  raw?: Partial<PrebasicaAnnualData> | null
): PrebasicaAnnualData {
  const base = createEmptyPrebasicaData();
  if (!raw) return base;
  for (const g of PREBASICA_GRADES) {
    const srcEst = raw.estadisticoFinal?.[g.key];
    if (srcEst) {
      base.estadisticoFinal[g.key] = sumEstadisticoRows([srcEst]);
    }
    for (const age of PREBASICA_AGES) {
      const srcAge = raw.matriculaEdades?.[g.key]?.[age.key];
      if (srcAge) {
        base.matriculaEdades[g.key][age.key] = {
          n: srcAge.n || 0,
          v: srcAge.v || 0,
        };
      }
    }
  }
  return base;
}

export function createEmptyBasicaResumenDenominacion(): Record<
  BasicaGradeKey,
  Record<BasicaSubjectKey, IBAECount>
> {
  const resumen = {} as Record<BasicaGradeKey, Record<BasicaSubjectKey, IBAECount>>;
  for (const g of BASICA_ALL_GRADES) {
    const subjMap = {} as Record<BasicaSubjectKey, IBAECount>;
    for (const subj of BASICA_RESUMEN_SUBJECTS) {
      subjMap[subj.key] = emptyIBAE();
    }
    resumen[g.key] = subjMap;
  }
  return resumen;
}

export function createEmptyBasicaData(): BasicaAnnualData {
  const estadisticoFinal = {} as Record<BasicaGradeKey, EstadisticoRow>;
  const matriculaEdades = {} as Record<BasicaGradeKey, Record<BasicaAgeKey, NVCount>>;
  const aprobadosPorArea = {} as Record<BasicaGradeKey, Record<BasicaSubjectKey, ANACount>>;
  const evaluacionFinal = {} as Record<BasicaGradeKey, EvaluacionFinalRow>;

  for (const g of BASICA_ALL_GRADES) {
    estadisticoFinal[g.key] = emptyEstadisticoRow();
    evaluacionFinal[g.key] = emptyEvaluacionFinalRow();

    const ageMap = {} as Record<BasicaAgeKey, NVCount>;
    for (const age of BASICA_AGES) ageMap[age.key] = emptyNV();
    matriculaEdades[g.key] = ageMap;

    const subjMap = {} as Record<BasicaSubjectKey, ANACount>;
    for (const subj of BASICA_SUBJECTS) subjMap[subj.key] = emptyANA();
    aprobadosPorArea[g.key] = subjMap;
  }

  const evaluacionPorAreas = {} as Record<
    BasicaEvalAreaKey,
    Record<BasicaGradeKey, BasicaEvalAreaGradeCell>
  >;
  for (const area of BASICA_EVAL_AREAS) {
    const gradeMap = {} as Record<BasicaGradeKey, BasicaEvalAreaGradeCell>;
    for (const g of BASICA_ALL_GRADES) {
      gradeMap[g.key] = {
        evaluados: emptyFM(),
        aprobados: emptyFM(),
        reprobados: emptyFM(),
      };
    }
    evaluacionPorAreas[area.key] = gradeMap;
  }

  const egresadosPorEdad = {} as Record<BasicaEgresadoAgeKey, FMCount>;
  for (const age of BASICA_EGRESADOS_AGES) {
    egresadosPorEdad[age.key] = emptyFM();
  }

  return {
    estadisticoFinal,
    matriculaEdades,
    aprobadosPorArea,
    evaluacionFinal,
    evaluacionPorAreas,
    egresadosPorEdad,
    resumenDenominacion: createEmptyBasicaResumenDenominacion(),
  };
}

export function createEmptyMediaData(): MediaAnnualData {
  const estadisticoFinal = {} as Record<MediaGradeKey, EstadisticoRow>;
  const matriculaEdades = {} as Record<MediaGradeKey, Record<MediaAgeKey, NVCount>>;
  const evaluacionFinal = {} as Record<MediaGradeKey, EvaluacionFinalRow>;
  const resumenDenominacion = {} as Record<MediaGradeKey, Record<MediaResumenSubjectKey, IBAECount>>;

  for (const g of MEDIA_GRADES) {
    estadisticoFinal[g.key] = emptyEstadisticoRow();
    evaluacionFinal[g.key] = emptyEvaluacionFinalRow();

    const ageMap = {} as Record<MediaAgeKey, NVCount>;
    for (const age of MEDIA_AGES) ageMap[age.key] = emptyNV();
    matriculaEdades[g.key] = ageMap;

    const subjMap = {} as Record<MediaResumenSubjectKey, IBAECount>;
    for (const s of MEDIA_RESUMEN_SUBJECTS) subjMap[s.key] = emptyIBAE();
    resumenDenominacion[g.key] = subjMap;
  }

  const decimo = {} as Record<MediaDecimoSubjectKey, ANACount>;
  for (const s of MEDIA_DECIMO_SUBJECTS) decimo[s.key] = emptyANA();

  const undecimo = {} as Record<MediaUndecimoSubjectKey, ANACount>;
  for (const s of MEDIA_UNDECIMO_SUBJECTS) undecimo[s.key] = emptyANA();

  return {
    estadisticoFinal,
    matriculaEdades,
    aprobadosAsignatura: { decimo, undecimo },
    evaluacionFinal,
    resumenDenominacion,
  };
}

export const totalNV = (c?: NVCount): number => (c?.n || 0) + (c?.v || 0);
export const totalANA = (c?: ANACount): number => (c?.a || 0) + (c?.na || 0);
export const totalIBAE = (c?: IBAECount): number =>
  (c?.i || 0) + (c?.b || 0) + (c?.a || 0) + (c?.e || 0);
export const totalFM = (c?: FMCount): number => (c?.f || 0) + (c?.m || 0);

export function addNV(a: NVCount, b?: NVCount): NVCount {
  return { n: (a?.n || 0) + (b?.n || 0), v: (a?.v || 0) + (b?.v || 0) };
}

export function addANA(a: ANACount, b?: ANACount): ANACount {
  return { a: (a?.a || 0) + (b?.a || 0), na: (a?.na || 0) + (b?.na || 0) };
}

export function addIBAE(a: IBAECount, b?: IBAECount): IBAECount {
  return {
    i: (a?.i || 0) + (b?.i || 0),
    b: (a?.b || 0) + (b?.b || 0),
    a: (a?.a || 0) + (b?.a || 0),
    e: (a?.e || 0) + (b?.e || 0),
  };
}

export function addFM(a: FMCount, b?: FMCount): FMCount {
  return { f: (a?.f || 0) + (b?.f || 0), m: (a?.m || 0) + (b?.m || 0) };
}

export function sumEstadisticoRows(rows: EstadisticoRow[]): EstadisticoRow {
  const acc = emptyEstadisticoRow();
  for (const r of rows) {
    if (!r) continue;
    acc.matInicial = addNV(acc.matInicial, r.matInicial);
    acc.matFinal = addNV(acc.matFinal, r.matFinal);
    acc.ingresos = addNV(acc.ingresos, r.ingresos);
    acc.desertores = addNV(acc.desertores, r.desertores);
    acc.traslados = addNV(acc.traslados, r.traslados);
    acc.aprobados = addNV(acc.aprobados, r.aprobados);
    acc.reprobados = addNV(acc.reprobados, r.reprobados);
    acc.egresados = addNV(acc.egresados, r.egresados);
  }
  return acc;
}

export function sumEvaluacionFinalRows(rows: EvaluacionFinalRow[]): EvaluacionFinalRow {
  const acc = emptyEvaluacionFinalRow();
  for (const r of rows) {
    if (!r) continue;
    acc.matInicial = addNV(acc.matInicial, r.matInicial);
    acc.matFinal = addNV(acc.matFinal, r.matFinal);
    acc.ingresos = addNV(acc.ingresos, r.ingresos);
    acc.desertores = addNV(acc.desertores, r.desertores);
    acc.traslados = addNV(acc.traslados, r.traslados);
    acc.evaluados = addNV(acc.evaluados, r.evaluados);
    acc.inicial = addNV(acc.inicial, r.inicial);
    acc.basico = addNV(acc.basico, r.basico);
    acc.avanzado = addNV(acc.avanzado, r.avanzado);
    acc.excelente = addNV(acc.excelente, r.excelente);
    acc.repitentesEvaluados = addNV(acc.repitentesEvaluados, r.repitentesEvaluados);
  }
  return acc;
}

export function validateBasicaData(
  data: BasicaAnnualData,
  basicaScope?: BasicaScope
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];

  for (const g of getBasicaGradesForScope(basicaScope)) {
    const row = data.estadisticoFinal[g.key];
    if (!row) continue;
    const expectedFinalN =
      row.matInicial.n + row.ingresos.n - row.desertores.n - row.traslados.n;
    const expectedFinalV =
      row.matInicial.v + row.ingresos.v - row.desertores.v - row.traslados.v;

    if (row.matFinal.n !== expectedFinalN || row.matFinal.v !== expectedFinalV) {
      alerts.push({
        section: 'Reporte Estadístico Final',
        message: `${g.label}: Mat. Final (${row.matFinal.n}N / ${row.matFinal.v}V) difiere de Mat. Inicial + Ingresos - Desertores - Traslados (${expectedFinalN}N / ${expectedFinalV}V).`,
        severity: 'warning',
      });
    }

    const matFinalT = totalNV(row.matFinal);
    const aprobReprobT = totalNV(row.aprobados) + totalNV(row.reprobados);
    if (matFinalT > 0 && aprobReprobT > 0 && aprobReprobT !== matFinalT) {
      alerts.push({
        section: 'Reporte Estadístico Final',
        message: `${g.label}: Aprobados + Reprobados (${aprobReprobT}) no coincide con Matrícula Final (${matFinalT}).`,
        severity: 'warning',
      });
    }

    // Edades total vs Mat Final
    const ageSumT = BASICA_AGES.reduce(
      (sum, age) => sum + totalNV(data.matriculaEdades[g.key]?.[age.key]),
      0
    );
    if (matFinalT > 0 && ageSumT > 0 && ageSumT !== matFinalT) {
      alerts.push({
        section: 'Matrícula por Edades',
        message: `${g.label}: Total por edades (${ageSumT}) difiere de Matrícula Final (${matFinalT}).`,
        severity: 'warning',
      });
    }

    // Evaluación final: Evaluados vs Inicial+Básico+Avanzado+Excelente
    const ev = data.evaluacionFinal[g.key];
    if (ev) {
      const evTotal = totalNV(ev.evaluados);
      const nivelesTotal =
        totalNV(ev.inicial) +
        totalNV(ev.basico) +
        totalNV(ev.avanzado) +
        totalNV(ev.excelente);
      if (evTotal > 0 && nivelesTotal !== evTotal) {
        alerts.push({
          section: 'Evaluación Final',
          message: `${g.label}: Suma de niveles Inicial+Básico+Avanzado+Excelente (${nivelesTotal}) difiere de Evaluados (${evTotal}).`,
          severity: 'warning',
        });
      }
    }
  }

  return alerts;
}

export function validateMediaData(data: MediaAnnualData): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];

  for (const g of MEDIA_GRADES) {
    const row = data.estadisticoFinal[g.key];
    if (!row) continue;
    const expectedFinalN =
      row.matInicial.n + row.ingresos.n - row.desertores.n - row.traslados.n;
    const expectedFinalV =
      row.matInicial.v + row.ingresos.v - row.desertores.v - row.traslados.v;

    if (row.matFinal.n !== expectedFinalN || row.matFinal.v !== expectedFinalV) {
      alerts.push({
        section: 'Estadístico Final Media',
        message: `${g.label}: Mat. Final (${row.matFinal.n}N / ${row.matFinal.v}V) difiere de Inicial + Ingresos - Desertores - Traslados (${expectedFinalN}N / ${expectedFinalV}V).`,
        severity: 'warning',
      });
    }

    const matFinalT = totalNV(row.matFinal);
    const aprobReprobT = totalNV(row.aprobados) + totalNV(row.reprobados);
    if (matFinalT > 0 && aprobReprobT > 0 && aprobReprobT !== matFinalT) {
      alerts.push({
        section: 'Estadístico Final Media',
        message: `${g.label}: Aprobados + Reprobados (${aprobReprobT}) no coincide con Matrícula Final (${matFinalT}).`,
        severity: 'warning',
      });
    }

    const ageSumT = MEDIA_AGES.reduce(
      (sum, age) => sum + totalNV(data.matriculaEdades[g.key]?.[age.key]),
      0
    );
    if (matFinalT > 0 && ageSumT > 0 && ageSumT !== matFinalT) {
      alerts.push({
        section: 'Matrícula por Edades Media',
        message: `${g.label}: Total por edades (${ageSumT}) difiere de Matrícula Final (${matFinalT}).`,
        severity: 'warning',
      });
    }

    const ev = data.evaluacionFinal[g.key];
    if (ev) {
      const evTotal = totalNV(ev.evaluados);
      const nivelesTotal =
        totalNV(ev.inicial) +
        totalNV(ev.basico) +
        totalNV(ev.avanzado) +
        totalNV(ev.excelente);
      if (evTotal > 0 && nivelesTotal !== evTotal) {
        alerts.push({
          section: 'Evaluación Final Media',
          message: `${g.label}: Inicial+Básico+Avanzado+Excelente (${nivelesTotal}) difiere de Evaluados (${evTotal}).`,
          severity: 'warning',
        });
      }
    }
  }

  return alerts;
}

export function aggregateBasicaReports(reports: AnnualReport[]): BasicaAnnualData {
  const result = createEmptyBasicaData();
  for (const r of reports) {
    if (r.level !== 'basica' || !r.data) continue;
    const d = r.data as BasicaAnnualData;

    for (const g of BASICA_ALL_GRADES) {
      if (d.estadisticoFinal?.[g.key]) {
        result.estadisticoFinal[g.key] = sumEstadisticoRows([
          result.estadisticoFinal[g.key],
          d.estadisticoFinal[g.key],
        ]);
      }
      if (d.evaluacionFinal?.[g.key]) {
        result.evaluacionFinal[g.key] = sumEvaluacionFinalRows([
          result.evaluacionFinal[g.key],
          d.evaluacionFinal[g.key],
        ]);
      }
      for (const age of BASICA_AGES) {
        result.matriculaEdades[g.key][age.key] = addNV(
          result.matriculaEdades[g.key][age.key],
          d.matriculaEdades?.[g.key]?.[age.key]
        );
      }
      for (const subj of BASICA_SUBJECTS) {
        result.aprobadosPorArea[g.key][subj.key] = addANA(
          result.aprobadosPorArea[g.key][subj.key],
          d.aprobadosPorArea?.[g.key]?.[subj.key]
        );
      }
      if (result.resumenDenominacion) {
        for (const subj of BASICA_RESUMEN_SUBJECTS) {
          result.resumenDenominacion[g.key][subj.key] = addIBAE(
            result.resumenDenominacion[g.key][subj.key],
            d.resumenDenominacion?.[g.key]?.[subj.key]
          );
        }
      }
      for (const area of BASICA_EVAL_AREAS) {
        const src = d.evaluacionPorAreas?.[area.key]?.[g.key];
        if (src) {
          result.evaluacionPorAreas[area.key][g.key] = {
            evaluados: addFM(result.evaluacionPorAreas[area.key][g.key].evaluados, src.evaluados),
            aprobados: addFM(result.evaluacionPorAreas[area.key][g.key].aprobados, src.aprobados),
            reprobados: addFM(result.evaluacionPorAreas[area.key][g.key].reprobados, src.reprobados),
          };
        }
      }
    }
    for (const age of BASICA_EGRESADOS_AGES) {
      result.egresadosPorEdad[age.key] = addFM(
        result.egresadosPorEdad[age.key],
        d.egresadosPorEdad?.[age.key]
      );
    }
  }
  return result;
}

export function aggregateMediaReports(reports: AnnualReport[]): MediaAnnualData {
  const result = createEmptyMediaData();
  for (const r of reports) {
    if (r.level !== 'media' || !r.data) continue;
    const d = r.data as MediaAnnualData;

    for (const g of MEDIA_GRADES) {
      if (d.estadisticoFinal?.[g.key]) {
        result.estadisticoFinal[g.key] = sumEstadisticoRows([
          result.estadisticoFinal[g.key],
          d.estadisticoFinal[g.key],
        ]);
      }
      if (d.evaluacionFinal?.[g.key]) {
        result.evaluacionFinal[g.key] = sumEvaluacionFinalRows([
          result.evaluacionFinal[g.key],
          d.evaluacionFinal[g.key],
        ]);
      }
      for (const age of MEDIA_AGES) {
        result.matriculaEdades[g.key][age.key] = addNV(
          result.matriculaEdades[g.key][age.key],
          d.matriculaEdades?.[g.key]?.[age.key]
        );
      }
      for (const subj of MEDIA_RESUMEN_SUBJECTS) {
        result.resumenDenominacion[g.key][subj.key] = addIBAE(
          result.resumenDenominacion[g.key][subj.key],
          d.resumenDenominacion?.[g.key]?.[subj.key]
        );
      }
    }
    for (const s of MEDIA_DECIMO_SUBJECTS) {
      result.aprobadosAsignatura.decimo[s.key] = addANA(
        result.aprobadosAsignatura.decimo[s.key],
        d.aprobadosAsignatura?.decimo?.[s.key]
      );
    }
    for (const s of MEDIA_UNDECIMO_SUBJECTS) {
      result.aprobadosAsignatura.undecimo[s.key] = addANA(
        result.aprobadosAsignatura.undecimo[s.key],
        d.aprobadosAsignatura?.undecimo?.[s.key]
      );
    }
  }
  return result;
}

export function aggregatePrebasicaReports(reports: AnnualReport[]): PrebasicaAnnualData {
  const result = createEmptyPrebasicaData();
  for (const r of reports) {
    if (r.level !== 'prebasica' || !r.data) continue;
    const d = r.data as Partial<PrebasicaAnnualData>;
    for (const g of PREBASICA_GRADES) {
      if (d.estadisticoFinal?.[g.key]) {
        result.estadisticoFinal[g.key] = sumEstadisticoRows([
          result.estadisticoFinal[g.key],
          d.estadisticoFinal[g.key],
        ]);
      }
      for (const age of PREBASICA_AGES) {
        result.matriculaEdades[g.key][age.key] = addNV(
          result.matriculaEdades[g.key][age.key],
          d.matriculaEdades?.[g.key]?.[age.key]
        );
      }
    }
  }
  return result;
}

// ============================================================
// PARTE MENSUAL (Asistencia y Movimientos Estadísticos)
// ============================================================

export interface ParteMensualGradeDef {
  key: string;
  label: string;
  hint?: string;
}

export function getParteMensualGrades(
  level: EducationLevel,
  basicaScope?: BasicaScope
): ParteMensualGradeDef[] {
  if (level === 'prebasica') {
    return [
      { key: 'prekinder', label: 'Primero', hint: 'Pre-kínder' },
      { key: 'kinder', label: 'Segundo', hint: 'Kínder' },
      { key: 'preparatoria', label: 'Tercero', hint: 'Preparatoria' },
    ];
  }
  if (level === 'basica') {
    return getBasicaGradesForScope(basicaScope).map((g) => ({
      key: g.key,
      label: g.label,
      hint: g.shortLabel,
    }));
  }
  return MEDIA_GRADES.map((g) => ({
    key: g.key,
    label: g.label,
  }));
}

export const emptyParteMensualRow = (): ParteMensualRow => ({
  matInicial: emptyNV(),
  inasistencias: emptyNV(),
  ingresos: emptyNV(),
  traslados: emptyNV(),
  desertores: emptyNV(),
});

export function createEmptyParteMensualRows(
  level: EducationLevel,
  basicaScope?: BasicaScope
): Record<string, ParteMensualRow> {
  const rows: Record<string, ParteMensualRow> = {};
  for (const g of getParteMensualGrades(level, basicaScope)) {
    rows[g.key] = emptyParteMensualRow();
  }
  return rows;
}

export function computeParteMensualRow(
  row: ParteMensualRow | undefined,
  diasTrabajados: number
): ParteMensualComputedRow {
  const r = row || emptyParteMensualRow();
  const matInicial: NVCount = { n: r.matInicial?.n || 0, v: r.matInicial?.v || 0 };
  const ingresos: NVCount = { n: r.ingresos?.n || 0, v: r.ingresos?.v || 0 };
  const traslados: NVCount = { n: r.traslados?.n || 0, v: r.traslados?.v || 0 };
  const desertores: NVCount = { n: r.desertores?.n || 0, v: r.desertores?.v || 0 };
  const inasistencias: NVCount = { n: r.inasistencias?.n || 0, v: r.inasistencias?.v || 0 };

  const matFinal: NVCount = {
    n: matInicial.n + ingresos.n - traslados.n - desertores.n,
    v: matInicial.v + ingresos.v - traslados.v - desertores.v,
  };
  const matFinalT = totalNV(matFinal);

  let asistN = 0;
  let asistV = 0;
  if (diasTrabajados > 0) {
    asistN = matFinal.n - inasistencias.n / diasTrabajados;
    asistV = matFinal.v - inasistencias.v / diasTrabajados;
  }
  const asistT = asistN + asistV;

  const pctN = diasTrabajados > 0 && matFinal.n > 0 ? (asistN / matFinal.n) * 100 : 0;
  const pctV = diasTrabajados > 0 && matFinal.v > 0 ? (asistV / matFinal.v) * 100 : 0;
  const pctT = diasTrabajados > 0 && matFinalT > 0 ? (asistT / matFinalT) * 100 : 0;

  return {
    matInicial,
    matFinal,
    inasistencias,
    asistenciaMedia: { n: asistN, v: asistV, t: asistT },
    tantoPorCiento: { n: pctN, v: pctV, t: pctT },
    ingresos,
    traslados,
    desertores,
  };
}

export function sumParteMensualComputedRows(
  computedRows: ParteMensualComputedRow[]
): ParteMensualComputedRow {
  const matInicial = emptyNV();
  const matFinal = emptyNV();
  const inasistencias = emptyNV();
  const ingresos = emptyNV();
  const traslados = emptyNV();
  const desertores = emptyNV();
  let asistN = 0;
  let asistV = 0;

  for (const r of computedRows) {
    if (!r) continue;
    matInicial.n += r.matInicial.n;
    matInicial.v += r.matInicial.v;
    matFinal.n += r.matFinal.n;
    matFinal.v += r.matFinal.v;
    inasistencias.n += r.inasistencias.n;
    inasistencias.v += r.inasistencias.v;
    ingresos.n += r.ingresos.n;
    ingresos.v += r.ingresos.v;
    traslados.n += r.traslados.n;
    traslados.v += r.traslados.v;
    desertores.n += r.desertores.n;
    desertores.v += r.desertores.v;
    asistN += r.asistenciaMedia.n;
    asistV += r.asistenciaMedia.v;
  }

  const asistT = asistN + asistV;
  const matFinalT = totalNV(matFinal);

  return {
    matInicial,
    matFinal,
    inasistencias,
    asistenciaMedia: { n: asistN, v: asistV, t: asistT },
    tantoPorCiento: {
      n: matFinal.n > 0 ? (asistN / matFinal.n) * 100 : 0,
      v: matFinal.v > 0 ? (asistV / matFinal.v) * 100 : 0,
      t: matFinalT > 0 ? (asistT / matFinalT) * 100 : 0,
    },
    ingresos,
    traslados,
    desertores,
  };
}

export function aggregateParteMensualReports(
  reports: ParteMensualReport[],
  level: EducationLevel,
  basicaScope?: BasicaScope
): {
  byGrade: Record<string, ParteMensualComputedRow>;
  total: ParteMensualComputedRow;
  avgDiasTrabajados: number;
} {
  const grades = getParteMensualGrades(level, basicaScope);
  const perGradeList: Record<string, ParteMensualComputedRow[]> = {};
  for (const g of grades) {
    perGradeList[g.key] = [];
  }

  let sumDias = 0;
  let countDias = 0;

  for (const rep of reports) {
    if (rep.level !== level) continue;
    const dias = rep.diasTrabajados || 0;
    if (dias > 0) {
      sumDias += dias;
      countDias++;
    }
    for (const g of grades) {
      perGradeList[g.key].push(computeParteMensualRow(rep.rows?.[g.key], dias));
    }
  }

  const byGrade: Record<string, ParteMensualComputedRow> = {};
  const allGradeTotals: ParteMensualComputedRow[] = [];
  for (const g of grades) {
    const summed = sumParteMensualComputedRows(perGradeList[g.key]);
    byGrade[g.key] = summed;
    allGradeTotals.push(summed);
  }

  return {
    byGrade,
    total: sumParteMensualComputedRows(allGradeTotals),
    avgDiasTrabajados: countDias > 0 ? Math.round(sumDias / countDias) : 0,
  };
}

export function computeBasicaCycleEnrollmentFromParteMensual(
  reports: ParteMensualReport[]
): { c12: number; c3: number; total: number } {
  const agg12 = aggregateParteMensualReports(reports, 'basica', 'c1_2');
  const agg3 = aggregateParteMensualReports(reports, 'basica', 'c3');
  const c12 = Math.max(0, totalNV(agg12.total.matFinal));
  const c3 = Math.max(0, totalNV(agg3.total.matFinal));
  return { c12, c3, total: c12 + c3 };
}

export function validateParteMensual(
  rows: Record<string, ParteMensualRow>,
  diasTrabajados: number,
  level: EducationLevel,
  basicaScope?: BasicaScope
): ValidationAlert[] {
  const alerts: ValidationAlert[] = [];
  const grades = getParteMensualGrades(level, basicaScope);
  const finalLabel = level === 'prebasica' ? 'Matrícula Actual' : 'Matrícula Final';

  let anyStudents = false;
  for (const g of grades) {
    const c = computeParteMensualRow(rows[g.key], diasTrabajados);
    if (totalNV(c.matInicial) > 0 || totalNV(c.ingresos) > 0) {
      anyStudents = true;
    }
    if (c.matFinal.n < 0 || c.matFinal.v < 0) {
      alerts.push({
        section: 'Matrícula',
        message: `${g.label}: ${finalLabel} resulta negativa (${c.matFinal.n} N / ${c.matFinal.v} V) porque traslados + desertores superan matrícula inicial + ingresos.`,
        severity: 'warning',
      });
    }
    if (diasTrabajados > 0 && (c.asistenciaMedia.n < 0 || c.asistenciaMedia.v < 0)) {
      alerts.push({
        section: 'Asistencia',
        message: `${g.label}: Las inasistencias superan el máximo posible para ${diasTrabajados} días trabajados (${finalLabel} × días).`,
        severity: 'warning',
      });
    }
  }

  if (anyStudents && diasTrabajados <= 0) {
    alerts.push({
      section: 'Días Trabajados',
      message: 'Ingresa los Días Trabajados del mes (mayor que 0) para calcular Asistencia Media y Tanto por Ciento.',
      severity: 'warning',
    });
  }

  return alerts;
}

export const PARCIALES: { value: ParcialNumber; label: string; shortLabel: string }[] = [
  { value: 1, label: 'I Parcial', shortLabel: 'I' },
  { value: 2, label: 'II Parcial', shortLabel: 'II' },
  { value: 3, label: 'III Parcial', shortLabel: 'III' },
  { value: 4, label: 'IV Parcial', shortLabel: 'IV' },
];

export function getParcialLabel(parcial: ParcialNumber): string {
  return PARCIALES.find((p) => p.value === parcial)?.label || `Parcial ${parcial}`;
}

export function getDefaultParcial(month = new Date().getMonth() + 1): ParcialNumber {
  if (month <= 4) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

export type SchoolComplianceGroupKey =
  | 'prebasica'
  | 'basica_c1_2'
  | 'basica_c1_2_3'
  | 'basica_c3'
  | 'media';

export const COMPLIANCE_GROUPS: { key: SchoolComplianceGroupKey; label: string }[] = [
  { key: 'prebasica', label: 'Prebásica' },
  { key: 'basica_c1_2', label: 'Básica (I y II Ciclo · 1° a 6°)' },
  { key: 'basica_c1_2_3', label: 'Básica (I, II y III Ciclo · 1° a 9°)' },
  { key: 'basica_c3', label: 'Básica (III Ciclo · 7° a 9°)' },
  { key: 'media', label: 'Media' },
];

export function schoolMatchesComplianceGroup(
  school: Pick<School, 'levels' | 'basicaScope'>,
  group: SchoolComplianceGroupKey
): boolean {
  if (group === 'prebasica') return school.levels.includes('prebasica');
  if (group === 'media') return school.levels.includes('media');
  if (!school.levels.includes('basica')) return false;
  const scope = getBasicaScope(school);
  if (group === 'basica_c1_2') return scope === 'c1_2';
  if (group === 'basica_c3') return scope === 'c3';
  return scope === 'c1_2_3';
}

export function getPrimaryComplianceGroup(
  school: Pick<School, 'levels' | 'basicaScope'>
): SchoolComplianceGroupKey {
  if (school.levels.includes('prebasica') && !school.levels.includes('basica') && !school.levels.includes('media')) {
    return 'prebasica';
  }
  if (school.levels.includes('basica')) {
    const scope = getBasicaScope(school);
    if (scope === 'c1_2') return 'basica_c1_2';
    if (scope === 'c3') return 'basica_c3';
    return 'basica_c1_2_3';
  }
  if (school.levels.includes('media')) return 'media';
  return 'prebasica';
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type DeadlineUrgency = 'completed' | 'overdue' | 'due_soon' | 'pending';

export function getActivityDeadlineInfo(
  dueDate: string,
  completed: boolean,
  todayIso = getTodayIsoDate()
): { state: DeadlineUrgency; diffDays: number; label: string } {
  const target = new Date(`${dueDate}T00:00:00`);
  const today = new Date(`${todayIso}T00:00:00`);
  const diffDays = Number.isNaN(target.getTime())
    ? 0
    : Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (completed) {
    return { state: 'completed', diffDays, label: 'Cumplido' };
  }
  if (diffDays < 0) {
    const abs = Math.abs(diffDays);
    return {
      state: 'overdue',
      diffDays,
      label: abs === 1 ? 'Venció ayer' : `Vencida hace ${abs} días`,
    };
  }
  if (diffDays === 0) {
    return { state: 'due_soon', diffDays, label: 'Vence hoy' };
  }
  if (diffDays <= 3) {
    return {
      state: 'due_soon',
      diffDays,
      label: diffDays === 1 ? 'Vence mañana' : `Vence en ${diffDays} días`,
    };
  }
  return {
    state: 'pending',
    diffDays,
    label: `Vence en ${diffDays} días`,
  };
}

export function formatShortDueDate(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split('-');
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const monthLabel = monthNames[Number(m) - 1] || m;
  return `${Number(d)} ${monthLabel} ${y}`;
}

export function getDefaultMonthDeadlineStr(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const dd = String(lastDay).padStart(2, '0');
  return `${year}-${mm}-${dd}T23:59`;
}

export function formatDateTimeEs(dateTimeStr: string): string {
  if (!dateTimeStr) return '';
  const [datePart, timePart] = dateTimeStr.split('T');
  const shortDate = formatShortDueDate(datePart);
  return timePart ? `${shortDate}, ${timePart}` : shortDate;
}

export function evaluate48HourWindow(
  dateOrDateTime: string,
  nowMs = Date.now()
): {
  isWithin48Hours: boolean;
  isOverdue: boolean;
  hoursRemaining: number;
  formattedRemaining: string;
} | null {
  if (!dateOrDateTime) return null;
  const normalized =
    dateOrDateTime.length === 10 ? `${dateOrDateTime}T23:59:59` : `${dateOrDateTime}:00`;
  const targetMs = new Date(normalized).getTime();
  if (Number.isNaN(targetMs)) return null;

  const diffMs = targetMs - nowMs;
  const hoursRemaining = diffMs / (1000 * 60 * 60);

  if (diffMs <= 0) {
    return {
      isWithin48Hours: false,
      isOverdue: true,
      hoursRemaining,
      formattedRemaining: 'Plazo vencido',
    };
  }

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formattedRemaining =
    hours === 0
      ? `Faltan ${mins} min`
      : mins === 0
      ? `Faltan ${hours} h`
      : `Faltan ${hours} h ${mins} min`;

  return {
    isWithin48Hours: hoursRemaining < 48,
    isOverdue: false,
    hoursRemaining,
    formattedRemaining,
  };
}

export interface DaysCountdownInfo {
  targetMs: number;
  diffMs: number;
  calendarDays: number;
  isOverdue: boolean;
  isToday: boolean;
  headline: string;
  sublabel: string;
}

export function getDaysCountdownInfo(
  dateOrDateTime: string,
  nowMs = Date.now()
): DaysCountdownInfo | null {
  if (!dateOrDateTime) return null;
  const normalized =
    dateOrDateTime.length === 10 ? `${dateOrDateTime}T23:59:59` : `${dateOrDateTime}:00`;
  const target = new Date(normalized);
  const targetMs = target.getTime();
  if (Number.isNaN(targetMs)) return null;

  const now = new Date(nowMs);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetStart = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const calendarDays = Math.round((targetStart - todayStart) / (1000 * 60 * 60 * 24));
  const diffMs = targetMs - nowMs;

  if (diffMs <= 0) {
    const overdueDays = Math.max(0, Math.abs(calendarDays));
    return {
      targetMs,
      diffMs,
      calendarDays,
      isOverdue: true,
      isToday: calendarDays === 0,
      headline: 'Vencido',
      sublabel:
        overdueDays === 0
          ? 'Venció hoy'
          : overdueDays === 1
          ? 'Venció ayer'
          : `Venció hace ${overdueDays} días`,
    };
  }

  const totalMinutes = Math.max(1, Math.ceil(diffMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeLeftLabel =
    hours === 0
      ? `Faltan ${mins} min`
      : mins === 0
      ? `Faltan ${hours} h`
      : `Faltan ${hours} h ${mins} min`;

  if (calendarDays <= 0) {
    return {
      targetMs,
      diffMs,
      calendarDays: 0,
      isOverdue: false,
      isToday: true,
      headline: 'Hoy',
      sublabel: timeLeftLabel,
    };
  }

  if (calendarDays === 1) {
    return {
      targetMs,
      diffMs,
      calendarDays: 1,
      isOverdue: false,
      isToday: false,
      headline: '1 día',
      sublabel: hours < 48 ? `Mañana · ${timeLeftLabel}` : 'Vence mañana',
    };
  }

  return {
    targetMs,
    diffMs,
    calendarDays,
    isOverdue: false,
    isToday: false,
    headline: `${calendarDays} días`,
    sublabel: `Faltan ${calendarDays} días`,
  };
}

export interface ParteMensualAnnualSummary {
  hasApril: boolean;
  hasOctober: boolean;
  monthsFound: number[];
  rows: Record<
    string,
    Pick<EstadisticoRow, 'matInicial' | 'matFinal' | 'ingresos' | 'desertores' | 'traslados'>
  >;
}

export function computeAnnualEstadisticoFromPartesMensuales(
  reports: ParteMensualReport[],
  gradeKeys: string[]
): ParteMensualAnnualSummary {
  const validReports = reports
    .filter((r) => r && r.month >= 4 && r.month <= 10)
    .sort((a, b) => a.month - b.month);

  const monthsFound = Array.from(new Set(validReports.map((r) => r.month))).sort((a, b) => a - b);
  const aprilReport = validReports.find((r) => r.month === 4);
  const octoberReport = validReports.find((r) => r.month === 10);

  const rows: ParteMensualAnnualSummary['rows'] = {};

  for (const gradeKey of gradeKeys) {
    const aprilMatInicial = aprilReport?.rows?.[gradeKey]?.matInicial;
    const matInicial: NVCount = aprilMatInicial
      ? { n: aprilMatInicial.n || 0, v: aprilMatInicial.v || 0 }
      : emptyNV();

    const matFinal: NVCount = octoberReport
      ? {
          ...computeParteMensualRow(
            octoberReport.rows?.[gradeKey],
            octoberReport.diasTrabajados || 0
          ).matFinal,
        }
      : emptyNV();

    let ingresos = emptyNV();
    let desertores = emptyNV();
    let traslados = emptyNV();

    for (const rep of validReports) {
      const r = rep.rows?.[gradeKey];
      if (!r) continue;
      ingresos = addNV(ingresos, r.ingresos);
      desertores = addNV(desertores, r.desertores);
      traslados = addNV(traslados, r.traslados);
    }

    rows[gradeKey] = {
      matInicial,
      matFinal,
      ingresos,
      desertores,
      traslados,
    };
  }

  return {
    hasApril: Boolean(aprilReport),
    hasOctober: Boolean(octoberReport),
    monthsFound,
    rows,
  };
}

export function mergeParteMensualIntoEstadisticoRow(
  existing: EstadisticoRow | undefined,
  derived: ParteMensualAnnualSummary['rows'][string] | undefined,
  summary: Pick<ParteMensualAnnualSummary, 'hasApril' | 'hasOctober' | 'monthsFound'>
): EstadisticoRow {
  const base = existing || emptyEstadisticoRow();
  if (!derived) return base;
  return {
    ...base,
    ...(summary.hasApril ? { matInicial: { ...derived.matInicial } } : {}),
    ...(summary.hasOctober ? { matFinal: { ...derived.matFinal } } : {}),
    ...(summary.monthsFound.length > 0
      ? {
          ingresos: { ...derived.ingresos },
          desertores: { ...derived.desertores },
          traslados: { ...derived.traslados },
        }
      : {}),
  };
}

export function mergeParteMensualIntoEvaluacionRow(
  existing: EvaluacionFinalRow | undefined,
  estadisticoRow: EstadisticoRow
): EvaluacionFinalRow {
  const base = existing || emptyEvaluacionFinalRow();
  return {
    ...base,
    matInicial: { ...estadisticoRow.matInicial },
    matFinal: { ...estadisticoRow.matFinal },
    ingresos: { ...estadisticoRow.ingresos },
    desertores: { ...estadisticoRow.desertores },
    traslados: { ...estadisticoRow.traslados },
  };
}



