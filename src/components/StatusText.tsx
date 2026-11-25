import { AlertTriangle, CheckCircle2, Clock, FileEdit } from 'lucide-react';
import type { ReportStatus } from '../types/sace';
import { STATUS_LABELS } from '../utils/saceCalculations';

export function StatusText({ status }: { status: ReportStatus }) {
  switch (status) {
    case 'approved':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    case 'submitted':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    case 'returned':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <FileEdit className="w-3.5 h-3.5 shrink-0" />
          {STATUS_LABELS[status]}
        </span>
      );
  }
}
