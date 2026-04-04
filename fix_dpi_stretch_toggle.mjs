import { readFileSync, writeFileSync } from 'fs';

const FILE = 'C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx';
let code = readFileSync(FILE, 'utf8');

// ── 1. Add printSizeAdjUnit state ──
const oldAdj = `  const [printSizeAdj, setPrintSizeAdj] = useState({ landscape: { w: 0, h: 0 }, portrait: { w: 0, h: 0 } });`;
const newAdj = `  const [printSizeAdj, setPrintSizeAdj] = useState({ landscape: { w: 0, h: 0 }, portrait: { w: 0, h: 0 } });
  const [printSizeAdjUnit, setPrintSizeAdjUnit] = useState('mm');`;
if (!code.includes(oldAdj)) { console.log('ERROR 1: printSizeAdj state not found'); process.exit(1); }
code = code.replace(oldAdj, newAdj);
console.log('1. printSizeAdjUnit state added');

// ── 2. Inject crc32ForPng + injectPngDpi before stretchExportImage ──
const oldStretch = `  function stretchExportImage(dataUrl, targetW, targetH) {`;
const pngHelpers = `  function crc32ForPng(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) { crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1); }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function injectPngDpi(dataUrl, dpi) {
    try {
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const ppm = Math.round(dpi * 39.3701);
      const phys = new Uint8Array(21);
      phys[0]=0; phys[1]=0; phys[2]=0; phys[3]=9;
      phys[4]=0x70; phys[5]=0x48; phys[6]=0x59; phys[7]=0x73;
      phys[8]=(ppm>>24)&0xFF; phys[9]=(ppm>>16)&0xFF; phys[10]=(ppm>>8)&0xFF; phys[11]=ppm&0xFF;
      phys[12]=(ppm>>24)&0xFF; phys[13]=(ppm>>16)&0xFF; phys[14]=(ppm>>8)&0xFF; phys[15]=ppm&0xFF;
      phys[16]=1;
      const crc = crc32ForPng(phys.slice(4, 17));
      phys[17]=(crc>>24)&0xFF; phys[18]=(crc>>16)&0xFF; phys[19]=(crc>>8)&0xFF; phys[20]=crc&0xFF;
      const result = new Uint8Array(bytes.length + 21);
      result.set(bytes.slice(0, 33)); result.set(phys, 33); result.set(bytes.slice(33), 54);
      let str = ''; result.forEach(b => str += String.fromCharCode(b));
      return 'data:image/png;base64,' + btoa(str);
    } catch(e) { console.warn('pHYs inject failed:', e); return dataUrl; }
  }
  function stretchExportImage(dataUrl, targetW, targetH) {`;
if (!code.includes(oldStretch)) { console.log('ERROR 2: stretchExportImage not found'); process.exit(1); }
code = code.replace(oldStretch, pngHelpers);
console.log('2. crc32ForPng + injectPngDpi added');

// ── 3. Fix download function: base multiplier + stretch + pHYs ──
const oldDl = `        const exportPixelSize = getExportPixelSize(modeKey, printDpi, printSizeAdj);
        const finalUrl = await renderModeStateToExportDataUrl({
          modeKey,
          state: exportState,
          frameStyle,
          cutLineType: exportCutLineType,
          cutLineWidth: exportCutLineWidth,
          cutLineTone: exportCutLineTone,
          watermarkConfig: getExportWatermarkConfig(),
          placeholderConfig: ph,
          multiplier: exportPixelSize.width / DIMS[modeKey].w,
        });
        const a = document.createElement("a");
        a.href = finalUrl;`;
const newDl = `        const exportPixelSize = getExportPixelSize(modeKey, printDpi, printSizeAdj);
        const _basePx = getExportPixelSize(modeKey, printDpi, null);
        const _rawDlUrl = await renderModeStateToExportDataUrl({
          modeKey,
          state: exportState,
          frameStyle,
          cutLineType: exportCutLineType,
          cutLineWidth: exportCutLineWidth,
          cutLineTone: exportCutLineTone,
          watermarkConfig: getExportWatermarkConfig(),
          placeholderConfig: ph,
          multiplier: _basePx.width / DIMS[modeKey].w,
        });
        const _stretchedDlUrl = await stretchExportImage(_rawDlUrl, exportPixelSize.width, exportPixelSize.height);
        const finalUrl = injectPngDpi(_stretchedDlUrl, printDpi);
        const a = document.createElement("a");
        a.href = finalUrl;`;
if (!code.includes(oldDl)) { console.log('ERROR 3: download pattern not found'); process.exit(1); }
code = code.replace(oldDl, newDl);
console.log('3. Download: base multiplier + stretchExportImage + injectPngDpi');

// ── 4. Fix preview generation: base multiplier + stretch ──
const oldPrev = `            const exportPixelSize = getExportPixelSize(modeKey, printDpi, printSizeAdj);
            const previewUrl = await renderModeStateToExportDataUrl({
              modeKey,
              state: exportState,
              frameStyle,
              cutLineType: exportCutLineType,
              cutLineWidth: exportCutLineWidth,
              cutLineTone: exportCutLineTone,
              watermarkConfig: getExportWatermarkConfig(),
              placeholderConfig: ph,
              multiplier: exportPixelSize.width / DIMS[modeKey].w,
            });
            return [modeKey, previewUrl];`;
const newPrev = `            const exportPixelSize = getExportPixelSize(modeKey, printDpi, printSizeAdj);
            const _basePrevPx = getExportPixelSize(modeKey, printDpi, null);
            const _rawPrevUrl = await renderModeStateToExportDataUrl({
              modeKey,
              state: exportState,
              frameStyle,
              cutLineType: exportCutLineType,
              cutLineWidth: exportCutLineWidth,
              cutLineTone: exportCutLineTone,
              watermarkConfig: getExportWatermarkConfig(),
              placeholderConfig: ph,
              multiplier: _basePrevPx.width / DIMS[modeKey].w,
            });
            const previewUrl = await stretchExportImage(_rawPrevUrl, exportPixelSize.width, exportPixelSize.height);
            return [modeKey, previewUrl];`;
if (!code.includes(oldPrev)) { console.log('ERROR 4: preview pattern not found'); process.exit(1); }
code = code.replace(oldPrev, newPrev);
console.log('4. Preview: base multiplier + stretchExportImage');

// ── 5. Remove dead PRINT TAB sidebar block (line-based) ──
let lines = code.split('\n');
const ptStart = lines.findIndex(l => l.includes('/* \u2500\u2500 PRINT TAB \u2500\u2500 */'));
if (ptStart === -1) { console.log('ERROR 5: PRINT TAB dead code not found'); process.exit(1); }
let ptEnd = ptStart;
for (let i = ptStart + 1; i < lines.length; i++) {
  if (lines[i].trim() === '</div>}') { ptEnd = i; break; }
}
if (ptEnd === ptStart) { console.log('ERROR 5: PRINT TAB end not found'); process.exit(1); }
const trailingEmpty = lines[ptEnd + 1] === '' ? 1 : 0;
lines.splice(ptStart, ptEnd - ptStart + 1 + trailingEmpty);
code = lines.join('\n');
console.log(`5. Dead PRINT TAB removed (${ptEnd - ptStart + 1 + trailingEmpty} lines)`);

// ── 6. Update print settings UI: add mm/px toggle ──
const oldInput = `                          <input
                            type="number" min={-10} max={10} step={1}
                            value={Math.round(printSizeAdj[m][axis]*10)}
                            onChange={e => { const mm=Math.max(-10,Math.min(10,parseInt(e.target.value)||0)); setPrintSizeAdj(prev=>({...prev,[m]:{...prev[m],[axis]:mm/10}})); }}
                            style={{ width:46, textAlign:"center", border:"1px solid #E5E7EB", borderRadius:6, padding:"3px 0", fontSize:11, fontFamily:"'Inter','Heebo',sans-serif", color:"#374151" }}
                          />
                          <span style={{ fontSize:10, color:"#9CA3AF" }}>\u05de&quot;\u05de</span>
                          <span style={{ fontSize:10, color:"#D1D5DB" }}>|</span>
                          <span style={{ fontSize:10, color:"#9CA3AF", minWidth:42, fontVariantNumeric:"tabular-nums" }}>{printSizeAdj[m][axis]>0?"+":""}{Math.round(printSizeAdj[m][axis]*printDpi/2.54)} px</span>`;
const newInput = `                          <input
                            type="number"
                            min={printSizeAdjUnit==='mm' ? -10 : -Math.round(printDpi/2.54)}
                            max={printSizeAdjUnit==='mm' ? 10 : Math.round(printDpi/2.54)}
                            step={1}
                            value={printSizeAdjUnit==='mm' ? Math.round(printSizeAdj[m][axis]*10) : Math.round(printSizeAdj[m][axis]*printDpi/2.54)}
                            onChange={e => {
                              const val = parseInt(e.target.value)||0;
                              const cm = printSizeAdjUnit==='mm' ? Math.max(-1,Math.min(1,val/10)) : Math.max(-1,Math.min(1,val*2.54/printDpi));
                              setPrintSizeAdj(prev=>({...prev,[m]:{...prev[m],[axis]:cm}}));
                            }}
                            style={{ width:52, textAlign:"center", border:"1px solid #E5E7EB", borderRadius:6, padding:"3px 0", fontSize:11, fontFamily:"'Inter','Heebo',sans-serif", color:"#374151" }}
                          />
                          <button onClick={()=>setPrintSizeAdjUnit(u=>u==='mm'?'px':'mm')} style={{ fontSize:10, padding:"2px 5px", border:"1px solid rgba(139,61,255,0.25)", borderRadius:4, cursor:"pointer", background:"rgba(139,61,255,0.06)", color:"#6D28D9", fontFamily:"'Inter','Heebo',sans-serif", fontWeight:700, lineHeight:1.2, flexShrink:0 }}>{printSizeAdjUnit}</button>
                          <span style={{ fontSize:10, color:"#D1D5DB" }}>|</span>
                          <span style={{ fontSize:10, color:"#9CA3AF", minWidth:42, fontVariantNumeric:"tabular-nums" }}>{printSizeAdjUnit==='mm' ? \`\${printSizeAdj[m][axis]>0?"+":""}\${Math.round(printSizeAdj[m][axis]*printDpi/2.54)} px\` : \`\${printSizeAdj[m][axis]>0?"+":""}\${(printSizeAdj[m][axis]*10).toFixed(1)} \u05de"\u05de\`}</span>`;
if (!code.includes(oldInput)) { console.log('ERROR 6: input pattern not found'); process.exit(1); }
code = code.replace(oldInput, newInput);
console.log('6. mm/px toggle added to print settings UI');

writeFileSync(FILE, code);
console.log('\nAll done! Saved.');
