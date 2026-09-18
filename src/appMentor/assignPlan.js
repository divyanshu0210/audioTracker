// assignPlan.js
//
// What a selection actually means once it reaches the Assign screen.
//
// The selection is made on another screen entirely, and the Assign button
// appears as soon as *one* item in it is assignable — so a selection that got
// here can hold notes, notebooks, categories and device files with nothing in
// Drive behind them, all mixed in with the lectures the mentor meant to send.
// None of that used to be visible: the screen showed a count, and the parts it
// could not send were either dropped in silence or posted to the server as a
// row the mentee's app has no branch for.
//
// This turns the raw selection into one entry per item, each carrying the
// reason it will or will not travel, so the screen can say so before anything
// is sent rather than in an alert afterwards.

import {ItemTypes} from '../contexts/constants';
import {getDriveCopyId} from '../database/sharedDriveCopies';

export const AssignStatus = Object.freeze({
  // Addressable on the mentee's device and ready to post.
  READY: 'ready',
  // A device file with no copy in the mentor's Drive. Fixable by the mentor,
  // here, today — which is why it is its own status and not lumped in below.
  NO_COPY: 'no_copy',
  // A note, a notebook, a category: nothing another phone could fetch by id.
  // Not a problem to fix, just a thing that cannot be assigned.
  UNSUPPORTED: 'unsupported',
});

// The same allowlist SelectionHeader uses to decide whether to offer Assign at
// all. Kept here because this is where it is enforced; the header only decides
// whether the door is open, this decides what fits through it.
export const ASSIGNABLE_TYPES = Object.freeze([
  ItemTypes.YOUTUBE,
  ItemTypes.DRIVE,
  ItemTypes.DEVICE,
  ItemTypes.ISKCON,
]);

const ASSIGNABLE = new Set(ASSIGNABLE_TYPES);

const TYPE_META = {
  [ItemTypes.YOUTUBE]: {label: 'YouTube', icon: 'logo-youtube'},
  [ItemTypes.DRIVE]: {label: 'Drive', icon: 'cloud-outline'},
  [ItemTypes.DEVICE]: {label: 'On this phone', icon: 'phone-portrait-outline'},
  [ItemTypes.ISKCON]: {label: 'Iskcon', icon: 'planet-outline'},
  [ItemTypes.NOTE]: {label: 'Note', icon: 'document-text-outline'},
  [ItemTypes.NOTEBOOK]: {label: 'Notebook', icon: 'book-outline'},
  [ItemTypes.CATEGORY]: {label: 'Category', icon: 'pricetag-outline'},
};

const metaFor = type => TYPE_META[type] ?? {label: 'Item', icon: 'ellipse-outline'};

// Why an unsupported item is unsupported, in the words that tell the mentor
// what to do instead. A generic "cannot be assigned" on a notebook reads as a
// bug; naming the reason makes it a rule.
const unsupportedReason = type => {
  switch (type) {
    case ItemTypes.NOTE:
      return 'Notes are shared, not assigned — use Share from the note menu';
    case ItemTypes.NOTEBOOK:
      return 'Notebooks stay on your phone — share their notes instead';
    case ItemTypes.CATEGORY:
      return 'A category is your own label — assign what is inside it';
    default:
      return 'This kind of item cannot be assigned';
  }
};

/**
 * One entry per selected item, in selection order.
 *
 * Async because a device file's eligibility is a database question: whether a
 * Drive copy exists for it. That lookup used to happen inside the send, which
 * is why the mentor only learned a file was unshareable after committing to
 * the assignment. Doing it while the screen opens costs one query per device
 * file and buys the answer up front.
 */
export const buildAssignPlan = async (selectedItems = []) =>
  Promise.all(selectedItems.map(buildEntry));

const buildEntry = async item => {
  const type = item.type;
  const {label, icon} = metaFor(type);
  const base = {
    key: `${type}:${item.id}`,
    id: item.id,
    type,
    subtype: item.subtype,
    title: item.title || 'Untitled',
    typeLabel: label,
    icon,
    driveCopyId: null,
    payload: null,
  };

  if (!ASSIGNABLE.has(type)) {
    return {...base, status: AssignStatus.UNSUPPORTED, reason: unsupportedReason(type)};
  }

  // A device file is bytes on *this* phone. The only thing a mentee can reach
  // is the copy in the mentor's Drive, so no copy means no assignment — see
  // the payload note below for why it still travels as 'device'.
  if (type === ItemTypes.DEVICE) {
    const driveCopyId = item.dbId ? await getDriveCopyId(item.dbId) : null;
    if (!driveCopyId) {
      return {
        ...base,
        status: AssignStatus.NO_COPY,
        reason: 'No copy in your Drive yet — share this file first',
      };
    }
    return {
      ...base,
      status: AssignStatus.READY,
      reason: 'Will be sent as your Drive copy',
      driveCopyId,
      // video_id is where the bytes come from — the Drive copy, the only thing
      // another phone can reach. origin_video_id is what the file *is*, and
      // both sides key on it: it becomes the mentee's source_id and keeps the
      // mentor's own row findable for the delivery tick.
      payload: {
        video_id: driveCopyId,
        video_type: ItemTypes.DEVICE,
        origin_video_id: item.id,
      },
    };
  }

  return {
    ...base,
    status: AssignStatus.READY,
    reason: null,
    payload: {video_id: item.id, video_type: type},
  };
};

export const readyEntries = plan =>
  plan.filter(entry => entry.status === AssignStatus.READY);

export const summarisePlan = plan => ({
  total: plan.length,
  ready: plan.filter(e => e.status === AssignStatus.READY).length,
  noCopy: plan.filter(e => e.status === AssignStatus.NO_COPY).length,
  unsupported: plan.filter(e => e.status === AssignStatus.UNSUPPORTED).length,
});

/**
 * The assignment this mentee already has for this entry, if any.
 *
 * `assignmentsByVideoId` is keyed under both ids an assignment can be known
 * by — see useAssignmentStatusStore.setForMentee, which builds the same map
 * for the status ticks. For everything but a device file the two are equal; a
 * device file was assigned as its Drive copy, so the mentor's own id only
 * appears as origin_video_id.
 */
export const existingAssignmentFor = (assignmentsByVideoId, entry) => {
  if (!assignmentsByVideoId) return null;
  return (
    assignmentsByVideoId[String(entry.id)] ??
    (entry.driveCopyId ? assignmentsByVideoId[String(entry.driveCopyId)] : null) ??
    null
  );
};

// Keyed under both ids for the same reason as above, so a lookup by either
// finds it.
export const indexAssignments = (assignments = []) =>
  assignments.reduce((map, assignment) => {
    map[String(assignment.video_id)] = assignment;
    if (assignment.origin_video_id) {
      map[String(assignment.origin_video_id)] = assignment;
    }
    return map;
  }, {});
