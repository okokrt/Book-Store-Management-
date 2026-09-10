import express from 'express';
import cors from 'cors';
import { apiRouter } from './api';
import { csrfProtection } from './auth';

export const app = express();

// Security headers middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  // Allow rendering in AI Studio preview iframe while securing framing
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.run.app https://ai.studio https://*.google.com https://*.vercel.app;"
  );
  next();
});

// Configure CORS to allow credentials (needed for owner session cookies)
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server) or any valid same-origin/preview
      callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '5mb' }));

// Apply CSRF check on state-changing requests
app.use(csrfProtection);

// Mount secure API routes
app.use('/api', apiRouter);

// Fallback route mount for Vercel serverless function when /api prefix is stripped
if (process.env.VERCEL) {
  app.use(apiRouter);
}

export default app;
