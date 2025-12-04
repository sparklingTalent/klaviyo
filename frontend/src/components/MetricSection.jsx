import './MetricSection.css';

const MetricSection = ({ title, children }) => {
  return (
    <div className="metric-section">
      <h2 className="section-title">{title}</h2>
      {children}
    </div>
  );
};

export default MetricSection;

