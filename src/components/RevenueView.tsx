import React, { useState, useMemo } from 'react';
import {
  IndianRupee,
  TrendingUp,
  Calendar,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  Boxes,
  BookOpen,
  ArrowUpRight,
  Receipt,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  Clock,
  Sparkles,
  ChevronDown,
  PackageCheck,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Sale, AppUser } from '../types';
import { Modal } from './Modal';
import { formatDatabaseError } from '../services/db';
import {
  getLocalDateKey,
  getLocalMonthKey,
  parseNonNegativeFiniteNumber,
} from '../utils/stockUtils';

interface RevenueViewProps {
  sales: Sale[];
  currentUser: AppUser;
  onUpdateSalePrice: (
    saleId: string,
    data: { totalPrice: number; unitPrice?: number; notes?: string }
  ) => Promise<void>;
  onRemoveSale: (
    saleId: string,
    restoreStock: boolean
  ) => Promise<{ restoredItemsCount: number; restoredBooks: { bookName: string; restoredQty: number }[] }>;
}

type ChartViewMode = 'MONTHLY' | 'DAILY';
type SaleCategoryFilter = 'ALL' | 'BOOK' | 'COURSE';

export const RevenueView: React.FC<RevenueViewProps> = ({
  sales,
  currentUser,
  onUpdateSalePrice,
  onRemoveSale,
}) => {
  // View states
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('MONTHLY');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<SaleCategoryFilter>('ALL');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('ALL'); // 'ALL' or 'YYYY-MM'

  // Modals state
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [editTotalPrice, setEditTotalPrice] = useState<string>('');
  const [editUnitPrice, setEditUnitPrice] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  const [deletingSale, setDeletingSale] = useState<Sale | null>(null);
  const [restoreStockOnDelete, setRestoreStockOnDelete] = useState<boolean>(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Auto-dismiss success toast
  React.useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => setSuccessToast(null), 4000);
    return () => clearTimeout(timer);
  }, [successToast]);

  // Available months list from sales for filtering
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    sales.forEach((s) => {
      if (s.createdAt) {
        const d = new Date(s.createdAt);
        if (!isNaN(d.getTime())) {
          monthsSet.add(getLocalMonthKey(d));
        }
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [sales]);

  // Current Month String (YYYY-MM) in client local time
  const currentMonthKey = useMemo(() => {
    return getLocalMonthKey();
  }, []);

  // Today Date String (YYYY-MM-DD) in client local time
  const todayDateKey = useMemo(() => {
    return getLocalDateKey();
  }, []);

  // Summary Metrics calculations
  const metrics = useMemo(() => {
    let allTimeRevenue = 0;
    let currentMonthRevenue = 0;
    let todayRevenue = 0;
    let totalUnitsSoldAllTime = 0;
    let currentMonthUnitsSold = 0;
    let booksRevenue = 0;
    let coursesRevenue = 0;

    sales.forEach((sale) => {
      const price = Number(sale.totalPrice) || 0;
      const qty = Number(sale.quantity) || 0;
      allTimeRevenue += price;
      totalUnitsSoldAllTime += qty;

      if (sale.items && sale.items.length > 0) {
        sale.items.forEach((it) => {
          const itemRev = Number(it.totalPrice) || 0;
          if (it.itemType === 'Book') {
            booksRevenue += itemRev;
          } else {
            coursesRevenue += itemRev;
          }
        });
      } else if (sale.saleType === 'Book') {
        booksRevenue += price;
      } else {
        coursesRevenue += price;
      }

      if (sale.createdAt) {
        const d = new Date(sale.createdAt);
        if (!isNaN(d.getTime())) {
          if (getLocalMonthKey(d) === currentMonthKey) {
            currentMonthRevenue += price;
            currentMonthUnitsSold += qty;
          }
          if (getLocalDateKey(d) === todayDateKey) {
            todayRevenue += price;
          }
        }
      }
    });

    const averageOrderValue = sales.length > 0 ? allTimeRevenue / sales.length : 0;

    return {
      allTimeRevenue,
      currentMonthRevenue,
      todayRevenue,
      totalUnitsSoldAllTime,
      currentMonthUnitsSold,
      booksRevenue,
      coursesRevenue,
      averageOrderValue,
      totalSalesCount: sales.length,
    };
  }, [sales, currentMonthKey, todayDateKey]);

  // Monthly Chart Data (aggregated by month)
  const monthlyChartData = useMemo(() => {
    const monthMap: Record<
      string,
      {
        monthKey: string;
        monthLabel: string;
        bookRevenue: number;
        courseRevenue: number;
        totalRevenue: number;
        salesCount: number;
      }
    > = {};

    // Seed past 6 months so chart is always structured even with low sales
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = getLocalMonthKey(d);
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      monthMap[key] = {
        monthKey: key,
        monthLabel: label,
        bookRevenue: 0,
        courseRevenue: 0,
        totalRevenue: 0,
        salesCount: 0,
      };
    }

    // Populate with actual sales
    sales.forEach((sale) => {
      if (!sale.createdAt) return;
      const d = new Date(sale.createdAt);
      if (isNaN(d.getTime())) return;
      const key = getLocalMonthKey(d);
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

      if (!monthMap[key]) {
        monthMap[key] = {
          monthKey: key,
          monthLabel: label,
          bookRevenue: 0,
          courseRevenue: 0,
          totalRevenue: 0,
          salesCount: 0,
        };
      }

      const rev = Number(sale.totalPrice) || 0;
      if (sale.items && sale.items.length > 0) {
        sale.items.forEach((it) => {
          const itemRev = Number(it.totalPrice) || 0;
          if (it.itemType === 'Book') {
            monthMap[key].bookRevenue += itemRev;
          } else {
            monthMap[key].courseRevenue += itemRev;
          }
        });
      } else if (sale.saleType === 'Book') {
        monthMap[key].bookRevenue += rev;
      } else {
        monthMap[key].courseRevenue += rev;
      }
      monthMap[key].totalRevenue += rev;
      monthMap[key].salesCount += 1;
    });

    return Object.values(monthMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [sales]);

  // Daily Chart Data for current month
  const dailyChartData = useMemo(() => {
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0
    ).getDate();
    const dayMap: Record<
      number,
      {
        day: number;
        dayLabel: string;
        bookRevenue: number;
        courseRevenue: number;
        totalRevenue: number;
      }
    > = {};

    for (let day = 1; day <= daysInMonth; day++) {
      dayMap[day] = {
        day,
        dayLabel: `Day ${day}`,
        bookRevenue: 0,
        courseRevenue: 0,
        totalRevenue: 0,
      };
    }

    sales.forEach((sale) => {
      if (!sale.createdAt) return;
      const d = new Date(sale.createdAt);
      if (isNaN(d.getTime()) || getLocalMonthKey(d) !== currentMonthKey) return;
      const dayNum = d.getDate();
      if (dayMap[dayNum]) {
        const rev = Number(sale.totalPrice) || 0;
        if (sale.items && sale.items.length > 0) {
          sale.items.forEach((it) => {
            const itemRev = Number(it.totalPrice) || 0;
            if (it.itemType === 'Book') {
              dayMap[dayNum].bookRevenue += itemRev;
            } else {
              dayMap[dayNum].courseRevenue += itemRev;
            }
          });
        } else if (sale.saleType === 'Book') {
          dayMap[dayNum].bookRevenue += rev;
        } else {
          dayMap[dayNum].courseRevenue += rev;
        }
        dayMap[dayNum].totalRevenue += rev;
      }
    });

    return Object.values(dayMap);
  }, [sales, currentMonthKey]);

  // Filtered Sales for the Ledger Table
  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      // Search: checks sale number, snapshot name, cashier, notes, and nested line items
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

      // Category filter: handles single-item sales and multi-item sales containing the category
      if (categoryFilter === 'BOOK') {
        const hasBook =
          sale.saleType === 'Book' ||
          (sale.items && sale.items.some((it) => it.itemType === 'Book'));
        if (!hasBook) return false;
      }
      if (categoryFilter === 'COURSE') {
        const hasCourse =
          sale.saleType === 'Course' ||
          (sale.items && sale.items.some((it) => it.itemType === 'Course'));
        if (!hasCourse) return false;
      }

      // Month filter: strict check against local month key
      if (selectedMonthFilter !== 'ALL') {
        if (!sale.createdAt) return false;
        const d = new Date(sale.createdAt);
        if (isNaN(d.getTime()) || getLocalMonthKey(d) !== selectedMonthFilter) return false;
      }

      return true;
    });
  }, [sales, searchQuery, categoryFilter, selectedMonthFilter]);

  // Handlers for Editing Sale
  const handleOpenEdit = (sale: Sale) => {
    setEditingSale(sale);
    setEditTotalPrice(String(sale.totalPrice ?? 0));
    setEditUnitPrice(String(sale.unitPrice ?? (sale.quantity > 0 ? (sale.totalPrice || 0) / sale.quantity : 0)));
    setEditNotes(sale.notes || '');
    setErrorMessage(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;

    let tp: number;
    try {
      tp = parseNonNegativeFiniteNumber(editTotalPrice, 'Total price');
    } catch (err: any) {
      setErrorMessage(err.message || 'Total price must be a valid non-negative amount in Indian Rupees.');
      return;
    }

    let up: number | undefined = undefined;
    if (editUnitPrice.trim() !== '') {
      try {
        up = parseNonNegativeFiniteNumber(editUnitPrice, 'Unit price');
      } catch (err: any) {
        setErrorMessage(err.message || 'Unit price must be a valid non-negative amount in Indian Rupees.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await onUpdateSalePrice(editingSale.id, {
        totalPrice: tp,
        unitPrice: up,
        notes: editNotes,
      });

      setSuccessToast(`Sale #${editingSale.saleNumber} price updated to ₹${tp.toLocaleString('en-IN')}.`);
      setEditingSale(null);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handlers for Deleting Sale
  const handleConfirmDelete = async () => {
    if (!deletingSale) return;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await onRemoveSale(deletingSale.id, restoreStockOnDelete);
      const restoredText =
        restoreStockOnDelete && res.restoredBooks.length > 0
          ? ` and restored ${res.restoredBooks.map((b) => `${b.restoredQty} copies of "${b.bookName}"`).join(', ')} back to stock`
          : '';
      setSuccessToast(`Sale #${deletingSale.saleNumber} removed${restoredText}.`);
      setDeletingSale(null);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatMonthLabel = (key: string) => {
    const [year, month] = key.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
              <IndianRupee size={22} />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Monthly Revenue & Sales Ledger
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time revenue tracking in Indian Rupees (₹ INR), monthly chart analytics, and editable sales ledger.
          </p>
        </div>

        {/* Currency Badge */}
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-black text-emerald-800 tracking-wide font-mono">
            CURRENCY: INR (₹)
          </span>
        </div>
      </div>

      {/* Success Notification Toast */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            onClick={() => setSuccessToast(null)}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-900 ml-4 px-2 py-0.5 rounded bg-emerald-100/70"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Current Month Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-8 -mt-8 pointer-events-none" />
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Current Month Revenue ({new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })})
            </span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono mt-1.5 flex items-baseline gap-1">
              <span>₹</span>
              <span>{metrics.currentMonthRevenue.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{metrics.currentMonthUnitsSold} items sold this month</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp size={13} /> Active
            </span>
          </div>
        </div>

        {/* Card 2: Today's Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Today's Revenue
            </span>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono mt-1.5 flex items-baseline gap-1">
              <span>₹</span>
              <span>{metrics.todayRevenue.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Today's Counter</span>
            <span className="font-mono text-[11px] text-slate-400">
              {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>

        {/* Card 3: Total All-Time Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Total All-Time Revenue
            </span>
            <div className="text-2xl sm:text-3xl font-black text-indigo-700 font-mono mt-1.5 flex items-baseline gap-1">
              <span>₹</span>
              <span>{metrics.allTimeRevenue.toLocaleString('en-IN')}</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>{metrics.totalSalesCount} total transactions</span>
            <span className="text-indigo-600 font-semibold font-mono">
              ₹{Math.round(metrics.averageOrderValue).toLocaleString('en-IN')} avg
            </span>
          </div>
        </div>

        {/* Card 4: Revenue Composition */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              Revenue Breakdown
            </span>
            <div className="space-y-1.5 mt-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-1">
                  <BookOpen size={13} className="text-indigo-600" /> Books:
                </span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{metrics.booksRevenue.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 flex items-center gap-1">
                  <Boxes size={13} className="text-emerald-600" /> Courses:
                </span>
                <span className="font-mono font-bold text-slate-900">
                  ₹{metrics.coursesRevenue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-400">
            {metrics.totalUnitsSoldAllTime} total copies delivered
          </div>
        </div>
      </div>

      {/* Monthly Revenue Chart Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-slate-100 gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600" />
              Monthly Revenue Performance (Indian Rupees ₹)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualizes earnings trends and volume across books and course packages.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-bold">
            <button
              onClick={() => setChartViewMode('MONTHLY')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartViewMode === 'MONTHLY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly View
            </button>
            <button
              onClick={() => setChartViewMode('DAILY')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                chartViewMode === 'DAILY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily View (This Month)
            </button>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="mt-6 h-72 sm:h-80 w-full">
          {chartViewMode === 'MONTHLY' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={monthlyChartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="monthLabel"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip
                  formatter={(value: any, name: any) => [
                    `₹${Number(value || 0).toLocaleString('en-IN')}`,
                    name === 'bookRevenue'
                      ? 'Books Revenue'
                      : name === 'courseRevenue'
                      ? 'Courses Revenue'
                      : 'Total Revenue',
                  ]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => (
                    <span className="text-xs font-semibold text-slate-700">
                      {value === 'bookRevenue' ? 'Books (₹)' : 'Courses (₹)'}
                    </span>
                  )}
                />
                <Bar
                  dataKey="bookRevenue"
                  name="bookRevenue"
                  fill="#4f46e5"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                />
                <Bar
                  dataKey="courseRevenue"
                  name="courseRevenue"
                  fill="#059669"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={45}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dailyChartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <defs>
                  <linearGradient id="dailyRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="day"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickFormatter={(d) => `${d}`}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickFormatter={(val) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                />
                <Tooltip
                  formatter={(value: any) => [
                    `₹${Number(value || 0).toLocaleString('en-IN')}`,
                    'Daily Revenue',
                  ]}
                  labelFormatter={(label) => `Day ${label} (${new Date().toLocaleDateString('en-IN', { month: 'short' })})`}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="totalRevenue"
                  stroke="#059669"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#dailyRevGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Sales Ledger & Transaction Management Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Ledger Header & Search/Filter Controls */}
        <div className="p-5 sm:p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <Receipt size={18} className="text-indigo-600" />
                Recorded Sales Ledger ({filteredSales.length} records)
              </h3>
              <p className="text-xs text-slate-500">
                View detailed sale numbers, prices in INR, edit prices, or remove sales if required.
              </p>
            </div>

            {/* Total of filtered records */}
            <div className="self-start sm:self-auto bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-2xs text-xs">
              <span className="text-slate-500">Filtered Revenue: </span>
              <strong className="font-mono text-slate-900 font-bold">
                ₹{filteredSales.reduce((sum, s) => sum + (Number(s.totalPrice) || 0), 0).toLocaleString('en-IN')}
              </strong>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sale #, title, notes..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Month Filter Dropdown */}
            <div>
              <select
                value={selectedMonthFilter}
                onChange={(e) => setSelectedMonthFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
              >
                <option value="ALL">All Months ({sales.length} sales)</option>
                {availableMonths.map((mKey) => (
                  <option key={mKey} value={mKey}>
                    {formatMonthLabel(mKey)}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center bg-white border border-slate-300 rounded-xl p-0.5 text-xs font-bold">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer text-center ${
                  categoryFilter === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('BOOK')}
                className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer text-center ${
                  categoryFilter === 'BOOK'
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Books
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('COURSE')}
                className={`flex-1 py-1.5 rounded-lg transition-colors cursor-pointer text-center ${
                  categoryFilter === 'COURSE'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Courses
              </button>
            </div>
          </div>
        </div>

        {/* Table of Sales */}
        <div className="overflow-x-auto">
          {filteredSales.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Receipt size={36} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700">No sales match your current search or filters.</p>
              <p className="text-xs text-slate-400 mt-1">
                Try resetting your filters or recording a sale from the "Mark as Sold" section.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6">Sale # & Date</th>
                  <th className="py-3 px-4">Item Details</th>
                  <th className="py-3 px-4 text-center">Qty Sold</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Total (INR ₹)</th>
                  <th className="py-3 px-4">Recorded By / Notes</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredSales.map((sale) => {
                  const unitPrice =
                    sale.unitPrice ??
                    (sale.quantity > 0 ? (sale.totalPrice || 0) / sale.quantity : 0);
                  const totalPrice = sale.totalPrice ?? 0;
                  const dateObj = new Date(sale.createdAt);

                  return (
                    <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors group">
                      {/* Sale # & Date */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-mono font-black text-indigo-700">
                          #{sale.saleNumber}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock size={11} className="text-slate-400" />
                          <span>
                            {!isNaN(dateObj.getTime())
                              ? dateObj.toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                }) +
                                ' • ' +
                                dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Item Details */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {sale.itemNameSnapshot}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              sale.saleType === 'Multiple'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : sale.saleType === 'Book'
                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            }`}
                          >
                            {sale.saleType === 'Multiple' ? (
                              <PackageCheck size={10} />
                            ) : sale.saleType === 'Book' ? (
                              <BookOpen size={10} />
                            ) : (
                              <Boxes size={10} />
                            )}
                            {sale.saleType}
                          </span>
                          {sale.items && sale.items.length > 0 ? (
                            <span className="text-[11px] text-slate-500 font-medium">
                              ({sale.items.length} items bundle)
                            </span>
                          ) : sale.deductedBooks && sale.deductedBooks.length > 0 ? (
                            <span className="text-[11px] text-slate-400">
                              ({sale.deductedBooks.length} books bundle)
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Qty Sold */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-mono font-extrabold text-sm px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800">
                          {sale.quantity}
                        </span>
                      </td>

                      {/* Unit Price */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600 text-xs">
                        ₹{unitPrice.toLocaleString('en-IN')}
                      </td>

                      {/* Total Price */}
                      <td className="py-3.5 px-4 text-right">
                        <span className="font-mono font-black text-emerald-700 text-base">
                          ₹{totalPrice.toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Recorded By / Notes */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs text-slate-700 font-medium truncate max-w-[180px]">
                          {sale.userName}
                        </div>
                        {sale.notes ? (
                          <div className="text-[11px] text-slate-500 italic truncate max-w-[200px] mt-0.5" title={sale.notes}>
                            "{sale.notes}"
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Edit Price Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(sale)}
                            title="Edit sale price or notes"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Edit2 size={15} />
                          </button>

                          {/* Remove Sale Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingSale(sale);
                              setRestoreStockOnDelete(true);
                              setErrorMessage(null);
                            }}
                            title="Remove / delete this sale"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* =========================================================================
          MODAL: EDIT SALE PRICE
          ========================================================================= */}
      <Modal
        isOpen={!!editingSale}
        onClose={() => {
          setEditingSale(null);
          setErrorMessage(null);
        }}
        title={`Edit Sale #${editingSale?.saleNumber} Price`}
        subtitle={`Update total calculated price in Indian Rupees (₹) for "${editingSale?.itemNameSnapshot}"`}
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          {errorMessage && (
            <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {editingSale && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Item:</span>
                <strong className="text-slate-800">{editingSale.itemNameSnapshot}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quantity Sold:</span>
                <strong className="font-mono text-slate-800">{editingSale.quantity} units</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recorded By:</span>
                <span className="text-slate-700">{editingSale.userName} ({editingSale.userRole})</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Total Sale Price in INR (₹) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                required
                value={editTotalPrice}
                onChange={(e) => setEditTotalPrice(e.target.value)}
                placeholder="e.g. 540"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Modifying this will immediately recalculate the store's monthly revenue.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Unit Price (₹) (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-sm">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={editUnitPrice}
                onChange={(e) => setEditUnitPrice(e.target.value)}
                placeholder="e.g. 180"
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Sale Remarks / Notes
            </label>
            <textarea
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="e.g. Discount applied for school bulk purchase"
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setEditingSale(null);
                setErrorMessage(null);
              }}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Updated Price'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL: REMOVE / DELETE SALE
          ========================================================================= */}
      <Modal
        isOpen={!!deletingSale}
        onClose={() => {
          setDeletingSale(null);
          setErrorMessage(null);
        }}
        title={`Remove Sale #${deletingSale?.saleNumber}`}
        subtitle="Remove this transaction from the revenue ledger and sales records."
      >
        <div className="space-y-4">
          {errorMessage && (
            <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {deletingSale && (
            <div className="p-3 bg-red-50/50 rounded-xl border border-red-100 text-xs space-y-1.5">
              <p className="font-bold text-red-900">
                Are you sure you want to remove Sale #{deletingSale.saleNumber}?
              </p>
              <p className="text-slate-600">
                Item: <strong>{deletingSale.itemNameSnapshot}</strong> ({deletingSale.quantity} copies)
              </p>
              <p className="text-slate-600">
                Amount: <strong className="font-mono text-slate-900">₹{(deletingSale.totalPrice || 0).toLocaleString('en-IN')}</strong>
              </p>
            </div>
          )}

          {/* Option to restore stock */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={restoreStockOnDelete}
                onChange={(e) => setRestoreStockOnDelete(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-800 block">
                  Restore physical stock to inventory
                </span>
                <span className="text-slate-500 text-[11px]">
                  Automatically returns {deletingSale?.quantity} unit(s) back to the bookstore shelves and creates an audit refund record.
                </span>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => {
                setDeletingSale(null);
                setErrorMessage(null);
              }}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleConfirmDelete}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? 'Removing Sale...' : 'Remove Sale Record'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
