type LatencySample = {
  label: string;
  valueMs: number;
};

const samples: LatencySample[] = [
  { label: "setup", valueMs: 0 },
  { label: "transport", valueMs: 0 },
];

const failedSample = samples.find((sample) => sample.valueMs > 100);

if (failedSample) {
  throw new Error(`${failedSample.label} latency exceeded 100 ms`);
}

console.log("latency regression placeholder passed");
