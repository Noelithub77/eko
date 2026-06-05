import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";

type ConnectionStatusProps = {
  status: "disconnected" | "waiting" | "connected" | "denied";
};

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">{status}</div>
      </CardContent>
    </Card>
  );
}
