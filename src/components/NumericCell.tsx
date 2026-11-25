import React from 'react';

interface NumericCellProps {
  value: number;
  onChange?: (next: number) => void;
  disabled?: boolean;
  highlight?: boolean;
}

export function NumericCell({ value, onChange, disabled, highlight }: NumericCellProps) {
  if (disabled) {
    return (
      <div
        className={`w-full px-1.5 py-1 text-right font-mono text-xs tabular-nums ${
          highlight ? 'font-semibold text-slate-900' : 'text-slate-700'
        }`}
      >
        {value}
      </div>
    );
  }

  return (
    <input
      type="number"
      min={0}
      step={1}
      value={value === 0 ? '' : value}
      placeholder="0"
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const parsed = parseInt(e.target.value, 10);
        onChange?.(Number.isNaN(parsed) || parsed < 0 ? 0 : parsed);
      }}
      className="w-12 sm:w-14 px-1.5 py-1 text-right font-mono text-xs tabular-nums bg-white border border-slate-200 focus:border-blue-700 focus:bg-blue-50/40 focus:outline-none placeholder:text-slate-300"
    />
  );
}
