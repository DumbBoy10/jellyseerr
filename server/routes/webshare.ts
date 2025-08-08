import { Router } from 'express';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { getSettings } from '@server/lib/settings';
import WebShareAPI from '@server/api/webshare';
import fs from 'fs';
import path from 'path';
import { isAuthenticated } from '@server/middleware/auth';
import axios from 'axios';
import { pipeline } from 'stream/promises';
import DownloadManager from '@server/lib/downloadManager';

const webshareRoutes = Router();

logger.info('WebShare main routes initialized', { label: 'WebShare' });

// Simple test route
webshareRoutes.get('/test', (_req, res) => {
  logger.info('WebShare test route called!', { label: 'WebShare' });
  res.status(200).json({ message: 'WebShare routes are working!' });
});

// Search for files for requests - allows all authenticated users
webshareRoutes.get('/search-request', isAuthenticated(), async (req, res, next) => {
  try {
    const { title, year } = req.query;
    
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title is required' });
    }

    // Build search query
    let searchQuery = title;
    if (year && typeof year === 'string') {
      searchQuery += ` ${year}`;
    }

    logger.info('WebShare request search', {
      label: 'WebShare',
      title,
      year,
      query: searchQuery,
      user: req.user?.displayName,
    });

    const settings = getSettings();
    if (!settings.webshare.enabled || !settings.webshare.username || !settings.webshare.password) {
      return next({
        status: 503,
        message: 'WebShare.cz is not configured',
      });
    }

    const webshareAPI = new WebShareAPI(settings.webshare.username, settings.webshare.password);
    const files = await webshareAPI.searchFiles({
      query: searchQuery,
      sort: 'largest',
      limit: 20,
    });

    logger.debug('WebShare request search results', {
      label: 'WebShare',
      count: files.length,
      title,
      year,
    });

    res.status(200).json({
      files,
      total: files.length,
      query: searchQuery,
      title,
      year,
    });
  } catch (error) {
    logger.error('WebShare request search failed', {
      label: 'WebShare',
      error: error.message,
      title: req.query.title,
      year: req.query.year,
    });
    
    return next({
      status: 500,
      message: 'Failed to search WebShare.cz',
    });
  }
});

// Search for files
webshareRoutes.get('/search', isAuthenticated(Permission.ADMIN), async (req, res, next) => {
  try {
    const { q: query } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    logger.info('WebShare search request', {
      label: 'WebShare',
      query,
      user: req.user?.displayName,
    });

    const webshareAPI = new WebShareAPI();
    const files = await webshareAPI.searchFiles({
      query,
      sort: 'largest',
      limit: 50,
    });

    logger.debug('WebShare search results', {
      label: 'WebShare',
      count: files.length,
      query,
    });

    res.status(200).json({
      files,
      total: files.length,
    });
  } catch (error) {
    logger.error('WebShare search failed', {
      label: 'WebShare',
      error: error.message,
      query: req.query.q,
    });
    
    return next({
      status: 500,
      message: 'Failed to search WebShare.cz',
    });
  }
});

// Download file - allows all authenticated users
webshareRoutes.post('/download/:ident', isAuthenticated(), async (req, res, next) => {
  try {
    const { ident } = req.params;
    const { fileName } = req.body; // Get filename from request body
    const settings = getSettings();
    const downloadManager = DownloadManager.getInstance();
    
    if (!settings.webshare.enabled || !settings.webshare.username || !settings.webshare.password) {
      return next({
        status: 503,
        message: 'WebShare.cz is not configured',
      });
    }
    
    if (!settings.webshare.downloadPath) {
      return next({
        status: 400,
        message: 'WebShare download path not configured',
      });
    }

    if (!fileName || typeof fileName !== 'string') {
      return next({
        status: 400,
        message: 'File name is required',
      });
    }

    // Sanitize filename to prevent directory traversal and invalid characters
    const sanitizedFileName = fileName
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid filename characters
      .replace(/\.\./g, '_') // Replace .. to prevent directory traversal
      .replace(/^\.+/, '') // Remove leading dots
      .trim();

    if (!sanitizedFileName) {
      return next({
        status: 400,
        message: 'Invalid file name',
      });
    }

    logger.info('WebShare download request', {
      label: 'WebShare',
      ident,
      fileName: sanitizedFileName,
      originalFileName: fileName,
      user: req.user?.displayName,
    });

    const webshareAPI = new WebShareAPI(settings.webshare.username, settings.webshare.password);
    const fileLink = await webshareAPI.getFileLink(ident);

    // Ensure download directory exists
    if (!fs.existsSync(settings.webshare.downloadPath)) {
      fs.mkdirSync(settings.webshare.downloadPath, { recursive: true });
    }

    // Use the sanitized filename from the request body
    const filePath = path.join(settings.webshare.downloadPath, sanitizedFileName);

    // Add download to manager
    const downloadId = downloadManager.addDownload({
      fileName: sanitizedFileName,
      filePath,
      ident,
      userId: req.user?.id ?? 0,
    });

    // Start download in background
    downloadFileWithProgress(fileLink.url, filePath, downloadId, downloadManager)
      .then(() => {
        downloadManager.completeDownload(downloadId);
      })
      .catch((error) => {
        downloadManager.failDownload(downloadId, error.message);
        // Clean up incomplete file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

    // Return immediately with download ID
    res.status(200).json({
      success: true,
      downloadId,
      fileName: sanitizedFileName,
      filePath,
      ident,
      message: 'Download started successfully',
    });
  } catch (error) {
    logger.error('WebShare download failed', {
      label: 'WebShare',
      error: error.message,
      ident: req.params.ident,
    });
    
    return next({
      status: 500,
      message: 'Failed to download from WebShare.cz',
    });
  }
});

// Helper function to download file with progress tracking
async function downloadFileWithProgress(
  url: string,
  filePath: string,
  downloadId: string,
  downloadManager: DownloadManager
): Promise<void> {
  const controller = downloadManager.getAbortController(downloadId);
  
  const response = await axios.get(url, {
    responseType: 'stream',
    signal: controller?.signal,
  });

  const totalSize = parseInt(response.headers['content-length'] || '0');
  let downloadedSize = 0;

  const writer = fs.createWriteStream(filePath);

  // Track progress
  response.data.on('data', (chunk: Buffer) => {
    downloadedSize += chunk.length;
    downloadManager.updateProgress(downloadId, downloadedSize, totalSize);
  });

  await pipeline(response.data, writer);
  
  logger.info('WebShare file downloaded successfully', {
    label: 'WebShare',
    downloadId,
    filePath,
  });
}

// Get downloads for current user
webshareRoutes.get('/downloads', isAuthenticated(), async (req, res) => {
  try {
    const downloadManager = DownloadManager.getInstance();
    const downloads = downloadManager.getDownloads(req.user?.id);
    
    res.status(200).json({ downloads });
  } catch (error) {
    logger.error('Failed to get downloads', {
      label: 'WebShare',
      error: error.message,
      userId: req.user?.id,
    });
    
    res.status(500).json({ error: 'Failed to get downloads' });
  }
});

// Cancel download
webshareRoutes.delete('/downloads/:id', isAuthenticated(), async (req, res) => {
  try {
    const { id } = req.params;
    const downloadManager = DownloadManager.getInstance();
    
    const success = downloadManager.cancelDownload(id, req.user?.id ?? 0);
    
    if (success) {
      res.status(200).json({ success: true, message: 'Download cancelled successfully' });
    } else {
      res.status(404).json({ error: 'Download not found or cannot be cancelled' });
    }
  } catch (error) {
    logger.error('Failed to cancel download', {
      label: 'WebShare',
      error: error.message,
      downloadId: req.params.id,
      userId: req.user?.id,
    });
    
    res.status(500).json({ error: 'Failed to cancel download' });
  }
});

export default webshareRoutes;
