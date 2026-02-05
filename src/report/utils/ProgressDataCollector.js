import useMentorMenteeStore from '../../appMentor/useMentorMenteeStore';
import { getMonthlyWatchTimefromBackend, getWatchTimefromBackend } from '../../appMentorBackend/reportMgt';
import {getMonthlyWatchTimes} from '../../database/R';

const formatDate = (year, month, day) =>
  `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

const toDateString = date =>
  `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;


export const generateWatchData = async (month, newTarget,menteeId = null) => {
  const [year, monthNum] = month.split('-').map(Number);
  const jsMonth = monthNum - 1;

  const firstOfMonth = new Date(year, jsMonth, 1);
  const lastOfMonth = new Date(year, jsMonth + 1, 0);

  const firstDayWeekday = firstOfMonth.getDay(); // Sunday = 0
  const lastDayWeekday = lastOfMonth.getDay(); // Sunday = 0

  // Week starts on Monday: shift Sunday (0) to 6, others shift by -1
  const mondayBasedFirstDay = (firstDayWeekday + 6) % 7;
  const mondayBasedLastDay = (lastDayWeekday + 6) % 7;

  const calendarStartDate = new Date(firstOfMonth);
  calendarStartDate.setDate(firstOfMonth.getDate() - mondayBasedFirstDay);

  const calendarEndDate = new Date(lastOfMonth);
  calendarEndDate.setDate(lastOfMonth.getDate() + (6 - mondayBasedLastDay));

  const startDateStr = toDateString(calendarStartDate);
  const endDateStr = toDateString(calendarEndDate);
  console.log(startDateStr, endDateStr);

  try {
    const monthlyData = menteeId ? await getWatchTimefromBackend(menteeId,startDateStr,endDateStr): await getMonthlyWatchTimes(startDateStr, endDateStr);
    console.log('checking data', monthlyData);
    const data = {};
    let currentDate = new Date(calendarStartDate);

    while (currentDate <= calendarEndDate) {
      const dateStr = toDateString(currentDate);
      const dayData = monthlyData[dateStr] || {
        totalWatchTime: 0,
        totalNewWatchTime: 0,
        totalUnfltrdWatchTime: 0,
      };

      data[dateStr] = {
        totalWatchTime: dayData.totalWatchTime / 60,
        totalNewWatchTime: dayData.totalNewWatchTime / 60,
        totalUnfltrdWatchTime: dayData.totalUnfltrdWatchTime / 60,
      };

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return data;
  } catch (error) {
    console.error(`Error fetching extended monthly watch times:`, error);
    return generateEmptyMonthData(
      year,
      monthNum,
      lastOfMonth.getDate(),
      newTarget,
    );
  }
};

// Fallback: Empty month with normalized structure
function generateEmptyMonthData(year, monthNum, daysInMonth, newTarget) {
  const data = {};
  for (let i = 1; i <= daysInMonth; i++) {
    const date = `${year}-${monthNum.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
    data[date] = {
      totalWatchTime: 0,
      totalNewWatchTime: 0,
      totalUnfltrdWatchTime: 0,
    };
  }
  return data;
}
