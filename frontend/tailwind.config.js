/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Core Paper/Mist/Ink Design Tokens (BrilianAi canonical specification)
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
        // Backward-compatibility palette for existing UI components
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
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
