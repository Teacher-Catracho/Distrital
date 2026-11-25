import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Save, Send } from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AnnualReport,
  EstadisticoRow,
  NVCount,
  PrebasicaAnnualData,
  PrebasicaGradeKey,
  ReportStatus,
  School,
  UserProfile,
} from '../types/sace';
import {
  PREBASICA_GRADES,
  createEmptyPrebasicaData,
  mergeParteMensualIntoEstadisticoRow,
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

interface PrebasicaAnnualEditorProps {
  year: number;
  school: School;
  profile: UserProfile;
  readOnly?: boolean;
  onAfterSave?: () => void;
}

export function PrebasicaAnnualEditor({
  year,
  school,
  profile,
  readOnly = false,
  onAfterSave,
}: PrebasicaAnnualEditorProps) {
  const reportId = `${year}_${school.id}_prebasica`;
  const [data, setData] = useState<PrebasicaAnnualData>(() => createEmptyPrebasicaData());
  const [directorName, setDirectorName] = useState(
    school.directorDisplayName || profile.displayName
  );
  const [directorDni, setDirectorDni] = useState(
    school.directorUid && school.directorUid === profile.uid ? profile.dni || '' : ''
  );
  const [placeAndDate, setPlaceAndDate] = useState(`Omoa, Cortés, ${year}`);
  const [status, setStatus] = useState<ReportStatus>('draft');
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(true);
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
          baseData = (r.data as PrebasicaAnnualData) || createEmptyPrebasicaData();
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
            ? applyPmSummaryToPrebasica(baseData, summary)
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
  }, [reportId, year, school.id, readOnly, profile.role, school.directorUid, school.directorDisplayName, profile.displayName, profile.dni]);

  const isLocked =
    readOnly || (profile.role !== 'admin' && (status === 'approved' || status === 'submitted'));

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
      const cleanDirectorName =
        directorName.trim() || school.directorDisplayName || profile.displayName;
      const cleanDirectorDni = directorDni.trim();
      const isAdminActor = profile.role === 'admin';

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
          level: 'prebasica',
          directorUid: validSchoolDirectorUid || profile.uid,
          directorName: cleanDirectorName,
          directorDni: cleanDirectorDni,
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
            ? 'Cuadro anual de Prebásica guardado y aprobado oficialmente.'
            : targetStatus === 'submitted'
            ? 'Cuadro anual de Prebásica enviado al Distrito.'
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

  const meta = {
    year,
    schoolName: school.name,
    saceCode: school.saceCode,
    community: school.community,
    directorName: directorName.trim() || school.directorDisplayName || profile.displayName,
    directorDni: directorDni.trim(),
    placeAndDate,
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Resumen Estadístico Anual</span>
            <span aria-hidden="true">·</span>
            <span>Prebásica {year}</span>
            <span aria-hidden="true">·</span>
            <StatusText status={status} />
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            {school.name}{' '}
            <span className="font-mono text-sm font-normal text-slate-500">({school.saceCode})</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportPrebasicaExcel(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel
          </button>
          <button
            type="button"
            onClick={() => exportPrebasicaPdf(data, meta)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-red-700" />
            PDF
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

      {status === 'returned' && reviewComment && (
        <div className="p-4 bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Observaciones del Distrito:</p>
            <p className="mt-0.5">{reviewComment}</p>
          </div>
        </div>
      )}

      {status === 'approved' && !readOnly && (
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

      <ParteMensualSyncBanner
        year={year}
        summary={pmSummary}
        isLocked={isLocked}
        syncing={syncingPm}
        onSync={handleSyncFromParteMensual}
      />

      <div className="bg-white border border-slate-200 overflow-x-auto matrix-scroll">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-emerald-50 border-b border-slate-300">
              <th rowSpan={2} className="px-3 py-2 text-left font-bold border-r border-slate-300 min-w-[140px]">
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
