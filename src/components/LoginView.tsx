import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  Lock,
  School,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function LoginView() {
  const { signInWithSace, authError, clearAuthError } = useAuth();

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (loginIdentifier.trim().length < 2) {
      setLocalError('Ingresa tu código SACE o usuario.');
      return;
    }
    if (!loginPassword) {
      setLocalError('Ingresa tu contraseña.');
      return;
    }

    setBusy(true);
    try {
      await signInWithSace(loginIdentifier, loginPassword);
    } finally {
      setBusy(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 leading-tight">
          SEDI DISTRITO 18-B OMOA
          <span className="block text-[11px] font-sans font-medium tracking-normal text-slate-500 mt-0.5">
            Version en fase Beta
          </span>
        </span>
        <span className="text-xs text-slate-500 whitespace-nowrap shrink-0">
          Secretaría de Educación · Cortés
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl bg-white border border-slate-200 grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-6 p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between gap-8">
            <div className="space-y-4">
              <p className="text-xs font-medium text-blue-700">
                Dirección Departamental de Educación de Cortés
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 leading-tight text-balance">
                Sistema Estadístico Distrital N° 18-B, Omoa
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                Sistema de control estadístico distrital SEDI
                <span className="block mt-2 text-xs text-slate-500 leading-relaxed">
                  Plataforma creada por Lic. Obed Alberto López Nolasco
                </span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-slate-200">
              <div className="space-y-1.5">
                <School className="w-4 h-4 text-blue-700" />
                <h2 className="text-xs font-semibold text-slate-900">Directores</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Captura guiada con cálculo automático de totales y alertas de cuadre.
                </p>
              </div>
              <div className="space-y-1.5">
                <Lock className="w-4 h-4 text-blue-700" />
                <h2 className="text-xs font-semibold text-slate-900">Revisión Distrital</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Borradores editables, devolución con observaciones y aprobación oficial.
                </p>
              </div>
              <div className="space-y-1.5">
                <FileSpreadsheet className="w-4 h-4 text-blue-700" />
                <h2 className="text-xs font-semibold text-slate-900">Excel y PDF</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Cuadros consolidados por nivel y centro listos para firma y entrega.
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 p-8 lg:p-10 bg-slate-50/60 flex flex-col justify-center gap-5">
            <div className="space-y-1">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Iniciar sesión
              </h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ingresa con tu <strong>Código SACE</strong> o usuario institucional y tu contraseña asignada.
              </p>
            </div>

            {displayError && (
              <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-700">
                {displayError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Código SACE o usuario
                </label>
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="Ej. 050300012B02"
                  autoComplete="username"
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full px-3 pr-10 py-2 text-sm border border-slate-300 bg-white focus:outline-none focus:border-blue-700"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    aria-label={showLoginPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showLoginPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4 shrink-0" />
                {busy ? 'Ingresando...' : 'Ingresar a la plataforma'}
              </button>
            </form>

            <p className="text-xs text-slate-500 pt-2 border-t border-slate-200">
              Las cuentas de acceso para directores y personal técnico son habilitadas únicamente por la Dirección Distrital N° 18-B.
            </p>
          </div>
        </div>
      </main>

      <footer className="px-6 py-4 border-t border-slate-200 bg-white text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>Distrito Educativo N° 18-B, Omoa</span>
        <span>Año Lectivo 2026</span>
      </footer>
    </div>
  );
}
