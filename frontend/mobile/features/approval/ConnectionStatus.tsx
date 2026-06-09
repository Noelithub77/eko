import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";

type ConnectionStatusProps = {
  status: "disconnected" | "waiting" | "connecting" | "connected" | "denied";
};

export function ConnectionStatus({ status }: ConnectionStatusProps) {
  return (
    <Card className="gap-4 rounded-2xl py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle>Status</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className="rounded-xl bg-muted px-3 py-2 text-sm font-medium">{status}</div>
      </CardContent>
    </Card>
  );
}
