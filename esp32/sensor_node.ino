/*
 * ESP32 Smart Agriculture Sensor Node
 *
 * Sensors integrated:
 *   1. GEMHO RS485 Modbus 7-in-1 Soil Sensor (UART2: RX=16, TX=17, DE/RE=4)
 *      - Soil Moisture (%)
 *      - Soil Temperature (°C)
 *      - Soil EC (us/cm) & pH
 *      - Nitrogen (mg/kg)
 *      - Phosphorus (mg/kg)
 *      - Potassium (mg/kg)
 *   2. [Optional] MQ-135 Analog CO2 Sensor (GPIO 34 / ADC1)
 *
 * Transmits readings to FastAPI backend every SEND_INTERVAL_MS via HTTP POST.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HARDWARE WIRING (MAX485 / TTL-to-RS485 Module to ESP32):
 *   - VCC        → 5V (VIN)
 *   - GND        → ESP32 GND
 *   - RO (RX)    → ESP32 GPIO 16 (RX2)
 *   - DI (TX)    → ESP32 GPIO 17 (TX2)
 *   - DE & RE    → ESP32 GPIO 4 (jumpered together)
 *   - A & B      → RS485 Sensor A & B lines (Yellow/Green or as labeled)
 *   - Sensor VCC → 5V - 12V DC power supply (check sensor label, brown wire
 * usually 12V/5V)
 *   - Sensor GND → Common Ground
 *
 * LIBRARIES REQUIRED (Install via Arduino IDE → Library Manager):
 *   - ModbusMaster (by Doc Walker)
 *   - ArduinoJson  (by Benoit Blanchon)
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// ─────────────────────────────────────────────
// PIN CONFIGURATION
// ─────────────────────────────────────────────

#define SOIL_SENSOR_PIN 27
#define CO2_ANALOG_PIN 34

// DHT11
#define DHT_PIN 26
#define DHT_TYPE DHT11

DHT dht(DHT_PIN, DHT_TYPE);

// ─────────────────────────────────────────────
// WIFI CONFIGURATION
// ─────────────────────────────────────────────

const char *WIFI_SSID = "AYUSHH";
const char *WIFI_PASSWORD = "12345678";

const char *SERVER_IP = "10.35.61.212";

const int SERVER_PORT = 8000;
const char *SENSOR_DATA_ENDPOINT = "/sensor-data";

// ─────────────────────────────────────────────
// READING INTERVAL
// ─────────────────────────────────────────────

// Take a new reading every 10 seconds
const unsigned long SEND_INTERVAL_MS = 10000;

// ─────────────────────────────────────────────
// WIFI
// ─────────────────────────────────────────────

const int WIFI_MAX_ATTEMPTS = 20;

// ─────────────────────────────────────────────
// MQ-135 CALIBRATION
// ─────────────────────────────────────────────

const float RL_VALUE = 10.0;
const float R0_CLEAN_AIR = 10.0;

const float CO2_CURVE_A = 116.602;
const float CO2_CURVE_B = -2.769;

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

unsigned long lastSendTime = 0;

// ─────────────────────────────────────────────
// WIFI CONNECTION
// ─────────────────────────────────────────────

bool connectWiFi() {

  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < WIFI_MAX_ATTEMPTS) {

    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println();
    Serial.println("WiFi connected!");

    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    return true;
  }

  Serial.println();
  Serial.println("WiFi connection failed.");

  return false;
}

// ─────────────────────────────────────────────
// ENSURE WIFI
// ─────────────────────────────────────────────

void ensureWiFi() {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi disconnected.");
    Serial.println("Trying to reconnect...");

    WiFi.disconnect();
    delay(1000);

    connectWiFi();
  }
}

// ─────────────────────────────────────────────
// SOIL MOISTURE
// ─────────────────────────────────────────────

String readSoilStatus() {

  int state = digitalRead(SOIL_SENSOR_PIN);

  if (state == LOW) {
    return "WET";
  } else {
    return "DRY";
  }
}

// ─────────────────────────────────────────────
// MQ-135 CO2 READING
// ─────────────────────────────────────────────

float readCO2_MQ135() {

  long adcSum = 0;

  const int SAMPLES = 10;

  for (int i = 0; i < SAMPLES; i++) {

    adcSum += analogRead(CO2_ANALOG_PIN);

    delay(100);
  }

  float adcAverage = (float)adcSum / SAMPLES;

  // Convert ADC to voltage
  float voltage = (adcAverage / 4095.0) * 3.3;

  // Prevent division by zero
  if (voltage <= 0.05) {
    return 400.0;
  }

  // Calculate sensor resistance
  float rs = ((3.3 - voltage) / voltage) * RL_VALUE;

  if (rs < 0.1) {
    rs = 0.1;
  }

  // Calculate Rs/R0
  float ratio = rs / R0_CLEAN_AIR;

  // Calculate CO2
  float ppm = CO2_CURVE_A * pow(ratio, CO2_CURVE_B);

  // Limit value
  if (ppm < 350.0) {
    ppm = 350.0;
  }

  if (ppm > 5000.0) {
    ppm = 5000.0;
  }

  return round(ppm * 10.0) / 10.0;
}

// ─────────────────────────────────────────────
// DHT11 READING
// ─────────────────────────────────────────────

float readTemperature() {

  float temperature = dht.readTemperature();

  if (isnan(temperature)) {

    Serial.println("ERROR: Failed to read temperature from DHT11");

    return -999.0;
  }

  return temperature;
}

float readHumidity() {

  float humidity = dht.readHumidity();

  if (isnan(humidity)) {

    Serial.println("ERROR: Failed to read humidity from DHT11");

    return -999.0;
  }

  return humidity;
}

// ─────────────────────────────────────────────
// SEND DATA TO FASTAPI
// ─────────────────────────────────────────────

void sendSensorData(const String &soilStatus, float co2Value, float temperature,
                    float humidity) {

  if (WiFi.status() != WL_CONNECTED) {

    Serial.println("WiFi not connected.");
    return;
  }

  String url =
      String("http://") + SERVER_IP + ":" + SERVER_PORT + SENSOR_DATA_ENDPOINT;

  // ───────────────────────────────────────
  // CREATE JSON
  // ───────────────────────────────────────

  StaticJsonDocument<512> doc;

  doc["soil_status"] = soilStatus;
  doc["co2"] = co2Value;

  // Only include temperature/humidity if DHT11 read succeeded (-999 = error)
  if (temperature != -999.0) {
    doc["temperature"] = temperature;
  } else {
    doc["temperature"] = nullptr;  // sends JSON null
  }

  if (humidity != -999.0) {
    doc["humidity"] = humidity;
  } else {
    doc["humidity"] = nullptr;  // sends JSON null
  }

  String payload;

  serializeJson(doc, payload);

  Serial.print("JSON: ");
  Serial.println(payload);

  // ───────────────────────────────────────
  // SEND HTTP POST
  // ───────────────────────────────────────

  HTTPClient http;

  http.begin(url);

  http.addHeader("Content-Type", "application/json");

  int responseCode = http.POST(payload);

  if (responseCode > 0) {

    Serial.print("FastAPI Response: ");
    Serial.println(responseCode);

    if (responseCode != 200 && responseCode != 201) {

      Serial.print("Server response: ");
      Serial.println(http.getString());
    }

  } else {

    Serial.print("Server connection failed: ");

    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("====================================");
  Serial.println(" ESP32 SMART AGRICULTURE NODE");
  Serial.println("====================================");

  // ───────────────────────────────────────
  // SOIL SENSOR
  // ───────────────────────────────────────

  pinMode(SOIL_SENSOR_PIN, INPUT);

  // ───────────────────────────────────────
  // ADC CONFIGURATION
  // ───────────────────────────────────────

  analogReadResolution(12);

  analogSetAttenuation(ADC_11db);

  // ───────────────────────────────────────
  // DHT11
  // ───────────────────────────────────────

  dht.begin();

  Serial.println("DHT11 initialized.");

  // ───────────────────────────────────────
  // WIFI
  // ───────────────────────────────────────

  connectWiFi();

  Serial.println();
  Serial.println("System ready.");
  Serial.println("Reading sensors every 10 seconds.");
  Serial.println();
}

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────

void loop() {

  ensureWiFi();

  unsigned long now = millis();

  // Wait 10 seconds between readings
  if (now - lastSendTime >= SEND_INTERVAL_MS) {

    lastSendTime = now;

    // ─────────────────────────────────────
    // READ SOIL
    // ─────────────────────────────────────

    String soilStatus = readSoilStatus();

    // ─────────────────────────────────────
    // READ CO2
    // ─────────────────────────────────────

    float co2Ppm = readCO2_MQ135();

    // ─────────────────────────────────────
    // READ DHT11
    // ─────────────────────────────────────

    float temperature = readTemperature();

    float humidity = readHumidity();

    // ─────────────────────────────────────
    // DISPLAY
    // ─────────────────────────────────────

    Serial.println();
    Serial.println("========== SENSOR READING ==========");

    Serial.print("Soil Moisture: ");
    Serial.println(soilStatus);

    Serial.print("CO2: ");
    Serial.print(co2Ppm, 1);
    Serial.println(" ppm");

    if (temperature != -999.0) {

      Serial.print("Temperature: ");
      Serial.print(temperature, 1);
      Serial.println(" °C");
    }

    if (humidity != -999.0) {

      Serial.print("Humidity: ");
      Serial.print(humidity, 1);
      Serial.println(" %");
    }

    Serial.println("====================================");

    // ─────────────────────────────────────
    // SEND TO FASTAPI
    // ─────────────────────────────────────

    sendSensorData(soilStatus, co2Ppm, temperature, humidity);

    Serial.println();
    Serial.println("Waiting 10 seconds...");
  }
}