/******************************************************
 * ROOM SAFETY CHECKER - ESP32 Firmware
 * 
 * Features:
 * - IR sensor: Entry detection (beam break = person entered)
 * - PIR sensor: Motion detection
 * - DHT11: Temperature & humidity monitoring
 * - Servo: Door lock control
 * - LEDs: Status indicators (Red=Alert, Green=Safe)
 * - MQTT: Real-time communication with dashboard
 * 
 * Safety Logic:
 * - Burglar: PIR detects motion + no one entered via IR
 * - Fire: Temperature > threshold → auto unlock door
 ******************************************************/

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ==================== PIN DEFINITIONS ====================
#define DHT_PIN         27
#define IR_PIN          14
#define SERVO_PIN       15
#define PIR_PIN         4
#define RED_LED_PIN     22
#define GREEN_LED_PIN   23

// ==================== SENSOR SETTINGS ====================
#define DHT_TYPE        DHT11
#define FIRE_TEMP_THRESHOLD  50.0   // Celsius - trigger fire alert above this

// Standard SG90 Servo Settings (positional - NOT continuous)
// Moves to angle and STAYS there
#define SERVO_LOCKED    0     // Locked position (0 degrees)
#define SERVO_UNLOCKED  90    // Unlocked position (90 degrees)
#define SERVO_MOVE_TIME 500   // Time to wait for movement (ms)

// ==================== WIFI CONFIGURATION ====================
const char* WIFI_SSID = "cslab";
const char* WIFI_PASSWORD = "aksesg31";

// ==================== MQTT CONFIGURATION (TLS) ====================
const char* MQTT_SERVER = "35.193.224.18";
const int MQTT_PORT = 8883;  // TLS port
const char* MQTT_CLIENT_ID = "esp32_room_safety";
const char* MQTT_USERNAME = "esp32";
const char* MQTT_PASSWORD = "esp32_secret";

// CA Certificate for TLS
const char* CA_CERT = R"EOF(
-----BEGIN CERTIFICATE-----
MIIDDzCCAfegAwIBAgIUcSEhi8YdkT6TmWn/x5F4vDx+nIMwDQYJKoZIhvcNAQEL
BQAwFzEVMBMGA1UEAwwMUm9vbUd1YXJkIENBMB4XDTI2MDExNjIyMDUyNVoXDTI3
MDExNjIyMDUyNVowFzEVMBMGA1UEAwwMUm9vbUd1YXJkIENBMIIBIjANBgkqhkiG
9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw99L29Ws3Wa1q8VsY0iVUlAUHUEdLOw/yWqU
SVlxEN4rl8FALZFy+fQout99gmDYIZ8MSb3FXKlG5rwhm+Hp5t7XOWdC7bFY8l0p
idTAooMGjYBESdHOnGNUXKahmd83pFk7uL2f/KANRbVamLdF5cVOTyWPsGbhLLqQ
Uuf+CjaLaaKKX2K243GJv011bS0E8lHwSLrAPTNRYLSsJ5ZOwFKDcYg7aAGxbcRy
L+I06VDT6+eUbll8C6ZCbGzzD3lFaHdmgIjQd2M+ZOhCTdXYu70tOFQ3MXylQzGh
nCVSokMM7pSTf0bSf2fG13fSx/tLW4a/1SQGo4EieqNTZ2FcwQIDAQABo1MwUTAd
BgNVHQ4EFgQURP5nKDRfk2eDWobo+A+9wlEZ9howHwYDVR0jBBgwFoAURP5nKDRf
k2eDWobo+A+9wlEZ9howDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOC
AQEAOCX7cyWcP7eACcXVuTBb3DDAu+7m6EWom4jiyfD17iZCraBYryxRFkDOl0EP
ULyk9yfEVr5J0x9lbNocpmNJCFRMgo3dT+ismTvA7CDK5b3gFIp/E78y45RZ0vpq
Y49nVO1oyHYDmVhFDGtCI30ox58pWZJ92KjKUWS7nNtmTzP9AtMHOCXJUiejdvHL
BqzADxO8F5CacIAIK3waqFASgx0Pp3Tf4egHTR7QNeXu1ChWfqX0ob8iuP/ktBMA
d2VJIqNM8VgOeUy4iuNdru8Br7h4M80Ok2EwPDxqGjF1tOYNG6fWIVaBvJJq46J5
UyC3s8ukR5qvSyqzb8pnHOO2iA==
-----END CERTIFICATE-----
)EOF";

// MQTT Topics
const char* TOPIC_SENSORS = "room/sensors";
const char* TOPIC_STATUS = "room/status";
const char* TOPIC_ALERT = "room/alert";
const char* TOPIC_COMMAND = "room/command";

// ==================== OBJECTS ====================
WiFiClientSecure wifiClient;
PubSubClient mqttClient(wifiClient);
DHT dht(DHT_PIN, DHT_TYPE);
Servo doorServo;

// ==================== STATE VARIABLES ====================
int occupantCount = 0;        // Number of people in the room
bool doorLocked = false;      // Current door lock state
bool irLastState = HIGH;      // Previous IR sensor state (HIGH = no obstacle)
bool burglarDetected = false; // Burglar alert active
bool fireDetected = false;    // Fire alert active

unsigned long lastSensorRead = 0;
unsigned long lastMqttPublish = 0;
const unsigned long SENSOR_INTERVAL = 2000;    // Read sensors every 2 seconds
const unsigned long MQTT_INTERVAL = 5000;      // Publish to MQTT every 5 seconds
int consecutiveMotionCount = 0;                // Filter for PIR sensitivity

// ==================== FUNCTION DECLARATIONS ====================
void setupWiFi();
void setupMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void reconnectMQTT();
void readSensors();
void checkSafetyLogic(float temperature);
void lockDoor();
void unlockDoor();
void setLEDs(bool alert);
void publishSensorData(float temp, float humidity, bool irState, bool pirState);
void publishStatus();
void publishAlert(const char* type, const char* message);

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\n========================================");
  Serial.println("   ROOM SAFETY CHECKER - Starting...");
  Serial.println("========================================\n");

  // Initialize pins
  pinMode(IR_PIN, INPUT);
  pinMode(PIR_PIN, INPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(GREEN_LED_PIN, OUTPUT);

  // Initialize DHT sensor
  dht.begin();
  delay(2000);  // DHT11 needs 2 seconds to warm up!
  Serial.println("[OK] DHT11 sensor initialized (warm-up complete)");

  // Initialize Servo at unlocked position
  doorServo.attach(SERVO_PIN);
  doorServo.write(SERVO_UNLOCKED);  // Start unlocked (90°)
  delay(500);
  doorServo.detach();  // Detach to prevent jitter
  doorLocked = false;
  Serial.println("[OK] Servo initialized at UNLOCKED position (90°)");

  // Set initial LED state (green = safe)
  setLEDs(false);
  Serial.println("[OK] LEDs initialized");

  // Connect to WiFi
  setupWiFi();

  // Setup MQTT
  setupMQTT();

  Serial.println("\n[READY] Room Safety Checker is running!\n");
}

// ==================== MAIN LOOP ====================
void loop() {
  // Ensure MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Read sensors at interval
  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = now;
    readSensors();
  }
}

// ==================== WIFI SETUP ====================
void setupWiFi() {
  Serial.print("[WiFi] Connecting to ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected!");
    Serial.print("[WiFi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[WiFi] Connection failed! Continuing in offline mode...");
  }
}

// ==================== MQTT SETUP ====================
void setupMQTT() {
  // Configure TLS with CA certificate
  wifiClient.setCACert(CA_CERT);
  // Skip hostname verification (cert is for IP, not domain)
  wifiClient.setInsecure();
  
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  Serial.println("[MQTT] TLS configured with CA certificate");
}

void reconnectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Attempting connection...");
    
    // Connect with username and password
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USERNAME, MQTT_PASSWORD)) {
      Serial.println(" connected!");
      
      // Subscribe to command topic
      mqttClient.subscribe(TOPIC_COMMAND);
      Serial.println("[MQTT] Subscribed to: " + String(TOPIC_COMMAND));
      
      // Publish initial status
      publishStatus();
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" - retrying in 5 seconds");
      delay(5000);
    }
  }
}

// ==================== MQTT CALLBACK ====================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Parse incoming JSON command
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  
  if (error) {
    Serial.println("[MQTT] Failed to parse command");
    return;
  }

  const char* action = doc["action"];
  
  Serial.print("[MQTT] Command received: ");
  Serial.println(action);

  if (strcmp(action, "lock") == 0) {
    lockDoor();
    publishStatus();
  } else if (strcmp(action, "unlock") == 0) {
    // Only allow manual unlock if no fire (safety first!)
    if (!fireDetected) {
      unlockDoor();
      burglarDetected = false;  // Reset burglar alert on manual unlock
      setLEDs(false);
      publishStatus();
    }
  } else if (strcmp(action, "reset") == 0) {
    // Reset everything to default state
    occupantCount = 0;
    burglarDetected = false;
    fireDetected = false;
    
    // Move servo to unlocked position
    doorServo.attach(SERVO_PIN);
    doorServo.write(SERVO_UNLOCKED);  // Move to 90°
    delay(SERVO_MOVE_TIME);
    doorServo.detach();  // Detach to prevent jitter
    doorLocked = false;
    
    // Reset LED to green
    digitalWrite(RED_LED_PIN, LOW);
    digitalWrite(GREEN_LED_PIN, HIGH);
    
    publishStatus();
    Serial.println("[RESET] System reset - Door unlocked (90°), LED:Green, Alerts:Cleared");
  } else if (strcmp(action, "checkout") == 0) {
    // One person left the room
    if (occupantCount > 0) {
      occupantCount--;
      Serial.printf("[CHECKOUT] Person left. Occupants: %d\n", occupantCount);
    }
    publishStatus();
  }
}

// ==================== SENSOR READING ====================
void readSensors() {
  // Read DHT11
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  // Check for DHT read errors
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("[DHT] Read error!");
    temperature = 0;
    humidity = 0;
  }

  // Read IR sensor (LOW = beam broken = person passing)
  bool irState = digitalRead(IR_PIN);
  
  // Detect IR beam break (falling edge) = someone entered
  if (irLastState == HIGH && irState == LOW) {
    occupantCount++;
    Serial.printf("[IR] Person entered! Occupants: %d\n", occupantCount);
  }
  irLastState = irState;

  // Read PIR sensor (HIGH = motion detected)
  bool pirState = digitalRead(PIR_PIN);

  // Debug output
  Serial.printf("[Sensors] Temp: %.1f°C | Humidity: %.1f%% | IR: %d | PIR: %d | Occupants: %d\n",
                temperature, humidity, irState, pirState, occupantCount);

  // Check safety logic
  checkSafetyLogic(temperature);

  // Publish data via MQTT
  if (millis() - lastMqttPublish >= MQTT_INTERVAL) {
    lastMqttPublish = millis();
    publishSensorData(temperature, humidity, irState, pirState);
  }
}

// ==================== SAFETY LOGIC ====================
void checkSafetyLogic(float temperature) {
  bool pirState = digitalRead(PIR_PIN);
  
  // FIRE DETECTION - Highest priority
  if (temperature >= FIRE_TEMP_THRESHOLD && !fireDetected) {
    fireDetected = true;
    Serial.println("\n🔥🔥🔥 FIRE DETECTED! 🔥🔥🔥\n");
    
    unlockDoor();  // ALWAYS unlock for fire escape
    setLEDs(true); // Red LED on
    publishAlert("fire", "High temperature detected! Door unlocked for evacuation.");
    publishStatus();
  } 
  // Reset fire alert when temperature drops
  else if (temperature < (FIRE_TEMP_THRESHOLD - 5) && fireDetected) {
    fireDetected = false;
    Serial.println("[Fire] Temperature normalized");
  }

  // BURGLAR DETECTION - Only if no fire
  if (!fireDetected) {
    // Check if motion detected in empty room
    if (pirState == HIGH && occupantCount == 0 && !burglarDetected) {
      consecutiveMotionCount++;
      Serial.printf("[PIR] Motion detected! Check %d/2\n", consecutiveMotionCount);
      
      // REQUIRE 2 consecutive reads (approx 4 seconds) to confirm burglar
      if (consecutiveMotionCount >= 2) {
        burglarDetected = true;
        Serial.println("\n🚨🚨🚨 BURGLAR DETECTED! 🚨🚨🚨");
        Serial.println("Motion CONFIRMED in unoccupied room!\n");
        
        lockDoor();   // Lock the intruder in
        setLEDs(true); // Red LED on
        publishAlert("burglar", "Motion confirmed with no authorized entry! Door locked.");
        publishStatus();
      }
    } else {
      // Reset counter if motion stops
      consecutiveMotionCount = 0;
    }
  }

  // Normal state - green LED if no alerts
  if (!burglarDetected && !fireDetected) {
    setLEDs(false);
  }
}

// ==================== DOOR CONTROL ====================
void lockDoor() {
  doorServo.attach(SERVO_PIN);
  doorServo.write(SERVO_LOCKED);   // Move to 0°
  delay(SERVO_MOVE_TIME);
  doorServo.detach();              // Detach to prevent jitter
  doorLocked = true;
  Serial.println("[Door] LOCKED 🔒 (0°)");
}

void unlockDoor() {
  doorServo.attach(SERVO_PIN);
  doorServo.write(SERVO_UNLOCKED); // Move to 90°
  delay(SERVO_MOVE_TIME);
  doorServo.detach();              // Detach to prevent jitter
  doorLocked = false;
  Serial.println("[Door] UNLOCKED 🔓 (90°)");
}

// ==================== LED CONTROL ====================
void setLEDs(bool alert) {
  if (alert) {
    digitalWrite(RED_LED_PIN, HIGH);
    digitalWrite(GREEN_LED_PIN, LOW);
  } else {
    digitalWrite(RED_LED_PIN, LOW);
    digitalWrite(GREEN_LED_PIN, HIGH);
  }
}

// ==================== MQTT PUBLISHING ====================
void publishSensorData(float temp, float humidity, bool irState, bool pirState) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<200> doc;
  doc["temp"] = temp;
  doc["humidity"] = humidity;
  doc["ir"] = irState ? 0 : 1;  // Invert: 1 = beam broken
  doc["pir"] = pirState ? 1 : 0;
  doc["occupant_count"] = occupantCount;

  char buffer[200];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_SENSORS, buffer);
  
  Serial.println("[MQTT] Sensor data published");
}

void publishStatus() {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<200> doc;
  doc["door"] = doorLocked ? "locked" : "unlocked";
  doc["led"] = (burglarDetected || fireDetected) ? "red" : "green";
  doc["mode"] = fireDetected ? "fire" : (burglarDetected ? "burglar" : "normal");
  doc["occupant_count"] = occupantCount;

  char buffer[200];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_STATUS, buffer);
  
  Serial.println("[MQTT] Status published");
}

void publishAlert(const char* type, const char* message) {
  if (!mqttClient.connected()) return;

  StaticJsonDocument<300> doc;
  doc["type"] = type;
  doc["message"] = message;
  doc["timestamp"] = millis();

  char buffer[300];
  serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_ALERT, buffer);
  
  Serial.printf("[MQTT] Alert published: %s\n", type);
}
