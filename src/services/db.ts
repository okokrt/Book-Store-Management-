import {
  Book,
  Course,
  CourseItem,
  Sale,
  InventoryTransaction,
  StoreSettings,
  AppUser,
} from '../types';

/* ==========================================================================
   DIRECT OWNER ACCESS (No Login Screen)
   ========================================================================== */

export interface AuthState {
  authenticated: boolean;
  role: string;
  name: string;
  mode?: string;
}

const DEFAULT_AUTH_STATE: AuthState = {
  authenticated: true,
  role: 'OWNER',
  name: 'Store Owner',
  mode: 'direct_access',
};

export function subscribeAuth(callback: (state: AuthState) => void): () => void {
  callback(DEFAULT_AUTH_STATE);
  return () => {};
}

export async function checkOwnerSession(): Promise<AuthState> {
  return DEFAULT_AUTH_STATE;
}

export async function loginOwner(password?: string): Promise<{ success: boolean }> {
  return { success: true };
}

export async function logoutOwner(): Promise<void> {
  // No-op in direct single-tenant owner mode
}

/* ==========================================================================
   CENTRALIZED FAST FETCH WRAPPER
   ========================================================================== */

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/* ==========================================================================
   ERROR FORMATTING
   ========================================================================== */

export function cleanFirestoreData<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      cleaned[key] = val;
    }
  }
  return cleaned as T;
}

export function formatDatabaseError(error: any): string {
  if (!error) return 'An unknown error occurred. Please try again.';
  if (typeof error === 'string') return error;

  const msg = error.message || '';
  if (msg.includes('INSUFFICIENT STOCK')) return msg;
  if (msg.includes('Database service unavailable') || msg.includes('Firestore credentials')) {
    return 'Database configuration is not initialized for this deployment. Please verify environment variables.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Unable to reach the server. Please check your internet connection.';
  }

  return msg || 'Database operation failed. Please check parameters and try again.';
}

/* ==========================================================================
   STATE CACHE & SUBSCRIPTION HUB
   ========================================================================== */

interface StoreState {
  books: Book[];
  courses: Course[];
  sales: Sale[];
  transactions: InventoryTransaction[];
  settings: StoreSettings;
}

let cachedState: StoreState = {
  books: [],
  courses: [],
  sales: [],
  transactions: [],
  settings: {
    storeName: 'Kashi Walla Book Management',
    storePhone: '',
    storeAddress: '',
    storeEmail: '',
    updatedAt: new Date().toISOString(),
  },
};

const listeners = {
  books: new Set<(books: Book[]) => void>(),
  courses: new Set<(courses: Course[]) => void>(),
  sales: new Set<(sales: Sale[]) => void>(),
  transactions: new Set<(transactions: InventoryTransaction[]) => void>(),
  settings: new Set<(settings: StoreSettings) => void>(),
};

let syncTimer: any = null;
let isFetching = false;

export async function syncAllData(): Promise<void> {
  if (isFetching) return;
  isFetching = true;

  try {
    const res = await apiFetch('/api/data');
    if (!res.ok) {
      if (res.status === 401) {
        return; // Unauthenticated handled via apiFetch
      }
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || errJson.message || `Server returned ${res.status}`);
    }

    const data = await res.json();
    cachedState = {
      books: data.books || [],
      courses: data.courses || [],
      sales: data.sales || [],
      transactions: data.transactions || [],
      settings: data.settings || cachedState.settings,
    };

    // Notify all active listeners
    listeners.books.forEach((cb) => cb(cachedState.books));
    listeners.courses.forEach((cb) => cb(cachedState.courses));
    listeners.sales.forEach((cb) => cb(cachedState.sales));
    listeners.transactions.forEach((cb) => cb(cachedState.transactions));
    listeners.settings.forEach((cb) => cb(cachedState.settings));
  } catch (err) {
    console.warn('[Sync Error]', err);
  } finally {
    isFetching = false;
  }
}

function startSyncLoop(): void {
  if (typeof window === 'undefined') return;
  if (!syncTimer) {
    // Initial fetch
    syncAllData();

    // Gentle 60-second background heartbeat instead of aggressive 6-second polling loop
    syncTimer = setInterval(syncAllData, 60000);

    // Refresh immediately when window regains focus or network reconnects
    window.addEventListener('focus', () => syncAllData());
    window.addEventListener('online', () => syncAllData());
  }
}

/* ==========================================================================
   DATA SUBSCRIPTIONS
   ========================================================================== */

export function subscribeBooks(callback: (books: Book[]) => void): () => void {
  listeners.books.add(callback);
  callback(cachedState.books);
  startSyncLoop();

  return () => {
    listeners.books.delete(callback);
  };
}

export function subscribeCourses(callback: (courses: Course[]) => void): () => void {
  listeners.courses.add(callback);
  callback(cachedState.courses);
  startSyncLoop();

  return () => {
    listeners.courses.delete(callback);
  };
}

export function subscribeSales(callback: (sales: Sale[]) => void): () => void {
  listeners.sales.add(callback);
  callback(cachedState.sales);
  startSyncLoop();

  return () => {
    listeners.sales.delete(callback);
  };
}

export function subscribeTransactions(callback: (transactions: InventoryTransaction[]) => void): () => void {
  listeners.transactions.add(callback);
  callback(cachedState.transactions);
  startSyncLoop();

  return () => {
    listeners.transactions.delete(callback);
  };
}

export function subscribeSettings(callback: (settings: StoreSettings) => void): () => void {
  listeners.settings.add(callback);
  callback(cachedState.settings);
  startSyncLoop();

  return () => {
    listeners.settings.delete(callback);
  };
}

export const subscribeToBooks = subscribeBooks;
export const subscribeToCourses = subscribeCourses;
export const subscribeToSales = subscribeSales;
export const subscribeToTransactions = subscribeTransactions;
export const subscribeToSettings = subscribeSettings;

export const addStock = addBookStock;
export const adjustStock = adjustBookStock;

export type MultiSaleCartItem = MultiItemSaleOption['items'][0];

export async function seedInitialData(force = false): Promise<void> {
  // No-op: databases begin clean without unsolicited mock injection
}

export async function removeAllDefaultCoursesAndBooks(): Promise<{
  deletedBooksCount: number;
  deletedCoursesCount: number;
}> {
  return clearAllCatalog();
}

/* ==========================================================================
   BOOKS OPERATIONS
   ========================================================================== */

export async function addBook(
  bookData: {
    name: string;
    code?: string;
    author?: string;
    publisher?: string;
    price?: number;
    stock: number;
  },
  userOrNotes?: AppUser | string,
  initialStockNotes?: string
): Promise<string> {
  const notes = typeof userOrNotes === 'string' ? userOrNotes : initialStockNotes;
  const res = await apiFetch('/api/books', {
    method: 'POST',
    body: JSON.stringify({
      ...bookData,
      initialNotes: notes,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to add book');

  await syncAllData();
  return json.id;
}

export async function updateBook(
  bookId: string,
  updates: Partial<Book> & { stock?: number; notes?: string },
  user?: AppUser
): Promise<void> {
  const { id, createdAt, ...allowedUpdates } = updates as any;

  const res = await apiFetch(`/api/books/${bookId}`, {
    method: 'PUT',
    body: JSON.stringify(allowedUpdates),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update book');

  await syncAllData();
}

export async function deleteBook(
  bookId: string,
  coursesOrUser?: Course[] | AppUser,
  userOrCourses?: Course[] | AppUser
): Promise<void> {
  const res = await apiFetch(`/api/books/${bookId}`, {
    method: 'DELETE',
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete book');

  await syncAllData();
}

export async function addBookStock(
  bookId: string,
  quantityToAdd: number,
  userOrNotes?: AppUser | string,
  notes?: string
): Promise<void> {
  const finalNotes = typeof userOrNotes === 'string' ? userOrNotes : notes;
  const res = await apiFetch(`/api/books/${bookId}/add-stock`, {
    method: 'POST',
    body: JSON.stringify({ quantity: quantityToAdd, notes: finalNotes }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to add stock');

  await syncAllData();
}

export async function adjustBookStock(
  bookId: string,
  delta: number,
  userOrNotes?: AppUser | string,
  notes?: string
): Promise<void> {
  const finalNotes = typeof userOrNotes === 'string' ? userOrNotes : notes || '';
  const res = await apiFetch(`/api/books/${bookId}/adjust-stock`, {
    method: 'POST',
    body: JSON.stringify({ delta, notes: finalNotes }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to adjust stock');

  await syncAllData();
}

/* ==========================================================================
   COURSES OPERATIONS
   ========================================================================== */

export async function addCourse(
  courseData: {
    name: string;
    code?: string;
    price?: number;
    items: Array<{ bookId: string; bookName: string; quantityRequired: number }>;
  },
  user?: AppUser
): Promise<string> {
  const res = await apiFetch('/api/courses', {
    method: 'POST',
    body: JSON.stringify(courseData),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to add course');

  await syncAllData();
  return json.id;
}

export async function updateCourse(
  courseId: string,
  updates: Partial<Course> & { price?: number | null },
  user?: AppUser
): Promise<void> {
  const res = await apiFetch(`/api/courses/${courseId}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update course');

  await syncAllData();
}

export async function deleteCourse(courseId: string, user?: AppUser): Promise<void> {
  const res = await apiFetch(`/api/courses/${courseId}`, {
    method: 'DELETE',
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to delete course');

  await syncAllData();
}

/* ==========================================================================
   SALES OPERATIONS (Books, Courses, Mixed Multi-Item Orders)
   ========================================================================== */

export interface MultiItemSaleOption {
  items: Array<{
    id: string; // bookId or courseId
    type: 'Book' | 'Course';
    name: string;
    code?: string;
    quantity: number;
    unitPrice?: number;
    totalPrice?: number;
  }>;
  user?: AppUser;
  customTotalPrice?: number;
  notes?: string;
}

export async function recordMultiItemSale(
  optionsOrItems: MultiItemSaleOption | MultiItemSaleOption['items'],
  user?: AppUser,
  customTotalPrice?: number,
  notes?: string
) {
  const isArray = Array.isArray(optionsOrItems);
  const items = isArray ? optionsOrItems : optionsOrItems.items;
  const finalTotal = isArray ? customTotalPrice : optionsOrItems.customTotalPrice;
  const finalNotes = isArray ? notes : optionsOrItems.notes;

  const res = await apiFetch('/api/sales', {
    method: 'POST',
    body: JSON.stringify({
      items,
      customTotalPrice: finalTotal,
      notes: finalNotes,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to record sale');

  // Trigger background sync non-blockingly for immediate UI response speed
  syncAllData().catch((err) => console.warn('[Post-Sale Sync Warning]', err));

  const rawItems = json.lineItems || json.items || [];
  const calculatedUnits =
    json.totalUnits ??
    json.quantity ??
    items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);

  return {
    ...json,
    id: json.id || json.saleId,
    saleId: json.saleId || json.id,
    saleNumber: json.saleNumber,
    totalPrice: json.totalPrice ?? 0,
    totalUnits: calculatedUnits,
    quantity: calculatedUnits,
    lineItems: rawItems,
    items: rawItems,
    deductedBooks: json.deductedBooks || [],
  };
}

export async function recordBookSale(
  bookOrId: Book | string,
  quantitySold: number,
  user?: AppUser,
  customTotalPrice?: number,
  unitPrice?: number,
  notes?: string
) {
  const book =
    typeof bookOrId === 'string'
      ? cachedState.books.find((b) => b.id === bookOrId) || {
          id: bookOrId,
          name: 'Book',
          code: '',
          price: unitPrice || 0,
        }
      : bookOrId;

  const effectiveUnitPrice = unitPrice !== undefined ? unitPrice : (book.price || 0);
  const calcTotal = customTotalPrice !== undefined ? customTotalPrice : effectiveUnitPrice * quantitySold;

  return recordMultiItemSale({
    items: [
      {
        id: book.id,
        type: 'Book',
        name: book.name,
        code: book.code,
        quantity: quantitySold,
        unitPrice: effectiveUnitPrice,
        totalPrice: calcTotal,
      },
    ],
    user,
    customTotalPrice: calcTotal,
    notes,
  });
}

export async function recordCourseSale(
  courseOrId: Course | string,
  quantitySold: number,
  user?: AppUser,
  booksMapOrCustomTotal?: Record<string, Book> | number,
  customTotalPriceOrUnitPrice?: number,
  notesOrCustomTotal?: string | number,
  maybeNotes?: string
) {
  const course =
    typeof courseOrId === 'string'
      ? cachedState.courses.find((c) => c.id === courseOrId) || {
          id: courseOrId,
          name: 'Course',
          code: '',
          items: [] as CourseItem[],
          price: typeof customTotalPriceOrUnitPrice === 'number' ? customTotalPriceOrUnitPrice : 0,
        }
      : courseOrId;

  let finalCustomTotal: number | undefined = undefined;
  let finalNotes: string | undefined = undefined;

  if (typeof booksMapOrCustomTotal === 'number') {
    finalCustomTotal = booksMapOrCustomTotal;
  } else if (typeof customTotalPriceOrUnitPrice === 'number') {
    finalCustomTotal = customTotalPriceOrUnitPrice;
  }

  if (typeof notesOrCustomTotal === 'string') {
    finalNotes = notesOrCustomTotal;
  } else if (typeof maybeNotes === 'string') {
    finalNotes = maybeNotes;
  }

  let effectiveUnitPrice = 0;
  if (typeof course.price === 'number' && course.price >= 0) {
    effectiveUnitPrice = course.price;
  } else if (course.items && Array.isArray(course.items)) {
    effectiveUnitPrice = (course.items as any[]).reduce((sum: number, item: any) => {
      const b = cachedState.books.find((bk) => bk.id === item.bookId);
      return sum + (Number(b?.price) || 0) * (Number(item.quantityRequired) || 1);
    }, 0);
  }

  const calcTotal = finalCustomTotal !== undefined ? finalCustomTotal : effectiveUnitPrice * quantitySold;

  return recordMultiItemSale({
    items: [
      {
        id: course.id,
        type: 'Course',
        name: course.name,
        code: course.code,
        quantity: quantitySold,
        unitPrice: effectiveUnitPrice,
        totalPrice: calcTotal,
      },
    ],
    user,
    customTotalPrice: calcTotal,
    notes: finalNotes,
  });
}

export async function updateSale(
  saleId: string,
  data: { totalPrice?: number; unitPrice?: number; notes?: string },
  user?: AppUser
): Promise<void> {
  const res = await apiFetch(`/api/sales/${saleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update sale');

  await syncAllData();
}

export async function deleteSale(
  saleId: string,
  arg2?: AppUser | boolean,
  arg3?: AppUser | boolean
): Promise<any> {
  const restoreStock = typeof arg2 === 'boolean' ? arg2 : typeof arg3 === 'boolean' ? arg3 : true;
  const res = await apiFetch(`/api/sales/${saleId}?restoreStock=${restoreStock}`, {
    method: 'DELETE',
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to cancel sale');

  await syncAllData();
  return {
    ...json,
    restoredBooks: json.restoredBooks || [],
  };
}

/* ==========================================================================
   SETTINGS & CATALOG MAINTENANCE
   ========================================================================== */

export async function updateStoreSettings(settings: Partial<StoreSettings>): Promise<void> {
  const res = await apiFetch('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to update store settings');

  await syncAllData();
}

export async function clearAllCatalog(): Promise<{ deletedCoursesCount: number; deletedBooksCount: number }> {
  const res = await apiFetch('/api/catalog/clear', {
    method: 'POST',
    body: JSON.stringify({ confirm: 'CLEAR_CATALOG_CONFIRMED' }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to clear catalog');

  await syncAllData();
  return json;
}
