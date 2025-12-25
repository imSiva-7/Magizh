export const getTodayDate = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getPreviousMonthDate = () => {
  const today = new Date();
  const previousMonth = new Date(today);
  previousMonth.setMonth(today.getMonth() - 1);

  const year = previousMonth.getFullYear();
  const month = String(previousMonth.getMonth() + 1).padStart(2, "0");
  const day = String(previousMonth.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const formatDateForDisplay = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};
