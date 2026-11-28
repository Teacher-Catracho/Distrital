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
  EstadisticoRow,
  EvaluacionFinalRow,
  IBAECount,
  MediaAnnualData,
  MediaGradeKey,
  ModalityType,
  NVCount,
  ParteMensualReport,
  ReportStatus,
  School,
  SectorType,
  UserProfile,
} from '../types/sace';
import {
  MEDIA_AGES,
  MEDIA_DECIMO_SUBJECTS,
  MEDIA_GRADES,
  MEDIA_RESUMEN_SUBJECTS,
  MEDIA_UNDECIMO_SUBJECTS,
  addIBAE,
  addNV,
  createEmptyMediaData,
  emptyIBAE,
  emptyNV,
  mergeParteMensualIntoEstadisticoRow,
  mergeParteMensualIntoEvaluacionRow,
  sumEstadisticoRows,
  sumEvaluacionFinalRows,
  totalANA,
  totalIBAE,
  totalNV,
  type ParteMensualAnnualSummary,
} from '../utils/saceCalculations';
import {
  computeAnnualSummaryFromLoadedPartes,
  fetchAnnualSummaryFromParteMensual,
} from '../services/parteMensualSyncService';
import { exportMediaExcel } from '../utils/exportExcel';
import { exportMediaPdf } from '../utils/exportPdf';
import { NumericCell } from './NumericCell';
import { ParteMensualSyncBanner } from './ParteMensualSyncBanner';
import { StatusText } from './StatusText';

type MediaTab = 'estadistico' | 'edades' | 'asignaturas' | 'evaluacion' | 'denominacion';

interface MediaAnnualEditorProps {
  year: number;
  school: School;
  profile: UserProfile;
  readOnly?: boolean;
  reviewMode?: boolean;
  externalData?: MediaAnnualData;
  isConsolidated?: boolean;
  prefetchedReport?: AnnualReport | null;
  prefetchedLoaded?: boolean;
  prefetchedParteMensualReports?: ParteMensualReport[];
  onAfterSave?: () => void;
}

export function MediaAnnualEditor({
  year,
  school,
  profile,
  readOnly = false,
  reviewMode = false,
  externalData,
  isConsolidated = false,
  prefetchedReport,
  prefetchedLoaded = false,
  prefetchedParteMensualReports,
  onAfterSave,
}: MediaAnnualEditorProps) {
  const reportId = `${year}_${school.id}_media`;
  const [activeTab, setActiveTab] = useState<MediaTab>('estadistico');
  const [data, setData] = useState<MediaAnnualData>(() => externalData || createEmptyMediaData());
  const [sector, setSector] = useState<SectorType>(school.sector || 'gubernamental');
  const [modality, setModality] = useState<ModalityType>(school.modality || 'presencial');
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
  const [existingMeta, setExistingMeta] = useState<{
    exists: boolean;
    directorUid?: string;
    directorName?: string;
    reviewedByUid?: string;
    reviewComment?: string;
  }>({ exists: false });

  const applyPmSummaryToMedia = (
    baseData: MediaAnnualData,
    summary: ParteMensualAnnualSummary
  ): MediaAnnualData => {
    const nextEst = { ...baseData.estadisticoFinal };
    const nextEval = { ...baseData.evaluacionFinal };
    for (const g of MEDIA_GRADES) {
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
      setData(externalData);
      setLoading(false);
      return;
    }

    const gradeKeys = MEDIA_GRADES.map((g) => g.key);
    const applyLoaded = (
      reportDoc: AnnualReport | null,
      summary: ParteMensualAnnualSummary
    ) => {
      let loadedStatus: ReportStatus = 'draft';
      let baseData = createEmptyMediaData();
      const defaultDni =
        school.directorUid && school.directorUid === profile.uid ? profile.dni || '' : '';
      if (reportDoc) {
        baseData = (reportDoc.data as MediaAnnualData) || createEmptyMediaData();
        loadedStatus = reportDoc.status || 'draft';
        setSector(reportDoc.sector || school.sector || 'gubernamental');
        setModality(reportDoc.modality || school.modality || 'presencial');
        setDirectorName(
          reportDoc.directorName || school.directorDisplayName || profile.displayName
        );
        setDirectorDni(reportDoc.directorDni || defaultDni);
        setPlaceAndDate(reportDoc.placeAndDate || `Omoa, Cortés, ${year}`);
        setStatus(loadedStatus);
        setReviewComment(reportDoc.reviewComment || '');
        setExistingMeta({
          exists: true,
          directorUid: reportDoc.directorUid,
          directorName: reportDoc.directorName,
          reviewedByUid: reportDoc.reviewedByUid,
          reviewComment: reportDoc.reviewComment,
        });
      } else {
        setSector(school.sector || 'gubernamental');
        setModality(school.modality || 'presencial');
        setDirectorName(school.directorDisplayName || profile.displayName);
        setDirectorDni(defaultDni);
        setPlaceAndDate(`Omoa, Cortés, ${year}`);
        setStatus('draft');
        setReviewComment('');
        setExistingMeta({ exists: false });
      }

      const shouldAutoApplyPm =
        !reviewMode &&
        !readOnly &&
        loadedStatus !== 'approved' &&
        loadedStatus !== 'submitted' &&
        summary.monthsFound.length > 0;

      setPmSummary(summary);
      setData(shouldAutoApplyPm ? applyPmSummaryToMedia(baseData, summary) : baseData);
    };

    const hasPrefetchedReport =
      prefetchedReport !== undefined && (prefetchedReport !== null || prefetchedLoaded);
    const hasPrefetchedPartes = prefetchedParteMensualReports !== undefined;

    if (hasPrefetchedReport && hasPrefetchedPartes) {
      const summary = computeAnnualSummaryFromLoadedPartes(
        prefetchedParteMensualReports,
        year,
        school.id,
        'media',
        gradeKeys
      );
      applyLoaded(prefetchedReport ?? null, summary);
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      try {
        const [reportDoc, summary] = await Promise.all([
          hasPrefetchedReport
            ? Promise.resolve(prefetchedReport ?? null)
            : getDoc(doc(db, 'annualReports', reportId)).then((snap) =>
                snap.exists() ? (snap.data() as AnnualReport) : null
              ),
          hasPrefetchedPartes
            ? Promise.resolve(
                computeAnnualSummaryFromLoadedPartes(
                  prefetchedParteMensualReports,
                  year,
                  school.id,
                  'media',
                  gradeKeys
                )
              )
            : fetchAnnualSummaryFromParteMensual(year, school.id, 'media', gradeKeys),
        ]);
        if (!active) return;
        applyLoaded(reportDoc, summary);
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
    reviewMode,
    readOnly,
    school.sector,
    school.modality,
    school.directorUid,
    school.directorDisplayName,
    profile.displayName,
    profile.dni,
    profile.uid,
    prefetchedReport,
    prefetchedLoaded,
    prefetchedParteMensualReports,
  ]);

  const isAdminActor =
    profile.role === 'admin' || profile.adminPosition === 'asistente_tecnico';
  const isLocked =
    Boolean(externalData) ||
    readOnly ||
    (!isAdminActor && (status === 'approved' || status === 'submitted'));

  const handleSyncFromParteMensual = async () => {
    if (isLocked) return;
    setSyncingPm(true);
    setFeedback(null);
    try {
      const gradeKeys = MEDIA_GRADES.map((g) => g.key);
      const summary =
        isAdminActor && prefetchedParteMensualReports !== undefined && prefetchedLoaded
          ? computeAnnualSummaryFromLoadedPartes(
              prefetchedParteMensualReports,
              year,
              school.id,
              'media',
              gradeKeys
            )
          : await fetchAnnualSummaryFromParteMensual(year, school.id, 'media', gradeKeys);
      setPmSummary(summary);
      if (summary.monthsFound.length === 0) {
        setFeedback({
          type: 'err',
          text: `No se encontraron reportes de Parte Mensual (Abril–Octubre) para ${year} en Nivel Medio.`,
        });
        return;
      }
      setData((prev) => applyPmSummaryToMedia(prev, summary));
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
      for (const g of MEDIA_GRADES) {
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
      text: 'Matrícula sincronizada del Cuadro 1 al Cuadro 4 (Evaluación Final Media).',
    });
  };

  const handleSave = async (targetStatus: ReportStatus) => {
    setSaving(true);
    setFeedback(null);
    const path = `annualReports/${reportId}`;
    try {
      const ref = doc(db, 'annualReports', reportId);
      const validSchoolDirectorUid =
        school.directorUid && /^[a-zA-Z0-9_-]{1,128}$/.test(school.directorUid)
          ? school.directorUid
          : '';

      if (existingMeta.exists) {
        const cleanDirectorName =
          directorName.trim() ||
          school.directorDisplayName ||
          existingMeta.directorName ||
          profile.displayName;
        const nextDirectorUid = validSchoolDirectorUid || existingMeta.directorUid || profile.uid;
        const nextReviewedByUid =
          targetStatus === 'approved'
            ? profile.uid
            : targetStatus === 'returned'
            ? existingMeta.reviewedByUid || profile.uid
            : '';
        const nextReviewComment =
          targetStatus === 'approved' || targetStatus === 'submitted'
            ? ''
            : existingMeta.reviewComment || '';

        await updateDoc(ref, {
          schoolName: school.name,
          saceCode: school.saceCode,
          community: school.community,
          sector,
          modality,
          directorName: cleanDirectorName,
          directorDni: directorDni.trim(),
          placeAndDate: placeAndDate.trim(),
          data,
          status: targetStatus,
          ...(isAdminActor
            ? {
                directorUid: nextDirectorUid,
                reviewedByUid: nextReviewedByUid,
                reviewComment: nextReviewComment,
              }
            : {}),
          updatedAt: serverTimestamp(),
        });
        setExistingMeta({
          exists: true,
          directorName: cleanDirectorName,
          directorUid: isAdminActor ? nextDirectorUid : existingMeta.directorUid,
          reviewedByUid: isAdminActor ? nextReviewedByUid : existingMeta.reviewedByUid,
          reviewComment: isAdminActor ? nextReviewComment : existingMeta.reviewComment,
        });
      } else {
        const cleanDirectorName =
          directorName.trim() || school.directorDisplayName || profile.displayName;
        const nextDirectorUid = validSchoolDirectorUid || profile.uid;
        const nextReviewedByUid = isAdminActor && targetStatus === 'approved' ? profile.uid : '';
        await setDoc(ref, {
          year,
          schoolId: school.id,
          schoolName: school.name,
          saceCode: school.saceCode,
          community: school.community,
          sector,
          modality,
          level: 'media',
          directorUid: nextDirectorUid,
          directorName: cleanDirectorName,
          directorDni: directorDni.trim(),
          placeAndDate: placeAndDate.trim(),
          data,
          status: targetStatus,
          reviewComment: '',
          reviewedByUid: nextReviewedByUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setExistingMeta({
          exists: true,
          directorName: cleanDirectorName,
          directorUid: nextDirectorUid,
          reviewedByUid: nextReviewedByUid,
          reviewComment: '',
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
            ? 'Cuadros anuales de Nivel Medio guardados y aprobados oficialmente.'
            : reviewMode
            ? 'Cambios guardados correctamente en los cuadros anuales de Nivel Medio.'
            : targetStatus === 'submitted'
            ? 'Cuadros anuales de Nivel Medio enviados al Distrito.'
            : 'Borrador guardado correctamente.',
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
    schoolName: school.name,
    saceCode: school.saceCode,
    community: school.community,
    directorName,
    directorDni,
    placeAndDate,
    sector,
    modality,
    isConsolidated,
  };

  const tabs: { key: MediaTab; label: string }[] = [
    { key: 'estadistico', label: '1. Estadístico Final' },
    { key: 'edades', label: '2. Matrícula por Edades' },
    { key: 'asignaturas', label: '3. Aprobados por Asignatura' },
    { key: 'evaluacion', label: '4. Evaluación Final' },
    { key: 'denominacion', label: '5. Resumen Asignatura (I/B/A/E)' },
  ];

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

  const totEst = sumEstadisticoRows(MEDIA_GRADES.map((g) => data.estadisticoFinal[g.key]));
  const totEval = sumEvaluacionFinalRows(MEDIA_GRADES.map((g) => data.evaluacionFinal[g.key]));

  const updateEst = (
    grade: MediaGradeKey,
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

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Cuadros Estadísticos Anuales</span>
            <span aria-hidden="true">·</span>
            <span>Nivel Medio {year}</span>
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
            onClick={() => exportMediaExcel(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel (5 hojas)
          </button>
          <button
            type="button"
            onClick={() => exportMediaPdf(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-red-700" />
            PDF Oficial
          </button>

          {!isLocked && (
            <>
              {reviewMode ? (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSave(status)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Guardar cambios
                  </button>
                  {isAdminActor && status !== 'approved' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSave('approved')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Guardar y aprobar
                    </button>
                  )}
                </>
              ) : (
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
                  {isAdminActor && (
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
          <span>Este reporte anual de Media fue aprobado por el Distrito N° 18-B.</span>
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

      {/* TAB 1: Estadístico Final Media */}
      {activeTab === 'estadistico' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                  GRADOS
                </th>
                {estFields.map((f) => (
                  <th key={f.key} colSpan={3} className="px-2 py-1.5 text-center font-bold border-r border-slate-300">
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
              {MEDIA_GRADES.map((g) => (
                <tr key={g.key} className="hover:bg-slate-50/60">
                  <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 uppercase">
                    {g.label}
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

      {/* TAB 2: Matrícula por Edades Media */}
      {activeTab === 'edades' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10">
                  Grado
                </th>
                {MEDIA_AGES.map((a) => (
                  <th key={a.key} colSpan={3} className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap">
                    {a.label}
                  </th>
                ))}
                <th colSpan={3} className="px-2 py-1.5 text-center font-bold bg-amber-50">
                  TOTAL
                </th>
              </tr>
              <tr className="bg-blue-50/70 border-b border-slate-300">
                {MEDIA_AGES.map((a) => (
                  <NVHeaders key={a.key} />
                ))}
                <NVHeaders />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {MEDIA_GRADES.map((g) => {
                const rowSum = MEDIA_AGES.reduce(
                  (acc, age) => addNV(acc, data.matriculaEdades[g.key][age.key]),
                  emptyNV()
                );
                return (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 uppercase">
                      {g.label}
                    </td>
                    {MEDIA_AGES.map((age) => (
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
                  Total
                </td>
                {MEDIA_AGES.map((age) => {
                  const colSum = MEDIA_GRADES.reduce(
                    (acc, g) => addNV(acc, data.matriculaEdades[g.key][age.key]),
                    emptyNV()
                  );
                  return <NVCrossCells key={age.key} nv={colSum} disabled highlight />;
                })}
                <NVCrossCells
                  nv={MEDIA_GRADES.reduce(
                    (acc, g) =>
                      MEDIA_AGES.reduce(
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

      {/* TAB 3: Aprobados por Asignatura (Décimo & Undécimo) */}
      {activeTab === 'asignaturas' && (
        <div className="space-y-4">
          {!externalData && (
            <div className="bg-white border border-slate-200 p-4 flex flex-wrap items-center gap-6">
              <span className="text-xs font-semibold text-slate-800">Modalidad del Instituto:</span>
              {(['presencial', 'isemed', 'acelerado'] as ModalityType[]).map((m) => (
                <label key={m} className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="mediaModality"
                    disabled={isLocked}
                    checked={modality === m}
                    onChange={() => setModality(m)}
                  />
                  {m.toUpperCase()}
                </label>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 overflow-x-auto">
              <div className="px-4 py-2.5 bg-emerald-50 border-b border-slate-300 font-display text-xs font-bold text-slate-900">
                DÉCIMO GRADO
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300">
                    <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200 w-10">N°</th>
                    <th className="px-3 py-1.5 text-left font-bold border-r border-slate-200">MATERIA</th>
                    <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200">A</th>
                    <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200">NA</th>
                    <th className="px-2 py-1.5 text-center font-bold">T</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {MEDIA_DECIMO_SUBJECTS.map((s, idx) => {
                    const val: ANACount = data.aprobadosAsignatura.decimo[s.key];
                    return (
                      <tr key={s.key} className="hover:bg-slate-50/70">
                        <td className="px-2 py-1 text-center font-mono text-slate-500 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-1 font-medium text-slate-900 border-r border-slate-200">
                          {s.label}
                        </td>
                        <td className="p-1 border-r border-slate-200">
                          <NumericCell
                            value={val.a}
                            disabled={isLocked}
                            onChange={(v) =>
                              setData((prev) => ({
                                ...prev,
                                aprobadosAsignatura: {
                                  ...prev.aprobadosAsignatura,
                                  decimo: {
                                    ...prev.aprobadosAsignatura.decimo,
                                    [s.key]: { ...prev.aprobadosAsignatura.decimo[s.key], a: v },
                                  },
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="p-1 border-r border-slate-200">
                          <NumericCell
                            value={val.na}
                            disabled={isLocked}
                            onChange={(v) =>
                              setData((prev) => ({
                                ...prev,
                                aprobadosAsignatura: {
                                  ...prev.aprobadosAsignatura,
                                  decimo: {
                                    ...prev.aprobadosAsignatura.decimo,
                                    [s.key]: { ...prev.aprobadosAsignatura.decimo[s.key], na: v },
                                  },
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-semibold tabular-nums bg-slate-50">
                          {totalANA(val)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 overflow-x-auto">
              <div className="px-4 py-2.5 bg-emerald-50 border-b border-slate-300 font-display text-xs font-bold text-slate-900">
                UNDÉCIMO GRADO
              </div>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-300">
                    <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200 w-10">N°</th>
                    <th className="px-3 py-1.5 text-left font-bold border-r border-slate-200">MATERIA</th>
                    <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200">A</th>
                    <th className="px-2 py-1.5 text-center font-bold border-r border-slate-200">NA</th>
                    <th className="px-2 py-1.5 text-center font-bold">T</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {MEDIA_UNDECIMO_SUBJECTS.map((s, idx) => {
                    const val: ANACount = data.aprobadosAsignatura.undecimo[s.key];
                    return (
                      <tr key={s.key} className="hover:bg-slate-50/70">
                        <td className="px-2 py-1 text-center font-mono text-slate-500 border-r border-slate-200">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-1 font-medium text-slate-900 border-r border-slate-200">
                          {s.label}
                        </td>
                        <td className="p-1 border-r border-slate-200">
                          <NumericCell
                            value={val.a}
                            disabled={isLocked}
                            onChange={(v) =>
                              setData((prev) => ({
                                ...prev,
                                aprobadosAsignatura: {
                                  ...prev.aprobadosAsignatura,
                                  undecimo: {
                                    ...prev.aprobadosAsignatura.undecimo,
                                    [s.key]: { ...prev.aprobadosAsignatura.undecimo[s.key], a: v },
                                  },
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="p-1 border-r border-slate-200">
                          <NumericCell
                            value={val.na}
                            disabled={isLocked}
                            onChange={(v) =>
                              setData((prev) => ({
                                ...prev,
                                aprobadosAsignatura: {
                                  ...prev.aprobadosAsignatura,
                                  undecimo: {
                                    ...prev.aprobadosAsignatura.undecimo,
                                    [s.key]: { ...prev.aprobadosAsignatura.undecimo[s.key], na: v },
                                  },
                                },
                              }))
                            }
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-semibold tabular-nums bg-slate-50">
                          {totalANA(val)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Evaluación Final Media */}
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
              {MEDIA_GRADES.map((g) => (
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
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                  Sub-total
                </td>
                {evalFields.map((f) => (
                  <NVCrossCells key={f.key} nv={totEval[f.key]} disabled highlight />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 5: Cuadro Resumen por Asignatura (por Denominación de Notas) */}
      {activeTab === 'denominacion' && (
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
            {externalData && (
              <span className="px-2.5 py-1 border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800">
                {sector === 'no_gubernamental' ? 'NO GUBERNAMENTAL' : 'GUBERNAMENTAL'}
              </span>
            )}
          </div>

          {!externalData && (
            <div className="bg-white border border-slate-200 p-4 flex flex-wrap items-center gap-6">
              <span className="text-xs font-semibold text-slate-800">Sector del Centro:</span>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="mediaSector"
                  disabled={isLocked}
                  checked={sector === 'gubernamental'}
                  onChange={() => setSector('gubernamental')}
                />
                GUBERNAMENTAL
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="mediaSector"
                  disabled={isLocked}
                  checked={sector === 'no_gubernamental'}
                  onChange={() => setSector('no_gubernamental')}
                />
                NO GUBERNAMENTAL
              </label>
            </div>
          )}

          <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-purple-50 border-b border-slate-300">
                  <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-purple-50 z-10">
                    GRADOS
                  </th>
                  {MEDIA_RESUMEN_SUBJECTS.map((s) => (
                    <th key={s.key} colSpan={5} className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap">
                      {s.label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-slate-50 border-b border-slate-300">
                  {MEDIA_RESUMEN_SUBJECTS.map((s) => (
                    <IBAEHeaders key={s.key} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {MEDIA_GRADES.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50/60">
                    <td className="px-3 py-1.5 font-medium border-r border-slate-200 sticky left-0 bg-white z-10 uppercase">
                      {g.label}
                    </td>
                    {MEDIA_RESUMEN_SUBJECTS.map((s) => {
                      const val = data.resumenDenominacion?.[g.key]?.[s.key] || emptyIBAE();
                      const updateIBAE = (field: keyof IBAECount, next: number) => {
                        setData((prev) => ({
                          ...prev,
                          resumenDenominacion: {
                            ...prev.resumenDenominacion,
                            [g.key]: {
                              ...prev.resumenDenominacion?.[g.key],
                              [s.key]: {
                                ...(prev.resumenDenominacion?.[g.key]?.[s.key] || emptyIBAE()),
                                [field]: next,
                              },
                            },
                          },
                        }));
                      };
                      return (
                        <IBAECells
                          key={s.key}
                          val={val}
                          disabled={isLocked}
                          onChange={updateIBAE}
                        />
                      );
                    })}
                  </tr>
                ))}
                <tr className="bg-amber-50 font-bold border-t-2 border-slate-400">
                  <td className="px-3 py-2 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                    TOTAL
                  </td>
                  {MEDIA_RESUMEN_SUBJECTS.map((s) => {
                    const sum = MEDIA_GRADES.reduce(
                      (acc, g) => addIBAE(acc, data.resumenDenominacion[g.key][s.key]),
                      emptyIBAE()
                    );
                    return <IBAECells key={s.key} val={sum} disabled highlight />;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

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
