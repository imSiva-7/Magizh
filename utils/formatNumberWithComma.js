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

export {formatNumberWithCommas, formatNumberWithCommasNoDecimal};