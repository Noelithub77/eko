import { Plus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@shared/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { RoomSession } from "@shared/types/stream";

type DevPanelProps = {
  session: RoomSession | null;
  onAddTestDevice: () => void;
};

export function DevPanel({ session, onAddTestDevice }: DevPanelProps) {
  const chartData =
    session?.metrics.map((metric, index) => ({
      index,
      value: metric.value,
      label: metric.label,
    })) ?? [];
  const events = session?.events ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Latency</CardTitle>
          <CardAction>
            <Button onClick={onAddTestDevice} size="sm" variant="outline">
              <Plus />
              Test phone
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="index" />
              <YAxis />
              <Tooltip />
              <Line dataKey="value" stroke="var(--foreground)" strokeWidth={2} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle>Events</CardTitle>
        </CardHeader>
        <CardContent className="grid max-h-64 gap-2 overflow-auto">
          {events.length === 0 ? (
            <span className="text-sm text-muted-foreground">No events</span>
          ) : (
            events.map((event) => (
              <div key={event.id} className="rounded-md border p-2">
                <div className="text-xs uppercase text-muted-foreground">{event.level}</div>
                <div>{event.message}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
