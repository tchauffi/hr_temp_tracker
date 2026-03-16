#include <Arduino_SensorKit.h>

// ---------------------------------------------------------------------------
// Exponential Moving Average (EMA) filter
//   filtered = ALPHA * raw + (1 - ALPHA) * filtered
//   Lower ALPHA  → smoother but slower to track real changes (e.g. 0.1)
//   Higher ALPHA → faster but noisier                        (e.g. 0.5)
// ---------------------------------------------------------------------------
const float ALPHA = 0.2;

float filteredTemp = NAN;
float filteredHumi = NAN;

float applyEMA(float newValue, float prev) {
  if (isnan(newValue)) return prev;        // discard bad reading, keep last
  if (isnan(prev))     return newValue;    // first valid reading: seed filter
  return ALPHA * newValue + (1.0 - ALPHA) * prev;
}

// ---------------------------------------------------------------------------

void setup() {
  Serial.begin(9600);

  // Initialize OLED display (I2C)
  Oled.begin();
  Oled.setFont(u8x8_font_chroma48medium8_r);

  // Initialize DHT sensor on D3
  Environment.begin();

  // Static labels (drawn once)
  Oled.setCursor(0, 0);
  Oled.print("Humidity Tracker");
  Oled.setCursor(0, 1);
  Oled.print("----------------");
  Oled.setCursor(0, 3);
  Oled.print("Temp:");
  Oled.setCursor(0, 5);
  Oled.print("Humi:");
}

void loop() {
  float rawTemp = Environment.readTemperature();
  float rawHumi = Environment.readHumidity();

  filteredTemp = applyEMA(rawTemp, filteredTemp);
  filteredHumi = applyEMA(rawHumi, filteredHumi);

  // Human-readable debug
  Serial.print("Raw  -> Temp: "); Serial.print(rawTemp, 1);
  Serial.print(" C | Humi: ");    Serial.print(rawHumi, 1); Serial.println(" %");
  Serial.print("Filt -> Temp: "); Serial.print(filteredTemp, 1);
  Serial.print(" C | Humi: ");    Serial.print(filteredHumi, 1); Serial.println(" %");

  // Machine-readable line parsed by the Python server
  // Format: LOG:<temperature>:<humidity>
  if (!isnan(filteredTemp) && !isnan(filteredHumi)) {
    Serial.print("LOG:");
    Serial.print(filteredTemp, 1);
    Serial.print(":");
    Serial.println(filteredHumi, 1);
  }

  // Update OLED (only when we have a valid filtered value)
  if (!isnan(filteredTemp)) {
    Oled.setCursor(6, 3);
    Oled.print("          ");   // clear previous value
    Oled.setCursor(6, 3);
    Oled.print(filteredTemp, 1);
    Oled.print(" C");
  }

  if (!isnan(filteredHumi)) {
    Oled.setCursor(6, 5);
    Oled.print("          ");   // clear previous value
    Oled.setCursor(6, 5);
    Oled.print(filteredHumi, 1);
    Oled.print(" %");
  }

  delay(2000); // Refresh every 2 seconds
}
