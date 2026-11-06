# Brilian IDMS — Canonical Design System & Style Guide

**Document Reference**: `docs/STYLE_GUIDE.md`  
**Version**: 1.0.0  
**Author**: worker_m1 (Design Systems & Frontend Architecture)  
**Date**: 2026-11-06  
**Reference Authority**: `C:\Zidan\BrilianAi\design.md`  
**Compliance Target**: React 18 + Vite 5 + Tailwind CSS v3  
**Status**: Canonical Standard (Single Source of Truth)  

---

## 1. Principles & Tenets

The Brilian IDMS design system adheres strictly to the canonical design philosophy established in `C:\Zidan\BrilianAi\design.md`:

1. **"Dokumen Dulu, Chrome Belakangan" (Document First, Chrome Later)**:  
   The application is an executive work tool for data, documents, and comprehension. The UI must remain calm, quiet, and unobtrusive. It must never look like an arcade dashboard or a glowing spaceship control panel.
2. **Single Accent Color Discipline (`#2F5DFF`)**:  
   One primary accent blue is used sparingly across the entire product. It is strictly reserved for primary actions, active tabs, focus rings, and explicit link text. Decorative color splashes and random saturated elements are strictly prohibited.
3. **Hairline Borders Over Heavy Shadows**:  
   Panels, cards, tables, and rows use crisp 1px hairline borders (`#E7E7E5`). Box shadows are strictly forbidden on standard static cards and rows. Shadows are permitted exclusively on floating, elevated elements (floating chat drawer, modal overlays, dropdown menus, toasts).
4. **Monospace Exclusively for Genuine Technical Data**:  
   Numbers, chunk counts, IDs, SHA hashes, percentages, byte sizes, and timestamps strictly use `IBM Plex Mono`. All prose, titles, descriptions, and labels use `IBM Plex Sans`. Monospace is never used for general prose.
5. **Sequential Processes Rendered as Numbered Sequences**:  
   Ingestion pipelines, chunking phases, and multi-step workflows must be presented as numbered steps (e.g., `1 → 2 → 3 → 4`), never as unranked bullet points.
6. **Zero Emojis as UI Icons**:  
   All iconography is provided exclusively via `lucide-react` (or standard SVG equivalents) rendered at 18–20px with a 1.5–1.7 stroke width. Emojis (`👑`, `🔍`, `📤`, `👁️`, etc.) are strictly prohibited.
7. **Strict Sentence Case Everywhere**:  
   All labels, buttons, headers, tooltips, and tab titles use sentence case (e.g., "Unggah dokumen", "Tinjau berkas"). Shouting ALL CAPS is strictly forbidden.
8. **Defensive Dynamic Watermarking**:  
   All document viewers and downloads must enforce an immutable, diagonal repeating watermark showing accessor full name, user ID, and timestamp at 15–25% opacity.

---

## 2. Design Tokens

### 2.1 Color Palette Table & Semantic CSS Custom Properties

| Token Name | Tailwind Class | CSS Custom Property | Hex Value | Semantic Usage |
|---|---|---|---|---|
| **Paper** | `bg-paper`, `text-paper` | `--color-paper` | `#FFFFFF` | Primary card surface, modal body, canvas base |
| **Mist** | `bg-mist`, `text-mist` | `--color-mist` | `#F6F6F4` | App canvas background, secondary panels, subtle hovers |
| **Ink** | `text-ink`, `bg-ink` | `--color-ink` | `#14161B` | Primary headings, body text, high-contrast buttons |
| **Slate** | `text-slate`, `border-slate` | `--color-slate` | `#6B7078` | Secondary labels, descriptions, inactive icons, metadata |
| **Slate Muted** | `text-slate-muted` | `--color-slate-muted` | `#8E939C` | Tertiary text, helper notes, disabled states |
| **Hairline** | `border-hairline` | `--color-hairline` | `#E7E7E5` | Standard 1px borders, table dividers, card outlines |
| **Border Subtle**| `border-border-subtle` | `--color-border-subtle` | `#F0F0EE` | Extremely faint inner grid lines |
| **Accent** | `bg-accent`, `text-accent` | `--color-accent` | `#2F5DFF` | Primary button, active tab indicator, link, focus ring |
| **Accent Dark**| `bg-accent-dark` | `--color-accent-dark` | `#2447D6` | Hover state for primary accent buttons |
| **Accent Subtle**| `bg-accent-subtle` | `--color-accent-subtle` | `#EEF2FF` | Active row highlight, selected tag background |
| **Success** | `text-success`, `bg-success` | `--color-success` | `#1C8A5D` | Approved status, verified magic bytes, healthy service |
| **Success Subtle**| `bg-success-subtle` | `--color-success-subtle`| `#ECFDF5` | Green status chip background |
| **Warning** | `text-warning`, `bg-warning` | `--color-warning` | `#B7791F` | Pending review, quota warning, draft status |
| **Warning Subtle**| `bg-warning-subtle` | `--color-warning-subtle`| `#FFFBEB` | Warning chip background |
| **Danger** | `text-danger`, `bg-danger` | `--color-danger` | `#D64545` | Malicious file rejected, delete action, quarantine alert |
| **Danger Subtle**| `bg-danger-subtle` | `--color-danger-subtle` | `#FEF2F2` | Error banner background |

### 2.2 Typography Scale (IBM Plex Sans & Mono)

| Typography Level | Font Family | Size / Line Height | Weight | Tailwind Classes | Usage |
|---|---|---|---|---|---|
| **Page Title** | IBM Plex Sans | 28px / 34px | Semibold (600) | `text-[28px] leading-[34px] font-semibold text-ink` | Top of main views (DMS, Admin, Dashboard) |
| **Section Title (h2)** | IBM Plex Sans | 18px / 24px | Semibold (600) | `text-[18px] leading-6 font-semibold text-ink` | Modal headers, panel headers, section dividers |
| **Item Title (h3)** | IBM Plex Sans | 15px / 20px | Semibold (600) | `text-[15px] leading-5 font-semibold text-ink` | Document title in row, card header, widget title |
| **Body Default** | IBM Plex Sans | 14px / 22px | Regular (400) | `text-sm leading-[22px] text-ink` | Standard paragraph text, table body cells |
| **Meta / Caption** | IBM Plex Sans | 13px / 18px | Regular (400) | `text-[13px] leading-[18px] text-slate` | Secondary descriptions, timestamps, helper text |
| **Technical Data** | IBM Plex Mono | 13px / 18px | Medium (500) | `text-[13px] leading-[18px] font-mono font-medium text-slate` | Chunk IDs, file sizes, %, hashes, dates |
| **Micro Tag** | IBM Plex Mono | 11px / 14px | Medium (500) | `text-[11px] leading-[14px] font-mono font-medium text-slate` | Version badge, page numbers, status chips |

### 2.3 Spacing Scale (4px Base Grid)

The system strictly adheres to the standard 4px base grid without custom overrides:
- `gap-1` / `p-1` / `m-1`: 4px (micro spacing between icon and text)
- `gap-2` / `p-2` / `m-2`: 8px (compact tag padding, tight button padding)
- `gap-3` / `p-3` / `m-3`: 12px (form element gap, chat bubble padding)
- `gap-4` / `p-4` / `m-4`: 16px (standard card padding, row vertical padding)
- `gap-6` / `p-6` / `m-6`: 24px (section margins, panel gap)
- `gap-8` / `p-8` / `m-8`: 32px (major layout gutter, modal padding)

### 2.4 Border Radii & Elevation Hierarchy

- `--radius-xs: 2px` (`rounded-xs`): Micro indicators, hairline status tags.
- `--radius-sm: 4px` (`rounded-sm`): Buttons, form inputs, dropdown items, filter chips.
- `--radius-md: 8px` (`rounded-md`): Cards, modal dialogs, side panels, table containers.
- `--radius-lg: 10px` (`rounded-lg`): Large preview canvases, floating drawers.
- `--radius-full: 9999px` (`rounded-full`): Status dots, pill tags, user avatars.
- **Shadow Scale**:
  - `shadow-none`: Default for all static cards, tables, rows, and sidebars.
  - `shadow-subtle: 0 1px 3px rgba(20, 22, 27, 0.04)`: Subtle elevation for hovered rows.
  - `shadow-float: 0 8px 24px rgba(20, 22, 27, 0.08)`: Strictly reserved for floating chat drawer, modal dialogs, and popovers.

### 2.5 Focus & Interaction States

All interactive elements must provide a visible, accessible focus ring without layout shift:
```css
*:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-accent);
}
```

---

## 3. Core Component Library

### 3.1 Primitives

#### `<StatusDot variant="neutral" | "active" | "warning" | "danger" />`
- Dimension: 7px diameter (`w-[7px] h-[7px] rounded-full`).
- Variants:
  - `active`: `bg-success` (Engine operational, verified magic byte).
  - `neutral`: `bg-slate` (Inactive, draft).
  - `warning`: `bg-warning` (Pending review, threshold alert).
  - `danger`: `bg-danger` (Quarantined, malicious rejection).

#### `<StatChip label={string} count={string | number} />`
- Container: `inline-flex items-center gap-1 border border-hairline rounded-sm px-2 py-0.5 text-[12px] font-mono text-slate bg-paper`.
- Usage: Displaying page counts (`Hal 12`), chunk counts (`14 chunks`), or version numbers (`v1.2`).

### 3.2 Buttons

| Variant | Tailwind Classes | States |
|---|---|---|
| **Primary** | `bg-accent hover:bg-accent-dark active:bg-accent-active text-white text-xs font-semibold px-4 py-2 rounded-sm transition-colors` | Disabled: `opacity-50 cursor-not-allowed` |
| **Outline** | `border border-hairline bg-paper hover:bg-mist text-ink text-xs font-medium px-3.5 py-1.5 rounded-sm transition-colors` | Disabled: `opacity-40 cursor-not-allowed` |
| **Ghost** | `bg-transparent hover:bg-mist text-slate hover:text-ink text-xs font-medium px-2.5 py-1.5 rounded-sm transition-colors` | Used for toolbar icons and table row actions |
| **Danger** | `border border-danger/30 bg-danger-subtle hover:bg-danger text-danger hover:text-white text-xs font-semibold px-3 py-1.5 rounded-sm transition-colors` | Used for soft-delete, quarantine, and permanent purge |

### 3.3 Form Inputs & Selects

- **Text Input**:
  `h-9 bg-mist/50 border border-hairline hover:border-slate/40 focus:bg-paper focus:border-accent rounded-sm px-3 text-sm text-ink placeholder:text-slate-muted transition-colors`
- **Dropdown / Select**:
  `h-9 bg-mist/50 border border-hairline hover:border-slate/40 focus:bg-paper focus:border-accent rounded-sm px-3 text-sm text-ink transition-colors`
- **Search Bar**:
  `relative flex items-center`: Input with left padding `pl-9` containing a 16px `Search` icon (`text-slate`) and right keyboard shortcut badge (`Ctrl+K` in mono).

### 3.4 Tables & Lists

- Container: `border border-hairline rounded-md bg-paper overflow-hidden`.
- Header: `bg-mist/70 border-b border-hairline px-4 py-2.5 text-[12px] font-medium text-slate text-left`.
- Row: `flex items-center px-4 py-3.5 border-b border-hairline last:border-b-0 hover:bg-mist/30 transition-colors group`.
- Cell Alignment: Text left-aligned; technical metrics right-aligned or mono-aligned.

### 3.5 Dynamic Watermarking Engine Specification (R4 Mandatory)

The watermarking engine is an essential security control mandated by Requirement R4. It must satisfy the following technical invariants:
- **Geometry**: Diagonal repeating grid across the entire canvas or rendered document container.
- **Angle**: Diagonal repeating text at `-30deg` to `-45deg`.
- **Spacing**: Text units repeat every 220px horizontally and 160px vertically.
- **Payload String**: `[Accessor Full Name] • [User ID] • [UTC Timestamp] • BRILIAN IDMS CONFIDENTIAL`.
- **Opacity**: Strictly between `0.15` and `0.25` (15% to 25%). It must be distinctly legible to forensic auditors while not obscuring underlying text.
- **Integrity**: Non-removable via DOM manipulation (`pointer-events-none`, `user-select-none`, overlay z-index 50). Server-side watermarking permanently embeds identical stamps into downloaded PDF, Office, and image files.

---

## 4. Screen-by-Screen Component Specifications

### 4.1 Screen 1: DMS Explorer Screen

- **Layout Structure**: 3-pane split workspace:
  1. **Left Folder Hierarchy Pane** (`w-64 border-r border-hairline bg-mist/40 p-3 flex flex-col`):
     - Top action: "Folder baru" button (`Button variant="outline"` with `FolderPlus` icon).
     - Folder tree: Indented nodes with `ChevronRight`/`ChevronDown` disclosure arrows, `Folder` icon, folder name, and document counter (`font-mono text-xs text-slate`).
     - Bottom section: Quota progress widget (Storage used: `2.4 GB / 10 GB` mono) and Trash link (`Trash2` icon with count badge).
  2. **Center Main Explorer Pane** (`flex-1 bg-paper flex flex-col`):
     - **Breadcrumb Navigation**: `Home > Divisi Hukum > Kontrak Kerja` with clickable segments.
     - **Toolbar**: Search input (`Ctrl+K`), status filters (`Semua`, `Draft`, `Review`, `Approved`), View toggle (`List` / `Grid`), and batch actions (`Pindahkan`, `Unduh`, `Hapus`).
     - **Document Table / Grid**:
       - Row: Checkbox, file type icon (`FileText`, `FileSpreadsheet`, `FileImage`), title, division/level badge (`Hukum • L3`), version pill (`v2.0` mono), size (`14.2 MB` mono), updated date (`2026-11-05 16:40` mono), and context menu (`MoreVertical`).
  3. **Right Metadata Inspector Pane** (`w-80 border-l border-hairline bg-paper p-5 flex flex-col gap-4`):
     - Document thumbnail/preview snippet with dynamic watermark overlay.
     - Security Classification badge (`Publik`, `Internal`, `Rahasia`, `Sangat Rahasia`).
     - Access matrix summary (`Hak akses: Lihat & Unduh`).
     - Version history tree with timestamp, modifier identity, and restore/download actions.

### 4.2 Screen 2: File Upload & Validation Management Screen

- **Dropzone Area**:
  - Container: `border-2 border-dashed border-hairline bg-mist rounded-md p-10 text-center hover:border-accent transition-colors`.
  - Icon: `UploadCloud` (32px, `text-slate`).
  - Primary text: "Tarik & lepas berkas ke sini, atau telusuri berkas" (sentence case).
  - Helper note: "Mendukung PDF, DOCX, XLSX, PPTX, gambar, audio, video, dan arsip hingga 500 MB".
- **Resumable Chunking Queue**:
  - Item container: `border border-hairline rounded-sm p-3 bg-paper flex flex-col gap-2`.
  - Header: Filename (`font-semibold text-ink`), total size (`font-mono text-slate`), speed (`4.2 MB/s` mono).
  - Progress bar: `h-1.5 w-full bg-hairline rounded-full overflow-hidden`, inner bar `bg-accent transition-all duration-300`.
  - Controls: `Pause`, `Play`, `X` ghost buttons.
- **Validation & Security Badges**:
  - Magic byte indicator: `<StatusDot variant="active" />` "Magic byte diverifikasi: `application/pdf`".
  - Malicious quarantine banner: `bg-danger-subtle border border-danger/30 text-danger text-xs p-3 rounded-sm flex items-center gap-2` (e.g., "Macro VBA terdeteksi pada berkas .xlsm — berkas dikarantina secara otomatis").
- **Metadata Configuration**:
  - Division target dropdown, Security level dropdown (`L1` to `L5`), retention date picker (`YYYY-MM-DD` mono).

### 4.3 Screen 3: AI Assistant & Document Comprehension Screen

- **Engine-First Status Indicator**:
  - Docked indicator banner above chat thread:
    - Code Engine Mode: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-mist border border-hairline text-xs text-slate font-mono`:
      `<StatusDot variant="neutral" /> Mode Mesin Deterministik: Ekstraksi Regex & FTS Aktif (0 Token LLM)`
    - Semantic LLM Mode:
      `<StatusDot variant="active" /> Mode Asisten Semantik: Gemini 1.5 Terhubung (Zero Data Retention)`
- **Conversation Thread**:
  - User Message: `ml-auto max-w-[80%] bg-accent-subtle border border-accent/20 rounded-md p-3.5 text-sm text-ink`.
  - AI Assistant Message: `mr-auto max-w-[85%] bg-mist border border-hairline rounded-md p-4 text-sm text-ink flex flex-col gap-2.5`.
  - Inline Citations: `<PageReferenceChip>`:
    `inline-flex items-center gap-1 border border-hairline bg-paper px-2 py-0.5 rounded-sm text-xs text-slate hover:border-accent hover:text-ink cursor-pointer`:
    "Hal 4 • 94% relevansi" (mono). Clicking navigates directly to page in viewer.
- **Input Composer**:
  - Docked bottom bar: `border-t border-hairline bg-paper p-3 flex items-center gap-2`.
  - Input field with placeholder "Ajukan pertanyaan mengenai dokumen aktif...".
  - Send button: `<Button variant="primary">` with `ArrowRight` icon.

### 4.4 Screen 4: Admin Console Screen

- **Sub-Navigation Tabs**:
  - Underline tab bar: `Pengguna & Divisi`, `Matriks Hak Akses (L1–L5)`, `Kebijakan Watermark`, `Log Audit Imutabel`.
- **Division & Level RBAC Matrix Editor**:
  - Matrix table: Rows = Divisions (`Hukum`, `Keuangan`, `SDM`, `Operasional`, `Teknologi`); Columns = User Levels (`L1`, `L2`, `L3`, `L4`, `L5`).
  - Cells contain granular toggle controls for `Lihat` (View) and `Unduh` (Download) per document classification.
- **Immutable Audit Log Stream**:
  - Monospace high-density table:
    - Columns: `Waktu (UTC)`, `Pengguna`, `Divisi`, `Alamat IP`, `Aksi` (`UPLOAD`, `VIEW`, `DOWNLOAD`, `MOVE`, `DELETE`), `Sumber Daya`, `Status`.
    - Tamper-proof styling: Read-only, uneditable rows with `Export CSV / JSON` action.

### 4.5 Screen 5: Login & Authentication Screen

- **Canvas**: Centered card layout on `bg-mist`.
- **Card**: `w-full max-w-sm bg-paper border border-hairline rounded-md p-8 shadow-subtle flex flex-col gap-6`.
- **Header**:
  - Brand mark: Stylized document icon in `text-accent`.
  - Title: "Brilian IDMS" (`text-xl font-semibold text-ink`).
  - Subtitle: "Sistem Manajemen Dokumen Cerdas Enterprise" (`text-xs text-slate`).
- **Form Controls**:
  - Username label: "Nama pengguna" (`text-xs font-medium text-slate`).
  - Password label: "Kata sandi" (`text-xs font-medium text-slate`).
  - Primary button: "Masuk ke sistem" (`Button variant="primary" w-full`).
  - Quick role presets: Clean card pills (`Admin`, `Reviewer`, `Uploader`, `Viewer`) with Lucide icons (no emojis).

### 4.6 Screen 6: Executive Dashboard & Analytics Screen

- **Top KPI Summary Row** (4 Metric Cards):
  - Card: `bg-paper border border-hairline rounded-md p-4 flex flex-col gap-1`.
  - Title: "Total Dokumen Terkelola" (`text-xs font-medium text-slate`).
  - Value: "14.820" (`text-2xl font-semibold text-ink font-mono`).
  - Trend: "+124 berkas minggu ini" (`text-[11px] font-medium text-success`).
- **Activity & Ingestion Chart**:
  - Monochrome bar/line chart with single accent line (`#2F5DFF`), avoiding rainbow graphs.
- **Recent Activity Stream**:
  - List of real-time document lifecycle events with user initials avatar, event label, and relative time (`5m lalu`).

---

## 5. Anti-AI-Slop Code Review Checklist

Before any frontend pull request or component code is merged, verify against this checklist:

- [ ] **Zero Decorative Gradients**: No `from-*-500 to-*-600` gradients or background glow divs (`blur-3xl`).
- [ ] **Zero Heavy Shadows**: No `shadow-lg`, `shadow-xl`, or `shadow-2xl` on standard cards or rows. Only `border-hairline`. Shadows are reserved exclusively for floating chat, modals, and popovers (`shadow-float`).
- [ ] **Zero Emojis as UI Icons**: Absolutely no emojis in buttons, pills, or headers. Exclusively use `lucide-react`.
- [ ] **Sentence Case Everywhere**: All labels, headers, and buttons are in sentence case. Zero ALL CAPS.
- [ ] **Accent Discipline**: Color `#2F5DFF` is used only for primary interactive triggers, active tab underlines, links, and focus rings. Never for random backgrounds.
- [ ] **Monospace Strictness**: `IBM Plex Mono` is applied exclusively to technical figures (chunk numbers, byte sizes, IDs, %, timestamps). General prose uses `IBM Plex Sans`.
- [ ] **No False Status Alerts**: Success/error states use clear semantic icons and hairline cards, not giant fluorescent green/red banners.
- [ ] **Watermark Enforced**: Viewer canvases render the repeating diagonal watermark with accessor name, user ID, and timestamp.

---

## 6. Technical Implementation Blueprint

### 6.1 Tailwind Configuration (`frontend/tailwind.config.js`)

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FFFFFF',
        mist: '#F6F6F4',
        ink: '#14161B',
        slate: {
          DEFAULT: '#6B7078',
          muted: '#8E939C',
          light: '#A0A5AE',
        },
        hairline: '#E7E7E5',
        border: {
          subtle: '#F0F0EE',
          DEFAULT: '#E7E7E5',
          hover: '#D5D5D3',
        },
        accent: {
          DEFAULT: '#2F5DFF',
          dark: '#2447D6',
          active: '#1E3ECC',
          subtle: '#EEF2FF',
          border: '#C8D4FF',
        },
        success: {
          DEFAULT: '#1C8A5D',
          subtle: '#ECFDF5',
          border: '#A7F3D0',
        },
        warning: {
          DEFAULT: '#B7791F',
          subtle: '#FFFBEB',
          border: '#FDE68A',
        },
        danger: {
          DEFAULT: '#D64545',
          subtle: '#FEF2F2',
          border: '#FECACA',
        },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', '"SFMono-Regular"', 'monospace'],
      },
      borderRadius: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },
      boxShadow: {
        float: '0 8px 24px rgba(20, 22, 27, 0.08)',
        subtle: '0 1px 3px rgba(20, 22, 27, 0.04)',
      },
    },
  },
  plugins: [],
};
```

### 6.2 CSS Root Setup (`frontend/src/index.css`)

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-paper: #FFFFFF;
    --color-mist: #F6F6F4;
    --color-ink: #14161B;
    --color-slate: #6B7078;
    --color-hairline: #E7E7E5;
    --color-accent: #2F5DFF;
    --color-accent-dark: #2447D6;
    --color-success: #1C8A5D;
    --color-warning: #B7791F;
    --color-danger: #D64545;
  }

  body {
    background-color: var(--color-paper);
    color: var(--color-ink);
    font-family: 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  *:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-accent);
  }
}
```

---

*Style guide authored and maintained by worker_m1.*
