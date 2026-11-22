import type { Config } from 'tailwindcss';

/**
 * Design tokens live as CSS variables in `src/app/globals.css` so a section can
 * re-theme itself (see `.theme-light`) without touching component classes.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        panel: token('panel'),
        'panel-2': token('panel-2'),
        fg: token('fg'),
        muted: token('muted'),
        faint: token('faint'),
        signal: token('signal'),
        'on-signal': token('on-signal'),
        up: token('up'),
        down: token('down'),
        warn: token('warn'),
      },
      borderColor: {
        line: 'rgb(var(--fg) / 0.12)',
        'line-strong': 'rgb(var(--fg) / 0.28)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        hero: ['clamp(2.75rem, 8vw, 9rem)', { lineHeight: '0.95', letterSpacing: '-0.035em' }],
        h1: ['clamp(2.25rem, 5.5vw, 5.5rem)', { lineHeight: '1', letterSpacing: '-0.03em' }],
        h2: ['clamp(1.75rem, 3.6vw, 3.5rem)', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        h3: ['clamp(1.5rem, 3.2vw, 3rem)', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
        body: ['1.0625rem', { lineHeight: '1.5' }],
        label: ['0.75rem', { lineHeight: '1.4', letterSpacing: '0.06em' }],
      },
      maxWidth: { page: '1680px' },
      height: { header: '56px' },
      spacing: { header: '56px', gutter: 'var(--gutter)' },
      transitionTimingFunction: {
        brand: 'cubic-bezier(.22, .61, .36, 1)',
        'out-expo': 'cubic-bezier(.16, 1, .3, 1)',
      },
      transitionDuration: { fast: '160ms', base: '320ms', slow: '640ms' },
      keyframes: {
        rise: { from: { transform: 'translateY(110%)' }, to: { transform: 'none' } },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'none' },
        },
        pulse: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--signal) / 0.55)' },
          '70%, 100%': { boxShadow: '0 0 0 10px rgb(var(--signal) / 0)' },
        },
        marquee: { to: { transform: 'translateX(-50%)' } },
        travel: { from: { left: '0%' }, to: { left: 'calc(100% - 2rem)' } },
        grain: {
          '0%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(-3%, 2%)' },
          '50%': { transform: 'translate(2%, -4%)' },
          '75%': { transform: 'translate(-1%, -2%)' },
          '100%': { transform: 'translate(3%, 3%)' },
        },
      },
      animation: {
        rise: 'rise 0.9s cubic-bezier(.16, 1, .3, 1) both',
        'fade-up': 'fade-up 0.64s cubic-bezier(.16, 1, .3, 1) both',
        pulse: 'pulse 2s cubic-bezier(.22, .61, .36, 1) infinite',
        marquee: 'marquee 60s linear infinite',
        travel: 'travel 2.4s cubic-bezier(.22, .61, .36, 1) infinite alternate',
        grain: 'grain 0.5s steps(4) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
