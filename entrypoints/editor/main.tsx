import React from 'react';
import { createRoot } from 'react-dom/client';
import Editor from './Editor';
import '@/lib/styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
