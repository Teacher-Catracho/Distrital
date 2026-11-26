import { useState } from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  FileBarChart2,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AdminDashboard, type AdminSection } from './components/AdminDashboard';
import { DirectorDashboard, type DirectorSection } from './components/DirectorDashboard';
import { DirectorOnboarding } from './components/DirectorOnboarding';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { formatAccountIdentifier } from './utils/saceCalculations';

function MainShell() {
  const { firebaseUser, profile, assignedSchool, loading, logout } = useAuth();
  const [adminSection, setAdminSection] = useState<AdminSection>('overview');
  const [directorSection, setDirectorSection] = useState<DirectorSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white border border-slate-200 p-6 space-y-3 animate-pulse">
          <div className="h-5 bg-slate-200 w-48" />
          <div className="h-4 bg-slate-100 w-full" />
          <div className="h-4 bg-slate-100 w-2/3" />
        </div>
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return <LoginView />;
  }

  if (
    profile.role === 'pending' ||
    profile.needsOnboarding ||
    (profile.role === 'director' && !assignedSchool)
  ) {
    return <DirectorOnboarding />;
  }

  const isAdmin = profile.role === 'admin';

  const adminNav: { key: AdminSection; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Tablero Distrital', icon: LayoutDashboard },
    { key: 'statisticalReports', label: 'Reportes estadísticos', icon: BarChart3 },
    { key: 'schools', label: 'Centros y Directores', icon: Building2 },
    { key: 'users', label: 'Usuarios y Asistentes', icon: Users },
    { key: 'reviews', label: 'Revisión de Reportes', icon: ClipboardCheck },
    { key: 'upload', label: 'Subir Reportes de Centros', icon: Upload },
    { key: 'activities', label: 'Control de Cumplimiento', icon: ListChecks },
    { key: 'consolidated', label: 'Consolidados Excel y PDF', icon: FileSpreadsheet },
  ];

  const directorNav: { key: DirectorSection; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: 'Resumen del Centro', icon: LayoutDashboard },
    { key: 'parteMensual', label: 'Parte Mensual', icon: ClipboardList },
    { key: 'monthly', label: 'Movimientos-SACE (Mensual)', icon: Calendar },
    { key: 'annual', label: 'Estadística Anual', icon: FileBarChart2 },
    { key: 'history', label: 'Historial de Reportes', icon: History },
    { key: 'activities', label: 'Actividades y Evidencias', icon: ListChecks },
  ];

  const currentTitle = isAdmin
    ? adminNav.find((n) => n.key === adminSection)?.label || 'Tablero'
    : directorNav.find((n) => n.key === directorSection)?.label || 'Resumen';

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-5 py-4 border-b border-slate-200">
        <p className="font-display text-base font-bold text-slate-900 whitespace-nowrap">
          SACE Distrito 18-B
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {isAdmin ? 'Dirección Distrital · Omoa' : 'Portal de Dirección'}
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {isAdmin
          ? adminNav.map((item) => {
              const Icon = item.icon;
              const active = adminSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setAdminSection(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })
          : directorNav.map((item) => {
              const Icon = item.icon;
              const active = directorSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setDirectorSection(item.key);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
      </nav>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div className="space-y-0.5 min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">{profile.displayName}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {formatAccountIdentifier(
              profile.email,
              assignedSchool?.saceCode || profile.saceCode,
              profile.role
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          Cerrar sesión
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[260px] h-full bg-white shadow-xl relative z-10">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Cerrar menú"
              className="absolute top-3.5 right-3 p-1.5 text-slate-500 hover:text-slate-900"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarContent()}
          </div>
          <div
            className="flex-1 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between gap-8 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú"
              className="lg:hidden p-1.5 border border-slate-200 text-slate-700"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-500 truncate">
              <span className="font-medium text-slate-900 whitespace-nowrap">
                {isAdmin ? 'Administración Distrital' : assignedSchool?.name}
              </span>
              <span aria-hidden="true">/</span>
              <span className="whitespace-nowrap truncate">{currentTitle}</span>
            </div>
          </div>

          <div className="text-xs text-slate-600 whitespace-nowrap shrink-0 hidden sm:block">
            {isAdmin
              ? profile.adminPosition === 'asistente_tecnico'
                ? 'Asistente Técnico · Dirección Distrital'
                : 'Administrador Distrital'
              : `Director(a) · ${assignedSchool?.saceCode}`}
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-8 max-w-[1440px] w-full mx-auto">
          {isAdmin ? (
            <AdminDashboard
              profile={profile}
              activeSection={adminSection}
              onSectionChange={setAdminSection}
            />
          ) : (
            <DirectorDashboard
              profile={profile}
              school={assignedSchool!}
              activeSection={directorSection}
              onSectionChange={setDirectorSection}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainShell />
      </AuthProvider>
    </ErrorBoundary>
  );
}
