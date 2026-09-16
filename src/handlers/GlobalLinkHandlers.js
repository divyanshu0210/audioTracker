import React from 'react';

import { NotificationHandler } from './NotificationHandler';
import useLinkHandler from '../Linking/LinkHandler';
import useSharedContentHandler from '../Linking/ShareHandler';
import useMenteeStatusRefresh from '../appMentor/useMenteeStatusRefresh';
import {useMenteeNotesWorkerEvents} from '../appMentor/menteeNotesSync';


function GlobalListeners() {
  useLinkHandler();
  useSharedContentHandler();
  useMenteeStatusRefresh();
  // The worker is started from the drawer and can finish long after the
  // mentor has navigated on, so this cannot live on the screen that reads.
  useMenteeNotesWorkerEvents();

  return <NotificationHandler />;
}

export default React.memo(GlobalListeners);