import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  MapPin,
  Megaphone,
  Menu,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { PersonaRole, UserRole } from '../types/civic';
import { OPERATING_ROLES } from '../utils/civicMath';
import { CitationDrawer } from './CitationDrawer';

export type AppRoute =
  | '/command-center'
  | '/ingest'
  | '/map'
  | '/radar'
  | '/briefing-studio'
  | '/citizen-advisory'
  | '/tasks'
  | '/qa-evaluator';

const NAV_ITEMS: Array<{
  route: AppRoute;
  label: string;
  Icon: React.FC<{ className?: string }>;
  evaluatorOnly?: boolean;
}> = [
  { route: '/command-center', label: 'Command Center', Icon: LayoutDashboard },
  { route: '/ingest', label: 'Data Ingestion', Icon: FileSpreadsheet },
  { route: '/map', label: 'Evidence Map & Alerts', Icon: MapPin },
  { route: '/radar', label: 'Radar & Resources', Icon: Activity },
  { route: '/briefing-studio', label: 'Briefing Studio', Icon: Sparkles },
  { route: '/citizen-advisory', label: 'Citizen Advisory', Icon: Megaphone },
  { route: '/tasks', label: 'Action Board', Icon: ClipboardCheck },
  { route: '/qa-evaluator', label: 'Evaluator QA & Audit', Icon: ShieldCheck, evaluatorOnly: true },
];

export const Layout: React.FC<{
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}> = ({ activeRoute, onNavigate, children }) => {
  const {
    activeRole,
    roleProfile,
    activePersona,
    chooseRole,
    switchPersona,
    exitRoleSession,
    toast,
    clearToast,
  } = useStudio();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) => !item.evaluatorOnly || activeRole === 'EVALUATOR');
  const activeItem = NAV_ITEMS.find((n) => n.route === activeRoute);

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-700 focus:text-white focus:rounded-md"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 bg-white border-r border-slate-200 no-print">
        <div className="px-5 py-4 border-b border-slate-200">
          <button
            type="button"
            onClick={() => onNavigate('/command-center')}
            className="text-left block w-full"
          >
            <span className="text-sm font-bold tracking-tight text-slate-900 block">
              Civic Air Quality
            </span>
            <span className="text-xs text-slate-500 block">Briefing Studio</span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Primary Workspace Navigation">
          {visibleNav.map((item) => {
            const Icon = item.Icon;
            const isActive = activeRoute === item.route;
            return (
              <button
                key={item.route}
                type="button"
                onClick={() => onNavigate(item.route)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-left whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {roleProfile && (
          <div className="p-4 border-t border-slate-200 text-xs space-y-0.5 bg-slate-50/70">
            <div className="font-semibold text-slate-900 truncate">{roleProfile.displayName}</div>
            <div className="text-slate-600 truncate">
              {roleProfile.organizationName} · {roleProfile.wardZone}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print" role="dialog" aria-modal="true" aria-label="Navigation Menu">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileMenuOpen(false)} />
          <div className="relative w-72 max-w-full bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200">
              <span className="text-sm font-bold text-slate-900">Civic Air Quality Studio</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {visibleNav.map((item) => {
                const Icon = item.Icon;
                const isActive = activeRoute === item.route;
                return (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => {
                      onNavigate(item.route);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm text-slate-600 truncate">
              <span>{roleProfile?.wardZone ?? 'Workspace'}</span>
              <span className="mx-2 text-slate-400" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900">{activeItem?.label ?? 'Command Center'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <label htmlFor="header-switch-role" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Role:
              </label>
              <select
                id="header-switch-role"
                value={activeRole ?? 'EVALUATOR'}
                onChange={(e) => void chooseRole(e.target.value as UserRole, true)}
                className="text-xs font-semibold bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900"
              >
                {OPERATING_ROLES.map((r) => (
                  <option key={r.role} value={r.role}>
                    {r.displayName}
                  </option>
                ))}
              </select>
            </div>

            {activeRole === 'EVALUATOR' && (
              <div className="hidden md:flex items-center gap-1.5">
                <label htmlFor="header-persona-lens" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  View:
                </label>
                <select
                  id="header-persona-lens"
                  value={activePersona}
                  onChange={(e) => void switchPersona(e.target.value as PersonaRole)}
                  className="text-xs font-medium bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-900"
                >
                  <option value="WARD_OFFICER">Ward Officer</option>
                  <option value="HOUSING_SOCIETY">Housing Society (RWA)</option>
                  <option value="SCHOOL_COORDINATOR">School Coordinator</option>
                </select>
              </div>
            )}

            <button
              type="button"
              onClick={() => void exitRoleSession()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Role Picker</span>
            </button>
          </div>
        </header>

        {/* Accessible Toast Region */}
        <div aria-live="polite" aria-atomic="true" className="px-4 sm:px-6 pt-3 no-print">
          {toast && (
            <div
              className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border text-sm ${
                toast.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : toast.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
              role={toast.type === 'error' ? 'alert' : 'status'}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={clearToast}
                className="p-1 rounded hover:bg-black/5"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <main id="main-content" className="flex-1 p-4 sm:p-6 max-w-[1360px] w-full mx-auto">
          {children}
        </main>
      </div>

      <CitationDrawer />
    </div>
  );
};
