export type UserRole = 'OWNER';
export const USER_ROLE: UserRole = 'OWNER';

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  username?: string;
  createdAt?: string;
}

export interface Book {
  id: string;
  name: string;
  code?: string;
  author?: string;
  publisher?: string;
  price?: number; // Price in INR (₹)
  stock: number;
  dataSource?: 'sample' | string;
  createdAt: string;
  updatedAt: string;
}

export interface CourseItem {
  bookId: string;
  bookName: string;
  quantityRequired: number;
}

export interface Course {
  id: string;
  name: string;
  code?: string;
  price?: number; // Bundle price in INR (₹)
  items: CourseItem[];
  dataSource?: 'sample' | string;
  createdAt: string;
  updatedAt: string;
}

export type AlertSeverity = 'out_of_stock' | 'very_low' | 'critical' | 'low' | 'reminder';

export interface StockAlert {
  id: string;
  itemId: string;
  itemType: 'Book' | 'Course';
  itemName: string;
  currentStock: number;
  level: string; // e.g. "Critical Low Stock"
  message: string; // e.g. "Critical Low Stock — 5 left"
  severity: AlertSeverity;
  severityRank: number; // 1 (highest - out of stock) to 5 (reminder)
}

export interface DeductedBook {
  bookId: string;
  bookName: string;
  quantityDeducted: number;
}

export type SaleType = 'Book' | 'Course' | 'Multiple';

export interface SaleLineItem {
  id: string; // bookId or courseId
  itemId: string; // Guaranteed valid Firestore document ID
  itemType: 'Book' | 'Course';
  name: string;
  code?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  deductedBooks?: DeductedBook[];
}

export interface Sale {
  id: string;
  saleNumber: number;
  saleType: SaleType;
  itemId?: string;
  itemNameSnapshot: string;
  quantity: number;
  unitPrice?: number; // Unit price in INR (₹)
  totalPrice?: number; // Final sale revenue in INR (₹) (editable)
  currency?: string; // e.g. "INR"
  notes?: string;
  items?: SaleLineItem[];
  deductedBooks?: DeductedBook[];
  userId: string;
  userName: string;
  userRole: UserRole | string;
  dataSource?: 'sample' | string;
  createdAt: string; // ISO date
}

export type InventoryTransactionType =
  | 'stock_added'
  | 'book_sold'
  | 'course_sold'
  | 'stock_adjustment'
  | 'sale_refunded';

export interface InventoryTransaction {
  id: string;
  bookId: string;
  bookName: string;
  type: InventoryTransactionType;
  quantity: number; // e.g. +50 or -3
  previousStock: number;
  newStock: number;
  referenceType?: 'sale' | 'restock' | 'adjustment';
  referenceId?: string;
  userId: string;
  userName: string;
  userRole?: UserRole | string;
  notes?: string;
  dataSource?: 'sample' | string;
  createdAt: string;
}

export interface StoreSettings {
  storeName: string;
  storePhone?: string;
  storeAddress?: string;
  storeEmail?: string;
  updatedAt: string;
}
