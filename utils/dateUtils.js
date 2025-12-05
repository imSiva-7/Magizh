// utils/dateUtils.js (create separate file)
export const formatDateToLocalString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getPreviousMonthDate = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return formatDateToLocalString(d);
};

export const getTodayDate = () => formatDateToLocalString(new Date());