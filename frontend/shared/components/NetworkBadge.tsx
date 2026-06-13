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
            className="inline-flex shrink-0 cursor-help items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200/80 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
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
