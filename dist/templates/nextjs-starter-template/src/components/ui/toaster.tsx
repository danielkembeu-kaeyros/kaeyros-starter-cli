'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          error: 'bg-destructive text-destructive-foreground',
          success: 'bg-primary text-primary-foreground',
          warning: 'bg-secondary text-secondary-foreground',
        },
      }}
    />
  );
}
