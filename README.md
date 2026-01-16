# Room Safety Checker - IoT Project

A smart room safety monitoring system using ESP32 with multiple sensors for **burglar detection** and **fire safety**, with real-time monitoring via a modern React web dashboard.

## 🏗️ System Architecture

```
┌─────────────────┐     MQTT      ┌─────────────────┐     MQTT      ┌─────────────────┐
│     ESP32       │◄────────────►│   GCP VM        │◄────────────►│   React         │
│  Room Safety    │   (WiFi)     │  Mosquitto      │  (WebSocket) │   Dashboard     │
│  Controller     │              │  MQTT Broker    │              │                 │
└─────────────────┘              └─────────────────┘              └─────────────────┘
```

## ✨ New Features

- **🛡️ Secure Dashboard**: User authentication with PIN login (Default: `1234`).
- **🎨 Modern UI**: Redesigned with dark glassmorphism theme and security aesthetics.
- **🔊 Sound Alerts**: Auto-play siren sound when Burglar or Fire alert is triggered.
- **🔔 Browser Notifications**: Real-time push notifications for critical alerts.
- **⏳ Interactive Feedback**: Loading states for buttons to confirm actions.
- **📈 History Tracking**: MongoDB backend stores sensor data for 24h history graphs.

## 📦 Components

### Hardware
| Component | GPIO | Purpose |
|-----------|------|---------|
| DHT11 | 27 | Temperature & humidity sensor |
| IR Sensor | 14 | Entry detection (beam break) |
| PIR Sensor | 4 | Motion detection |
| Servo (SG90) | 15 | Door lock mechanism (0°=Lock, 90°=Unlock) |
| Red LED | 22 | Alert indicator |
| Green LED | 23 | Safe indicator |

### Software
- **ESP32 Firmware**: Arduino C++ with WiFi & MQTT
- **MQTT Broker**: Mosquitto on GCP VM
- **Dashboard**: ReactJS with mqtt.js, Chart.js, and HTML5 Audio
- **Backend**: Python + MongoDB for data storage

## 🔒 Safety Logic

1. **Burglar Detection**
   - PIR detects motion AND entry count = 0
   - → Door locks automatically (0°) + Red LED + Alert + Siren

2. **Fire Detection**
   - Temperature > 50°C
   - → Door unlocks for evacuation (90°) + Red LED + Alert + Siren

## 🚀 Quick Start

### 1. ESP32 Setup

1. Open `esp32/room_safety/room_safety.ino` in Arduino IDE
2. Install libraries: `DHT`, `ESP32Servo`, `PubSubClient`, `ArduinoJson`
3. Update WiFi credentials in the code
4. Update MQTT broker IP address
5. Upload to ESP32

### 2. GCP MQTT Broker

```bash
# On GCP VM
sudo apt update && sudo apt install mosquitto mosquitto-clients -y

# Enable WebSocket (for browser)
echo "listener 1883" | sudo tee /etc/mosquitto/conf.d/default.conf
echo "listener 9001" | sudo tee -a /etc/mosquitto/conf.d/default.conf
echo "protocol websockets" | sudo tee -a /etc/mosquitto/conf.d/default.conf
echo "allow_anonymous true" | sudo tee -a /etc/mosquitto/conf.d/default.conf

sudo systemctl restart mosquitto
```

**GCP Firewall**: Allow TCP ports `1883` and `9001`

### 3. Dashboard Setup

```bash
cd dashboard
npm install
npm run dev
```

- Update `MQTT_BROKER_URL` in `src/App.jsx` with your GCP VM IP.
- Default Login PIN: `1234`

### 4. MongoDB + Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# OR: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy and edit environment file
cp .env.example .env
# Edit .env: Update MQTT_BROKER with your GCP VM IP

# Run the service
python mqtt_to_mongo.py
```

**GCP Firewall**: Allow TCP port `5000` for REST API

## 📡 MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `room/sensors` | ESP32 → Dashboard | Sensor readings |
| `room/status` | ESP32 → Dashboard | Door/LED/mode status |
| `room/alert` | ESP32 → Dashboard | Security alerts |
| `room/command` | Dashboard → ESP32 | Control commands |

## 📊 REST API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/sensors?hours=24` | Sensor readings |
| `GET /api/alerts?hours=24` | Alert history |
| `GET /api/stats?hours=24` | Statistics |

## 📝 License

MIT License
