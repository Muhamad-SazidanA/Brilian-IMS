import React, { useMemo } from 'react';
import { ShieldAlert, Lock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DocumentClassification } from '../../types';

interface PermissionGateProps {
  classification?: DocumentClassification | string;
  division?: string;
  action?: 'view' | 'download';
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * PermissionGate evaluates client-side dual-axis access according to rbac_oracle.js
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  classification = 'Publik',
  division = 'General',
  action = 'view',
  children,
  fallback,
}) => {
  const { user } = useAuth();

  const access = useMemo(() => {
    if (!user) {
      return { allowed: false, reason: 'Pengguna belum terautentikasi.' };
    }

    const role = user.role;
    const userDiv = user.division || 'General';
    const userLvl = user.level || 'L1';
    const levelNum = parseInt(userLvl.replace('L', ''), 10) || 1;

    // Executive override
    if (role === 'admin' || userDiv === 'ALL' || (userDiv === 'Executive' && userLvl === 'L5')) {
      return { allowed: true };
    }

    if (classification === 'Publik') {
      return { allowed: true };
    }

    if (classification === 'Internal') {
      if (action === 'view') return { allowed: true };
      if (action === 'download') {
        if (levelNum >= 2) return { allowed: true };
        return { allowed: false, reason: 'Tingkat L1 hanya memiliki hak pratinjau untuk dokumen Internal.' };
      }
    }

    if (classification === 'Rahasia') {
      if (userDiv !== division) {
        return { allowed: false, reason: `Akses ditolak: Dokumen Rahasia dibatasi khusus untuk divisi ${division}.` };
      }
      if (levelNum < 2) {
        return { allowed: false, reason: 'Tingkat L1 tidak memiliki hak akses terhadap dokumen Rahasia.' };
      }
      if (action === 'view') return { allowed: true };
      if (action === 'download') {
        if (levelNum >= 3) return { allowed: true };
        return { allowed: false, reason: 'Tingkat L2 hanya memiliki hak pratinjau untuk dokumen Rahasia.' };
      }
    }

    if (classification === 'Sangat Rahasia') {
      if (userDiv !== division) {
        return { allowed: false, reason: `Akses ditolak: Dokumen Sangat Rahasia dibatasi khusus untuk divisi ${division}.` };
      }
      if (levelNum < 4) {
        return { allowed: false, reason: 'Tingkat L1–L3 tidak memiliki hak akses terhadap dokumen Sangat Rahasia.' };
      }
      if (action === 'view') return { allowed: true };
      if (action === 'download') {
        if (levelNum >= 5) return { allowed: true };
        return { allowed: false, reason: 'Tingkat L4 hanya memiliki hak pratinjau untuk dokumen Sangat Rahasia.' };
      }
    }

    return { allowed: false, reason: 'Akses dibatasi oleh kebijakan keamanan organisasi.' };
  }, [user, classification, division, action]);

  if (access.allowed) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return (
    <div className="p-4 rounded-sm border border-danger/30 bg-danger-subtle text-danger flex items-start gap-3 text-xs">
      <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Akses Terbatas ({action === 'view' ? 'Pratinjau' : 'Unduhan'})</p>
        <p className="mt-0.5 text-slate leading-relaxed">{access.reason}</p>
      </div>
    </div>
  );
};
