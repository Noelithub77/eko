import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Pencil, Play, X } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";

type ReceiverCardProps = {
  deviceName: string;
  canEditName: boolean;
  isConnected: boolean;
  isPlaying: boolean;
  hasJoined: boolean;
  controlsPending?: boolean;
  onNameChange: (name: string) => void;
  onNameCommit: () => void;
  onTogglePlay: () => void;
  onDisconnect: () => void;
  visualizer: ReactNode;
  children: ReactNode;
};

export function ReceiverCard({ deviceName, canEditName, isConnected, isPlaying, hasJoined,
  controlsPending = false, onNameChange, onNameCommit, onTogglePlay, onDisconnect,
  visualizer, children }: ReceiverCardProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editingRef = useRef(false);
  const nameBeforeEditRef = useRef(deviceName);

  useEffect(() => {
    if (isEditingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingName]);

  const finishEditing = (save: boolean) => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setIsEditingName(false);
    if (save) onNameCommit();
    else onNameChange(nameBeforeEditRef.current);
  };

  return (
    <Card className="min-h-0 gap-4 overflow-y-auto rounded-2xl py-5 shadow-none">
      <CardContent className="grid gap-4 px-5">
        <div className="grid gap-2 text-sm font-medium">
          <label htmlFor="receiver-name">Receiver name</label>
          {isEditingName ? (
            <input ref={inputRef} id="receiver-name" value={deviceName}
              onBlur={() => finishEditing(true)} onChange={(event) => onNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") finishEditing(true);
                if (event.key === "Escape") finishEditing(false);
              }} maxLength={40} disabled={!canEditName}
              className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50" />
          ) : (
            <button type="button" id="receiver-name" disabled={!canEditName}
              onClick={() => { nameBeforeEditRef.current = deviceName; editingRef.current = true; setIsEditingName(true); }}
              className={cn("flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-xs transition-colors",
                canEditName ? "cursor-text hover:bg-accent/50" : "cursor-not-allowed opacity-50")}
              aria-label="Edit receiver name">
              <span className="truncate">{deviceName}</span>
              <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          )}
        </div>
        <div className={cn("relative h-32 w-full overflow-hidden rounded-xl bg-[#101010] transition-opacity",
          isConnected ? "opacity-100" : "opacity-30")}>
          {visualizer}
          {!isConnected && <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-medium text-white/40">Waiting for audio…</span>
          </div>}
        </div>
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={onTogglePlay} disabled={!isConnected || controlsPending}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all hover:bg-primary/80 active:scale-95 disabled:opacity-50"
            aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>
          <button type="button" onClick={onDisconnect} disabled={!hasJoined || controlsPending}
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-all hover:bg-muted active:scale-95 disabled:opacity-50"
            aria-label="Disconnect"><X className="size-4" /></button>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}
