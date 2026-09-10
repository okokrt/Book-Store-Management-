import React from 'react';
import {
  BookOpen,
  Boxes,
  CheckCircle,
  AlertTriangle,
  History,
  TrendingUp,
  PackagePlus,
  ArrowRight,
  Sparkles,
  Plus,
  BookMarked,
} from 'lucide-react';
import { Book, Course, Sale, StockAlert } from '../types';
import { AlertBadge } from './AlertBadge';
import { NavSection } from './Sidebar';
import { getLocalDateKey } from '../utils/stockUtils';

interface DashboardViewProps {
  books: Book[];
  courses: Course[];
  sales: Sale[];
  alerts: StockAlert[];
  booksMap: Record<string, Book>;
  coursesAvailableMap: Record<string, number>;
  onNavigate: (section: NavSection) => void;
  onOpenAddStockModal: (book: Book) => void;
  onQuickSell: (type: 'Book' | 'Course', id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  books,
  courses,
  sales,
  alerts,
  booksMap,
  coursesAvailableMap,
  onNavigate,
  onOpenAddStockModal,
  onQuickSell,
}) => {
  // Compute Dashboard Metrics
  const totalDifferentBooks = books.length;
  const totalBookUnits = books.reduce((acc, b) => acc + (b.stock || 0), 0);
  const totalCourses = courses.length;
  const totalSellableCourseUnits = Object.values(coursesAvailableMap).reduce(
    (acc: number, qty: number) => acc + qty,
    0
  );

  // Today's sold quantity (based on client local date)
  const todayDateKey = getLocalDateKey();
  const todaySales = sales.filter((s) => {
    if (!s.createdAt) return false;
    const d = new Date(s.createdAt);
    return !isNaN(d.getTime()) && getLocalDateKey(d) === todayDateKey;
  });
  const todaySoldQuantity = todaySales.reduce((acc, s) => acc + (s.quantity || 0), 0);
  const totalSalesRecords = sales.length;

  return (
    <div className="space-y-6">
      {/* Primary KPI Metrics Grid matching Vibrant Palette */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Books */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Books</p>
          <p className="text-2xl font-black text-indigo-600 mt-1">{totalDifferentBooks}</p>
          <p className="text-[10px] text-slate-400 mt-1">{totalBookUnits.toLocaleString()} total units in stock</p>
        </div>

        {/* Metric 2: Active Courses */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Active Courses</p>
          <p className="text-2xl font-black text-emerald-500 mt-1">{totalCourses}</p>
          <p className="text-[10px] text-slate-400 mt-1">{totalSellableCourseUnits} sellable complete sets</p>
        </div>

        {/* Metric 3: Sold Today */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Sold Today</p>
          <p className="text-2xl font-black text-orange-500 mt-1">{todaySoldQuantity}</p>
          <p className="text-[10px] text-slate-400 mt-1">{todaySales.length} sale records today</p>
        </div>

        {/* Metric 4: Stock Alerts */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">Stock Alerts</p>
          <p className="text-2xl font-black text-red-500 mt-1">{alerts.length}</p>
          <p className="text-[10px] text-slate-400 mt-1">Items requiring reorder</p>
        </div>
      </div>

      {/* Main Two-Column Grid: Quick Sell Terminal & Low Stock Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Quick Sell Terminal */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700">Quick Sell Book / Course</h3>
            <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              Stock Deduction
            </span>
          </div>

          <div className="p-5 sm:p-6 space-y-4 flex-1">
            <p className="text-xs text-slate-500">
              Instant physical book or course recording. Selecting an item will immediately deduct from inventory without payment handling.
            </p>

            <div className="space-y-2.5">
              {books.slice(0, 4).map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-colors"
                >
                  <div className="min-w-0 pr-3">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                      Book {b.code ? `&bull; ${b.code}` : ''}
                    </span>
                    <p className="text-xs sm:text-sm font-bold text-slate-800 truncate">{b.name}</p>
                    <span className="text-xs text-slate-500">
                      Stock: <strong className="font-mono text-slate-900">{b.stock}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => onOpenAddStockModal(b)}
                      className="p-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                      title="Add Stock"
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      onClick={() => onQuickSell('Book', b.id)}
                      disabled={b.stock === 0}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                        b.stock === 0
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs'
                      }`}
                    >
                      <CheckCircle size={14} />
                      <span>SOLD</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => onNavigate('sell')}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <span>Open Full Sell Terminal</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Column 3: Low Stock Alerts Sidebar Widget */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-red-100 bg-red-50 flex justify-between items-center">
            <h3 className="font-bold text-red-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600" />
              <span>Low Stock Alerts</span>
            </h3>
            {alerts.length > 0 && (
              <span className="text-[10px] bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold">
                {alerts.length} Action
              </span>
            )}
          </div>

          <div className="p-4 space-y-2.5 flex-1 overflow-y-auto max-h-[380px]">
            {alerts.length === 0 ? (
              <div className="py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle size={20} />
                </div>
                <p className="text-xs font-bold text-slate-700">All Stock Levels Healthy</p>
                <p className="text-[11px] text-slate-400 mt-0.5">No books below alert thresholds</p>
              </div>
            ) : (
              alerts.slice(0, 5).map((alert) => {
                const isCritical = alert.severity === 'out_of_stock' || alert.severity === 'very_low';
                const isWarning = alert.severity === 'critical' || alert.severity === 'low';

                return (
                  <div
                    key={alert.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      isCritical
                        ? 'bg-red-100 border-red-200'
                        : isWarning
                        ? 'bg-orange-100 border-orange-200'
                        : 'bg-yellow-100 border-yellow-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider ${
                          isCritical
                            ? 'text-red-700'
                            : isWarning
                            ? 'text-orange-700'
                            : 'text-yellow-700'
                        }`}
                      >
                        {alert.level} &bull; {alert.itemType}
                      </span>
                      <span
                        className={`text-base font-black ${
                          isCritical
                            ? 'text-red-600'
                            : isWarning
                            ? 'text-orange-600'
                            : 'text-yellow-700'
                        }`}
                      >
                        {alert.currentStock} left
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 mt-1 truncate">{alert.itemName}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 truncate">{alert.message}</span>
                      <button
                        onClick={() => onQuickSell(alert.itemType, alert.itemId)}
                        disabled={alert.currentStock === 0}
                        className="text-xs font-bold text-indigo-700 hover:underline flex-shrink-0 ml-2"
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-slate-50 text-center border-t border-slate-100">
            <button
              onClick={() => onNavigate('stock_alerts')}
              className="text-indigo-600 text-xs font-bold hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View All Alerts & Reorders</span>
              <ArrowRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Activity / Live Stream matching Vibrant Palette */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-bold text-slate-700 text-sm italic">Recent Inventory & Sales Activity</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Log</span>
        </div>

        {sales.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">
            No sales recorded yet. Use the "Mark as SOLD" button to record sold items.
          </div>
        ) : (
          <div className="space-y-2 font-mono text-xs">
            {sales.slice(0, 5).map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0 pr-2">
                  <span className="font-bold text-emerald-600 uppercase w-12 flex-shrink-0">SOLD</span>
                  <span className="text-slate-800 font-sans font-semibold truncate">
                    {sale.itemNameSnapshot}
                  </span>
                  <span className="text-slate-400 text-[11px] font-sans hidden sm:inline">
                    (Qty: {sale.quantity})
                  </span>
                </div>

                <div className="flex items-center space-x-4 flex-shrink-0 text-slate-400 text-xs">
                  <span className="hidden md:inline text-[11px] font-sans">by {sale.userName}</span>
                  <span className="text-slate-400 font-mono">
                    {new Date(sale.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
