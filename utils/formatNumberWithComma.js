const formatNumberWithCommas = (value, decimals = 2) => {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return (0).toFixed(decimals);
  }

  return num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const formatNumberWithCommasNoDecimal = (value, decimals = 0) => {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return (0).toFixed(decimals);
  }

  return num.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

// Summary cards use whole numbers; calculations and entry displays retain precision.
const formatStat = (value) => formatNumberWithCommasNoDecimal(value);

export {formatNumberWithCommas, formatNumberWithCommasNoDecimal, formatStat};
