import { Bug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/components/ui/card";
import { Switch } from "@shared/components/ui/switch";

type SettingsPanelProps = {
  devMode: boolean;
  onDevModeChange: (enabled: boolean) => void;
};

export function SettingsPanel({ devMode, onDevModeChange }: SettingsPanelProps) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle>Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between rounded-md border bg-background p-3">
          <div className="flex items-center gap-2">
            <Bug className="size-4 text-muted-foreground" />
            <span className="font-medium">Dev mode</span>
          </div>
          <Switch checked={devMode} onCheckedChange={onDevModeChange} />
        </div>
      </CardContent>
    </Card>
  );
}
