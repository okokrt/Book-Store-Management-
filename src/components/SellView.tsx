import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle,
  BookOpen,
  Boxes,
  Search,
  AlertCircle,
  CheckCircle2,
  PackageCheck,
  AlertTriangle,
  RotateCcw,
  IndianRupee,
  Pencil,
  FileText,
  TrendingUp,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Receipt,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Book, Course, AppUser, DeductedBook, SaleLineItem } from '../types';
import { calculateCourseStock } from '../utils/stockUtils';
import { AlertBadge } from './AlertBadge';
import { Modal } from './Modal';
import { MultiSaleCartItem, formatDatabaseError } from '../services/db';

export interface CartItem {
  id: string; // bookId or courseId
  itemId: string; // Valid Firestore document ID
  type: 'Book' | 'Course';
  name: string;
  code?: string;
  authorOrItems?: string;
  availableStock: number;
  unitPrice: number;
  customUnitPrice?: number;
  quantity: number;
}

interface SellViewProps {
  books: Book[];
  courses: Course[];
  booksMap: Record<string, Book>;
  currentUser: AppUser;
  onRecordMultiItemSale: (
    cartItems: MultiSaleCartItem[],
    customTotalPrice?: number,
    notes?: string
  ) => Promise<{
    saleId: string;
    saleNumber: number;
    totalPrice: number;
    totalUnits: number;
    lineItems: SaleLineItem[];
    deductedBooks: DeductedBook[];
  }>;
  onRecordBookSale?: (
    bookId: string,
    quantity: number,
    customTotalPrice?: number,
    unitPrice?: number,
    notes?: string
  ) => Promise<{ saleId: string; saleNumber: number; newStock: number; totalPrice: number }>;
  onRecordCourseSale?: (
    courseId: string,
    quantity: number,
    customTotalPrice?: number,
    unitPrice?: number,
    notes?: string
  ) => Promise<{ saleId: string; saleNumber: number; deductedBooks: DeductedBook[]; totalPrice: number }>;
  initialSelection?: { type: 'Book' | 'Course'; id: string } | null;
  onClearInitialSelection?: () => void;
  onNavigateToRevenue?: () => void;
}

type CatalogFilterType = 'ALL' | 'BOOK' | 'COURSE';

export const SellView: React.FC<SellViewProps> = ({
  books,
  courses,
  booksMap,
  currentUser,
  onRecordMultiItemSale,
  initialSelection,
  onClearInitialSelection,
  onNavigateToRevenue,
}) => {
  // Cart state: array of items in the current sale
  const [cart, setCart] = useState<CartItem[]>([]);

  // Search & Catalog Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilterType>('ALL');

  // Overall Pricing & Notes
  const [customPriceInput, setCustomPriceInput] = useState<string>('');
  const [isCustomPriceModified, setIsCustomPriceModified] = useState<boolean>(false);
  const [saleNotes, setSaleNotes] = useState<string>('');

  // Editing individual item unit price inside cart
  const [editingItemPriceId, setEditingItemPriceId] = useState<string | null>(null);
  const [tempItemPrice, setTempItemPrice] = useState<string>('');

  // Submission & Error states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success state for the Sale Receipt modal
  const [completedSale, setCompletedSale] = useState<{
    saleNumber: number;
    totalPrice: number;
    totalUnits: number;
    lineItems: SaleLineItem[];
    deductedBooks: DeductedBook[];
    timestamp: string;
  } | null>(null);

  // Computed courses with available quantity
  const computedCourses = useMemo(() => {
    return courses.map((c) => {
      const calc = calculateCourseStock(c, booksMap);
      const defaultPrice =
        typeof c.price === 'number' && c.price >= 0
          ? c.price
          : c.items?.reduce(
              (sum, item) => sum + (Number(booksMap[item.bookId]?.price) || 0) * item.quantityRequired,
              0
            ) || 0;

      return {
        ...c,
        availableQuantity: calc.availableQuantity,
        breakdown: calc.breakdown,
        isComplete: calc.isComplete,
        computedPrice: defaultPrice,
      };
    });
  }, [courses, booksMap]);

  // Respond to initialSelection changes (e.g. from "Quick Sell" button on card)
  useEffect(() => {
    if (initialSelection) {
      let found = false;
      if (initialSelection.type === 'Book') {
        const b = booksMap[initialSelection.id] || books.find((x) => x.id === initialSelection.id);
        if (b && b.id) {
          addItemToCart({
            id: b.id,
            itemId: b.id,
            type: 'Book',
            name: b.name,
            code: b.code,
            authorOrItems: b.author || b.publisher,
            availableStock: b.stock,
            unitPrice: Number(b.price) || 0,
            quantity: 1,
          });
          found = true;
        }
      } else {
        const c = computedCourses.find((x) => x.id === initialSelection.id);
        if (c && c.id) {
          addItemToCart({
            id: c.id,
            itemId: c.id,
            type: 'Course',
            name: c.name,
            code: c.code,
            authorOrItems: `${c.items?.length || 0} books`,
            availableStock: c.availableQuantity,
            unitPrice: c.computedPrice,
            quantity: 1,
          });
          found = true;
        }
      }

      if (found && onClearInitialSelection) {
        onClearInitialSelection();
      }
    }
  }, [initialSelection, booksMap, books, computedCourses, onClearInitialSelection]);

  // Add an item to cart or increment quantity (with duplicate merging and strict ID enforcement)
  const addItemToCart = (item: {
    id: string;
    itemId?: string;
    type: 'Book' | 'Course';
    name: string;
    code?: string;
    authorOrItems?: string;
    availableStock: number;
    unitPrice: number;
    customUnitPrice?: number;
    quantity?: number;
  }) => {
    setErrorMessage(null);
    const validId = (item.itemId || item.id || '').trim();
    if (!validId) {
      setErrorMessage(`Cannot add "${item.name}" because it does not have a valid document ID.`);
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (i) => (i.itemId || i.id) === validId && i.type === item.type
      );
      if (existingIndex >= 0) {
        // Increment quantity (merging duplicates cleanly)
        const updated = [...prev];
        const cur = updated[existingIndex];
        const newQty = cur.quantity + (item.quantity || 1);
        updated[existingIndex] = {
          ...cur,
          id: validId,
          itemId: validId,
          quantity: newQty,
        };
        return updated;
      } else {
        // Add new item
        return [
          ...prev,
          {
            ...item,
            id: validId,
            itemId: validId,
            quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
          },
        ];
      }
    });
  };

  // Update quantity of an item in cart
  const updateItemQuantity = (id: string, type: 'Book' | 'Course', quantity: number) => {
    setErrorMessage(null);
    if (quantity <= 0) {
      removeItemFromCart(id, type);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        (item.itemId || item.id) === id && item.type === type
          ? { ...item, quantity: Math.max(1, Math.floor(quantity)) }
          : item
      )
    );
  };

  // Remove an item from cart
  const removeItemFromCart = (id: string, type: 'Book' | 'Course') => {
    setErrorMessage(null);
    setCart((prev) =>
      prev.filter((item) => !((item.itemId || item.id) === id && item.type === type))
    );
  };

  // Clear entire cart
  const handleClearCart = () => {
    setCart([]);
    setIsCustomPriceModified(false);
    setCustomPriceInput('');
    setErrorMessage(null);
  };

  // Handle line item custom price update
  const handleSaveItemPrice = (id: string, type: 'Book' | 'Course') => {
    const parsed = parseFloat(tempItemPrice);
    if (!isNaN(parsed) && parsed >= 0) {
      setCart((prev) =>
        prev.map((item) =>
          item.id === id && item.type === type ? { ...item, customUnitPrice: parsed } : item
        )
      );
    }
    setEditingItemPriceId(null);
    setTempItemPrice('');
  };

  // Reset line item price back to catalog default
  const handleResetItemPrice = (id: string, type: 'Book' | 'Course') => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id && item.type === type ? { ...item, customUnitPrice: undefined } : item
      )
    );
    setEditingItemPriceId(null);
  };

  // Filtered Catalog Items for the selection list
  const filteredCatalogBooks = useMemo(() => {
    if (catalogFilter === 'COURSE') return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.code && b.code.toLowerCase().includes(q)) ||
        (b.author && b.author.toLowerCase().includes(q)) ||
        (b.publisher && b.publisher.toLowerCase().includes(q))
    );
  }, [books, searchQuery, catalogFilter]);

  const filteredCatalogCourses = useMemo(() => {
    if (catalogFilter === 'BOOK') return [];
    const q = searchQuery.toLowerCase().trim();
    if (!q) return computedCourses;
    return computedCourses.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.code && c.code.toLowerCase().includes(q)) ||
        c.items?.some((it) => {
          const b = booksMap[it.bookId];
          return b && b.name.toLowerCase().includes(q);
        })
    );
  }, [computedCourses, searchQuery, catalogFilter, booksMap]);

  // Map of items currently in cart for quick lookup
  const cartItemsMap = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach((item) => {
      const realId = item.itemId || item.id;
      map.set(`${item.type}_${realId}`, item.quantity);
      if (item.id) map.set(`${item.type}_${item.id}`, item.quantity);
    });
    return map;
  }, [cart]);

  // Aggregate book stock validation across all books and courses in the cart
  const aggregateBookDemand = useMemo<Record<string, { bookId: string; bookName: string; needed: number; inStock: number }>>(() => {
    const demand: Record<string, { bookId: string; bookName: string; needed: number; inStock: number }> = {};

    cart.forEach((item) => {
      if (item.type === 'Book') {
        const b = booksMap[item.id] || books.find((x) => x.id === item.id);
        const inStock = b ? b.stock : item.availableStock;
        const bName = b ? b.name : item.name;
        if (!demand[item.id]) {
          demand[item.id] = { bookId: item.id, bookName: bName, needed: 0, inStock };
        }
        demand[item.id].needed += item.quantity;
      } else {
        const c = courses.find((crs) => crs.id === item.id);
        if (c && c.items) {
          c.items.forEach((comp) => {
            const b = booksMap[comp.bookId] || books.find((x) => x.id === comp.bookId);
            const inStock = b ? b.stock : 0;
            const bName = b?.name || comp.bookName;
            if (!demand[comp.bookId]) {
              demand[comp.bookId] = { bookId: comp.bookId, bookName: bName, needed: 0, inStock };
            }
            demand[comp.bookId].needed += comp.quantityRequired * item.quantity;
          });
        }
      }
    });

    return demand;
  }, [cart, booksMap, books, courses]);

  // Any stock shortage errors
  const stockShortages = useMemo(() => {
    const demandList = Object.values(aggregateBookDemand) as Array<{
      bookId: string;
      bookName: string;
      needed: number;
      inStock: number;
    }>;
    return demandList
      .filter((info) => info.needed > info.inStock)
      .map((info) => ({
        bookId: info.bookId,
        bookName: info.bookName,
        needed: info.needed,
        inStock: info.inStock,
        deficit: info.needed - info.inStock,
      }));
  }, [aggregateBookDemand]);

  // Total distinct items and total units count
  const totalUnits = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Standard calculated total price of all items in cart
  const standardTotalPrice = useMemo(() => {
    return cart.reduce((sum, item) => {
      const uPrice = item.customUnitPrice !== undefined ? item.customUnitPrice : item.unitPrice;
      return sum + uPrice * item.quantity;
    }, 0);
  }, [cart]);

  // Keep customPriceInput in sync with standard price when not manually overridden
  useEffect(() => {
    if (!isCustomPriceModified) {
      setCustomPriceInput(String(standardTotalPrice));
    }
  }, [standardTotalPrice, isCustomPriceModified]);

  // Effective final price
  const effectiveTotalPrice = useMemo(() => {
    if (isCustomPriceModified) {
      const parsed = parseFloat(customPriceInput);
      return isNaN(parsed) ? standardTotalPrice : Math.max(0, parsed);
    }
    return standardTotalPrice;
  }, [isCustomPriceModified, customPriceInput, standardTotalPrice]);

  // Check if sale can be executed
  const canSubmitSale = useMemo(() => {
    return (
      cart.length > 0 &&
      totalUnits > 0 &&
      stockShortages.length === 0 &&
      !isSubmitting
    );
  }, [cart, totalUnits, stockShortages, isSubmitting]);

  // Submit sale handler
  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (cart.length === 0) {
      setErrorMessage('Please select at least one book or course to mark as sold.');
      return;
    }

    if (stockShortages.length > 0) {
      setErrorMessage(
        `Insufficient inventory stock: ${stockShortages
          .map((s) => `"${s.bookName}" (Available: ${s.inStock}, Needed: ${s.needed})`)
          .join(', ')}`
      );
      return;
    }

    // Validate that every item in the cart has a valid, non-empty Firestore document ID
    for (const item of cart) {
      const realId = (item.itemId || item.id || '').trim();
      if (!realId) {
        setErrorMessage(
          `Unable to complete sale because item "${item.name}" has an invalid ID. Please remove and re-add the item.`
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const multiCartPayload: MultiSaleCartItem[] = cart.map((item) => {
        const realId = (item.itemId || item.id || '').trim();
        return {
          id: realId,
          itemId: realId,
          type: item.type,
          name: item.name,
          code: item.code,
          quantity: item.quantity,
          unitPrice: item.customUnitPrice !== undefined ? item.customUnitPrice : item.unitPrice,
        };
      });

      const customTotal = isCustomPriceModified ? effectiveTotalPrice : undefined;
      const res = await onRecordMultiItemSale(
        multiCartPayload,
        customTotal,
        saleNotes.trim() || undefined
      );

      const finalLineItems = res.lineItems || res.items || multiCartPayload.map((m) => ({
        id: m.id,
        itemId: m.id,
        itemType: m.type,
        name: m.name,
        code: m.code || '',
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        totalPrice: m.unitPrice * m.quantity,
      }));

      // Open completion receipt
      setCompletedSale({
        saleNumber: res.saleNumber,
        totalPrice: res.totalPrice ?? (customTotal !== undefined ? customTotal : effectiveTotalPrice),
        totalUnits: res.totalUnits ?? res.quantity ?? totalUnits,
        lineItems: finalLineItems,
        deductedBooks: res.deductedBooks || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      });

      // Clear the cart
      setCart([]);
      setIsCustomPriceModified(false);
      setCustomPriceInput('');
      setSaleNotes('');
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CheckCircle className="text-emerald-600" size={26} />
            <span>Sell / Mark as Sold</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Select multiple books and course packages into a single order. The total price in INR (₹) and component inventory deductions calculate automatically.
          </p>
        </div>

        {onNavigateToRevenue && (
          <button
            type="button"
            onClick={onNavigateToRevenue}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <TrendingUp size={14} className="text-emerald-600" />
            <span>View Revenue & Ledger</span>
          </button>
        )}
      </div>

      {/* Main Grid: Catalog Selector (Left) & Sale Order / Cart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* =========================================================================
            LEFT COLUMN (7 COLS): CATALOG SELECTOR
            ========================================================================= */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Catalog Filter Header & Search */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-900 text-white text-[10px]">
                    1
                  </span>
                  Choose Books & Courses
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {books.length} Books • {courses.length} Courses
                </span>
              </div>

              {/* Filter Tabs: All / Books / Courses */}
              <div className="flex items-center bg-slate-200/70 p-1 rounded-xl gap-1 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setCatalogFilter('ALL')}
                  className={`flex-1 py-1.5 rounded-lg transition-all text-center cursor-pointer ${
                    catalogFilter === 'ALL'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Items ({books.length + courses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogFilter('BOOK')}
                  className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                    catalogFilter === 'BOOK'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookOpen size={13} />
                  <span>Books ({books.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCatalogFilter('COURSE')}
                  className={`flex-1 py-1.5 rounded-lg transition-all text-center flex items-center justify-center gap-1 cursor-pointer ${
                    catalogFilter === 'COURSE'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Boxes size={13} />
                  <span>Courses ({courses.length})</span>
                </button>
              </div>

              {/* Search bar */}
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by book title, course bundle, code, author..."
                  className="w-full pl-9 pr-8 py-2 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Catalog Items Scrollable List */}
            <div className="max-h-[560px] overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
              {filteredCatalogBooks.length === 0 && filteredCatalogCourses.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Search size={28} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-xs font-bold text-slate-600">No matching books or courses found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Try modifying your search query or clear the filter.
                  </p>
                </div>
              ) : (
                <>
                  {/* Books Section */}
                  {filteredCatalogBooks.map((book) => {
                    const cartQty = cartItemsMap.get(`Book_${book.id}`) || 0;
                    const isOutOfStock = book.stock <= 0;

                    return (
                      <div
                        key={`book_${book.id}`}
                        className={`p-3 rounded-xl transition-colors flex items-center justify-between gap-3 border ${
                          cartQty > 0
                            ? 'bg-indigo-50/50 border-indigo-200/80 shadow-2xs'
                            : isOutOfStock
                            ? 'bg-slate-50/80 border-slate-100 opacity-60'
                            : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-800">
                              <BookOpen size={10} />
                              Book
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {book.name}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                            {book.code && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-700">
                                {book.code}
                              </span>
                            )}
                            {book.author && <span>By {book.author}</span>}
                            <span>•</span>
                            <span
                              className={`font-semibold ${
                                book.stock <= 0
                                  ? 'text-rose-600'
                                  : book.stock <= 5
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              Stock: {book.stock} left
                            </span>
                          </div>
                        </div>

                        {/* Price & Add to Sale Button */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <div className="text-right">
                            <div className="font-bold text-xs sm:text-sm text-emerald-700">
                              ₹{(Number(book.price) || 0).toLocaleString('en-IN')}
                            </div>
                            <span className="text-[10px] text-slate-400">per copy</span>
                          </div>

                          {cartQty > 0 ? (
                            <div className="flex items-center gap-1 bg-indigo-600 text-white px-1.5 py-1 rounded-lg shadow-2xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateItemQuantity(book.id, 'Book', cartQty - 1);
                                }}
                                title="Reduce copy from sale"
                                className="w-5 h-5 rounded bg-indigo-700 hover:bg-indigo-800 flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="text-xs font-bold px-1 min-w-[18px] text-center">{cartQty}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addItemToCart({
                                    id: book.id,
                                    itemId: book.id,
                                    type: 'Book',
                                    name: book.name,
                                    code: book.code,
                                    authorOrItems: book.author || book.publisher,
                                    availableStock: book.stock,
                                    unitPrice: Number(book.price) || 0,
                                    quantity: 1,
                                  });
                                }}
                                disabled={cartQty >= book.stock}
                                title={cartQty >= book.stock ? 'Maximum available stock in cart' : 'Add another copy'}
                                className="w-5 h-5 rounded bg-indigo-700 hover:bg-indigo-800 disabled:opacity-40 flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                addItemToCart({
                                  id: book.id,
                                  itemId: book.id,
                                  type: 'Book',
                                  name: book.name,
                                  code: book.code,
                                  authorOrItems: book.author || book.publisher,
                                  availableStock: book.stock,
                                  unitPrice: Number(book.price) || 0,
                                  quantity: 1,
                                })
                              }
                              disabled={isOutOfStock}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer ${
                                isOutOfStock
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                              }`}
                            >
                              <Plus size={13} />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Courses Section */}
                  {filteredCatalogCourses.map((course) => {
                    const cartQty = cartItemsMap.get(`Course_${course.id}`) || 0;
                    const isOutOfStock = course.availableQuantity <= 0;

                    return (
                      <div
                        key={`course_${course.id}`}
                        className={`p-3 rounded-xl transition-colors flex items-center justify-between gap-3 border ${
                          cartQty > 0
                            ? 'bg-purple-50/50 border-purple-200/80 shadow-2xs'
                            : isOutOfStock
                            ? 'bg-slate-50/80 border-slate-100 opacity-60'
                            : 'bg-white border-transparent hover:border-slate-200 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-purple-100 text-purple-800">
                              <Boxes size={10} />
                              Course
                            </span>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                              {course.name}
                            </h4>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-slate-500">
                            {course.code && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-700">
                                {course.code}
                              </span>
                            )}
                            <span>{course.items?.length || 0} component books</span>
                            <span>•</span>
                            <span
                              className={`font-semibold ${
                                course.availableQuantity <= 0
                                  ? 'text-rose-600'
                                  : course.availableQuantity <= 3
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              Avail: {course.availableQuantity} bundles
                            </span>
                          </div>
                        </div>

                        {/* Price & Add to Sale Button */}
                        <div className="flex items-center gap-2.5 flex-shrink-0">
                          <div className="text-right">
                            <div className="font-bold text-xs sm:text-sm text-emerald-700">
                              ₹{course.computedPrice.toLocaleString('en-IN')}
                            </div>
                            <span className="text-[10px] text-slate-400">per bundle</span>
                          </div>

                          {cartQty > 0 ? (
                            <div className="flex items-center gap-1 bg-purple-600 text-white px-1.5 py-1 rounded-lg shadow-2xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateItemQuantity(course.id, 'Course', cartQty - 1);
                                }}
                                title="Reduce bundle from sale"
                                className="w-5 h-5 rounded bg-purple-700 hover:bg-purple-800 flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="text-xs font-bold px-1 min-w-[18px] text-center">{cartQty}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addItemToCart({
                                    id: course.id,
                                    itemId: course.id,
                                    type: 'Course',
                                    name: course.name,
                                    code: course.code,
                                    authorOrItems: `${course.items?.length || 0} books`,
                                    availableStock: course.availableQuantity,
                                    unitPrice: course.computedPrice,
                                    quantity: 1,
                                  });
                                }}
                                disabled={cartQty >= course.availableQuantity}
                                title={
                                  cartQty >= course.availableQuantity
                                    ? 'Maximum available packages in cart'
                                    : 'Add another bundle'
                                }
                                className="w-5 h-5 rounded bg-purple-700 hover:bg-purple-800 disabled:opacity-40 flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                addItemToCart({
                                  id: course.id,
                                  itemId: course.id,
                                  type: 'Course',
                                  name: course.name,
                                  code: course.code,
                                  authorOrItems: `${course.items?.length || 0} books`,
                                  availableStock: course.availableQuantity,
                                  unitPrice: course.computedPrice,
                                  quantity: 1,
                                })
                              }
                              disabled={isOutOfStock}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer ${
                                isOutOfStock
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
                              }`}
                            >
                              <Plus size={13} />
                              <span>Add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN (5 COLS): SALE ORDER & BILLING SUMMARY (TOTAL PRICE)
            ========================================================================= */}
        <div className="lg:col-span-5 space-y-4">
          <form
            onSubmit={handleSaleSubmit}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col"
          >
            {/* Order Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-slate-900 text-[10px] font-black">
                  2
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold flex items-center gap-1.5">
                    <ShoppingCart size={16} className="text-emerald-400" />
                    <span>Sale Order</span>
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {cart.length} distinct item{cart.length !== 1 ? 's' : ''} ({totalUnits} total units)
                  </span>
                </div>
              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="text-xs font-semibold text-rose-300 hover:text-rose-200 transition-colors flex items-center gap-1 cursor-pointer bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700"
                >
                  <Trash2 size={12} />
                  <span>Clear All</span>
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="p-4 sm:p-5 space-y-3 flex-1">
              {cart.length === 0 ? (
                <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <ShoppingCart size={32} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-xs sm:text-sm font-bold text-slate-700">Your sale order is empty</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                    Click <strong>"+ Add"</strong> on any book or course bundle from the catalogue on the left to add items to this sale.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {cart.map((item) => {
                    const effectiveLineUnitPrice =
                      item.customUnitPrice !== undefined ? item.customUnitPrice : item.unitPrice;
                    const lineSubtotal = effectiveLineUnitPrice * item.quantity;
                    const isExceedingStock = item.quantity > item.availableStock;
                    const isEditingThisPrice =
                      editingItemPriceId === `${item.type}_${item.id}`;

                    return (
                      <div
                        key={`${item.type}_${item.id}`}
                        className={`p-3 rounded-xl border transition-all ${
                          isExceedingStock
                            ? 'border-rose-300 bg-rose-50/40'
                            : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
                        }`}
                      >
                        {/* Title & Remove Button */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase ${
                                  item.type === 'Book'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {item.type}
                              </span>
                              <h5 className="text-xs font-bold text-slate-900 truncate">
                                {item.name}
                              </h5>
                            </div>
                            {item.code && (
                              <span className="text-[10px] text-slate-500 font-mono">
                                Code: {item.code}
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItemFromCart(item.id, item.type)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                            title="Remove from order"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {/* Controls: Quantity Stepper & Price */}
                        <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70">
                          {/* Quantity Stepper */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity(item.id, item.type, item.quantity - 1)
                              }
                              className="w-6 h-6 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                            >
                              <Minus size={11} />
                            </button>

                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val)) {
                                  updateItemQuantity(item.id, item.type, val);
                                }
                              }}
                              className="w-12 h-6 text-center text-xs font-bold bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                updateItemQuantity(item.id, item.type, item.quantity + 1)
                              }
                              className="w-6 h-6 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 flex items-center justify-center font-bold text-xs cursor-pointer shadow-2xs transition-colors"
                            >
                              <Plus size={11} />
                            </button>

                            <span className="text-[10px] text-slate-400 ml-1">
                              / {item.availableStock} in stock
                            </span>
                          </div>

                          {/* Line Item Pricing with Inline Edit Option */}
                          <div className="text-right">
                            {isEditingThisPrice ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={tempItemPrice}
                                  onChange={(e) => setTempItemPrice(e.target.value)}
                                  placeholder="New ₹"
                                  className="w-16 px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveItemPrice(item.id, item.type)}
                                  className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-bold"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingItemPriceId(null)}
                                  className="text-[10px] text-slate-500 hover:text-slate-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1.5">
                                <span className="text-[10px] text-slate-500">
                                  @ ₹{effectiveLineUnitPrice.toLocaleString('en-IN')}
                                  {item.customUnitPrice !== undefined && (
                                    <span className="text-amber-600 ml-0.5 font-bold">(Custom)</span>
                                  )}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingItemPriceId(`${item.type}_${item.id}`);
                                    setTempItemPrice(String(effectiveLineUnitPrice));
                                  }}
                                  className="text-slate-400 hover:text-indigo-600 p-0.5"
                                  title="Edit unit price for this item"
                                >
                                  <Pencil size={11} />
                                </button>

                                <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 ml-1">
                                  ₹{lineSubtotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Stock Warning if exceeded */}
                        {isExceedingStock && (
                          <div className="mt-1.5 text-[10px] text-rose-600 font-semibold flex items-center gap-1">
                            <AlertTriangle size={11} />
                            <span>
                              Requested {item.quantity}, but only {item.availableStock} available!
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Aggregated Stock Shortage Alert */}
              {stockShortages.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-rose-900">
                    <AlertTriangle size={14} className="text-rose-600" />
                    <span>Inventory Shortage Detected Across Order:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
                    {stockShortages.map((s) => (
                      <li key={s.bookId}>
                        <strong>"{s.bookName}"</strong>: Available: {s.inStock}, Total Required: {s.needed} (Short by {s.deficit})
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-rose-600 pt-0.5">
                    Reduce quantities in your cart above before completing the sale.
                  </p>
                </div>
              )}

              {/* Total Price & Financial Breakdown (Displayed prominently) */}
              {cart.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-600 pb-2 border-b border-slate-200">
                    <span>Standard Subtotal:</span>
                    <span className="font-mono font-bold text-slate-800">
                      ₹{standardTotalPrice.toLocaleString('en-IN')}
                    </span>
                  </div>

                  {/* Grand Total Price Block */}
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-slate-700 block">
                        Grand Total Price
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {isCustomPriceModified ? 'Custom Overridden Total' : 'Calculated automatically'}
                      </span>
                    </div>

                    <div className="text-right">
                      <div className="text-xl sm:text-2xl font-mono font-black text-emerald-600 flex items-center justify-end gap-1">
                        <IndianRupee size={20} className="stroke-[2.5]" />
                        <span>{effectiveTotalPrice.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Optional Custom Total Price Override */}
                  <div className="pt-2 border-t border-slate-200/80">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="custom_total_input"
                        className="text-[11px] font-bold text-slate-600 flex items-center gap-1"
                      >
                        <Pencil size={11} className="text-indigo-600" />
                        <span>Lump-Sum Discount / Custom Price (₹):</span>
                      </label>

                      {isCustomPriceModified && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCustomPriceModified(false);
                            setCustomPriceInput(String(standardTotalPrice));
                          }}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-0.5 cursor-pointer"
                        >
                          <RotateCcw size={10} />
                          <span>Reset to Standard</span>
                        </button>
                      )}
                    </div>

                    <div className="relative mt-1">
                      <IndianRupee
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      />
                      <input
                        id="custom_total_input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={customPriceInput}
                        onChange={(e) => {
                          setCustomPriceInput(e.target.value);
                          setIsCustomPriceModified(true);
                        }}
                        placeholder={`Standard: ₹${standardTotalPrice}`}
                        className="w-full pl-8 pr-3 py-1.5 text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Sale Memo / Notes */}
                  <div>
                    <label
                      htmlFor="sale_notes"
                      className="text-[11px] font-bold text-slate-600 flex items-center gap-1 mb-1"
                    >
                      <FileText size={11} className="text-slate-400" />
                      <span>Sale Memo / Notes (Optional):</span>
                    </label>
                    <input
                      id="sale_notes"
                      type="text"
                      value={saleNotes}
                      onChange={(e) => setSaleNotes(e.target.value)}
                      placeholder="e.g. Student discount, Cash sale, Batch A"
                      className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={!canSubmitSale}
                  className={`w-full py-3 px-4 rounded-xl font-black text-sm tracking-wide shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    canSubmitSale
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 hover:shadow-md'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Committing Atomic Sale...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      <span>
                        MARK AS SOLD • ₹{effectiveTotalPrice.toLocaleString('en-IN')}
                      </span>
                    </>
                  )}
                </button>

                <p className="text-[10px] text-slate-400 text-center mt-2">
                  Stock is deducted atomically in real-time across all books and course bundles.
                </p>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* =========================================================================
          RECEIPT MODAL: SALE COMPLETED CONFIRMATION
          ========================================================================= */}
      <Modal
        isOpen={!!completedSale}
        onClose={() => setCompletedSale(null)}
        title={`Sale #${completedSale?.saleNumber} Completed!`}
        subtitle="Receipt & Stock Deduction Summary"
        maxWidth="lg"
      >
        {completedSale && (
          <div className="space-y-4">
            {/* Header banner */}
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h4 className="text-sm font-black text-emerald-950">
                  Sale #{completedSale.saleNumber} Recorded Successfully
                </h4>
                <p className="text-xs text-emerald-800">
                  Total revenue of <strong>₹{completedSale.totalPrice.toLocaleString('en-IN')}</strong> recorded at {completedSale.timestamp}.
                </p>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600 flex items-center justify-between">
                <span>Sold Items ({(completedSale.lineItems || []).length})</span>
                <span>Total: ₹{(completedSale.totalPrice ?? 0).toLocaleString('en-IN')}</span>
              </div>

              <div className="divide-y divide-slate-200 text-xs">
                {(completedSale.lineItems || []).map((item, idx) => (
                  <div key={idx} className="p-3 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                            item.itemType === 'Book'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          {item.itemType}
                        </span>
                        <span className="font-bold text-slate-900 truncate">{item.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.quantity} × ₹{(item.unitPrice ?? 0).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="font-mono font-bold text-sm text-slate-900">
                      ₹{(item.totalPrice ?? ((item.unitPrice ?? 0) * item.quantity)).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Inventory Deductions Audit */}
            {(completedSale.deductedBooks || []).length > 0 && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <PackageCheck size={14} className="text-indigo-600" />
                  <span>Physical Inventory Stock Deducted:</span>
                </h5>
                <div className="space-y-1 text-xs">
                  {(completedSale.deductedBooks || []).map((db, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                    >
                      <span className="font-semibold text-slate-800">{db.bookName}</span>
                      <span className="font-mono font-bold text-rose-600">
                        &minus;{db.quantityDeducted} copies
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              {onNavigateToRevenue && (
                <button
                  type="button"
                  onClick={() => {
                    setCompletedSale(null);
                    onNavigateToRevenue();
                  }}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer shadow-2xs transition-colors flex items-center gap-1"
                >
                  <TrendingUp size={13} className="text-emerald-600" />
                  <span>View in Revenue Ledger</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer shadow-xs transition-colors"
              >
                Start New Sale
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
