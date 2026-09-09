import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import App from './App';

import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      {/*
       * Two defects lived in this style block, and both are invisible to the checks.
       *
       * **It was three hex literals, and they were the dark palette's.** `#1e293b` and `#e2e8f0` are
       * `--surface-2` and `--card-foreground` as they resolve on dark, so every toast rendered dark on
       * the light theme — the Both-Palettes Rule broken in the one place `check:theme` structurally
       * cannot see it, because it reads Tailwind utilities and this is an inline style object.
       * `#334155` was not even a border token in either palette; the real ones are `#1e293b` dark and
       * `#d8dfe8` light. `var(--…)` resolves per palette, so the toast now follows the theme.
       *
       * **And it had no size.** `toast.error` is handed whatever string the transport produced, and a
       * realistic one here is this deployment's SPA catch-all answering an unknown `/api` path with
       * ~9.8KB of dashboard HTML. Measured: a full-viewport-height toast occluding the entire evidence
       * rail. Capping the container is the fix rather than truncating at the 40 call sites that pass a
       * server error, because the string itself is not wrong — `ErrorExplainer` wants every byte of it
       * and offers "Show all 9,867 characters". It is the floating box that must not grow.
       */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--surface-2)',
            color: 'var(--card-foreground)',
            border: '1px solid var(--border)',
            maxHeight: '10rem',
            overflow: 'hidden',
          },
        }}
      />
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
