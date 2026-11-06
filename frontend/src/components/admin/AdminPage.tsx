import React, { useState, useEffect } from 'react';
import {
  Users,
  Shield,
  Sliders,
  Check,
  X,
  AlertCircle,
  Save,
  RotateCcw,
  Eye,
  Download,
  Lock,
  Layers,
  FileText,
} from 'lucide-react';
import { User, Role, UserLevel, DocumentClassification } from '../../types';
import { LevelBadge, DivisionBadge, ClassificationBadge } from '../rbac/RBACBadge';
import { WatermarkOverlay } from '../viewer/WatermarkOverlay';
import { api } from '../../api/client';

export const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'rbac' | 'watermark'>('users');

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ division: string; level: UserLevel; role: Role; name: string }>({
    division: 'General',
    level: 'L1',
    role: 'viewer',
    name: '',
  });

  // Watermark state
  const [watermarkConfig, setWatermarkConfig] = useState<{
    default_opacity: number;
    default_angle: number;
    banner_text: string;
  }>({
    default_opacity: 0.20,
    default_angle: -45,
    banner_text: 'BRILIAN INTELLIGENT DMS',
  });
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const availableDivisions = ['Finance', 'HR', 'Legal', 'IT', 'Marketing', 'Operations', 'Executive', 'ALL'];
  const availableLevels: UserLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5'];
  const availableRoles: Role[] = ['admin', 'reviewer', 'uploader', 'viewer'];

  // Load initial data
  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      const [userList, wmConfig] = await Promise.all([
        api.getAdminUsers(),
        api.getWatermarkConfig(),
      ]);
      setUsers(userList);
      if (wmConfig) {
        setWatermarkConfig(wmConfig);
      }
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    }
  };

  const handleStartEdit = (u: User) => {
    setEditingUserId(u.id);
    setEditForm({
      name: u.name || '',
      division: u.division || 'General',
      level: u.level || 'L1',
      role: u.role,
    });
  };

  const handleSaveUser = async (userId: string) => {
    try {
      const res = await api.updateAdminUser(userId, editForm);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...editForm } : u)));
      setEditingUserId(null);
      setSaveSuccess(`Pengguna ${res.user?.name || userId} berhasil diperbarui.`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Gagal memperbarui pengguna');
      setTimeout(() => setSaveError(null), 4000);
    }
  };

  const handleSaveWatermark = async () => {
    if (watermarkConfig.default_opacity < 0.15 || watermarkConfig.default_opacity > 0.25) {
      setSaveError('Opasitas watermark harus berada strictly antara 15% (0.15) dan 25% (0.25).');
      return;
    }

    try {
      await api.updateWatermarkConfig({
        opacity: watermarkConfig.default_opacity,
        angle: watermarkConfig.default_angle,
        banner_text: watermarkConfig.banner_text,
      });
      setSaveSuccess('Konfigurasi Dynamic Watermarking berhasil disimpan.');
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Gagal menyimpan konfigurasi watermark');
      setTimeout(() => setSaveError(null), 4000);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-mist overflow-y-auto">
      {/* Header */}
      <div className="bg-paper border-b border-hairline px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold text-ink tracking-tight flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent stroke-[1.7]" />
            <span>Administrasi Keamanan & Kontrol Akses</span>
          </h2>
          <p className="text-xs text-slate mt-0.5">
            Manajemen matriks RBAC divisi & tingkat (L1–L5), direktori pengguna, dan kebijakan Dynamic Watermarking.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center bg-mist p-0.5 rounded-sm border border-hairline text-xs font-medium self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs transition-colors ${
              activeTab === 'users' ? 'bg-accent text-white shadow-none' : 'text-slate hover:text-ink'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Pengguna</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rbac')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs transition-colors ${
              activeTab === 'rbac' ? 'bg-accent text-white shadow-none' : 'text-slate hover:text-ink'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Matriks RBAC</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('watermark')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xs transition-colors ${
              activeTab === 'watermark' ? 'bg-accent text-white shadow-none' : 'text-slate hover:text-ink'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Dynamic Watermarking</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveSuccess && (
        <div className="mx-6 mt-4 p-3 rounded-sm bg-success-subtle border border-success/30 text-success text-xs flex items-center gap-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}
      {saveError && (
        <div className="mx-6 mt-4 p-3 rounded-sm bg-danger-subtle border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Main Body */}
      <div className="p-6">
        {/* TAB 1: User Directory & RBAC Attributes */}
        {activeTab === 'users' && (
          <div className="bg-paper rounded-md border border-hairline overflow-hidden">
            <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Direktori Pengguna & Atribut Keamanan</h3>
                <p className="text-xs text-slate mt-0.5">
                  Tetapkan divisi dan tingkat kewenangan (L1: Staf hingga L5: Direktur) untuk setiap akun.
                </p>
              </div>
              <span className="font-mono text-xs text-slate bg-mist px-2 py-0.5 rounded-xs border border-hairline">
                {users.length} Pengguna Terdaftar
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-mist text-slate border-b border-hairline font-medium">
                    <th className="px-5 py-2.5">Pengguna</th>
                    <th className="px-5 py-2.5">Peran Sistem</th>
                    <th className="px-5 py-2.5">Divisi Organisasi</th>
                    <th className="px-5 py-2.5">Tingkat Akses (L1–L5)</th>
                    <th className="px-5 py-2.5 text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {users.map((u) => {
                    const isEditing = editingUserId === u.id;
                    return (
                      <tr key={u.id} className="hover:bg-mist/40 transition-colors">
                        <td className="px-5 py-3">
                          <div className="font-medium text-ink">{u.name || u.username}</div>
                          <div className="font-mono text-[11px] text-slate-muted">@{u.username} • {u.id}</div>
                        </td>

                        <td className="px-5 py-3">
                          {isEditing ? (
                            <select
                              value={editForm.role}
                              onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                              className="bg-paper border border-hairline rounded-xs px-2 py-1 text-xs text-ink focus:outline-none"
                            >
                              {availableRoles.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded-xs bg-mist border border-hairline text-slate">
                              {u.role}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3">
                          {isEditing ? (
                            <select
                              value={editForm.division}
                              onChange={(e) => setEditForm({ ...editForm, division: e.target.value })}
                              className="bg-paper border border-hairline rounded-xs px-2 py-1 text-xs text-ink focus:outline-none"
                            >
                              {availableDivisions.map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                          ) : (
                            <DivisionBadge division={u.division} />
                          )}
                        </td>

                        <td className="px-5 py-3">
                          {isEditing ? (
                            <select
                              value={editForm.level}
                              onChange={(e) => setEditForm({ ...editForm, level: e.target.value as UserLevel })}
                              className="bg-paper border border-hairline rounded-xs px-2 py-1 text-xs text-ink focus:outline-none"
                            >
                              {availableLevels.map((lvl) => (
                                <option key={lvl} value={lvl}>{lvl}</option>
                              ))}
                            </select>
                          ) : (
                            <LevelBadge level={u.level} />
                          )}
                        </td>

                        <td className="px-5 py-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSaveUser(u.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xs bg-accent text-white hover:bg-accent-dark transition-colors"
                              >
                                <Save className="w-3 h-3" />
                                <span>Simpan</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="px-2 py-1 rounded-xs border border-hairline text-slate hover:text-ink hover:bg-mist transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(u)}
                              className="px-2.5 py-1 rounded-xs border border-hairline text-slate hover:text-ink hover:bg-mist transition-colors"
                            >
                              Ubah Atribut
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Dual-Axis RBAC Matrix */}
        {activeTab === 'rbac' && (
          <div className="space-y-6">
            <div className="bg-paper rounded-md border border-hairline p-5">
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Layers className="w-4 h-4 text-accent stroke-[1.7]" />
                <span>Matriks Hak Akses Ganda: Divisi & Tingkat (L1–L5) vs Klasifikasi Dokumen</span>
              </h3>
              <p className="text-xs text-slate mt-1 leading-relaxed">
                Evaluasi izin pratinjau (<Eye className="w-3 h-3 inline text-slate" /> Pratinjau) dan unduh berkas (<Download className="w-3 h-3 inline text-slate" /> Unduh)
                secara independen berdasarkan klasifikasi kerahasiaan dokumen.
              </p>

              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-xs border border-hairline">
                  <thead>
                    <tr className="bg-mist text-ink border-b border-hairline font-semibold">
                      <th className="px-4 py-3 border-r border-hairline">Klasifikasi Dokumen</th>
                      <th className="px-4 py-3 border-r border-hairline">Cakupan Divisi</th>
                      <th className="px-3 py-3 text-center border-r border-hairline">L1 (Staff)</th>
                      <th className="px-3 py-3 text-center border-r border-hairline">L2 (Senior Staff)</th>
                      <th className="px-3 py-3 text-center border-r border-hairline">L3 (Supervisor)</th>
                      <th className="px-3 py-3 text-center border-r border-hairline">L4 (Manager)</th>
                      <th className="px-3 py-3 text-center">L5 (Director)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {/* 1. Publik */}
                    <tr className="hover:bg-mist/30 transition-colors">
                      <td className="px-4 py-3 border-r border-hairline">
                        <ClassificationBadge classification="Publik" />
                        <div className="text-[11px] text-slate mt-1">Dokumen umum organisasi</div>
                      </td>
                      <td className="px-4 py-3 border-r border-hairline font-medium text-slate">
                        Semua Divisi
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                    </tr>

                    {/* 2. Internal */}
                    <tr className="hover:bg-mist/30 transition-colors">
                      <td className="px-4 py-3 border-r border-hairline">
                        <ClassificationBadge classification="Internal" />
                        <div className="text-[11px] text-slate mt-1">Operasional internal</div>
                      </td>
                      <td className="px-4 py-3 border-r border-hairline font-medium text-slate">
                        Semua Divisi
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-accent-subtle/40">
                        <span className="font-mono text-[11px] text-accent font-semibold">Lihat Saja</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                    </tr>

                    {/* 3. Rahasia */}
                    <tr className="hover:bg-mist/30 transition-colors">
                      <td className="px-4 py-3 border-r border-hairline">
                        <ClassificationBadge classification="Rahasia" />
                        <div className="text-[11px] text-slate mt-1">Kerahasiaan divisi</div>
                      </td>
                      <td className="px-4 py-3 border-r border-hairline">
                        <div className="font-medium text-ink">Divisi Asal</div>
                        <div className="text-[10px] text-danger">Lintas divisi ditolak (403)</div>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-danger-subtle/40">
                        <span className="font-mono text-[11px] text-danger">Ditolak</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-accent-subtle/40">
                        <span className="font-mono text-[11px] text-accent font-semibold">Lihat Saja</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                      <td className="px-3 py-3 text-center bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                    </tr>

                    {/* 4. Sangat Rahasia */}
                    <tr className="hover:bg-mist/30 transition-colors">
                      <td className="px-4 py-3 border-r border-hairline">
                        <ClassificationBadge classification="Sangat Rahasia" />
                        <div className="text-[11px] text-slate mt-1">Kerahasiaan puncak</div>
                      </td>
                      <td className="px-4 py-3 border-r border-hairline">
                        <div className="font-medium text-ink">Divisi Asal</div>
                        <div className="text-[10px] text-danger">Lintas divisi ditolak (403)</div>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-danger-subtle/40">
                        <span className="font-mono text-[11px] text-danger">Ditolak</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-danger-subtle/40">
                        <span className="font-mono text-[11px] text-danger">Ditolak</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-danger-subtle/40">
                        <span className="font-mono text-[11px] text-danger">Ditolak</span>
                      </td>
                      <td className="px-3 py-3 text-center border-r border-hairline bg-accent-subtle/40">
                        <span className="font-mono text-[11px] text-accent font-semibold">Lihat Saja</span>
                      </td>
                      <td className="px-3 py-3 text-center bg-success-subtle/30">
                        <span className="font-mono text-[11px] text-success">Lihat & Unduh</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Special Override Notice */}
              <div className="mt-4 p-3 rounded-sm bg-mist border border-hairline text-xs flex items-center gap-3">
                <Shield className="w-4 h-4 text-accent stroke-[1.7] flex-shrink-0" />
                <div>
                  <span className="font-semibold text-ink">Executive Override: </span>
                  <span className="text-slate">
                    Pengguna dengan peran <code className="font-mono bg-paper px-1 py-0.5 rounded border border-hairline">admin</code>,
                    divisi <code className="font-mono bg-paper px-1 py-0.5 rounded border border-hairline">ALL</code>, atau
                    divisi <code className="font-mono bg-paper px-1 py-0.5 rounded border border-hairline">Executive (L5)</code>
                    memiliki hak akses universal tanpa batas untuk seluruh berkas organisasi.
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Dynamic Watermarking Policy */}
        {activeTab === 'watermark' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form settings */}
            <div className="lg:col-span-5 bg-paper rounded-md border border-hairline p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-accent stroke-[1.7]" />
                  <span>Parameter Dynamic Watermarking</span>
                </h3>
                <p className="text-xs text-slate mt-1 leading-relaxed">
                  Watermark disematkan secara dinamis pada setiap pratinjau dokumen dan unduhan berkas.
                  Nilai opasitas dibatasi strictly antara 15% dan 25% sesuai standar compliance perbankan & enterprise.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                {/* Opacity slider */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label className="font-medium text-ink">
                      Opasitas Watermark (15% – 25%)
                    </label>
                    <span className="font-mono text-accent font-semibold">
                      {Math.round(watermarkConfig.default_opacity * 100)}% ({watermarkConfig.default_opacity.toFixed(2)})
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.15"
                    max="0.25"
                    step="0.01"
                    value={watermarkConfig.default_opacity}
                    onChange={(e) =>
                      setWatermarkConfig({ ...watermarkConfig, default_opacity: parseFloat(e.target.value) })
                    }
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-muted font-mono mt-1">
                    <span>Min: 0.15 (15%)</span>
                    <span>Default: 0.20 (20%)</span>
                    <span>Max: 0.25 (25%)</span>
                  </div>
                </div>

                {/* Angle */}
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">
                    Sudut Kemiringan Diagonal (Derajat)
                  </label>
                  <input
                    type="number"
                    value={watermarkConfig.default_angle}
                    onChange={(e) =>
                      setWatermarkConfig({ ...watermarkConfig, default_angle: parseFloat(e.target.value) || -45 })
                    }
                    className="w-full bg-paper border border-hairline rounded-sm px-3 py-1.5 text-xs font-mono text-ink focus:outline-none"
                    placeholder="-45"
                  />
                  <p className="text-[11px] text-slate mt-1">Standar diagonal optimal: -45.0 derajat</p>
                </div>

                {/* Banner Text */}
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">
                    Teks Identitas Banner / Klasifikasi
                  </label>
                  <input
                    type="text"
                    value={watermarkConfig.banner_text}
                    onChange={(e) =>
                      setWatermarkConfig({ ...watermarkConfig, banner_text: e.target.value })
                    }
                    className="w-full bg-paper border border-hairline rounded-sm px-3 py-1.5 text-xs text-ink focus:outline-none"
                    placeholder="BRILIAN INTELLIGENT DMS"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-hairline flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setWatermarkConfig({
                      default_opacity: 0.20,
                      default_angle: -45,
                      banner_text: 'BRILIAN INTELLIGENT DMS',
                    })
                  }
                  className="inline-flex items-center gap-1.5 text-xs text-slate hover:text-ink px-3 py-1.5 rounded-sm border border-hairline hover:bg-mist transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Default</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveWatermark}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-accent hover:bg-accent-dark px-4 py-1.5 rounded-sm transition-colors"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Simpan Kebijakan</span>
                </button>
              </div>
            </div>

            {/* Live Interactive Preview Box */}
            <div className="lg:col-span-7 bg-paper rounded-md border border-hairline p-5 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-hairline mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-accent stroke-[1.7]" />
                    <span>Pratinjau Langsung Dynamic Watermark</span>
                  </h3>
                  <p className="text-xs text-slate mt-0.5">
                    Simulasi penampakan cap air diagonal di atas teks dokumen sesuai pengaturan aktif.
                  </p>
                </div>
                <span className="font-mono text-[11px] text-accent bg-accent-subtle px-2 py-0.5 rounded-xs border border-accent/20">
                  Live Preview
                </span>
              </div>

              {/* Document Simulator Canvas */}
              <div className="relative flex-1 min-h-[320px] bg-paper border border-hairline rounded-sm p-6 overflow-hidden shadow-none select-none">
                {/* Simulated Document Prose */}
                <div className="space-y-3 text-slate leading-relaxed font-sans text-xs">
                  <div className="font-bold text-sm text-ink pb-2 border-b border-hairline">
                    SURAT KESEPAKATAN KERJA SAMA (PKS) TAHUN 2026
                  </div>
                  <p>
                    Pada hari ini, disepakati perjanjian penyediaan lisensi Brilian Intelligent Document Management System
                    on-premise single-binary architecture.
                  </p>
                  <p>
                    Klausul 1: Seluruh dokumen dengan klasifikasi Rahasia dan Sangat Rahasia terikat oleh pembatasan akses
                    berdasarkan matriks divisi dan tingkat jabatan (L1–L5).
                  </p>
                  <p>
                    Klausul 2: Setiap akses pratinjau maupun pengunduhan berkas wajib distempel cap air diagonal (dynamic watermark)
                    yang memuat nama lengkap pemohon, identitas user ID, dan stempel waktu UTC.
                  </p>
                  <p>
                    Klausul 3: Penerobos keamanan, penyalahgunaan tangkapan layar, atau distribusi tidak sah dapat dilacak
                    secara forensik melalui jejak identitas yang tertanam secara permanen pada berkas.
                  </p>
                </div>

                {/* Live Watermark Overlay Component */}
                <WatermarkOverlay
                  options={{
                    Opacity: watermarkConfig.default_opacity,
                    DiagonalAngle: watermarkConfig.default_angle,
                    FullName: 'Budi Santoso',
                    UserID: 'usr-admin-1',
                    Timestamp: new Date().toISOString(),
                  }}
                />
              </div>

              <div className="mt-3 text-[11px] text-slate-muted font-mono flex items-center justify-between">
                <span>Format Cap Air: FullName | UserID | Timestamp (ISO UTC)</span>
                <span>Enforced Server-Side: Non-Bypassable</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
