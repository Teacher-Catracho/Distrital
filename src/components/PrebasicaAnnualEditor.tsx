import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Save, Send } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AnnualReport,
  EstadisticoRow,
  NVCount,
  PrebasicaAgeKey,
  PrebasicaAnnualData,
  PrebasicaGradeKey,
  ReportStatus,
  School,
  UserProfile,
} from '../types/sace';
import {
  PREBASICA_AGES,
  PREBASICA_GRADES,
  addNV,
  createEmptyPrebasicaData,
  emptyNV,
  mergeParteMensualIntoEstadisticoRow,
  normalizePrebasicaData,
  sumEstadisticoRows,
  totalNV,
  type ParteMensualAnnualSummary,
} from '../utils/saceCalculations';
import { fetchAnnualSummaryFromParteMensual } from '../services/parteMensualSyncService';
import { exportPrebasicaExcel } from '../utils/exportExcel';
import { exportPrebasicaPdf } from '../utils/exportPdf';
import { NumericCell } from './NumericCell';
import { ParteMensualSyncBanner } from './ParteMensualSyncBanner';
import { StatusText } from './StatusText';

type PrebasicaTab = 'estadistico' | 'edades';

interface PrebasicaAnnualEditorProps {
  year: number;
  school: School;
  profile: UserProfile;
  readOnly?: boolean;
  reviewMode?: boolean;
  externalData?: PrebasicaAnnualData;
  isConsolidated?: boolean;
  onAfterSave?: () => void;
}

export function PrebasicaAnnualEditor({
  year,
  school,
  profile,
  readOnly = false,
  reviewMode = false,
  externalData,
  isConsolidated = false,
  onAfterSave,
}: PrebasicaAnnualEditorProps) {
  const reportId = `${year}_${school.id}_prebasica`;
  const [activeTab, setActiveTab] = useState<PrebasicaTab>('estadistico');
  const [data, setData] = useState<PrebasicaAnnualData>(() =>
    normalizePrebasicaData(externalData)
  );
  const [directorName, setDirectorName] = useState(
    school.directorDisplayName || profile.displayName
  );
  const [directorDni, setDirectorDni] = useState(
    school.directorUid && school.directorUid === profile.uid ? profile.dni || '' : ''
  );
  const [placeAndDate, setPlaceAndDate] = useState(`Omoa, Cortés, ${year}`);
  const [status, setStatus] = useState<ReportStatus>('draft');
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(!externalData);
  const [saving, setSaving] = useState(false);
  const [syncingPm, setSyncingPm] = useState(false);
  const [pmSummary, setPmSummary] = useState<ParteMensualAnnualSummary | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const applyPmSummaryToPrebasica = (
    baseData: PrebasicaAnnualData,
    summary: ParteMensualAnnualSummary
  ): PrebasicaAnnualData => {
    const nextEst = { ...baseData.estadisticoFinal };
    for (const g of PREBASICA_GRADES) {
      nextEst[g.key] = mergeParteMensualIntoEstadisticoRow(
        nextEst[g.key],
        summary.rows[g.key],
        summary
      );
    }
    return { ...baseData, estadisticoFinal: nextEst };
  };

  useEffect(() => {
    if (externalData) {
      setPmSummary(null);
      setData(normalizePrebasicaData(externalData));
      setLoading(false);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      try {
        const gradeKeys = PREBASICA_GRADES.map((g) => g.key);
        const [snap, summary] = await Promise.all([
          getDoc(doc(db, 'annualReports', reportId)),
          fetchAnnualSummaryFromParteMensual(year, school.id, 'prebasica', gradeKeys),
        ]);
        if (!active) return;

        let loadedStatus: ReportStatus = 'draft';
        let baseData = createEmptyPrebasicaData();
        const defaultDni =
          school.directorUid && school.directorUid === profile.uid ? profile.dni || '' : '';
        if (snap.exists()) {
          const r = snap.data() as AnnualReport;
          baseData = normalizePrebasicaData(r.data as Partial<PrebasicaAnnualData>);
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

        const shouldAutoApplyPm =
          !reviewMode &&
          !readOnly &&
          loadedStatus !== 'approved' &&
          loadedStatus !== 'submitted' &&
          summary.monthsFound.length > 0;

        setPmSummary(summary);
        setData(shouldAutoApplyPm ? applyPmSummaryToPrebasica(baseData, summary) : baseData);
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
    school.directorUid,
    school.directorDisplayName,
    profile.displayName,
    profile.dni,
    profile.uid,
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
      const summary = await fetchAnnualSummaryFromParteMensual(
        year,
        school.id,
        'prebasica',
        PREBASICA_GRADES.map((g) => g.key)
      );
      setPmSummary(summary);
      if (summary.monthsFound.length === 0) {
        setFeedback({
          type: 'err',
          text: `No se encontraron reportes de Parte Mensual (Abril–Octubre) para ${year} en Prebásica.`,
        });
        return;
      }
      setData((prev) => applyPmSummaryToPrebasica(prev, summary));
      setFeedback({
        type: 'ok',
        text: `Datos actualizados desde Parte Mensual (${summary.monthsFound.length} mes(es) de Abril–Octubre).`,
      });
    } finally {
      setSyncingPm(false);
    }
  };

  const updateCell = (
    grade: PrebasicaGradeKey,
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
          [field]: {
            ...prev.estadisticoFinal[grade][field],
            [sex]: val,
          },
        },
      },
    }));
  };

  const updateAgeCell = (
    grade: PrebasicaGradeKey,
    age: PrebasicaAgeKey,
    sex: keyof NVCount,
    val: number
  ) => {
    setData((prev) => ({
      ...prev,
      matriculaEdades: {
        ...prev.matriculaEdades,
        [grade]: {
          ...prev.matriculaEdades[grade],
          [age]: {
            ...prev.matriculaEdades[grade][age],
            [sex]: val,
          },
        },
      },
    }));
  };

  const handleSave = async (targetStatus: ReportStatus) => {
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
      const cleanDirectorName =
        directorName.trim() || school.directorDisplayName || profile.displayName;
      const cleanDirectorDni = directorDni.trim();
      const normalizedPayload = normalizePrebasicaData(data);

      if (existing.exists()) {
        const existingData = existing.data() as AnnualReport;
        await updateDoc(ref, {
          schoolName: school.name,
          saceCode: school.saceCode,
          community: school.community,
          sector: school.sector,
          modality: school.modality,
          directorName: cleanDirectorName,
          directorDni: cleanDirectorDni,
          placeAndDate: placeAndDate.trim(),
          data: normalizedPayload,
          status: targetStatus,
          ...(isAdminActor
            ? {
                directorUid: validSchoolDirectorUid || existingData.directorUid || profile.uid,
                reviewedByUid:
                  targetStatus === 'approved'
                    ? profile.uid
                    : targetStatus === 'returned'
                    ? existingData.reviewedByUid || profile.uid
                    : '',
                reviewComment:
                  targetStatus === 'approved' || targetStatus === 'submitted'
                    ? ''
                    : existingData.reviewComment || '',
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
          level: 'prebasica',
          directorUid: validSchoolDirectorUid || profile.uid,
          directorName: cleanDirectorName,
          directorDni: cleanDirectorDni,
          placeAndDate: placeAndDate.trim(),
          data: normalizedPayload,
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
            ? 'Cuadros anuales de Prebásica guardados y aprobados oficialmente.'
            : reviewMode
            ? 'Cambios guardados correctamente en los cuadros anuales de Prebásica.'
            : targetStatus === 'submitted'
            ? 'Cuadros anuales de Prebásica enviados al Distrito.'
            : 'Borrador anual guardado correctamente.',
      });
      onAfterSave?.();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="bg-white border border-slate-200 p-8 h-48 animate-pulse" />;
  }

  const totalRow = sumEstadisticoRows(PREBASICA_GRADES.map((g) => data.estadisticoFinal[g.key]));
  const fields: { key: keyof EstadisticoRow; label: string }[] = [
    { key: 'matInicial', label: 'Mat. Inicial' },
    { key: 'matFinal', label: 'Mat. Final' },
    { key: 'ingresos', label: 'Ingresos' },
    { key: 'desertores', label: 'Desertores' },
    { key: 'traslados', label: 'Traslados' },
    { key: 'aprobados', label: 'Aprobados' },
    { key: 'reprobados', label: 'Reprobados' },
    { key: 'egresados', label: 'Egresados' },
  ];

  const tabs: { key: PrebasicaTab; label: string }[] = [
    { key: 'estadistico', label: '1. Estadístico Final' },
    { key: 'edades', label: '2. Matrícula por Edades' },
  ];

  const meta = {
    year,
    schoolName: school.name,
    saceCode: school.saceCode,
    community: school.community,
    directorName: isConsolidated
      ? ''
      : directorName.trim() || school.directorDisplayName || profile.displayName,
    directorDni: isConsolidated ? '' : directorDni.trim(),
    placeAndDate,
    isConsolidated,
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Cuadros Estadísticos Anuales</span>
            <span aria-hidden="true">·</span>
            <span>Prebásica {year}</span>
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
            onClick={() => exportPrebasicaExcel(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel (2 hojas)
          </button>
          <button
            type="button"
            onClick={() => exportPrebasicaPdf(data, meta)}
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
            <p className="font-semibold">Observaciones del Distrito:</p>
            <p className="mt-0.5">{reviewComment}</p>
          </div>
        </div>
      )}

      {!externalData && status === 'approved' && !readOnly && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Reporte aprobado por el Distrito.</span>
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

      <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1.5 border border-slate-200">
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

      {activeTab === 'estadistico' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th
                  rowSpan={2}
                  className="px-3 py-2 text-left font-bold border-r border-slate-300 min-w-[140px]"
                >
                  GRADOS
                </th>
                {fields.map((f) => (
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
                {fields.map((f) => (
                  <FragmentHeaders key={f.key} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {PREBASICA_GRADES.map((g) => {
                const row = data.estadisticoFinal[g.key];
                return (
                  <tr key={g.key} className="hover:bg-slate-50/70">
                    <td className="px-3 py-1.5 font-medium text-slate-900 border-r border-slate-200">
                      {g.label}
                    </td>
                    {fields.map((f) => (
                      <NVTripleCells
                        key={f.key}
                        nv={row[f.key]}
                        disabled={isLocked}
                        onChangeN={(v) => updateCell(g.key, f.key, 'n', v)}
                        onChangeV={(v) => updateCell(g.key, f.key, 'v', v)}
                      />
                    ))}
                  </tr>
                );
              })}
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-300">
                <td className="px-3 py-2 text-slate-900 border-r border-slate-300">TOTAL</td>
                {fields.map((f) => (
                  <NVTripleCells key={f.key} nv={totalRow[f.key]} disabled highlight />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'edades' && (
        <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-emerald-50 border-b border-slate-300">
                <th
                  rowSpan={2}
                  className="px-3 py-2 text-left font-bold border-r border-slate-300 sticky left-0 bg-emerald-50 z-10 min-w-[160px]"
                >
                  Grado
                </th>
                {PREBASICA_AGES.map((age) => (
                  <th
                    key={age.key}
                    colSpan={3}
                    className="px-2 py-1.5 text-center font-bold border-r border-slate-300 whitespace-nowrap"
                  >
                    {age.label}
                  </th>
                ))}
                <th colSpan={3} className="px-2 py-1.5 text-center font-bold bg-amber-50">
                  TOTAL
                </th>
              </tr>
              <tr className="bg-blue-50/70 border-b border-slate-300">
                {PREBASICA_AGES.map((age) => (
                  <FragmentHeaders key={age.key} />
                ))}
                <FragmentHeaders />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {PREBASICA_GRADES.map((g) => {
                const rowSum = PREBASICA_AGES.reduce(
                  (acc, age) => addNV(acc, data.matriculaEdades[g.key][age.key]),
                  emptyNV()
                );
                return (
                  <tr key={g.key} className="hover:bg-slate-50/70">
                    <td className="px-3 py-1.5 font-medium text-slate-900 border-r border-slate-200 sticky left-0 bg-white z-10 whitespace-nowrap">
                      <span>{g.edadesLabel}</span>{' '}
                      <span className="text-[11px] font-normal text-slate-500">({g.label})</span>
                    </td>
                    {PREBASICA_AGES.map((age) => (
                      <NVTripleCells
                        key={age.key}
                        nv={data.matriculaEdades[g.key][age.key]}
                        disabled={isLocked}
                        onChangeN={(v) => updateAgeCell(g.key, age.key, 'n', v)}
                        onChangeV={(v) => updateAgeCell(g.key, age.key, 'v', v)}
                      />
                    ))}
                    <NVTripleCells nv={rowSum} disabled highlight />
                  </tr>
                );
              })}
              <tr className="bg-amber-50 font-bold border-t-2 border-slate-300">
                <td className="px-3 py-2 text-slate-900 border-r border-slate-300 sticky left-0 bg-amber-50 z-10">
                  TOTAL
                </td>
                {PREBASICA_AGES.map((age) => {
                  const colSum = PREBASICA_GRADES.reduce(
                    (acc, g) => addNV(acc, data.matriculaEdades[g.key][age.key]),
                    emptyNV()
                  );
                  return <NVTripleCells key={age.key} nv={colSum} disabled highlight />;
                })}
                <NVTripleCells
                  nv={PREBASICA_GRADES.reduce(
                    (acc, g) =>
                      PREBASICA_AGES.reduce(
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

      {!isConsolidated && (
        <div className="bg-white border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Director(a) del centro:</label>
            <input
              type="text"
              disabled={isLocked}
              value={directorName}
              onChange={(e) => setDirectorName(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 disabled:bg-slate-50"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">DNI Director(a):</label>
            <input
              type="text"
              disabled={isLocked}
              value={directorDni}
              onChange={(e) => setDirectorDni(e.target.value)}
              className="w-full px-3 py-1.5 font-mono border border-slate-300 disabled:bg-slate-50"
              placeholder="0503198000000"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-700 mb-1">Lugar y fecha del reporte:</label>
            <input
              type="text"
              disabled={isLocked}
              value={placeAndDate}
              onChange={(e) => setPlaceAndDate(e.target.value)}
              className="w-full px-3 py-1.5 border border-slate-300 disabled:bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentHeaders() {
  return (
    <>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">N</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-200">V</th>
      <th className="px-2 py-1 text-center font-semibold border-r border-slate-300">T</th>
    </>
  );
}

function NVTripleCells({
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
