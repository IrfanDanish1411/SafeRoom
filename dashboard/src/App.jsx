import { useState, useEffect, useCallback } from 'react';
import mqtt from 'mqtt';
import './index.css';

// ==================== CONFIGURATION ====================
const MQTT_BROKER_URL = 'ws://35.193.224.18:9001/mqtt';
const API_BASE = 'http://35.193.224.18:5000/api';

const TOPICS = {
    SENSORS: 'room/sensors',
    STATUS: 'room/status',
    ALERT: 'room/alert',
    COMMAND: 'room/command',
};

function App() {
    // Connection state
    const [connected, setConnected] = useState(false);
    const [client, setClient] = useState(null);

    // Sensor data
    const [sensors, setSensors] = useState({
        temp: 0,
        humidity: 0,
        ir: 0,
        pir: 0,
        occupant_count: 0,
    });

    // Status
    const [status, setStatus] = useState({
        door: 'unlocked',
        led: 'green',
        mode: 'normal',
        occupant_count: 0,
    });

    // Alerts
    const [alerts, setAlerts] = useState([]);

    // History data
    const [history, setHistory] = useState([]);
    const [stats, setStats] = useState(null);

    // Connect to MQTT
    useEffect(() => {
        const mqttClient = mqtt.connect(MQTT_BROKER_URL);

        mqttClient.on('connect', () => {
            setConnected(true);
            mqttClient.subscribe(Object.values(TOPICS).slice(0, 3));
        });

        mqttClient.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());

                if (topic === TOPICS.SENSORS) {
                    setSensors(data);
                } else if (topic === TOPICS.STATUS) {
                    setStatus(data);
                } else if (topic === TOPICS.ALERT) {
                    setAlerts(prev => [{
                        ...data,
                        id: Date.now(),
                        time: new Date().toLocaleTimeString(),
                    }, ...prev.slice(0, 9)]);
                }
            } catch (e) {
                console.error('Parse error:', e);
            }
        });

        mqttClient.on('close', () => setConnected(false));
        mqttClient.on('error', () => setConnected(false));

        setClient(mqttClient);
        return () => mqttClient.end();
    }, []);

    // Fetch history/stats
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [sensorsRes, statsRes] = await Promise.all([
                    fetch(`${API_BASE}/sensors?hours=24&limit=20`),
                    fetch(`${API_BASE}/stats?hours=24`)
                ]);
                if (sensorsRes.ok) setHistory(await sensorsRes.json());
                if (statsRes.ok) setStats(await statsRes.json());
            } catch (e) {
                console.log('API not available');
            }
        };
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, []);

    // Send command
    const sendCommand = useCallback((action) => {
        if (client && connected) {
            client.publish(TOPICS.COMMAND, JSON.stringify({ action }));
        }
    }, [client, connected]);

    // Determine current mode
    const currentMode = status.mode || 'normal';
    const isAlert = currentMode !== 'normal';
    const occupants = status.occupant_count || sensors.occupant_count || 0;

    return (
        <div className={`app ${isAlert ? 'alert-mode' : ''}`}>
            {/* Header */}
            <header className="header">
                <div className="header-content">
                    <h1>🏠 Room Safety Monitor</h1>
                    <div className={`connection-badge ${connected ? 'online' : 'offline'}`}>
                        <span className="pulse-dot"></span>
                        {connected ? 'Live' : 'Disconnected'}
                    </div>
                </div>
            </header>

            {/* Alert Banner */}
            {isAlert && (
                <div className={`alert-banner ${currentMode}`}>
                    <span className="alert-icon">{currentMode === 'fire' ? '🔥' : '🚨'}</span>
                    <span className="alert-text">
                        {currentMode === 'fire'
                            ? 'FIRE DETECTED - Door unlocked for evacuation!'
                            : 'BURGLAR DETECTED - Door locked!'}
                    </span>
                    <button className="alert-dismiss" onClick={() => sendCommand('reset')}>
                        Reset Alert
                    </button>
                </div>
            )}

            <main className="main-content">
                {/* Left Column - Controls */}
                <section className="control-panel">
                    {/* Door Control */}
                    <div className="panel door-panel">
                        <div className="panel-header">
                            <h2>🚪 Door Control</h2>
                        </div>
                        <div className="door-visual">
                            <div className={`door-icon ${status.door}`}>
                                {status.door === 'locked' ? '🔒' : '🔓'}
                            </div>
                            <span className={`door-status ${status.door}`}>
                                {status.door?.toUpperCase()}
                            </span>
                        </div>
                        <div className="door-actions">
                            <button
                                className="btn btn-lock"
                                onClick={() => sendCommand('lock')}
                                disabled={!connected}
                            >
                                🔒 Lock
                            </button>
                            <button
                                className="btn btn-unlock"
                                onClick={() => sendCommand('unlock')}
                                disabled={!connected}
                            >
                                🔓 Unlock
                            </button>
                        </div>
                        <button
                            className="btn btn-reset full-width"
                            onClick={() => sendCommand('reset')}
                            disabled={!connected}
                        >
                            🔄 Reset System
                        </button>
                    </div>

                    {/* Room Occupancy */}
                    <div className="panel occupancy-panel">
                        <div className="panel-header">
                            <h2>👥 Room Occupancy</h2>
                        </div>
                        <div className="occupancy-display">
                            <span className="occupancy-count">{occupants}</span>
                            <span className="occupancy-label">
                                {occupants === 0 ? 'Empty' : occupants === 1 ? 'Person' : 'People'}
                            </span>
                        </div>
                        <button
                            className="btn btn-checkout full-width"
                            onClick={() => sendCommand('checkout')}
                            disabled={!connected || occupants === 0}
                        >
                            🚪 Checkout (-1)
                        </button>
                    </div>
                </section>

                {/* Center Column - Sensors */}
                <section className="sensor-panel">
                    <div className="panel">
                        <div className="panel-header">
                            <h2>📊 Live Sensors</h2>
                        </div>
                        <div className="sensor-grid">
                            {/* Temperature */}
                            <div className="sensor-card temp">
                                <div className="sensor-icon">🌡️</div>
                                <div className="sensor-info">
                                    <span className="sensor-value">
                                        {sensors.temp?.toFixed(1) || 0}
                                        <small>°C</small>
                                    </span>
                                    <span className="sensor-label">Temperature</span>
                                </div>
                                <div className={`sensor-status ${sensors.temp >= 50 ? 'danger' : 'normal'}`}>
                                    {sensors.temp >= 50 ? '⚠️ HIGH' : 'Normal'}
                                </div>
                            </div>

                            {/* Humidity */}
                            <div className="sensor-card humidity">
                                <div className="sensor-icon">💧</div>
                                <div className="sensor-info">
                                    <span className="sensor-value">
                                        {sensors.humidity?.toFixed(0) || 0}
                                        <small>%</small>
                                    </span>
                                    <span className="sensor-label">Humidity</span>
                                </div>
                            </div>

                            {/* IR Sensor */}
                            <div className={`sensor-card ir ${sensors.ir ? 'active' : ''}`}>
                                <div className="sensor-icon">📡</div>
                                <div className="sensor-info">
                                    <span className="sensor-value">{sensors.ir ? 'TRIGGERED' : 'Clear'}</span>
                                    <span className="sensor-label">IR Entry</span>
                                </div>
                            </div>

                            {/* PIR Sensor */}
                            <div className={`sensor-card pir ${sensors.pir ? 'active' : ''}`}>
                                <div className="sensor-icon">🏃</div>
                                <div className="sensor-info">
                                    <span className="sensor-value">{sensors.pir ? 'MOTION' : 'No Motion'}</span>
                                    <span className="sensor-label">PIR Motion</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Status Indicators */}
                    <div className="panel status-panel">
                        <div className="panel-header">
                            <h2>📍 System Status</h2>
                        </div>
                        <div className="status-grid">
                            <div className="status-item">
                                <span className="status-label">Mode</span>
                                <span className={`status-value mode-${currentMode}`}>
                                    {currentMode.toUpperCase()}
                                </span>
                            </div>
                            <div className="status-item">
                                <span className="status-label">LED</span>
                                <span className={`status-value led-${status.led}`}>
                                    {status.led === 'red' ? '🔴 Red' : '🟢 Green'}
                                </span>
                            </div>
                            <div className="status-item">
                                <span className="status-label">Door</span>
                                <span className={`status-value door-${status.door}`}>
                                    {status.door === 'locked' ? '🔒 Locked' : '🔓 Open'}
                                </span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right Column - Alerts & History */}
                <section className="history-panel">
                    {/* Recent Alerts */}
                    <div className="panel alerts-panel">
                        <div className="panel-header">
                            <h2>🚨 Recent Alerts</h2>
                            <span className="alert-count">{alerts.length}</span>
                        </div>
                        <div className="alerts-list">
                            {alerts.length === 0 ? (
                                <div className="no-alerts">
                                    <span>✅</span>
                                    <p>No alerts</p>
                                </div>
                            ) : (
                                alerts.map(alert => (
                                    <div key={alert.id} className={`alert-item ${alert.type}`}>
                                        <span className="alert-type-icon">
                                            {alert.type === 'fire' ? '🔥' : '🚨'}
                                        </span>
                                        <div className="alert-details">
                                            <span className="alert-type-text">{alert.type}</span>
                                            <span className="alert-time">{alert.time}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Stats */}
                    {stats && (
                        <div className="panel stats-panel">
                            <div className="panel-header">
                                <h2>📈 24h Stats</h2>
                            </div>
                            <div className="stats-grid">
                                <div className="stat-item">
                                    <span className="stat-value">{stats.total_readings}</span>
                                    <span className="stat-label">Readings</span>
                                </div>
                                <div className="stat-item">
                                    <span className="stat-value">{stats.avg_temp}°</span>
                                    <span className="stat-label">Avg Temp</span>
                                </div>
                                <div className="stat-item danger">
                                    <span className="stat-value">{stats.total_alerts}</span>
                                    <span className="stat-label">Alerts</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* History Table */}
                    <div className="panel history-table-panel">
                        <div className="panel-header">
                            <h2>📜 History</h2>
                        </div>
                        <div className="history-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Temp</th>
                                        <th>Hum</th>
                                        <th>Occ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.slice(0, 8).map((row, i) => (
                                        <tr key={i}>
                                            <td>{new Date(row.timestamp).toLocaleTimeString()}</td>
                                            <td>{row.temp?.toFixed(1)}°</td>
                                            <td>{row.humidity?.toFixed(0)}%</td>
                                            <td>{row.occupant_count || 0}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}

export default App;
