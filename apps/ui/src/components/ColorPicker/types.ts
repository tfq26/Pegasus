import type { HexColor, HslaColor, HsvaColor, RgbaColor } from "@uiw/color-convert";

export interface ColorPickerValue {
  hex: `#${string}`;
  hsl: HslaColor;
  hsla: HslaColor;
  rgb: RgbaColor;
  rgba: RgbaColor;
}

export interface ColorPickerProps {
  value?: `#${string}` | HsvaColor | HslaColor | RgbaColor;
  type?: "hsl" | "hsla" | "rgb" | "rgba" | "hex";
  swatches?: HexColor[];
  hideContrastRatio?: boolean;
  hideDefaultSwatches?: boolean;
  class?: string;
  open?: boolean;
  inline?: boolean;
}
