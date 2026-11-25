import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Save,
  Send,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  BasicaScope,
  EducationLevel,
  NVCount,
  ParteMensualComputedRow,
  ParteMensualReport,
  ParteMensualRow,
  ReportStatus,
  School,
  UserProfile,
} from '../types/sace';
import {
  BASICA_CYCLE_1_2,
  BASICA_CYCLE_3,
  MONTHS,
  computeParteMensualRow,
  createEmptyParteMensualRows,
  getBasicaScope,
  getParteMensualGrades,
  getSchoolLevelLabel,
  sumParteMensualComputedRows,
  totalNV,
  validateParteMensual,
} from '../utils/saceCalculations';
import { exportParteMensualExcel } from '../utils/exportExcel';
import { exportParteMensualPdf } from '../utils/exportPdf';
import { NumericCell } from './NumericCell';
import { StatusText } from './StatusText';

interface ParteMensualEditorProps {
  year: number;
  month: number;
  level: EducationLevel;
  basicaScope?: BasicaScope;
  school: School;
  profile: UserProfile;
  readOnly?: boolean;
  isConsolidated?: boolean;
  externalAggregate?: {
    byGrade: Record<string, ParteMensualComputedRow>;
    total: ParteMensualComputedRow;
    avgDiasTrabajados: number;
  };
  onAfterSave?: () => void;
}

export function ParteMensualEditor({
  year,
  month,
  level,
  basicaScope,
  school,
  profile,
  readOnly = false,
  isConsolidated = false,
  externalAggregate,
  onAfterSave,
}: ParteMensualEditorProps) {
  const monthLabel = MONTHS.find((m) => m.value === month)?.label || String(month);
  const reportId = `${year}_${String(month).padStart(2, '0')}_${school.id}_${level}`;
  const effectiveBasicaScope =
    level === 'basica' ? basicaScope || getBasicaScope(school) : undefined;
  const grades = useMemo(
    () => getParteMensualGrades(level, effectiveBasicaScope),
    [level, effectiveBasicaScope]
  );
  const finalColTitle = level === 'prebasica' ? 'MATRÍCULA ACTUAL' : 'MATRÍCULA FINAL';

  const [rows, setRows] = useState<Record<string, ParteMensualRow>>(() =>
    createEmptyParteMensualRows(level, effectiveBasicaScope)
  );
  const [diasTrabajados, setDiasTrabajados] = useState<number>(20);
  const [lugar, setLugar] = useState<string>(school.community || 'Omoa');
  const [directorName, setDirectorName] = useState<string>(
    school.directorDisplayName || profile.displayName
  );
  const [status, setStatus] = useState<ReportStatus>('draft');
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(!externalAggregate);
  const [saving, setSaving] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (externalAggregate) {
      setDiasTrabajados(externalAggregate.avgDiasTrabajados);
      setLoading(false);
      return;
    }

    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      const path = `parteMensualReports/${reportId}`;
      try {
        const snap = await getDoc(doc(db, 'parteMensualReports', reportId));
        if (!active) return;
        if (snap.exists()) {
          const d = snap.data() as ParteMensualReport;
          const base = createEmptyParteMensualRows(level, effectiveBasicaScope);
          for (const g of getParteMensualGrades(level, effectiveBasicaScope)) {
            if (d.rows?.[g.key]) {
              base[g.key] = {
                matInicial: d.rows[g.key].matInicial || { n: 0, v: 0 },
                inasistencias: d.rows[g.key].inasistencias || { n: 0, v: 0 },
                ingresos: d.rows[g.key].ingresos || { n: 0, v: 0 },
                traslados: d.rows[g.key].traslados || { n: 0, v: 0 },
                desertores: d.rows[g.key].desertores || { n: 0, v: 0 },
              };
            }
          }
          setRows(base);
          setDiasTrabajados(typeof d.diasTrabajados === 'number' ? d.diasTrabajados : 20);
          setLugar(d.lugar || school.community || 'Omoa');
          setDirectorName(d.directorName || school.directorDisplayName || profile.displayName);
          setStatus(d.status || 'draft');
          setReviewComment(d.reviewComment || '');
        } else {
          setRows(createEmptyParteMensualRows(level, effectiveBasicaScope));
          setDiasTrabajados(20);
          setLugar(school.community || 'Omoa');
          setDirectorName(school.directorDisplayName || profile.displayName);
          setStatus('draft');
          setReviewComment('');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, path);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [reportId, level, effectiveBasicaScope, school.community, school.directorDisplayName, profile.displayName, externalAggregate]);

  const isLocked =
    readOnly ||
    Boolean(externalAggregate) ||
    (profile.role !== 'admin' && (status === 'approved' || status === 'submitted'));

  const computedByGrade = useMemo(() => {
    if (externalAggregate) return externalAggregate.byGrade;
    const map: Record<string, ParteMensualComputedRow> = {};
    for (const g of grades) {
      map[g.key] = computeParteMensualRow(rows[g.key], diasTrabajados);
    }
    return map;
  }, [externalAggregate, grades, rows, diasTrabajados]);

  const showBasicaSubtotals = level === 'basica' && effectiveBasicaScope === 'c1_2_3';

  const subtotal12Row = useMemo(() => {
    if (!showBasicaSubtotals) return null;
    return sumParteMensualComputedRows(BASICA_CYCLE_1_2.map((g) => computedByGrade[g.key]));
  }, [showBasicaSubtotals, computedByGrade]);

  const subtotal3Row = useMemo(() => {
    if (!showBasicaSubtotals) return null;
    return sumParteMensualComputedRows(BASICA_CYCLE_3.map((g) => computedByGrade[g.key]));
  }, [showBasicaSubtotals, computedByGrade]);

  const totalRow = useMemo(() => {
    if (externalAggregate) return externalAggregate.total;
    return sumParteMensualComputedRows(grades.map((g) => computedByGrade[g.key]));
  }, [externalAggregate, grades, computedByGrade]);

  const alerts = useMemo(() => {
    if (externalAggregate) return [];
    return validateParteMensual(rows, diasTrabajados, level, effectiveBasicaScope);
  }, [externalAggregate, rows, diasTrabajados, level, effectiveBasicaScope]);

  const updateCell = (
    gradeKey: string,
    field: keyof ParteMensualRow,
    sex: keyof NVCount,
    val: number
  ) => {
    setRows((prev) => ({
      ...prev,
      [gradeKey]: {
        ...(prev[gradeKey] || createEmptyParteMensualRows(level, effectiveBasicaScope)[gradeKey]),
        [field]: {
          ...(prev[gradeKey]?.[field] || { n: 0, v: 0 }),
          [sex]: val,
        },
      },
    }));
  };

  const handleLoadPreviousMonth = async () => {
    if (month <= 1 || isLocked) return;
    setPreloading(true);
    setFeedback(null);
    const prevMonth = month - 1;
    const prevId = `${year}_${String(prevMonth).padStart(2, '0')}_${school.id}_${level}`;
    const prevLabel = MONTHS.find((m) => m.value === prevMonth)?.label || String(prevMonth);
    try {
      const snap = await getDoc(doc(db, 'parteMensualReports', prevId));
      if (!snap.exists()) {
        setFeedback({
          type: 'err',
          text: `No se encontró un Parte Mensual guardado para ${prevLabel} ${year} en ${getSchoolLevelLabel(level, effectiveBasicaScope)}.`,
        });
        return;
      }
      const prevData = snap.data() as ParteMensualReport;
      setRows((prev) => {
        const next = { ...prev };
        for (const g of grades) {
          const prevComp = computeParteMensualRow(prevData.rows?.[g.key], prevData.diasTrabajados || 0);
          next[g.key] = {
            ...(next[g.key] || createEmptyParteMensualRows(level, effectiveBasicaScope)[g.key]),
            matInicial: {
              n: Math.max(0, prevComp.matFinal.n),
              v: Math.max(0, prevComp.matFinal.v),
            },
          };
        }
        return next;
      });
      setFeedback({
        type: 'ok',
        text: `Matrícula Inicial cargada desde la ${level === 'prebasica' ? 'Matrícula Actual' : 'Matrícula Final'} de ${prevLabel} ${year}.`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `parteMensualReports/${prevId}`);
    } finally {
      setPreloading(false);
    }
  };

  const handleSave = async (targetStatus: 'draft' | 'submitted' | 'approved') => {
    if (diasTrabajados < 0 || diasTrabajados > 31) {
      setFeedback({
        type: 'err',
        text: 'Los días trabajados deben estar entre 0 y 31.',
      });
      return;
    }

    if ((targetStatus === 'submitted' || targetStatus === 'approved') && diasTrabajados <= 0) {
      setFeedback({
        type: 'err',
        text: 'Ingresa los Días Trabajados del mes (mayor que 0) antes de enviar o aprobar el reporte.',
      });
      return;
    }

    if ((targetStatus === 'submitted' || targetStatus === 'approved') && alerts.length > 0) {
      setFeedback({
        type: 'err',
        text: 'Corrige las alertas de verificación en la tabla antes de enviar o aprobar el reporte.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    const path = `parteMensualReports/${reportId}`;
    try {
      const ref = doc(db, 'parteMensualReports', reportId);
      const existing = await getDoc(ref);
      const cleanLugar = lugar.trim() || school.community || 'Omoa';
      const cleanDirector = directorName.trim() || school.directorDisplayName || profile.displayName;
      const validSchoolDirectorUid =
        school.directorUid && /^[a-zA-Z0-9_-]{1,128}$/.test(school.directorUid)
          ? school.directorUid
          : '';
      const isAdminActor = profile.role === 'admin';

      if (existing.exists()) {
        const existingData = existing.data() as ParteMensualReport;
        await updateDoc(ref, {
          schoolName: school.name,
          saceCode: school.saceCode,
          lugar: cleanLugar,
          directorName: cleanDirector,
          diasTrabajados,
          rows,
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
          month,
          schoolId: school.id,
          schoolName: school.name,
          saceCode: school.saceCode,
          lugar: cleanLugar,
          level,
          directorUid: validSchoolDirectorUid || profile.uid,
          directorName: cleanDirector,
          diasTrabajados,
          rows,
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
            ? 'Parte Mensual guardado y aprobado oficialmente.'
            : targetStatus === 'submitted'
            ? 'Parte Mensual enviado al Distrito Educativo N° 18-B para revisión.'
            : 'Borrador de Parte Mensual guardado en la nube.',
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

  const exportMeta = {
    year,
    month,
    level,
    basicaScope: effectiveBasicaScope,
    diasTrabajados,
    schoolName: school.name,
    saceCode: school.saceCode,
    community: lugar || school.community || 'Omoa, Cortés',
    directorName,
    placeAndDate: `${lugar || 'Omoa, Cortés'}, ${monthLabel} ${year}`,
    isConsolidated,
  };

  const renderSummaryRow = (
    label: string,
    row: ParteMensualComputedRow,
    rowClass: string,
    stickyBgClass: string
  ) => (
    <tr key={label} className={`${rowClass} font-bold text-slate-900`}>
      <td className={`sticky left-0 z-10 ${stickyBgClass} border border-slate-300 px-3 py-2 text-left whitespace-nowrap`}>
        {label}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.matInicial.n}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.matInicial.v}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {totalNV(row.matInicial)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.matFinal.n}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.matFinal.v}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {totalNV(row.matFinal)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.inasistencias.n}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.inasistencias.v}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {totalNV(row.inasistencias)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.asistenciaMedia.n.toFixed(2)}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.asistenciaMedia.v.toFixed(2)}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.asistenciaMedia.t.toFixed(2)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.tantoPorCiento.n.toFixed(2)}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.tantoPorCiento.v.toFixed(2)}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.tantoPorCiento.t.toFixed(2)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.ingresos.n}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.ingresos.v}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {totalNV(row.ingresos)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.traslados.n}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.traslados.v}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {totalNV(row.traslados)}
      </td>

      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.desertores.n}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {row.desertores.v}
      </td>
      <td className="border border-slate-300 px-2 py-1.5 text-right font-mono tabular-nums">
        {totalNV(row.desertores)}
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-white border border-slate-200 p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-bold text-slate-900">
              Reporte de Parte Mensual · {getSchoolLevelLabel(level, effectiveBasicaScope)} · {monthLabel} {year}
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-medium text-slate-900">{school.name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{school.saceCode}</span>
              {!isConsolidated && (
                <>
                  <span aria-hidden="true">·</span>
                  <StatusText status={status} />
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isLocked && month > 1 && (
              <button
                type="button"
                disabled={preloading || saving}
                onClick={handleLoadPreviousMonth}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                {preloading ? 'Cargando...' : 'Traer Mat. Inicial mes anterior'}
              </button>
            )}
            <button
              type="button"
              onClick={() => exportParteMensualExcel(computedByGrade, totalRow, exportMeta)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => exportParteMensualPdf(computedByGrade, totalRow, exportMeta)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-red-700" />
              PDF Oficial
            </button>
          </div>
        </div>

        {/* Metadata inputs matching official form */}
        {!isConsolidated && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-200 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1">Lugar / Comunidad</label>
              <input
                type="text"
                disabled={isLocked}
                value={lugar}
                onChange={(e) => setLugar(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 bg-white disabled:bg-slate-50"
                placeholder="Ej. Omoa"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Días Trabajados en el mes
              </label>
              <input
                type="number"
                min={0}
                max={31}
                disabled={isLocked}
                value={diasTrabajados === 0 ? '' : diasTrabajados}
                placeholder="20"
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (Number.isNaN(parsed)) setDiasTrabajados(0);
                  else setDiasTrabajados(Math.min(31, Math.max(0, parsed)));
                }}
                className="w-full px-3 py-1.5 font-mono tabular-nums border border-slate-300 bg-white disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Director(a) del Centro Educativo
              </label>
              <input
                type="text"
                disabled={isLocked}
                value={directorName}
                onChange={(e) => setDirectorName(e.target.value)}
                className="w-full px-3 py-1.5 border border-slate-300 bg-white disabled:bg-slate-50"
              />
            </div>
          </div>
        )}

        {status === 'returned' && reviewComment && !isConsolidated && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Observaciones de la Dirección Distrital:</p>
              <p className="mt-0.5">{reviewComment}</p>
            </div>
          </div>
        )}

        {feedback && (
          <div
            className={`p-3 border text-xs flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}
      </div>

      {/* Validation Alerts */}
      {alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 space-y-1.5 text-xs text-amber-900">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            Alertas de verificación ({alerts.length})
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {alerts.map((a, idx) => (
              <li key={idx}>{a.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Official Parte Mensual Table */}
      <div className="bg-white border border-slate-200 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-slate-100 border border-slate-300 px-3 py-2 text-left font-bold text-slate-900 min-w-[130px]"
              >
                GRADO
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                MATRÍCULA INICIAL
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                {finalColTitle}
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-pink-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                INASISTENCIAS
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-emerald-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                ASISTENCIA MEDIA
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-orange-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                TANTO POR CIENTO
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-amber-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                INGRESOS
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-sky-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                TRASLADOS
              </th>
              <th
                colSpan={3}
                className="border border-slate-300 bg-rose-50 px-2 py-1.5 text-center font-bold text-slate-900 whitespace-nowrap"
              >
                DESERTORES
              </th>
            </tr>
            <tr className="bg-slate-50 text-[10px] font-bold text-slate-700">
              {Array.from({ length: 8 }).map((_, idx) => (
                <React.Fragment key={idx}>
                  <th className="border border-slate-300 px-1.5 py-1 text-center">N</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-center">V</th>
                  <th className="border border-slate-300 px-1.5 py-1 text-center bg-slate-100">
                    T
                  </th>
                </React.Fragment>
              ))}
            </tr>
          </thead>

          <tbody>
            {grades.map((g) => {
              const raw = rows[g.key];
              const c = computedByGrade[g.key];
              const negMat = c.matFinal.n < 0 || c.matFinal.v < 0;

              return (
                <React.Fragment key={g.key}>
                  <tr className="hover:bg-slate-50/70">
                    <td className="sticky left-0 z-10 bg-white border border-slate-300 px-3 py-1.5 font-semibold text-slate-900 whitespace-nowrap">
                      <span>{g.label.toUpperCase()}</span>
                      {g.hint && (
                        <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                          ({g.hint})
                        </span>
                      )}
                    </td>

                    {/* Matrícula Inicial (Editable) */}
                    <td className="border border-slate-300 p-0.5 bg-amber-50/30">
                      <NumericCell
                        value={raw?.matInicial.n ?? c.matInicial.n}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'matInicial', 'n', v)}
                      />
                    </td>
                    <td className="border border-slate-300 p-0.5 bg-amber-50/30">
                      <NumericCell
                        value={raw?.matInicial.v ?? c.matInicial.v}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'matInicial', 'v', v)}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-slate-50 text-slate-900">
                      {totalNV(c.matInicial)}
                    </td>

                    {/* Matrícula Final / Actual (Auto-calculated) */}
                    <td
                      className={`border border-slate-300 px-2 py-1 text-right font-mono tabular-nums bg-slate-50 ${
                        negMat ? 'text-red-700 font-bold' : 'text-slate-700'
                      }`}
                    >
                      {c.matFinal.n}
                    </td>
                    <td
                      className={`border border-slate-300 px-2 py-1 text-right font-mono tabular-nums bg-slate-50 ${
                        negMat ? 'text-red-700 font-bold' : 'text-slate-700'
                      }`}
                    >
                      {c.matFinal.v}
                    </td>
                    <td
                      className={`border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-slate-100 ${
                        negMat ? 'text-red-700' : 'text-slate-900'
                      }`}
                    >
                      {totalNV(c.matFinal)}
                    </td>

                    {/* Inasistencias (Editable) */}
                    <td className="border border-slate-300 p-0.5 bg-pink-50/20">
                      <NumericCell
                        value={raw?.inasistencias.n ?? c.inasistencias.n}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'inasistencias', 'n', v)}
                      />
                    </td>
                    <td className="border border-slate-300 p-0.5 bg-pink-50/20">
                      <NumericCell
                        value={raw?.inasistencias.v ?? c.inasistencias.v}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'inasistencias', 'v', v)}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-slate-50 text-slate-900">
                      {totalNV(c.inasistencias)}
                    </td>

                    {/* Asistencia Media (Auto-calculated 2 decimals) */}
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums bg-emerald-50/30 text-slate-800">
                      {c.asistenciaMedia.n.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums bg-emerald-50/30 text-slate-800">
                      {c.asistenciaMedia.v.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-emerald-50/60 text-slate-900">
                      {c.asistenciaMedia.t.toFixed(2)}
                    </td>

                    {/* Tanto por Ciento (Auto-calculated 2 decimals) */}
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums bg-orange-50/30 text-slate-800">
                      {c.tantoPorCiento.n.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono tabular-nums bg-orange-50/30 text-slate-800">
                      {c.tantoPorCiento.v.toFixed(2)}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-orange-50/60 text-slate-900">
                      {c.tantoPorCiento.t.toFixed(2)}
                    </td>

                    {/* Ingresos (Editable) */}
                    <td className="border border-slate-300 p-0.5 bg-amber-50/20">
                      <NumericCell
                        value={raw?.ingresos.n ?? c.ingresos.n}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'ingresos', 'n', v)}
                      />
                    </td>
                    <td className="border border-slate-300 p-0.5 bg-amber-50/20">
                      <NumericCell
                        value={raw?.ingresos.v ?? c.ingresos.v}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'ingresos', 'v', v)}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-slate-50 text-slate-900">
                      {totalNV(c.ingresos)}
                    </td>

                    {/* Traslados (Editable) */}
                    <td className="border border-slate-300 p-0.5 bg-sky-50/20">
                      <NumericCell
                        value={raw?.traslados.n ?? c.traslados.n}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'traslados', 'n', v)}
                      />
                    </td>
                    <td className="border border-slate-300 p-0.5 bg-sky-50/20">
                      <NumericCell
                        value={raw?.traslados.v ?? c.traslados.v}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'traslados', 'v', v)}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-slate-50 text-slate-900">
                      {totalNV(c.traslados)}
                    </td>

                    {/* Desertores (Editable) */}
                    <td className="border border-slate-300 p-0.5 bg-rose-50/20">
                      <NumericCell
                        value={raw?.desertores.n ?? c.desertores.n}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'desertores', 'n', v)}
                      />
                    </td>
                    <td className="border border-slate-300 p-0.5 bg-rose-50/20">
                      <NumericCell
                        value={raw?.desertores.v ?? c.desertores.v}
                        disabled={isLocked}
                        onChange={(v) => updateCell(g.key, 'desertores', 'v', v)}
                      />
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-right font-mono font-bold tabular-nums bg-slate-50 text-slate-900">
                      {totalNV(c.desertores)}
                    </td>
                  </tr>
                  {showBasicaSubtotals && g.key === 'g6' && subtotal12Row &&
                    renderSummaryRow('SUBTOTAL I Y II CICLO', subtotal12Row, 'bg-blue-50/80', 'bg-blue-50')}
                  {showBasicaSubtotals && g.key === 'g9' && subtotal3Row &&
                    renderSummaryRow('SUBTOTAL III CICLO', subtotal3Row, 'bg-blue-50/80', 'bg-blue-50')}
                </React.Fragment>
              );
            })}

            {renderSummaryRow('TOTAL', totalRow, 'bg-emerald-100/80', 'bg-emerald-100')}
          </tbody>
        </table>
      </div>

      {/* Formula Legend & Save Actions */}
      <div className="bg-white border border-slate-200 px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[11px] text-slate-500">
          Fórmulas automáticas: {level === 'prebasica' ? 'Mat. Actual' : 'Mat. Final'} = Mat. Inicial + Ingresos − Traslados − Desertores · Asist. Media = Mat. − (Inasistencias / Días) · % = (Asist. Media / Mat.) × 100
        </p>

        {!isLocked && (
          <div className="flex flex-wrap items-center gap-3 ml-auto">
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave('draft')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={saving || diasTrabajados <= 0 || alerts.length > 0}
              onClick={() => handleSave('submitted')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar a la distrital
            </button>
            {profile.role === 'admin' && (
              <button
                type="button"
                disabled={saving || diasTrabajados <= 0 || alerts.length > 0}
                onClick={() => handleSave('approved')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Guardar y aprobar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
