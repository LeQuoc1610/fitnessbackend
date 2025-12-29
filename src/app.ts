import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'node:path';
import helmet from 'helmet';
import { initializeSocket } from './socket.js';


// Routes - Theo tên file của bạn
import { authRouter } from './routes/auth.js';
import { threadsRouter } from './routes/threads.js';
import { notificationsRouter } from './routes/notifications.js';
import { usersRouter } from './routes/users.js';
import { followsRouter } from './routes/follows.js';
import { profilesRouter } from './routes/profiles.js';
import { uploadsRouter } from './routes/uploads.js';

dotenv.config();

/**
 * Tạo Express app với Socket.IO
 */
export function createApp() {
  const app = express();
  const httpServer = createServer(app);

  // Initialize Socket.IO
  const io = initializeSocket(httpServer);

  // Security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Disable CSP để upload files hoạt động tốt
    })
  );

  // Middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(
    cors({
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(morgan('dev'));

  // Rate limiting cho tất cả API routes

  // Store io instance globally so controllers can access it
  app.set('io', io);

  // Serve uploaded files
  app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

  // Connect MongoDB
  const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/gymbro';
  mongoose
    .connect(mongoURI, { dbName: process.env.MONGODB_DBNAME || 'gymbro' })
    .then(() => console.log('✅ MongoDB connected'))
    .catch((err) => console.log('❌ MongoDB connection error:', err));

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/threads', threadsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/follows', followsRouter);
  app.use('/api/uploads', uploadsRouter);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
  });

  // Error handling middleware
  app.use((err: any, req: any, res: any, next: any) => {
    const status = err.status ?? 500;
    const message = err.message ?? 'Internal server error';
    
    // Log error với thông tin chi tiết hơn
    console.error(`[${status}] ${req.method} ${req.path}`, {
      message,
      error: process.env.NODE_ENV === 'development' ? err : undefined,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });

    // Không leak thông tin nhạy cảm trong production
    const errorMessage =
      status === 500 && process.env.NODE_ENV !== 'development'
        ? 'Internal server error'
        : message;

    res.status(status).json({
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  return httpServer;
}

// Start server (nếu chạy trực tiếp từ file này)
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 8080;
  const httpServer = createApp();

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket ready for real-time notifications`);
  });
}