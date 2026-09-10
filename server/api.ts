import { Router, Request, Response } from 'express';
import { Firestore } from 'firebase-admin/firestore';
import { getAdminFirestore, isFirestoreConfigured } from './firebaseAdmin';
import { localDb } from './localDb';
import { requireOwner, authHandlers } from './auth';

export const apiRouter = Router();

const IS_PRODUCTION = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

/* ==========================================================================
   INPUT VALIDATION & SANITIZATION HELPERS
   ========================================================================== */

export function isValidId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return trimmed.length >= 1 && trimmed.length <= 128 && /^[a-zA-Z0-9_.-]+$/.test(trimmed);
}

export function sanitizeString(val: unknown, maxLength = 500): string {
  if (typeof val !== 'string') return '';
  return val
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength);
}

export function parsePositiveInteger(value: unknown, max = 1_000_000): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0 || num > max) {
    return null;
  }
  return num;
}

export function parseNonNegativeInteger(value: unknown, max = 1_000_000): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > max) {
    return null;
  }
  return num;
}

export function parseNonNegativeMoney(value: unknown, max = 100_000_000): number | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(num) || num < 0 || num > max) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

// Strip undefined values recursively for clean Firestore persistence
function cleanData<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        cleaned[key] = cleanData(val);
      } else if (Array.isArray(val)) {
        cleaned[key] = val.map((item) =>
          item !== null && typeof item === 'object' && !(item instanceof Date)
            ? cleanData(item)
            : item
        );
      } else {
        cleaned[key] = val;
      }
    }
  }
  return cleaned as T;
}

function getErrorMessage(err: any): string {
  if (!err) return 'An unexpected server error occurred.';
  if (typeof err === 'string') return err;
  return err.message || 'An unexpected server error occurred.';
}

type StorageEngine =
  | { type: 'firestore'; db: Firestore }
  | { type: 'local'; localDb: typeof localDb };

/**
 * Resolves the active database storage engine according to the strict Production Rule:
 * 1. In production / Vercel:
 *    - Cloud Firestore is the sole permitted source of truth.
 *    - If unconfigured or unavailable, sends HTTP 503 and returns null.
 *    - NEVER falls back to local JSON/mock storage.
 * 2. In development:
 *    - Uses Firestore if credentials are provided.
 *    - Otherwise, isolates development to the local mock/JSON store with explicit logging.
 */
function getStorageEngine(res: Response): StorageEngine | null {
  if (isFirestoreConfigured()) {
    try {
      const db = getAdminFirestore();
      if (db) {
        return { type: 'firestore', db };
      }
    } catch (err: any) {
      console.warn('[Storage Engine] Firestore initialization warning:', err.message);
    }
  }

  // Graceful resilient fallback to local engine (supporting Vercel /tmp directory)
  return { type: 'local', localDb };
}

/* ==========================================================================
   AUTHENTICATION ENDPOINTS (Public)
   ========================================================================== */

apiRouter.post('/auth/login', authHandlers.login);
apiRouter.post('/auth/logout', authHandlers.logout);
apiRouter.get('/auth/session', authHandlers.session);

/* ==========================================================================
   HEALTH & CONFIGURATION STATUS (Public)
   ========================================================================== */

apiRouter.get('/health', (req: Request, res: Response) => {
  const configured = isFirestoreConfigured();
  res.json({
    status: 'ok',
    application: 'Kashi Walla Book Management',
    environment: process.env.NODE_ENV || 'development',
    storageMode: configured ? 'firestore_production' : IS_PRODUCTION ? 'unconfigured' : 'local_dev_isolated',
    databaseConfigured: configured,
    timestamp: new Date().toISOString(),
  });
});

/* ==========================================================================
   BOOTSTRAP / FULL DATA SYNC (Owner Only)
   ========================================================================== */

apiRouter.get('/data', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  if (engine.type === 'local') {
    return res.json(engine.localDb.getAllData());
  }

  try {
    const db = engine.db;
    const [booksSnap, coursesSnap, salesSnap, transSnap, settingsSnap] = await Promise.all([
      db.collection('books').orderBy('name', 'asc').get(),
      db.collection('courses').orderBy('name', 'asc').get(),
      db.collection('sales').orderBy('createdAt', 'desc').get(),
      db.collection('inventoryTransactions').orderBy('createdAt', 'desc').get(),
      db.collection('storeSettings').doc('default').get(),
    ]);

    const books = booksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const courses = coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sales = salesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const transactions = transSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const settings = settingsSnap.exists
      ? { ...settingsSnap.data() }
      : {
          storeName: 'Kashi Walla Book Management',
          storePhone: '',
          storeAddress: '',
          storeEmail: '',
          updatedAt: new Date().toISOString(),
        };

    res.json({
      books,
      courses,
      sales,
      transactions,
      settings,
    });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   STORE SETTINGS (Owner Only)
   ========================================================================== */

apiRouter.get('/settings', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  if (engine.type === 'local') {
    return res.json(engine.localDb.getSettings());
  }

  try {
    const snap = await engine.db.collection('storeSettings').doc('default').get();
    if (snap.exists) {
      return res.json(snap.data());
    }
    return res.json({
      storeName: 'Kashi Walla Book Management',
      storePhone: '',
      storeAddress: '',
      storeEmail: '',
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.put('/settings', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const { storeName, storePhone, storeAddress, storeEmail } = req.body;

    const updates = cleanData({
      storeName: sanitizeString(storeName, 150) || 'Kashi Walla Book Management',
      storePhone: sanitizeString(storePhone, 50),
      storeAddress: sanitizeString(storeAddress, 250),
      storeEmail: sanitizeString(storeEmail, 100),
      updatedAt: new Date().toISOString(),
    });

    if (engine.type === 'local') {
      const updated = engine.localDb.updateSettings(updates);
      return res.json(updated);
    }

    const settingsRef = engine.db.collection('storeSettings').doc('default');
    await settingsRef.set(updates, { merge: true });
    res.json(updates);
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   BOOKS CRUD & STOCK MANAGEMENT (Owner Only)
   ========================================================================== */

apiRouter.get('/books', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  if (engine.type === 'local') {
    return res.json(engine.localDb.getBooks());
  }

  try {
    const snap = await engine.db.collection('books').orderBy('name', 'asc').get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.post('/books', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const { name, code, author, publisher, price, stock, initialNotes } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Book title is required.' });
    }

    const cleanStock = parseNonNegativeInteger(stock !== undefined && stock !== null && stock !== '' ? stock : 0);
    if (cleanStock === null) {
      return res.status(400).json({ error: 'Stock must be a non-negative whole number (0 to 1,000,000).' });
    }

    let cleanPrice: number = 0;
    if (price !== undefined && price !== null && price !== '') {
      const parsedPrice = parseNonNegativeMoney(price);
      if (parsedPrice === null) {
        return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
      }
      cleanPrice = parsedPrice;
    }

    const trimmedName = sanitizeString(name, 200);
    const trimmedCode = sanitizeString(code, 50);
    const trimmedAuthor = sanitizeString(author, 200);
    const trimmedPublisher = sanitizeString(publisher, 200);
    const trimmedNotes = sanitizeString(initialNotes, 500);

    if (engine.type === 'local') {
      const newBook = engine.localDb.createBook(
        {
          name: trimmedName,
          code: trimmedCode,
          author: trimmedAuthor,
          publisher: trimmedPublisher,
          price: cleanPrice,
          stock: cleanStock,
        },
        trimmedNotes
      );
      return res.status(201).json(newBook);
    }

    const db = engine.db;
    const now = new Date().toISOString();
    const bookRef = db.collection('books').doc();
    const bookId = bookRef.id;

    const bookPayload = cleanData({
      name: trimmedName,
      code: trimmedCode,
      author: trimmedAuthor,
      publisher: trimmedPublisher,
      price: cleanPrice,
      stock: cleanStock,
      createdAt: now,
      updatedAt: now,
    });

    const batch = db.batch();
    batch.set(bookRef, bookPayload);

    if (cleanStock > 0) {
      const transRef = db.collection('inventoryTransactions').doc();
      batch.set(
        transRef,
        cleanData({
          bookId,
          bookName: trimmedName,
          type: 'stock_added',
          quantity: cleanStock,
          previousStock: 0,
          newStock: cleanStock,
          referenceType: 'restock',
          userId: 'owner',
          userName: 'Store Owner',
          userRole: 'OWNER',
          notes: trimmedNotes || 'Initial inventory on book creation',
          createdAt: now,
        })
      );
    }

    await batch.commit();
    res.status(201).json({ id: bookId, ...bookPayload });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Book update: Supports name, code, author, publisher, price, and direct stock adjustment with complete audit trail
apiRouter.put('/books/:id', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const bookId = String(req.params.id);
    if (!isValidId(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID parameter.' });
    }

    const { name, code, author, publisher, price, stock, notes } = req.body;

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.status(400).json({ error: 'Book title cannot be empty.' });
    }

    let cleanPrice: number | undefined = undefined;
    if (price !== undefined && price !== null && price !== '') {
      const parsedPrice = parseNonNegativeMoney(price);
      if (parsedPrice === null) {
        return res.status(400).json({ error: 'Price must be a valid non-negative number.' });
      }
      cleanPrice = parsedPrice;
    }

    let cleanStock: number | undefined = undefined;
    if (stock !== undefined && stock !== null && stock !== '') {
      const parsedStock = parseNonNegativeInteger(stock);
      if (parsedStock === null) {
        return res.status(400).json({ error: 'Stock must be a non-negative whole number (0 or higher).' });
      }
      cleanStock = parsedStock;
    }

    const trimmedName = name !== undefined ? sanitizeString(name, 200) : undefined;
    const trimmedCode = code !== undefined ? sanitizeString(code, 50) : undefined;
    const trimmedAuthor = author !== undefined ? sanitizeString(author, 200) : undefined;
    const trimmedPublisher = publisher !== undefined ? sanitizeString(publisher, 200) : undefined;
    const trimmedNotes = notes !== undefined ? sanitizeString(notes, 500) : undefined;
    const now = new Date().toISOString();

    if (engine.type === 'local') {
      const updated = engine.localDb.updateBook(bookId, {
        name: trimmedName,
        code: trimmedCode,
        author: trimmedAuthor,
        publisher: trimmedPublisher,
        price: cleanPrice,
        stock: cleanStock,
        notes: trimmedNotes,
      });
      return res.json(updated);
    }

    const db = engine.db;
    const bookRef = db.collection('books').doc(bookId);
    const snap = await bookRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    const existingData = snap.data() || {};
    const prevStock = typeof existingData.stock === 'number' ? existingData.stock : 0;
    const nextStock = cleanStock !== undefined ? cleanStock : prevStock;

    const updates = cleanData({
      name: trimmedName,
      code: trimmedCode,
      author: trimmedAuthor,
      publisher: trimmedPublisher,
      price: cleanPrice,
      stock: cleanStock,
      updatedAt: now,
    });

    const batch = db.batch();
    batch.update(bookRef, updates);

    // If stock changed, record an inventory audit transaction document
    if (cleanStock !== undefined && cleanStock !== prevStock) {
      const transRef = db.collection('inventoryTransactions').doc();
      const delta = cleanStock - prevStock;
      batch.set(
        transRef,
        cleanData({
          bookId,
          bookName: trimmedName || existingData.name || 'Book',
          type: delta > 0 ? 'stock_added' : 'stock_adjustment',
          quantity: delta,
          previousStock: prevStock,
          newStock: nextStock,
          referenceType: 'adjustment',
          userId: 'owner_primary',
          userName: 'Store Owner',
          userRole: 'OWNER',
          notes: trimmedNotes || 'Stock updated via book edit',
          createdAt: now,
        })
      );
    }

    // If book name changed, propagate the new title to all courses referencing this book
    if (trimmedName && trimmedName !== existingData.name) {
      const coursesSnap = await db.collection('courses').get();
      for (const courseDoc of coursesSnap.docs) {
        const cData = courseDoc.data();
        let hasBook = false;
        const updatedItems = (cData.items || []).map((it: any) => {
          if (it.bookId === bookId) {
            hasBook = true;
            return { ...it, bookName: trimmedName };
          }
          return it;
        });
        if (hasBook) {
          batch.update(courseDoc.ref, { items: updatedItems, updatedAt: now });
        }
      }
    }

    await batch.commit();
    res.json({ id: bookId, ...existingData, ...updates });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.delete('/books/:id', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const bookId = String(req.params.id);
    if (!isValidId(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID parameter.' });
    }

    if (engine.type === 'local') {
      const courses = engine.localDb.getCourses();
      const coursesWithBook = courses.filter((c) => c.items.some((it) => it.bookId === bookId));
      if (coursesWithBook.length > 0) {
        return res.status(400).json({
          error: `Cannot delete book because it is required by ${coursesWithBook.length} course bundle(s): "${coursesWithBook
            .slice(0, 3)
            .map((c) => c.name)
            .join('", "')}". Remove it from these courses first.`,
        });
      }
      engine.localDb.deleteBook(bookId);
      return res.json({ success: true, deletedBookId: bookId });
    }

    const db = engine.db;
    const coursesSnap = await db.collection('courses').get();
    const coursesWithBook: string[] = [];

    for (const doc of coursesSnap.docs) {
      const data = doc.data();
      if (Array.isArray(data.items) && data.items.some((item: any) => item.bookId === bookId)) {
        coursesWithBook.push(data.name || doc.id);
      }
    }

    if (coursesWithBook.length > 0) {
      return res.status(400).json({
        error: `Cannot delete book because it is required by ${coursesWithBook.length} course bundle(s): "${coursesWithBook
          .slice(0, 3)
          .join('", "')}". Remove it from these courses first.`,
      });
    }

    await db.collection('books').doc(bookId).delete();
    res.json({ success: true, deletedBookId: bookId });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.post('/books/:id/add-stock', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const bookId = String(req.params.id);
    if (!isValidId(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID parameter.' });
    }

    const { quantity, notes } = req.body;
    const qty = parsePositiveInteger(quantity);
    if (qty === null) {
      return res.status(400).json({ error: 'Added quantity must be a positive whole number (1 to 1,000,000).' });
    }

    const cleanNotes = sanitizeString(notes, 500);

    if (engine.type === 'local') {
      const result = engine.localDb.addStock(bookId, qty, cleanNotes);
      return res.json(result);
    }

    const db = engine.db;
    const now = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const bookRef = db.collection('books').doc(bookId);
      const bookSnap = await transaction.get(bookRef);

      if (!bookSnap.exists) {
        throw new Error('Book not found in inventory.');
      }

      const bookData = bookSnap.data()!;
      const previousStock = Number(bookData.stock) || 0;
      const newStock = previousStock + qty;
      const bookName = bookData.name || 'Book';

      transaction.update(bookRef, { stock: newStock, updatedAt: now });

      const transRef = db.collection('inventoryTransactions').doc();
      transaction.set(
        transRef,
        cleanData({
          bookId,
          bookName,
          type: 'stock_added',
          quantity: qty,
          previousStock,
          newStock,
          referenceType: 'restock',
          userId: 'owner',
          userName: 'Store Owner',
          userRole: 'OWNER',
          notes: cleanNotes || 'Manual stock replenishment',
          createdAt: now,
        })
      );

      return { bookId, previousStock, newStock, added: qty };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

apiRouter.post('/books/:id/adjust-stock', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const bookId = String(req.params.id);
    if (!isValidId(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID parameter.' });
    }

    const { delta, notes } = req.body;
    const numDelta = typeof delta === 'number' ? delta : typeof delta === 'string' && delta.trim() !== '' ? Number(delta) : NaN;

    if (!Number.isFinite(numDelta) || !Number.isInteger(numDelta) || numDelta === 0) {
      return res.status(400).json({ error: 'Stock adjustment delta must be a non-zero integer.' });
    }

    const cleanNotes = sanitizeString(notes, 500);

    if (engine.type === 'local') {
      const result = engine.localDb.adjustStock(bookId, numDelta, cleanNotes);
      return res.json(result);
    }

    const db = engine.db;
    const now = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const bookRef = db.collection('books').doc(bookId);
      const bookSnap = await transaction.get(bookRef);

      if (!bookSnap.exists) {
        throw new Error('Book not found in inventory.');
      }

      const bookData = bookSnap.data()!;
      const previousStock = Number(bookData.stock) || 0;
      const newStock = previousStock + numDelta;

      if (newStock < 0) {
        throw new Error(
          `Cannot reduce stock by ${Math.abs(numDelta)}. Current shelf stock is only ${previousStock}. Shelf stock cannot be negative.`
        );
      }

      const bookName = bookData.name || 'Book';
      transaction.update(bookRef, { stock: newStock, updatedAt: now });

      const transRef = db.collection('inventoryTransactions').doc();
      transaction.set(
        transRef,
        cleanData({
          bookId,
          bookName,
          type: 'stock_adjustment',
          quantity: numDelta,
          previousStock,
          newStock,
          referenceType: 'adjustment',
          userId: 'owner',
          userName: 'Store Owner',
          userRole: 'OWNER',
          notes: cleanNotes || 'Inventory manual count adjustment',
          createdAt: now,
        })
      );

      return { bookId, previousStock, newStock, adjusted: numDelta };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   COURSES CRUD (Owner Only)
   ========================================================================== */

apiRouter.get('/courses', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  if (engine.type === 'local') {
    return res.json(engine.localDb.getCourses());
  }

  try {
    const snap = await engine.db.collection('courses').orderBy('name', 'asc').get();
    res.json(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.post('/courses', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const { name, code, price, items } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ error: 'Course name is required.' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'A course bundle must contain at least one component book.' });
    }

    // Verify format and check duplicates
    const seenBookIds = new Set<string>();
    const parsedItems: Array<{ bookId: string; quantityRequired: number }> = [];

    for (const it of items) {
      const bId = String(it.bookId || '').trim();
      if (!isValidId(bId)) {
        return res.status(400).json({ error: `Invalid component bookId: "${bId}"` });
      }
      if (seenBookIds.has(bId)) {
        return res.status(400).json({
          error: `Duplicate book in course bundle: "${it.bookName || bId}". Each book should be listed once with its total required quantity.`,
        });
      }
      seenBookIds.add(bId);

      const qty = parsePositiveInteger(it.quantityRequired);
      if (qty === null) {
        return res.status(400).json({ error: `Required quantity for book "${it.bookName || bId}" must be a positive whole number.` });
      }

      parsedItems.push({ bookId: bId, quantityRequired: qty });
    }

    let cleanPrice: number | undefined = undefined;
    if (price !== undefined && price !== null && price !== '') {
      const parsedPrice = parseNonNegativeMoney(price);
      if (parsedPrice === null) {
        return res.status(400).json({ error: 'Course price must be a valid non-negative number.' });
      }
      cleanPrice = parsedPrice;
    }

    const trimmedName = sanitizeString(name, 200);
    const trimmedCode = sanitizeString(code, 50);

    // Verify all referenced books exist in the database (Server Authoritative)
    if (engine.type === 'local') {
      const cleanItems = [];
      for (const it of parsedItems) {
        const book = engine.localDb.getBook(it.bookId);
        if (!book) {
          return res.status(400).json({ error: `Referenced component book with ID "${it.bookId}" does not exist in inventory.` });
        }
        cleanItems.push({
          bookId: it.bookId,
          bookName: book.name,
          quantityRequired: it.quantityRequired,
        });
      }

      const newCourse = engine.localDb.createCourse({
        name: trimmedName,
        code: trimmedCode,
        price: cleanPrice,
        items: cleanItems,
      });
      return res.status(201).json(newCourse);
    }

    const db = engine.db;
    const bookDocs = await Promise.all(parsedItems.map((it) => db.collection('books').doc(it.bookId).get()));
    const cleanItems = [];

    for (let i = 0; i < parsedItems.length; i++) {
      const it = parsedItems[i];
      const doc = bookDocs[i];
      if (!doc.exists) {
        return res.status(400).json({ error: `Referenced component book with ID "${it.bookId}" does not exist in inventory.` });
      }
      cleanItems.push({
        bookId: it.bookId,
        bookName: doc.data()?.name || 'Book',
        quantityRequired: it.quantityRequired,
      });
    }

    const now = new Date().toISOString();
    const courseRef = db.collection('courses').doc();
    const coursePayload = cleanData({
      name: trimmedName,
      code: trimmedCode,
      price: cleanPrice,
      items: cleanItems,
      createdAt: now,
      updatedAt: now,
    });

    await courseRef.set(coursePayload);
    res.status(201).json({ id: courseRef.id, ...coursePayload });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.put('/courses/:id', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const courseId = String(req.params.id);
    if (!isValidId(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID parameter.' });
    }

    const { name, code, price, items } = req.body;

    const updates: any = {};
    if (name !== undefined) {
      const trimmed = sanitizeString(name, 200);
      if (!trimmed) return res.status(400).json({ error: 'Course name cannot be empty.' });
      updates.name = trimmed;
    }
    if (code !== undefined) updates.code = sanitizeString(code, 50);

    if (price !== undefined) {
      if (price === null || price === '') {
        updates.price = null;
      } else {
        const p = parseNonNegativeMoney(price);
        if (p === null) return res.status(400).json({ error: 'Price must be a non-negative number.' });
        updates.price = p;
      }
    }

    if (Array.isArray(items)) {
      if (items.length === 0) {
        return res.status(400).json({ error: 'Course must contain at least one component book.' });
      }
      const seen = new Set<string>();
      const parsedItems: Array<{ bookId: string; quantityRequired: number }> = [];

      for (const it of items) {
        const bId = String(it.bookId || '').trim();
        if (!isValidId(bId)) return res.status(400).json({ error: `Invalid component bookId: "${bId}"` });
        if (seen.has(bId)) return res.status(400).json({ error: `Duplicate component book in course: "${it.bookName || bId}"` });
        seen.add(bId);

        const qty = parsePositiveInteger(it.quantityRequired);
        if (qty === null) {
          return res.status(400).json({ error: `Required quantity for book "${it.bookName || bId}" must be a positive whole number.` });
        }
        parsedItems.push({ bookId: bId, quantityRequired: qty });
      }

      // Verify books exist authoritative
      if (engine.type === 'local') {
        const cleanItems = [];
        for (const it of parsedItems) {
          const book = engine.localDb.getBook(it.bookId);
          if (!book) return res.status(400).json({ error: `Referenced component book with ID "${it.bookId}" does not exist in inventory.` });
          cleanItems.push({
            bookId: it.bookId,
            bookName: book.name,
            quantityRequired: it.quantityRequired,
          });
        }
        updates.items = cleanItems;
      } else {
        const bookDocs = await Promise.all(parsedItems.map((it) => engine.db.collection('books').doc(it.bookId).get()));
        const cleanItems = [];
        for (let i = 0; i < parsedItems.length; i++) {
          const it = parsedItems[i];
          const doc = bookDocs[i];
          if (!doc.exists) {
            return res.status(400).json({ error: `Referenced component book with ID "${it.bookId}" does not exist in inventory.` });
          }
          cleanItems.push({
            bookId: it.bookId,
            bookName: doc.data()?.name || 'Book',
            quantityRequired: it.quantityRequired,
          });
        }
        updates.items = cleanItems;
      }
    }

    updates.updatedAt = new Date().toISOString();

    if (engine.type === 'local') {
      const updated = engine.localDb.updateCourse(courseId, updates);
      return res.json(updated);
    }

    const courseRef = engine.db.collection('courses').doc(courseId);
    const snap = await courseRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Course not found.' });

    const firestoreUpdates: any = cleanData(updates);
    if (updates.price === null) {
      firestoreUpdates.price = null;
    }

    await courseRef.update(firestoreUpdates);
    res.json({ id: courseId, ...snap.data(), ...firestoreUpdates });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.delete('/courses/:id', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const courseId = String(req.params.id);
    if (!isValidId(courseId)) {
      return res.status(400).json({ error: 'Invalid course ID parameter.' });
    }

    if (engine.type === 'local') {
      engine.localDb.deleteCourse(courseId);
      return res.json({ success: true, deletedCourseId: courseId });
    }

    await engine.db.collection('courses').doc(courseId).delete();
    res.json({ success: true, deletedCourseId: courseId });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   ATOMIC SALES ENGINE (Owner Only, Concurrent-Safe, Server-Authoritative)
   ========================================================================== */

apiRouter.get('/sales', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  if (engine.type === 'local') {
    return res.json(engine.localDb.getSales());
  }

  try {
    let query: any = engine.db.collection('sales').orderBy('createdAt', 'desc');
    if (req.query.limit) {
      const lim = Math.max(1, Math.min(5000, Number(req.query.limit)));
      if (!isNaN(lim)) {
        query = query.limit(lim);
      }
    }

    const snap = await query.get();
    res.json(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

apiRouter.post('/sales', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const { items, customTotalPrice, notes } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale must contain at least one line item.' });
    }

    // Validate incoming items format
    for (const it of items) {
      if (!isValidId(it.id)) {
        return res.status(400).json({ error: `Invalid item ID: "${it.id}"` });
      }
      if (it.type !== 'Book' && it.type !== 'Course') {
        return res.status(400).json({ error: `Invalid item type "${it.type}" for item ID "${it.id}". Must be Book or Course.` });
      }
      const qty = parsePositiveInteger(it.quantity);
      if (qty === null) {
        return res.status(400).json({ error: `Quantity for item "${it.name || it.id}" must be a positive whole number.` });
      }
      if (it.unitPrice !== undefined) {
        const uPrice = parseNonNegativeMoney(it.unitPrice);
        if (uPrice === null) return res.status(400).json({ error: `Unit price for item "${it.name || it.id}" must be a non-negative number.` });
      }
    }

    let validatedCustomTotal: number | undefined = undefined;
    if (customTotalPrice !== undefined && customTotalPrice !== null && customTotalPrice !== '') {
      const p = parseNonNegativeMoney(customTotalPrice);
      if (p === null) {
        return res.status(400).json({ error: 'Custom total price must be a non-negative number.' });
      }
      validatedCustomTotal = p;
    }

    const cleanNotes = sanitizeString(notes, 500);

    if (engine.type === 'local') {
      const newSale = engine.localDb.createSale(
        items,
        validatedCustomTotal,
        cleanNotes
      );
      return res.status(201).json(newSale);
    }

    const db = engine.db;
    const now = new Date().toISOString();

    // Execute atomic sale verification, stock deduction, and sequential number allocation inside a single transaction
    const result = await db.runTransaction(async (transaction) => {
      // 1. Gather all unique book & course references
      const bookIds = new Set<string>();
      const courseIds = new Set<string>();

      for (const item of items) {
        if (item.type === 'Book') {
          bookIds.add(item.id);
        } else {
          courseIds.add(item.id);
        }
      }

      // Fetch all course docs inside transaction
      const courseDocs = await Promise.all(
        Array.from(courseIds).map((cId) => transaction.get(db.collection('courses').doc(cId)))
      );
      const courseMap = new Map<string, any>();
      courseDocs.forEach((doc) => {
        if (doc.exists) {
          const cData = doc.data()!;
          courseMap.set(doc.id, cData);
          for (const comp of cData.items || []) {
            bookIds.add(comp.bookId);
          }
        }
      });

      // Fetch all required book docs inside transaction
      const bookDocs = await Promise.all(
        Array.from(bookIds).map((bId) => transaction.get(db.collection('books').doc(bId)))
      );
      const bookMap = new Map<string, any>();
      bookDocs.forEach((doc) => {
        if (doc.exists) bookMap.set(doc.id, doc.data()!);
      });

      // 2. Aggregate cumulative required book deductions
      const requiredDeductions = new Map<string, { bookName: string; totalQuantity: number }>();

      for (const item of items) {
        const qty = parsePositiveInteger(item.quantity) || 1;
        if (item.type === 'Book') {
          const b = bookMap.get(item.id);
          if (!b) throw new Error(`Physical book "${item.name || item.id}" not found in inventory.`);
          const curr = requiredDeductions.get(item.id) || { bookName: b.name, totalQuantity: 0 };
          curr.totalQuantity += qty;
          requiredDeductions.set(item.id, curr);
        } else {
          const c = courseMap.get(item.id);
          if (!c) throw new Error(`Course bundle "${item.name || item.id}" not found in catalog.`);
          for (const comp of c.items || []) {
            const cb = bookMap.get(comp.bookId);
            if (!cb) throw new Error(`Required component book "${comp.bookName || comp.bookId}" not found in inventory.`);
            const curr = requiredDeductions.get(comp.bookId) || { bookName: cb.name, totalQuantity: 0 };
            curr.totalQuantity += comp.quantityRequired * qty;
            requiredDeductions.set(comp.bookId, curr);
          }
        }
      }

      // 3. Verify stock sufficiency for every physical book
      for (const [bId, req] of requiredDeductions.entries()) {
        const b = bookMap.get(bId)!;
        const curStock = Number(b.stock) || 0;
        if (curStock < req.totalQuantity) {
          throw new Error(
            `INSUFFICIENT STOCK: "${req.bookName}" requires ${req.totalQuantity} units, but only ${curStock} available on shelf.`
          );
        }
      }

      // 4. Atomic sequential sale number allocation
      const counterRef = db.collection('counters').doc('sales');
      const counterDoc = await transaction.get(counterRef);
      const currentSaleNumber = counterDoc.exists ? Number(counterDoc.data()?.lastSaleNumber) || 1000 : 1000;
      const nextSaleNumber = currentSaleNumber + 1;
      transaction.set(counterRef, { lastSaleNumber: nextSaleNumber, updatedAt: now }, { merge: true });

      // 5. Deduct shelf stock & record inventory audit transactions
      const saleRef = db.collection('sales').doc();
      const saleId = saleRef.id;
      const deductedSummary: any[] = [];

      for (const [bId, req] of requiredDeductions.entries()) {
        const b = bookMap.get(bId)!;
        const curStock = Number(b.stock) || 0;
        const nextStock = curStock - req.totalQuantity;

        transaction.update(db.collection('books').doc(bId), { stock: nextStock, updatedAt: now });
        deductedSummary.push({ bookId: bId, bookName: req.bookName, quantityDeducted: req.totalQuantity });

        const tRef = db.collection('inventoryTransactions').doc();
        transaction.set(
          tRef,
          cleanData({
            bookId: bId,
            bookName: req.bookName,
            type: items.length === 1 && items[0].type === 'Book' ? 'book_sold' : 'course_sold',
            quantity: -req.totalQuantity,
            previousStock: curStock,
            newStock: nextStock,
            referenceType: 'sale',
            referenceId: saleId,
            userId: 'owner',
            userName: 'Store Owner',
            userRole: 'OWNER',
            notes: `Sale #${nextSaleNumber} deduction`,
            createdAt: now,
          })
        );
      }

      // 6. Build authoritative immutable line items & sale document
      let computedTotalRevenue = 0;
      const lineItems = items.map((it: any) => {
        const qty = parsePositiveInteger(it.quantity) || 1;
        // Resolve authoritative item info from database
        const catalogItem = it.type === 'Book' ? bookMap.get(it.id) : courseMap.get(it.id);
        const authoritativeName = catalogItem?.name || sanitizeString(it.name || 'Item', 200);
        const authoritativeCode = catalogItem?.code || sanitizeString(it.code || '', 50);
        let catalogPrice = 0;
        if (it.type === 'Book') {
          catalogPrice = Number(catalogItem?.price) || 0;
        } else if (it.type === 'Course') {
          if (typeof catalogItem?.price === 'number' && catalogItem.price >= 0) {
            catalogPrice = catalogItem.price;
          } else {
            catalogPrice = (catalogItem?.items || []).reduce((sum: number, comp: any) => {
              const b = bookMap.get(comp.bookId);
              return sum + (Number(b?.price) || 0) * (Number(comp.quantityRequired) || 1);
            }, 0);
          }
        }

        const uPrice = it.unitPrice !== undefined ? Math.max(0, Number(it.unitPrice)) : catalogPrice;
        const tPrice = it.totalPrice !== undefined ? Math.max(0, Number(it.totalPrice)) : uPrice * qty;
        computedTotalRevenue += tPrice;

        return {
          id: it.id,
          itemId: it.id,
          itemType: it.type,
          name: authoritativeName,
          code: authoritativeCode,
          quantity: qty,
          unitPrice: uPrice,
          totalPrice: tPrice,
        };
      });

      const finalTotal = validatedCustomTotal !== undefined ? validatedCustomTotal : computedTotalRevenue;

      const firstItemName = lineItems[0]?.name || 'Item';
      const itemNameSnapshot =
        lineItems.length === 1
          ? firstItemName
          : `${firstItemName} + ${lineItems.length - 1} more item${lineItems.length > 2 ? 's' : ''}`;

      const salePayload = cleanData({
        saleNumber: nextSaleNumber,
        saleType: items.length === 1 ? items[0].type : 'Multiple',
        itemId: items.length === 1 ? items[0].id : undefined,
        itemNameSnapshot,
        quantity: lineItems.reduce((s: number, i: any) => s + i.quantity, 0),
        unitPrice: items.length === 1 ? lineItems[0].unitPrice : undefined,
        totalPrice: finalTotal,
        currency: 'INR',
        notes: cleanNotes,
        items: lineItems,
        deductedBooks: deductedSummary,
        userId: 'owner',
        userName: 'Store Owner',
        userRole: 'OWNER',
        createdAt: now,
      });

      transaction.set(saleRef, salePayload);
      return {
        id: saleId,
        saleId,
        totalUnits: salePayload.quantity,
        lineItems,
        ...salePayload,
      };
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: getErrorMessage(err) });
  }
});

apiRouter.put('/sales/:id', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const saleId = String(req.params.id);
    if (!isValidId(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID parameter.' });
    }

    const { totalPrice, unitPrice, notes } = req.body;

    const updates: any = { updatedAt: new Date().toISOString() };
    if (notes !== undefined) updates.notes = sanitizeString(notes, 500);
    if (totalPrice !== undefined) {
      const p = parseNonNegativeMoney(totalPrice);
      if (p === null) return res.status(400).json({ error: 'Total price must be a non-negative number.' });
      updates.totalPrice = p;
    }
    if (unitPrice !== undefined) {
      const p = parseNonNegativeMoney(unitPrice);
      if (p === null) return res.status(400).json({ error: 'Unit price must be a non-negative number.' });
      updates.unitPrice = p;
    }

    if (engine.type === 'local') {
      const updated = engine.localDb.updateSale(saleId, updates);
      return res.json(updated);
    }

    const saleRef = engine.db.collection('sales').doc(saleId);
    const snap = await saleRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Sale not found.' });

    await saleRef.update(cleanData(updates));
    res.json({ id: saleId, ...snap.data(), ...updates });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

// Atomic Sale Deletion with Transactional Stock Restoration
apiRouter.delete('/sales/:id', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    const saleId = String(req.params.id);
    if (!isValidId(saleId)) {
      return res.status(400).json({ error: 'Invalid sale ID parameter.' });
    }

    const restoreStock = req.query.restoreStock !== 'false';

    if (engine.type === 'local') {
      const result = engine.localDb.deleteSale(saleId, restoreStock);
      return res.json({ success: true, ...result });
    }

    const db = engine.db;
    const now = new Date().toISOString();

    // Execute atomic deletion & stock restoration inside a single transaction
    const deletionResult = await db.runTransaction(async (transaction) => {
      const saleRef = db.collection('sales').doc(saleId);
      const saleSnap = await transaction.get(saleRef);

      if (!saleSnap.exists) {
        throw new Error('Sale record not found or already deleted.');
      }

      const saleData = saleSnap.data()!;
      const restoredSummary: any[] = [];

      if (restoreStock && Array.isArray(saleData.deductedBooks) && saleData.deductedBooks.length > 0) {
        // Read all books inside transaction
        const bookRefs = saleData.deductedBooks.map((entry: any) => db.collection('books').doc(entry.bookId));
        const bookDocs = await Promise.all(bookRefs.map((bRef) => transaction.get(bRef)));

        for (let i = 0; i < saleData.deductedBooks.length; i++) {
          const entry = saleData.deductedBooks[i];
          const bDoc = bookDocs[i];
          const bRef = bookRefs[i];

          if (bDoc.exists) {
            const prev = Number(bDoc.data()!.stock) || 0;
            const next = prev + Number(entry.quantityDeducted);

            transaction.update(bRef, { stock: next, updatedAt: now });

            const tRef = db.collection('inventoryTransactions').doc();
            transaction.set(
              tRef,
              cleanData({
                bookId: entry.bookId,
                bookName: entry.bookName,
                type: 'sale_refunded',
                quantity: entry.quantityDeducted,
                previousStock: prev,
                newStock: next,
                referenceType: 'sale',
                referenceId: saleId,
                userId: 'owner',
                userName: 'Store Owner',
                userRole: 'OWNER',
                notes: `Restored upon deletion of Sale #${saleData.saleNumber}`,
                createdAt: now,
              })
            );

            restoredSummary.push({
              bookId: entry.bookId,
              bookName: entry.bookName,
              restoredQty: entry.quantityDeducted,
            });
          }
        }
      }

      transaction.delete(saleRef);

      return {
        success: true,
        deletedSaleId: saleId,
        saleNumber: saleData.saleNumber,
        restoredStock: restoreStock,
        restoredBooks: restoredSummary,
      };
    });

    res.json(deletionResult);
  } catch (err: any) {
    res.status(err.message?.includes('not found') ? 404 : 500).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   INVENTORY AUDIT TRANSACTIONS (Owner Only)
   ========================================================================== */

apiRouter.get('/inventory-transactions', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  if (engine.type === 'local') {
    return res.json(engine.localDb.getTransactions());
  }

  try {
    let query: any = engine.db.collection('inventoryTransactions').orderBy('createdAt', 'desc');
    if (req.query.limit) {
      const lim = Math.max(1, Math.min(5000, Number(req.query.limit)));
      if (!isNaN(lim)) {
        query = query.limit(lim);
      }
    }

    const snap = await query.get();
    res.json(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   SERVER-SIDE ANALYTICS SUMMARY (Owner Only)
   ========================================================================== */

apiRouter.get('/analytics/summary', requireOwner, async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  try {
    let sales: any[] = [];
    let books: any[] = [];
    let courses: any[] = [];

    if (engine.type === 'local') {
      const data = engine.localDb.getAllData();
      sales = data.sales;
      books = data.books;
      courses = data.courses;
    } else {
      const [salesSnap, booksSnap, coursesSnap] = await Promise.all([
        engine.db.collection('sales').get(),
        engine.db.collection('books').get(),
        engine.db.collection('courses').get(),
      ]);
      sales = salesSnap.docs.map((d) => d.data());
      books = booksSnap.docs.map((d) => d.data());
      courses = coursesSnap.docs.map((d) => d.data());
    }

    let allTimeRevenue = 0;
    let booksRevenue = 0;
    let coursesRevenue = 0;
    let totalUnitsSold = 0;

    for (const s of sales) {
      const rev = Number(s.totalPrice) || 0;
      const qty = Number(s.quantity) || 0;
      allTimeRevenue += rev;
      totalUnitsSold += qty;

      if (Array.isArray(s.items) && s.items.length > 0) {
        for (const it of s.items) {
          const itRev = Number(it.totalPrice) || 0;
          if (it.itemType === 'Book') booksRevenue += itRev;
          else coursesRevenue += itRev;
        }
      } else if (s.saleType === 'Book') {
        booksRevenue += rev;
      } else {
        coursesRevenue += rev;
      }
    }

    const totalStock = books.reduce((sum, b) => sum + (Number(b.stock) || 0), 0);
    const outOfStockCount = books.filter((b) => Number(b.stock) <= 0).length;

    res.json({
      allTimeRevenue,
      booksRevenue,
      coursesRevenue,
      totalUnitsSold,
      totalSalesCount: sales.length,
      totalBooksCount: books.length,
      totalCoursesCount: courses.length,
      totalStockUnits: totalStock,
      outOfStockCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
});

/* ==========================================================================
   CATALOG MAINTENANCE (Safe Chunked Reset, Owner Only, Requires Explicit Confirmation)
   ========================================================================== */

const clearCatalogHandler = async (req: Request, res: Response) => {
  const engine = getStorageEngine(res);
  if (!engine) return;

  // Strict confirmation requirement
  const confirmPayload = req.body?.confirm;
  if (confirmPayload !== 'CLEAR_CATALOG_CONFIRMED') {
    return res.status(400).json({
      error: 'Destructive operation requires explicit confirmation payload: { confirm: "CLEAR_CATALOG_CONFIRMED" }',
    });
  }

  try {
    if (engine.type === 'local') {
      const result = engine.localDb.clearCatalog();
      return res.json(result);
    }

    const db = engine.db;
    const [coursesSnap, booksSnap] = await Promise.all([
      db.collection('courses').get(),
      db.collection('books').get(),
    ]);

    const docsToDelete = [...coursesSnap.docs, ...booksSnap.docs];

    // Chunk deletions into groups of 400 to prevent Firestore batch limit (500) failures
    const BATCH_SIZE = 400;
    for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docsToDelete.slice(i, i + BATCH_SIZE);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    res.json({
      deletedCoursesCount: coursesSnap.size,
      deletedBooksCount: booksSnap.size,
    });
  } catch (err: any) {
    res.status(500).json({ error: getErrorMessage(err) });
  }
};

apiRouter.post('/catalog/clear', requireOwner, clearCatalogHandler);
apiRouter.post('/catalog/clear-all', requireOwner, clearCatalogHandler);
