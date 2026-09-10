import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Plus,
  Edit2,
  Trash2,
  PackagePlus,
  SlidersHorizontal,
  CheckCircle,
  AlertTriangle,
  Info,
  Sliders,
  Filter,
  IndianRupee,
} from 'lucide-react';
import { Book, AppUser } from '../types';
import { AlertBadge } from './AlertBadge';
import { Modal } from './Modal';
import { formatDatabaseError } from '../services/db';

interface BooksViewProps {
  books: Book[];
  currentUser: AppUser;
  onAddBook: (data: { name: string; code?: string; author?: string; publisher?: string; stock: number; price?: number }) => Promise<void>;
  onUpdateBook: (id: string, data: { name: string; code?: string; author?: string; publisher?: string; stock?: number; price?: number; prevStock?: number }) => Promise<void>;
  onDeleteBook: (id: string) => Promise<void>;
  onAddStock: (bookId: string, quantity: number, notes?: string) => Promise<void>;
  onAdjustStock: (bookId: string, delta: number, notes: string) => Promise<void>;
  onQuickSellBook: (bookId: string) => void;
  selectedBookForAddStock?: Book | null;
  onCloseAddStockModal?: () => void;
}

type FilterType = 'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export const BooksView: React.FC<BooksViewProps> = ({
  books,
  currentUser,
  onAddBook,
  onUpdateBook,
  onDeleteBook,
  onAddStock,
  onAdjustStock,
  onQuickSellBook,
  selectedBookForAddStock,
  onCloseAddStockModal,
}) => {
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('ALL');

  // Modals state
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [stockModalBook, setStockModalBook] = useState<Book | null>(
    selectedBookForAddStock || null
  );
  const [adjustModalBook, setAdjustModalBook] = useState<Book | null>(null);
  const [deletingBook, setDeletingBook] = useState<Book | null>(null);

  // Form states
  const [bookForm, setBookForm] = useState({
    name: '',
    code: '',
    author: '',
    publisher: '',
    stock: '10',
    price: '0',
  });
  const [addStockQuantity, setAddStockQuantity] = useState('10');
  const [addStockNotes, setAddStockNotes] = useState('');

  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [confirmReduction, setConfirmReduction] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If parent opens add stock modal
  React.useEffect(() => {
    if (selectedBookForAddStock) {
      setStockModalBook(selectedBookForAddStock);
      setAddStockQuantity('10');
      setAddStockNotes('');
      setErrorMessage(null);
    }
  }, [selectedBookForAddStock]);

  // Filtered books
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      // Search matching name, code, author, publisher
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        book.name.toLowerCase().includes(query) ||
        (book.code && book.code.toLowerCase().includes(query)) ||
        (book.author && book.author.toLowerCase().includes(query)) ||
        (book.publisher && book.publisher.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Filter tabs
      if (filterType === 'IN_STOCK') return book.stock > 0;
      if (filterType === 'LOW_STOCK') return book.stock > 0 && book.stock <= 15;
      if (filterType === 'OUT_OF_STOCK') return book.stock === 0;

      return true;
    });
  }, [books, searchQuery, filterType]);

  // Handlers
  const handleOpenAddBook = () => {
    setBookForm({
      name: '',
      code: '',
      author: '',
      publisher: '',
      stock: '10',
      price: '0',
    });
    setErrorMessage(null);
    setIsAddBookModalOpen(true);
  };

  const handleOpenEditBook = (book: Book) => {
    setEditingBook(book);
    setBookForm({
      name: book.name,
      code: book.code || '',
      author: book.author || '',
      publisher: book.publisher || '',
      stock: String(book.stock),
      price: book.price !== undefined && book.price !== null ? String(book.price) : '0',
    });
    setErrorMessage(null);
  };

  const handleOpenAddStock = (book: Book) => {
    setStockModalBook(book);
    setAddStockQuantity('10');
    setAddStockNotes('');
    setErrorMessage(null);
  };

  const handleOpenAdjustStock = (book: Book) => {
    setAdjustModalBook(book);
    setAdjustDelta('0');
    setAdjustNotes('');
    setConfirmReduction(false);
    setErrorMessage(null);
  };

  const handleSaveBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookForm.name.trim()) {
      setErrorMessage('Book Name is required.');
      return;
    }

    const stockNum = parseInt(bookForm.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setErrorMessage('Stock must be a non-negative whole number (0 or higher).');
      return;
    }

    const priceNum = parseFloat(bookForm.price);
    const validPrice = isNaN(priceNum) || priceNum < 0 ? 0 : priceNum;

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      if (editingBook) {
        const bookId = editingBook.id;
        const payload = {
          name: bookForm.name.trim(),
          code: bookForm.code.trim(),
          author: bookForm.author.trim(),
          publisher: bookForm.publisher.trim(),
          stock: stockNum,
          price: validPrice,
        };
        await onUpdateBook(bookId, payload);
        setEditingBook(null);
      } else {
        const payload = {
          name: bookForm.name.trim(),
          code: bookForm.code.trim(),
          author: bookForm.author.trim(),
          publisher: bookForm.publisher.trim(),
          stock: stockNum,
          price: validPrice,
        };
        await onAddBook(payload);
        setIsAddBookModalOpen(false);
      }
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockModalBook) return;

    const qty = parseInt(addStockQuantity, 10);
    if (isNaN(qty) || qty <= 0) {
      setErrorMessage('Added quantity must be a positive whole number greater than 0.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const bookId = stockModalBook.id;
      setStockModalBook(null);
      if (onCloseAddStockModal) onCloseAddStockModal();
      await onAddStock(bookId, qty, addStockNotes);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustModalBook) return;

    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) {
      setErrorMessage('Adjustment delta must be a non-zero whole number (+ or -).');
      return;
    }

    if (adjustModalBook.stock + delta < 0) {
      setErrorMessage(
        `Cannot adjust stock by ${delta}. Resulting stock would be negative (${adjustModalBook.stock + delta}). Stock cannot be negative.`
      );
      return;
    }

    if (delta < 0 && !confirmReduction) {
      setErrorMessage('Please confirm the checkbox to authorize this stock reduction adjustment.');
      return;
    }

    if (!adjustNotes.trim()) {
      setErrorMessage('A reason / note is required for all stock adjustments to ensure audit traceability.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const bookId = adjustModalBook.id;
      setAdjustModalBook(null);
      await onAdjustStock(bookId, delta, adjustNotes);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingBook) return;
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const bookId = deletingBook.id;
      setDeletingBook(null);
      await onDeleteBook(bookId);
    } catch (err: any) {
      setErrorMessage(formatDatabaseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <BookOpen className="text-indigo-600" size={26} />
            <span>Books Inventory</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Single source of truth for physical inventory. Maintain accurate physical stock counts.
          </p>
        </div>

        {currentUser.role === 'OWNER' && (
          <button
            onClick={handleOpenAddBook}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus size={18} />
            <span>Add New Book</span>
          </button>
        )}
      </div>

      {/* Search Bar & Filter Tabs */}
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
            placeholder="Search by book name, code / SKU, or author..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
            <Filter size={12} />
            Filter:
          </span>
          {(
            [
              { key: 'ALL', label: 'All Books', count: books.length },
              {
                key: 'IN_STOCK',
                label: 'In Stock (>0)',
                count: books.filter((b) => b.stock > 0).length,
              },
              {
                key: 'LOW_STOCK',
                label: 'Low Stock (1-15)',
                count: books.filter((b) => b.stock > 0 && b.stock <= 15).length,
              },
              {
                key: 'OUT_OF_STOCK',
                label: 'Out of Stock (0)',
                count: books.filter((b) => b.stock === 0).length,
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

      {/* Books Table / Cards Grid */}
      {filteredBooks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <BookOpen size={36} className="text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No books found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchQuery || filterType !== 'ALL'
              ? 'Try modifying your search query or switching the filter.'
              : 'No books have been added yet. Click "Add New Book" to start.'}
          </p>
          {(searchQuery || filterType !== 'ALL') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterType('ALL');
              }}
              className="mt-4 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6">Book Title & Details</th>
                  <th className="py-3 px-4">Code / SKU</th>
                  <th className="py-3 px-4">Price (₹ INR)</th>
                  <th className="py-3 px-4 text-center">Stock Count</th>
                  <th className="py-3 px-4">Stock Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredBooks.map((book) => {
                  return (
                    <tr
                      key={book.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      {/* Title & Author */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                          {book.name}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                          {book.author && <span>Author: {book.author}</span>}
                          {book.publisher && <span>Pub: {book.publisher}</span>}
                        </div>
                      </td>

                      {/* Code */}
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                        {book.code || '—'}
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4">
                        <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs inline-flex items-center gap-0.5">
                          ₹{(book.price || 0).toLocaleString('en-IN')}
                        </span>
                      </td>

                      {/* Stock Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`text-lg font-extrabold font-mono inline-block px-3 py-0.5 rounded-lg ${
                            book.stock === 0
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : book.stock <= 5
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {book.stock}
                        </span>
                      </td>

                      {/* Stock Status */}
                      <td className="py-3.5 px-4">
                        <AlertBadge stock={book.stock} size="sm" />
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Add Stock Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenAddStock(book)}
                            title="Add stock copies"
                            className="px-2.5 py-1.5 text-xs font-bold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1"
                          >
                            <PackagePlus size={14} />
                            <span>Add Stock</span>
                          </button>

                          {/* Quick Sold Button */}
                          <button
                            type="button"
                            onClick={() => onQuickSellBook(book.id)}
                            disabled={book.stock === 0}
                            title={book.stock === 0 ? 'Out of Stock' : 'Mark as Sold'}
                            className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors ${
                              book.stock === 0
                                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                            }`}
                          >
                            <CheckCircle size={14} />
                            <span>SOLD</span>
                          </button>

                          {/* Adjust Stock Button (Audit correction) */}
                          <button
                            type="button"
                            onClick={() => handleOpenAdjustStock(book)}
                            title="Adjust stock (audit correction)"
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Sliders size={15} />
                          </button>

                          {/* Edit Book (Owner only) */}
                          {currentUser.role === 'OWNER' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditBook(book)}
                              title="Edit book details"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Edit2 size={15} />
                            </button>
                          )}

                          {/* Delete Book (Owner only with safety check) */}
                          {currentUser.role === 'OWNER' && (
                            <button
                              type="button"
                              onClick={() => {
                                setDeletingBook(book);
                                setErrorMessage(null);
                              }}
                              title="Delete book"
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: ADD NEW BOOK / EDIT BOOK
          ========================================================================= */}
      <Modal
        isOpen={isAddBookModalOpen || !!editingBook}
        onClose={() => {
          setIsAddBookModalOpen(false);
          setEditingBook(null);
          setErrorMessage(null);
        }}
        title={editingBook ? 'Edit Book & Stock' : 'Add New Book to Inventory'}
        subtitle={
          editingBook
            ? `Update catalog details and adjust physical stock count for "${editingBook.name}"`
            : 'Register a new physical book title into the bookstore catalog.'
        }
      >
        <form onSubmit={handleSaveBook} className="space-y-4">
          {errorMessage && (
            <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
              {errorMessage}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Book Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={bookForm.name}
              onChange={(e) => setBookForm({ ...bookForm, name: e.target.value })}
              placeholder="e.g. NCERT Mathematics Class 10"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Book Code / SKU (Optional)
              </label>
              <input
                type="text"
                value={bookForm.code}
                onChange={(e) => setBookForm({ ...bookForm, code: e.target.value })}
                placeholder="e.g. MATH-C10"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Author (Optional)
              </label>
              <input
                type="text"
                value={bookForm.author}
                onChange={(e) => setBookForm({ ...bookForm, author: e.target.value })}
                placeholder="e.g. NCERT Editorial Board"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Publisher (Optional)
            </label>
            <input
              type="text"
              value={bookForm.publisher}
              onChange={(e) => setBookForm({ ...bookForm, publisher: e.target.value })}
              placeholder="e.g. National Council of Educational Research"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Selling Price (₹ INR) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Selling Price (₹ INR) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-700 font-bold text-sm">
                ₹
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={bookForm.price}
                onChange={(e) => setBookForm({ ...bookForm, price: e.target.value })}
                placeholder="0.00"
                className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Price in Indian Rupees. When this book is sold individually or in a course, this price calculates total revenue.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                {editingBook ? 'Stock Quantity (Units)' : 'Initial Stock Quantity'} <span className="text-red-500">*</span>
              </label>
              {editingBook && (
                <span className="text-[11px] text-slate-500 font-medium">
                  Current database stock: <strong className="text-slate-800 font-mono">{editingBook.stock}</strong>
                </span>
              )}
            </div>
            <input
              type="number"
              min="0"
              step="1"
              required
              value={bookForm.stock}
              onChange={(e) => setBookForm({ ...bookForm, stock: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="0"
            />
            {editingBook && !isNaN(parseInt(bookForm.stock, 10)) && parseInt(bookForm.stock, 10) !== editingBook.stock && (
              <div className="text-[11px] font-semibold text-indigo-600 mt-1 flex items-center gap-1.5">
                <span>Stock adjustment:</span>
                <span className={parseInt(bookForm.stock, 10) > editingBook.stock ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
                  {editingBook.stock} → {bookForm.stock} ({parseInt(bookForm.stock, 10) - editingBook.stock > 0 ? `+${parseInt(bookForm.stock, 10) - editingBook.stock}` : parseInt(bookForm.stock, 10) - editingBook.stock} units)
                </span>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-1">
              Whole numbers only (0 or higher). Type any new quantity to immediately update inventory count.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsAddBookModalOpen(false);
                setEditingBook(null);
              }}
              className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
            >
              {isSubmitting ? 'Saving...' : editingBook ? 'Update Book' : 'Save Book'}
            </button>
          </div>
        </form>
      </Modal>

      {/* =========================================================================
          MODAL: ADD STOCK (newStock = currentStock + quantityAdded)
          ========================================================================= */}
      <Modal
        isOpen={!!stockModalBook}
        onClose={() => {
          setStockModalBook(null);
          if (onCloseAddStockModal) onCloseAddStockModal();
          setErrorMessage(null);
        }}
        title="Add Stock"
        subtitle={`Adding physical stock to: ${stockModalBook?.name}`}
      >
        {stockModalBook && (
          <form onSubmit={handleSaveAddStock} className="space-y-4">
            {errorMessage && (
              <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
                {errorMessage}
              </div>
            )}

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 block font-medium">Current Stock</span>
                <span className="text-2xl font-extrabold font-mono text-slate-900">
                  {stockModalBook.stock}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block font-medium">New Stock After Addition</span>
                <span className="text-2xl font-extrabold font-mono text-indigo-600">
                  {stockModalBook.stock + (parseInt(addStockQuantity, 10) || 0)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Quantity to Add <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={addStockQuantity}
                onChange={(e) => setAddStockQuantity(e.target.value)}
                placeholder="Enter positive whole number (e.g. 10, 50)"
                className="w-full px-3 py-2 text-base font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <div className="flex items-center gap-2 mt-2">
                {[5, 10, 25, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAddStockQuantity(String(preset))}
                    className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    +{preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Note / Delivery Details (Optional)
              </label>
              <input
                type="text"
                value={addStockNotes}
                onChange={(e) => setAddStockNotes(e.target.value)}
                placeholder="e.g. Delivery from NCERT distributor"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setStockModalBook(null);
                  if (onCloseAddStockModal) onCloseAddStockModal();
                }}
                className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                {isSubmitting ? 'Adding Stock...' : 'Confirm Stock Addition'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* =========================================================================
          MODAL: STOCK ADJUSTMENT (+ or -)
          ========================================================================= */}
      <Modal
        isOpen={!!adjustModalBook}
        onClose={() => {
          setAdjustModalBook(null);
          setErrorMessage(null);
        }}
        title="Adjust Inventory Stock"
        subtitle={`Audit correction for: ${adjustModalBook?.name}`}
      >
        {adjustModalBook && (
          <form onSubmit={handleSaveAdjustStock} className="space-y-4">
            {errorMessage && (
              <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200">
                {errorMessage}
              </div>
            )}

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-700 flex-shrink-0 mt-0.5" />
              <span>
                Stock adjustments update physical inventory for audit corrections (e.g. damaged copies or manual discrepancy). Every adjustment is permanently recorded in Inventory History.
              </span>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 block font-medium">Current Stock</span>
                <span className="text-2xl font-extrabold font-mono text-slate-900">
                  {adjustModalBook.stock}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block font-medium">New Stock After Adjustment</span>
                <span
                  className={`text-2xl font-extrabold font-mono ${
                    adjustModalBook.stock + (parseInt(adjustDelta, 10) || 0) < 0
                      ? 'text-red-600'
                      : 'text-indigo-600'
                  }`}
                >
                  {adjustModalBook.stock + (parseInt(adjustDelta, 10) || 0)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Adjustment Delta (+ or -) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="1"
                required
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="e.g. +2 or -2"
                className="w-full px-3 py-2 text-base font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <div className="flex items-center gap-2 mt-2">
                {[-5, -2, -1, 1, 2, 5].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAdjustDelta(String(preset))}
                    className="px-2 py-1 text-xs font-bold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    {preset > 0 ? `+${preset}` : preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reason / Note for Adjustment <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
                placeholder="e.g. Damaged during monsoon; Physical audit recount correction"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            {/* Confirmation required for reductions */}
            {parseInt(adjustDelta, 10) < 0 && (
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmReduction}
                  onChange={(e) => setConfirmReduction(e.target.checked)}
                  className="mt-0.5 rounded text-red-600 focus:ring-red-500"
                />
                <span className="text-xs font-semibold text-red-900">
                  I confirm reducing inventory stock by {Math.abs(parseInt(adjustDelta, 10) || 0)} copies. This action cannot be silently undone.
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAdjustModalBook(null)}
                className="px-4 py-2 text-xs font-bold rounded-lg text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                {isSubmitting ? 'Adjusting...' : 'Save Stock Adjustment'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* =========================================================================
          MODAL: DELETE BOOK (Checks course dependency!)
          ========================================================================= */}
      <Modal
        isOpen={!!deletingBook}
        onClose={() => {
          setDeletingBook(null);
          setErrorMessage(null);
        }}
        title="Delete Book"
        subtitle={`Confirm deletion of "${deletingBook?.name}"`}
      >
        {deletingBook && (
          <div className="space-y-4">
            {errorMessage ? (
              <div className="p-3 text-xs font-semibold rounded-lg bg-red-50 text-red-800 border border-red-200">
                {errorMessage}
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Are you sure you want to delete <strong>{deletingBook.name}</strong> from the catalog? If this book is part of any Course, deletion will be blocked to protect course bundle integrity.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingBook(null)}
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
