import React, { useState, useMemo } from 'react';
import {
  History,
  Search,
  Filter,
  Calendar,
  BookOpen,
  Boxes,
  User,
  Eye,
  CheckCircle2,
  PackageCheck,
} from 'lucide-react';
import { Sale } from '../types';
import { Modal } from './Modal';
import { getLocalDateKey } from '../utils/stockUtils';

interface SalesHistoryViewProps {
  sales: Sale[];
}

type DateFilter = 'TODAY' | 'LAST_7' | 'LAST_30' | 'ALL' | 'CUSTOM';

export const SalesHistoryView: React.FC<SalesHistoryViewProps> = ({ sales }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 25;

  // Filtered sales
  const filteredSales = useMemo(() => {
    const todayKey = getLocalDateKey();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return sales.filter((sale) => {
      // Search: covers saleNumber, snapshot name, cashier, notes, and individual line items
      const q = searchQuery.toLowerCase().trim();
      const matchesNestedItems =
        sale.items &&
        sale.items.some(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.code && it.code.toLowerCase().includes(q))
        );
      const matchesSearch =
        !q ||
        String(sale.saleNumber).includes(q) ||
        sale.itemNameSnapshot.toLowerCase().includes(q) ||
        sale.userName.toLowerCase().includes(q) ||
        (sale.notes && sale.notes.toLowerCase().includes(q)) ||
        Boolean(matchesNestedItems);

      if (!matchesSearch) return false;

      const saleDate = new Date(sale.createdAt);

      if (dateFilter === 'TODAY') {
        return getLocalDateKey(saleDate) === todayKey;
      }
      if (dateFilter === 'LAST_7') {
        return saleDate >= sevenDaysAgo;
      }
      if (dateFilter === 'LAST_30') {
        return saleDate >= thirtyDaysAgo;
      }
      if (dateFilter === 'CUSTOM') {
        if (customStartDate && new Date(sale.createdAt) < new Date(customStartDate)) return false;
        if (customEndDate) {
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (new Date(sale.createdAt) > end) return false;
        }
        return true;
      }

      return true;
    });
  }, [sales, searchQuery, dateFilter, customStartDate, customEndDate]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFilter, customStartDate, customEndDate]);

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / ITEMS_PER_PAGE));
  const paginatedSales = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSales.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSales, currentPage]);


  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (isoString: string) => {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
          <History className="text-indigo-600" size={26} />
          <span>Sales History</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Auditable chronological record of sold books and course bundles. Strictly tracks inventory changes with zero financial/payment data.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by sale #, item name, or notes..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Calendar size={12} />
            Date Range:
          </span>

          {[
            { key: 'ALL' as const, label: 'All History' },
            { key: 'TODAY' as const, label: 'Today' },
            { key: 'LAST_7' as const, label: 'Last 7 Days' },
            { key: 'LAST_30' as const, label: 'Last 30 Days' },
            { key: 'CUSTOM' as const, label: 'Custom Range' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setDateFilter(tab.key)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors ${
                dateFilter === tab.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Custom Range Inputs */}
        {dateFilter === 'CUSTOM' && (
          <div className="pt-2 flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-md bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1 border border-slate-300 rounded-md bg-white"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                }}
                className="text-indigo-600 font-bold hover:underline"
              >
                Reset Dates
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sales List Table */}
      {filteredSales.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <History size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No sales records found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || dateFilter !== 'ALL'
              ? 'Try modifying your search query or date filter.'
              : 'No items marked as sold yet. Go to "Sell / Mark as Sold" to record sales.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6">Sale ID</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Item Type</th>
                  <th className="py-3 px-4">Item Name</th>
                  <th className="py-3 px-4 text-center">Qty Sold</th>
                  <th className="py-3 px-4">Recorded By</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {paginatedSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Sale # */}
                    <td className="py-3.5 px-4 sm:px-6 font-mono font-bold text-indigo-600">
                      #{sale.saleNumber}
                    </td>

                    {/* Date & Time */}
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      <div className="font-semibold text-slate-800">{formatDate(sale.createdAt)}</div>
                      <div className="text-[11px] text-slate-400">{formatTime(sale.createdAt)}</div>
                    </td>

                    {/* Type */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold ${
                          sale.saleType === 'Multiple'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : sale.saleType === 'Course'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {sale.saleType === 'Multiple' ? (
                          <PackageCheck size={12} />
                        ) : sale.saleType === 'Course' ? (
                          <Boxes size={12} />
                        ) : (
                          <BookOpen size={12} />
                        )}
                        <span>{sale.saleType}</span>
                      </span>
                    </td>

                    {/* Item Name */}
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900">{sale.itemNameSnapshot}</span>
                      {sale.items && sale.items.length > 0 ? (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {sale.items.length} items bundle • ₹{(sale.totalPrice || 0).toLocaleString('en-IN')}
                        </div>
                      ) : sale.saleType === 'Course' && sale.deductedBooks ? (
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {sale.deductedBooks.length} component books deducted
                        </div>
                      ) : null}
                    </td>

                    {/* Quantity */}
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block px-2.5 py-1 rounded-lg text-sm font-mono font-extrabold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {sale.quantity}
                      </span>
                    </td>

                    {/* Recorded By */}
                    <td className="py-3.5 px-4 text-xs">
                      <span className="font-semibold text-slate-800 block">{sale.userName}</span>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        {sale.userRole}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 sm:px-6 text-right">
                      <button
                        id={`btn-view-sale-${sale.saleNumber}`}
                        onClick={() => setSelectedSale(sale)}
                        className="px-2.5 py-1.5 text-xs font-bold rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </button>
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
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredSales.length)} of {filteredSales.length} sales
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  id="btn-sales-prev"
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
                  id="btn-sales-next"
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

      {/* =========================================================================
          MODAL: SALE DETAILS RECEIPT
          ========================================================================= */}
      <Modal
        isOpen={!!selectedSale}
        onClose={() => setSelectedSale(null)}
        title={`Sale #${selectedSale?.saleNumber}`}
        subtitle="Stock deduction sale record"
      >
        {selectedSale && (
          <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Sale ID:</span>
                <span className="font-mono font-extrabold text-sm text-indigo-600">
                  #{selectedSale.saleNumber}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Date & Time:</span>
                <span className="font-semibold text-slate-800">
                  {formatDate(selectedSale.createdAt)} at {formatTime(selectedSale.createdAt)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Item Type:</span>
                <span className="font-bold text-slate-800">{selectedSale.saleType}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Item Name:</span>
                <span className="font-bold text-slate-900">{selectedSale.itemNameSnapshot}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Quantity Sold:</span>
                <span className="font-mono font-bold text-sm text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {selectedSale.quantity}
                </span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-slate-500 font-medium">Recorded By:</span>
                <span className="font-semibold text-slate-800">
                  {selectedSale.userName} ({selectedSale.userRole})
                </span>
              </div>
            </div>

              {/* If Multi-Item Sale: show line items */}
              {selectedSale.items && selectedSale.items.length > 0 && (
                <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-2 flex items-center gap-1.5">
                    <PackageCheck size={14} className="text-amber-700" />
                    <span>Line Items Included in This Sale ({selectedSale.items.length}):</span>
                  </h4>
                  <div className="space-y-1.5">
                    {selectedSale.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-amber-100"
                      >
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-900">{item.name}</span>
                            <span className="text-[10px] text-slate-500 font-normal">({item.itemType})</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {item.quantity} × ₹{item.unitPrice.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-emerald-700">
                          ₹{item.totalPrice.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Component books deducted breakdown */}
              {selectedSale.deductedBooks && selectedSale.deductedBooks.length > 0 && (
                <div className="p-3.5 bg-purple-50/70 rounded-xl border border-purple-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-900 mb-2 flex items-center gap-1.5">
                    <Boxes size={14} className="text-purple-700" />
                    <span>Component Books Deducted From Physical Inventory:</span>
                  </h4>
                  <div className="space-y-1.5">
                    {selectedSale.deductedBooks.map((db, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs bg-white p-2 rounded-lg border border-purple-100"
                      >
                        <span className="font-semibold text-slate-800">{db.bookName}</span>
                        <span className="font-mono font-bold text-purple-700">
                          &minus;{db.quantityDeducted} copies
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedSale(null)}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
