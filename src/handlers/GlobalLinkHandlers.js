import React from 'react';

import { NotificationHandler } from './NotificationHandler';
import useLinkHandler from '../Linking/LinkHandler';
import useSharedContentHandler from '../Linking/ShareHandler';
import useMenteeStatusRefresh from '../appMentor/useMenteeStatusRefresh';


function GlobalListeners() {
  useLinkHandler();
  useSharedContentHandler();
  useMenteeStatusRefresh();

  return <NotificationHandler />;
}

export default React.memo(GlobalListeners);