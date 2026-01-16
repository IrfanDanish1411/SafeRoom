"""
MQTT to MongoDB Bridge + REST API
Room Safety Checker - Backend Service

This service:
1. Subscribes to MQTT topics from ESP32
2. Stores sensor data and alerts in MongoDB
3. Provides REST API for dashboard to query history
"""

import os
import json
import threading
from datetime import datetime, timedelta
from dotenv import load_dotenv
import paho.mqtt.client as mqtt
from pymongo import MongoClient
from flask import Flask, jsonify, request
from flask_cors import CORS

# Load environment variables
load_dotenv()

# ==================== CONFIGURATION ====================
MQTT_BROKER = os.getenv('MQTT_BROKER', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', 1883))
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017')
MONGO_DB = os.getenv('MONGO_DB', 'room_safety')
API_PORT = int(os.getenv('API_PORT', 5000))

# MQTT Topics
TOPIC_SENSORS = 'room/sensors'
TOPIC_STATUS = 'room/status'
TOPIC_ALERT = 'room/alert'

# ==================== MONGODB SETUP ====================
mongo_client = MongoClient(MONGO_URI)
db = mongo_client[MONGO_DB]

# Collections
sensor_readings = db['sensor_readings']
status_logs = db['status_logs']
alerts = db['alerts']

# Create indexes for efficient queries
sensor_readings.create_index('timestamp')
status_logs.create_index('timestamp')
alerts.create_index('timestamp')

print(f"[MongoDB] Connected to {MONGO_URI}/{MONGO_DB}")

# ==================== MQTT CALLBACKS ====================
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] Connected to broker")
        client.subscribe(TOPIC_SENSORS)
        client.subscribe(TOPIC_STATUS)
        client.subscribe(TOPIC_ALERT)
        print(f"[MQTT] Subscribed to topics")
    else:
        print(f"[MQTT] Connection failed with code {rc}")

def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload = json.loads(msg.payload.decode())
        timestamp = datetime.utcnow()
        
        # Add timestamp to payload
        payload['timestamp'] = timestamp
        
        if topic == TOPIC_SENSORS:
            sensor_readings.insert_one(payload)
            print(f"[DB] Sensor reading saved: temp={payload.get('temp')}°C")
            
        elif topic == TOPIC_STATUS:
            status_logs.insert_one(payload)
            print(f"[DB] Status saved: door={payload.get('door')}, occupants={payload.get('occupant_count')}")
            
        elif topic == TOPIC_ALERT:
            alerts.insert_one(payload)
            print(f"[DB] Alert saved: {payload.get('type')} - {payload.get('message')}")
            
    except Exception as e:
        print(f"[Error] Failed to process message: {e}")

# ==================== FLASK API ====================
app = Flask(__name__)

# Enable CORS for all origins (allow React dashboard from any host)
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'mqtt_broker': MQTT_BROKER,
        'mongo_db': MONGO_DB
    })

@app.route('/api/sensors', methods=['GET'])
def get_sensors():
    """Get sensor readings with optional time filter"""
    hours = request.args.get('hours', 24, type=int)
    limit = request.args.get('limit', 100, type=int)
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    readings = list(sensor_readings.find(
        {'timestamp': {'$gte': since}},
        {'_id': 0}
    ).sort('timestamp', -1).limit(limit))
    
    # Convert datetime to ISO string for JSON
    for r in readings:
        r['timestamp'] = r['timestamp'].isoformat()
    
    return jsonify(readings)

@app.route('/api/sensors/latest', methods=['GET'])
def get_latest_sensor():
    """Get the most recent sensor reading"""
    reading = sensor_readings.find_one(
        {},
        {'_id': 0},
        sort=[('timestamp', -1)]
    )
    
    if reading:
        reading['timestamp'] = reading['timestamp'].isoformat()
        return jsonify(reading)
    return jsonify({})

@app.route('/api/alerts', methods=['GET'])
def get_alerts():
    """Get alerts with optional time filter"""
    hours = request.args.get('hours', 24, type=int)
    limit = request.args.get('limit', 50, type=int)
    
    since = datetime.utcnow() - timedelta(hours=hours)
    
    alert_list = list(alerts.find(
        {'timestamp': {'$gte': since}},
        {'_id': 0}
    ).sort('timestamp', -1).limit(limit))
    
    for a in alert_list:
        a['timestamp'] = a['timestamp'].isoformat()
    
    return jsonify(alert_list)

@app.route('/api/status', methods=['GET'])
def get_status():
    """Get the most recent status"""
    status = status_logs.find_one(
        {},
        {'_id': 0},
        sort=[('timestamp', -1)]
    )
    
    if status:
        status['timestamp'] = status['timestamp'].isoformat()
        return jsonify(status)
    return jsonify({})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get summary statistics"""
    hours = request.args.get('hours', 24, type=int)
    since = datetime.utcnow() - timedelta(hours=hours)
    
    # Count readings and alerts
    total_readings = sensor_readings.count_documents({'timestamp': {'$gte': since}})
    total_alerts = alerts.count_documents({'timestamp': {'$gte': since}})
    burglar_alerts = alerts.count_documents({'timestamp': {'$gte': since}, 'type': 'burglar'})
    fire_alerts = alerts.count_documents({'timestamp': {'$gte': since}, 'type': 'fire'})
    
    # Get average temperature
    pipeline = [
        {'$match': {'timestamp': {'$gte': since}}},
        {'$group': {
            '_id': None,
            'avg_temp': {'$avg': '$temp'},
            'max_temp': {'$max': '$temp'},
            'avg_humidity': {'$avg': '$humidity'}
        }}
    ]
    
    agg_result = list(sensor_readings.aggregate(pipeline))
    
    stats = {
        'total_readings': total_readings,
        'total_alerts': total_alerts,
        'burglar_alerts': burglar_alerts,
        'fire_alerts': fire_alerts,
        'avg_temp': round(agg_result[0]['avg_temp'], 1) if agg_result else 0,
        'max_temp': round(agg_result[0]['max_temp'], 1) if agg_result else 0,
        'avg_humidity': round(agg_result[0]['avg_humidity'], 1) if agg_result else 0
    }
    
    return jsonify(stats)

# ==================== MAIN ====================
def run_mqtt():
    """Run MQTT client in background thread"""
    mqtt_client = mqtt.Client()
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message
    
    print(f"[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
    mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_forever()

if __name__ == '__main__':
    print("\n" + "="*50)
    print("  Room Safety Checker - Backend Service")
    print("="*50 + "\n")
    
    # Start MQTT client in background thread
    mqtt_thread = threading.Thread(target=run_mqtt, daemon=True)
    mqtt_thread.start()
    
    # Start Flask API
    print(f"[API] Starting on http://0.0.0.0:{API_PORT}")
    app.run(host='0.0.0.0', port=API_PORT, debug=False)
