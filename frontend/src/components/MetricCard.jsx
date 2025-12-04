import './MetricCard.css';

const MetricCard = ({ title, value, format = 'default' }) => {
  const formatValue = (val, fmt) => {
    if (fmt === 'currency') {
      return `$${parseFloat(val).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`;
    }
    if (fmt === 'number') {
      return parseFloat(val).toLocaleString('en-US');
    }
    return val;
  };

  return (
    <div className="metric-card">
      <div className="metric-title">{title}</div>
      <div className="metric-value">{formatValue(value, format)}</div>
    </div>
  );
};

export default MetricCard;

