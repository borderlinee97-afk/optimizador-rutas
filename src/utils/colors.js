// src/utils/colors.js
export function createRegionColorer(palette = [
  '#1E88E5','#43A047','#8E24AA','#F4511E','#3949AB',
  '#00897B','#6D4C41','#FDD835','#5E35B1','#00ACC1',
  '#EF5350','#7CB342','#FF7043','#5C6BC0','#26A69A'
]) {
  const colorByRegion = /** @type {Record<string,string>} */({});
  function getColorForRegion(region) {
    if (!region) return '#111827';
    if (!colorByRegion[region]) {
      const used = Object.keys(colorByRegion).length;
      colorByRegion[region] = palette[used % palette.length];
    }
    return colorByRegion[region];
  }
  function reset() {
    for (const k of Object.keys(colorByRegion)) delete colorByRegion[k];
  }
  return { colorByRegion, getColorForRegion, reset };
}