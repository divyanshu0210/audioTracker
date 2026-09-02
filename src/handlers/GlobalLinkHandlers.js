import React from 'react';

import { NotificationHandler } from './NotificationHandler';
import useLinkHandler from '../Linking/LinkHandler';
import useSharedContentHandler from '../Linking/ShareHandler';
import usePendingPickHandler from '../Linking/PendingPickHandler';


function GlobalListeners() {
  useLinkHandler();
  useSharedContentHandler();
  usePendingPickHandler();

  return <NotificationHandler />;
}

export default React.memo(GlobalListeners);