"use client";

import { useEffect, useState } from "react";

interface Reading {
  time: string;
  temperature: number;
  humidity: number;
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function Stat({
  value,
  unit,
  label,
  color,
}: {
  value: string;
  unit: string;
  label: string;
  color: string;
}) {
  return (
    <div className={`rounded-2xl p-6 text-center ${color}`}>
      <div className="flex items-end justify-center gap-1">
        <span className="text-6xl font-bold tabular-nums">{value}</span>
        <span className="text-2xl font-medium pb-1">{unit}</span>
      </div>
      <p className="mt-2 text-sm font-medium uppercase tracking-widest opacity-60">
        {label}
      </p>
    </div>
  );
}

export function CurrentReadings() {
  const [reading, setReading] = useState<Reading | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    // Seed with latest stored value
    fetch(`${API}/api/readings/latest`)
      .then((r) => r.json())
      .then((d) => d.temperature !== undefined && setReading(d))
      .catch(() => {});

    // Subscribe to live SSE stream
    const es = new EventSource(`${API}/api/stream`);
    es.onopen = () => setLive(true);
    es.onmessage = (e) => setReading(JSON.parse(e.data));
    es.onerror = () => setLive(false);

    return () => es.close();
  }, []);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4">
        <Stat
          value={reading ? reading.temperature.toFixed(1) : "--.-"}
          unit="°C"
          label="Temperature"
          color="bg-orange-50 text-orange-500"
        />
        <Stat
          value={reading ? reading.humidity.toFixed(1) : "--.-"}
          unit="%"
          label="Humidity"
          color="bg-blue-50 text-blue-500"
        />
      </div>
      <div className="flex items-center gap-2 justify-end pr-1">
        <span
          className={`w-2 h-2 rounded-full ${live ? "bg-green-400 animate-pulse" : "bg-gray-300"}`}
        />
        <span className="text-xs text-gray-400">
          {live ? "Live" : "Connecting…"}
          {reading &&
            ` · last update ${new Date(reading.time).toLocaleTimeString()}`}
        </span>
      </div>
    </div>
  );
}
