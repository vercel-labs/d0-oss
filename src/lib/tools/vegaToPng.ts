import * as vega from "vega";
import * as vegaLite from "vega-lite";
import { Resvg } from "@resvg/resvg-js";
import { join } from "path";

export async function vegaLiteToPng(spec: any): Promise<Buffer> {
  // First generate SVG
  const svg = await vegaLiteToSvg(spec);

  const fontPath = join(process.cwd(), "public/fonts/Inter.ttf");

  // Convert SVG to PNG using resvg with embedded font
  const resvg = new Resvg(svg, {
    fitTo: {
      mode: "width",
      value: 800,
    },
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}

export async function vegaLiteToSvg(spec: any): Promise<string> {
  const vgSpec = vegaLite.compile(spec).spec;
  const view = new vega.View(vega.parse(vgSpec), { renderer: "none" });
  return await view.toSVG();
}
