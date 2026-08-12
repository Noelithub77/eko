import { relaunch } from "@tauri-apps/plugin-process";
import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shared/components/ui/tooltip";
import { cn } from "@shared/lib/utils";
import { logError } from "@shared/utils/logger";
import {
  type CachedUpdate,
  checkForDesktopUpdate,
  clearCachedUpdate,
  getDesktopPlatformName,
  getUpdateCheckErrorMessage,
  isNewerVersion,
  loadCachedUpdate,
  saveCachedUpdate,
} from "./update-check";

type CheckState = "idle" | "checking";
type InstallState = "idle" | "downloading";

const UPDATE_TOAST_ID = "eko-update";
const INSTALL_TOAST_ID = "eko-update-install";

export function UpdatePrompt() {
  const [cachedUpdate, setCachedUpdate] = useState<CachedUpdate | null>(null);
  const [liveUpdate, setLiveUpdate] = useState<Update | null>(null);
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [installState, setInstallState] = useState<InstallState>("idle");
  const checkStarted = useRef(false);
  const platformName = getDesktopPlatformName();

  const installUpdate = useCallback(async (update: Update): Promise<void> => {
    setInstallState("downloading");
    toast.loading("Installing Eko update", {
      id: INSTALL_TOAST_ID,
      description: "Downloading the update in the background.",
      duration: Infinity,
    });

    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          toast.loading("Installing Eko update", {
            id: INSTALL_TOAST_ID,
            description: "Starting download.",
            duration: Infinity,
          });
          return;
        }

        if (event.event === "Progress") {
          return;
        }

        toast.loading("Installing Eko update", {
          id: INSTALL_TOAST_ID,
          description: "Installing the update.",
          duration: Infinity,
        });
      });
      await clearCachedUpdate();
      toast.success("Eko is updated", {
        id: INSTALL_TOAST_ID,
        description: "Restarting Eko now.",
        duration: 2500,
      });
      await relaunch();
    } catch (error) {
      void logError("Update install failed", error);
      toast.error("Update could not be installed", {
        id: INSTALL_TOAST_ID,
        description: "The update was not installed. You can try again.",
        action: {
          label: "Retry",
          onClick: () => void installUpdate(update),
        },
        duration: 8000,
      });
    } finally {
      setInstallState("idle");
    }
  }, []);

  const refreshUpdate = useCallback(
    async (showFeedback: boolean): Promise<void> => {
      setCheckState("checking");
      if (showFeedback) {
        toast.loading("Checking for updates", {
          id: UPDATE_TOAST_ID,
          description: `Checking for a newer ${platformName} build.`,
          duration: Infinity,
        });
      }

      try {
        const nextUpdate = await checkForDesktopUpdate();
        if (!nextUpdate) {
          setLiveUpdate(null);
          setCachedUpdate(null);
          await clearCachedUpdate();
          if (showFeedback) {
            toast.info(`No new updates for ${platformName}`, {
              id: UPDATE_TOAST_ID,
              description: "You are using the newest available build for this platform.",
              duration: 4500,
            });
          }
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
        toast.success(`Eko ${nextUpdate.version} is available`, {
          id: UPDATE_TOAST_ID,
          description: `A newer ${platformName} build is ready to install.`,
          action: {
            label: "Install",
            onClick: () => void installUpdate(nextUpdate),
          },
          duration: Infinity,
        });
      } catch (error) {
        void logError("Update check failed", error);
        if (showFeedback) {
          toast.error("Could not check for updates", {
            id: UPDATE_TOAST_ID,
            description: getUpdateCheckErrorMessage(error),
            action: {
              label: "Try again",
              onClick: () => void refreshUpdate(true),
            },
            duration: 8000,
          });
        }
      } finally {
        setCheckState("idle");
      }
    },
    [installUpdate, platformName],
  );

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

  function checkForUpdates(): void {
    if (checkState === "checking" || installState === "downloading") {
      return;
    }

    void refreshUpdate(true);
  }

  const activeUpdate = liveUpdate ?? cachedUpdate;
  const hasUpdate = activeUpdate !== null;
  const isChecking = checkState === "checking";
  const isInstalling = installState === "downloading";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={checkForUpdates}
          disabled={isChecking || isInstalling}
          className={cn(
            "inline-flex items-center justify-center rounded-md p-2 transition-colors disabled:cursor-wait",
            hasUpdate
              ? "bg-amber-300 text-amber-950 shadow-sm hover:bg-amber-200"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          aria-label={hasUpdate ? "Update available" : "Check for updates"}
        >
          {isChecking ? <RefreshCw className="size-5 animate-spin" /> : <Download className="size-5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{hasUpdate ? `Update to ${activeUpdate.version}` : "Check for updates"}</p>
      </TooltipContent>
    </Tooltip>
  );
}
