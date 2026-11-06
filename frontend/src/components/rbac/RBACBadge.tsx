import React from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, Eye, Download, Users } from 'lucide-react';
import { UserLevel, DocumentClassification } from '../../types';

interface LevelBadgeProps {
  level?: UserLevel | string;
  size?: 'sm' | 'md';
}

export const LevelBadge: React.FC<LevelBadgeProps> = ({ level = 'L1', size = 'sm' }) => {
  const levelDescriptions: Record<string, string> = {
    L1: 'Staff',
    L2: 'Senior Staff',
    L3: 'Lead / Supervisor',
    L4: 'Manager',
    L5: 'Director / Executive',
  };

  const levelStyles: Record<string, string> = {
    L1: 'bg-mist text-slate border-hairline',
    L2: 'bg-accent-subtle text-accent border-accent/20',
    L3: 'bg-accent-subtle text-accent-dark border-accent/30 font-semibold',
    L4: 'bg-warning-subtle text-warning border-warning/30 font-semibold',
    L5: 'bg-ink text-paper border-ink font-semibold',
  };

  const currentStyle = levelStyles[level] || 'bg-mist text-slate border-hairline';
  const desc = levelDescriptions[level] || 'Level ' + level;
  const padding = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      title={`Tingkat Akses: ${level} (${desc})`}
      className={`inline-flex items-center gap-1 font-mono rounded-xs border ${currentStyle} ${padding} transition-colors`}
    >
      <span>{level}</span>
      <span className="text-[10px] opacity-75 font-sans">• {desc}</span>
    </span>
  );
};

interface DivisionBadgeProps {
  division?: string;
}

export const DivisionBadge: React.FC<DivisionBadgeProps> = ({ division = 'General' }) => {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-paper border border-hairline text-slate text-xs font-sans">
      <Users className="w-3 h-3 text-slate-muted stroke-[1.5]" />
      <span>{division}</span>
    </span>
  );
};

interface ClassificationBadgeProps {
  classification?: DocumentClassification | string;
}

export const ClassificationBadge: React.FC<ClassificationBadgeProps> = ({ classification = 'Internal' }) => {
  switch (classification) {
    case 'Publik':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-success-subtle text-success border border-success/30 text-[11px] font-medium font-sans">
          <ShieldCheck className="w-3 h-3 stroke-[1.7]" />
          <span>Publik</span>
        </span>
      );
    case 'Internal':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-accent-subtle text-accent border border-accent/30 text-[11px] font-medium font-sans">
          <Shield className="w-3 h-3 stroke-[1.7]" />
          <span>Internal</span>
        </span>
      );
    case 'Rahasia':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-warning-subtle text-warning border border-warning/30 text-[11px] font-medium font-sans">
          <Lock className="w-3 h-3 stroke-[1.7]" />
          <span>Rahasia</span>
        </span>
      );
    case 'Sangat Rahasia':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-danger-subtle text-danger border border-danger/30 text-[11px] font-medium font-sans">
          <ShieldAlert className="w-3 h-3 stroke-[1.7]" />
          <span>Sangat Rahasia</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-mist text-slate border border-hairline text-[11px] font-sans">
          <span>{classification}</span>
        </span>
      );
  }
};
