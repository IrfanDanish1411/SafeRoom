import { useSensorHistory, useStats } from '../hooks/useHistory';
import './HistoryPanel.css';

function HistoryPanel() {
    const { data: sensorData, loading } = useSensorHistory(24);
    const stats = useStats(24);

    if (loading) {
        return (
            <div className="history-panel">
                <div className="loading">Loading history...</div>
            </div>
        );
    }

    // Get last 10 readings for display
    const recentReadings = sensorData.slice(0, 10);

    return (
        <div className="history-panel">
            {/* Stats Summary */}
            {stats && (
                <div className="stats-grid">
                    <div className="stat-item">
                        <div className="stat-value">{stats.total_readings}</div>
                        <div className="stat-label">Readings (24h)</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{stats.avg_temp}°C</div>
                        <div className="stat-label">Avg Temp</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-value">{stats.max_temp}°C</div>
                        <div className="stat-label">Max Temp</div>
                    </div>
                    <div className="stat-item alert">
                        <div className="stat-value">{stats.total_alerts}</div>
                        <div className="stat-label">Alerts</div>
                    </div>
                </div>
            )}

            {/* Recent Readings Table */}
            <div className="readings-table">
                <h3>📊 Recent Readings</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Temp</th>
                            <th>Humidity</th>
                            <th>Occupants</th>
                        </tr>
                    </thead>
                    <tbody>
                        {recentReadings.map((reading, index) => (
                            <tr key={index}>
                                <td>{new Date(reading.timestamp).toLocaleTimeString()}</td>
                                <td>{reading.temp?.toFixed(1)}°C</td>
                                <td>{reading.humidity?.toFixed(0)}%</td>
                                <td>{reading.occupant_count || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default HistoryPanel;
