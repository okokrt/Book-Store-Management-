import React from 'react';
import { AlertSeverity } from '../types';
import { AlertTriangle, AlertCircle, Info, XCircle, CheckCircle2 } from 'lucide-react';
import { getStockSeverity } from '../utils/stockUtils';

interface AlertBadgeProps {
  severity?: AlertSeverity;
  stock?: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const AlertBadge: React.FC<AlertBadgeProps> = ({
  severity,
  stock,
  label,
  size = 'md',
  showIcon = true,
}) => {
  // If severity not passed directly, compute from centralized getStockSeverity
  let computedSeverity = severity;
  if (!computedSeverity && stock !== undefined) {
    const s = getStockSeverity(stock);
    if (s !== 'normal') {
      computedSeverity = s;
    }
  }

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-medium',
    md: 'px-2.5 py-1 text-xs font-semibold',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  };

  const iconSizes = {
    sm: 12,
    md: 14,
    lg: 16,
  };

  if (computedSeverity === 'out_of_stock') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-red-100 text-red-800 border border-red-200 tracking-tight ${sizeClasses[size]}`}
      >
        {showIcon && <XCircle size={iconSizes[size]} className="text-red-700 flex-shrink-0" />}
        <span>{label || 'Out of Stock'}</span>
      </span>
    );
  }

  if (computedSeverity === 'very_low') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 tracking-tight ${sizeClasses[size]}`}
      >
        {showIcon && <AlertCircle size={iconSizes[size]} className="text-rose-700 flex-shrink-0" />}
        <span>{label || 'Very Low Stock — 1 Left'}</span>
      </span>
    );
  }

  if (computedSeverity === 'critical') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 tracking-tight ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle size={iconSizes[size]} className="text-amber-700 flex-shrink-0" />}
        <span>{label || 'Critical Low Stock'}</span>
      </span>
    );
  }

  if (computedSeverity === 'low') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-yellow-100 text-yellow-900 border border-yellow-300 tracking-tight ${sizeClasses[size]}`}
      >
        {showIcon && <AlertTriangle size={iconSizes[size]} className="text-yellow-700 flex-shrink-0" />}
        <span>{label || 'Low Stock Warning'}</span>
      </span>
    );
  }

  if (computedSeverity === 'reminder') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-blue-100 text-blue-900 border border-blue-200 tracking-tight ${sizeClasses[size]}`}
      >
        {showIcon && <Info size={iconSizes[size]} className="text-blue-700 flex-shrink-0" />}
        <span>{label || 'Stock Reminder'}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200 tracking-tight ${sizeClasses[size]}`}
    >
      {showIcon && <CheckCircle2 size={iconSizes[size]} className="text-emerald-700 flex-shrink-0" />}
      <span>{label || 'In Stock'}</span>
    </span>
  );
};
