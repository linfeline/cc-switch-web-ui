import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import routes
import authRoutes from './routes/auth.js';
import providersRoutes from './routes/providers.js';
import profilesRoutes from './routes/profiles.js';
import customToolsRoutes from './routes/custom-tools.js';
import logsRoutes from './routes/logs.js';
import settingsRoutes from './routes/settings.js';
import mcpRoutes from './routes/mcp.js';
import promptsRoutes from './routes/prompts.js';
import skillsRoutes from './routes/skills.js';
import configRoutes from './routes/config.js';
import envRoutes from './routes/env.js';

// Import middleware
import { authMiddleware } from './middleware/auth.js';

// Import services
import { ccSwitchAdapter } from './services/ccswitch-adapter.js';
import { configStorage } from './services/config-storage.js';

// Configuration
const PORT = parseInt(process.env.PORT || '33010', 10);
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

// ============================================
// Server Startup
// ============================================

async function createServer() {
  const app = express();

  // ============================================
  // Middleware
  // ============================================

  // Security headers (relaxed for development)
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // CORS configuration
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Parse URL-encoded bodies
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });

  // ============================================
  // Public Routes (No Auth Required)
  // ============================================

  /**
   * GET /api/health
   * Health check endpoint with backend capability details
   */
  app.get('/api/health', async (_req, res) => {
    const startTime = Date.now();

    try {
      const backend = await ccSwitchAdapter.getBackendHealth();
      const storageAccessible = configStorage.isAccessible();

      const healthy = backend.ccSwitchAvailable && storageAccessible && backend.schemaVersion >= 0;
      const degraded = healthy && backend.warnings.length > 0;

      const health = {
        status: healthy ? (degraded ? 'degraded' : 'ok') : 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        ccSwitchAvailable: backend.ccSwitchAvailable,
        storageAccessible,
        responseTime: `${Date.now() - startTime}ms`,
        ccSwitchPath: backend.ccSwitchPath,
        ccSwitchVersion: backend.ccSwitchVersion,
        configDir: backend.configDir,
        dbPath: backend.dbPath,
        schemaVersion: backend.schemaVersion,
        backendMode: backend.backendMode,
        capabilities: backend.capabilities,
        warnings: backend.warnings,
      };

      const statusCode = health.status === 'error' ? 503 : 200;
      res.status(statusCode).json(health);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        ccSwitchAvailable: false,
        storageAccessible: false,
        error: error instanceof Error ? error.message : 'Health check failed',
      });
    }
  });

  /**
   * POST /api/auth/login
   * Login endpoint (no auth required)
   */
  app.use('/api/auth', authRoutes);

  // ============================================
  // Protected Routes (Auth Required)
  // ============================================

  // Apply auth middleware to all routes below
  app.use('/api', authMiddleware);

  /**
   * GET /api/status
   * Get current provider/profile status
   */
  app.get('/api/status', async (_req, res) => {
    try {
      const status = await ccSwitchAdapter.getStatus();
      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get status';
      res.status(500).json({
        success: false,
        error: message,
      });
    }
  });

  // Provider routes
  app.use('/api/providers', providersRoutes);

  // Profile routes
  app.use('/api/profiles', profilesRoutes);

  // Custom tools routes
  app.use('/api/custom-tools', customToolsRoutes);

  // Logs routes
  app.use('/api/logs', logsRoutes);

  // Settings routes
  app.use('/api/settings', settingsRoutes);

  // MCP routes
  app.use('/api/mcp', mcpRoutes);

  // Prompts routes
  app.use('/api/prompts', promptsRoutes);

  // Skills routes
  app.use('/api/skills', skillsRoutes);

  // Config routes
  app.use('/api/config', configRoutes);

  // Environment variables routes
  app.use('/api/env', envRoutes);

  // ============================================
  // Vite Integration (Development Only)
  // ============================================

  if (!isProduction) {
    // Dynamically import Vite only in development
    const { createServer: createViteServer } = await import('vite');
    
    // Create Vite server in middleware mode
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: false, // Disable HMR to avoid restart issues
      },
      appType: 'spa',
      root: path.resolve(__dirname, '..', '..'),
      configFile: path.resolve(__dirname, '..', '..', 'vite.config.ts'),
    });

    // Use vite's connect instance as middleware
    app.use(vite.middlewares);
  }

  // ============================================
  // Static Files (Production Only)
  // ============================================

  if (isProduction) {
    // Serve static files from the dist directory
    const staticDir = path.join(__dirname, '..');
    app.use(express.static(staticDir));

    // Handle SPA routing - serve index.html for all non-API routes
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // ============================================
  // Error Handling
  // ============================================

  // Global error handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    });
  });

  return app;
}

// ============================================
// Start Server
// ============================================

async function startServer() {
  try {
    // Check cc-switch availability
    console.log('Checking cc-switch availability...');
    const backend = await ccSwitchAdapter.getBackendHealth();
    if (!backend.ccSwitchAvailable) {
      console.warn('WARNING: cc-switch binary is not available. Some features may not work.');
    } else {
      console.log(`cc-switch: ${backend.ccSwitchVersion} @ ${backend.ccSwitchPath}`);
      console.log(`config dir: ${backend.configDir}`);
      console.log(`db: ${backend.dbPath} (user_version=${backend.schemaVersion})`);
      console.log(`backend mode: ${backend.backendMode}`);
      if (backend.warnings.length) {
        console.warn('capability warnings:');
        for (const w of backend.warnings) console.warn(`  - ${w}`);
      }
    }

    // Check storage
    console.log('Checking storage accessibility...');
    const storageAccessible = configStorage.isAccessible();
    if (!storageAccessible) {
      console.error('ERROR: Storage directory is not accessible.');
      process.exit(1);
    }
    console.log(`Storage directory: ${configStorage.getDataDir()}`);

    // Create the server
    const app = await createServer();

    // Start listening
    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('='.repeat(50));
      console.log('  cc-switch-web-ui Server');
      console.log('='.repeat(50));
      console.log(`  Server running at: http://${HOST}:${PORT}`);
      console.log(`  Health check:      http://${HOST}:${PORT}/api/health`);
      console.log(`  Auth enabled:      ${!!process.env.ADMIN_PASSWORD}`);
      console.log(`  Node environment:  ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(50));
      console.log('');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();
