import moment from 'moment';

export const groupItemsByDate = items => {
  const grouped = {};

  items.forEach(item => {
    const createdAt = item?.created_at;
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
