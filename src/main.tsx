import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ConvexProviderWithAuth } from "convex/react";
import { convex, useSupabaseAuth } from "./lib/convex";
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProviderWithAuth client={convex} useAuth={useSupabaseAuth}>
      <App />
    </ConvexProviderWithAuth>
  </StrictMode>
);
