import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

export default function TelemetryChart({ locations = [] }) {
  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!chartCanvasRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const reversedData = [...locations].reverse();
    const labels = reversedData.map((loc, idx) => {
      if (loc.timestamp?.toDate) {
        return loc.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else if (loc.timestamp instanceof Date) {
        return loc.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      return `T-${reversedData.length - idx}`;
    });

    const batteryData = reversedData.map(loc => loc.batteryLevel || 80);
    const speedData = reversedData.map(loc => (loc.speed || 0).toFixed(1));

    const ctx = chartCanvasRef.current.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 229, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(0, 229, 255, 0.0)');

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['00:00', '00:05', '00:10', '00:15'],
        datasets: [
          {
            label: 'Battery Level (%)',
            data: batteryData.length ? batteryData : [90, 89, 87, 85],
            borderColor: '#00E5FF',
            backgroundColor: gradient,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: '#00E5FF',
            yAxisID: 'y'
          },
          {
            label: 'Speed (m/s)',
            data: speedData.length ? speedData : [1.2, 2.5, 3.1, 0.8],
            borderColor: '#A855F7',
            borderDash: [5, 5],
            fill: false,
            tension: 0.2,
            pointRadius: 2,
            pointBackgroundColor: '#A855F7',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: '#94a3b8',
              font: { size: 11 }
            }
          },
          tooltip: {
            backgroundColor: '#0f172a',
            borderColor: '#334155',
            borderWidth: 1,
            titleColor: '#e2e8f0',
            bodyColor: '#cbd5e1'
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(51, 65, 85, 0.2)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          },
          y: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            grid: { color: 'rgba(51, 65, 85, 0.2)' },
            ticks: { color: '#64748b', font: { size: 10 } }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#a855f7', font: { size: 10 } }
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [locations]);

  return (
    <div className="w-full h-56 p-2">
      <canvas ref={chartCanvasRef} />
    </div>
  );
}
