import { Radar } from "lucide-react";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import type { DiscoveredHost } from "@shared/types/signaling";

type NearbyHostListProps = {
  onFind: () => void;
  onSelect: (host: DiscoveredHost) => void;
  hosts: DiscoveredHost[];
  isSearching: boolean;
};

export function NearbyHostList({ hosts, isSearching, onFind, onSelect }: NearbyHostListProps) {
  return (
    <Card className="gap-4 rounded-2xl py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle>Nearby Host</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-5">
        <Button className="h-11" disabled={isSearching} onClick={onFind} variant="outline">
          <Radar />
          {isSearching ? "Finding" : "Find"}
        </Button>
        {hosts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            No host found
          </div>
        ) : (
          hosts.map((host) => (
            <Button
              key={`${host.roomId}-${host.host}-${host.port}`}
              onClick={() => onSelect(host)}
              variant="outline"
            >
              {host.host}:{host.port}
            </Button>
          ))
        )}
      </CardContent>
    </Card>
  );
}
