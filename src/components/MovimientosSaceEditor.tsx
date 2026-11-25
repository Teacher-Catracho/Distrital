import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Save,
  Send,
  Trash2,
} from 'lucide-react';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  EducationLevel,
  MonthlyReport,
  MovementRow,
  ReportStatus,
  School,
  UserProfile,
} from '../types/sace';
import { MONTHS, getBasicaScope, getSchoolLevelLabel } from '../utils/saceCalculations';
import { exportMonthlyReportExcel } from '../utils/exportExcel';
import { exportMonthlyReportPdf } from '../utils/exportPdf';
import { StatusText } from './StatusText';

interface MovimientosSaceEditorProps {
  year: number;
  month: number;
  level: EducationLevel;
  school: School;
  profile: UserProfile;
  readOnly?: boolean;
  onAfterSave?: () => void;
}

const MOVEMENT_MONTHS = MONTHS.filter((m) => m.value >= 2 && m.value <= 11);

const createEmptyMovementRow = (monthLabel: string): MovementRow => ({
  id: crypto.randomUUID(),
  rne: '',
  nombre: '',
  sexo: 'F',
  accion: '',
  gradoSeccion: '',
  mes: monthLabel,
});

export function MovimientosSaceEditor({
  year,
  month,
  level,
  school,
  profile,
  readOnly = false,
  onAfterSave,
}: MovimientosSaceEditorProps) {
  const monthLabel = MONTHS.find((m) => m.value === month)?.label || String(month);
  const defaultMovementMonth =
    MOVEMENT_MONTHS.find((m) => m.value === month)?.label || MOVEMENT_MONTHS[0].label;
  const reportId = `${year}_${String(month).padStart(2, '0')}_${school.id}_${level}`;

  const [ingresos, setIngresos] = useState<MovementRow[]>([]);
  const [traslados, setTraslados] = useState<MovementRow[]>([]);
  const [desertores, setDesertores] = useState<MovementRow[]>([]);
  const [noMovements, setNoMovements] = useState(false);
  const [confirmClearForZero, setConfirmClearForZero] = useState(false);
  const [status, setStatus] = useState<ReportStatus>('draft');
  const [reviewComment, setReviewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setFeedback(null);
      setConfirmClearForZero(false);
      const path = `monthlyReports/${reportId}`;
      try {
        const snap = await getDoc(doc(db, 'monthlyReports', reportId));
        if (!active) return;
        if (snap.exists()) {
          const d = snap.data() as MonthlyReport;
          setIngresos(d.ingresos || []);
          setTraslados(d.traslados || []);
          setDesertores(d.desertores || []);
          setNoMovements(Boolean(d.noMovements));
          setStatus(d.status || 'draft');
          setReviewComment(d.reviewComment || '');
        } else {
          setIngresos([]);
          setTraslados([]);
          setDesertores([]);
          setNoMovements(false);
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
  }, [reportId]);

  const isLocked = readOnly || (profile.role !== 'admin' && (status === 'approved' || status === 'submitted'));
  const totalMovements = ingresos.length + traslados.length + desertores.length;

  const buildReportObject = (targetStatus: ReportStatus): MonthlyReport => ({
    id: reportId,
    year,
    month,
    schoolId: school.id,
    schoolName: school.name,
    saceCode: school.saceCode,
    level,
    directorUid: school.directorUid || profile.uid,
    directorName: school.directorDisplayName || profile.displayName,
    ingresos,
    traslados,
    desertores,
    noMovements,
    status: targetStatus,
    reviewComment,
    reviewedByUid: '',
  });

  const handleToggleNoMovements = (checked: boolean) => {
    setFeedback(null);
    if (!checked) {
      setNoMovements(false);
      setConfirmClearForZero(false);
      return;
    }
    if (totalMovements === 0) {
      setNoMovements(true);
      setConfirmClearForZero(false);
      return;
    }
    const hasContent = [...ingresos, ...traslados, ...desertores].some(
      (r) => r.rne.trim() || r.nombre.trim() || r.gradoSeccion.trim()
    );
    if (!hasContent) {
      setIngresos([]);
      setTraslados([]);
      setDesertores([]);
      setNoMovements(true);
      setConfirmClearForZero(false);
      return;
    }
    setConfirmClearForZero(true);
  };

  const handleConfirmClearForZero = () => {
    setIngresos([]);
    setTraslados([]);
    setDesertores([]);
    setNoMovements(true);
    setConfirmClearForZero(false);
  };

  const handleSave = async (
    targetStatus: 'draft' | 'submitted' | 'approved',
    options?: { forceNoMovements?: boolean }
  ) => {
    setFeedback(null);
    const effectiveNoMovements = options?.forceNoMovements ?? noMovements;

    const cleanRows = (rows: MovementRow[]) =>
      rows.map((r) => ({
        id: r.id,
        rne: r.rne.trim(),
        nombre: r.nombre.trim(),
        sexo: r.sexo,
        accion: r.accion.trim(),
        gradoSeccion: r.gradoSeccion.trim(),
        mes: r.mes.trim() || defaultMovementMonth,
      }));

    const finalIngresos = effectiveNoMovements ? [] : cleanRows(ingresos);
    const finalTraslados = effectiveNoMovements ? [] : cleanRows(traslados);
    const finalDesertores = effectiveNoMovements ? [] : cleanRows(desertores);

    if (targetStatus === 'submitted' || targetStatus === 'approved') {
      if (
        !effectiveNoMovements &&
        finalIngresos.length + finalTraslados.length + finalDesertores.length === 0
      ) {
        setFeedback({
          type: 'err',
          text: 'No hay movimientos registrados. Si este mes no hubo ingresos, traslados ni desertores, marca "Reportar mes sin movimientos SACE" o presiona "Enviar sin movimientos SACE".',
        });
        return;
      }

      if (!effectiveNoMovements) {
        const invalidRow = [...finalIngresos, ...finalTraslados, ...finalDesertores].find(
          (r) => !r.nombre || !r.gradoSeccion
        );
        if (invalidRow) {
          setFeedback({
            type: 'err',
            text: 'Completa el Nombre y Grado/Sección en todas las filas registradas antes de enviar o aprobar.',
          });
          return;
        }
      }
    }

    setSaving(true);
    const path = `monthlyReports/${reportId}`;
    try {
      const ref = doc(db, 'monthlyReports', reportId);
      const existing = await getDoc(ref);
      const validSchoolDirectorUid =
        school.directorUid && /^[a-zA-Z0-9_-]{1,128}$/.test(school.directorUid)
          ? school.directorUid
          : '';
      const resolvedDirectorName = school.directorDisplayName || profile.displayName;
      const isAdminActor = profile.role === 'admin';

      if (existing.exists()) {
        const existingData = existing.data() as MonthlyReport;
        await updateDoc(ref, {
          schoolName: school.name,
          saceCode: school.saceCode,
          directorName: resolvedDirectorName,
          ingresos: finalIngresos,
          traslados: finalTraslados,
          desertores: finalDesertores,
          noMovements: effectiveNoMovements,
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
          level,
          directorUid: validSchoolDirectorUid || profile.uid,
          directorName: resolvedDirectorName,
          ingresos: finalIngresos,
          traslados: finalTraslados,
          desertores: finalDesertores,
          noMovements: effectiveNoMovements,
          status: targetStatus,
          reviewComment: '',
          reviewedByUid: isAdminActor && targetStatus === 'approved' ? profile.uid : '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      if (effectiveNoMovements) {
        setIngresos([]);
        setTraslados([]);
        setDesertores([]);
        setNoMovements(true);
        setConfirmClearForZero(false);
      }
      setStatus(targetStatus);
      if (targetStatus === 'approved' || targetStatus === 'submitted') {
        setReviewComment('');
      }
      setFeedback({
        type: 'ok',
        text:
          targetStatus === 'approved'
            ? effectiveNoMovements
              ? 'Reporte mensual sin movimientos SACE guardado y aprobado oficialmente.'
              : 'Reporte mensual guardado y aprobado oficialmente.'
            : targetStatus === 'submitted'
            ? effectiveNoMovements
              ? 'Reporte mensual sin movimientos SACE enviado al Distrito Educativo N° 18-B.'
              : 'Reporte mensual enviado al Distrito Educativo N° 18-B para revisión.'
            : effectiveNoMovements
            ? 'Borrador sin movimientos SACE guardado en la nube.'
            : 'Borrador guardado en la nube.',
      });
      onAfterSave?.();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } finally {
      setSaving(false);
    }
  };

  const renderSection = (
    title: string,
    accentClass: string,
    rows: MovementRow[],
    setRows: React.Dispatch<React.SetStateAction<MovementRow[]>>,
    defaultAction: string
  ) => (
    <section className="bg-white border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/80">
        <div className="flex items-center gap-3">
          <h3 className={`font-display text-sm font-bold ${accentClass}`}>{title}</h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>
        {!isLocked && !noMovements && (
          <button
            type="button"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { ...createEmptyMovementRow(defaultMovementMonth), accion: defaultAction },
              ])
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar estudiante
          </button>
        )}
      </div>

      <div className="overflow-x-auto matrix-scroll">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-emerald-50/90 text-slate-800 border-b border-slate-200">
              <th className="px-2.5 py-2 text-center font-semibold w-10 border-r border-slate-200">N°</th>
              <th className="px-2.5 py-2 text-left font-semibold min-w-[140px] border-r border-slate-200">RNE</th>
              <th className="px-2.5 py-2 text-left font-semibold min-w-[220px] border-r border-slate-200">NOMBRE</th>
              <th className="px-2.5 py-2 text-center font-semibold w-24 border-r border-slate-200">SEXO</th>
              <th className="px-2.5 py-2 text-left font-semibold min-w-[150px] border-r border-slate-200">ACCIÓN</th>
              <th className="px-2.5 py-2 text-left font-semibold min-w-[150px] border-r border-slate-200">GRADO Y SECCIÓN</th>
              <th className="px-2.5 py-2 text-left font-semibold w-32 border-r border-slate-200">MES</th>
              {!isLocked && <th className="px-2 py-2 text-center font-semibold w-12"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={isLocked ? 7 : 8}
                  className="px-4 py-6 text-center text-xs text-slate-500"
                >
                  {noMovements
                    ? `Mes declarado sin movimientos SACE de ${title.toLowerCase()} en ${monthLabel}.`
                    : `No hay movimientos registrados en ${title.toLowerCase()} para ${monthLabel}.`}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-2.5 py-1.5 text-center font-mono tabular-nums text-slate-600 border-r border-slate-200">
                    {idx + 1}
                  </td>
                  <td className="px-2 py-1 border-r border-slate-200">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={row.rne}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, rne: e.target.value } : item
                          )
                        )
                      }
                      placeholder="0503201800000"
                      className="w-full px-2 py-1 font-mono text-xs border border-transparent focus:border-blue-600 focus:bg-white bg-transparent disabled:text-slate-700"
                    />
                  </td>
                  <td className="px-2 py-1 border-r border-slate-200">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={row.nombre}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, nombre: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Nombre completo del alumno"
                      className="w-full px-2 py-1 text-xs border border-transparent focus:border-blue-600 focus:bg-white bg-transparent disabled:text-slate-700"
                    />
                  </td>
                  <td className="px-2 py-1 border-r border-slate-200">
                    <select
                      disabled={isLocked}
                      value={row.sexo}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id
                              ? { ...item, sexo: e.target.value as 'F' | 'M' }
                              : item
                          )
                        )
                      }
                      className="w-full px-1.5 py-1 text-xs border border-slate-200 bg-white disabled:bg-transparent disabled:border-transparent"
                    >
                      <option value="F">F (Niña)</option>
                      <option value="M">M (Varón)</option>
                    </select>
                  </td>
                  <td className="px-2 py-1 border-r border-slate-200">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={row.accion}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, accion: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Ej. Matrícula nueva / Traslado"
                      className="w-full px-2 py-1 text-xs border border-transparent focus:border-blue-600 focus:bg-white bg-transparent disabled:text-slate-700"
                    />
                  </td>
                  <td className="px-2 py-1 border-r border-slate-200">
                    <input
                      type="text"
                      disabled={isLocked}
                      value={row.gradoSeccion}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, gradoSeccion: e.target.value } : item
                          )
                        )
                      }
                      placeholder="Ej. 3° A"
                      className="w-full px-2 py-1 text-xs border border-transparent focus:border-blue-600 focus:bg-white bg-transparent disabled:text-slate-700"
                    />
                  </td>
                  <td className="px-2 py-1 border-r border-slate-200">
                    <select
                      disabled={isLocked}
                      value={
                        MOVEMENT_MONTHS.find(
                          (m) => m.label.toLowerCase() === row.mes.trim().toLowerCase()
                        )?.label || ''
                      }
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((item) =>
                            item.id === row.id ? { ...item, mes: e.target.value } : item
                          )
                        )
                      }
                      className="w-full px-1.5 py-1 text-xs border border-slate-200 bg-white disabled:bg-transparent disabled:border-transparent"
                    >
                      {!MOVEMENT_MONTHS.some(
                        (m) => m.label.toLowerCase() === row.mes.trim().toLowerCase()
                      ) && (
                        <option value="" disabled>
                          Seleccionar mes
                        </option>
                      )}
                      {MOVEMENT_MONTHS.map((m) => (
                        <option key={m.value} value={m.label}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  {!isLocked && (
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setRows((prev) => prev.filter((item) => item.id !== row.id))
                        }
                        title="Eliminar fila"
                        className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 p-8 space-y-3 animate-pulse">
        <div className="h-5 bg-slate-200 w-64" />
        <div className="h-32 bg-slate-100 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Movimientos-SACE</span>
            <span aria-hidden="true">·</span>
            <span>{getSchoolLevelLabel(level, school)}</span>
            <span aria-hidden="true">·</span>
            <span>{monthLabel} {year}</span>
            <span aria-hidden="true">·</span>
            <StatusText status={status} />
          </div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            {school.name} <span className="font-mono text-sm font-normal text-slate-500">({school.saceCode})</span>
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              exportMonthlyReportExcel([buildReportObject(status)], {
                year,
                month,
                level,
                basicaScope: level === 'basica' ? getBasicaScope(school) : undefined,
                schoolName: school.name,
                saceCode: school.saceCode,
                community: school.community,
                directorName: profile.displayName,
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Excel
          </button>
          <button
            type="button"
            onClick={() =>
              exportMonthlyReportPdf([buildReportObject(status)], {
                year,
                month,
                level,
                basicaScope: level === 'basica' ? getBasicaScope(school) : undefined,
                schoolName: school.name,
                saceCode: school.saceCode,
                community: school.community,
                directorName: profile.displayName,
              })
            }
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
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                Guardar borrador
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('submitted')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                Enviar al Distrito
              </button>
              {profile.role === 'admin' && (
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
          )}
        </div>
      </div>

      {status === 'returned' && reviewComment && (
        <div className="p-4 bg-amber-50 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Reporte devuelto con observaciones del Distrito:</p>
            <p className="mt-0.5">{reviewComment}</p>
          </div>
        </div>
      )}

      {status === 'submitted' && !readOnly && (
        <div className="p-4 bg-blue-50 border border-blue-200 text-xs text-blue-900">
          Este reporte ya fue enviado al Distrito Educativo N° 18-B y está en revisión. Si el administrador encuentra alguna observación, te lo devolverá para que puedas corregirlo.
        </div>
      )}

      {status === 'approved' && !readOnly && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>Este reporte mensual fue aprobado por el Distrito Educativo N° 18-B y se encuentra cerrado.</span>
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

      {!isLocked ? (
        <div
          className={`border p-4 space-y-3 ${
            noMovements
              ? 'bg-emerald-50/70 border-emerald-200'
              : 'bg-slate-50/80 border-slate-200'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noMovements}
                disabled={saving}
                onChange={(e) => handleToggleNoMovements(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-700 cursor-pointer"
              />
              <span className="space-y-0.5">
                <span className="block text-xs font-semibold text-slate-900">
                  Reportar mes sin movimientos SACE
                </span>
                <span className="block text-xs text-slate-600">
                  Marca esta opción si el centro educativo no registró ingresos, traslados ni
                  desertores en {monthLabel} {year}.
                </span>
              </span>
            </label>

            {!noMovements && totalMovements === 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave('submitted', { forceNoMovements: true })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-50 cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5 text-emerald-700" />
                Enviar sin movimientos SACE
              </button>
            )}

            {noMovements && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white border border-emerald-300 text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                Mes sin movimientos SACE activo
              </span>
            )}
          </div>

          {confirmClearForZero && (
            <div className="p-3 bg-amber-50 border border-amber-300 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900">
              <span>
                Hay <strong>{totalMovements}</strong> registro(s) capturado(s). ¿Deseas
                descartarlos para declarar {monthLabel} sin movimientos SACE?
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearForZero(false)}
                  className="px-3 py-1 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearForZero}
                  className="px-3 py-1 bg-amber-700 hover:bg-amber-800 text-white font-medium cursor-pointer"
                >
                  Limpiar y declarar sin movimientos
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        noMovements && (
          <div className="p-4 bg-slate-50 border border-slate-200 flex items-center gap-2 text-xs text-slate-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              <strong>Mes sin movimientos SACE:</strong> el centro confirmó que no registró
              ingresos, traslados ni desertores en {monthLabel} {year}.
            </span>
          </div>
        )
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white border border-slate-200 p-4">
        <div>
          <p className="text-xs text-slate-500">Total Ingresos ({monthLabel})</p>
          <p className="text-xl font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
            {ingresos.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total Traslados ({monthLabel})</p>
          <p className="text-xl font-mono font-semibold text-amber-700 tabular-nums mt-0.5">
            {traslados.length}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Total Desertores ({monthLabel})</p>
          <p className="text-xl font-mono font-semibold text-red-700 tabular-nums mt-0.5">
            {desertores.length}
          </p>
        </div>
      </div>

      {renderSection('INGRESOS', 'text-emerald-700', ingresos, setIngresos, 'Ingreso')}
      {renderSection('TRASLADOS', 'text-amber-700', traslados, setTraslados, 'Traslado')}
      {renderSection('DESERTORES', 'text-red-700', desertores, setDesertores, 'Deserción')}
    </div>
  );
}
