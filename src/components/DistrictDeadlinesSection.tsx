import { useEffect, useState } from 'react';
import {
  BellOff,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Save,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { DistrictDeadlines } from '../types/sace';
import {
  MONTHS,
  evaluate48HourWindow,
  getDefaultMonthDeadlineStr,
} from '../utils/saceCalculations';

interface DistrictDeadlinesSectionProps {
  year: number;
  adminUid: string;
  deadlines: DistrictDeadlines | null;
  onSaved?: () => void;
}

function sanitizeByMonthMap(map: Record<string, string>): Record<string, string> {
  const clean: Record<string, string> = {};
  for (let m = 1; m <= 12; m++) {
    const val = (map[String(m)] || '').trim().slice(0, 16);
    if (val) {
      clean[String(m)] = val;
    }
  }
  return clean;
}

function StatusBadge({ deadline }: { deadline: string }) {
  if (!deadline) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
        Sin alerta configurada
      </span>
    );
  }
  const win = evaluate48HourWindow(deadline);
  if (!win) return null;
  if (win.isOverdue) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
        <Clock className="w-3 h-3 text-slate-500" />
        Plazo vencido
      </span>
    );
  }
  if (win.isWithin48Hours) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5">
        <BellRing className="w-3 h-3 text-amber-700" />
        Alerta &lt; 48 h activa ({win.formattedRemaining})
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="w-3 h-3 text-emerald-700" />
      Programada · {win.formattedRemaining}
    </span>
  );
}

export function DistrictDeadlinesSection({
  year,
  adminUid,
  deadlines,
  onSaved,
}: DistrictDeadlinesSectionProps) {
  const currentMonth = new Date().getMonth() + 1;

  const [parteMonth, setParteMonth] = useState<number>(currentMonth);
  const [parteDeadline, setParteDeadline] = useState<string>(() =>
    getDefaultMonthDeadlineStr(year, currentMonth)
  );
  const [movMonth, setMovMonth] = useState<number>(currentMonth);
  const [movDeadline, setMovDeadline] = useState<string>(() =>
    getDefaultMonthDeadlineStr(year, currentMonth)
  );
  const [annualDeadline, setAnnualDeadline] = useState<string>(`${year}-11-30T23:59`);
  const [parteByMonth, setParteByMonth] = useState<Record<string, string>>({});
  const [movByMonth, setMovByMonth] = useState<Record<string, string>>({});
  const [parteDisabled, setParteDisabled] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    const pMonth = deadlines?.parteMensualMonth ?? currentMonth;
    const mMonth = deadlines?.movimientosMonth ?? currentMonth;
    const pDeadline =
      deadlines?.parteMensualDeadline ?? getDefaultMonthDeadlineStr(year, pMonth);
    const mDeadline =
      deadlines?.movimientosDeadline ?? getDefaultMonthDeadlineStr(year, mMonth);
    const savedParteByMonth = deadlines?.parteMensualByMonth || {};
    const isSavedParteDisabled = Boolean(
      deadlines &&
        !deadlines.parteMensualDeadline &&
        Object.keys(savedParteByMonth).length === 0
    );

    setParteMonth(pMonth);
    setParteDeadline(pDeadline);
    setParteDisabled(isSavedParteDisabled);
    setMovMonth(mMonth);
    setMovDeadline(mDeadline);
    setAnnualDeadline(deadlines?.annualDeadline ?? `${year}-11-30T23:59`);
    setParteByMonth(
      isSavedParteDisabled
        ? {}
        : {
            ...savedParteByMonth,
            ...(pDeadline ? { [String(pMonth)]: pDeadline } : {}),
          }
    );
    setMovByMonth({
      ...(deadlines?.movimientosByMonth || {}),
      ...(mDeadline ? { [String(mMonth)]: mDeadline } : {}),
    });
  }, [deadlines, year, currentMonth]);

  const handleToggleParteDisabled = (disabled: boolean) => {
    setParteDisabled(disabled);
    if (disabled) {
      setParteDeadline('');
      setParteByMonth({});
    } else {
      const def = getDefaultMonthDeadlineStr(year, parteMonth);
      setParteDeadline(def);
      setParteByMonth((prev) => ({
        ...prev,
        [String(parteMonth)]: def,
      }));
    }
  };

  const handleParteMonthSelect = (nextMonth: number) => {
    setParteMonth(nextMonth);
    if (parteDisabled) return;
    const scheduled = parteByMonth[String(nextMonth)];
    if (scheduled !== undefined) {
      setParteDeadline(scheduled);
    } else if (parteDeadline === getDefaultMonthDeadlineStr(year, parteMonth)) {
      setParteDeadline(getDefaultMonthDeadlineStr(year, nextMonth));
    }
  };

  const handleParteDeadlineChange = (val: string) => {
    if (val && parteDisabled) {
      setParteDisabled(false);
    }
    setParteDeadline(val);
    setParteByMonth((prev) => ({
      ...prev,
      [String(parteMonth)]: val,
    }));
  };

  const handleMovMonthSelect = (nextMonth: number) => {
    setMovMonth(nextMonth);
    const scheduled = movByMonth[String(nextMonth)];
    if (scheduled !== undefined) {
      setMovDeadline(scheduled);
    } else if (movDeadline === getDefaultMonthDeadlineStr(year, movMonth)) {
      setMovDeadline(getDefaultMonthDeadlineStr(year, nextMonth));
    }
  };

  const handleMovDeadlineChange = (val: string) => {
    setMovDeadline(val);
    setMovByMonth((prev) => ({
      ...prev,
      [String(movMonth)]: val,
    }));
  };

  const handleFillSchoolYearDefaults = () => {
    const nextParte: Record<string, string> = { ...parteByMonth };
    const nextMov: Record<string, string> = { ...movByMonth };
    for (let m = 2; m <= 11; m++) {
      const def = getDefaultMonthDeadlineStr(year, m);
      if (!parteDisabled && !nextParte[String(m)]) nextParte[String(m)] = def;
      if (!nextMov[String(m)]) nextMov[String(m)] = def;
    }
    if (!parteDisabled) {
      setParteByMonth(nextParte);
      if (!parteDeadline && nextParte[String(parteMonth)]) {
        setParteDeadline(nextParte[String(parteMonth)]);
      }
    }
    setMovByMonth(nextMov);
    if (!movDeadline && nextMov[String(movMonth)]) {
      setMovDeadline(nextMov[String(movMonth)]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    const configId = `deadlines_${year}`;
    const ref = doc(db, 'districtConfig', configId);

    const nextParteMap = parteDisabled
      ? {}
      : sanitizeByMonthMap({
          ...parteByMonth,
          [String(parteMonth)]: parteDeadline,
        });
    const nextMovMap = sanitizeByMonthMap({
      ...movByMonth,
      [String(movMonth)]: movDeadline,
    });

    const payload = {
      parteMensualMonth: Number(parteMonth),
      parteMensualDeadline: parteDisabled
        ? ''
        : parteDeadline
        ? parteDeadline.slice(0, 16)
        : '',
      movimientosMonth: Number(movMonth),
      movimientosDeadline: movDeadline ? movDeadline.slice(0, 16) : '',
      annualDeadline: annualDeadline ? annualDeadline.slice(0, 16) : '',
      parteMensualByMonth: nextParteMap,
      movimientosByMonth: nextMovMap,
      updatedByUid: adminUid,
      updatedAt: serverTimestamp(),
    };

    try {
      if (deadlines) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, {
          year,
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      setFeedback({
        type: 'ok',
        text: `Fechas límite ${year} guardadas. Las alertas en el tablero de los directores se actualizarán automáticamente.`,
      });
      onSaved?.();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `districtConfig/${configId}`);
    } finally {
      setSaving(false);
    }
  };

  const scheduledMonthsCount = new Set([
    ...Object.keys(parteByMonth).filter((k) => Boolean(parteByMonth[k])),
    ...Object.keys(movByMonth).filter((k) => Boolean(movByMonth[k])),
  ]).size;

  return (
    <section className="bg-white border border-slate-200">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-700 shrink-0" />
            <h2 className="font-display text-sm font-bold text-slate-900">
              Fechas Límite de Entrega — Reportes SACE ({year})
            </h2>
            <span className="text-[11px] font-medium px-2 py-0.5 border border-slate-200 bg-slate-50 text-slate-700">
              {deadlines ? 'Configuración guardada' : 'Valores por defecto'}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Define la fecha y hora máxima de entrega distrital. Cuando falten menos de{' '}
            <strong>48 horas</strong>, las notificaciones del Dashboard del director se activan
            automáticamente en tiempo real.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowSchedule((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
        >
          <span>Calendario mensual Ene–Dic ({scheduledMonthsCount})</span>
          {showSchedule ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <form onSubmit={handleSave} className="p-5 space-y-4 text-xs">
        {feedback && (
          <div
            className={`p-3 border flex items-center gap-2 ${
              feedback.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Parte Mensual */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">1. Parte Mensual</span>
              <button
                type="button"
                onClick={() =>
                  handleParteDeadlineChange(getDefaultMonthDeadlineStr(year, parteMonth))
                }
                className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
              >
                Usar fin de mes
              </button>
            </div>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={parteDisabled}
                onChange={(e) => handleToggleParteDisabled(e.target.checked)}
                className="accent-blue-700 cursor-pointer"
              />
              <span>Desactivar alerta de Parte Mensual</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Mes evaluado
                </label>
                <select
                  value={parteMonth}
                  disabled={parteDisabled}
                  onChange={(e) => handleParteMonthSelect(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Fecha y hora límite
                </label>
                <input
                  type="datetime-local"
                  value={parteDeadline}
                  disabled={parteDisabled}
                  onChange={(e) => handleParteDeadlineChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
              </div>
            </div>
            <div className="pt-1">
              {parteDisabled ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                  <BellOff className="w-3 h-3 text-slate-500" />
                  Alerta desactivada (no aparecerá aviso de fecha de entrega)
                </span>
              ) : (
                <StatusBadge deadline={parteDeadline} />
              )}
            </div>
          </div>

          {/* Movimientos-SACE Mensuales */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">2. Movimientos-SACE Mensuales</span>
              <button
                type="button"
                onClick={() =>
                  handleMovDeadlineChange(getDefaultMonthDeadlineStr(year, movMonth))
                }
                className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
              >
                Usar fin de mes
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Mes evaluado
                </label>
                <select
                  value={movMonth}
                  onChange={(e) => handleMovMonthSelect(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-slate-300 bg-white"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Fecha y hora límite
                </label>
                <input
                  type="datetime-local"
                  value={movDeadline}
                  onChange={(e) => handleMovDeadlineChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 bg-white"
                />
              </div>
            </div>
            <div className="pt-1">
              <StatusBadge deadline={movDeadline} />
            </div>
          </div>

          {/* Cuadros Anuales */}
          <div className="p-4 bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  3. Cuadros Estadísticos Anuales
                </span>
                <button
                  type="button"
                  onClick={() => setAnnualDeadline(`${year}-11-30T23:59`)}
                  className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                >
                  Usar 30 nov
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Fecha y hora límite anual ({year})
                </label>
                <input
                  type="datetime-local"
                  value={annualDeadline}
                  onChange={(e) => setAnnualDeadline(e.target.value)}
                  className="w-full px-2.5 py-1.5 font-mono border border-slate-300 bg-white"
                />
              </div>
            </div>
            <div className="pt-1">
              <StatusBadge deadline={annualDeadline} />
            </div>
          </div>
        </div>

        {/* Optional full-year monthly schedule */}
        {showSchedule && (
          <div className="border border-slate-200">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">
                  Programación por mes ({year})
                </p>
                <p className="text-[11px] text-slate-500">
                  Opcional: define fechas específicas para cada mes del año para alertar entregas
                  mensuales programadas con anticipación.
                </p>
              </div>
              <button
                type="button"
                onClick={handleFillSchoolYearDefaults}
                className="px-3 py-1.5 text-[11px] font-medium border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 cursor-pointer whitespace-nowrap"
              >
                Autocompletar fin de mes (Feb–Nov)
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">Mes</th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      Parte Mensual — Fecha límite
                    </th>
                    <th className="px-4 py-2 text-left font-semibold text-slate-700">
                      Movimientos-SACE — Fecha límite
                    </th>
                    <th className="px-4 py-2 text-right font-semibold text-slate-700">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {MONTHS.map((m) => {
                    const pVal = parteByMonth[String(m.value)] || '';
                    const mVal = movByMonth[String(m.value)] || '';
                    return (
                      <tr key={m.value} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2 font-medium text-slate-900 whitespace-nowrap">
                          {m.label} {year}
                        </td>
                        <td className="px-4 py-1.5">
                          <input
                            type="datetime-local"
                            value={pVal}
                            disabled={parteDisabled}
                            onChange={(e) => {
                              const next = e.target.value;
                              setParteByMonth((prev) => ({ ...prev, [String(m.value)]: next }));
                              if (m.value === parteMonth) setParteDeadline(next);
                            }}
                            className="px-2.5 py-1 font-mono border border-slate-300 bg-white w-52 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="px-4 py-1.5">
                          <input
                            type="datetime-local"
                            value={mVal}
                            onChange={(e) => {
                              const next = e.target.value;
                              setMovByMonth((prev) => ({ ...prev, [String(m.value)]: next }));
                              if (m.value === movMonth) setMovDeadline(next);
                            }}
                            className="px-2.5 py-1 font-mono border border-slate-300 bg-white w-52"
                          />
                        </td>
                        <td className="px-4 py-1.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              const def = getDefaultMonthDeadlineStr(year, m.value);
                              if (!parteDisabled) {
                                setParteByMonth((prev) => ({ ...prev, [String(m.value)]: def }));
                                if (m.value === parteMonth) setParteDeadline(def);
                              }
                              setMovByMonth((prev) => ({ ...prev, [String(m.value)]: def }));
                              if (m.value === movMonth) setMovDeadline(def);
                            }}
                            className="text-[11px] font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Fin de mes
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Nota: Si dejas una fecha vacía, no se emitirá alerta automática de 48 horas para ese
            cuadro.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Guardando...' : 'Guardar fechas límite'}
          </button>
        </div>
      </form>
    </section>
  );
}
