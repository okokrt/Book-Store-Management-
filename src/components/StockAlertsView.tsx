import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  PackagePlus,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  AlertCircle,
  Info,
  BookOpen,
  Boxes,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { StockAlert, Book, Course, AlertSeverity } from '../types';
import { AlertBadge } from './AlertBadge';

interface StockAlertsViewProps {
  alerts: StockAlert[];
  books: Book[];
  booksMap: Record<string, Book>;
  onOpenAddStockModal: (book: Book) => void;
  onQuickSell: (type: 'Book' | 'Course', id: string) => void;
}

type SeverityFilter = 'ALL' | AlertSeverity;

export const StockAlertsView: React.FC<StockAlertsViewProps> = ({
  alerts,
  books,
  booksMap,
  onOpenAddStockModal,
  onQuickSell,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<SeverityFilter>('ALL');
  const [selectedType, setSelectedType] = useState<'ALL' | 'Book' | 'Course'>('ALL');

  const filteredAlerts = useMemo(() => {
    return alerts.filter((alert) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || alert.itemName.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (selectedSeverity !== 'ALL' && alert.severity !== selectedSeverity) return false;
      if (selectedType !== 'ALL' && alert.itemType !== selectedType) return false;

      return true;
    });
  }, [alerts, searchQuery, selectedSeverity, selectedType]);

  // Counts by severity
  const countOut = alerts.filter((a) => a.severity === 'out_of_stock').length;
  const countVeryLow = alerts.filter((a) => a.severity === 'very_low').length;
  const countCritical = alerts.filter((a) => a.severity === 'critical').length;
  const countLow = alerts.filter((a) => a.severity === 'low').length;
  const countReminder = alerts.filter((a) => a.severity === 'reminder').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="text-amber-600" size={26} />
          <span>Internal Stock Alerts</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Automatic internal warnings when physical books or calculated course bundles reach critical inventory thresholds.
        </p>
      </div>

      {/* Threshold Rules Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2.5">
          Standard Bookstore Alert Thresholds
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 text-xs">
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200">
            <span className="font-extrabold text-red-800 block">Stock = 0</span>
            <span className="text-red-700 text-[11px]">Out of Stock</span>
          </div>
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
            <span className="font-extrabold text-rose-800 block">Stock = 1</span>
            <span className="text-rose-700 text-[11px]">Very Low Stock</span>
          </div>
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <span className="font-extrabold text-amber-800 block">Stock = 2 to 5</span>
            <span className="text-amber-700 text-[11px]">Critical Low Stock</span>
          </div>
          <div className="p-2.5 rounded-lg bg-yellow-50 border border-yellow-200">
            <span className="font-extrabold text-yellow-900 block">Stock = 6 to 10</span>
            <span className="text-yellow-800 text-[11px]">Low Stock Warning</span>
          </div>
          <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
            <span className="font-extrabold text-blue-900 block">Stock = 11 to 15</span>
            <span className="text-blue-800 text-[11px]">Stock Reminder</span>
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items with active alerts..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={12} />
            Severity:
          </span>

          {[
            { key: 'ALL' as const, label: 'All Alerts', count: alerts.length },
            { key: 'out_of_stock' as const, label: 'Out of Stock (0)', count: countOut },
            { key: 'very_low' as const, label: 'Very Low (1)', count: countVeryLow },
            { key: 'critical' as const, label: 'Critical (2-5)', count: countCritical },
            { key: 'low' as const, label: 'Low Stock (6-10)', count: countLow },
            { key: 'reminder' as const, label: 'Reminder (11-15)', count: countReminder },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedSeverity(tab.key)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                selectedSeverity === tab.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Type:</span>
          {(['ALL', 'Book', 'Course'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-md border ${
                selectedType === type
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {type === 'ALL' ? 'All Types' : type}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Grid / List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <CheckCircle size={36} className="text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">
            {alerts.length === 0
              ? 'No active stock alerts!'
              : 'No alerts match the selected filter'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {alerts.length === 0
              ? 'All books and courses have 16 or more units in stock.'
              : 'Try clearing the search query or switching severity filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert) => {
            const isBook = alert.itemType === 'Book';
            const targetBook = isBook ? booksMap[alert.itemId] : undefined;

            return (
              <div
                key={alert.id}
                className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="flex-shrink-0">
                    <AlertBadge severity={alert.severity} label={alert.level} size="lg" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {alert.itemType}
                      </span>
                      <h4 className="text-base font-extrabold text-slate-900">{alert.itemName}</h4>
                    </div>
                    <p className="text-xs font-semibold text-slate-600 mt-1">
                      {alert.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                      Current Stock
                    </span>
                    <span
                      className={`text-xl font-extrabold font-mono ${
                        alert.currentStock === 0
                          ? 'text-red-600'
                          : alert.currentStock <= 5
                          ? 'text-amber-600'
                          : 'text-slate-800'
                      }`}
                    >
                      {alert.currentStock}
                    </span>
                  </div>

                  {/* 1-Click Add Stock for Books */}
                  {isBook && targetBook && (
                    <button
                      onClick={() => onOpenAddStockModal(targetBook)}
                      className="px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors flex items-center gap-1.5"
                    >
                      <Plus size={15} />
                      <span>Add Stock</span>
                    </button>
                  )}

                  {/* Mark as Sold */}
                  <button
                    onClick={() => onQuickSell(alert.itemType, alert.itemId)}
                    disabled={alert.currentStock === 0}
                    className={`px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors ${
                      alert.currentStock === 0
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                    }`}
                  >
                    <CheckCircle size={15} />
                    <span>SOLD</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
