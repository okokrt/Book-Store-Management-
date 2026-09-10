import React, { useState, useMemo } from 'react';
import {
  FileText,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  Sliders,
  CheckCircle,
  PlusCircle,
} from 'lucide-react';
import { InventoryTransaction } from '../types';

interface InventoryHistoryViewProps {
  transactions: InventoryTransaction[];
}

export const InventoryHistoryView: React.FC<InventoryHistoryViewProps> = ({
  transactions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tx.bookName.toLowerCase().includes(q) ||
        tx.userName.toLowerCase().includes(q) ||
        (tx.notes && tx.notes.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;

      return true;
    });
  }, [transactions, searchQuery, typeFilter]);

  // Reset pagination when search or filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return `${d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const renderBadge = (type: InventoryTransaction['type']) => {
    switch (type) {
      case 'stock_added':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <PlusCircle size={12} />
            Stock Added
          </span>
        );
      case 'book_sold':
      case 'course_sold':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-blue-50 text-blue-800 border border-blue-200">
            <CheckCircle size={12} />
            {type === 'course_sold' ? 'Course Sold' : 'Book Sold'}
          </span>
        );
      case 'stock_adjustment':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Sliders size={12} />
            Stock Adjusted
          </span>
        );
      case 'sale_refunded':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
            <ArrowUpRight size={12} />
            Sale Refunded
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };


  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <FileText className="text-indigo-600" size={26} />
          <span>Inventory Audit Log</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Immutable ledger of every physical book addition, sale deduction, and audit adjustment.
        </p>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by book name, user, or reason note..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={12} />
            Action Type:
          </span>

          {[
            { key: 'ALL', label: 'All Transactions' },
            { key: 'stock_added', label: 'Stock Added' },
            { key: 'book_sold', label: 'Book Sales' },
            { key: 'course_sold', label: 'Course Deductions' },
            { key: 'stock_adjustment', label: 'Stock Adjustments' },
            { key: 'sale_refunded', label: 'Sale Refunds' },
          ].map((tab) => (
            <button
              key={tab.key}
              id={`filter-type-${tab.key}`}
              onClick={() => setTypeFilter(tab.key)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                typeFilter === tab.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FileText size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No inventory transactions found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Transactions are logged automatically whenever book stock is added, sold, or adjusted.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6">Date & Time</th>
                  <th className="py-3 px-4">Book Title</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4 text-center">Delta</th>
                  <th className="py-3 px-4 text-center">Stock Change</th>
                  <th className="py-3 px-4">Reason / Notes</th>
                  <th className="py-3 px-4 sm:px-6">Authorized By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {paginatedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-4 sm:px-6 text-xs text-slate-600 font-medium">
                      {formatDate(tx.createdAt)}
                    </td>

                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {tx.bookName}
                    </td>

                    <td className="py-3.5 px-4">
                      {renderBadge(tx.type)}
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono font-bold">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          tx.quantity > 0
                            ? 'text-emerald-700 bg-emerald-50'
                            : 'text-red-700 bg-red-50'
                        }`}
                      >
                        {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-center font-mono text-xs text-slate-600">
                      <span>{tx.previousStock}</span>
                      <span className="mx-1 text-slate-400">&rarr;</span>
                      <span className="font-bold text-slate-900">{tx.newStock}</span>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {tx.notes || '—'}
                    </td>

                    <td className="py-3.5 px-4 sm:px-6 text-xs text-slate-700">
                      <span className="font-semibold block">{tx.userName}</span>
                      {tx.userRole && (
                        <span className="text-[10px] text-slate-400 uppercase font-bold">
                          {tx.userRole}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50 text-xs">
              <span className="text-slate-500 font-medium">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} of {filtered.length} records
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="btn-inv-prev"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2 font-mono font-bold text-slate-800">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  id="btn-inv-next"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white font-semibold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
