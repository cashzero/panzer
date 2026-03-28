import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TankEditorApp } from './TankEditorApp';
import '../index.css';
import './editor.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TankEditorApp />
  </StrictMode>,
);
