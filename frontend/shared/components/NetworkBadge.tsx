"use client";

import { Wifi } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@shared/components/ui/tooltip";

type NetworkBadgeProps = {
  label?: string;
  tooltip?: string;
};

export function NetworkBadge({
  label = "Same network",
  tooltip = "Your phone and this computer must be on the same Wi-Fi network. You can also connect the laptop to your phone's mobile hotspot.",
}: NetworkBadgeProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border border-teal/30 bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal transition-colors hover:bg-teal/20"
            tabIndex={0}
          >
            <Wifi className="size-3.5" />
            {label}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="end" className="max-w-[260px] leading-relaxed">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
