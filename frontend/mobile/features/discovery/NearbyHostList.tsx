import { Info, Radar } from "lucide-react";
import { useState } from "react";
import { NetworkBadge } from "@shared/components/NetworkBadge";
import { Button } from "@shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@shared/components/ui/tooltip";
import type { DiscoveredHost } from "@shared/types/signaling";

type NearbyHostListProps = {
  onFind: () => void;
  onSelect: (host: DiscoveredHost) => void;
  hosts: DiscoveredHost[];
  isSearching: boolean;
};

export function NearbyHostList({ hosts, isSearching, onFind, onSelect }: NearbyHostListProps) {
  const [openHostKey, setOpenHostKey] = useState<string | null>(null);
  const uniqueHosts = removeDuplicateHosts(hosts);

  return (
    <Card className="gap-4 rounded-2xl py-5 shadow-none">
      <CardHeader className="px-5">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Nearby Host</CardTitle>
          <NetworkBadge label="Same network" />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 px-5">
        <Button className="h-11" disabled={isSearching} onClick={onFind} variant="outline">
          <Radar />
          {isSearching ? "Finding" : "Find"}
        </Button>
        {uniqueHosts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
            No host found
          </div>
        ) : (
          <TooltipProvider>
            {uniqueHosts.map((host) => {
              const hostKey = getHostKey(host);
              const address = `${host.host}:${host.port}`;

              return (
                <div className="grid grid-cols-[1fr_auto] gap-2" key={hostKey}>
                  <Button
                    className="h-11 justify-start px-4"
                    onClick={() => onSelect(host)}
                    variant="outline"
                  >
                    Eko Desktop
                  </Button>
                  <Tooltip
                    onOpenChange={(open) => setOpenHostKey(open ? hostKey : null)}
                    open={openHostKey === hostKey}
                  >
                    <TooltipTrigger asChild>
                      <Button
                        aria-label={`Show host address ${address}`}
                        className="h-11 w-11"
                        onClick={() => setOpenHostKey(openHostKey === hostKey ? null : hostKey)}
                        variant="outline"
                      >
                        <Info />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{address}</TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  );
}

function getHostKey(host: DiscoveredHost): string {
  return `${host.host}-${host.port}`;
}

function removeDuplicateHosts(hosts: DiscoveredHost[]): DiscoveredHost[] {
  const hostMap = new Map<string, DiscoveredHost>();

  for (const host of hosts) {
    hostMap.set(getHostKey(host), host);
  }

  return [...hostMap.values()];
}
