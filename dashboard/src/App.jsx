import { useState, useEffect, useCallback } from 'react';
import mqtt from 'mqtt';
import HistoryPanel from './components/HistoryPanel';

// ==================== MQTT CONFIGURATION ====================
// TODO: Update with your GCP VM's external IP address
const MQTT_BROKER_URL = 'ws://YOUR_GCP_VM_IP:9001/mqtt';

// MQTT Topics
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
    const [sensorData, setSensorData] = useState({
        temp: 0,
        humidity: 0,
        ir: 0,
        pir: 0,
        occupant_count: 0,
    });

    // Status data
    const [status, setStatus] = useState({
        door: 'unlocked',
        led: 'green',
        mode: 'normal',
        occupant_count: 0,
    });

    // Alerts
    const [alerts, setAlerts] = useState([]);

    // ==================== MQTT CONNECTION ====================
    useEffect(() => {
        const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
            clientId: `dashboard_${Math.random().toString(16).slice(2, 8)}`,
            reconnectPeriod: 5000,
        });

        mqttClient.on('connect', () => {
            console.log('✅ Connected to MQTT broker');
            setConnected(true);

            // Subscribe to topics
            Object.values(TOPICS).forEach((topic) => {
                if (topic !== TOPICS.COMMAND) {
                    mqttClient.subscribe(topic, (err) => {
                        if (!err) console.log(`📡 Subscribed to ${topic}`);
                    });
                }
            });
        });

        mqttClient.on('disconnect', () => {
            console.log('❌ Disconnected from MQTT broker');
            setConnected(false);
        });

        mqttClient.on('error', (err) => {
            console.error('MQTT Error:', err);
            setConnected(false);
        });

        mqttClient.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());
                console.log(`📨 ${topic}:`, data);

                switch (topic) {
                    case TOPICS.SENSORS:
                        setSensorData(data);
                        break;
                    case TOPICS.STATUS:
                        setStatus(data);
                        break;
                    case TOPICS.ALERT:
                        setAlerts((prev) => [
                            {
                                ...data,
                                id: Date.now(),
                                receivedAt: new Date().toLocaleTimeString(),
                            },
                            ...prev.slice(0, 9), // Keep last 10 alerts
                        ]);
                        break;
                }
            } catch (err) {
                console.error('Failed to parse message:', err);
            }
        });

        setClient(mqttClient);

        return () => {
            mqttClient.end();
        };
    }, []);

    // ==================== SEND COMMANDS ====================
    const sendCommand = useCallback(
        (action) => {
            if (client && connected) {
                const command = JSON.stringify({ action });
                client.publish(TOPICS.COMMAND, command);
                console.log(`📤 Sent command: ${action}`);
            }
        },
        [client, connected]
    );

    // ==================== RENDER ====================
    return (
        <div className="app">
            {/* Header */}
            <header className="header">
                <h1>🏠 Room Safety Dashboard</h1>
                <p className="subtitle">Real-time monitoring and control</p>
                <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
                    <span className="status-dot"></span>
                    {connected ? 'Connected to ESP32' : 'Disconnected'}
                </div>
            </header>

            {/* Dashboard Grid */}
            <div className="dashboard">
                {/* Temperature Card */}
                <div className="card temp-card">
                    <div className="card-header">
                        <div className="card-icon">🌡️</div>
                        <span className="card-title">Temperature</span>
                    </div>
                    <div className="sensor-value">
                        {sensorData.temp.toFixed(1)}
                        <span className="sensor-unit">°C</span>
                    </div>
                    <div className="sensor-label">
                        {sensorData.temp >= 50 ? '🔥 FIRE WARNING!' : 'Normal range'}
                    </div>
                </div>

                {/* Humidity Card */}
                <div className="card humidity-card">
                    <div className="card-header">
                        <div className="card-icon">💧</div>
                        <span className="card-title">Humidity</span>
                    </div>
                    <div className="sensor-value">
                        {sensorData.humidity.toFixed(1)}
                        <span className="sensor-unit">%</span>
                    </div>
                    <div className="sensor-label">Relative humidity</div>
                </div>

                {/* Room Status Card */}
                <div className="card entry-card">
                    <div className="card-header">
                        <div className="card-icon">🏠</div>
                        <span className="card-title">Room Occupancy</span>
                    </div>
                    <div className="sensor-value">
                        {status.occupant_count || sensorData.occupant_count || 0}
                    </div>
                    <div className="sensor-label">
                        {(status.occupant_count || sensorData.occupant_count) > 0
                            ? `👥 ${status.occupant_count || sensorData.occupant_count} person(s) in room`
                            : '🚫 Room is empty'}
                    </div>
                    <button
                        className="btn btn-checkout"
                        onClick={() => sendCommand('checkout')}
                        disabled={!connected || (status.occupant_count || sensorData.occupant_count || 0) === 0}
                        style={{ marginTop: '16px', width: '100%' }}
                    >
                        🚪 Checkout (-1 Person)
                    </button>
                </div>

                {/* Motion Detection Card */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #10b981, #34d399)' }}>
                            📡
                        </div>
                        <span className="card-title">Motion Detection</span>
                    </div>
                    <div className="motion-grid">
                        <div className={`motion-item ${sensorData.ir ? 'active' : 'inactive'}`}>
                            <div className="motion-icon">🚪</div>
                            <div className="motion-label">IR Sensor</div>
                            <div className={`motion-status ${sensorData.ir ? 'active' : 'inactive'}`}>
                                {sensorData.ir ? 'TRIGGERED' : 'Clear'}
                            </div>
                        </div>
                        <div className={`motion-item ${sensorData.pir ? 'active' : 'inactive'}`}>
                            <div className="motion-icon">🏃</div>
                            <div className="motion-label">PIR Sensor</div>
                            <div className={`motion-status ${sensorData.pir ? 'active' : 'inactive'}`}>
                                {sensorData.pir ? 'MOTION' : 'No motion'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* System Status Card */}
                <div className="card status-card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
                            📊
                        </div>
                        <span className="card-title">System Status</span>
                    </div>
                    <div className="status-grid">
                        <div className="status-item">
                            <div className="status-item-label">Mode</div>
                            <div
                                className={`status-item-value ${status.mode === 'normal' ? 'safe' : 'danger'
                                    }`}
                            >
                                {status.mode.toUpperCase()}
                            </div>
                        </div>
                        <div className="status-item">
                            <div className="status-item-label">LED Status</div>
                            <div
                                className={`status-item-value ${status.led === 'green' ? 'safe' : 'danger'
                                    }`}
                            >
                                {status.led === 'green' ? '🟢 GREEN' : '🔴 RED'}
                            </div>
                        </div>
                        <div className="status-item">
                            <div className="status-item-label">Door</div>
                            <div
                                className={`status-item-value ${status.door === 'unlocked' ? 'safe' : 'danger'
                                    }`}
                            >
                                {status.door === 'unlocked' ? '🔓 UNLOCKED' : '🔒 LOCKED'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Door Control Card */}
                <div className="card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #f59e0b, #fbbf24)' }}>
                            🚪
                        </div>
                        <span className="card-title">Door Control</span>
                    </div>
                    <div className="door-control">
                        <div className="door-status">
                            {status.door === 'locked' ? '🔒' : '🔓'}
                        </div>
                        <div className={`door-label ${status.door}`}>
                            {status.door.toUpperCase()}
                        </div>
                        <div className="door-buttons">
                            <button
                                className="btn btn-lock"
                                onClick={() => sendCommand('lock')}
                                disabled={!connected || status.door === 'locked'}
                            >
                                🔒 Lock
                            </button>
                            <button
                                className="btn btn-unlock"
                                onClick={() => sendCommand('unlock')}
                                disabled={!connected || status.door === 'unlocked'}
                            >
                                🔓 Unlock
                            </button>
                            <button
                                className="btn btn-reset"
                                onClick={() => sendCommand('reset')}
                                disabled={!connected}
                            >
                                🔄 Reset
                            </button>
                        </div>
                    </div>
                </div>

                {/* Alerts Card */}
                <div className="card alert-card">
                    <div className="card-header">
                        <div className="card-icon" style={{ background: 'linear-gradient(135deg, #ef4444, #f87171)' }}>
                            ⚠️
                        </div>
                        <span className="card-title">Security Alerts</span>
                    </div>
                    <div className="alert-list">
                        {alerts.length === 0 ? (
                            <div className="no-alerts">
                                <div className="no-alerts-icon">✅</div>
                                <p>No alerts - System is secure</p>
                            </div>
                        ) : (
                            alerts.map((alert) => (
                                <div key={alert.id} className={`alert-item ${alert.type}`}>
                                    <div className="alert-icon">
                                        {alert.type === 'fire' ? '🔥' : '🚨'}
                                    </div>
                                    <div className="alert-content">
                                        <div className="alert-type">{alert.type} Alert</div>
                                        <div className="alert-message">{alert.message}</div>
                                        <div className="alert-time">{alert.receivedAt}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* History Panel */}
            <HistoryPanel />
        </div>
    );
}

export default App;
