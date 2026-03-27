import React from 'react';
import { Line, Bar } from 'react-chartjs-2';

function DataVisualization({ data, stats }) {
  const lineChartOptions = {
    scales: {
      yAxes: [{
        ticks: {
          beginAtZero: true
        }
      }]
    }
  };

  const barChartOptions = {
    scales: {
      yAxes: [{
        ticks: {
          beginAtZero: true
        }
      }]
    }
  };

  return (
    <div className="data-visualization">
      <Line data={data} options={lineChartOptions} />
      <Bar data={stats} options={barChartOptions} />
    </div>
  );
}

export default DataVisualization;