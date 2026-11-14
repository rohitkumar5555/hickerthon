import React, { useState } from 'react';
import { ArrowRight, Building2, GraduationCap, ShieldCheck, UserCheck } from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import type { UserRole } from '../types/civic';
import { OPERATING_ROLES } from '../utils/civicMath';

const ROLE_ICONS: Record<UserRole, React.FC<{ className?: string }>> = {
  EVALUATOR: ShieldCheck,
  WARD_OFFICER: UserCheck,
  HOUSING_SOCIETY: Building2,
  SCHOOL_COORDINATOR: GraduationCap,
};

export const LoginPage: React.FC = () => {
  const { chooseRole } = useStudio();
  const [busyRole, setBusyRole] = useState<UserRole | null>(null);

  const handleSelectRole = async (role: UserRole) => {
    setBusyRole(role);
    try {
      await chooseRole(role, false);
    } finally {
      setBusyRole(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="max-w-3xl w-full mx-auto space-y-6">
        <header className="space-y-1.5 text-center">
          <h1 className="text-2xl font-bold text-slate-900">
            Civic Air Quality Briefing Studio
          </h1>
          <p className="text-sm text-slate-600">
            Select your operating role to open the workspace.
          </p>
        </header>

        <section aria-label="Operating Role Selector" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {OPERATING_ROLES.map((item) => {
            const Icon = ROLE_ICONS[item.role];
            const isBusy = busyRole === item.role;
            return (
              <article
                key={item.role}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 hover:border-blue-300 transition-colors"
              >
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Icon className="w-4 h-4 text-blue-700 shrink-0" aria-hidden="true" />
                    <span>{item.displayName}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    {item.organizationName} · {item.wardZone}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busyRole !== null}
                  onClick={() => void handleSelectRole(item.role)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors"
                >
                  <span>{isBusy ? 'Opening...' : 'Enter workspace'}</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};
