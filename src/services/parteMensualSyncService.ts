import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { EducationLevel, ParteMensualReport } from '../types/sace';
import {
  computeAnnualEstadisticoFromPartesMensuales,
  type ParteMensualAnnualSummary,
} from '../utils/saceCalculations';

export const ANNUAL_SYNC_MONTHS = [4, 5, 6, 7, 8, 9, 10] as const;

export function computeAnnualSummaryFromLoadedPartes(
  reports: ParteMensualReport[],
  year: number,
  schoolId: string,
  level: EducationLevel,
  gradeKeys: string[]
): ParteMensualAnnualSummary {
  const monthSet = new Set<number>(ANNUAL_SYNC_MONTHS);
  const matching = reports.filter(
    (r) =>
      r.year === year &&
      r.schoolId === schoolId &&
      r.level === level &&
      monthSet.has(r.month)
  );
  return computeAnnualEstadisticoFromPartesMensuales(matching, gradeKeys);
}

export async function fetchAnnualSummaryFromParteMensual(
  year: number,
  schoolId: string,
  level: EducationLevel,
  gradeKeys: string[]
): Promise<ParteMensualAnnualSummary> {
  const reports = await Promise.all(
    ANNUAL_SYNC_MONTHS.map(async (month) => {
      const reportId = `${year}_${String(month).padStart(2, '0')}_${schoolId}_${level}`;
      const path = `parteMensualReports/${reportId}`;
      try {
        const snap = await getDoc(doc(db, 'parteMensualReports', reportId));
        if (!snap.exists()) return null;
        return { id: snap.id, ...(snap.data() as Omit<ParteMensualReport, 'id'>) };
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, path);
        return null;
      }
    })
  );

  const found = reports.filter((r): r is ParteMensualReport => r !== null);
  return computeAnnualEstadisticoFromPartesMensuales(found, gradeKeys);
}
