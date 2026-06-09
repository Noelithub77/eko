export function syncDeviceTheme(): () => void {
  if (!window.matchMedia) {
    return () => undefined;
  }

  const query = window.matchMedia("(prefers-color-scheme: dark)");

  const syncTheme = () => {
    document.documentElement.classList.toggle("dark", query.matches);
    document.documentElement.style.colorScheme = query.matches ? "dark" : "light";
  };

  syncTheme();

  if (query.addEventListener) {
    query.addEventListener("change", syncTheme);
    return () => query.removeEventListener("change", syncTheme);
  }

  query.addListener(syncTheme);
  return () => query.removeListener(syncTheme);
}
