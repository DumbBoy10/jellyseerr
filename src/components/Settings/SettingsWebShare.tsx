import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Field, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate } from 'swr';
import * as Yup from 'yup';
import axios from 'axios';

const messages = defineMessages('components.Settings.SettingsWebShare', {
  webshare: 'WebShare.cz',
  webshareSettings: 'WebShare.cz Settings',
  webshareSettingsDescription:
    'Configure WebShare.cz integration for downloading media files. This allows users to search and download files directly from WebShare.cz.',
  enableWebShare: 'Enable WebShare.cz Integration',
  username: 'Username',
  password: 'Password',
  downloadPath: 'Download Directory',
  downloadPathDescription: 'Local directory where downloaded files will be saved',
  testConnection: 'Test Connection',
  testSuccessful: 'WebShare.cz connection established successfully!',
  testFailed: 'Failed to connect to WebShare.cz. Please check your credentials.',
  validationUsernameRequired: 'You must provide a username',
  validationPasswordRequired: 'You must provide a password',
  validationDownloadPathRequired: 'You must provide a download directory path',
  save: 'Save Changes',
  saving: 'Saving...',
  settingsSaved: 'WebShare.cz settings saved successfully!',
  settingsFailed: 'Failed to save WebShare.cz settings.',
});

interface WebShareSettings {
  enabled: boolean;
  username: string;
  password: string;
  downloadPath: string;
}

const SettingsWebShare = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const [isValidated, setIsValidated] = useState(false);

  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<WebShareSettings>('/api/v1/settings/webshare');

  const WebShareSettingsSchema = Yup.object().shape({
    username: Yup.string().when('enabled', {
      is: true,
      then: (schema) => schema.required(intl.formatMessage(messages.validationUsernameRequired)),
      otherwise: (schema) => schema,
    }),
    password: Yup.string().when('enabled', {
      is: true,
      then: (schema) => schema.required(intl.formatMessage(messages.validationPasswordRequired)),
      otherwise: (schema) => schema,
    }),
    downloadPath: Yup.string().when('enabled', {
      is: true,
      then: (schema) => schema.required(intl.formatMessage(messages.validationDownloadPathRequired)),
      otherwise: (schema) => schema,
    }),
  });

  const testConnection = async (values: { username: string; password: string }) => {
    setIsTesting(true);
    try {
      await axios.post('/api/v1/settings/webshare/test', {
        username: values.username,
        password: values.password,
      });
      setIsValidated(true);
      addToast(intl.formatMessage(messages.testSuccessful), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (e) {
      setIsValidated(false);
      addToast(intl.formatMessage(messages.testFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.webshare)} />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.webshareSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.webshareSettingsDescription)}
        </p>
      </div>
      <Formik
        initialValues={{
          enabled: data?.enabled ?? false,
          username: data?.username ?? '',
          password: data?.password ?? '',
          downloadPath: data?.downloadPath ?? '',
        }}
        validationSchema={WebShareSettingsSchema}
        enableReinitialize
        onSubmit={async (values) => {
          try {
            await axios.post('/api/v1/settings/webshare', values);
            mutate('/api/v1/settings/public');
            revalidate();
            addToast(intl.formatMessage(messages.settingsSaved), {
              appearance: 'success',
              autoDismiss: true,
            });
          } catch (e) {
            addToast(intl.formatMessage(messages.settingsFailed), {
              appearance: 'error',
              autoDismiss: true,
            });
          }
        }}
      >
        {({ errors, touched, values, handleSubmit, setFieldValue, isSubmitting }) => {
          return (
            <form className="section" onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="enabled" className="checkbox-label">
                  {intl.formatMessage(messages.enableWebShare)}
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="enabled"
                    name="enabled"
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setFieldValue('enabled', e.target.checked);
                      if (!e.target.checked) {
                        setIsValidated(false);
                      }
                    }}
                  />
                </div>
              </div>

              {values.enabled && (
                <>
                  <div className="form-row">
                    <label htmlFor="username" className="text-label">
                      {intl.formatMessage(messages.username)}
                      <span className="label-required">*</span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field
                          id="username"
                          name="username"
                          type="text"
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setIsValidated(false);
                            setFieldValue('username', e.target.value);
                          }}
                        />
                      </div>
                      {errors.username && touched.username && (
                        <div className="error">{errors.username}</div>
                      )}
                    </div>
                  </div>

                  <div className="form-row">
                    <label htmlFor="password" className="text-label">
                      {intl.formatMessage(messages.password)}
                      <span className="label-required">*</span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field
                          id="password"
                          name="password"
                          type="password"
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setIsValidated(false);
                            setFieldValue('password', e.target.value);
                          }}
                        />
                      </div>
                      {errors.password && touched.password && (
                        <div className="error">{errors.password}</div>
                      )}
                    </div>
                  </div>

                  <div className="form-row">
                    <label htmlFor="downloadPath" className="text-label">
                      {intl.formatMessage(messages.downloadPath)}
                      <span className="label-required">*</span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field
                          id="downloadPath"
                          name="downloadPath"
                          type="text"
                          placeholder="/downloads/webshare"
                        />
                      </div>
                      <div className="form-input-help">
                        {intl.formatMessage(messages.downloadPathDescription)}
                      </div>
                      {errors.downloadPath && touched.downloadPath && (
                        <div className="error">{errors.downloadPath}</div>
                      )}
                    </div>
                  </div>

                  <div className="actions">
                    <div className="flex gap-3">
                      <Button
                        buttonType="default"
                        type="button"
                        disabled={
                          !values.username ||
                          !values.password ||
                          isTesting ||
                          isSubmitting
                        }
                        onClick={() => testConnection(values)}
                      >
                        {isTesting
                          ? intl.formatMessage(globalMessages.testing)
                          : intl.formatMessage(messages.testConnection)}
                      </Button>

                      <Button
                        buttonType="primary"
                        type="submit"
                        disabled={isSubmitting || !values.enabled || !isValidated}
                      >
                        {isSubmitting
                          ? intl.formatMessage(messages.saving)
                          : intl.formatMessage(messages.save)}
                      </Button>
                    </div>
                  </div>

                  {!isValidated && values.username && values.password && (
                    <Alert title={intl.formatMessage(messages.testFailed)} type="warning" />
                  )}
                </>
              )}
            </form>
          );
        }}
      </Formik>
    </>
  );
};

export default SettingsWebShare;
