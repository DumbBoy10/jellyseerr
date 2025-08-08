import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Badge from '@app/components/Common/Badge';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { CloudArrowDownIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';
import axios from 'axios';

const messages = defineMessages('components.WebShareDownloadModal', {
  webshareDownload: 'Download from WebShare.cz',
  searchResults: 'Search Results',
  noResults: 'No files found for this title',
  fileSize: 'Size',
  download: 'Download',
  downloading: 'Downloading...',
  downloadSuccess: 'File queued for download successfully!',
  downloadError: 'Failed to download file',
  searchError: 'Failed to search WebShare.cz',
  webshareNotConfigured: 'WebShare.cz is not configured',
});

interface WebShareFile {
  ident: string;
  name: string;
  size: number;
  type: string;
  positive_votes: number;
  negative_votes: number;
  password: boolean;
}

interface WebShareSearchResponse {
  files: WebShareFile[];
  total: number;
}

interface WebShareDownloadModalProps {
  show: boolean;
  onClose: () => void;
  mediaTitle: string;
  mediaYear?: number;
}

const WebShareDownloadModal = ({
  show,
  onClose,
  mediaTitle,
  mediaYear,
}: WebShareDownloadModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Check if WebShare is configured
  const { data: webshareSettings } = useSWR('/api/v1/settings/webshare');

  // Search for files
  const searchQuery = mediaYear 
    ? `${mediaTitle} ${mediaYear}`
    : mediaTitle;

  const { data: searchResults, error: searchError, isLoading } = useSWR<WebShareSearchResponse>(
    show && webshareSettings?.enabled ? `/api/v1/webshare/search?q=${encodeURIComponent(searchQuery)}&category=video` : null
  );

  const handleDownload = async (file: WebShareFile) => {
    if (!hasPermission(Permission.ADMIN)) {
      addToast('You do not have permission to download files', {
        appearance: 'error',
        autoDismiss: true,
      });
      return;
    }

    setIsDownloading(file.ident);
    try {
      await axios.post(`/api/v1/webshare/download/${file.ident}`, {
        fileName: file.name,
      });

      addToast(intl.formatMessage(messages.downloadSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (error) {
      addToast(intl.formatMessage(messages.downloadError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsDownloading(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getRatingColor = (positive: number, negative: number): string => {
    const total = positive + negative;
    if (total === 0) return 'gray';
    const ratio = positive / total;
    if (ratio >= 0.8) return 'green';
    if (ratio >= 0.6) return 'yellow';
    return 'red';
  };

  if (!webshareSettings?.enabled) {
    return show ? (
      <Modal
        onCancel={onClose}
        title={intl.formatMessage(messages.webshareDownload)}
        cancelText={intl.formatMessage(globalMessages.close)}
      >
        <div className="text-center py-8">
          <p className="text-gray-300">
            {intl.formatMessage(messages.webshareNotConfigured)}
          </p>
        </div>
      </Modal>
    ) : null;
  }

  return show ? (
    <Modal
      onCancel={onClose}
      title={intl.formatMessage(messages.webshareDownload)}
      cancelText={intl.formatMessage(globalMessages.close)}
      dialogClass="max-w-4xl"
    >
      <div className="space-y-4">
        <div>
          <h4 className="text-lg font-medium text-white mb-2">
            {intl.formatMessage(messages.searchResults)} - "{searchQuery}"
          </h4>
        </div>

        {isLoading && (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        )}

        {searchError && (
          <div className="text-center py-8">
            <p className="text-red-400">
              {intl.formatMessage(messages.searchError)}
            </p>
          </div>
        )}

        {searchResults && searchResults.files.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-300">
              {intl.formatMessage(messages.noResults)}
            </p>
          </div>
        )}

        {searchResults && searchResults.files.length > 0 && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {searchResults.files.map((file) => (
              <div
                key={file.ident}
                className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <h5 className="text-white font-medium truncate mb-1">
                    {file.name}
                  </h5>
                  <div className="flex items-center space-x-3 text-sm text-gray-300">
                    <span>{formatFileSize(file.size)}</span>
                    <span className="uppercase">{file.type}</span>
                    {file.password && (
                      <Badge badgeType="warning">Password Protected</Badge>
                    )}
                    {(file.positive_votes > 0 || file.negative_votes > 0) && (
                      <div className="flex items-center space-x-1">
                        <span className={`text-${getRatingColor(file.positive_votes, file.negative_votes)}-400`}>
                          ↑{file.positive_votes}
                        </span>
                        <span className="text-red-400">
                          ↓{file.negative_votes}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 ml-4">
                  <Button
                    buttonType="primary"
                    onClick={() => handleDownload(file)}
                    disabled={isDownloading === file.ident}
                    className="flex items-center space-x-2"
                  >
                    <CloudArrowDownIcon className="w-4 h-4" />
                    <span>
                      {isDownloading === file.ident
                        ? intl.formatMessage(messages.downloading)
                        : intl.formatMessage(messages.download)}
                    </span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {searchResults && searchResults.total > searchResults.files.length && (
          <div className="text-center text-gray-400 text-sm">
            Showing {searchResults.files.length} of {searchResults.total} results
          </div>
        )}
      </div>
    </Modal>
  ) : null;
};

export default WebShareDownloadModal;
