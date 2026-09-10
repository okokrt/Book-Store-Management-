import { Book, Course, StockAlert, AlertSeverity, Sale, SaleLineItem } from '../types';

export type StockSeverity =
  | 'out_of_stock'
  | 'very_low'
  | 'critical'
  | 'low'
  | 'reminder'
  | 'normal';

export function getStockSeverity(stock: number): StockSeverity {
  const value = Math.max(0, Math.floor(Number(stock) || 0));

  if (value === 0) return 'out_of_stock';
  if (value === 1) return 'very_low';
  if (value <= 5) return 'critical';
  if (value <= 10) return 'low';
  if (value <= 15) return 'reminder';

  return 'normal';
}

export function getStockSeverityLabel(severity: StockSeverity): string {
  switch (severity) {
    case 'out_of_stock':
      return 'Out of Stock';
    case 'very_low':
      return 'Very Low Stock (1 Left)';
    case 'critical':
      return 'Critical Low Stock (2-5 Left)';
    case 'low':
      return 'Low Stock Warning (6-10 Left)';
    case 'reminder':
      return 'Stock Reminder (11-15 Left)';
    case 'normal':
      return 'In Stock';
  }
}

export interface ComponentStockBreakdown {
  bookId: string;
  bookName: string;
  requiredPerCourse: number;
  currentStock: number;
  maxCoursesPossible: number;
  isBottleneck: boolean;
}

export interface CourseStockCalculation {
  availableQuantity: number;
  isAvailable: boolean;
  limitingBook?: Book;
  missingBooks: string[];
  breakdown: ComponentStockBreakdown[];
  isComplete: boolean;
}

/**
 * Calculates available course quantity based on physical book inventory.
 * Formula: MIN(floor(bookStock / bookRequiredQuantity)) across all components.
 * If any component book is missing from booksMap or course has 0 components, availability is 0.
 */
export function calculateCourseAvailability(
  course: Course,
  booksMap: Record<string, Book>
): CourseStockCalculation {
  if (!course.items || course.items.length === 0) {
    return {
      availableQuantity: 0,
      isAvailable: false,
      missingBooks: [],
      breakdown: [],
      isComplete: false,
    };
  }

  let minPossible = Infinity;
  let limitingBook: Book | undefined = undefined;
  const missingBooks: string[] = [];
  const breakdown: ComponentStockBreakdown[] = [];

  for (const item of course.items) {
    const book = booksMap[item.bookId];
    if (!book) {
      missingBooks.push(item.bookName || item.bookId);
    }
    const currentStock = book ? Math.max(0, book.stock) : 0;
    const required = Math.max(1, item.quantityRequired || 1);
    const maxCoursesPossible = Math.floor(currentStock / required);

    if (maxCoursesPossible < minPossible) {
      minPossible = maxCoursesPossible;
      limitingBook = book;
    }

    breakdown.push({
      bookId: item.bookId,
      bookName: book?.name || item.bookName || 'Unknown Book',
      requiredPerCourse: required,
      currentStock,
      maxCoursesPossible,
      isBottleneck: false,
    });
  }

  if (missingBooks.length > 0) {
    minPossible = 0;
  }

  const finalAvailable = minPossible === Infinity ? 0 : Math.max(0, minPossible);

  // Mark which components are limiting/bottlenecks
  breakdown.forEach((item) => {
    item.isBottleneck = item.maxCoursesPossible === finalAvailable;
  });

  return {
    availableQuantity: finalAvailable,
    isAvailable: finalAvailable > 0 && missingBooks.length === 0,
    limitingBook,
    missingBooks,
    breakdown,
    isComplete: breakdown.length > 0 && breakdown.every((b) => b.currentStock > 0),
  };
}

export const calculateCourseStock = calculateCourseAvailability;

/**
 * Calculates stock alert for a single item (Book or Course) using the exact specified thresholds.
 * Thresholds:
 *   0: Out of Stock
 *   1: Very Low Stock — Only 1 Left
 *   2-5: Critical Low Stock
 *   6-10: Low Stock Warning
 *   11-15: Stock Reminder
 *   16+: No alert
 */
export function calculateStockAlert(
  stock: number,
  itemType: 'Book' | 'Course',
  itemName: string,
  itemId: string
): StockAlert | null {
  const current = Math.max(0, Math.floor(stock));

  if (current > 15) {
    return null; // 16+ = No alert
  }

  const unitLabel = itemType === 'Course' ? 'complete course' : 'left';
  const pluralUnit = itemType === 'Course' ? 'complete courses available' : 'left';

  if (current === 0) {
    return {
      id: `${itemType.toLowerCase()}-${itemId}-out`,
      itemId,
      itemType,
      itemName,
      currentStock: 0,
      level: 'Out of Stock',
      message: itemType === 'Course' ? 'Out of Stock — 0 complete courses available' : 'Out of Stock',
      severity: 'out_of_stock',
      severityRank: 1,
    };
  }

  if (current === 1) {
    return {
      id: `${itemType.toLowerCase()}-${itemId}-1`,
      itemId,
      itemType,
      itemName,
      currentStock: 1,
      level: 'Very Low Stock',
      message: itemType === 'Course' ? 'Very Low Stock — Only 1 complete course available' : 'Very Low Stock — Only 1 left',
      severity: 'very_low',
      severityRank: 2,
    };
  }

  if (current >= 2 && current <= 5) {
    return {
      id: `${itemType.toLowerCase()}-${itemId}-critical`,
      itemId,
      itemType,
      itemName,
      currentStock: current,
      level: 'Critical Low Stock',
      message: itemType === 'Course' ? `Critical Low Stock — Only ${current} ${pluralUnit}` : `Critical Low Stock — ${current} left`,
      severity: 'critical',
      severityRank: 3,
    };
  }

  if (current >= 6 && current <= 10) {
    return {
      id: `${itemType.toLowerCase()}-${itemId}-low`,
      itemId,
      itemType,
      itemName,
      currentStock: current,
      level: 'Low Stock Warning',
      message: itemType === 'Course' ? `Low Stock Warning — Only ${current} ${pluralUnit}` : `Low Stock Warning — ${current} left`,
      severity: 'low',
      severityRank: 4,
    };
  }

  if (current >= 11 && current <= 15) {
    return {
      id: `${itemType.toLowerCase()}-${itemId}-reminder`,
      itemId,
      itemType,
      itemName,
      currentStock: current,
      level: 'Stock Reminder',
      message: itemType === 'Course' ? `Stock Reminder — ${current} ${pluralUnit}` : `Stock Reminder — ${current} left`,
      severity: 'reminder',
      severityRank: 5,
    };
  }

  return null;
}

export function getAllStockAlerts(
  books: Book[],
  courses: Course[],
  booksMap: Record<string, Book>
): StockAlert[] {
  const alerts: StockAlert[] = [];

  // Individual books alerts
  for (const book of books) {
    const alert = calculateStockAlert(book.stock, 'Book', book.name, book.id);
    if (alert) {
      alerts.push(alert);
    }
  }

  // Courses alerts (using dynamic available quantity)
  for (const course of courses) {
    const calc = calculateCourseStock(course, booksMap);
    const alert = calculateStockAlert(calc.availableQuantity, 'Course', course.name, course.id);
    if (alert) {
      alerts.push(alert);
    }
  }

  // Sort by severity rank (1 = Out of Stock first), then stock ascending
  return alerts.sort((a, b) => {
    if (a.severityRank !== b.severityRank) {
      return a.severityRank - b.severityRank;
    }
    return a.currentStock - b.currentStock;
  });
}

export const computeStockAlerts = getAllStockAlerts;

/**
 * Local date string format YYYY-MM-DD based on client local time (avoids UTC boundary issues).
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Local month string format YYYY-MM based on client local time.
 */
export function getLocalMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Validates and parses a non-negative finite number (e.g. price, money).
 */
export function parseNonNegativeFiniteNumber(
  value: unknown,
  fieldName: string
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} must be a valid non-negative number.`);
  }
  return number;
}

/**
 * Validates and parses a positive integer (> 0).
 */
export function parsePositiveInteger(
  value: unknown,
  fieldName: string
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number <= 0) {
    throw new Error(`${fieldName} must be a positive whole number.`);
  }
  return number;
}

/**
 * Validates and parses a non-negative integer (>= 0).
 */
export function parseNonNegativeInteger(
  value: unknown,
  fieldName: string
): number {
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) {
    throw new Error(`${fieldName} must be a non-negative whole number.`);
  }
  return number;
}

/**
 * Deterministically recalculates and balances line item pricing and total prices
 * to ensure sum(items[].totalPrice) === sale.totalPrice with exact integer paise precision.
 */
export function recalculateSalePricing(
  sale: Sale,
  data: { totalPrice?: number; unitPrice?: number; notes?: string }
): { totalPrice: number; unitPrice?: number; items?: SaleLineItem[]; notes?: string } {
  const notes = data.notes !== undefined ? data.notes.trim() : sale.notes;

  // Single-item sale or sale without items array
  if (!sale.items || sale.items.length <= 1) {
    let newTotalPrice = sale.totalPrice || 0;
    let newUnitPrice = sale.unitPrice;

    if (data.unitPrice !== undefined && data.totalPrice === undefined) {
      newUnitPrice = parseNonNegativeFiniteNumber(data.unitPrice, 'Unit price');
      newTotalPrice = Math.round(newUnitPrice * (sale.quantity || 1) * 100) / 100;
    } else if (data.totalPrice !== undefined) {
      newTotalPrice = parseNonNegativeFiniteNumber(data.totalPrice, 'Total price');
      newUnitPrice =
        data.unitPrice !== undefined
          ? parseNonNegativeFiniteNumber(data.unitPrice, 'Unit price')
          : (sale.quantity > 0 ? Math.round((newTotalPrice / sale.quantity) * 100) / 100 : newTotalPrice);
    }

    let updatedItems: SaleLineItem[] | undefined = undefined;
    if (sale.items && sale.items.length === 1) {
      updatedItems = [
        {
          ...sale.items[0],
          totalPrice: newTotalPrice,
          unitPrice: newUnitPrice,
        },
      ];
    }

    return {
      totalPrice: newTotalPrice,
      unitPrice: newUnitPrice,
      items: updatedItems,
      notes,
    };
  }

  // Multi-item sale: allocate edited total proportionally across line items
  const newTotalPrice =
    data.totalPrice !== undefined
      ? parseNonNegativeFiniteNumber(data.totalPrice, 'Total price')
      : (sale.totalPrice || 0);

  const standardTotal = sale.items.reduce(
    (sum, item) => sum + (Number(item.totalPrice) || 0),
    0
  );

  let remainingPaise = Math.round(newTotalPrice * 100);
  const updatedItems = sale.items.map((item, index) => {
    let allocatedPaise: number;
    if (index === sale.items!.length - 1) {
      allocatedPaise = remainingPaise;
    } else {
      const itemVal = Number(item.totalPrice) || 0;
      const ratio = standardTotal > 0 ? itemVal / standardTotal : 1 / sale.items!.length;
      allocatedPaise = Math.round(Math.round(newTotalPrice * 100) * ratio);
      remainingPaise -= allocatedPaise;
    }

    const itemTotalPrice = allocatedPaise / 100;
    const itemUnitPrice =
      item.quantity > 0
        ? Math.round((itemTotalPrice / item.quantity) * 100) / 100
        : itemTotalPrice;

    return {
      ...item,
      totalPrice: itemTotalPrice,
      unitPrice: itemUnitPrice,
    };
  });

  const newUnitPrice =
    sale.quantity > 0
      ? Math.round((newTotalPrice / sale.quantity) * 100) / 100
      : newTotalPrice;

  return {
    totalPrice: newTotalPrice,
    unitPrice: newUnitPrice,
    items: updatedItems,
    notes,
  };
}

