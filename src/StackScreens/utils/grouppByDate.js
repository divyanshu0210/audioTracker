import moment from 'moment';

// getDate exists because created_at isn't always the date a list is about.
// The Downloads screen groups by when the file actually reached the disk;
// its rows were first seen (created_at) whenever the item was added, which
// for a file downloaded months later is a different day entirely.
export const groupItemsByDate = (items, getDate = item => item?.created_at) => {
  const grouped = {};

  items.forEach(item => {
    const createdAt = getDate(item);
    const dateKey = moment(createdAt).isSame(moment(), 'day')
      ? 'Today'
      : moment(createdAt).format('MMMM DD, YYYY');

    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(item);
  });

  // Sort by date descending
  const sortedSections = Object.keys(grouped)
    .sort((a, b) => {
      if (a === 'Today') return -1;
      if (b === 'Today') return 1;
      return moment(b, 'MMMM DD, YYYY').valueOf() - moment(a, 'MMMM DD, YYYY').valueOf();
    })
    .map(date => ({title: date, data: grouped[date]}));

  return sortedSections;
};
