export function syncDeviceTheme(): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");

  const syncTheme = () => {
    document.documentElement.classList.toggle("dark", query.matches);
    document.documentElement.style.colorScheme = query.matches ? "dark" : "light";
  };

  syncTheme();
  query.addEventListener("change", syncTheme);

  return () => query.removeEventListener("change", syncTheme);
}
