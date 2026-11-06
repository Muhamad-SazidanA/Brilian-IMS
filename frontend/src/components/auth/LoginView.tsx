import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Role } from '../../types';

export const LoginView: React.FC = () => {
  const { login, error, clearError } = useAuth();
  const [username, setUsername] = useState('admin_brilian');
  const [password, setPassword] = useState('securepassword');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setLocalError('Mohon isi username dan password');
      return;
    }
    setLocalError(null);
    clearError();
    setIsSubmitting(true);
    try {
      await login(username, password);
    } catch (err: any) {
      setLocalError(err.message || 'Login gagal. Periksa username dan password Anda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectDemoRole = (role: Role, user: string, pass: string) => {
    setUsername(user);
    setPassword(pass);
    setLocalError(null);
    clearError();
    setIsSubmitting(true);
    login(user, pass).catch((err: any) => {
      setLocalError(err.message || 'Login gagal.');
      setIsSubmitting(false);
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-12">
      <div className="max-w-md w-full space-y-8 bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center relative">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 text-white shadow-lg shadow-sky-500/20 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Brilian IDMS</h2>
          <p className="text-sm text-slate-400 mt-1">
            Enterprise Intelligent Document Management System
          </p>
          <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
            On-Premise AI & Wasm Engine
          </div>
        </div>

        {(error || localError) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 flex items-start gap-2 animate-fadeIn">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium">Otentikasi Gagal</p>
              <p className="text-xs text-red-300/80 mt-0.5">{error || localError}</p>
            </div>
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
              Username
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="misal: admin_brilian"
                className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm rounded-lg shadow-lg shadow-sky-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Memverifikasi Sesi...</span>
              </>
            ) : (
              <span>Masuk ke Sistem</span>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80">
          <p className="text-xs font-medium text-slate-400 text-center mb-3">
            Simulasi Role / Demo Cepat (RBAC):
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => selectDemoRole('admin', 'admin_brilian', 'securepassword')}
              className="px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-sky-400 font-semibold group-hover:text-sky-300">
                <span>👑</span> Admin
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">admin_brilian</div>
            </button>

            <button
              type="button"
              onClick={() => selectDemoRole('reviewer', 'reviewer_1', 'reviewerpass')}
              className="px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-indigo-400 font-semibold group-hover:text-indigo-300">
                <span>🔍</span> Reviewer
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">reviewer_1</div>
            </button>

            <button
              type="button"
              onClick={() => selectDemoRole('uploader', 'uploader_1', 'uploaderpass')}
              className="px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold group-hover:text-emerald-300">
                <span>📤</span> Uploader
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">uploader_1</div>
            </button>

            <button
              type="button"
              onClick={() => selectDemoRole('viewer', 'viewer_1', 'viewerpass')}
              className="px-2.5 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-left text-xs transition-colors group"
            >
              <div className="flex items-center gap-1.5 text-amber-400 font-semibold group-hover:text-amber-300">
                <span>👁️</span> Viewer
              </div>
              <div className="text-[10px] text-slate-400 truncate mt-0.5">viewer_1</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
