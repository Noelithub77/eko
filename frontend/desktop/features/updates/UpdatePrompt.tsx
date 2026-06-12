import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shared/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/components/ui/tooltip";
import { cn } from "@shared/lib/utils";
import { formatError, logError } from "@shared/utils/logger";
import {
  type CachedUpdate,
  checkForDesktopUpdate,
  clearCachedUpdate,
  isNewerVersion,
  loadCachedUpdate,
  saveCachedUpdate,
} from "./update-check";

type CheckState = "idle" | "checking";
type InstallState = "idle" | "downloading" | "failed";

export function UpdatePrompt() {
  const [cachedUpdate, setCachedUpdate] = useState<CachedUpdate | null>(null);
  const [liveUpdate, setLiveUpdate] = useState<Update | null>(null);
  const [open, setOpen] = useState(false);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [downloadProgress, setDownloadProgress] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const checkStarted = useRef(false);

  const refreshUpdate = useCallback(async (showError: boolean): Promise<void> => {
    setCheckState("checking");
    setErrorMessage(null);

    try {
      const nextUpdate = await checkForDesktopUpdate();
      if (!nextUpdate) {
        setLiveUpdate(null);
        setCachedUpdate(null);
        await clearCachedUpdate();
        return;
      }

      setLiveUpdate((currentUpdate) =>
        currentUpdate && !isNewerVersion(nextUpdate.version, currentUpdate.version)
          ? currentUpdate
          : nextUpdate,
      );
      setCachedUpdate((currentCachedUpdate) => {
        if (
          currentCachedUpdate &&
          !isNewerVersion(nextUpdate.version, currentCachedUpdate.version)
        ) {
          return currentCachedUpdate;
        }

        return {
          version: nextUpdate.version,
          currentVersion: nextUpdate.currentVersion,
          date: nextUpdate.date,
          body: nextUpdate.body,
          checkedAt: new Date().toISOString(),
        };
      });
      await saveCachedUpdate(nextUpdate);
    } catch (error) {
      void logError("Update check failed", error);
      if (showError) {
        setErrorMessage(formatError(error));
      }
    } finally {
      setCheckState("idle");
    }
  }, []);

  useEffect(() => {
    if (checkStarted.current) {
      return;
    }

    checkStarted.current = true;
    void loadCachedUpdate()
      .then(setCachedUpdate)
      .catch((error: unknown) => {
        void logError("Cached update load failed", error);
      });
    void refreshUpdate(false);
  }, [refreshUpdate]);

  async function openUpdateDialog(): Promise<void> {
    setOpen(true);
    setErrorMessage(null);
    if (!liveUpdate) {
      await refreshUpdate(true);
    } else {
      void refreshUpdate(true);
    }
  }

  async function installUpdate(): Promise<void> {
    if (!liveUpdate) {
      await refreshUpdate(true);
      return;
    }

    setInstallState("downloading");
    setErrorMessage(null);

    try {
      await liveUpdate.downloadAndInstall(handleDownloadEvent);
      await clearCachedUpdate();
      await relaunch();
    } catch (error) {
      const message = formatError(error);
      setInstallState("failed");
      setErrorMessage(message);
      void logError("Update install failed", error);
    }
  }

  function handleDownloadEvent(event: DownloadEvent): void {
    if (event.event === "Started") {
      setDownloadProgress("Starting download");
      return;
    }

    if (event.event === "Progress") {
      setDownloadProgress("Downloading update");
      return;
    }

    setDownloadProgress("Installing update");
  }

  const activeUpdate = liveUpdate ?? cachedUpdate;
  const hasUpdate = activeUpdate !== null;
  const isChecking = checkState === "checking";
  const isInstalling = installState === "downloading";

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => void openUpdateDialog()}
            className={cn(
              "inline-flex items-center justify-center rounded-md p-2 transition-colors",
              hasUpdate
                ? "bg-amber-300 text-amber-950 shadow-sm hover:bg-amber-200"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            aria-label={hasUpdate ? "Update available" : "Check for updates"}
          >
            {isChecking ? (
              <RefreshCw className="size-5 animate-spin" />
            ) : (
              <Download className="size-5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{hasUpdate ? `Update to ${activeUpdate.version}` : "Check for updates"}</p>
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-lg" showCloseButton={!isInstalling}>
          <DialogHeader>
            <DialogTitle>{hasUpdate ? "Update available" : "Check for updates"}</DialogTitle>
            <DialogDescription>
              {hasUpdate
                ? `Eko ${activeUpdate.version} is ready. Your current version is ${activeUpdate.currentVersion}.`
                : "Eko will check GitHub Releases for a newer desktop version."}
            </DialogDescription>
          </DialogHeader>
          {activeUpdate?.body ? (
            <p className="text-sm text-muted-foreground">{activeUpdate.body}</p>
          ) : null}
          {isChecking ? <p className="text-sm text-muted-foreground">Checking updates</p> : null}
          {downloadProgress ? (
            <p className="text-sm text-muted-foreground">{downloadProgress}</p>
          ) : null}
          {errorMessage ? (
            <p className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
              {errorMessage}
            </p>
          ) : null}
          {!hasUpdate && !isChecking && !errorMessage ? (
            <p className="text-sm text-muted-foreground">Eko is up to date.</p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isInstalling}>
                Later
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant={hasUpdate ? "default" : "outline"}
              onClick={() => (hasUpdate ? void installUpdate() : void refreshUpdate(true))}
              disabled={isInstalling || isChecking}
            >
              {buttonText(hasUpdate, isChecking, isInstalling, liveUpdate)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function buttonText(
  hasUpdate: boolean,
  isChecking: boolean,
  isInstalling: boolean,
  liveUpdate: Update | null,
): string {
  if (isInstalling) {
    return "Updating";
  }
  if (isChecking) {
    return "Checking";
  }
  if (!hasUpdate) {
    return "Check again";
  }
  if (!liveUpdate) {
    return "Refresh update";
  }

  return "Update now";
}
