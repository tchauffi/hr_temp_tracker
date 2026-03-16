import { CurrentReadings } from "@/components/CurrentReadings";
import { HistoryChart } from "@/components/HistoryChart";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Humidity Tracker</h1>

        <CurrentReadings />

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-600 mb-4">
            History
          </h2>
          <HistoryChart />
        </div>
      </div>
    </main>
  );
}
