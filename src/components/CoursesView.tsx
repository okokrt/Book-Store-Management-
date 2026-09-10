import React, { useState, useMemo, useEffect } from 'react';
import {
  Boxes,
  Search,
  Plus,
  Minus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  BookOpen,
  Filter,
  ChevronDown,
  ChevronUp,
  Package,
  X,
  Check,
  Sparkles,
  Library,
  IndianRupee,
} from 'lucide-react';
import { Course, CourseItem, Book, AppUser } from '../types';
import { calculateCourseStock } from '../utils/stockUtils';
import { AlertBadge } from './AlertBadge';
import { Modal } from './Modal';
import { formatDatabaseError } from '../services/db';

interface CoursesViewProps {
  courses: Course[];
  books: Book[];
  booksMap: Record<string, Book>;
  currentUser: AppUser;
  onAddCourse: (data: { name: string; code?: string; price?: number; items: CourseItem[] }) => Promise<void>;
  onUpdateCourse: (id: string, data: { name: string; code?: string; price?: number; items: CourseItem[] }) => Promise<void>;
  onDeleteCourse: (id: string) => Promise<void>;
  onQuickSellCourse: (courseId: string) => void;
  onAddBook?: (data: { name: string; code?: string; author?: string; publisher?: string; stock: number; price?: number }) => Promise<void>;
}

type FilterType = 'ALL' | 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK';
type BookSearchTab = 'ALL' | 'NOT_ADDED' | 'IN_STOCK' | 'ADDED';

export const CoursesView: React.FC<CoursesViewProps> = ({
  courses,
  books,
  booksMap,
  currentUser,
  onAddCourse,
  onUpdateCourse,
  onDeleteCourse,
  onQuickSellCourse,
  onAddBook,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('ALL');

  // Modals
  const [isAddCourseModalOpen, setIsAddCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);

  // Form State
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [coursePrice, setCoursePrice] = useState('');
  const [isPriceCustom, setIsPriceCustom] = useState(false);
  const [selectedItems, setSelectedItems] = useState<CourseItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Real-time Book Search Engine State inside Course Modal
  const [bookSearchQuery, setBookSearchQuery] = useState('');
  const [bookSearchFilter, setBookSearchFilter] = useState<BookSearchTab>('ALL');
  const [includedSearchQuery, setIncludedSearchQuery] = useState('');
  const [toastNotification, setToastNotification] = useState<string | null>(null);

  // Quick inline new book creator state (for creating missing books right inside course modal)
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickBookName, setQuickBookName] = useState('');
  const [quickBookCode, setQuickBookCode] = useState('');
  const [quickBookAuthor, setQuickBookAuthor] = useState('');
  const [quickBookPublisher, setQuickBookPublisher] = useState('');
  const [quickBookStock, setQuickBookStock] = useState('10');
  const [quickBookPrice, setQuickBookPrice] = useState('0');
  const [isQuickCreating, setIsQuickCreating] = useState(false);

  // Auto-clear toast notice
  useEffect(() => {
    if (!toastNotification) return;
    const timer = setTimeout(() => setToastNotification(null), 3000);
    return () => clearTimeout(timer);
  }, [toastNotification]);

  // Set of selected book IDs for rapid lookup
  const selectedBookIdsSet = useMemo(() => {
    return new Set(selectedItems.map((i) => i.bookId));
  }, [selectedItems]);

  // Real-time Search Engine filtering for books catalog
  const filteredCatalogBooks = useMemo(() => {
    const qTokens = bookSearchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    return books.filter((b) => {
      // Tokenized search matches any word in title, code, author, publisher
      if (qTokens.length > 0) {
        const title = (b.name || '').toLowerCase();
        const code = (b.code || '').toLowerCase();
        const author = (b.author || '').toLowerCase();
        const publisher = (b.publisher || '').toLowerCase();

        const matchesAll = qTokens.every(
          (t) =>
            title.includes(t) ||
            code.includes(t) ||
            author.includes(t) ||
            publisher.includes(t)
        );
        if (!matchesAll) return false;
      }

      // Filter tabs
      const isAdded = selectedBookIdsSet.has(b.id);
      if (bookSearchFilter === 'NOT_ADDED' && isAdded) return false;
      if (bookSearchFilter === 'ADDED' && !isAdded) return false;
      if (bookSearchFilter === 'IN_STOCK' && (Number(b.stock) || 0) <= 0) return false;

      return true;
    });
  }, [books, bookSearchQuery, bookSearchFilter, selectedBookIdsSet]);

  // Filtered included items for courses with many books
  const filteredIncludedItems = useMemo(() => {
    const q = includedSearchQuery.toLowerCase().trim();
    if (!q) return selectedItems;
    return selectedItems.filter((item) => {
      const book = booksMap[item.bookId];
      const name = (item.bookName || '').toLowerCase();
      const code = (book?.code || '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
  }, [selectedItems, includedSearchQuery, booksMap]);

  // Total quantity of all copies included in one course bundle
  const totalBundleCopiesCount = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.quantityRequired, 0);
  }, [selectedItems]);

  // Total sum of component books prices in this course bundle
  const standardComponentBooksSum = useMemo(() => {
    return selectedItems.reduce((sum, item) => {
      const b = booksMap[item.bookId];
      const unitP = b?.price || 0;
      return sum + unitP * item.quantityRequired;
    }, 0);
  }, [selectedItems, booksMap]);

  // Live calculated availability for items currently in the form
  const modalLiveAvailability = useMemo(() => {
    if (selectedItems.length === 0) return { availableQuantity: 0, limitingBook: null };
    let minAvail = Infinity;
    let limitingBook: { name: string; stock: number; req: number } | null = null;
    for (const item of selectedItems) {
      const b = booksMap[item.bookId];
      const stock = b ? Math.max(0, Number(b.stock) || 0) : 0;
      const req = Math.max(1, item.quantityRequired);
      const possible = Math.floor(stock / req);
      if (possible < minAvail) {
        minAvail = possible;
        limitingBook = { name: item.bookName || b?.name || 'Book', stock, req };
      }
    }
    return {
      availableQuantity: minAvail === Infinity ? 0 : minAvail,
      limitingBook,
    };
  }, [selectedItems, booksMap]);

  // Real-Time Search Engine Handlers:
  // Add a book from the search engine (or increment if already added)
  const handleAddBookToCourse = (book: Book, qty = 1) => {
    const existing = selectedItems.find((i) => i.bookId === book.id);
    if (existing) {
      setSelectedItems((prev) =>
        prev.map((i) =>
          i.bookId === book.id
            ? { ...i, quantityRequired: i.quantityRequired + qty }
            : i
        )
      );
      setToastNotification(`Updated "${book.name}" required quantity to ${existing.quantityRequired + qty}.`);
    } else {
      setSelectedItems((prev) => [
        ...prev,
        {
          bookId: book.id,
          bookName: book.name,
          quantityRequired: qty,
        },
      ]);
      setToastNotification(`Added "${book.name}" to course bundle.`);
    }
    setErrorMessage(null);
  };

  // Add all currently filtered books (batch addition)
  const handleAddAllFilteredBooks = () => {
    const toAdd = filteredCatalogBooks.filter((b) => !selectedBookIdsSet.has(b.id));
    if (toAdd.length === 0) return;

    const newItems: CourseItem[] = toAdd.map((b) => ({
      bookId: b.id,
      bookName: b.name,
      quantityRequired: 1,
    }));

    setSelectedItems((prev) => [...prev, ...newItems]);
    setToastNotification(`Added ${toAdd.length} books to course bundle.`);
    setErrorMessage(null);
  };

  // Remove a book from the course
  const handleRemoveBook = (bookId: string) => {
    const book = booksMap[bookId];
    setSelectedItems((prev) => prev.filter((i) => i.bookId !== bookId));
    if (book) {
      setToastNotification(`Removed "${book.name}" from course.`);
    }
  };

  // Adjust quantity via stepper (+ / -)
  const handleAdjustQuantity = (bookId: string, delta: number) => {
    setSelectedItems((prev) =>
      prev.map((i) => {
        if (i.bookId !== bookId) return i;
        const newQty = Math.max(1, i.quantityRequired + delta);
        return { ...i, quantityRequired: newQty };
      })
    );
  };

  // Set quantity directly via input
  const handleSetQuantity = (bookId: string, valStr: string) => {
    const qty = parseInt(valStr, 10);
    setSelectedItems((prev) =>
      prev.map((i) => {
        if (i.bookId !== bookId) return i;
        return { ...i, quantityRequired: isNaN(qty) ? 1 : Math.max(1, qty) };
      })
    );
  };

  // Clear all books
  const handleClearAllBooks = () => {
    setSelectedItems([]);
    setErrorMessage(null);
    setToastNotification('Cleared all books from course.');
  };

  // Quick Create New Book right inside Course Modal
  const handleQuickCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickBookName.trim()) {
      setErrorMessage('Book Title is required.');
      return;
    }
    const stockNum = parseInt(quickBookStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setErrorMessage('Stock must be a non-negative whole number (0 or higher).');
      return;
    }
    const priceNum = parseFloat(quickBookPrice);
    const validPrice = isNaN(priceNum) || priceNum < 0 ? 0 : priceNum;

    if (!onAddBook) {
      setErrorMessage('Book creation is not supported in this view.');
      return;
    }

    try {
      setIsQuickCreating(true);
      await onAddBook({
        name: quickBookName.trim(),
        code: quickBookCode.trim(),
        author: quickBookAuthor.trim(),
        publisher: quickBookPublisher.trim(),
        stock: stockNum,
        price: validPrice,
      });

      // Clear quick create form
      setQuickBookName('');
      setQuickBookCode('');
      setQuickBookAuthor('');
      setQuickBookPublisher('');
      setQuickBookStock('10');
      setQuickBookPrice('0');
      setIsQuickCreateOpen(false);
      setToastNotification(`Book created! Search for it above to add it to this course.`);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsQuickCreating(false);
    }
  };

  // Filtered courses with dynamic stock calculation
  const computedCourses = useMemo(() => {
    return courses.map((course) => {
      const calc = calculateCourseStock(course, booksMap);
      return {
        ...course,
        availableQuantity: calc.availableQuantity,
        breakdown: calc.breakdown,
        isComplete: calc.isComplete,
      };
    });
  }, [courses, booksMap]);

  const filteredCourses = useMemo(() => {
    return computedCourses.filter((course) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        course.name.toLowerCase().includes(q) ||
        (course.code && course.code.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (filterType === 'AVAILABLE') return course.availableQuantity > 0;
      if (filterType === 'LOW_STOCK')
        return course.availableQuantity > 0 && course.availableQuantity <= 15;
      if (filterType === 'OUT_OF_STOCK') return course.availableQuantity === 0;

      return true;
    });
  }, [computedCourses, searchQuery, filterType]);

  // Open Add modal
  const handleOpenAdd = () => {
    setCourseName('');
    setCourseCode('');
    setCoursePrice('');
    setIsPriceCustom(false);
    setSelectedItems([]);
    setBookSearchQuery('');
    setBookSearchFilter('ALL');
    setIncludedSearchQuery('');
    setToastNotification(null);
    setErrorMessage(null);
    setIsQuickCreateOpen(false);
    setIsAddCourseModalOpen(true);
  };

  // Open Edit modal
  const handleOpenEdit = (course: Course) => {
    setEditingCourse(course);
    setCourseName(course.name);
    setCourseCode(course.code || '');
    if (course.price !== undefined && course.price !== null) {
      setCoursePrice(String(course.price));
      setIsPriceCustom(true);
    } else {
      setCoursePrice('');
      setIsPriceCustom(false);
    }
    setSelectedItems(
      course.items.map((i) => ({
        bookId: i.bookId,
        bookName: booksMap[i.bookId]?.name || i.bookName,
        quantityRequired: i.quantityRequired,
      }))
    );
    setBookSearchQuery('');
    setBookSearchFilter('ALL');
    setIncludedSearchQuery('');
    setToastNotification(null);
    setErrorMessage(null);
    setIsQuickCreateOpen(false);
  };

  // Add item row in modal
  const handleAddItemRow = () => {
    // Pick first book that isn't already added
    const alreadySelected = new Set(selectedItems.map((i) => i.bookId));
    const nextAvailableBook = books.find((b) => !alreadySelected.has(b.id)) || books[0];

    if (!nextAvailableBook) {
      setErrorMessage('No more available books to add to this course.');
      return;
    }

    setSelectedItems([
      ...selectedItems,
      {
        bookId: nextAvailableBook.id,
        bookName: nextAvailableBook.name,
        quantityRequired: 1,
      },
    ]);
  };

  // Remove item row
  const handleRemoveItemRow = (index: number) => {
    if (selectedItems.length <= 1) {
      setErrorMessage('A course must contain at least one book.');
      return;
    }
    setSelectedItems(selectedItems.filter((_, i) => i !== index));
  };

  // Change book in row
  const handleChangeBook = (index: number, newBookId: string) => {
    const book = booksMap[newBookId];
    if (!book) return;

    // Check if already in list
    const isDuplicate = selectedItems.some((item, i) => i !== index && item.bookId === newBookId);
    if (isDuplicate) {
      setErrorMessage(`Book "${book.name}" is already in this course bundle.`);
      return;
    }

    const updated = [...selectedItems];
    updated[index] = {
      ...updated[index],
      bookId: newBookId,
      bookName: book.name,
    };
    setSelectedItems(updated);
    setErrorMessage(null);
  };

  // Change quantity in row
  const handleChangeQuantity = (index: number, qtyString: string) => {
    const qty = parseInt(qtyString, 10);
    const updated = [...selectedItems];
    updated[index] = {
      ...updated[index],
      quantityRequired: isNaN(qty) ? 1 : Math.max(1, qty),
    };
    setSelectedItems(updated);
  };

  // Submit Course Form
  const handleSubmitCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) {
      setErrorMessage('Course Name is required.');
      return;
    }

    if (selectedItems.length === 0) {
      setErrorMessage('A course must contain at least one book.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const priceVal = coursePrice.trim() !== '' ? parseFloat(coursePrice) : standardComponentBooksSum;
      const validPrice = isNaN(priceVal) || priceVal < 0 ? undefined : priceVal;

      const payload = {
        name: courseName.trim(),
        code: courseCode.trim() || undefined,
        price: validPrice,
        items: selectedItems,
      };

      if (editingCourse) {
        const courseId = editingCourse.id;
        setEditingCourse(null); // Close modal immediately!
        await onUpdateCourse(courseId, payload);
      } else {
        setIsAddCourseModalOpen(false); // Close modal immediately!
        await onAddCourse(payload);
      }
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCourse) return;
    try {
      setIsSubmitting(true);
      const courseId = deletingCourse.id;
      setDeletingCourse(null); // Close modal immediately!
      await onDeleteCourse(courseId);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Boxes className="text-indigo-600" size={26} />
            <span>Course Bundles</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Courses combine multiple books. Available stock is calculated strictly from component books: MIN(floor(stock / required)).
          </p>
        </div>

        {currentUser.role === 'OWNER' && (
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus size={18} />
            <span>Create New Course</span>
          </button>
        )}
      </div>

      {/* Consistency Rule Notice */}
      <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex items-start gap-2.5">
        <Package size={17} className="text-indigo-600 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="font-bold text-indigo-950">Strict Stock Consistency:</strong> Courses do NOT maintain an independent physical stock number. The displayed available quantity automatically reflects the minimum complete packages that can currently be assembled from your physical book inventory.
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by course name or course code..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={12} />
            Filter:
          </span>
          {(
            [
              { key: 'ALL', label: 'All Courses', count: computedCourses.length },
              {
                key: 'AVAILABLE',
                label: 'Available (>0)',
                count: computedCourses.filter((c) => c.availableQuantity > 0).length,
              },
              {
                key: 'LOW_STOCK',
                label: 'Low Stock (1-15)',
                count: computedCourses.filter((c) => c.availableQuantity > 0 && c.availableQuantity <= 15).length,
              },
              {
                key: 'OUT_OF_STOCK',
                label: 'Out of Stock (0)',
                count: computedCourses.filter((c) => c.availableQuantity === 0).length,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterType(tab.key)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                filterType === tab.key
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  filterType === tab.key ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Courses List */}
      {filteredCourses.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Boxes size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No courses found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || filterType !== 'ALL'
              ? 'Try modifying your search or filter.'
              : 'No courses created yet. Bundle books together into a course using "Create New Course".'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCourses.map((course) => {
            const isExpanded = expandedCourseId === course.id;

            return (
              <div
                key={course.id}
                className="bg-white rounded-xl border border-slate-200 shadow-xs hover:border-slate-300 transition-all overflow-hidden"
              >
                {/* Course Header Bar */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex-shrink-0">
                      <Boxes size={22} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 truncate">
                          {course.name}
                        </h3>
                        {course.code && (
                          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                            {course.code}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">
                          {course.items?.length || 0} component books included
                        </span>
                        <span>&bull;</span>
                        <AlertBadge stock={course.availableQuantity} size="sm" />
                      </div>
                    </div>
                  </div>

                  {/* Stock, Price & Quick Sell */}
                  <div className="flex items-center gap-3 sm:gap-4 self-end sm:self-center flex-wrap sm:flex-nowrap justify-end">
                    {/* Course Price */}
                    <div
                      onClick={() => currentUser.role === 'OWNER' && handleOpenEdit(course)}
                      title={currentUser.role === 'OWNER' ? 'Click to edit course details & price' : 'Course Price'}
                      className={`text-right group ${currentUser.role === 'OWNER' ? 'cursor-pointer' : ''}`}
                    >
                      <span className={`text-[11px] font-bold uppercase tracking-wider block transition-colors ${currentUser.role === 'OWNER' ? 'text-slate-400 group-hover:text-emerald-700' : 'text-slate-400'}`}>
                        Course Price
                      </span>
                      <span className="text-sm sm:text-base font-extrabold font-mono text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-flex items-center gap-0.5">
                        ₹{((typeof course.price === 'number' && course.price >= 0)
                          ? course.price
                          : (course.items || []).reduce((s, it) => s + (booksMap[it.bookId]?.price || 0) * it.quantityRequired, 0)
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div
                      onClick={() => currentUser.role === 'OWNER' && handleOpenEdit(course)}
                      title={currentUser.role === 'OWNER' ? 'Click to edit course details & stock' : 'Available Course Packages'}
                      className={`text-right group ${currentUser.role === 'OWNER' ? 'cursor-pointer' : ''}`}
                    >
                      <span className={`text-[11px] font-bold uppercase tracking-wider block transition-colors ${currentUser.role === 'OWNER' ? 'text-slate-400 group-hover:text-indigo-600' : 'text-slate-400'}`}>
                        Available Courses
                      </span>
                      <span
                        className={`text-2xl font-extrabold font-mono inline-block px-1 rounded transition-colors ${
                          currentUser.role === 'OWNER' ? 'group-hover:bg-indigo-50' : ''
                        } ${
                          course.availableQuantity === 0
                            ? 'text-red-600'
                            : course.availableQuantity <= 5
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {course.availableQuantity}
                      </span>
                    </div>

                    {/* SOLD Action Button */}
                    <button
                      type="button"
                      onClick={() => onQuickSellCourse(course.id)}
                      disabled={course.availableQuantity === 0}
                      className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs ${
                        course.availableQuantity === 0
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                      }`}
                    >
                      <CheckCircle size={15} />
                      <span>SOLD</span>
                    </button>

                    {/* Expand Breakdown Toggle */}
                    <button
                      type="button"
                      onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                      className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                      title={isExpanded ? 'Hide component books' : 'View component books breakdown'}
                    >
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>

                    {/* Edit / Delete (Owner) */}
                    {currentUser.role === 'OWNER' && (
                      <div className="flex items-center gap-1.5 border-l border-slate-200 pl-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(course)}
                          title="Edit course bundle, price & stock"
                          className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1"
                        >
                          <Edit2 size={13} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingCourse(course)}
                          title="Delete course"
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Component Books Breakdown (Always visible or toggleable) */}
                <div className={`border-t border-slate-100 bg-slate-50/50 p-4 sm:px-6 ${isExpanded ? 'block' : 'hidden sm:block'}`}>
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span>Component Books & Stock Limiting Factors</span>
                    <span className="text-[11px] font-normal text-slate-400">
                      Formula: MIN(floor(Stock / Required))
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {course.breakdown.map((item) => (
                      <div
                        key={item.bookId}
                        className={`p-3 rounded-lg border text-xs ${
                          item.isBottleneck
                            ? 'bg-amber-50/80 border-amber-300 text-amber-950'
                            : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-bold truncate" title={item.bookName}>
                            {item.bookName}
                          </span>
                          {item.isBottleneck && (
                            <span className="text-[10px] font-extrabold uppercase tracking-tight px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 flex-shrink-0">
                              Bottleneck
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Req: <strong>{item.requiredPerCourse}</strong> / course
                          </span>
                          <span className="font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                            ₹{booksMap[item.bookId]?.price || 0}/ea
                          </span>
                        </div>

                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Book Stock: <strong className="font-mono">{item.currentStock}</strong>
                          </span>
                        </div>

                        <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between font-mono font-bold text-[11px]">
                          <span className="text-slate-500">Allows:</span>
                          <span
                            className={
                              item.maxCoursesPossible === 0
                                ? 'text-red-600'
                                : item.isBottleneck
                                ? 'text-amber-700'
                                : 'text-slate-700'
                            }
                          >
                            {item.maxCoursesPossible} courses
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD / EDIT COURSE
          ========================================================================= */}
      <Modal
        isOpen={isAddCourseModalOpen || !!editingCourse}
        onClose={() => {
          setIsAddCourseModalOpen(false);
          setEditingCourse(null);
          setErrorMessage(null);
          setToastNotification(null);
        }}
        maxWidth="2xl"
        title={editingCourse ? 'Edit Course Bundle & Books' : 'Create New Course Bundle'}
        subtitle={
          editingCourse
            ? `Update bundle information, search & select any number of books, and set package stock.`
            : 'Add as many books as needed to this course bundle using the real-time search engine.'
        }
      >
        <form onSubmit={handleSubmitCourse} className="space-y-4">
          {errorMessage && (
            <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
              {errorMessage}
            </div>
          )}

          {toastNotification && (
            <div className="p-2.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-2 animate-in fade-in duration-150">
              <CheckCircle size={14} className="text-emerald-600 shrink-0" />
              <span>{toastNotification}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Course Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                placeholder="e.g. Class 10 Complete Course"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Course Code (Optional)
              </label>
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="e.g. C10-FULL"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Live Course Availability Banner (Dynamic from Physical Book Stock) */}
          <div className="bg-indigo-50/70 rounded-xl p-3.5 border border-indigo-200/90 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-indigo-950 uppercase tracking-wider">
                  Live Course Availability (Calculated)
                </label>
                <p className="text-[11px] text-indigo-800/80 mt-0.5">
                  Physical books are the sole inventory source of truth. Dynamic availability = <code className="font-mono text-indigo-900 bg-indigo-100/60 px-1 py-0.5 rounded">MIN(floor(stock / requiredQty))</code>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-lg text-sm font-bold font-mono border shadow-2xs ${
                    selectedItems.length === 0
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : modalLiveAvailability.availableQuantity === 0
                      ? 'bg-rose-100 text-rose-800 border-rose-200'
                      : modalLiveAvailability.availableQuantity <= 15
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                >
                  {selectedItems.length === 0 ? '0 books selected' : `${modalLiveAvailability.availableQuantity} packages available`}
                </span>
              </div>
            </div>

            {selectedItems.length > 0 && modalLiveAvailability.limitingBook && (
              <div className="pt-2 border-t border-indigo-100 text-[11px]">
                {modalLiveAvailability.availableQuantity === 0 ? (
                  <p className="text-rose-700 font-medium">
                    ⚠️ <strong>Out of Stock Bottleneck:</strong> "{modalLiveAvailability.limitingBook.name}" has only {modalLiveAvailability.limitingBook.stock} in physical stock (needs {modalLiveAvailability.limitingBook.req} per package).
                  </p>
                ) : (
                  <p className="text-slate-600">
                    ℹ️ Current assembly bottleneck: <strong className="text-slate-800">{modalLiveAvailability.limitingBook.name}</strong> ({modalLiveAvailability.limitingBook.stock} on shelf, {modalLiveAvailability.limitingBook.req} needed per course package).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Course Package Price Section */}
          <div className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-200/80 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold text-emerald-950 uppercase tracking-wider">
                  Course Package Price (₹ INR) <span className="text-red-500">*</span>
                </label>
                <p className="text-[11px] text-emerald-800/80 mt-0.5">
                  Sum of component books: <strong className="font-mono text-emerald-900">₹{standardComponentBooksSum.toLocaleString('en-IN')}</strong>. You can set or edit a package bundle price.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCoursePrice(String(standardComponentBooksSum));
                    setIsPriceCustom(false);
                  }}
                  title="Reset price to exact sum of component books"
                  className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-white hover:bg-emerald-100/50 text-emerald-800 border border-emerald-300 transition-colors shadow-2xs"
                >
                  Use Sum (₹{standardComponentBooksSum.toLocaleString('en-IN')})
                </button>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-700 font-bold text-xs">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={coursePrice}
                    onChange={(e) => {
                      setCoursePrice(e.target.value);
                      setIsPriceCustom(true);
                    }}
                    placeholder={String(standardComponentBooksSum)}
                    className="w-32 pl-6 pr-2.5 py-1.5 text-sm font-bold font-mono text-right border-2 border-emerald-300 rounded-lg bg-white text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              REAL-TIME BOOK SEARCH ENGINE SECTION
              ========================================================================= */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Search size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Real-Time Book Search Engine
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Add as many books as you want from your live catalog
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {books.length} Books in Catalog
                </span>
                {onAddBook && (
                  <button
                    type="button"
                    onClick={() => setIsQuickCreateOpen(!isQuickCreateOpen)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md border border-indigo-200 transition-colors flex items-center gap-1"
                  >
                    <Plus size={12} />
                    <span>{isQuickCreateOpen ? 'Close Creator' : 'New Book'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Create Book Form Drawer (if needed on the fly) */}
            {isQuickCreateOpen && onAddBook && (
              <div className="p-3 bg-white rounded-lg border border-indigo-200 shadow-xs space-y-2.5 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-indigo-600" />
                    Quick Add Book to Inventory & Course
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsQuickCreateOpen(false)}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Book Title *"
                      value={quickBookName}
                      onChange={(e) => setQuickBookName(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="SKU / Code"
                      value={quickBookCode}
                      onChange={(e) => setQuickBookCode(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      placeholder="Stock (Default: 10)"
                      value={quickBookStock}
                      onChange={(e) => setQuickBookStock(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Price (₹ INR)"
                      value={quickBookPrice}
                      onChange={(e) => setQuickBookPrice(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Author (Optional)"
                      value={quickBookAuthor}
                      onChange={(e) => setQuickBookAuthor(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      placeholder="Publisher (Optional)"
                      value={quickBookPublisher}
                      onChange={(e) => setQuickBookPublisher(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isQuickCreating || !quickBookName.trim()}
                      onClick={handleQuickCreateBook}
                      className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded shadow-xs text-center text-xs"
                    >
                      {isQuickCreating ? 'Creating...' : 'Create Book'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Real-Time Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={bookSearchQuery}
                onChange={(e) => setBookSearchQuery(e.target.value)}
                placeholder="Type to search books by title, code, author, or publisher in real time..."
                className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder:text-slate-400"
              />
              {bookSearchQuery && (
                <button
                  type="button"
                  onClick={() => setBookSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Filter Tabs and Batch Add Action */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1 text-[11px] overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setBookSearchFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    bookSearchFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  All ({books.length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookSearchFilter('NOT_ADDED')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    bookSearchFilter === 'NOT_ADDED'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Not in Course ({books.filter((b) => !selectedBookIdsSet.has(b.id)).length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookSearchFilter('IN_STOCK')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    bookSearchFilter === 'IN_STOCK'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  In Stock ({books.filter((b) => (Number(b.stock) || 0) > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setBookSearchFilter('ADDED')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    bookSearchFilter === 'ADDED'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  In Course ({selectedItems.length})
                </button>
              </div>

              {/* Batch Add All Filtered Books Button */}
              {filteredCatalogBooks.some((b) => !selectedBookIdsSet.has(b.id)) && (
                <button
                  type="button"
                  onClick={handleAddAllFilteredBooks}
                  className="text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 shadow-xs"
                >
                  <Plus size={12} />
                  <span>
                    Add All ({filteredCatalogBooks.filter((b) => !selectedBookIdsSet.has(b.id)).length}) Filtered Books
                  </span>
                </button>
              )}
            </div>

            {/* Real-time Search Results List */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-xs">
              <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
                {filteredCatalogBooks.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    {bookSearchQuery
                      ? `No books match "${bookSearchQuery}". Try a different term or create a new book.`
                      : 'No books available in this filter.'}
                  </div>
                ) : (
                  filteredCatalogBooks.map((book) => {
                    const isAdded = selectedBookIdsSet.has(book.id);
                    const selectedItem = selectedItems.find((i) => i.bookId === book.id);
                    const stockNum = Number(book.stock) || 0;

                    return (
                      <div
                        key={book.id}
                        className={`p-2.5 flex items-center justify-between gap-3 transition-colors ${
                          isAdded ? 'bg-indigo-50/40 hover:bg-indigo-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {book.name}
                            </span>
                            {book.code && (
                              <span className="px-1.5 py-0.2 text-[10px] font-mono font-medium rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {book.code}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.2 text-[10px] font-medium rounded ${
                                stockNum > 15
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : stockNum > 0
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {stockNum > 0 ? `${stockNum} in stock` : 'Out of stock'}
                            </span>
                          </div>
                          {(book.author || book.publisher) && (
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {book.author && <span>By {book.author}</span>}
                              {book.author && book.publisher && <span> • </span>}
                              {book.publisher && <span>{book.publisher}</span>}
                            </div>
                          )}
                        </div>

                        {/* Interactive Selection Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isAdded && selectedItem ? (
                            <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded-md border border-indigo-200 shadow-xs">
                              <span className="text-[11px] font-bold text-indigo-700 mr-1 flex items-center gap-0.5">
                                <Check size={12} className="text-indigo-600" />
                                Included ({selectedItem.quantityRequired})
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdjustQuantity(book.id, -1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                title="Decrease required quantity"
                              >
                                <Minus size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustQuantity(book.id, 1)}
                                className="w-5 h-5 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                                title="Increase required quantity"
                              >
                                <Plus size={11} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveBook(book.id)}
                                className="w-5 h-5 rounded flex items-center justify-center text-red-500 hover:bg-red-50 ml-0.5"
                                title="Remove from course"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddBookToCourse(book, 1)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-md transition-colors flex items-center gap-1 shadow-xs"
                            >
                              <Plus size={13} />
                              <span>Add to Course</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* =========================================================================
              SELECTED BOOKS IN COURSE BUNDLE
              ========================================================================= */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <BookOpen size={14} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Books Included in Course Bundle <span className="text-red-500">*</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {selectedItems.length} books selected • {totalBundleCopiesCount} total book copies per bundle
                  </p>
                </div>
              </div>

              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2">
                  {selectedItems.length > 4 && (
                    <input
                      type="text"
                      placeholder="Filter included books..."
                      value={includedSearchQuery}
                      onChange={(e) => setIncludedSearchQuery(e.target.value)}
                      className="px-2 py-0.5 text-[11px] border border-slate-200 rounded bg-white w-36 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleClearAllBooks}
                    className="text-[11px] font-semibold text-red-600 hover:text-red-800 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              )}
            </div>

            {selectedItems.length === 0 ? (
              <div className="p-6 rounded-lg bg-white border border-dashed border-slate-300 text-center space-y-2">
                <BookOpen size={24} className="mx-auto text-slate-400" />
                <p className="text-xs font-semibold text-slate-700">
                  No books added to this course bundle yet.
                </p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Use the Real-Time Book Search Engine above to search by name or code and click "+ Add to Course".
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1 divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 p-1.5 shadow-xs">
                {filteredIncludedItems.map((item, index) => {
                  const book = booksMap[item.bookId];
                  const currentPhysicalStock = book ? Number(book.stock) || 0 : 0;
                  const packagesSupported = Math.floor(currentPhysicalStock / Math.max(1, item.quantityRequired));

                  return (
                    <div
                      key={item.bookId}
                      className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 transition-colors rounded"
                    >
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {item.bookName}
                            </span>
                            {book?.code && (
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1 rounded">
                                {book.code}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>Physical Stock: <strong className="text-slate-700">{currentPhysicalStock}</strong></span>
                            <span
                              className={
                                packagesSupported === 0
                                  ? 'text-rose-700 font-semibold'
                                  : packagesSupported <= 15
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-emerald-700 font-semibold'
                              }
                            >
                              • Supports {packagesSupported} {packagesSupported === 1 ? 'package' : 'packages'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-500">Req Copies:</span>
                          <div className="flex items-center border border-slate-300 rounded bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleAdjustQuantity(item.bookId, -1)}
                              disabled={item.quantityRequired <= 1}
                              className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30 rounded-l"
                              title="Decrease"
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              required
                              value={item.quantityRequired}
                              onChange={(e) => handleSetQuantity(item.bookId, e.target.value)}
                              className="w-11 py-0.5 text-xs font-mono font-bold text-center focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleAdjustQuantity(item.bookId, 1)}
                              className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded-r"
                              title="Increase"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveBook(item.bookId)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
                          title="Remove book from course"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsAddCourseModalOpen(false);
                setEditingCourse(null);
                setToastNotification(null);
              }}
              className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || selectedItems.length === 0}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-xs"
            >
              {isSubmitting ? 'Saving Course...' : editingCourse ? 'Update Course' : 'Create Course'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL: DELETE COURSE
          ========================================================================= */}
      <Modal
        isOpen={!!deletingCourse}
        onClose={() => setDeletingCourse(null)}
        title="Delete Course Bundle"
        subtitle={`Confirm deletion of "${deletingCourse?.name}"`}
      >
        {deletingCourse && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Are you sure you want to delete <strong>{deletingCourse.name}</strong>?
              Deleting the course does not delete the component books; only the course bundle definition is removed.
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingCourse(null)}
                className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-xs"
              >
                {isSubmitting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
