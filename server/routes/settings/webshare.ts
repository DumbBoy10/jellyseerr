import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import WebShareAPI from '@server/api/webshare';

const webshareRoutes = Router();

logger.info('WebShare settings routes initialized', { label: 'WebShare' });

// Test route for debugging
webshareRoutes.get('/ping', (_req, res) => {
  logger.info('WebShare PING route called - SUCCESS!', { label: 'WebShare' });
  res.status(200).json({ message: 'WebShare routes are working!' });
});

webshareRoutes.get('/', (_req, res) => {
  logger.info('WebShare GET / route called', { label: 'WebShare' });
  const settings = getSettings();
  
  // Return a simple object for now to test the route
  res.status(200).json({
    username: settings.webshare.username || '',
    password: settings.webshare.password || '',
    enabled: settings.webshare.enabled || false,
    downloadPath: settings.webshare.downloadPath || '',
  });
});

webshareRoutes.post('/', async (req, res) => {
  logger.info('WebShare POST / route called', { label: 'WebShare' });
  const settings = getSettings();
  settings.webshare = req.body;
  await settings.save();
  return res.status(200).json(settings.webshare);
});

webshareRoutes.post('/test', async (req, res, next) => {
  logger.info('WebShare POST /test route called', { label: 'WebShare' });
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return next({
        status: 400,
        message: 'Username and password are required',
      });
    }

    logger.info('Testing WebShare.cz connection', {
      label: 'WebShare',
      username: username,
    });

    // Use the new WebShare API class
    const webshareAPI = new WebShareAPI(username, password);
    const success = await webshareAPI.testConnection();

    if (!success) {
      return next({
        status: 401,
        message: 'Invalid credentials',
      });
    }

    logger.info('WebShare.cz connection test successful', {
      label: 'WebShare',
    });

    return res.status(200).json({
      success: true,
      method: 'webshare_api_class',
    });
  } catch (e) {
    logger.error('Failed to test WebShare.cz connection', {
      label: 'WebShare',
      message: e.message,
      stack: e.stack,
    });

    return next({
      status: 500,
      message: 'Failed to connect to WebShare.cz',
    });
  }
});

export default webshareRoutes;