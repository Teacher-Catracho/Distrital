import type {
  AnnualReport,
  DistrictDeadlines,
  EducationLevel,
  MonthlyReport,
  ParcialNumber,
  ParteMensualReport,
  ReportStatus,
  School,
} from '../types/sace';
import {
  MONTHS,
  getDefaultParcial,
  getSchoolLevelLabel,
} from './saceCalculations';

export type DeadlineColumnKind = 'parteMensual' | 'monthly' | 'annual';

export interface DeadlineLinkedColumn {
  id: string;
  kind: DeadlineColumnKind;
  year: number;
  month?: number;
  parcial: ParcialNumber;
  title: string;
  shortHeader: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // HH:mm
  targetSchoolIds: string[];
}

export interface DeadlineSchoolLevelStatus {
  level: EducationLevel;
  levelLabel: string;
  status: ReportStatus | 'missing';
  approved: boolean;
}

export interface DeadlineSchoolEvaluation {
  completed: boolean;
  approvedCount: number;
  submittedCount: number;
  returnedCount: number;
  totalLevels: number;
  levels: DeadlineSchoolLevelStatus[];
  completedDate: string; // YYYY-MM-DD
}

function extractIsoDate(ts: unknown): string {
  if (!ts) return '';
  if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (typeof (ts as { seconds?: number }).seconds === 'number') {
    const d = new Date((ts as { seconds: number }).seconds * 1000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
    return ts.toISOString().slice(0, 10);
  }
  return '';
}

function splitDateTimeStr(val: string): { dueDate: string; dueTime: string } | null {
  const clean = (val || '').trim();
  if (clean.length < 10) return null;
  const dueDate = clean.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const rawTime = clean.length >= 16 ? clean.slice(11, 16) : '';
  const dueTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : '23:59';
  return { dueDate, dueTime };
}

/**
 * Generates automatic compliance columns from configured DistrictDeadlines
 * for Parte Mensual, Movimientos-SACE, and Cuadros de Fin de Año.
 */
export function buildDeadlineLinkedColumns(
  year: number,
  deadlines: DistrictDeadlines | null | undefined,
  activeSchools: School[]
): DeadlineLinkedColumn[] {
  if (!deadlines || deadlines.year !== year) {
    return [];
  }

  const targetSchoolIds = activeSchools.map((s) => s.id);
  const cols: DeadlineLinkedColumn[] = [];

  // 1. Parte Mensual columns
  const parteByMonth = new Map<number, string>();
  if (deadlines.parteMensualDeadline) {
    parteByMonth.set(deadlines.parteMensualMonth, deadlines.parteMensualDeadline);
  }
  if (deadlines.parteMensualByMonth) {
    for (const [mKey, dt] of Object.entries(deadlines.parteMensualByMonth)) {
      const mNum = Number(mKey);
      if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 && dt) {
        parteByMonth.set(mNum, dt);
      }
    }
  }

  for (const [month, dtStr] of Array.from(parteByMonth.entries()).sort((a, b) => a[0] - b[0])) {
    const parsed = splitDateTimeStr(dtStr);
    if (!parsed) continue;
    const monthLabel = MONTHS.find((m) => m.value === month)?.label || `Mes ${month}`;
    cols.push({
      id: `dl_parte_${year}_${month}`,
      kind: 'parteMensual',
      year,
      month,
      parcial: getDefaultParcial(month),
      title: `Parte Mensual · ${monthLabel}`,
      shortHeader: `Parte · ${monthLabel}`,
      description: `Entrega y aprobación distrital del Parte Mensual de ${monthLabel} ${year}.`,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      targetSchoolIds,
    });
  }

  // 2. Movimientos-SACE columns
  const movByMonth = new Map<number, string>();
  if (deadlines.movimientosDeadline) {
    movByMonth.set(deadlines.movimientosMonth, deadlines.movimientosDeadline);
  }
  if (deadlines.movimientosByMonth) {
    for (const [mKey, dt] of Object.entries(deadlines.movimientosByMonth)) {
      const mNum = Number(mKey);
      if (Number.isInteger(mNum) && mNum >= 1 && mNum <= 12 && dt) {
        movByMonth.set(mNum, dt);
      }
    }
  }

  for (const [month, dtStr] of Array.from(movByMonth.entries()).sort((a, b) => a[0] - b[0])) {
    const parsed = splitDateTimeStr(dtStr);
    if (!parsed) continue;
    const monthLabel = MONTHS.find((m) => m.value === month)?.label || `Mes ${month}`;
    cols.push({
      id: `dl_mov_${year}_${month}`,
      kind: 'monthly',
      year,
      month,
      parcial: getDefaultParcial(month),
      title: `Movimientos-SACE · ${monthLabel}`,
      shortHeader: `Mov. SACE · ${monthLabel}`,
      description: `Entrega y aprobación distrital de Movimientos-SACE de ${monthLabel} ${year}.`,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      targetSchoolIds,
    });
  }

  // 3. Cuadro de Fin de Año column
  if (deadlines.annualDeadline) {
    const parsed = splitDateTimeStr(deadlines.annualDeadline);
    if (parsed) {
      cols.push({
        id: `dl_annual_${year}`,
        kind: 'annual',
        year,
        parcial: 4,
        title: `Cuadro Fin de Año ${year}`,
        shortHeader: `Fin de Año ${year}`,
        description: `Entrega y aprobación distrital de los Cuadros Estadísticos Anuales ${year}.`,
        dueDate: parsed.dueDate,
        dueTime: parsed.dueTime,
        targetSchoolIds,
      });
    }
  }

  return cols;
}

/**
 * Evaluates whether a school has completed (all enabled levels approved)
 * a deadline-linked report column.
 */
export function evaluateDeadlineColumnForSchool(
  col: DeadlineLinkedColumn,
  school: School,
  parteMensualReports: ParteMensualReport[],
  monthlyReports: MonthlyReport[],
  annualReports: AnnualReport[]
): DeadlineSchoolEvaluation {
  const schoolLevels: EducationLevel[] =
    school.levels.length > 0 ? school.levels : ['basica'];

  let approvedCount = 0;
  let submittedCount = 0;
  let returnedCount = 0;
  let latestCompletedDate = '';

  const levels: DeadlineSchoolLevelStatus[] = schoolLevels.map((lvl) => {
    let matched: ParteMensualReport | MonthlyReport | AnnualReport | undefined;

    if (col.kind === 'parteMensual') {
      matched = parteMensualReports.find(
        (r) =>
          r.year === col.year &&
          r.month === col.month &&
          r.schoolId === school.id &&
          r.level === lvl
      );
    } else if (col.kind === 'monthly') {
      matched = monthlyReports.find(
        (r) =>
          r.year === col.year &&
          r.month === col.month &&
          r.schoolId === school.id &&
          r.level === lvl
      );
    } else {
      matched = annualReports.find(
        (r) => r.year === col.year && r.schoolId === school.id && r.level === lvl
      );
    }

    const status: ReportStatus | 'missing' = matched?.status ?? 'missing';
    const approved = status === 'approved';
    if (approved) {
      approvedCount++;
      const dStr = extractIsoDate(matched?.updatedAt);
      if (dStr && dStr > latestCompletedDate) {
        latestCompletedDate = dStr;
      }
    } else if (status === 'submitted') {
      submittedCount++;
    } else if (status === 'returned') {
      returnedCount++;
    }

    return {
      level: lvl,
      levelLabel: getSchoolLevelLabel(lvl, school),
      status,
      approved,
    };
  });

  return {
    completed: levels.length > 0 && approvedCount === levels.length,
    approvedCount,
    submittedCount,
    returnedCount,
    totalLevels: levels.length,
    levels,
    completedDate: latestCompletedDate,
  };
}
