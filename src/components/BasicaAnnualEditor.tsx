import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ANACount,
  AnnualReport,
  BasicaAgeKey,
  BasicaAnnualData,
  BasicaEgresadoAgeKey,
  BasicaEvalAreaKey,
  BasicaGradeKey,
  BasicaScope,
  BasicaSubjectKey,
  EstadisticoRow,
  EvaluacionFinalRow,
  FMCount,
  IBAECount,
  NVCount,
  ReportStatus,
  School,
  UserProfile,
} from '../types/sace';
import {
  BASICA_AGES,
  BASICA_CYCLE_1_2,
  BASICA_CYCLE_3,
  BASICA_EGRESADOS_AGES,
  BASICA_EVAL_AREAS,
  BASICA_RESUMEN_SUBJECTS,
  BASICA_SCOPE_LABELS,
  BASICA_SUBJECTS,
  addFM,
  addIBAE,
  addNV,
  createEmptyBasicaData,
  createEmptyBasicaResumenDenominacion,
  emptyFM,
  emptyIBAE,
  emptyNV,
  getBasicaGradesForScope,
  getBasicaScope,
  mergeParteMensualIntoEstadisticoRow,
  mergeParteMensualIntoEvaluacionRow,
  sumEstadisticoRows,
  sumEvaluacionFinalRows,
  totalANA,
  totalFM,
  totalIBAE,
  totalNV,
  type ParteMensualAnnualSummary,
} from '../utils/saceCalculations';
import { fetchAnnualSummaryFromParteMensual } from '../services/parteMensualSyncService';
import { exportBasicaExcel } from '../utils/exportExcel';
import { exportBasicaPdf } from '../utils/exportPdf';
import { NumericCell } from './NumericCell';
import { ParteMensualSyncBanner } from './ParteMensualSyncBanner';
import { StatusText } from './StatusText';

type BasicaTab =
  | 'estadistico'
  | 'edades'
  | 'areas'
  | 'evaluacion'
  | 'evaluacionAreas'
  | 'resumenDenominacion';

function normalizeBasicaData(raw?: BasicaAnnualData): BasicaAnnualData {
  const base = createEmptyBasicaData();
  if (!raw) return base;
  const resumenDenominacion = createEmptyBasicaResumenDenominacion();
  for (const g of [...BASICA_CYCLE_1_2, ...BASICA_CYCLE_3]) {
    for (const s of BASICA_RESUMEN_SUBJECTS) {
      const existingCell = raw.resumenDenominacion?.[g.key]?.[s.key];
      if (existingCell) {
        resumenDenominacion[g.key][s.key] = { ...existingCell };
      }
    }
  }
  const evaluacionPorAreas = { ...base.evaluacionPorAreas };
  for (const area of BASICA_EVAL_AREAS) {
    const areaMap = { ...base.evaluacionPorAreas[area.key] };
    for (const g of [...BASICA_CYCLE_1_2, ...BASICA_CYCLE_3]) {
      const existingAreaCell = raw.evaluacionPorAreas?.[area.key]?.[g.key];
      if (existingAreaCell) {
        areaMap[g.key] = {
          evaluados: { ...emptyFM(), ...existingAreaCell.evaluados },
          aprobados: { ...emptyFM(), ...existingAreaCell.aprobados },
          reprobados: { ...emptyFM(), ...existingAreaCell.reprobados },
        };
      }
    }
    evaluacionPorAreas[area.key] = areaMap;
  }
  return {
    ...base,
    ...raw,
    evaluacionPorAreas,
    resumenDenominacion,
  };
}

interface BasicaAnnualEditorProps {
  year: number;
  basicaScope?: BasicaScope;
  school: School;
  profile: UserProfile;
  readOnly?: boolean;
  externalData?: BasicaAnnualData;
  isConsolidated?: boolean;
  onAfterSave?: () => void;
}

export function BasicaAnnualEditor({
  year,
  basicaScope,
  school,
  profile,
  readOnly = false,
  externalData,
  isConsolidated = false,
  onAfterSave,
}: BasicaAnnualEditorProps) {
  const reportId = `${year}_${school.id}_basica`;
  const effectiveScope: BasicaScope = basicaScope || getBasicaScope(school);
  const includeC12 = effectiveScope !== 'c3';
  const includeC3 = effectiveScope !== 'c1_2';
  const activeGrades = useMemo(() => getBasicaGradesForScope(effectiveScope), [effectiveScope]);
  const [activeTab, setActiveTab] = useState<BasicaTab>('estadistico');
  const [data, setData] = useState<BasicaAnnualData>(() => normalizeBasicaData(externalData));
  const [directorName, setDirectorName] = useState(
    school.directorDisplayName || profile.displayName
  );
  const [directorDni, setDirectorDni] = useState(profile.dni || '');
  const [placeAndDate, setPlaceAndDate] = useState(`Omoa, Cortés, ${year}`);
  const [status, setStatus] = useState<ReportStatus>('draft');
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(!externalData);
  const [saving, setSaving] = useState(false);
  const [syncingPm, setSyncingPm] = useState(false);
  const [pmSummary, setPmSummary] = useState<ParteMensualAnnualSummary | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const applyPmSummaryToBasica = (
    baseData: BasicaAnnualData,
    summary: ParteMensualAnnualSummary,
    grades: typeof activeGrades
  ): BasicaAnnualData => {
    const nextEst = { ...baseData.estadisticoFinal };
    const nextEval = { ...baseData.evaluacionFinal };
    for (const g of grades) {
      const mergedEst = mergeParteMensualIntoEstadisticoRow(
        nextEst[g.key],
        summary.rows[g.key],
        summary
      );
      nextEst[g.key] = mergedEst;
      nextEval[g.key] = mergeParteMensualIntoEvaluacionRow(nextEval[g.key], mergedEst);
    }
    return { ...baseData, estadisticoFinal: nextEst, evaluacionFinal: nextEval };
  };

  useEffect(() => {
    if (externalData) {
      setPmSummary(null);
      setData(normalizeBasicaData(externalData));
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      try {
        const gradeKeys = activeGrades.map((g) => g.key);
        const [snap, summary] = await Promise.all([
          getDoc(doc(db, 'annualReports', reportId)),
          fetchAnnualSummaryFromParteMensual(year, school.id, 'basica', gradeKeys),
        ]);
        if (!active) return;

        let loadedStatus: ReportStatus = 'draft';
        let baseData = createEmptyBasicaData();
        const defaultDni =
          school.directorUid && school.directorUid === profile.uid ? profile.dni || '' : '';
        if (snap.exists()) {
          const r = snap.data() as AnnualReport;
          baseData = normalizeBasicaData(r.data as BasicaAnnualData);
          loadedStatus = r.status || 'draft';
          setDirectorName(r.directorName || school.directorDisplayName || profile.displayName);
          setDirectorDni(r.directorDni || defaultDni);
          setPlaceAndDate(r.placeAndDate || `Omoa, Cortés, ${year}`);
          setStatus(loadedStatus);
          setReviewComment(r.reviewComment || '');
        } else {
          setDirectorName(school.directorDisplayName || profile.displayName);
          setDirectorDni(defaultDni);
          setPlaceAndDate(`Omoa, Cortés, ${year}`);
          setStatus('draft');
          setReviewComment('');
        }

        const lockedAfterLoad =
          readOnly ||
          (profile.role !== 'admin' &&
            (loadedStatus === 'approved' || loadedStatus === 'submitted'));

        setPmSummary(summary);
        setData(
          !lockedAfterLoad && summary.monthsFound.length > 0
            ? applyPmSummaryToBasica(baseData, summary, activeGrades)
            : baseData
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `annualReports/${reportId}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [
    reportId,
    year,
    school.id,
    externalData,
    readOnly,
    profile.role,
    activeGrades,
    school.directorDisplayName,
    profile.displayName,
    profile.dni,
  ]);

  const isLocked =
    Boolean(externalData) ||
    readOnly ||
    (profile.role !== 'admin' && (status === 'approved' || status === 'submitted'));

  const handleSyncFromParteMensual = async () => {
    if (isLocked) return;
    setSyncingPm(true);
    setFeedback(null);
    try {
      const summary = await fetchAnnualSummaryFromParteMensual(
        year,
        school.id,
        'basica',
        activeGrades.map((g) => g.key)
      );
      setPmSummary(summary);
      if (summary.monthsFound.length === 0) {
        setFeedback({
          type: 'err',
          text: `No se encontraron reportes de Parte Mensual (Abril–Octubre) para ${year} en Nivel Básica.`,
        });
        return;
      }
      setData((prev) => applyPmSummaryToBasica(prev, summary, activeGrades));
      setFeedback({
        type: 'ok',
        text: `Matrícula, ingresos, desertores y traslados actualizados desde Parte Mensual (${summary.monthsFound.length} mes(es) de Abril–Octubre) y reflejados en el Cuadro 4.`,
      });
    } finally {
      setSyncingPm(false);
    }
  };

  const handleSyncEnrollmentToEval = () => {
    setData((prev) => {
      const nextEval = { ...prev.evaluacionFinal };
      for (const g of activeGrades) {
        const src = prev.estadisticoFinal[g.key];
        nextEval[g.key] = {
          ...nextEval[g.key],
          matInicial: { ...src.matInicial },
          matFinal: { ...src.matFinal },
          ingresos: { ...src.ingresos },
          desertores: { ...src.desertores },
          traslados: { ...src.traslados },
        };
      }
      return { ...prev, evaluacionFinal: nextEval };
    });
    setFeedback({
      type: 'ok',
      text: 'Matrícula inicial, final, ingresos, desertores y traslados sincronizados con el Cuadro 4 (Evaluación Final).',
    });
  };

  const handleSave = async (targetStatus: 'draft' | 'submitted' | 'approved') => {
    setSaving(true);
    setFeedback(null);
    const path = `annualReports/${reportId}`;
    try {
      const ref = doc(db, 'annualReports', reportId);
      const existing = await getDoc(ref);
      const validSchoolDirectorUid =
        school.directorUid && /^[a-zA-Z0-9_-]{1,128}$/.test(school.directorUid)
          ? school.directorUid
          : '';
      const isAdminActor = profile.role === 'admin';

      if (existing.exists()) {
        const existingData = existing.data() as AnnualReport;
        await updateDoc(ref, {
          schoolName: school.name,
          saceCode: school.saceCode,
          community: school.community,
          sector: school.sector,
          modality: school.modality,
          directorName: directorName.trim(),
          directorDni: directorDni.trim(),
          placeAndDate: placeAndDate.trim(),
          data,
          status: targetStatus,
          ...(isAdminActor
            ? {
                directorUid: validSchoolDirectorUid || existingData.directorUid || profile.uid,
                reviewedByUid: targetStatus === 'approved' ? profile.uid : '',
                reviewComment: targetStatus === 'approved' || targetStatus === 'submitted' ? '' : existingData.reviewComment || '',
              }
            : {}),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          year,
          schoolId: school.id,
          schoolName: school.name,
          saceCode: school.saceCode,
          community: school.community,
          sector: school.sector,
          modality: school.modality,
          level: 'basica',
          directorUid: validSchoolDirectorUid || profile.uid,
          directorName: directorName.trim(),
          directorDni: directorDni.trim(),
          placeAndDate: placeAndDate.trim(),
          data,
          status: targetStatus,
          reviewComment: '',
          reviewedByUid: isAdminActor && targetStatus === 'approved' ? profile.uid : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setStatus(targetStatus);
      if (targetStatus === 'approved' || targetStatus === 'submitted') {
        setReviewComment('');
      }
      setFeedback({
        type: 'ok',
        text:
          targetStatus === 'approved'
            ? 'Cuadros anuales de Básica guardados y aprobados oficialmente.'
            : targetStatus === 'submitted'
            ? 'Cuadros anuales de Básica enviados al Distrito para revisión.'
            : 'Borrador guardado en la nube.',
      });
      onAfterSave?.();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white border border-slate-200 p-8 h-64 animate-pulse" />;
  }

  const meta = {
    year,
    basicaScope: effectiveScope,
    schoolName: school.name,
    saceCode: school.saceCode,
    community: school.community,
    directorName,
    directorDni,
    placeAndDate,
    sector: school.sector,
    isConsolidated,
  };

  const tab5Label =
    effectiveScope === 'c1_2'
      ? '5. Áreas y Egresados 6°'
      : effectiveScope === 'c3'
      ? '5. Áreas y Egresados 9°'
      : '5. Áreas y Egresados 6°/9°';

  const tabs: { key: BasicaTab; label: string }[] = [
    { key: 'estadistico', label: '1. Estadístico Final' },
    { key: 'edades', label: '2. Matrícula por Edades' },
    { key: 'areas', label: '3. Aprobados por Área' },
    { key: 'evaluacion', label: '4. Evaluación Final' },
    { key: 'evaluacionAreas', label: tab5Label },
    { key: 'resumenDenominacion', label: '6. Resumen Asignatura (I/B/A/E)' },
  ];

  // Helpers for Tab 1
  const updateEst = (
    grade: BasicaGradeKey,
    field: keyof EstadisticoRow,
    sex: keyof NVCount,
    val: number
  ) => {
    setData((prev) => ({
      ...prev,
      estadisticoFinal: {
        ...prev.estadisticoFinal,
        [grade]: {
          ...prev.estadisticoFinal[grade],
          [field]: { ...prev.estadisticoFinal[grade][field], [sex]: val },
        },
      },
    }));
  };

  const estFields: { key: keyof EstadisticoRow; label: string }[] = [
    { key: 'matInicial', label: 'Mat. Inicial' },
    { key: 'matFinal', label: 'Mat. Final' },
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'desertores', label: 'Desertores' },
    { key: 'traslados', label: 'Traslados' },
    { key: 'aprobados', label: 'Aprobados' },
    { key: 'reprobados', label: 'Reprobados' },
    { key: 'egresados', label: 'Egresados' },
  ];

  const evalFields: { key: keyof EvaluacionFinalRow; label: string }[] = [
    { key: 'matInicial', label: 'Mat. inicial' },
    { key: 'matFinal', label: 'Mat. Final' },
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'desertores', label: 'Desertores' },
    { key: 'traslados', label: 'Traslados' },
    { key: 'evaluados', label: 'Evaluados' },
    { key: 'inicial', label: 'Inicial' },
    { key: 'basico', label: 'Básico' },
    { key: 'avanzado', label: 'Avanzado' },
    { key: 'excelente', label: 'Excelente' },
    { key: 'repitentesEvaluados', label: 'Repitentes eval.' },
  ];

  const sub12Est = sumEstadisticoRows(BASICA_CYCLE_1_2.map((g) => data.estadisticoFinal[g.key]));
  const sub3Est = sumEstadisticoRows(BASICA_CYCLE_3.map((g) => data.estadisticoFinal[g.key]));
  const totEst = sumEstadisticoRows([
    ...(includeC12 ? [sub12Est] : []),
    ...(includeC3 ? [sub3Est] : []),
  ]);

  const sub12Eval = sumEvaluacionFinalRows(BASICA_CYCLE_1_2.map((g) => data.evaluacionFinal[g.key]));
  const sub3Eval = sumEvaluacionFinalRows(BASICA_CYCLE_3.map((g) => data.evaluacionFinal[g.key]));
  const totEval = sumEvaluacionFinalRows([
    ...(includeC12 ? [sub12Eval] : []),
    ...(includeC3 ? [sub3Eval] : []),
  ]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Cuadros Estadísticos Anuales</span>
            <span aria-hidden="true">·</span>
            <span>Nivel Básica · {BASICA_SCOPE_LABELS[effectiveScope]} · {year}</span>
            {!externalData && (
              <>
                <span aria-hidden="true">·</span>
                <StatusText status={status} />
              </>
            )}
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            {school.name}{' '}
            {school.saceCode && (
              <span className="font-mono text-sm font-normal text-slate-500">
                ({school.saceCode})
              </span>
            )}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportBasicaExcel(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel (6 hojas)
          </button>
          <button
            type="button"
            onClick={() => exportBasicaPdf(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-red-700" />
            PDF Oficial
          </button>

          {!isLocked && (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('draft')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                Guardar borrador
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('submitted')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar al Distrito
              </button>
              {profile.role === 'admin' && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleSave('approved')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Guardar y aprobar
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {!externalData && status === 'returned' && reviewComment && (
        <div className="p-4 bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Cuadro devuelto con observaciones del Distrito:</p>
            <p className="mt-0.5">{reviewComment}</p>
          </div>
        </div>
      )}

      {!externalData && status === 'approved' && !readOnly && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Este reporte anual de Básica fue aprobado por el Distrito N° 18-B.</span>
        </div>
      )}

      {feedback && (
        <div
          className={`p-3 border text-xs ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {!externalData && (
        <ParteMensualSyncBanner
          year={year}
          summary={pmSummary}
          isLocked={isLocked}
          syncing={syncingPm}
          onSync={handleSyncFromParteMensual}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 p-1.5 border border-slate-200">
        <div className="flex flex-wrap items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                activeTab === t.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!isLocked && (
          <button
            type="button"
            onClick={handleSyncEnrollmentToEval}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Sincronizar matrícula al Cuadro 4
          </button>
        )}
      </div>

      {/* TAB 1: Estadístico Final */}
      {activeTab === 'estadistico' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                  GRADOS
                </th>
                {estFields.map((f) => (
                  <th
                    key={f.key}
                    colSpan={3}
                    className="px-2 py-1.5 text-center font-bold border-r border-slate-300"
                  >
                    {f.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-50/70 border-b border-slate-300">
                {estFields.map((f) => (
                  <NVHeaders key={f.key} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {includeC12 &&
                BASICA_CYCLE_1_2.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                      {g.shortLabel} ({g.label})
                    </td>
                    {estFields.map((f) => (
                      <NVCrossCells
                        key={f.key}
                        nv={data.estadisticoFinal[g.key][f.key]}
                        disabled={isLocked}
                        onChangeN={(v) => updateEst(g.key, f.key, 'n', v)}
                        onChangeV={(v) => updateEst(g.key, f.key, 'v', v)}
                      />
                    ))}
                  </tr>
                ))}
              {includeC12 && includeC3 && (
                <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                  <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10 whitespace-nowrap">
                    SUBTOTAL I-II Ciclo
                  </td>
                  {estFields.map((f) => (
                    <NVCrossCells key={f.key} nv={sub12Est[f.key]} disabled highlight />
                  ))}
                </tr>
              )}
              {includeC3 &&
                BASICA_CYCLE_3.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                      {g.shortLabel} ({g.label})
                    </td>
                    {estFields.map((f) => (
                      <NVCrossCells
                        key={f.key}
                        nv={data.estadisticoFinal[g.key][f.key]}
                        disabled={isLocked}
                        onChangeN={(v) => updateEst(g.key, f.key, 'n', v)}
                        onChangeV={(v) => updateEst(g.key, f.key, 'v', v)}
                      />
                    ))}
                  </tr>
                ))}
              {includeC12 && includeC3 && (
                <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                  <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10 whitespace-nowrap">
                    SUBTOTAL III Ciclo
                  </td>
                  {estFields.map((f) => (
                    <NVCrossCells key={f.key} nv={sub3Est[f.key]} disabled highlight />
                  ))}
                </tr>
              )}
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                  TOTAL
                </td>
                {estFields.map((f) => (
                  <NVCrossCells key={f.key} nv={totEst[f.key]} disabled highlight />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: Matrícula por Edades */}
      {activeTab === 'edades' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                  Grado
                </th>
                {BASICA_AGES.map((a) => (
                  <th key={a.key} colSpan={3} className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap">
                    {a.label}
                  </th>
                ))}
                <th colSpan={3} className="px-2 py-1.5 text-center font-bold bg-amber-50">
                  TOTAL
                </th>
              </tr>
              <tr className="bg-blue-50/70 border-b border-slate-300">
                {BASICA_AGES.map((a) => (
                  <NVHeaders key={a.key} />
                ))}
                <NVHeaders />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {activeGrades.map((g) => {
                const rowSum = BASICA_AGES.reduce(
                  (acc, age) => addNV(acc, data.matriculaEdades[g.key][age.key]),
                  emptyNV()
                );
                return (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                      {g.label}
                    </td>
                    {BASICA_AGES.map((age) => (
                      <NVCrossCells
                        key={age.key}
                        nv={data.matriculaEdades[g.key][age.key]}
                        disabled={isLocked}
                        onChangeN={(val) =>
                          setData((prev) => ({
                            ...prev,
                            matriculaEdades: {
                              ...prev.matriculaEdades,
                              [g.key]: {
                                ...prev.matriculaEdades[g.key],
                                [age.key]: { ...prev.matriculaEdades[g.key][age.key], n: val },
                              },
                            },
                          }))
                        }
                        onChangeV={(val) =>
                          setData((prev) => ({
                            ...prev,
                            matriculaEdades: {
                              ...prev.matriculaEdades,
                              [g.key]: {
                                ...prev.matriculaEdades[g.key],
                                [age.key]: { ...prev.matriculaEdades[g.key][age.key], v: val },
                              },
                            },
                          }))
                        }
                      />
                    ))}
                    <NVCrossCells nv={rowSum} disabled highlight />
                  </tr>
                );
              })}
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                  TOTAL
                </td>
                {BASICA_AGES.map((age) => {
                  const colSum = activeGrades.reduce(
                    (acc, g) => addNV(acc, data.matriculaEdades[g.key][age.key]),
                    emptyNV()
                  );
                  return <NVCrossCells key={age.key} nv={colSum} disabled highlight />;
                })}
                <NVCrossCells
                  nv={activeGrades.reduce(
                    (acc, g) =>
                      BASICA_AGES.reduce(
                        (inner, age) => addNV(inner, data.matriculaEdades[g.key][age.key]),
                        acc
                      ),
                    emptyNV()
                  )}
                  disabled
                  highlight
                />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 3: Aprobados y No Aprobados por Área */}
      {activeTab === 'areas' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                  Grado
                </th>
                {BASICA_SUBJECTS.map((s) => (
                  <th key={s.key} colSpan={3} className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap">
                    {s.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-50/70 border-b border-slate-300">
                {BASICA_SUBJECTS.map((s) => (
                  <ANAHeaders key={s.key} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {includeC12 &&
                BASICA_CYCLE_1_2.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10">
                      {g.label}
                    </td>
                    {BASICA_SUBJECTS.map((s) => (
                      <ANACells
                        key={s.key}
                        val={data.aprobadosPorArea[g.key][s.key]}
                        disabled={isLocked}
                        onChangeA={(v) =>
                          setData((prev) => ({
                            ...prev,
                            aprobadosPorArea: {
                              ...prev.aprobadosPorArea,
                              [g.key]: {
                                ...prev.aprobadosPorArea[g.key],
                                [s.key]: { ...prev.aprobadosPorArea[g.key][s.key], a: v },
                              },
                            },
                          }))
                        }
                        onChangeNA={(v) =>
                          setData((prev) => ({
                            ...prev,
                            aprobadosPorArea: {
                              ...prev.aprobadosPorArea,
                              [g.key]: {
                                ...prev.aprobadosPorArea[g.key],
                                [s.key]: { ...prev.aprobadosPorArea[g.key][s.key], na: v },
                              },
                            },
                          }))
                        }
                      />
                    ))}
                  </tr>
                ))}
              {includeC12 && includeC3 && (
                <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                  <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                    Subtotal I-II
                  </td>
                  {BASICA_SUBJECTS.map((s) => {
                    const sum = BASICA_CYCLE_1_2.reduce(
                      (acc, g) => ({
                        a: acc.a + (data.aprobadosPorArea[g.key][s.key]?.a || 0),
                        na: acc.na + (data.aprobadosPorArea[g.key][s.key]?.na || 0),
                      }),
                      { a: 0, na: 0 }
                    );
                    return <ANACells key={s.key} val={sum} disabled highlight />;
                  })}
                </tr>
              )}
              {includeC3 &&
                BASICA_CYCLE_3.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10">
                      {g.label}
                    </td>
                    {BASICA_SUBJECTS.map((s) => (
                      <ANACells
                        key={s.key}
                        val={data.aprobadosPorArea[g.key][s.key]}
                        disabled={isLocked}
                        onChangeA={(v) =>
                          setData((prev) => ({
                            ...prev,
                            aprobadosPorArea: {
                              ...prev.aprobadosPorArea,
                              [g.key]: {
                                ...prev.aprobadosPorArea[g.key],
                                [s.key]: { ...prev.aprobadosPorArea[g.key][s.key], a: v },
                              },
                            },
                          }))
                        }
                        onChangeNA={(v) =>
                          setData((prev) => ({
                            ...prev,
                            aprobadosPorArea: {
                              ...prev.aprobadosPorArea,
                              [g.key]: {
                                ...prev.aprobadosPorArea[g.key],
                                [s.key]: { ...prev.aprobadosPorArea[g.key][s.key], na: v },
                              },
                            },
                          }))
                        }
                      />
                    ))}
                  </tr>
                ))}
              {includeC12 && includeC3 && (
                <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                  <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                    Subtotal III
                  </td>
                  {BASICA_SUBJECTS.map((s) => {
                    const sum = BASICA_CYCLE_3.reduce(
                      (acc, g) => ({
                        a: acc.a + (data.aprobadosPorArea[g.key][s.key]?.a || 0),
                        na: acc.na + (data.aprobadosPorArea[g.key][s.key]?.na || 0),
                      }),
                      { a: 0, na: 0 }
                    );
                    return <ANACells key={s.key} val={sum} disabled highlight />;
                  })}
                </tr>
              )}
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                  Total
                </td>
                {BASICA_SUBJECTS.map((s) => {
                  const sum = activeGrades.reduce(
                    (acc, g) => ({
                      a: acc.a + (data.aprobadosPorArea[g.key][s.key]?.a || 0),
                      na: acc.na + (data.aprobadosPorArea[g.key][s.key]?.na || 0),
                    }),
                    { a: 0, na: 0 }
                  );
                  return <ANACells key={s.key} val={sum} disabled highlight />;
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: Evaluación Final */}
      {activeTab === 'evaluacion' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                  Grado
                </th>
                {evalFields.map((f) => (
                  <th key={f.key} colSpan={3} className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-50/70 border-b border-slate-300">
                {evalFields.map((f) => (
                  <NVHeaders key={f.key} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {includeC12 &&
                BASICA_CYCLE_1_2.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10">
                      {g.label}
                    </td>
                    {evalFields.map((f) => (
                      <NVCrossCells
                        key={f.key}
                        nv={data.evaluacionFinal[g.key][f.key]}
                        disabled={isLocked}
                        onChangeN={(v) =>
                          setData((prev) => ({
                            ...prev,
                            evaluacionFinal: {
                              ...prev.evaluacionFinal,
                              [g.key]: {
                                ...prev.evaluacionFinal[g.key],
                                [f.key]: { ...prev.evaluacionFinal[g.key][f.key], n: v },
                              },
                            },
                          }))
                        }
                        onChangeV={(v) =>
                          setData((prev) => ({
                            ...prev,
                            evaluacionFinal: {
                              ...prev.evaluacionFinal,
                              [g.key]: {
                                ...prev.evaluacionFinal[g.key],
                                [f.key]: { ...prev.evaluacionFinal[g.key][f.key], v },
                              },
                            },
                          }))
                        }
                      />
                    ))}
                  </tr>
                ))}
              {includeC12 && includeC3 && (
                <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                  <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                    Subtotal I-II
                  </td>
                  {evalFields.map((f) => (
                    <NVCrossCells key={f.key} nv={sub12Eval[f.key]} disabled highlight />
                  ))}
                </tr>
              )}
              {includeC3 &&
                BASICA_CYCLE_3.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10">
                      {g.label}
                    </td>
                    {evalFields.map((f) => (
                      <NVCrossCells
                        key={f.key}
                        nv={data.evaluacionFinal[g.key][f.key]}
                        disabled={isLocked}
                        onChangeN={(v) =>
                          setData((prev) => ({
                            ...prev,
                            evaluacionFinal: {
                              ...prev.evaluacionFinal,
                              [g.key]: {
                                ...prev.evaluacionFinal[g.key],
                                [f.key]: { ...prev.evaluacionFinal[g.key][f.key], n: v },
                              },
                            },
                          }))
                        }
                        onChangeV={(v) =>
                          setData((prev) => ({
                            ...prev,
                            evaluacionFinal: {
                              ...prev.evaluacionFinal,
                              [g.key]: {
                                ...prev.evaluacionFinal[g.key],
                                [f.key]: { ...prev.evaluacionFinal[g.key][f.key], v },
                              },
                            },
                          }))
                        }
                      />
                    ))}
                  </tr>
                ))}
              {includeC12 && includeC3 && (
                <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                  <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                    Subtotal III
                  </td>
                  {evalFields.map((f) => (
                    <NVCrossCells key={f.key} nv={sub3Eval[f.key]} disabled highlight />
                  ))}
                </tr>
              )}
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                  TOTAL
                </td>
                {evalFields.map((f) => (
                  <NVCrossCells key={f.key} nv={totEval[f.key]} disabled highlight />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: Evaluación por Áreas + Egresados 6°/9° */}
      {activeTab === 'evaluacionAreas' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 grid grid-cols-1 gap-6">
            {BASICA_EVAL_AREAS.map((area) => {
              let sumEv = emptyFM();
              let sumAp = emptyFM();
              let sumRep = emptyFM();
              for (const g of activeGrades) {
                const cell = data.evaluacionPorAreas[area.key][g.key];
                sumEv = addFM(sumEv, cell.evaluados);
                sumAp = addFM(sumAp, cell.aprobados);
                sumRep = addFM(sumRep, cell.reprobados);
              }
              return (
                <div key={area.key} className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-amber-100/80 border-b border-slate-300">
                        <th colSpan={10} className="px-3 py-2 text-center font-bold text-slate-900">
                          {area.label}
                        </th>
                      </tr>
                      <tr className="bg-amber-50 border-b border-slate-300">
                        <th rowSpan={2} className="px-2.5 py-1.5 text-left font-bold border-r border-slate-300">
                          GRADO
                        </th>
                        <th colSpan={3} className="px-2 py-1 text-center font-bold border-r border-slate-300">
                          EVALUADOS
                        </th>
                        <th colSpan={3} className="px-2 py-1 text-center font-bold border-r border-slate-300">
                          APROBADOS
                        </th>
                        <th colSpan={3} className="px-2 py-1 text-center font-bold">
                          REPROBADOS
                        </th>
                      </tr>
                      <tr className="bg-slate-50 border-b border-slate-300">
                        <FMHeaders />
                        <FMHeaders />
                        <FMHeaders />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeGrades.map((g) => {
                        const cell = data.evaluacionPorAreas[area.key][g.key];
                        const updateAreaFM = (
                          bucket: 'evaluados' | 'aprobados' | 'reprobados',
                          sex: keyof FMCount,
                          val: number
                        ) => {
                          setData((prev) => ({
                            ...prev,
                            evaluacionPorAreas: {
                              ...prev.evaluacionPorAreas,
                              [area.key]: {
                                ...prev.evaluacionPorAreas[area.key],
                                [g.key]: {
                                  ...prev.evaluacionPorAreas[area.key][g.key],
                                  [bucket]: {
                                    ...prev.evaluacionPorAreas[area.key][g.key][bucket],
                                    [sex]: val,
                                  },
                                },
                              },
                            },
                          }));
                        };
                        return (
                          <tr key={g.key} className="hover:bg-slate-50/70">
                            <td className="px-2.5 py-1 font-medium border-r border-slate-200">
                              {g.shortLabel}
                            </td>
                            <FMCells
                              fm={cell.evaluados}
                              disabled={isLocked}
                              onF={(v) => updateAreaFM('evaluados', 'f', v)}
                              onM={(v) => updateAreaFM('evaluados', 'm', v)}
                            />
                            <FMCells
                              fm={cell.aprobados}
                              disabled={isLocked}
                              onF={(v) => updateAreaFM('aprobados', 'f', v)}
                              onM={(v) => updateAreaFM('aprobados', 'm', v)}
                            />
                            <FMCells
                              fm={cell.reprobados}
                              disabled={isLocked}
                              onF={(v) => updateAreaFM('reprobados', 'f', v)}
                              onM={(v) => updateAreaFM('reprobados', 'm', v)}
                            />
                          </tr>
                        );
                      })}
                      <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                        <td className="px-2.5 py-1.5 border-r border-slate-300">Total</td>
                        <FMCells fm={sumEv} disabled highlight />
                        <FMCells fm={sumAp} disabled highlight />
                        <FMCells fm={sumRep} disabled highlight />
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <div className="xl:col-span-4 bg-white border border-slate-200 overflow-x-auto xl:sticky xl:top-4">
            <div className="p-3 bg-blue-50 border-b border-slate-300 space-y-1">
              <h3 className="font-display text-xs font-bold text-slate-900">
                {effectiveScope === 'c1_2'
                  ? 'Egresadas(os) de 6° grado según edad y sexo'
                  : effectiveScope === 'c3'
                  ? 'Egresadas(os) de 9° grado según edad y sexo'
                  : 'Egresadas(os) de 6° o 9° grado según edad y sexo'}
              </h3>
              <p className="text-[11px] text-slate-600 leading-snug">
                Incluye aprobados en exámenes ordinarios y extraordinarios.
              </p>
            </div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-300">
                  <th className="px-2.5 py-1.5 text-left font-bold border-r border-slate-200">EDAD</th>
                  <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200">F</th>
                  <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200">M</th>
                  <th className="px-2 py-1.5 text-center font-bold">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {BASICA_EGRESADOS_AGES.map((age) => {
                  const fm = data.egresadosPorEdad[age.key];
                  return (
                    <tr key={age.key} className="hover:bg-slate-50/70">
                      <td className="px-2.5 py-1 border-r border-slate-200">{age.label}</td>
                      <FMCells
                        fm={fm}
                        disabled={isLocked}
                        onF={(v) =>
                          setData((prev) => ({
                            ...prev,
                            egresadosPorEdad: {
                              ...prev.egresadosPorEdad,
                              [age.key]: { ...prev.egresadosPorEdad[age.key], f: v },
                            },
                          }))
                        }
                        onM={(v) =>
                          setData((prev) => ({
                            ...prev,
                            egresadosPorEdad: {
                              ...prev.egresadosPorEdad,
                              [age.key]: { ...prev.egresadosPorEdad[age.key], m: v },
                            },
                          }))
                        }
                      />
                    </tr>
                  );
                })}
                <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                  <td className="px-2.5 py-1.5 border-r border-slate-300">Total</td>
                  <FMCells
                    fm={BASICA_EGRESADOS_AGES.reduce(
                      (acc, age) => addFM(acc, data.egresadosPorEdad[age.key]),
                      emptyFM()
                    )}
                    disabled
                    highlight
                  />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: Cuadro Resumen por Asignatura (por Denominación de Notas) */}
      {activeTab === 'resumenDenominacion' && (() => {
        const resumenMap = data.resumenDenominacion || createEmptyBasicaResumenDenominacion();

        const updateIBAE = (
          gradeKey: BasicaGradeKey,
          subjKey: BasicaSubjectKey,
          field: keyof IBAECount,
          nextVal: number
        ) => {
          setData((prev) => {
            const prevResumen = prev.resumenDenominacion || createEmptyBasicaResumenDenominacion();
            return {
              ...prev,
              resumenDenominacion: {
                ...prevResumen,
                [gradeKey]: {
                  ...prevResumen[gradeKey],
                  [subjKey]: {
                    ...prevResumen[gradeKey][subjKey],
                    [field]: nextVal,
                  },
                },
              },
            };
          });
        };

        const sumGroupBySubject = (
          grades: typeof BASICA_CYCLE_1_2,
          subjKey: BasicaSubjectKey
        ): IBAECount =>
          grades.reduce(
            (acc, g) => addIBAE(acc, resumenMap[g.key]?.[subjKey]),
            emptyIBAE()
          );

        return (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Cuadro Resumen por Asignatura (por Denominación de Notas)
                </h3>
                <p className="text-xs text-slate-500">
                  Distribución por escala: I (Insatisfactorio), B (Básico/Bueno), A (Avanzado), E (Excelente) y Total (T).
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2.5 py-1 border border-slate-300 bg-slate-50 font-semibold text-slate-800">
                  {school.sector === 'no_gubernamental' ? 'NO GUBERNAMENTAL' : 'GUBERNAMENTAL'}
                </span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-purple-50 border-b border-slate-300">
                    <th
                      rowSpan={2}
                      className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-purple-50 z-10"
                    >
                      GRADOS
                    </th>
                    {BASICA_RESUMEN_SUBJECTS.map((s) => (
                      <th
                        key={s.key}
                        colSpan={5}
                        className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap"
                      >
                        {s.label}
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-slate-50 border-b border-slate-300">
                    {BASICA_RESUMEN_SUBJECTS.map((s) => (
                      <IBAEHeaders key={s.key} />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {includeC12 &&
                    BASICA_CYCLE_1_2.map((g) => (
                      <tr key={g.key} className="hover:bg-slate-50/60">
                        <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 uppercase">
                          {g.label}
                        </td>
                        {BASICA_RESUMEN_SUBJECTS.map((s) => (
                          <IBAECells
                            key={s.key}
                            val={resumenMap[g.key]?.[s.key] || emptyIBAE()}
                            disabled={isLocked}
                            onChange={(field, next) => updateIBAE(g.key, s.key, field, next)}
                          />
                        ))}
                      </tr>
                    ))}

                  {includeC12 && includeC3 && (
                    <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                      <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                        SUB TOTAL
                      </td>
                      {BASICA_RESUMEN_SUBJECTS.map((s) => (
                        <IBAECells
                          key={s.key}
                          val={sumGroupBySubject(BASICA_CYCLE_1_2, s.key)}
                          disabled
                          highlight
                        />
                      ))}
                    </tr>
                  )}

                  {includeC3 &&
                    BASICA_CYCLE_3.map((g) => (
                      <tr key={g.key} className="hover:bg-slate-50/60">
                        <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 uppercase">
                          {g.label}
                        </td>
                        {BASICA_RESUMEN_SUBJECTS.map((s) => (
                          <IBAECells
                            key={s.key}
                            val={resumenMap[g.key]?.[s.key] || emptyIBAE()}
                            disabled={isLocked}
                            onChange={(field, next) => updateIBAE(g.key, s.key, field, next)}
                          />
                        ))}
                      </tr>
                    ))}

                  {includeC12 && includeC3 && (
                    <tr className="bg-emerald-50/60 font-bold border-y border-slate-300">
                      <td className="px-3 py-1.5 border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                        SUB TOTAL
                      </td>
                      {BASICA_RESUMEN_SUBJECTS.map((s) => (
                        <IBAECells
                          key={s.key}
                          val={sumGroupBySubject(BASICA_CYCLE_3, s.key)}
                          disabled
                          highlight
                        />
                      ))}
                    </tr>
                  )}

                  <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                    <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                      TOTAL
                    </td>
                    {BASICA_RESUMEN_SUBJECTS.map((s) => (
                      <IBAECells
                        key={s.key}
                        val={sumGroupBySubject(activeGrades, s.key)}
                        disabled
                        highlight
                      />
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {!externalData && (
        <div className="bg-white border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Nombre del Director(a)
            </label>
            <input
              type="text"
              disabled={isLocked}
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              N° Identidad del Director(a)
            </label>
            <input
              type="text"
              disabled={isLocked}
              value={directorDni}
              onChange={(e) => setDirectorDni(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono border border-slate-300 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Lugar y fecha
            </label>
            <input
              type="text"
              disabled={isLocked}
              value={placeAndDate}
              onChange={(e) => setPlaceAndDate(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 disabled:bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NVHeaders() {
  return (
    <>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">N</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">V</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-300">T</th>
    </>
  );
}

function ANAHeaders() {
  return (
    <>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">A</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">NA</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-300">T</th>
    </>
  );
}

function FMHeaders() {
  return (
    <>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">F</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">M</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-300">T</th>
    </>
  );
}

function IBAEHeaders() {
  return (
    <>
      <th className="px-1.5 py-1 text-center font-semibold border-r border-slate-200">I</th>
      <th className="px-1.5 py-1 text-center font-semibold border-r border-slate-200">B</th>
      <th className="px-1.5 py-1 text-center font-semibold border-r border-slate-200">A</th>
      <th className="px-1.5 py-1 text-center font-semibold border-r border-slate-200">E</th>
      <th className="px-1.5 py-1 text-center font-semibold border-r border-slate-300">T</th>
    </>
  );
}

function NVCrossCells({
  nv,
  disabled,
  highlight,
  onChangeN,
  onChangeV,
}: {
  nv: NVCount;
  disabled?: boolean;
  highlight?: boolean;
  onChangeN?: (v: number) => void;
  onChangeV?: (v: number) => void;
}) {
  return (
    <>
      <td className="p-1 border-r border-slate-200">
        <NumericCell value={nv.n} disabled={disabled} highlight={highlight} onChange={onChangeN} />
      </td>
      <td className="p-1 border-r border-slate-200">
        <NumericCell value={nv.v} disabled={disabled} highlight={highlight} onChange={onChangeV} />
      </td>
      <td className="px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums bg-slate-50 text-slate-900 border-r border-slate-300">
        {totalNV(nv)}
      </td>
    </>
  );
}

function ANACells({
  val,
  disabled,
  highlight,
  onChangeA,
  onChangeNA,
}: {
  val: ANACount;
  disabled?: boolean;
  highlight?: boolean;
  onChangeA?: (v: number) => void;
  onChangeNA?: (v: number) => void;
}) {
  return (
    <>
      <td className="p-1 border-r border-slate-200">
        <NumericCell value={val.a} disabled={disabled} highlight={highlight} onChange={onChangeA} />
      </td>
      <td className="p-1 border-r border-slate-200">
        <NumericCell value={val.na} disabled={disabled} highlight={highlight} onChange={onChangeNA} />
      </td>
      <td className="px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums bg-slate-50 text-slate-900 border-r border-slate-300">
        {totalANA(val)}
      </td>
    </>
  );
}

function FMCells({
  fm,
  disabled,
  highlight,
  onF,
  onM,
}: {
  fm: FMCount;
  disabled?: boolean;
  highlight?: boolean;
  onF?: (v: number) => void;
  onM?: (v: number) => void;
}) {
  return (
    <>
      <td className="p-1 border-r border-slate-200">
        <NumericCell value={fm.f} disabled={disabled} highlight={highlight} onChange={onF} />
      </td>
      <td className="p-1 border-r border-slate-200">
        <NumericCell value={fm.m} disabled={disabled} highlight={highlight} onChange={onM} />
      </td>
      <td className="px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums bg-slate-50 text-slate-900 border-r border-slate-300">
        {totalFM(fm)}
      </td>
    </>
  );
}

function IBAECells({
  val,
  disabled,
  highlight,
  onChange,
}: {
  val: IBAECount;
  disabled?: boolean;
  highlight?: boolean;
  onChange?: (field: keyof IBAECount, next: number) => void;
}) {
  return (
    <>
      {(['i', 'b', 'a', 'e'] as (keyof IBAECount)[]).map((k) => (
        <td key={k} className="p-1 border-r border-slate-200">
          <NumericCell
            value={val[k]}
            disabled={disabled}
            highlight={highlight}
            onChange={(v) => onChange?.(k, v)}
          />
        </td>
      ))}
      <td className="px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums bg-slate-50 text-slate-900 border-r border-slate-300">
        {totalIBAE(val)}
      </td>
    </>
  );
}
