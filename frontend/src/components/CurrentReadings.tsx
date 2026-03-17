"use client";

import { useEffect, useState, useRef } from "react";

interface Reading {
  time: string;
  temperature: number;
  humidity: number;
}

const API = "";

function useSecondsAgo(updatedAt: Date | null): string {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!updatedAt) return "";
  const secs = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
  if (secs < 5) return "just now";
  return `${secs}s ago`;
}

function Stat({
  value,
  unit,
  label,
  color,
  flash,
}: {
  value: string;
  unit: string;
  label: string;
  color: string;
  flash: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-6 text-center transition-all duration-150 ${color} ${
        flash ? "brightness-95 scale-[0.98]" : ""
      }`}
    >
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
  const [flash, setFlash] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondsAgo = useSecondsAgo(updatedAt);

  function handleReading(r: Reading) {
    setReading(r);
    setUpdatedAt(new Date());
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 150);
  }

  useEffect(() => {
    fetch(`${API}/api/readings/latest`)
      .then((r) => r.json())
      .then((d) => d.temperature !== undefined && handleReading(d))
      .catch(() => {});

    const es = new EventSource(`${API}/api/stream`);
    es.onopen = () => setLive(true);
    es.onmessage = (e) => handleReading(JSON.parse(e.data));
    es.onerror = () => setLive(false);

    return () => {
      es.close();
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-4">
        <Stat
          value={reading ? reading.temperature.toFixed(1) : "--.-"}
          unit="°C"
          label="Temperature"
          color="bg-orange-50 text-orange-500"
          flash={flash}
        />
        <Stat
          value={reading ? reading.humidity.toFixed(1) : "--.-"}
          unit="%"
          label="Humidity"
          color="bg-blue-50 text-blue-500"
          flash={flash}
        />
      </div>
      <div className="flex items-center gap-2 justify-end pr-1">
        <span
          className={`w-2 h-2 rounded-full ${live ? "bg-green-400 animate-pulse" : "bg-gray-300"}`}
        />
        <span className="text-xs text-gray-400">
          {live ? "Live" : "Connecting…"}
          {updatedAt && ` · updated ${secondsAgo}`}
        </span>
      </div>
    </div>
  );
}
