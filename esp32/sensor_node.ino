/*
 * sensor_node.ino – ESP32 Smart Agriculture Sensor Node
 *
 * Reads:
 *   1. Digital Soil-Moisture Sensor on GPIO 27 (HIGH = DRY, LOW = WET)
 *   2. CO2 Gas Sensor (Default: MQ-135 Analog on GPIO 34 / ADC1)
 *      (Also supports MH-Z19B NDIR UART sensor via #define USE_MHZ19B)
 *
 * Connects to Wi-Fi and sends data to FastAPI backend every SEND_INTERVAL_MS (1 sec).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WIRING DIAGRAM:
 *
 * 1. Soil Moisture Sensor (Digital):
 *    - VCC  → ESP32 3.3V (or 5V / VIN)
 *    - GND  → ESP32 GND
 *    - DO   → ESP32 GPIO 27
 *
 * 2. CO2 Sensor (Default: MQ-135 Analog):
 *    - VCC  → ESP32 VIN (5V recommended for MQ heater)
 *    - GND  → ESP32 GND
 *    - AOUT → ESP32 GPIO 34  (MUST use ADC1 pins: 32-39, because ADC2 is disabled when Wi-Fi is active)
 *
 * [Optional] MH-Z19B NDIR Sensor (If enabled below):
 *    - Vin  → ESP32 VIN (5V)
 *    - GND  → ESP32 GND
 *    - TX   → ESP32 GPIO 16 (RX2)
 *    - RX   → ESP32 GPIO 17 (TX2)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEPENDENCIES (Install via Arduino IDE → Sketch → Include Library → Manage Libraries):
 *   - ArduinoJson (by Benoit Blanchon, v6.x or v7.x)
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ─── Pin & Hardware Configuration ─────────────────────────────────────────────

#define SOIL_SENSOR_PIN  27       // Digital Output from Soil Moisture sensor
#define CO2_ANALOG_PIN   34       // Analog pin for MQ-135 (ADC1 pin safe with Wi-Fi)

// Set to true if you are using MH-Z19B UART sensor instead of MQ-135 analog
#define USE_MHZ19B       false

#if USE_MHZ19B
  #include <HardwareSerial.h>
  #define MHZ_RX_PIN 16           // Connect to MH-Z19B TX
  #define MHZ_TX_PIN 17           // Connect to MH-Z19B RX
  HardwareSerial mhzSerial(2);
#endif

// ─── Wi-Fi & Backend Credentials ──────────────────────────────────────────────

const char* WIFI_SSID     = "Airtel_nila_6326";     // Wi-Fi SSID
const char* WIFI_PASSWORD = "Air@04113";             // Wi-Fi Password
const char* SERVER_IP     = "192.168.1.15";          // Laptop LAN IPv4 Address

const int   SERVER_PORT          = 8000;
const char* SENSOR_DATA_ENDPOINT = "/sensor-data";

// How often to read sensors and POST to backend (milliseconds)
const unsigned long SEND_INTERVAL_MS = 1000;

// Wi-Fi connection attempts
const int WIFI_MAX_ATTEMPTS = 20;

// ─── MQ-135 Calibration Constants ─────────────────────────────────────────────
// The MQ-135 needs 5V on VCC to heat properly and pre-heat for stable readings.
// ADC resolution: 12-bit (0 - 4095) for 3.3V reference.
const float RL_VALUE           = 10.0;    // Load resistance on the board in kOhms
const float R0_CLEAN_AIR       = 10.0;    // Sensor resistance in clean air (calibrate if needed)
const float CO2_CURVE_A        = 116.602; // Calibration parameter A for CO2
const float CO2_CURVE_B        = -2.769;  // Calibration parameter B for CO2

// ─── State ────────────────────────────────────────────────────────────────────

unsigned long lastSendTime = 0;

// ─── Wi-Fi Helpers ────────────────────────────────────────────────────────────

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
    Serial.print("✅ WiFi connected! ESP32 IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println();
  Serial.println("❌ WiFi connection failed. Will retry automatically.");
  return false;
}

void ensureWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected – attempting reconnect…");
    WiFi.disconnect();
    delay(1000);
    connectWiFi();
  }
}

// ─── Sensor Readings ──────────────────────────────────────────────────────────

/**
 * Reads Soil Moisture Digital Sensor on GPIO 27.
 * Standard comparator modules output LOW when soil is WET, HIGH when DRY.
 */
String readSoilStatus() {
  int state = digitalRead(SOIL_SENSOR_PIN);
  return (state == LOW) ? "WET" : "DRY";
}

/**
 * Reads MQ-135 Analog CO2 Sensor on GPIO 34.
 * Takes average of 10 samples for noise suppression, then computes ppm.
 */
float readCO2_MQ135() {
  long adcSum = 0;
  const int SAMPLES = 10;

  for (int i = 0; i < SAMPLES; i++) {
    adcSum += analogRead(CO2_ANALOG_PIN);
    delay(5);
  }

  float adcAverage = (float)adcSum / SAMPLES;

  // Convert ADC value to voltage (ESP32 ADC is 12-bit: 0 to 4095, 3.3V max)
  float voltage = (adcAverage / 4095.0) * 3.3;

  // Protect against division by zero if sensor is disconnected or pin grounded
  if (voltage <= 0.05) {
    // Sensor reading baseline ~400 ppm (standard outdoor air)
    return 400.0;
  }

  // Calculate sensor resistance Rs: Rs = ((Vc - V) / V) * RL
  float rs = ((3.3 - voltage) / voltage) * RL_VALUE;
  if (rs < 0.1) rs = 0.1;

  // Calculate ratio Rs/Ro
  float ratio = rs / R0_CLEAN_AIR;

  // Calculate PPM using standard logarithmic approximation curve
  // ppm = a * (Rs/Ro)^b
  float ppm = CO2_CURVE_A * pow(ratio, CO2_CURVE_B);

  // Clamp ppm to typical realistic environmental boundaries (350 to 5000 ppm)
  if (ppm < 350.0) ppm = 350.0;
  if (ppm > 5000.0) ppm = 5000.0;

  return round(ppm * 10.0) / 10.0;
}

#if USE_MHZ19B
/**
 * Reads MH-Z19B NDIR Sensor via UART command (0xFF, 0x01, 0x86...)
 */
float readCO2_MHZ19() {
  byte cmd[9] = {0xFF, 0x01, 0x86, 0x00, 0x00, 0x00, 0x00, 0x00, 0x79};
  byte response[9];

  mhzSerial.write(cmd, 9);
  memset(response, 0, 9);

  unsigned long start = millis();
  while (mhzSerial.available() < 9) {
    if (millis() - start > 1000) {
      Serial.println("MH-Z19B timeout reading response");
      return -1.0;
    }
    delay(10);
  }

  mhzSerial.readBytes(response, 9);

  // Validate checksum
  byte crc = 0;
  for (int i = 1; i < 8; i++) crc += response[i];
  crc = 0xFF - crc + 1;

  if (response[8] == crc && response[0] == 0xFF && response[1] == 0x86) {
    int high = (int) response[2];
    int low  = (int) response[3];
    return (float)((high * 256) + low);
  }

  Serial.println("MH-Z19B checksum error");
  return -1.0;
}
#endif

/**
 * Returns current CO2 reading in PPM.
 */
float readCO2() {
#if USE_MHZ19B
  float val = readCO2_MHZ19();
  if (val > 0) return val;
#endif
  return readCO2_MQ135();
}

// ─── HTTP POST to FastAPI ─────────────────────────────────────────────────────

void sendSensorData(const String& soilStatus, float co2Value) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ Cannot send – WiFi not connected.");
    return;
  }

  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + SENSOR_DATA_ENDPOINT;

  // ── Build JSON payload ──────────────────────────────────────────────────
  StaticJsonDocument<256> doc;

  doc["soil_status"] = soilStatus;
  doc["co2"]         = co2Value;

  // Future NPK sensors can be added here seamlessly:
  // doc["nitrogen"]   = readNPK_N();
  // doc["phosphorus"] = readNPK_P();
  // doc["potassium"]  = readNPK_K();

  String payload;
  serializeJson(doc, payload);

  // ── Send ────────────────────────────────────────────────────────────────
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int responseCode = http.POST(payload);

  if (responseCode > 0) {
    Serial.print("📡 Sent -> FastAPI Code: ");
    Serial.print(responseCode);
    if (responseCode == 200 || responseCode == 201) {
      Serial.println(" (OK)");
    } else {
      Serial.print(" | Error Body: ");
      Serial.println(http.getString());
    }
  } else {
    Serial.print("❌ Server connection failed. Error: ");
    Serial.println(http.errorToString(responseCode));
  }

  http.end();
}

// ─── Setup ────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("=========================================");
  Serial.println("  Smart Agriculture Sensor Node (ESP32)  ");
  Serial.println("  Sensors: Soil Moisture + CO2           ");
  Serial.println("=========================================");

  // Configure Soil sensor digital pin
  pinMode(SOIL_SENSOR_PIN, INPUT);

  // Configure ADC for MQ-135 on GPIO 34
  analogReadResolution(12);                   // 12-bit resolution (0 - 4095)
  analogSetAttenuation(ADC_11db);            // 0 - 3.3V range

#if USE_MHZ19B
  mhzSerial.begin(9600, SERIAL_8N1, MHZ_RX_PIN, MHZ_TX_PIN);
  Serial.println("Initialized MH-Z19B Serial on pins 16(RX) & 17(TX)");
#endif

  connectWiFi();
}

// ─── Main Loop ────────────────────────────────────────────────────────────────

void loop() {
  ensureWiFi();

  unsigned long now = millis();
  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    // 1. Read sensors
    String soilStatus = readSoilStatus();
    float  co2Ppm     = readCO2();

    // 2. Print to Serial Monitor
    Serial.print("🌱 Soil: ");
    Serial.print(soilStatus);
    Serial.print("  |  💨 CO2: ");
    Serial.print(co2Ppm, 1);
    Serial.println(" ppm");

    // 3. Send payload to FastAPI
    sendSensorData(soilStatus, co2Ppm);
    Serial.println("-----------------------------------------");
  }
}
