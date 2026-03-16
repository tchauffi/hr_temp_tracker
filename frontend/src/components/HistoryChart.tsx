"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Reading {
  time: string;
  temperature: number;
  humidity: number;
}

const RANGES = [
  { label: "1h",  hours: 1 },
  { label: "6h",  hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 168 },
];

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function formatTick(isoTime: string, hours: number): string {
  const d = new Date(isoTime);
  if (hours <= 24) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function HistoryChart() {
  const [hours, setHours]   = useState(24);
  const [data, setData]     = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/readings?hours=${hours}`);
      setData(await res.json());
    } catch {
      // silently retry on next tick
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const id = setInterval(fetchData, 30_000); // auto-refresh every 30 s
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div>
      {/* Range selector */}
      <div className="flex gap-2 mb-6">
        {RANGES.map((r) => (
          <button
            key={r.hours}
            onClick={() => setHours(r.hours)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              hours === r.hours
                ? "bg-blue-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-72 flex items-center justify-center text-gray-300 text-sm">
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="h-72 flex items-center justify-center text-gray-300 text-sm">
          No data yet
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />

              <XAxis
                dataKey="time"
                tickFormatter={(t) => formatTick(t, hours)}
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />

              {/* Left axis — temperature */}
              <YAxis
                yAxisId="temp"
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}°`}
                tick={{ fontSize: 11, fill: "#f97316" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />

              {/* Right axis — humidity */}
              <YAxis
                yAxisId="humi"
                orientation="right"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: "#3b82f6" }}
                axisLine={false}
                tickLine={false}
                width={36}
              />

              <Tooltip
                contentStyle={{
                  border: "none",
                  borderRadius: "0.75rem",
                  boxShadow: "0 4px 6px -1px rgb(0 0 0 / .1)",
                  fontSize: 13,
                }}
                labelFormatter={(t) => new Date(t).toLocaleString()}
                formatter={(value: number, name: string) =>
                  name === "temperature"
                    ? [`${value} °C`, "Temperature"]
                    : [`${value} %`, "Humidity"]
                }
              />

              <Legend
                iconType="plainline"
                formatter={(v) =>
                  v === "temperature" ? "Temperature (°C)" : "Humidity (%)"
                }
              />

              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temperature"
                stroke="#f97316"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="humi"
                type="monotone"
                dataKey="humidity"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
