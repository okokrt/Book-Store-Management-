import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Book, Course, Sale, InventoryTransaction, StoreSettings, SaleLineItem, DeductedBook } from '../src/types';

interface LocalDatabaseState {
  books: Book[];
  courses: Course[];
  sales: Sale[];
  inventoryTransactions: InventoryTransaction[];
  settings: StoreSettings;
  nextSaleNumber: number;
}

const DATA_DIR = process.env.VERCEL
  ? path.resolve('/tmp', 'kashi_data')
  : path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'store.json');

const DEFAULT_STATE: LocalDatabaseState = {
  books: [],
  courses: [],
  sales: [],
  inventoryTransactions: [],
  settings: {
    storeName: 'Kashi Walla Book Management',
    storePhone: '',
    storeAddress: '',
    storeEmail: '',
    updatedAt: new Date().toISOString(),
  },
  nextSaleNumber: 1001,
};

let memoryState: LocalDatabaseState | null = null;

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    // Non-fatal, memory state will remain active
  }
}

function loadState(): LocalDatabaseState {
  if (memoryState) return memoryState;
  ensureDataDir();

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      memoryState = {
        books: Array.isArray(parsed.books) ? parsed.books : [],
        courses: Array.isArray(parsed.courses) ? parsed.courses : [],
        sales: Array.isArray(parsed.sales) ? parsed.sales : [],
        inventoryTransactions: Array.isArray(parsed.inventoryTransactions) ? parsed.inventoryTransactions : [],
        settings: parsed.settings || DEFAULT_STATE.settings,
        nextSaleNumber: typeof parsed.nextSaleNumber === 'number' ? parsed.nextSaleNumber : 1001,
      };
      return memoryState;
    } catch (err) {
      console.warn('[LocalDb] Failed to read store.json, creating clean store:', err);
    }
  }

  memoryState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  saveState();
  return memoryState!;
}

function saveState(): void {
  if (!memoryState) return;
  try {
    ensureDataDir();
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(memoryState, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    // Non-fatal on serverless / read-only filesystems (e.g. Vercel), in-memory state persists
  }
}

function generateId(): string {
  return crypto.randomBytes(10).toString('hex');
}

/* ==========================================================================
   PUBLIC LOCAL DB INTERFACE
   ========================================================================== */

export const localDb = {
  getAllData() {
    const state = loadState();
    return {
      books: state.books,
      courses: state.courses,
      sales: state.sales,
      transactions: state.inventoryTransactions,
      settings: state.settings,
    };
  },

  getSettings(): StoreSettings {
    return loadState().settings;
  },

  updateSettings(updates: Partial<StoreSettings>): StoreSettings {
    const state = loadState();
    state.settings = {
      ...state.settings,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    saveState();
    return state.settings;
  },

  // Books
  getBooks(): Book[] {
    return loadState().books;
  },

  getBook(id: string): Book | undefined {
    return loadState().books.find((b) => b.id === id);
  },

  createBook(
    data: {
      name: string;
      code?: string;
      author?: string;
      publisher?: string;
      price?: number;
      stock: number;
    },
    initialNotes?: string,
    userName = 'Store Owner',
    userId = 'owner_primary'
  ): Book {
    const state = loadState();
    const now = new Date().toISOString();
    const id = generateId();

    const newBook: Book = {
      id,
      name: data.name.trim(),
      code: data.code?.trim() || '',
      author: data.author?.trim() || '',
      publisher: data.publisher?.trim() || '',
      price: data.price !== undefined ? Math.max(0, Number(data.price)) : 0,
      stock: Math.max(0, Math.floor(Number(data.stock))),
      createdAt: now,
      updatedAt: now,
    };

    state.books.push(newBook);
    state.books.sort((a, b) => a.name.localeCompare(b.name));

    if (newBook.stock > 0) {
      const trans: InventoryTransaction = {
        id: generateId(),
        bookId: newBook.id,
        bookName: newBook.name,
        type: 'stock_added',
        quantity: newBook.stock,
        previousStock: 0,
        newStock: newBook.stock,
        referenceType: 'restock',
        userId,
        userName,
        notes: initialNotes || 'Initial inventory count on item entry',
        createdAt: now,
      };
      state.inventoryTransactions.unshift(trans);
    }

    saveState();
    return newBook;
  },

  updateBook(id: string, updates: Partial<Book> & { stock?: number; notes?: string }): Book {
    const state = loadState();
    const bookIndex = state.books.findIndex((b) => b.id === id);
    if (bookIndex === -1) throw new Error(`Book not found with ID ${id}`);

    const existing = state.books[bookIndex];
    const prevStock = typeof existing.stock === 'number' ? existing.stock : 0;
    let nextStock = prevStock;

    if (updates.stock !== undefined && updates.stock !== null) {
      const parsedStock = Math.max(0, Math.floor(Number(updates.stock)));
      if (!isNaN(parsedStock)) {
        nextStock = parsedStock;
        if (nextStock !== prevStock) {
          const trans: InventoryTransaction = {
            id: generateId(),
            bookId: existing.id,
            bookName: (updates.name || existing.name).trim(),
            type: nextStock > prevStock ? 'stock_added' : 'stock_adjustment',
            quantity: nextStock - prevStock,
            previousStock: prevStock,
            newStock: nextStock,
            referenceType: 'adjustment',
            userId: 'owner_primary',
            userName: 'Store Owner',
            notes: updates.notes || 'Stock updated via book edit',
            createdAt: new Date().toISOString(),
          };
          state.inventoryTransactions.unshift(trans);
        }
      }
    }

    const updated: Book = {
      ...existing,
      ...updates,
      stock: nextStock,
      updatedAt: new Date().toISOString(),
    };

    // If book name changed, propagate the new name to all course bundles containing this book
    if (updates.name && updates.name.trim() !== existing.name) {
      const trimmedNewName = updates.name.trim();
      for (const course of state.courses) {
        let changed = false;
        for (const item of course.items) {
          if (item.bookId === id) {
            item.bookName = trimmedNewName;
            changed = true;
          }
        }
        if (changed) {
          course.updatedAt = new Date().toISOString();
        }
      }
    }

    state.books[bookIndex] = updated;
    state.books.sort((a, b) => a.name.localeCompare(b.name));
    saveState();
    return updated;
  },

  deleteBook(id: string): void {
    const state = loadState();
    state.books = state.books.filter((b) => b.id !== id);
    saveState();
  },

  addStock(
    bookId: string,
    quantity: number,
    notes?: string,
    userName = 'Store Owner',
    userId = 'owner_primary'
  ): { book: Book; transaction: InventoryTransaction } {
    const state = loadState();
    const book = state.books.find((b) => b.id === bookId);
    if (!book) throw new Error(`Book not found with ID ${bookId}`);

    const addQty = Math.max(1, Math.floor(quantity));
    const prev = book.stock;
    book.stock = prev + addQty;
    book.updatedAt = new Date().toISOString();

    const trans: InventoryTransaction = {
      id: generateId(),
      bookId: book.id,
      bookName: book.name,
      type: 'stock_added',
      quantity: addQty,
      previousStock: prev,
      newStock: book.stock,
      referenceType: 'restock',
      userId,
      userName,
      notes: notes || `Restocked ${addQty} units`,
      createdAt: new Date().toISOString(),
    };

    state.inventoryTransactions.unshift(trans);
    saveState();
    return { book, transaction: trans };
  },

  adjustStock(
    bookId: string,
    delta: number,
    notes: string,
    userName = 'Store Owner',
    userId = 'owner_primary'
  ): { book: Book; transaction: InventoryTransaction } {
    const state = loadState();
    const book = state.books.find((b) => b.id === bookId);
    if (!book) throw new Error(`Book not found with ID ${bookId}`);

    const intDelta = Math.floor(delta);
    if (intDelta === 0) throw new Error('Stock adjustment delta cannot be 0.');

    const prev = book.stock;
    const next = Math.max(0, prev + intDelta);
    book.stock = next;
    book.updatedAt = new Date().toISOString();

    const trans: InventoryTransaction = {
      id: generateId(),
      bookId: book.id,
      bookName: book.name,
      type: 'stock_adjustment',
      quantity: intDelta,
      previousStock: prev,
      newStock: next,
      referenceType: 'adjustment',
      userId,
      userName,
      notes: notes || 'Manual inventory stock count adjustment',
      createdAt: new Date().toISOString(),
    };

    state.inventoryTransactions.unshift(trans);
    saveState();
    return { book, transaction: trans };
  },

  // Courses
  getCourses(): Course[] {
    return loadState().courses;
  },

  getCourse(id: string): Course | undefined {
    return loadState().courses.find((c) => c.id === id);
  },

  createCourse(data: {
    name: string;
    code?: string;
    price?: number;
    items: Array<{ bookId: string; bookName: string; quantityRequired: number }>;
  }): Course {
    const state = loadState();
    const now = new Date().toISOString();
    const id = generateId();

    for (const it of data.items) {
      const b = state.books.find((book) => book.id === it.bookId);
      if (!b) throw new Error(`Referenced component book with ID "${it.bookId}" does not exist in inventory.`);
    }

    const newCourse: Course = {
      id,
      name: data.name.trim(),
      code: data.code?.trim() || '',
      price: data.price !== undefined && data.price !== null ? Math.max(0, Number(data.price)) : undefined,
      items: data.items.map((it) => {
        const b = state.books.find((book) => book.id === it.bookId)!;
        return {
          bookId: it.bookId,
          bookName: b.name,
          quantityRequired: Math.max(1, Math.floor(Number(it.quantityRequired))),
        };
      }),
      createdAt: now,
      updatedAt: now,
    };

    state.courses.push(newCourse);
    state.courses.sort((a, b) => a.name.localeCompare(b.name));
    saveState();
    return newCourse;
  },

  updateCourse(id: string, updates: Partial<Course> & { price?: number | null }): Course {
    const state = loadState();
    const idx = state.courses.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Course not found with ID ${id}`);

    if (updates.items) {
      for (const it of updates.items) {
        const b = state.books.find((book) => book.id === it.bookId);
        if (!b) throw new Error(`Referenced component book with ID "${it.bookId}" does not exist in inventory.`);
        it.bookName = b.name;
        it.quantityRequired = Math.max(1, Math.floor(Number(it.quantityRequired)));
      }
    }

    const existing = state.courses[idx];
    let resolvedPrice = existing.price;
    if (updates.price !== undefined) {
      resolvedPrice = updates.price === null ? undefined : Math.max(0, Number(updates.price));
    }

    const updated: Course = {
      ...existing,
      ...updates,
      price: resolvedPrice,
      updatedAt: new Date().toISOString(),
    };

    state.courses[idx] = updated;
    state.courses.sort((a, b) => a.name.localeCompare(b.name));
    saveState();
    return updated;
  },

  deleteCourse(id: string): void {
    const state = loadState();
    state.courses = state.courses.filter((c) => c.id !== id);
    saveState();
  },

  // Sales (with multi-item support and transactional stock deduction)
  getSales(): Sale[] {
    return loadState().sales;
  },

  createSale(
    items: Array<{
      id: string;
      type: 'Book' | 'Course';
      name: string;
      code?: string;
      quantity: number;
      unitPrice?: number;
      totalPrice?: number;
    }>,
    customTotalPrice?: number,
    notes?: string,
    userName = 'Store Owner',
    userId = 'owner_primary',
    userRole = 'OWNER'
  ): Sale {
    const state = loadState();
    if (!items || items.length === 0) {
      throw new Error('Cannot record sale with empty item list.');
    }

    // Step 1: Calculate aggregate stock requirements for all books
    const bookDeductions: Record<string, { book: Book; totalRequired: number }> = {};

    for (const item of items) {
      const qty = Math.max(1, Math.floor(item.quantity));
      if (item.type === 'Book') {
        const book = state.books.find((b) => b.id === item.id);
        if (!book) throw new Error(`Physical book "${item.name || item.id}" not found in inventory.`);
        if (!bookDeductions[book.id]) {
          bookDeductions[book.id] = { book, totalRequired: 0 };
        }
        bookDeductions[book.id].totalRequired += qty;
      } else {
        const course = state.courses.find((c) => c.id === item.id);
        if (!course) throw new Error(`Course bundle "${item.name || item.id}" not found.`);
        for (const comp of course.items || []) {
          const compBook = state.books.find((b) => b.id === comp.bookId);
          if (!compBook) {
            throw new Error(`Component book "${comp.bookName || comp.bookId}" for course "${course.name}" not found in inventory.`);
          }
          if (!bookDeductions[compBook.id]) {
            bookDeductions[compBook.id] = { book: compBook, totalRequired: 0 };
          }
          bookDeductions[compBook.id].totalRequired += (comp.quantityRequired || 1) * qty;
        }
      }
    }

    // Step 2: Validate stock sufficiency
    for (const { book, totalRequired } of Object.values(bookDeductions)) {
      if (book.stock < totalRequired) {
        throw new Error(
          `Insufficient stock for "${book.name}". Requested ${totalRequired} units, but only ${book.stock} available.`
        );
      }
    }

    // Step 3: Perform deductions and record transactions
    const saleId = generateId();
    const saleNumber = state.nextSaleNumber++;
    const now = new Date().toISOString();
    const deductedBooksSummary: DeductedBook[] = [];

    for (const { book, totalRequired } of Object.values(bookDeductions)) {
      const prevStock = book.stock;
      book.stock = prevStock - totalRequired;
      book.updatedAt = now;

      deductedBooksSummary.push({
        bookId: book.id,
        bookName: book.name,
        quantityDeducted: totalRequired,
      });

      const trans: InventoryTransaction = {
        id: generateId(),
        bookId: book.id,
        bookName: book.name,
        type: items.length === 1 && items[0].type === 'Book' ? 'book_sold' : 'course_sold',
        quantity: -totalRequired,
        previousStock: prevStock,
        newStock: book.stock,
        referenceType: 'sale',
        referenceId: saleId,
        userId,
        userName,
        userRole,
        notes: `Sale #${saleNumber} deduction`,
        createdAt: now,
      };
      state.inventoryTransactions.unshift(trans);
    }

    // Step 4: Build sale record
    let computedTotal = 0;
    const lineItems: SaleLineItem[] = items.map((it) => {
      const qty = Math.max(1, Math.floor(it.quantity));
      const catalogItem =
        it.type === 'Book'
          ? state.books.find((b) => b.id === it.id)
          : state.courses.find((c) => c.id === it.id);

      let catalogPrice = 0;
      if (it.type === 'Book' && catalogItem) {
        catalogPrice = Number((catalogItem as Book).price) || 0;
      } else if (it.type === 'Course' && catalogItem) {
        const crs = catalogItem as Course;
        if (typeof crs.price === 'number' && crs.price >= 0) {
          catalogPrice = Number(crs.price);
        } else {
          catalogPrice = (crs.items || []).reduce((sum, ci) => {
            const cb = state.books.find((b) => b.id === ci.bookId);
            return sum + (Number(cb?.price) || 0) * (ci.quantityRequired || 1);
          }, 0);
        }
      }

      const uPrice = it.unitPrice !== undefined ? Math.max(0, Number(it.unitPrice)) : catalogPrice;
      const tPrice = it.totalPrice !== undefined ? Math.max(0, Number(it.totalPrice)) : uPrice * qty;
      computedTotal += tPrice;

      return {
        id: it.id,
        itemId: it.id,
        itemType: it.type,
        name: it.name || catalogItem?.name || 'Item',
        code: it.code || catalogItem?.code || '',
        quantity: qty,
        unitPrice: uPrice,
        totalPrice: tPrice,
      };
    });

    const finalRevenue = customTotalPrice !== undefined ? Math.max(0, Number(customTotalPrice)) : computedTotal;

    const saleType = items.length === 1 ? items[0].type : 'Multiple';
    const firstLineName = lineItems[0]?.name || 'Item';
    const itemNameSnapshot =
      items.length === 1
        ? firstLineName
        : `${firstLineName} + ${items.length - 1} more item${items.length > 2 ? 's' : ''}`;
    const totalQuantity = items.reduce((sum, it) => sum + Math.max(1, Math.floor(it.quantity)), 0);

    const newSale: any = {
      id: saleId,
      saleId,
      saleNumber,
      saleType,
      itemId: items.length === 1 ? items[0].id : undefined,
      itemNameSnapshot,
      quantity: totalQuantity,
      totalUnits: totalQuantity,
      unitPrice: items.length === 1 ? lineItems[0].unitPrice : undefined,
      totalPrice: finalRevenue,
      currency: 'INR',
      notes: notes || '',
      items: lineItems,
      lineItems,
      deductedBooks: deductedBooksSummary,
      userId,
      userName,
      userRole,
      createdAt: now,
    };

    state.sales.unshift(newSale as Sale);
    saveState();
    return newSale;
  },

  updateSale(
    saleId: string,
    data: { totalPrice?: number; unitPrice?: number; notes?: string }
  ): Sale {
    const state = loadState();
    const sale = state.sales.find((s) => s.id === saleId);
    if (!sale) throw new Error(`Sale not found with ID ${saleId}`);

    if (data.totalPrice !== undefined) {
      sale.totalPrice = Math.max(0, Number(data.totalPrice));
    }
    if (data.unitPrice !== undefined) {
      sale.unitPrice = Math.max(0, Number(data.unitPrice));
    }
    if (data.notes !== undefined) {
      sale.notes = data.notes;
    }

    saveState();
    return sale;
  },

  deleteSale(
    saleId: string,
    restoreStock = true,
    userName = 'Store Owner',
    userId = 'owner_primary'
  ): { sale: Sale; restoredBooksCount: number } {
    const state = loadState();
    const saleIdx = state.sales.findIndex((s) => s.id === saleId);
    if (saleIdx === -1) throw new Error(`Sale not found with ID ${saleId}`);

    const [deletedSale] = state.sales.splice(saleIdx, 1);
    let restoredCount = 0;

    if (restoreStock && deletedSale.deductedBooks && deletedSale.deductedBooks.length > 0) {
      const now = new Date().toISOString();
      for (const entry of deletedSale.deductedBooks) {
        const book = state.books.find((b) => b.id === entry.bookId);
        if (book) {
          const prev = book.stock;
          book.stock = prev + entry.quantityDeducted;
          book.updatedAt = now;
          restoredCount++;

          const trans: InventoryTransaction = {
            id: generateId(),
            bookId: book.id,
            bookName: book.name,
            type: 'sale_refunded',
            quantity: entry.quantityDeducted,
            previousStock: prev,
            newStock: book.stock,
            referenceType: 'sale',
            referenceId: saleId,
            userId,
            userName,
            notes: `Restored inventory upon deletion of Sale #${deletedSale.saleNumber}`,
            createdAt: now,
          };
          state.inventoryTransactions.unshift(trans);
        }
      }
    }

    saveState();
    return { sale: deletedSale, restoredBooksCount: restoredCount };
  },

  getTransactions(): InventoryTransaction[] {
    return loadState().inventoryTransactions;
  },

  clearCatalog(): { deletedBooksCount: number; deletedCoursesCount: number } {
    const state = loadState();
    const booksCount = state.books.length;
    const coursesCount = state.courses.length;
    state.books = [];
    state.courses = [];
    saveState();
    return { deletedBooksCount: booksCount, deletedCoursesCount: coursesCount };
  },
};
