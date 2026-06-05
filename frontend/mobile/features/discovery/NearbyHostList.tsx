import { Radar } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";

type NearbyHostListProps = {
  onFind: () => void;
};

export function NearbyHostList({ onFind }: NearbyHostListProps) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>Nearby Host</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button onClick={onFind} variant="outline">
          <Radar />
          Find
        </Button>
        <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          LAN scan connects to the native discovery core.
        </div>
      </CardContent>
    </Card>
  );
}
