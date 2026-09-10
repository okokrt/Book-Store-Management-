import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Download,
  Trash2,
  CheckCircle2,
  Building,
  UserCheck,
  Save,
  Server,
  Lock,
} from 'lucide-react';
import { AppUser, Book, Course, Sale, StoreSettings } from '../types';
import { getStockSeverity, getStockSeverityLabel } from '../utils/stockUtils';

interface SettingsViewProps {
  currentUser: AppUser;
  storeSettings?: StoreSettings;
  onUpdateSettings?: (settings: Partial<StoreSettings>) => Promise<void>;
  onClearAllCatalog: () => Promise<void>;
  books: Book[];
  courses: Course[];
  sales: Sale[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  storeSettings,
  onUpdateSettings,
  onClearAllCatalog,
  books,
  courses,
  sales,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State for Store Information
  const [storeName, setStoreName] = useState(storeSettings?.storeName || 'Kashi Walla Book Management');
  const [storePhone, setStorePhone] = useState(storeSettings?.storePhone || '');
  const [storeAddress, setStoreAddress] = useState(storeSettings?.storeAddress || '');
  const [storeEmail, setStoreEmail] = useState(storeSettings?.storeEmail || '');

  useEffect(() => {
    if (storeSettings) {
      setStoreName(storeSettings.storeName || 'Kashi Walla Book Management');
      setStorePhone(storeSettings.storePhone || '');
      setStoreAddress(storeSettings.storeAddress || '');
      setStoreEmail(storeSettings.storeEmail || '');
    }
  }, [storeSettings]);

  const handleSaveStoreInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateSettings) return;

    try {
      setIsSavingSettings(true);
      await onUpdateSettings({
        storeName: storeName.trim(),
        storePhone: storePhone.trim(),
        storeAddress: storeAddress.trim(),
        storeEmail: storeEmail.trim(),
      });
      setSuccessMessage('Store settings updated successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to update store settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  // CSV Export using centralized getStockSeverityLabel
  const handleExportStockCSV = () => {
    const headers = ['Book Name', 'Book Code', 'Author', 'Publisher', 'Current Stock', 'Stock Status'];
    const rows = books.map((b) => {
      const status = getStockSeverityLabel(getStockSeverity(b.stock));

      return [
        `"${b.name.replace(/"/g, '""')}"`,
        `"${b.code || ''}"`,
        `"${(b.author || '').replace(/"/g, '""')}"`,
        `"${(b.publisher || '').replace(/"/g, '""')}"`,
        b.stock,
        `"${status}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `inventory_stock_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm(
      'WARNING: This will permanently delete all books, courses, and reset the inventory catalog. This action cannot be undone. Are you sure?'
    );
    if (!confirmed) return;

    try {
      setIsProcessing(true);
      await onClearAllCatalog();
      setSuccessMessage('Catalog has been completely reset.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to reset catalog');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* View Title */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">System Settings & Controls</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Store identity, server-side security architecture, catalog maintenance, and data export
        </p>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Store Identity & Live Metrics */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-700">
            <Building size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{storeName || 'Kashi Walla Book Management'}</h3>
            <p className="text-xs text-slate-500">
              Dedicated inventory control & internal stock recording engine
            </p>
          </div>
        </div>

        {/* Live Inventory Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block font-medium uppercase text-[10px] tracking-wider">Catalog Size</span>
            <span className="text-2xl font-mono font-extrabold text-slate-900 mt-0.5 block">{books.length}</span>
            <span className="text-slate-500 block text-[11px] mt-0.5">Physical book titles</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block font-medium uppercase text-[10px] tracking-wider">Course Bundles</span>
            <span className="text-2xl font-mono font-extrabold text-slate-900 mt-0.5 block">{courses.length}</span>
            <span className="text-slate-500 block text-[11px] mt-0.5">Multi-book bundles</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block font-medium uppercase text-[10px] tracking-wider">Sales Logged</span>
            <span className="text-2xl font-mono font-extrabold text-slate-900 mt-0.5 block">{sales.length}</span>
            <span className="text-slate-500 block text-[11px] mt-0.5">Total sales recorded</span>
          </div>
        </div>

        {/* Editable Store Configuration Form */}
        <form onSubmit={handleSaveStoreInfo} className="pt-4 border-t border-slate-100 space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Store Profile Details</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Store / Business Name
              </label>
              <input
                type="text"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="e.g. Kashi Walla Book Store"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={storePhone}
                onChange={(e) => setStorePhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Store Address
              </label>
              <input
                type="text"
                value={storeAddress}
                onChange={(e) => setStoreAddress(e.target.value)}
                placeholder="e.g. Main Market, Varanasi, UP"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Store Email (Optional)
              </label>
              <input
                type="email"
                value={storeEmail}
                onChange={(e) => setStoreEmail(e.target.value)}
                placeholder="e.g. contact@kashiwallabooks.com"
                className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSavingSettings}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Save size={14} />
              <span>{isSavingSettings ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Owner Profile & Application Authority */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-700">
              <UserCheck size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Store Owner Profile</h3>
              <p className="text-xs text-slate-500">
                Single-owner direct management system. Full authority across all modules.
              </p>
            </div>
          </div>

          <span className="px-3 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200 self-start sm:self-auto">
            Role: OWNER (Exclusive Access)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block font-semibold uppercase text-[10px]">User Role</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">{currentUser.name || 'Store Owner'}</span>
            <span className="text-slate-500 text-[11px] block mt-0.5">Primary administrator</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-slate-400 block font-semibold uppercase text-[10px]">Access Permissions</span>
            <span className="font-bold text-slate-900 text-sm mt-0.5 block">
              Complete Administrative Authority
            </span>
            <span className="text-slate-500 text-[11px] block mt-0.5">
              Authorized to create, edit, delete books, courses, sales, revenue records, and stock adjustments.
            </span>
          </div>
        </div>
      </div>

      {/* Multi-Client Data Isolation & Architecture */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="text-emerald-600" size={20} />
          <span>Security Architecture & Multi-Client Data Isolation</span>
        </h3>

        <div className="space-y-2 text-xs text-slate-700">
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2.5">
            <Server size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Server-Side Firebase Admin Architecture:</strong> The browser never communicates directly with database credentials. All mutations are validated and processed via secure server-side API endpoints using Firebase Admin SDK.
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2.5">
            <Lock size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Zero Shared Data:</strong> Each client deployment operates as a completely independent instance connected to its own dedicated Firebase project via isolated environment variables.
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Strictly Zero Payment Processing:</strong> The application functions strictly as a book inventory control and internal sales recording system with no external payment gateways, cards, or wallets.
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Atomic Multi-Item Inventory Deductions:</strong> Mixed sales with books and course bundles atomically verify physical book availability and deduct stock. If any book is out of stock, the entire sale is rejected.
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-2.5">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Five-Tier Stock Alert System:</strong> Internal alerts trigger at 15 (Reminder), 10 (Low Warning), 5 (Critical Low), 1 (Very Low), and 0 (Out of Stock).
            </div>
          </div>
        </div>
      </div>

      {/* Data Export & Catalog Wipe Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Inventory Data Management & Export
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Export current inventory records or reset catalog contents.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportStockCSV}
            className="px-4 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Download size={15} />
            <span>Export Stock CSV</span>
          </button>
        </div>

        <div className="p-4 rounded-xl border border-red-200 bg-red-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-bold text-red-900 block">Clear Entire Catalog</span>
            <p className="text-[11px] text-red-700 mt-0.5">
              Permanently wipes all books and courses for an absolute clean-slate start.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearAll}
            disabled={isProcessing}
            className="py-2 px-4 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer self-start sm:self-auto"
          >
            <Trash2 size={14} />
            <span>{isProcessing ? 'Wiping...' : 'Wipe Catalog'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
