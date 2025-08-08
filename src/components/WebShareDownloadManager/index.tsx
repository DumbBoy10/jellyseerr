import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import axios from 'axios';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('components.WebShareDownloadManager', {
  downloadManager: 'Download Manager',
  downloadManagerDescription: 'Manage your WebShare.cz downloads',
  noDownloads: 'No downloads found',
  fileName: 'File Name',
  status: 'Status',
  progress: 'Progress',
  size: 'Size',
  speed: 'Speed',
  actions: 'Actions',
  cancel: 'Cancel',
  downloading: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  cancelConfirm: 'Are you sure you want to cancel this download?',
  cancelSuccess: 'Download cancelled successfully',
  cancelError: 'Failed to cancel download',
  refreshing: 'Refreshing...',
  autoRefresh: 'Auto-refresh enabled',
  notConfigured: 'WebShare.cz is not configured',
  configureWebShare: 'Configure WebShare.cz',
});

interface DownloadItem {
  id: string;
  fileName: string;
  filePath: string;
  ident: string;
  status: 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime: string;
  endTime?: string;
  totalSize?: number;
  downloadedSize: number;
  speed?: number;
  error?: string;
}

const WebShareDownloadManager = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [refreshInterval, setRefreshInterval] = useState(5000); // 5 seconds
  const [isCancelling, setIsCancelling] = useState<string | null>(null);

  // Check WebShare settings
  const { data: webshareSettings } = useSWR('/api/v1/settings/webshare');

  const {
    data: downloadsData,
    error,
    mutate,
    isLoading,
  } = useSWR<{ downloads: DownloadItem[] }>(
    webshareSettings?.enabled ? '/api/v1/webshare/downloads' : null,
    {
      refreshInterval,
      revalidateOnFocus: false,
    }
  );

  const downloads = useMemo(() => downloadsData?.downloads || [], [downloadsData]);

  // Auto-refresh logic
  useEffect(() => {
    const hasActiveDownloads = downloads.some(
      (download) => download.status === 'downloading'
    );

    if (hasActiveDownloads) {
      setRefreshInterval(2000); // Faster refresh for active downloads
    } else {
      setRefreshInterval(10000); // Slower refresh when no active downloads
    }
  }, [downloads]);

  const cancelDownload = async (downloadId: string) => {
    if (!confirm(intl.formatMessage(messages.cancelConfirm))) {
      return;
    }

    setIsCancelling(downloadId);
    try {
      await axios.delete(`/api/v1/webshare/downloads/${downloadId}`);
      addToast(intl.formatMessage(messages.cancelSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      mutate(); // Refresh the list
    } catch (error) {
      addToast(intl.formatMessage(messages.cancelError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsCancelling(null);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'downloading':
        return <ArrowDownTrayIcon className="h-5 w-5 text-blue-500" />;
      case 'completed':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      case 'cancelled':
        return <XMarkIcon className="h-5 w-5 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'downloading':
        return 'text-blue-400';
      case 'completed':
        return 'text-green-400';
      case 'failed':
        return 'text-red-400';
      case 'cancelled':
        return 'text-gray-400';
      default:
        return 'text-gray-400';
    }
  };

  if (!webshareSettings?.enabled) {
    return (
      <div className="mb-6">
        <PageTitle title={intl.formatMessage(messages.downloadManager)} />
        <Header>{intl.formatMessage(messages.downloadManager)}</Header>
        <div className="mt-6 text-center">
          <ExclamationTriangleIcon className="mx-auto h-16 w-16 text-yellow-500" />
          <h3 className="mt-4 text-lg font-medium text-white">
            {intl.formatMessage(messages.notConfigured)}
          </h3>
          <div className="mt-4">
            <Link href="/settings/webshare">
              <Button buttonType="primary">
                {intl.formatMessage(messages.configureWebShare)}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6">
        <PageTitle title={intl.formatMessage(messages.downloadManager)} />
        <Header>{intl.formatMessage(messages.downloadManager)}</Header>
        <div className="mt-6 text-center text-red-400">
          Error loading downloads: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <PageTitle title={intl.formatMessage(messages.downloadManager)} />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.downloadManager)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.downloadManagerDescription)}
        </p>
        {refreshInterval <= 5000 && (
          <p className="text-sm text-green-400 mt-2">
            {intl.formatMessage(messages.autoRefresh)}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      ) : downloads.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          <ArrowDownTrayIcon className="mx-auto h-16 w-16 text-gray-600" />
          <p className="mt-4">{intl.formatMessage(messages.noDownloads)}</p>
        </div>
      ) : (
        <div className="overflow-hidden bg-gray-800 shadow sm:rounded-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {intl.formatMessage(messages.fileName)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {intl.formatMessage(messages.status)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {intl.formatMessage(messages.progress)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {intl.formatMessage(messages.size)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {intl.formatMessage(messages.speed)}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {intl.formatMessage(messages.actions)}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {downloads.map((download) => (
                  <tr key={download.id} className="hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white truncate max-w-xs">
                        {download.fileName}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(download.status)}
                        <span className={`ml-2 text-sm ${getStatusColor(download.status)}`}>
                          {intl.formatMessage(messages[download.status as keyof typeof messages])}
                        </span>
                      </div>
                      {download.error && (
                        <div className="text-xs text-red-400 mt-1 truncate max-w-xs">
                          {download.error}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            download.status === 'completed'
                              ? 'bg-green-500'
                              : download.status === 'failed'
                              ? 'bg-red-500'
                              : download.status === 'cancelled'
                              ? 'bg-gray-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${download.progress}%` }}
                        />
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {download.progress}%
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {download.totalSize ? (
                        <div>
                          <div>{formatBytes(download.downloadedSize)} / {formatBytes(download.totalSize)}</div>
                        </div>
                      ) : (
                        <div>{formatBytes(download.downloadedSize)}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {download.status === 'downloading' && download.speed
                        ? formatSpeed(download.speed)
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {download.status === 'downloading' && (
                        <Button
                          buttonType="danger"
                          buttonSize="sm"
                          disabled={isCancelling === download.id}
                          onClick={() => cancelDownload(download.id)}
                        >
                          {isCancelling === download.id ? (
                            <LoadingSpinner />
                          ) : (
                            intl.formatMessage(messages.cancel)
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebShareDownloadManager;
