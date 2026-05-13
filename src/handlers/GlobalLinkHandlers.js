import React from 'react';

import { NotificationHandler } from './NotificationHandler';
import useLinkHandler from '../Linking/LinkHandler';
import useSharedContentHandler from '../Linking/ShareHandler';


function GlobalListeners() {
  useLinkHandler();
  useSharedContentHandler();

  return <NotificationHandler />;
}

export default React.memo(GlobalListeners);