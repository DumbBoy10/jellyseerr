import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsWebShare from '@app/components/Settings/SettingsWebShare';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const SettingsWebSharePage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsWebShare />
    </SettingsLayout>
  );
};

export default SettingsWebSharePage;
