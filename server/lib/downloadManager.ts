import logger from '@server/logger';
import EventEmitter from 'events';

export interface DownloadItem {
  id: string;
  fileName: string;
  filePath: string;
  ident: string;
  status: 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  startTime: Date;
  endTime?: Date;
  totalSize?: number;
  downloadedSize: number;
  speed?: number; // bytes per second
  userId: number;
  error?: string;
  controller?: AbortController;
}

class DownloadManager extends EventEmitter {
  private downloads: Map<string, DownloadItem> = new Map();
  private static instance: DownloadManager;

  private constructor() {
    super();
  }

  public static getInstance(): DownloadManager {
    if (!DownloadManager.instance) {
      DownloadManager.instance = new DownloadManager();
    }
    return DownloadManager.instance;
  }

  public addDownload(download: Omit<DownloadItem, 'id' | 'progress' | 'startTime' | 'downloadedSize' | 'status'>): string {
    const id = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const downloadItem: DownloadItem = {
      id,
      ...download,
      status: 'downloading',
      progress: 0,
      startTime: new Date(),
      downloadedSize: 0,
      controller: new AbortController(),
    };

    this.downloads.set(id, downloadItem);
    
    logger.info('Download added to manager', {
      label: 'DownloadManager',
      id,
      fileName: download.fileName,
      userId: download.userId,
    });

    this.emit('downloadAdded', downloadItem);
    return id;
  }

  public updateProgress(id: string, downloadedSize: number, totalSize?: number): void {
    const download = this.downloads.get(id);
    if (!download) return;

    const oldProgress = download.progress;
    download.downloadedSize = downloadedSize;
    
    if (totalSize) {
      download.totalSize = totalSize;
      download.progress = Math.round((downloadedSize / totalSize) * 100);
    }

    // Calculate download speed
    const timeElapsed = (Date.now() - download.startTime.getTime()) / 1000; // seconds
    if (timeElapsed > 0) {
      download.speed = Math.round(downloadedSize / timeElapsed);
    }

    // Only emit progress update if progress changed significantly (to avoid too many events)
    if (Math.abs(download.progress - oldProgress) >= 1) {
      this.emit('downloadProgress', download);
    }
  }

  public completeDownload(id: string): void {
    const download = this.downloads.get(id);
    if (!download) return;

    download.status = 'completed';
    download.progress = 100;
    download.endTime = new Date();

    logger.info('Download completed', {
      label: 'DownloadManager',
      id,
      fileName: download.fileName,
      userId: download.userId,
      duration: download.endTime.getTime() - download.startTime.getTime(),
    });

    this.emit('downloadCompleted', download);
  }

  public failDownload(id: string, error: string): void {
    const download = this.downloads.get(id);
    if (!download) return;

    download.status = 'failed';
    download.endTime = new Date();
    download.error = error;

    logger.error('Download failed', {
      label: 'DownloadManager',
      id,
      fileName: download.fileName,
      userId: download.userId,
      error,
    });

    this.emit('downloadFailed', download);
  }

  public cancelDownload(id: string, userId: number): boolean {
    const download = this.downloads.get(id);
    if (!download) return false;

    // Check if user owns this download or is admin
    if (download.userId !== userId) {
      logger.warn('User attempted to cancel download they do not own', {
        label: 'DownloadManager',
        downloadId: id,
        downloadUserId: download.userId,
        requestUserId: userId,
      });
      return false;
    }

    if (download.status !== 'downloading') return false;

    // Cancel the download using AbortController
    if (download.controller) {
      download.controller.abort();
    }

    download.status = 'cancelled';
    download.endTime = new Date();

    logger.info('Download cancelled by user', {
      label: 'DownloadManager',
      id,
      fileName: download.fileName,
      userId,
    });

    this.emit('downloadCancelled', download);
    return true;
  }

  public getDownloads(userId?: number): DownloadItem[] {
    const allDownloads = Array.from(this.downloads.values());
    
    if (userId) {
      return allDownloads.filter(download => download.userId === userId);
    }
    
    return allDownloads;
  }

  public getDownload(id: string): DownloadItem | undefined {
    return this.downloads.get(id);
  }

  public removeDownload(id: string): boolean {
    return this.downloads.delete(id);
  }

  public cleanupOldDownloads(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    const toRemove: string[] = [];

    for (const [id, download] of this.downloads) {
      if (download.status !== 'downloading') {
        const age = now - download.startTime.getTime();
        if (age > maxAge) {
          toRemove.push(id);
        }
      }
    }

    toRemove.forEach(id => {
      this.downloads.delete(id);
      logger.debug('Removed old download from manager', {
        label: 'DownloadManager',
        id,
      });
    });

    if (toRemove.length > 0) {
      this.emit('downloadsCleanedUp', toRemove);
    }
  }

  public getAbortController(id: string): AbortController | undefined {
    const download = this.downloads.get(id);
    return download?.controller;
  }
}

// Clean up old downloads every hour
setInterval(() => {
  DownloadManager.getInstance().cleanupOldDownloads();
}, 60 * 60 * 1000);

export default DownloadManager;
