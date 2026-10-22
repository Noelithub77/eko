let active: HTMLElement | undefined;

export function celebrate(origin: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  active?.remove();
  const box = origin.getBoundingClientRect();
  const visible = box.bottom > 0 && box.top < innerHeight;
  const burst = document.createElement("div");
  burst.className = "download-burst";
  burst.setAttribute("aria-hidden", "true");
  burst.style.left = `${visible ? box.left + box.width / 2 : innerWidth / 2}px`;
  burst.style.top = `${visible ? box.top + box.height / 2 : innerHeight * 0.65}px`;
  document.body.append(burst);
  active = burst;
  const animations: Animation[] = [];
  for (let index = 0; index < 48; index += 1) {
    const spark = document.createElement("i");
    const echo = index % 3 === 0;
    spark.className = echo ? "download-spark is-ring" : "download-spark";
    spark.style.color = index % 2 ? "var(--teal)" : "var(--coral)";
    burst.append(spark);
    const angle = index / 48 * Math.PI * 2 + Math.random() * 0.3;
    const distance = 65 + Math.random() * 130;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 45;
    animations.push(spark.animate([
      { transform: "translate(-50%, -50%) scale(0.3)", opacity: 0 },
      { opacity: 1, offset: 0.12 },
      { transform: `translate(${x}px, ${y}px) rotate(${index * 29}deg) scale(1)`, opacity: 0.9, offset: 0.6 },
      { transform: `translate(${x * 1.2}px, ${y + 85}px) rotate(${index * 43}deg) scale(0.25)`, opacity: 0 },
    ], { duration: 950 + Math.random() * 550, delay: echo ? 120 : 0, easing: "cubic-bezier(.16,1,.3,1)" }));
  }
  for (let index = 0; index < 2; index += 1) {
    const ring = document.createElement("i");
    ring.className = "download-echo";
    ring.style.color = index ? "var(--teal)" : "var(--coral)";
    burst.append(ring);
    animations.push(ring.animate([
      { transform: "translate(-50%, -50%) scale(0.1)", opacity: 0.7 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
    ], { duration: 1000, delay: index * 180, easing: "cubic-bezier(.16,1,.3,1)" }));
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
    burst.remove();
    if (active === burst) active = undefined;
  });
}
