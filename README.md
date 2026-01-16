# Room Safety Checker - IoT Project

A smart room safety monitoring system using ESP32 with multiple sensors for **burglar detection** and **fire safety**, with real-time monitoring via a web dashboard.

## 🏗️ System Architecture

```
┌─────────────────┐     MQTT      ┌─────────────────┐     MQTT      ┌─────────────────┐
│     ESP32       │◄────────────►│   GCP VM        │◄────────────►│   React         │
│  Room Safety    │   (WiFi)     │  Mosquitto      │  (WebSocket) │   Dashboard     │
│  Controller     │              │  MQTT Broker    │              │                 │
└─────────────────┘              └─────────────────┘              └─────────────────┘
```

## 📦 Components

### Hardware
| Component | GPIO | Purpose |
|-----------|------|---------|
| DHT11 | 18 | Temperature & humidity sensor |
| IR Sensor | 17 | Entry detection (beam break) |
| PIR Sensor | 4 | Motion detection |
| Servo Motor | 15 | Door lock mechanism |
| Red LED | 22 | Alert indicator |
| Green LED | 23 | Safe indicator |

### Software
- **ESP32 Firmware**: Arduino C++ with WiFi & MQTT
- **MQTT Broker**: Mosquitto on GCP VM
- **Dashboard**: ReactJS with mqtt.js

## 🔒 Safety Logic

1. **Burglar Detection**
   - PIR detects motion AND entry count = 0
   - → Door locks automatically + Red LED + Alert

2. **Fire Detection**
   - Temperature > 50°C
   - → Door unlocks for evacuation + Red LED + Alert

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

### 3. Dashboard

```bash
cd dashboard
npm install
npm run dev
```

Update `MQTT_BROKER_URL` in `src/App.jsx` with your GCP VM IP.

## 📡 MQTT Topics

| Topic | Direction | Description |
|-------|-----------|-------------|
| `room/sensors` | ESP32 → Dashboard | Sensor readings |
| `room/status` | ESP32 → Dashboard | Door/LED/mode status |
| `room/alert` | ESP32 → Dashboard | Security alerts |
| `room/command` | Dashboard → ESP32 | Control commands |

---

## 🗄️ MongoDB + Backend Setup

### 4. Install MongoDB (on GCP VM)

```bash
# Import MongoDB public key
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

# Add MongoDB repo
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] http://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Install MongoDB
sudo apt update && sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl enable mongod
sudo systemctl start mongod
```

### 5. Run Backend Service

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
nano .env  # Update MQTT_BROKER with your GCP VM IP

# Run the service
python mqtt_to_mongo.py
```

**GCP Firewall**: Allow TCP port `5000` for REST API

### 6. Dashboard Configuration

Update `src/hooks/useHistory.js`:
```javascript
const API_BASE = 'http://YOUR_GCP_VM_IP:5000/api';
```

## 📊 REST API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/sensors?hours=24` | Sensor readings |
| `GET /api/alerts?hours=24` | Alert history |
| `GET /api/stats?hours=24` | Statistics |
| `GET /api/status` | Latest status |

## 📝 License

MIT License
