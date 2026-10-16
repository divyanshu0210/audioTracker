import React from 'react';
import {Text} from 'react-native';
import {MenuItem} from 'react-native-material-menu';
import {getShareLink} from '../../Linking/utils/shareLink';
import {useMediaStore} from '../../stores/useMediaStore';
import {shareDeviceFile} from '../../share/shareDeviceFile';
import DriveMenuItems from './DriveMenuItems';

const DeviceMenuActions = ({item, hideMenu, onOpenShare, screen}) => {
  const driveCopyId = item?.drive_file_id ?? null;
  const shareLink = getShareLink(item, driveCopyId);
  const isMissing = useMediaStore(
    state =>
      state.deviceFilesChecked && !state.validDeviceIds[item?.source_id],
  );
  const canShareFile = !!item?.file_path && !isMissing;
  const canBackup = canShareFile && !driveCopyId;

  return (
    <>
      {(canShareFile || shareLink) && (
        <MenuItem
          onPress={() => {
            hideMenu();
            onOpenShare();
          }}>
          <Text style={styles.menuItemText}>Share</Text>
        </MenuItem>
      )}
      {canBackup && (
        <MenuItem
          onPress={() => {
            hideMenu();
            shareDeviceFile(item, {purpose: 'backup'});
          }}>
          <Text style={styles.menuItemText}>Backup</Text>
        </MenuItem>
      )}
      <DriveMenuItems item={item} screen={screen} hideMenu={hideMenu} />
    </>
  );
};

export default React.memo(DeviceMenuActions);

const styles = {
  menuItemText: {fontSize: 16, color: '#333', paddingVertical: 8},
};
