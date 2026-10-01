/*
 * ESP32 Smart Agriculture Sensor Node
 *
 * Sensors integrated:
 *   1. RS485 Modbus Soil Sensor (GEMHO / JXCT 7-in-1 or 3-in-1 NPK)
 *      - Serial2: RX=16 (RO), TX=17 (DI), DE/RE=4
 *      - Moisture (%), Soil Temperature (°C), EC (us/cm), pH
 *      - Nitrogen (N), Phosphorus (P), Potassium (K) in mg/kg
 *   2. MQ-135 Analog CO2 Sensor (GPIO 34 / ADC1)
 *   3. DHT11 Air Temperature & Humidity (GPIO 26)
 *   4. Digital Soil Moisture Probe (GPIO 27) [Hardware Fallback]
 *
 * Transmits readings to FastAPI backend every SEND_INTERVAL_MS via HTTP POST.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HARDWARE WIRING (MAX485 / TTL-to-RS485 Module to ESP32):
 *   - VCC        → 5V (VIN of ESP32)
 *   - GND        → ESP32 GND
 *   - RO (RX)    → ESP32 GPIO 16 (RX2)
 *   - DI (TX)    → ESP32 GPIO 17 (TX2)
 *   - DE & RE    → ESP32 GPIO 4 (jumpered together)
 *   - A & B      → RS485 Sensor A & B lines (Yellow/Green or as labeled)
 *   - Sensor VCC → 5V - 12V/24V DC power supply (check sensor label, brown wire)
 *   - Sensor GND → Common Ground (black/blue wire)
 *
 * LIBRARIES REQUIRED (Install via Arduino IDE → Library Manager):
 *   - ArduinoJson (by Benoit Blanchon, v6 or v7)
 *   - DHT sensor library (by Adafruit)
 *   - Adafruit Unified Sensor (dependency for DHT)
 *
 * NOTE: RS485 Modbus is handled via ESP32 HardwareSerial (Serial2) with
 *       built-in CRC16 calculation, requiring NO extra third-party Modbus library.
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>

// ─────────────────────────────────────────────
// PIN CONFIGURATION
// ─────────────────────────────────────────────

#define SOIL_SENSOR_PIN 27    // Digital soil probe (fallback)
#define CO2_ANALOG_PIN  34    // MQ-135 analog output

// DHT11 Configuration
#define DHT_PIN  26
#define DHT_TYPE DHT11
DHT dht(DHT_PIN, DHT_TYPE);

// RS485 / MAX485 Pin Definitions (HardwareSerial2)
#define RS485_RX_PIN    16    // ESP32 RX2 connects to MAX485 RO
#define RS485_TX_PIN    17    // ESP32 TX2 connects to MAX485 DI
#define RS485_DE_RE_PIN 4     // ESP32 GPIO connects to MAX485 DE & RE (jumpered)
#define RS485_BAUD      4800  // Common Modbus soil sensor default (try 9600 if no response)

// ─────────────────────────────────────────────
// WIFI CONFIGURATION
// ─────────────────────────────────────────────

const char *WIFI_SSID     = "AYUSHH";
const char *WIFI_PASSWORD = "12345678";

// FastAPI Backend Server IP & Port
const char *SERVER_IP            = "10.35.61.212";
const int   SERVER_PORT          = 8000;
const char *SENSOR_DATA_ENDPOINT = "/sensor-data";

// ─────────────────────────────────────────────
// READING INTERVAL & NETWORK
// ─────────────────────────────────────────────

const unsigned long SEND_INTERVAL_MS = 10000; // 10 seconds
const int           WIFI_MAX_ATTEMPTS = 20;

// ─────────────────────────────────────────────
// MQ-135 CALIBRATION
// ─────────────────────────────────────────────

const float RL_VALUE     = 10.0;
const float R0_CLEAN_AIR = 10.0;
const float CO2_CURVE_A  = 116.602;
const float CO2_CURVE_B  = -2.769;

// ─────────────────────────────────────────────
// RS485 SOIL DATA STRUCTURE
// ─────────────────────────────────────────────

struct RS485SoilData {
  bool  valid       = false;
  float moisture    = -1.0;    // %
  float temperature = -999.0;  // °C
  float ec          = -1.0;    // us/cm
  float ph          = -1.0;    // pH
  float nitrogen    = -1.0;    // mg/kg
  float phosphorus  = -1.0;    // mg/kg
  float potassium   = -1.0;    // mg/kg
};

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

unsigned long lastSendTime = 0;

// ─────────────────────────────────────────────
// MODBUS RTU CRC16 CALCULATION
// ─────────────────────────────────────────────

uint16_t calculateModbusCRC(const byte *buf, int len) {
  uint16_t crc = 0xFFFF;
  for (int pos = 0; pos < len; pos++) {
    crc ^= (uint16_t)buf[pos];
    for (int i = 8; i != 0; i--) {
      if ((crc & 0x0001) != 0) {
        crc >>= 1;
        crc ^= 0xA001;
      } else {
        crc >>= 1;
      }
    }
  }
  return crc;
}

// ─────────────────────────────────────────────
// RS485 QUERY & RESPONSE HANDLER
// ─────────────────────────────────────────────

int sendRS485Query(const byte *query, int queryLen, byte *response, int maxRespLen, unsigned long timeoutMs = 800) {
  // Clear any pending bytes in RX buffer
  while (Serial2.available()) {
    Serial2.read();
  }

  // Switch MAX485 to Transmit (DE & RE = HIGH)
  digitalWrite(RS485_DE_RE_PIN, HIGH);
  delayMicroseconds(60);

  Serial2.write(query, queryLen);
  Serial2.flush(); // Wait until transmission is complete
  delayMicroseconds(60);

  // Switch MAX485 back to Receive (DE & RE = LOW)
  digitalWrite(RS485_DE_RE_PIN, LOW);

  // Read response with timeout
  unsigned long start = millis();
  int bytesRead = 0;

  while ((millis() - start) < timeoutMs && bytesRead < maxRespLen) {
    if (Serial2.available()) {
      response[bytesRead++] = Serial2.read();
      start = millis(); // Reset timeout on incoming byte
    } else {
      delay(2);
    }
  }

  return bytesRead;
}

// ─────────────────────────────────────────────
// READ RS485 MODBUS SOIL SENSOR
// ─────────────────────────────────────────────

RS485SoilData readRS485SoilSensor() {
  RS485SoilData data;
  byte response[32];
  memset(response, 0, sizeof(response));

  // 1. Try 7-in-1 Modbus Query (Reads 7 holding registers starting at 0x0000)
  // Query: Addr(0x01), Func(0x03), Start(0x00, 0x00), Count(0x00, 0x07), CRC(0x04, 0x08)
  const byte query7in1[] = {0x01, 0x03, 0x00, 0x00, 0x00, 0x07, 0x04, 0x08};
  int len = sendRS485Query(query7in1, sizeof(query7in1), response, 19, 600);

  if (len >= 19 && response[0] == 0x01 && response[1] == 0x03 && response[2] == 14) {
    uint16_t receivedCrc = response[17] | (response[18] << 8);
    uint16_t calculatedCrc = calculateModbusCRC(response, 17);

    if (receivedCrc == calculatedCrc) {
      data.moisture    = (float)((response[3] << 8) | response[4]) * 0.1f;
      int16_t rawTemp  = (int16_t)((response[5] << 8) | response[6]);
      data.temperature = (float)rawTemp * 0.1f;
      data.ec          = (float)((response[7] << 8) | response[8]);
      data.ph          = (float)((response[9] << 8) | response[10]) * 0.1f;
      data.nitrogen    = (float)((response[11] << 8) | response[12]);
      data.phosphorus  = (float)((response[13] << 8) | response[14]);
      data.potassium   = (float)((response[15] << 8) | response[16]);
      data.valid       = true;

      Serial.println("[RS485] Modbus 7-in-1 frame decoded successfully.");
      return data;
    }
  }

  // 2. If 7-in-1 failed, try 3-in-1 NPK query (Reads 3 registers starting at 0x001E)
  // Query: Addr(0x01), Func(0x03), Start(0x00, 0x1E), Count(0x00, 0x03), CRC(0x65, 0xCD)
  const byte queryNPK[] = {0x01, 0x03, 0x00, 0x1E, 0x00, 0x03, 0x65, 0xCD};
  memset(response, 0, sizeof(response));
  len = sendRS485Query(queryNPK, sizeof(queryNPK), response, 11, 600);

  if (len >= 11 && response[0] == 0x01 && response[1] == 0x03 && response[2] == 6) {
    uint16_t receivedCrc = response[9] | (response[10] << 8);
    uint16_t calculatedCrc = calculateModbusCRC(response, 9);

    if (receivedCrc == calculatedCrc) {
      data.nitrogen    = (float)((response[3] << 8) | response[4]);
      data.phosphorus  = (float)((response[5] << 8) | response[6]);
      data.potassium   = (float)((response[7] << 8) | response[8]);
      data.valid       = true;

      Serial.println("[RS485] Modbus 3-in-1 NPK frame decoded successfully.");
      return data;
    }
  }

  // 3. Fallback: Query individual registers for sensors requiring single-register polls
  const byte queryN[] = {0x01, 0x03, 0x00, 0x1E, 0x00, 0x01, 0xE4, 0x0C};
  const byte queryP[] = {0x01, 0x03, 0x00, 0x1F, 0x00, 0x01, 0xB5, 0xCC};
  const byte queryK[] = {0x01, 0x03, 0x00, 0x20, 0x00, 0x01, 0x85, 0xC0};

  bool gotAny = false;

  len = sendRS485Query(queryN, sizeof(queryN), response, 7, 300);
  if (len >= 7 && response[0] == 0x01 && response[1] == 0x03 && response[2] == 2) {
    data.nitrogen = (float)((response[3] << 8) | response[4]);
    gotAny = true;
  }

  delay(20);
  len = sendRS485Query(queryP, sizeof(queryP), response, 7, 300);
  if (len >= 7 && response[0] == 0x01 && response[1] == 0x03 && response[2] == 2) {
    data.phosphorus = (float)((response[3] << 8) | response[4]);
    gotAny = true;
  }

  delay(20);
  len = sendRS485Query(queryK, sizeof(queryK), response, 7, 300);
  if (len >= 7 && response[0] == 0x01 && response[1] == 0x03 && response[2] == 2) {
    data.potassium = (float)((response[3] << 8) | response[4]);
    gotAny = true;
  }

  if (gotAny) {
    data.valid = true;
    Serial.println("[RS485] Individual NPK registers read successfully.");
  } else {
    Serial.println("[RS485] No response from RS485 sensor (check wiring, baud 4800/9600, or slave ID).");
  }

  return data;
}

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

void ensureWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.disconnect();
    delay(1000);
    connectWiFi();
  }
}

// ─────────────────────────────────────────────
// DIGITAL SOIL MOISTURE (FALLBACK)
// ─────────────────────────────────────────────

String readSoilStatusFallback() {
  int state = digitalRead(SOIL_SENSOR_PIN);
  return (state == LOW) ? "WET" : "DRY";
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
  float voltage = (adcAverage / 4095.0f) * 3.3f;

  if (voltage <= 0.05f) {
    return 400.0f; // clean air baseline
  }

  float rs = ((3.3f - voltage) / voltage) * RL_VALUE;
  if (rs < 0.1f) rs = 0.1f;

  float ratio = rs / R0_CLEAN_AIR;
  float ppm = CO2_CURVE_A * pow(ratio, CO2_CURVE_B);

  if (ppm < 350.0f) ppm = 350.0f;
  if (ppm > 5000.0f) ppm = 5000.0f;

  return round(ppm * 10.0f) / 10.0f;
}

// ─────────────────────────────────────────────
// DHT11 READINGS
// ─────────────────────────────────────────────

float readTemperature() {
  float temperature = dht.readTemperature();
  if (isnan(temperature)) {
    Serial.println("WARN: DHT11 temperature read failed.");
    return -999.0;
  }
  return temperature;
}

float readHumidity() {
  float humidity = dht.readHumidity();
  if (isnan(humidity)) {
    Serial.println("WARN: DHT11 humidity read failed.");
    return -999.0;
  }
  return humidity;
}

// ─────────────────────────────────────────────
// SEND DATA TO FASTAPI BACKEND
// ─────────────────────────────────────────────

void sendSensorData(const String &soilStatus, float co2Value, float temperature,
                    float humidity, float nitrogen, float phosphorus, float potassium) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Skipping payload.");
    return;
  }

  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + SENSOR_DATA_ENDPOINT;

  // Build JSON Payload
  StaticJsonDocument<512> doc;
  doc["soil_status"] = soilStatus;
  doc["co2"]         = co2Value;

  // Temperature
  if (temperature != -999.0f) {
    doc["temperature"] = temperature;
  } else {
    doc["temperature"] = nullptr;
  }

  // Humidity
  if (humidity != -999.0f) {
    doc["humidity"] = humidity;
  } else {
    doc["humidity"] = nullptr;
  }

  // RS485 NPK Macro-nutrients (mg/kg)
  if (nitrogen >= 0.0f) {
    doc["nitrogen"] = nitrogen;
  } else {
    doc["nitrogen"] = nullptr;
  }

  if (phosphorus >= 0.0f) {
    doc["phosphorus"] = phosphorus;
  } else {
    doc["phosphorus"] = nullptr;
  }

  if (potassium >= 0.0f) {
    doc["potassium"] = potassium;
  } else {
    doc["potassium"] = nullptr;
  }

  String payload;
  serializeJson(doc, payload);

  Serial.print("JSON Payload: ");
  Serial.println(payload);

  // Send HTTP POST
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int responseCode = http.POST(payload);

  if (responseCode > 0) {
    Serial.print("FastAPI Response: ");
    Serial.println(responseCode);

    if (responseCode != 200 && responseCode != 201) {
      Serial.print("Server error body: ");
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
  Serial.println("==============================================");
  Serial.println("  ESP32 SMART AGRICULTURE NODE - RS485 READY  ");
  Serial.println("==============================================");

  // 1. Digital Soil Pin (fallback)
  pinMode(SOIL_SENSOR_PIN, INPUT);

  // 2. RS485 Direction Control Pin
  pinMode(RS485_DE_RE_PIN, OUTPUT);
  digitalWrite(RS485_DE_RE_PIN, LOW); // Start in RX mode

  // 3. RS485 HardwareSerial (Serial2 on GPIO 16 RX, GPIO 17 TX)
  Serial2.begin(RS485_BAUD, SERIAL_8N1, RS485_RX_PIN, RS485_TX_PIN);
  Serial.print("RS485 Modbus initialized on RX2 (GPIO ");
  Serial.print(RS485_RX_PIN);
  Serial.print(") & TX2 (GPIO ");
  Serial.print(RS485_TX_PIN);
  Serial.print(") at ");
  Serial.print(RS485_BAUD);
  Serial.println(" baud.");

  // 4. ADC Configuration for MQ-135
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  // 5. DHT11
  dht.begin();
  Serial.println("DHT11 sensor initialized.");

  // 6. Connect WiFi
  connectWiFi();

  Serial.println();
  Serial.println("System initialized successfully.");
  Serial.println("Polling sensors every 10 seconds...");
  Serial.println();
}

// ─────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────

void loop() {
  ensureWiFi();

  unsigned long now = millis();

  if (now - lastSendTime >= SEND_INTERVAL_MS) {
    lastSendTime = now;

    Serial.println();
    Serial.println("========== SENSOR READING CYCLE ==========");

    // 1. Read RS485 Modbus Soil Sensor
    RS485SoilData rs485 = readRS485SoilSensor();

    // Determine Soil Status:
    // If RS485 provides moisture percentage: >=30% = WET, <30% = DRY
    // Otherwise fallback to digital probe GPIO 27
    String soilStatus;
    if (rs485.valid && rs485.moisture >= 0.0f) {
      soilStatus = (rs485.moisture >= 30.0f) ? "WET" : "DRY";
      Serial.print("Soil Moisture (RS485): ");
      Serial.print(rs485.moisture, 1);
      Serial.print("% -> Evaluated Status: ");
      Serial.println(soilStatus);
    } else {
      soilStatus = readSoilStatusFallback();
      Serial.print("Soil Moisture (Digital Probe): ");
      Serial.println(soilStatus);
    }

    // 2. Read Air Temperature & Humidity (DHT11)
    float temperature = readTemperature();
    float humidity    = readHumidity();

    // Fallback: If DHT11 failed but RS485 has temperature, use RS485 soil temp
    if (temperature == -999.0f && rs485.valid && rs485.temperature != -999.0f) {
      temperature = rs485.temperature;
      Serial.print("Using RS485 Temperature as fallback: ");
      Serial.print(temperature, 1);
      Serial.println(" °C");
    }

    // 3. Read MQ-135 CO2
    float co2Ppm = readCO2_MQ135();

    // 4. Log Readings to Serial Monitor
    Serial.print("CO2 (MQ-135): ");
    Serial.print(co2Ppm, 1);
    Serial.println(" ppm");

    if (temperature != -999.0f) {
      Serial.print("Temperature:  ");
      Serial.print(temperature, 1);
      Serial.println(" °C");
    }
    if (humidity != -999.0f) {
      Serial.print("Humidity:     ");
      Serial.print(humidity, 1);
      Serial.println(" %");
    }

    if (rs485.valid) {
      if (rs485.ec >= 0.0f) {
        Serial.print("Soil EC:      ");
        Serial.print(rs485.ec, 0);
        Serial.println(" us/cm");
      }
      if (rs485.ph >= 0.0f) {
        Serial.print("Soil pH:      ");
        Serial.print(rs485.ph, 1);
        Serial.println();
      }
      if (rs485.nitrogen >= 0.0f) {
        Serial.print("Nitrogen (N): ");
        Serial.print(rs485.nitrogen, 1);
        Serial.println(" mg/kg");
      }
      if (rs485.phosphorus >= 0.0f) {
        Serial.print("Phosphorus(P):");
        Serial.print(rs485.phosphorus, 1);
        Serial.println(" mg/kg");
      }
      if (rs485.potassium >= 0.0f) {
        Serial.print("Potassium (K):");
        Serial.print(rs485.potassium, 1);
        Serial.println(" mg/kg");
      }
    }
    Serial.println("==========================================");

    // 5. Send Payload to FastAPI Backend
    sendSensorData(
      soilStatus,
      co2Ppm,
      temperature,
      humidity,
      rs485.nitrogen,
      rs485.phosphorus,
      rs485.potassium
    );

    Serial.println("Waiting 10 seconds for next cycle...");
  }
}