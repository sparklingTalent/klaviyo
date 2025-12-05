import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

const RevenueChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#667eea" stopOpacity={0.3}/>
            <stop offset="95%" stopColor="#764ba2" stopOpacity={0.1}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 11, fill: '#64748b' }}
          angle={-45}
          textAnchor="end"
          height={80}
          stroke="#cbd5e1"
        />
        <YAxis 
          tick={{ fontSize: 11, fill: '#64748b' }}
          tickFormatter={(value) => `$${value.toLocaleString()}`}
          stroke="#cbd5e1"
        />
        <Tooltip 
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
          formatter={(value) => [
            `$${parseFloat(value).toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}`,
            'Revenue'
          ]}
        />
        <Legend 
          wrapperStyle={{ paddingTop: '20px' }}
          iconType="line"
        />
        <Area 
          type="monotone" 
          dataKey="revenue" 
          stroke="#667eea" 
          strokeWidth={3}
          fill="url(#colorRevenue)"
          name="Revenue"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default RevenueChart;

