const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const env = require('./config/env');
const AppError = require('./utils/AppError');
const healthRoutes = require('./routes/health.routes');
const authRoutes = require('./routes/auth.routes');
const meetingRoutes = require('./routes/meeting.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Request logging (silent during tests)
if (!env.isTest) {
  app.use(morgan(env.isProduction ? 'combined' : 'dev'));
}

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      // No Origin header: curl, health checks, native/mobile clients
      if (!origin || env.clientOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new AppError(403, 'CORS_NOT_ALLOWED', 'Origin not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);

app.use(express.json({ limit: '100kb' }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/meetings', meetingRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;