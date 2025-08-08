import { Router } from 'express';
import logger from '@server/logger';

const testRoutes = Router();

logger.info('TEST routes initialized', { label: 'TEST' });

testRoutes.get('/', (_req, res) => {
  logger.info('TEST GET / route called', { label: 'TEST' });
  res.status(200).json({ message: 'TEST route working!' });
});

testRoutes.get('/ping', (_req, res) => {
  logger.info('TEST GET /ping route called', { label: 'TEST' });
  res.status(200).json({ message: 'TEST ping working!' });
});

export default testRoutes;
