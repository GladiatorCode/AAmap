// A pin is a named marker stored as a percentage of the map size.
// Percentages (0–100) keep pins in the same place when the window is resized.
export type Pin = {
  id: string;
  name: string;
  xPercent: number;
  yPercent: number;
};
