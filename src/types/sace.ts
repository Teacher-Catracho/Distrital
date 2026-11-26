export type EducationLevel = 'prebasica' | 'basica' | 'media';
export type DistrictCode = '18' | '18-B';
export type BasicaScope = 'c1_2' | 'c3' | 'c1_2_3';
export type CanonicalPrebasicaCenterType = 'Normal' | 'CEP-U' | 'CCPREB';
export type PrebasicaCenterType = CanonicalPrebasicaCenterType | 'CEPB' | 'CCEPREB';
export type CanonicalBasicaCenterType = 'normal' | 'proheco';
export type BasicaCenterType = CanonicalBasicaCenterType | 'gubernamental';
export type CenterTypeFilter =
  | 'all'
  | 'prebasica:Normal'
  | 'prebasica:CEP-U'
  | 'prebasica:CCPREB'
  | 'basica:normal'
  | 'basica:proheco';
export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export type UserRole = 'pending' | 'director' | 'admin';
export type AdminPosition = 'administrador' | 'asistente_tecnico';
export type SectorType = 'gubernamental' | 'no_gubernamental';
export type ModalityType = 'presencial' | 'isemed' | 'acelerado';

export interface School {
  id: string;
  saceCode: string;
  name: string;
  community: string;
  district?: DistrictCode;
  levels: EducationLevel[];
  basicaScope?: BasicaScope;
  prebasicaType?: PrebasicaCenterType;
  basicaType?: BasicaCenterType;
  sector: SectorType;
  modality: ModalityType;
  directorUid: string;
  directorDisplayName: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SchoolContact {
  schoolId: string;
  directorPhone: string;
  updatedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  dni: string;
  role: UserRole;
  adminPosition?: AdminPosition;
  needsOnboarding?: boolean;
  schoolId: string;
  schoolName: string;
  saceCode: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DirectorRequest {
  uid: string;
  email: string;
  displayName: string;
  dni: string;
  directorPhone?: string;
  requestType: 'existing_school' | 'new_school';
  schoolId: string;
  proposedSchoolName: string;
  proposedSaceCode: string;
  proposedCommunity: string;
  proposedDistrict?: DistrictCode;
  proposedLevels: EducationLevel[];
  proposedBasicaScope?: BasicaScope;
  proposedPrebasicaType?: PrebasicaCenterType;
  proposedBasicaType?: BasicaCenterType;
  proposedSector: SectorType;
  proposedModality: ModalityType;
  status: 'pending' | 'approved' | 'rejected';
  reviewComment: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  position?: AdminPosition;
  addedBy: string;
  createdAt?: unknown;
}

export interface MovementRow {
  id: string;
  rne: string;
  nombre: string;
  sexo: 'F' | 'M';
  accion: string;
  gradoSeccion: string;
  mes: string;
}

export interface MonthlyReport {
  id: string;
  year: number;
  month: number;
  schoolId: string;
  schoolName: string;
  saceCode: string;
  level: EducationLevel;
  directorUid: string;
  directorName: string;
  ingresos: MovementRow[];
  traslados: MovementRow[];
  desertores: MovementRow[];
  noMovements?: boolean;
  status: ReportStatus;
  reviewComment: string;
  reviewedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ParteMensualRow {
  matInicial: NVCount;
  inasistencias: NVCount;
  ingresos: NVCount;
  traslados: NVCount;
  desertores: NVCount;
}

export interface NVTFloat {
  n: number;
  v: number;
  t: number;
}

export interface ParteMensualComputedRow {
  matInicial: NVCount;
  matFinal: NVCount;
  inasistencias: NVCount;
  asistenciaMedia: NVTFloat;
  tantoPorCiento: NVTFloat;
  ingresos: NVCount;
  traslados: NVCount;
  desertores: NVCount;
}

export interface ParteMensualReport {
  id: string;
  year: number;
  month: number;
  schoolId: string;
  schoolName: string;
  saceCode: string;
  lugar: string;
  level: EducationLevel;
  directorUid: string;
  directorName: string;
  diasTrabajados: number;
  rows: Record<string, ParteMensualRow>;
  status: ReportStatus;
  reviewComment: string;
  reviewedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NVCount {
  n: number;
  v: number;
}

export interface ANACount {
  a: number;
  na: number;
}

export interface IBAECount {
  i: number;
  b: number;
  a: number;
  e: number;
}

export interface FMCount {
  f: number;
  m: number;
}

export interface EstadisticoRow {
  matInicial: NVCount;
  matFinal: NVCount;
  ingresos: NVCount;
  desertores: NVCount;
  traslados: NVCount;
  aprobados: NVCount;
  reprobados: NVCount;
  egresados: NVCount;
}

export interface EvaluacionFinalRow {
  matInicial: NVCount;
  matFinal: NVCount;
  ingresos: NVCount;
  desertores: NVCount;
  traslados: NVCount;
  evaluados: NVCount;
  inicial: NVCount;
  basico: NVCount;
  avanzado: NVCount;
  excelente: NVCount;
  repitentesEvaluados: NVCount;
}

// Prebásica
export type PrebasicaGradeKey = 'prekinder' | 'kinder' | 'preparatoria';

export interface PrebasicaAnnualData {
  estadisticoFinal: Record<PrebasicaGradeKey, EstadisticoRow>;
}

// Básica
export type BasicaGradeKey =
  | 'g1'
  | 'g2'
  | 'g3'
  | 'g4'
  | 'g5'
  | 'g6'
  | 'g7'
  | 'g8'
  | 'g9';

export type BasicaAgeKey =
  | 'a5'
  | 'a6'
  | 'a7'
  | 'a8'
  | 'a9'
  | 'a10'
  | 'a11'
  | 'a12'
  | 'a13'
  | 'a14'
  | 'a15'
  | 'a16plus';

export type BasicaSubjectKey =
  | 'cienciasNaturales'
  | 'educacionArtistica'
  | 'educacionCivica'
  | 'educacionFisica'
  | 'espanol'
  | 'estudiosSociales'
  | 'ingles'
  | 'matematicas'
  | 'tecnologia';

export type BasicaEvalAreaKey =
  | 'espanol'
  | 'matematicas'
  | 'cienciasNaturales'
  | 'cienciasSociales';

export type BasicaEgresadoAgeKey =
  | 'e10'
  | 'e11'
  | 'e12'
  | 'e13'
  | 'e14'
  | 'e15'
  | 'e16'
  | 'e17'
  | 'e18'
  | 'e19_24'
  | 'e25_29'
  | 'e30_34'
  | 'e35plus';

export interface BasicaEvalAreaGradeCell {
  evaluados: FMCount;
  aprobados: FMCount;
  reprobados: FMCount;
}

export interface BasicaAnnualData {
  estadisticoFinal: Record<BasicaGradeKey, EstadisticoRow>;
  matriculaEdades: Record<BasicaGradeKey, Record<BasicaAgeKey, NVCount>>;
  aprobadosPorArea: Record<BasicaGradeKey, Record<BasicaSubjectKey, ANACount>>;
  evaluacionFinal: Record<BasicaGradeKey, EvaluacionFinalRow>;
  evaluacionPorAreas: Record<BasicaEvalAreaKey, Record<BasicaGradeKey, BasicaEvalAreaGradeCell>>;
  egresadosPorEdad: Record<BasicaEgresadoAgeKey, FMCount>;
  resumenDenominacion?: Record<BasicaGradeKey, Record<BasicaSubjectKey, IBAECount>>;
}

// Media
export type MediaGradeKey = 'decimo' | 'undecimo' | 'duodecimo';

export type MediaAgeKey =
  | 'a10'
  | 'a11'
  | 'a12'
  | 'a13'
  | 'a14'
  | 'a15'
  | 'a16'
  | 'a17'
  | 'a18'
  | 'a19'
  | 'a20'
  | 'a21plus';

export type MediaDecimoSubjectKey =
  | 'biologia'
  | 'educacionFisica'
  | 'espanol'
  | 'psicologia'
  | 'fisica'
  | 'historiaHonduras'
  | 'informatica'
  | 'ingles'
  | 'matematicas'
  | 'quimica'
  | 'sociologia';

export type MediaUndecimoSubjectKey =
  | 'biologia2'
  | 'artistica'
  | 'espanol2'
  | 'filosofia'
  | 'fisica'
  | 'antropologia'
  | 'economia'
  | 'ingles2'
  | 'matematicas2'
  | 'quimica2'
  | 'historiaUniversal';

export type MediaResumenSubjectKey =
  | 'matematicas'
  | 'espanol'
  | 'sociologia'
  | 'biologia'
  | 'psicologia'
  | 'fisica'
  | 'quimica'
  | 'historiaHonduras'
  | 'informatica'
  | 'ingles'
  | 'educacionFisica';

export interface MediaAnnualData {
  estadisticoFinal: Record<MediaGradeKey, EstadisticoRow>;
  matriculaEdades: Record<MediaGradeKey, Record<MediaAgeKey, NVCount>>;
  aprobadosAsignatura: {
    decimo: Record<MediaDecimoSubjectKey, ANACount>;
    undecimo: Record<MediaUndecimoSubjectKey, ANACount>;
  };
  evaluacionFinal: Record<MediaGradeKey, EvaluacionFinalRow>;
  resumenDenominacion: Record<MediaGradeKey, Record<MediaResumenSubjectKey, IBAECount>>;
}

export interface AnnualReport {
  id: string;
  year: number;
  schoolId: string;
  schoolName: string;
  saceCode: string;
  community: string;
  sector: SectorType;
  modality: ModalityType;
  level: EducationLevel;
  directorUid: string;
  directorName: string;
  directorDni: string;
  placeAndDate: string;
  data: PrebasicaAnnualData | BasicaAnnualData | MediaAnnualData;
  status: ReportStatus;
  reviewComment: string;
  reviewedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ValidationAlert {
  section: string;
  message: string;
  severity: 'warning' | 'info';
}

export type ParcialNumber = 1 | 2 | 3 | 4;

export type ActivityAssignmentMode = 'levels' | 'schools';

export interface DistrictActivity {
  id: string;
  year: number;
  parcial: ParcialNumber;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  assignmentMode: ActivityAssignmentMode;
  targetLevels: EducationLevel[];
  targetBasicaScopes: BasicaScope[];
  targetSchoolIds: string[];
  assignedDirectorUids: string[];
  active: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ActivityCompliance {
  id: string; // `${activityId}_${schoolId}`
  activityId: string;
  year: number;
  parcial: ParcialNumber;
  schoolId: string;
  saceCode: string;
  schoolName: string;
  directorUid: string;
  completed: boolean;
  completedDate: string; // YYYY-MM-DD or ''
  note: string;
  updatedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DistrictDeadlines {
  id: string;
  year: number;
  parteMensualMonth: number;
  parteMensualDeadline: string; // YYYY-MM-DDTHH:mm
  movimientosMonth: number;
  movimientosDeadline: string; // YYYY-MM-DDTHH:mm
  annualDeadline: string; // YYYY-MM-DDTHH:mm
  parteMensualByMonth?: Record<string, string>;
  movimientosByMonth?: Record<string, string>;
  updatedByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}


