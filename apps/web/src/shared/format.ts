const clean = (value: number) => (Number.isFinite(value) ? value : 0);

const settle = (value: number, digits: number) =>
  Math.abs(clean(value)) < 0.5 * 10 ** -digits ? 0 : clean(value);

export const fixed = (value: number, digits = 1) => settle(value, digits).toFixed(digits);

export const signed = (value: number, digits = 1) => {
  const settled = settle(value, digits);
  const text = Math.abs(settled).toFixed(digits);

  return settled < 0 ? `−${text}` : `+${text}`;
};

export const clock = (seconds: number) => {
  const total = Math.max(0, clean(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total - minutes * 60;

  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
};

export const percent = (fraction: number, digits = 0) =>
  `${(clean(fraction) * 100).toFixed(digits)}%`;

export const delta = (value: number, baseline: number, digits = 1) =>
  signed(value - baseline, digits);

export const stamp = (seconds: number) => {
  const total = Math.max(0, clean(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total - hours * 3600) / 60);
  const rest = total - hours * 3600 - minutes * 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${rest.toFixed(3).padStart(6, "0")}`;
};
