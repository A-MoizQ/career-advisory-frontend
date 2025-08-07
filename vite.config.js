import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
   server: {
    proxy: {
      // string shorthand: http://localhost:5173/chat -> http://127.0.0.1:8000/chat
      '/chat': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    }
  }
});


