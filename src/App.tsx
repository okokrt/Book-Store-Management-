import React, { useState, useEffect, useMemo } from 'react';
import {
  Book,
  Course,
  Sale,
  InventoryTransaction,
  AppUser,
  CourseItem,
  DeductedBook,
  StoreSettings,
} from './types';
import {
  subscribeToBooks,
  subscribeToCourses,
  subscribeToSales,
  subscribeToTransactions,
  subscribeToSettings,
  addBook,
  updateBook,
  deleteBook,
  addCourse,
  updateCourse,
  deleteCourse,
  addStock,
  adjustStock,
  recordBookSale,
  recordCourseSale,
  recordMultiItemSale,
  MultiSaleCartItem,
  updateSale,
  deleteSale,
  updateStoreSettings,
  clearAllCatalog,
  formatDatabaseError,
} from './services/db';
import {
  calculateCourseStock,
  computeStockAlerts,
  parseNonNegativeFiniteNumber,
  parsePositiveInteger,
  parseNonNegativeInteger,
  recalculateSalePricing,
} from './utils/stockUtils';
import { Sidebar, NavSection } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { BooksView } from './components/BooksView';
import { CoursesView } from './components/CoursesView';
import { SellView } from './components/SellView';
import { RevenueView } from './components/RevenueView';
import { SalesHistoryView } from './components/SalesHistoryView';
import { StockAlertsView } from './components/StockAlertsView';
import { InventoryHistoryView } from './components/InventoryHistoryView';
import { SettingsView } from './components/SettingsView';
import {
  Menu,
  X,
  AlertTriangle,
  CheckCircle,
  BookMarked,
  RefreshCw,
} from 'lucide-react';

const OWNER_USER: AppUser = {
  id: 'owner',
  name: 'Store Owner',
  role: 'OWNER',
};

export default function App() {
  // Navigation State
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const currentUser: AppUser = OWNER_USER;

  // Firestore Data State
  const [books, setBooks] = useState<Book[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    storeName: 'Kashi Walla Book Management',
    storePhone: '',
    storeAddress: '',
    storeEmail: '',
    updatedAt: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState(true);

  // Cross-view action state (e.g. quick sell from dashboard/alerts, or add stock shortcut)
  const [quickSellTarget, setQuickSellTarget] = useState<{
    type: 'Book' | 'Course';
    id: string;
  } | null>(null);

  const [bookForAddStockModal, setBookForAddStockModal] = useState<Book | null>(null);

  // Network Connectivity State
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? (navigator.onLine ?? true) : true);

  // Flash Toast Notification
  const [toastNotification, setToastNotification] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const showToast = (messageOrError: any, type: 'success' | 'info' | 'error' = 'success') => {
    const message =
      typeof messageOrError === 'string'
        ? messageOrError
        : formatDatabaseError(messageOrError);
    setToastNotification({ message, type });
    setTimeout(() => {
      setToastNotification((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  };

  // Track browser connectivity events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Connection restored: Synchronized with Cloud Firestore.', 'info');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Operating in offline mode. Changes will synchronize once connection is restored.', 'info');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Real-time Subscriptions (Active on component mount)
  useEffect(() => {
    const unsubscribeBooks = subscribeToBooks((fetchedBooks) => {
      setBooks(fetchedBooks);
      setIsLoading(false);
    });

    const unsubscribeCourses = subscribeToCourses((fetchedCourses) => {
      setCourses(fetchedCourses);
    });

    const unsubscribeSales = subscribeToSales((fetchedSales) => {
      setSales(fetchedSales);
    });

    const unsubscribeTransactions = subscribeToTransactions((fetchedTx) => {
      setTransactions(fetchedTx);
    });

    const unsubscribeSettings = subscribeToSettings((fetchedSettings) => {
      setStoreSettings(fetchedSettings);
    });

    return () => {
      unsubscribeBooks();
      unsubscribeCourses();
      unsubscribeSales();
      unsubscribeTransactions();
      unsubscribeSettings();
    };
  }, []);

  // Lookup map: Book ID -> Book
  const booksMap = useMemo(() => {
    const map: Record<string, Book> = {};
    for (const b of books) {
      map[b.id] = b;
    }
    return map;
  }, [books]);

  // Course Available Stock Map (MIN(floor(stock/req)))
  const coursesAvailableMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of courses) {
      const calc = calculateCourseStock(c, booksMap);
      map[c.id] = calc.availableQuantity;
    }
    return map;
  }, [courses, booksMap]);

  // Compute multi-tier Stock Alerts
  const stockAlerts = useMemo(() => {
    return computeStockAlerts(books, courses, booksMap);
  }, [books, courses, booksMap]);

  // Count active stock alerts (under 16)
  const alertCount = stockAlerts.length;

  // Handlers
  const handleNavigate = (section: NavSection) => {
    setActiveSection(section);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Quick Sell Trigger
  const handleQuickSell = (type: 'Book' | 'Course', id: string) => {
    setQuickSellTarget({ type, id });
    setActiveSection('sell');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Add Stock Trigger
  const handleOpenAddStockModal = (book: Book) => {
    setBookForAddStockModal(book);
    setActiveSection('books');
  };

  // Book Operations (Instantaneous UI updates with optimistic state)
  const handleAddBook = async (data: {
    name: string;
    code?: string;
    author?: string;
    publisher?: string;
    stock: number;
    price?: number;
  }) => {
    try {
      const validStock = parseNonNegativeInteger(data.stock, 'Book stock');
      const validPrice =
        data.price !== undefined ? parseNonNegativeFiniteNumber(data.price, 'Book price') : 0;
      const sanitizedData = {
        ...data,
        stock: validStock,
        price: validPrice,
      };

      const bookId = await addBook(sanitizedData, currentUser);
      // Optimistically add to list if not already present
      setBooks((prev) => {
        if (prev.some((b) => b.id === bookId)) return prev;
        const now = new Date().toISOString();
        return [
          ...prev,
          {
            id: bookId,
            name: sanitizedData.name.trim(),
            code: sanitizedData.code?.trim() || '',
            author: sanitizedData.author?.trim() || '',
            publisher: sanitizedData.publisher?.trim() || '',
            stock: sanitizedData.stock,
            price: sanitizedData.price,
            createdAt: now,
            updatedAt: now,
          },
        ];
      });
      showToast(`Book "${sanitizedData.name}" added to inventory with ${sanitizedData.stock} units.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to add book.', 'error');
      throw err;
    }
  };

  const handleUpdateBook = async (
    id: string,
    data: {
      name: string;
      code?: string;
      author?: string;
      publisher?: string;
      stock?: number;
      price?: number;
      notes?: string;
    }
  ) => {
    const validStock =
      data.stock !== undefined && data.stock !== null ? parseNonNegativeInteger(data.stock, 'Book stock') : undefined;
    const validPrice =
      data.price !== undefined && data.price !== null ? parseNonNegativeFiniteNumber(data.price, 'Book price') : undefined;
    const sanitizedData = {
      ...data,
      name: data.name.trim(),
      code: data.code !== undefined ? data.code.trim() : undefined,
      author: data.author !== undefined ? data.author.trim() : undefined,
      publisher: data.publisher !== undefined ? data.publisher.trim() : undefined,
      notes: data.notes !== undefined ? data.notes.trim() : undefined,
      stock: validStock,
      price: validPrice,
    };

    const previousBooks = books;
    const previousCourses = courses;

    // Apply optimistic update immediately to books
    setBooks((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              name: sanitizedData.name,
              code: sanitizedData.code !== undefined ? sanitizedData.code : b.code,
              author: sanitizedData.author !== undefined ? sanitizedData.author : b.author,
              publisher: sanitizedData.publisher !== undefined ? sanitizedData.publisher : b.publisher,
              stock: sanitizedData.stock !== undefined ? sanitizedData.stock : b.stock,
              price: sanitizedData.price !== undefined ? sanitizedData.price : b.price,
              updatedAt: new Date().toISOString(),
            }
          : b
      )
    );

    // If book name changed, also optimistically update courses containing this book
    setCourses((prev) =>
      prev.map((c) => {
        let changed = false;
        const newItems = (c.items || []).map((it) => {
          if (it.bookId === id && it.bookName !== sanitizedData.name) {
            changed = true;
            return { ...it, bookName: sanitizedData.name };
          }
          return it;
        });
        return changed ? { ...c, items: newItems, updatedAt: new Date().toISOString() } : c;
      })
    );

    try {
      await updateBook(id, sanitizedData, currentUser);
      showToast(
        sanitizedData.stock !== undefined
          ? `Book "${sanitizedData.name}" updated (Stock: ${sanitizedData.stock}).`
          : `Book "${sanitizedData.name}" details updated.`
      );
    } catch (err: any) {
      setBooks(previousBooks); // Rollback on error
      setCourses(previousCourses);
      showToast(err.message || 'Failed to update book.', 'error');
      throw err;
    }
  };

  const handleDeleteBook = async (id: string) => {
    const bookName = booksMap[id]?.name || 'Book';
    const previousBooks = books;
    // Optimistically remove from catalog
    setBooks((prev) => prev.filter((b) => b.id !== id));

    try {
      await deleteBook(id, courses);
      showToast(`Book "${bookName}" removed from catalog.`);
    } catch (err: any) {
      setBooks(previousBooks); // Rollback on error
      showToast(err.message || 'Failed to delete book.', 'error');
      throw err;
    }
  };

  const handleAddStock = async (bookId: string, quantity: number, notes?: string) => {
    const validQuantity = parsePositiveInteger(quantity, 'Added quantity');
    const book = booksMap[bookId];
    const previousBooks = books;
    // Optimistic stock increment
    setBooks((prev) =>
      prev.map((b) => (b.id === bookId ? { ...b, stock: b.stock + validQuantity } : b))
    );

    try {
      await addStock(bookId, validQuantity, currentUser, notes);
      showToast(`Added ${validQuantity} units to "${book?.name || 'Book'}".`);
    } catch (err: any) {
      setBooks(previousBooks);
      showToast(err.message || 'Failed to add stock.', 'error');
      throw err;
    }
  };

  const handleAdjustStock = async (bookId: string, delta: number, notes: string) => {
    const validDelta = Number(delta);
    if (!Number.isFinite(validDelta) || !Number.isInteger(validDelta) || validDelta === 0) {
      throw new Error('Adjustment delta must be a non-zero whole number (+ or -).');
    }

    const book = booksMap[bookId];
    const previousBooks = books;
    // Optimistic stock adjustment
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId ? { ...b, stock: Math.max(0, b.stock + validDelta) } : b
      )
    );

    try {
      await adjustStock(bookId, validDelta, currentUser, notes);
      showToast(
        `Adjusted stock for "${book?.name || 'Book'}" by ${validDelta > 0 ? `+${validDelta}` : validDelta} units.`
      );
    } catch (err: any) {
      setBooks(previousBooks);
      showToast(err.message || 'Failed to adjust stock.', 'error');
      throw err;
    }
  };

  // Course Operations (Courses are bundle definitions - physical books are the sole inventory source of truth)
  const handleAddCourse = async (data: {
    name: string;
    code?: string;
    price?: number | null;
    items: CourseItem[];
  }) => {
    const validPrice =
      data.price !== undefined && data.price !== null
        ? parseNonNegativeFiniteNumber(data.price, 'Course price')
        : undefined;
    const validatedItems = (data.items || []).map((item) => ({
      bookId: String(item.bookId || '').trim(),
      bookName: (item.bookName || booksMap[item.bookId]?.name || 'Book').trim(),
      quantityRequired: parsePositiveInteger(item.quantityRequired || 1, 'Component quantity required'),
    }));

    const sanitizedData = {
      name: data.name.trim(),
      code: data.code?.trim() || undefined,
      price: validPrice,
      items: validatedItems,
    };

    try {
      const courseId = await addCourse(sanitizedData, currentUser);
      setCourses((prev) => {
        if (prev.some((c) => c.id === courseId)) return prev;
        const now = new Date().toISOString();
        return [
          ...prev,
          {
            id: courseId,
            name: sanitizedData.name,
            code: sanitizedData.code || '',
            price: sanitizedData.price,
            items: sanitizedData.items,
            createdAt: now,
            updatedAt: now,
          },
        ];
      });
      showToast(`Course "${sanitizedData.name}" bundle created with ${sanitizedData.items.length} books.`);
    } catch (err: any) {
      showToast(err.message || 'Failed to create course.', 'error');
      throw err;
    }
  };

  const handleUpdateCourse = async (
    id: string,
    data: {
      name: string;
      code?: string;
      price?: number | null;
      items: CourseItem[];
    }
  ) => {
    const validPrice =
      data.price === null
        ? null
        : data.price !== undefined
        ? parseNonNegativeFiniteNumber(data.price, 'Course price')
        : undefined;

    const validatedItems = (data.items || []).map((item) => ({
      bookId: String(item.bookId || '').trim(),
      bookName: (item.bookName || booksMap[item.bookId]?.name || 'Book').trim(),
      quantityRequired: parsePositiveInteger(item.quantityRequired || 1, 'Component quantity required'),
    }));

    const sanitizedData = {
      name: data.name.trim(),
      code: data.code !== undefined ? data.code.trim() : undefined,
      price: validPrice,
      items: validatedItems,
    };

    const previousCourses = courses;

    // Optimistically update course bundle immediately
    setCourses((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              name: sanitizedData.name,
              code: sanitizedData.code !== undefined ? sanitizedData.code : c.code,
              price: validPrice === null ? undefined : (validPrice !== undefined ? validPrice : c.price),
              items: sanitizedData.items,
              updatedAt: new Date().toISOString(),
            }
          : c
      )
    );

    try {
      await updateCourse(id, sanitizedData, currentUser);
      showToast(`Course bundle "${sanitizedData.name}" updated.`);
    } catch (err: any) {
      setCourses(previousCourses);
      showToast(err.message || 'Failed to update course.', 'error');
      throw err;
    }
  };

  const handleDeleteCourse = async (id: string) => {
    const previousCourses = courses;
    setCourses((prev) => prev.filter((c) => c.id !== id));

    try {
      await deleteCourse(id);
      showToast('Course bundle deleted.');
    } catch (err: any) {
      setCourses(previousCourses);
      showToast(err.message || 'Failed to delete course.', 'error');
      throw err;
    }
  };

  // Sale Operations (Instantaneous stock deduction with optimistic state)
  const handleRecordBookSale = async (
    bookId: string,
    quantity: number,
    customTotalPrice?: number,
    unitPrice?: number,
    notes?: string
  ) => {
    const validQuantity = parsePositiveInteger(quantity, 'Sale quantity');
    const validCustomTotal =
      customTotalPrice !== undefined
        ? parseNonNegativeFiniteNumber(customTotalPrice, 'Total price')
        : undefined;
    const validUnitPrice =
      unitPrice !== undefined
        ? parseNonNegativeFiniteNumber(unitPrice, 'Unit price')
        : undefined;

    const previousBooks = books;
    // Immediately deduct book stock in state for 0ms visual latency
    setBooks((prev) =>
      prev.map((b) =>
        b.id === bookId ? { ...b, stock: Math.max(0, b.stock - validQuantity) } : b
      )
    );

    try {
      const res = await recordBookSale(
        bookId,
        validQuantity,
        currentUser,
        validCustomTotal,
        validUnitPrice,
        notes
      );
      setSales((prev) => [res, ...prev.filter((s) => s.id !== res.id)]);
      showToast(
        `Sale #${res.saleNumber}: ${validQuantity} book copies marked as SOLD (₹${res.totalPrice.toLocaleString('en-IN')}).`
      );
      return res;
    } catch (err: any) {
      setBooks(previousBooks); // Rollback on error
      showToast(err.message || 'Failed to record sale.', 'error');
      throw err;
    }
  };

  const handleRecordCourseSale = async (
    courseId: string,
    quantity: number,
    customTotalPrice?: number,
    unitPrice?: number,
    notes?: string
  ) => {
    const validQuantity = parsePositiveInteger(quantity, 'Sale quantity');
    const validCustomTotal =
      customTotalPrice !== undefined
        ? parseNonNegativeFiniteNumber(customTotalPrice, 'Total price')
        : undefined;
    const validUnitPrice =
      unitPrice !== undefined
        ? parseNonNegativeFiniteNumber(unitPrice, 'Unit price')
        : undefined;

    const previousBooks = books;
    const previousCourses = courses;

    // Immediately deduct component books' stocks and course stock in state
    const course = courses.find((c) => c.id === courseId);
    if (course) {
      const stockDeductionMap: Record<string, number> = {};
      course.items.forEach((item) => {
        stockDeductionMap[item.bookId] =
          (stockDeductionMap[item.bookId] || 0) + item.quantityRequired * validQuantity;
      });
      setBooks((prev) =>
        prev.map((b) =>
          stockDeductionMap[b.id]
            ? { ...b, stock: Math.max(0, b.stock - stockDeductionMap[b.id]) }
            : b
        )
      );
    }

    try {
      const res = await recordCourseSale(
        courseId,
        validQuantity,
        currentUser,
        validCustomTotal,
        validUnitPrice,
        notes
      );
      setSales((prev) => [res, ...prev.filter((s) => s.id !== res.id)]);
      showToast(
        `Sale #${res.saleNumber}: ${validQuantity} course bundles marked as SOLD (₹${res.totalPrice.toLocaleString('en-IN')}).`
      );
      return res;
    } catch (err: any) {
      setBooks(previousBooks);
      showToast(err.message || 'Failed to record course sale.', 'error');
      throw err;
    }
  };

  const handleRecordMultiItemSale = async (
    cartItems: MultiSaleCartItem[],
    customTotalPrice?: number,
    notes?: string
  ) => {
    const validCustomTotal =
      customTotalPrice !== undefined
        ? parseNonNegativeFiniteNumber(customTotalPrice, 'Custom total price')
        : undefined;

    const previousBooks = books;

    // Immediately compute optimistic deduction map for physical books for zero visual lag
    const bookDeductionMap: Record<string, number> = {};

    cartItems.forEach((item) => {
      const itemQty = parsePositiveInteger(item.quantity, 'Cart item quantity');
      if (item.type === 'Book') {
        bookDeductionMap[item.id] = (bookDeductionMap[item.id] || 0) + itemQty;
      } else {
        const c = courses.find((crs) => crs.id === item.id);
        if (c && c.items) {
          c.items.forEach((comp) => {
            bookDeductionMap[comp.bookId] =
              (bookDeductionMap[comp.bookId] || 0) + comp.quantityRequired * itemQty;
          });
        }
      }
    });

    setBooks((prev) =>
      prev.map((b) =>
        bookDeductionMap[b.id]
          ? { ...b, stock: Math.max(0, b.stock - bookDeductionMap[b.id]) }
          : b
      )
    );

    try {
      const res = await recordMultiItemSale(
        cartItems,
        currentUser,
        validCustomTotal,
        notes
      );
      setSales((prev) => [res, ...prev.filter((s) => s.id !== res.id)]);
      const unitsCount =
        res.totalUnits ?? res.quantity ?? cartItems.reduce((s, it) => s + it.quantity, 0);
      const linesCount = (res.lineItems || res.items || cartItems).length;
      showToast(
        `Sale #${res.saleNumber}: ${unitsCount} item${unitsCount !== 1 ? 's' : ''} (${linesCount} distinct) marked as SOLD (₹${(res.totalPrice ?? 0).toLocaleString('en-IN')}).`
      );
      return res;
    } catch (err: any) {
      setBooks(previousBooks);
      showToast(err.message || 'Failed to record sale.', 'error');
      throw err;
    }
  };

  // Sale Price Modification & Removal Handlers (Revenue & Ledger)
  const handleUpdateSalePrice = async (
    saleId: string,
    data: { totalPrice: number; unitPrice?: number; notes?: string }
  ) => {
    const validTotalPrice = parseNonNegativeFiniteNumber(data.totalPrice, 'Total price');
    const validUnitPrice =
      data.unitPrice !== undefined
        ? parseNonNegativeFiniteNumber(data.unitPrice, 'Unit price')
        : undefined;

    const previousSales = sales;
    const targetSale = sales.find((s) => s.id === saleId);
    if (targetSale) {
      const recalculated = recalculateSalePricing(targetSale, {
        totalPrice: validTotalPrice,
        unitPrice: validUnitPrice,
        notes: data.notes,
      });
      setSales((prev) =>
        prev.map((s) =>
          s.id === saleId ? { ...s, ...recalculated, updatedAt: new Date().toISOString() } : s
        )
      );
    }

    try {
      await updateSale(saleId, { ...data, totalPrice: validTotalPrice, unitPrice: validUnitPrice }, currentUser);
      showToast(`Sale price updated successfully.`);
    } catch (err: any) {
      setSales(previousSales);
      showToast(err.message || 'Failed to update sale price.', 'error');
      throw err;
    }
  };

  const handleRemoveSale = async (saleId: string, restoreStock: boolean) => {
    const previousSales = sales;
    const saleToRemove = sales.find((s) => s.id === saleId);
    setSales((prev) => prev.filter((s) => s.id !== saleId));

    try {
      const res = await deleteSale(saleId, restoreStock, currentUser);
      // If restoreStock, update books in local state
      if (restoreStock && res.restoredBooks.length > 0) {
        const restoreMap: Record<string, number> = {};
        res.restoredBooks.forEach((rb) => {
          restoreMap[rb.bookId] = (restoreMap[rb.bookId] || 0) + rb.restoredQty;
        });
        setBooks((prev) =>
          prev.map((b) =>
            restoreMap[b.id] ? { ...b, stock: b.stock + restoreMap[b.id] } : b
          )
        );
      }
      showToast(`Sale #${saleToRemove?.saleNumber || ''} removed.`);
      return res;
    } catch (err: any) {
      setSales(previousSales);
      showToast(err.message || 'Failed to remove sale.', 'error');
      throw err;
    }
  };

  // Store Settings & Catalog Maintenance Handlers
  const handleUpdateStoreSettings = async (updates: Partial<StoreSettings>) => {
    try {
      await updateStoreSettings(updates);
      showToast('Store settings updated successfully.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update store settings.', 'error');
      throw err;
    }
  };

  const handleClearAllCatalog = async () => {
    try {
      const res = await clearAllCatalog();
      showToast(`Catalog reset: removed ${res.deletedBooksCount} books and ${res.deletedCoursesCount} courses.`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to clear catalog.', 'error');
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased text-slate-800">
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div className="fixed top-4 right-4 z-50 max-w-md animate-in slide-in-from-top-3 fade-in duration-200">
          <div
            className={`p-4 rounded-xl shadow-lg border flex items-start gap-3 text-xs sm:text-sm font-semibold ${
              toastNotification.type === 'error'
                ? 'bg-red-50 text-red-900 border-red-200'
                : toastNotification.type === 'info'
                ? 'bg-blue-50 text-blue-900 border-blue-200'
                : 'bg-emerald-50 text-emerald-900 border-emerald-200'
            }`}
          >
            {toastNotification.type === 'error' ? (
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            ) : (
              <CheckCircle size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">{toastNotification.message}</div>
            <button
              onClick={() => setToastNotification(null)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Mobile Top App Bar */}
      <header className="lg:hidden bg-indigo-700 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-indigo-600 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {isMobileSidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div>
            <h1 className="text-base font-bold tracking-tight flex items-center gap-1.5 text-white">
              <BookMarked size={18} className="text-indigo-200" />
              <span>Kashi Walla</span>
            </h1>
            <p className="text-[10px] text-indigo-200">Book Management</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isOnline && (
            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/40">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse"></span>
              Offline
            </span>
          )}
          <button
            onClick={() => handleNavigate('sell')}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white flex items-center gap-1 shadow-xs cursor-pointer"
          >
            <CheckCircle size={13} />
            <span>SOLD</span>
          </button>

          {/* User Role Badge */}
          <span className="text-[11px] font-extrabold px-2 py-1 rounded bg-purple-900 text-purple-200 border border-purple-700">
            OWNER
          </span>
        </div>
      </header>

      {/* Main Layout Body */}
      <div className="flex-1 flex overflow-hidden bg-slate-50 font-sans text-slate-800">
        {/* Responsive Sidebar */}
        <Sidebar
          currentSection={activeSection}
          onNavigate={handleNavigate}
          alertCount={alertCount}
          currentUser={currentUser}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Content View Container with Desktop Header */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Desktop Top Header matching Vibrant Palette */}
          <header className="hidden lg:flex bg-white h-16 border-b border-slate-200 items-center justify-between px-8 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-700">
                {activeSection === 'dashboard' && 'Store Overview'}
                {activeSection === 'books' && 'Book Inventory Catalog'}
                {activeSection === 'courses' && 'Course Bundles & Availability'}
                {activeSection === 'sell' && 'Quick Sell / Mark as Sold'}
                {activeSection === 'revenue' && 'Monthly Revenue & Sales Ledger'}
                {activeSection === 'sales_history' && 'Recorded Sales History'}
                {activeSection === 'stock_alerts' && 'Stock Alerts & Low Inventory'}
                {activeSection === 'inventory_history' && 'Inventory Transaction Log'}
                {activeSection === 'settings' && 'System Settings & Controls'}
              </h2>
              {activeSection === 'dashboard' && (
                <span className="text-[11px] font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full border border-indigo-100">
                  Live Stock Engine
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!isOnline && (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  Offline Mode
                </span>
              )}
              {alertCount > 0 && activeSection !== 'stock_alerts' && (
                <button
                  onClick={() => handleNavigate('stock_alerts')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <AlertTriangle size={14} className="text-red-600" />
                  <span>{alertCount} Alerts</span>
                </button>
              )}

              {activeSection !== 'sell' && (
                <button
                  onClick={() => handleNavigate('sell')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2 rounded-lg font-bold shadow-sm transition-colors cursor-pointer flex items-center gap-2 text-sm"
                >
                  <CheckCircle size={16} />
                  <span>+ MARK AS SOLD</span>
                </button>
              )}

              {/* Owner Status in Desktop Header */}
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-800 leading-tight">{currentUser.name}</div>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200">
                      OWNER
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* Content View Area */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            {isLoading ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-3">
                <RefreshCw size={28} className="animate-spin text-indigo-500" />
                <p className="text-xs font-semibold">Connecting to Kashi Walla Bookstore inventory...</p>
              </div>
            ) : (
              <>
              {activeSection === 'dashboard' && (
                <DashboardView
                  books={books}
                  courses={courses}
                  sales={sales}
                  alerts={stockAlerts}
                  booksMap={booksMap}
                  coursesAvailableMap={coursesAvailableMap}
                  onNavigate={handleNavigate}
                  onOpenAddStockModal={handleOpenAddStockModal}
                  onQuickSell={handleQuickSell}
                />
              )}

              {activeSection === 'books' && (
                <BooksView
                  books={books}
                  currentUser={currentUser}
                  onAddBook={handleAddBook}
                  onUpdateBook={handleUpdateBook}
                  onDeleteBook={handleDeleteBook}
                  onAddStock={handleAddStock}
                  onAdjustStock={handleAdjustStock}
                  onQuickSellBook={(bookId) => handleQuickSell('Book', bookId)}
                  selectedBookForAddStock={bookForAddStockModal}
                  onCloseAddStockModal={() => setBookForAddStockModal(null)}
                />
              )}

              {activeSection === 'courses' && (
                <CoursesView
                  courses={courses}
                  books={books}
                  booksMap={booksMap}
                  currentUser={currentUser}
                  onAddCourse={handleAddCourse}
                  onUpdateCourse={handleUpdateCourse}
                  onDeleteCourse={handleDeleteCourse}
                  onQuickSellCourse={(courseId) => handleQuickSell('Course', courseId)}
                  onAddBook={handleAddBook}
                  onAddStock={handleAddStock}
                  onUpdateBook={handleUpdateBook}
                />
              )}

              {activeSection === 'sell' && (
                <SellView
                  books={books}
                  courses={courses}
                  booksMap={booksMap}
                  currentUser={currentUser}
                  onRecordMultiItemSale={handleRecordMultiItemSale}
                  onRecordBookSale={handleRecordBookSale}
                  onRecordCourseSale={handleRecordCourseSale}
                  initialSelection={quickSellTarget}
                  onClearInitialSelection={() => setQuickSellTarget(null)}
                  onNavigateToRevenue={() => handleNavigate('revenue')}
                />
              )}

              {activeSection === 'revenue' && (
                <RevenueView
                  sales={sales}
                  currentUser={currentUser}
                  onUpdateSalePrice={handleUpdateSalePrice}
                  onRemoveSale={handleRemoveSale}
                />
              )}

              {activeSection === 'sales_history' && (
                <SalesHistoryView sales={sales} />
              )}

              {activeSection === 'stock_alerts' && (
                <StockAlertsView
                  alerts={stockAlerts}
                  books={books}
                  booksMap={booksMap}
                  onOpenAddStockModal={handleOpenAddStockModal}
                  onQuickSell={handleQuickSell}
                />
              )}

              {activeSection === 'inventory_history' && (
                <InventoryHistoryView transactions={transactions} />
              )}

              {activeSection === 'settings' && (
                <SettingsView
                  currentUser={currentUser}
                  storeSettings={storeSettings}
                  onUpdateSettings={handleUpdateStoreSettings}
                  onClearAllCatalog={handleClearAllCatalog}
                  books={books}
                  courses={courses}
                  sales={sales}
                />
              )}
            </>
          )}
        </main>
        </div>
      </div>
    </div>
  );
}
