import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Boxes,
  CheckCircle,
  History,
  AlertTriangle,
  Settings as SettingsIcon,
  ClipboardList,
  Menu,
  X,
  UserCircle2,
  ChevronRight,
  Sparkles,
  IndianRupee,
} from 'lucide-react';
import { AppUser } from '../types';

export type NavSection =
  | 'dashboard'
  | 'books'
  | 'courses'
  | 'sell'
  | 'revenue'
  | 'sales_history'
  | 'stock_alerts'
  | 'inventory_history'
  | 'settings';

interface SidebarProps {
  currentSection: NavSection;
  onNavigate: (section: NavSection) => void;
  currentUser: AppUser;
  alertCount: number;
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: (open: boolean) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onNavigate,
  currentUser,
  alertCount,
  mobileMenuOpen,
  setMobileMenuOpen,
  isMobileOpen,
  onCloseMobile,
}) => {
  const isOpen = mobileMenuOpen ?? isMobileOpen ?? false;
  const handleClose = () => {
    if (setMobileMenuOpen) setMobileMenuOpen(false);
    if (onCloseMobile) onCloseMobile();
  };

  const navItems = [
    {
      id: 'dashboard' as NavSection,
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'books' as NavSection,
      label: 'Books',
      icon: BookOpen,
    },
    {
      id: 'courses' as NavSection,
      label: 'Courses',
      icon: Boxes,
    },
    {
      id: 'sell' as NavSection,
      label: 'Mark as Sold',
      icon: CheckCircle,
      isAction: true,
    },
    {
      id: 'revenue' as NavSection,
      label: 'Revenue & Ledger',
      icon: IndianRupee,
    },
    {
      id: 'sales_history' as NavSection,
      label: 'Sales History',
      icon: History,
    },
    {
      id: 'stock_alerts' as NavSection,
      label: 'Stock Alerts',
      icon: AlertTriangle,
      badge: alertCount > 0 ? alertCount : undefined,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      id: 'inventory_history' as NavSection,
      label: 'Inventory History',
      icon: ClipboardList,
    },
    {
      id: 'settings' as NavSection,
      label: 'Settings',
      icon: SettingsIcon,
    },
  ];

  const handleItemClick = (id: NavSection) => {
    onNavigate(id);
    handleClose();
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs transition-opacity"
          onClick={handleClose}
        />
      )}

      {/* Navigation Sidebar (Desktop persistent w-64 + Mobile slide-out drawer) */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-indigo-700 text-white flex flex-col shadow-xl lg:shadow-none transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:h-full flex-shrink-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-6 border-b border-indigo-800 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold leading-tight text-white tracking-tight">
              Kashi Walla<br />
              <span className="text-indigo-200 text-sm font-medium">Book Management</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="lg:hidden p-1.5 text-indigo-200 hover:text-white hover:bg-indigo-600 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 space-y-1.5 mt-4 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-indigo-800 text-white'
                    : 'text-indigo-100 hover:bg-indigo-600'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-5 h-5 rounded-sm flex items-center justify-center ${
                      isActive ? 'bg-indigo-400 text-indigo-950' : 'border-2 border-indigo-300 text-indigo-200'
                    }`}
                  >
                    <Icon size={13} className={isActive ? 'text-indigo-900 stroke-[2.5]' : 'text-indigo-200'} />
                  </div>
                  <span className={isActive ? 'font-bold' : 'font-medium'}>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                      isActive ? 'bg-white text-indigo-800' : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}

                {item.isAction && !item.badge && !isActive && (
                  <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                    Sold
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Footer Profile - Owner Only */}
        <div className="p-4 border-t border-indigo-800 bg-indigo-800/40">
          <div className="flex items-center justify-between p-1 min-w-0">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 bg-purple-400 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                {(currentUser.name || 'SO').slice(0, 2).toUpperCase()}
              </div>
              <div className="text-xs min-w-0">
                <p className="font-bold text-white truncate">{currentUser.name || 'Store Owner'}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-purple-300 text-purple-950">
                    OWNER
                  </span>
                  <span className="text-[10px] text-indigo-200">Full Access</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Quick Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-indigo-900 border-t border-indigo-800 flex items-center justify-around py-1.5 px-2 shadow-lg">
        <button
          onClick={() => onNavigate('dashboard')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium ${
            currentSection === 'dashboard' ? 'text-white font-bold bg-indigo-800' : 'text-indigo-200'
          }`}
        >
          <LayoutDashboard size={18} />
          <span className="text-[10px] mt-0.5">Dashboard</span>
        </button>

        <button
          onClick={() => onNavigate('books')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium ${
            currentSection === 'books' ? 'text-white font-bold bg-indigo-800' : 'text-indigo-200'
          }`}
        >
          <BookOpen size={18} />
          <span className="text-[10px] mt-0.5">Books</span>
        </button>

        {/* Central Vibrant Mark As Sold Button */}
        <button
          onClick={() => onNavigate('sell')}
          className="flex flex-col items-center -mt-4"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-950/40 transition-transform active:scale-95">
            <CheckCircle size={24} />
          </div>
          <span className="text-[10px] font-bold text-emerald-400 mt-0.5">SOLD</span>
        </button>

        <button
          onClick={() => onNavigate('courses')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium ${
            currentSection === 'courses' ? 'text-white font-bold bg-indigo-800' : 'text-indigo-200'
          }`}
        >
          <Boxes size={18} />
          <span className="text-[10px] mt-0.5">Courses</span>
        </button>

        <button
          onClick={() => onNavigate('stock_alerts')}
          className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-medium relative ${
            currentSection === 'stock_alerts' ? 'text-white font-bold bg-indigo-800' : 'text-indigo-200'
          }`}
        >
          <AlertTriangle size={18} />
          <span className="text-[10px] mt-0.5">Alerts</span>
          {alertCount > 0 && (
            <span className="absolute top-0 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {alertCount}
            </span>
          )}
        </button>
      </div>
    </>
  );
};
