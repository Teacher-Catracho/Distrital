import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import type { ParteMensualAnnualSummary } from '../utils/saceCalculations';

const MONTH_SHORT_NAMES: Record<number, string> = {
  4: 'Abr',
  5: 'May',
  6: 'Jun',
  7: 'Jul',
  8: 'Ago',
  9: 'Sep',
  10: 'Oct',
};

interface ParteMensualSyncBannerProps {
  year: number;
  summary: ParteMensualAnnualSummary | null;
  isLocked: boolean;
  syncing: boolean;
  onSync: () => void;
}

export function ParteMensualSyncBanner({
  year,
  summary,
  isLocked,
  syncing,
  onSync,
}: ParteMensualSyncBannerProps) {
  if (!summary) return null;

  const foundNames = summary.monthsFound.map((m) => MONTH_SHORT_NAMES[m] || String(m)).join(', ');

  return (
    <div className="bg-blue-50/70 border border-blue-200 p-4 flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2 min-w-0 flex-1">
        <div className="space-y-0.5">
          <p className="text-xs font-semibold text-slate-900">
            Datos vinculados desde Parte Mensual {year}
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            <strong>Mat. Inicial</strong> se toma de <strong>Abril</strong> (matrícula consolidada);{' '}
            <strong>Ingresos, Desertores y Traslados</strong> se acumulan de los Partes Mensuales
            (Abril–Octubre); y <strong>Mat. Final</strong> se toma de la matrícula final de{' '}
            <strong>Octubre</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 border font-medium ${
              summary.hasApril
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {summary.hasApril ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-700" />
            )}
            Abril (Mat. Inicial): {summary.hasApril ? 'Cargado' : 'Pendiente'}
          </span>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 border font-medium ${
              summary.hasOctober
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            {summary.hasOctober ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            ) : (
              <AlertTriangle className="w-3 h-3 text-amber-700" />
            )}
            Octubre (Mat. Final): {summary.hasOctober ? 'Cargado' : 'Pendiente'}
          </span>

          <span className="inline-flex items-center gap-1 px-2 py-0.5 border border-slate-200 bg-white text-slate-700 font-medium">
            Partes Abr–Oct ({summary.monthsFound.length}/7):{' '}
            <span className="font-mono">{foundNames || 'Ninguno'}</span>
          </span>
        </div>
      </div>

      {!isLocked && (
        <button
          type="button"
          disabled={syncing}
          onClick={onSync}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-300 hover:bg-blue-50 cursor-pointer whitespace-nowrap disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Actualizando...' : 'Actualizar desde Parte Mensual'}
        </button>
      )}
    </div>
  );
}
