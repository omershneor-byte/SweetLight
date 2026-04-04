import { readFileSync, writeFileSync } from 'fs';

const FILE = 'C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx';
let code = readFileSync(FILE, 'utf8');

// ── 1. Add printDpi + printSizeAdj state ──
const oldState = `  const [exportBusy, setExportBusy] = useState(false);`;
const newState = `  const [exportBusy, setExportBusy] = useState(false);
  const [printDpi, setPrintDpi] = useState(300);
  const [printSizeAdj, setPrintSizeAdj] = useState({ landscape: { w: 0, h: 0 }, portrait: { w: 0, h: 0 } });`;
if (!code.includes(oldState)) { console.log('ERROR: exportBusy state not found'); process.exit(1); }
code = code.replace(oldState, newState);
console.log('1. State added');

// ── 2. Add stretchExportImage helper before runExportDownload ──
const oldDownloadFn = `  const runExportDownload = useCallback(async () => {`;
const stretchFn = `  function stretchExportImage(dataUrl, targetW, targetH) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(targetW));
        c.height = Math.max(1, Math.round(targetH));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      };
      img.src = dataUrl;
    });
  }
  const runExportDownload = useCallback(async () => {`;
if (!code.includes(oldDownloadFn)) { console.log('ERROR: runExportDownload not found'); process.exit(1); }
code = code.replace(oldDownloadFn, stretchFn);
console.log('2. stretchExportImage added');

// ── 3. Update download: multiplier + size adjustment ──
const oldDlBlock = `          multiplier: 2,
        });
        const a = document.createElement("a");
        a.href = finalUrl;
        a.download = \`\${baseName}-\${modeKey}-\${Date.now()}.png\`;`;
const newDlBlock = `          multiplier: printDpi / 150,
        });
        const _adj = printSizeAdj[modeKey] || { w: 0, h: 0 };
        const _dpiPerCm = printDpi / 2.54;
        const _baseW = DIMS[modeKey].w * (printDpi / 150);
        const _baseH = DIMS[modeKey].h * (printDpi / 150);
        const _adjW = _baseW + _adj.w * _dpiPerCm;
        const _adjH = _baseH + _adj.h * _dpiPerCm;
        const downloadUrl = (_adj.w !== 0 || _adj.h !== 0)
          ? await stretchExportImage(finalUrl, _adjW, _adjH) : finalUrl;
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = \`\${baseName}-\${modeKey}-\${Date.now()}.png\`;`;
if (!code.includes(oldDlBlock)) { console.log('ERROR: download multiplier block not found'); process.exit(1); }
code = code.replace(oldDlBlock, newDlBlock);
console.log('3. Download multiplier + size adjustment updated');

// ── 4. Update preview multiplier ──
const oldPrevBlock = `              multiplier: 2,
            });
            return [modeKey, previewUrl];`;
const newPrevBlock = `              multiplier: printDpi / 150,
            });
            return [modeKey, previewUrl];`;
if (!code.includes(oldPrevBlock)) { console.log('ERROR: preview multiplier block not found'); process.exit(1); }
code = code.replace(oldPrevBlock, newPrevBlock);
console.log('4. Preview multiplier updated');

// ── 5. Add print tab to toolTabs ──
const oldTabs = `    : [["text","\u270f\ufe0f \u05d8\u05e7\u05e1\u05d8"],["elements","\ud83c\udfa8 \u05d0\u05dc\u05de\u05e0\u05d8\u05d9\u05dd"],["bg","\u05e2\u05d9\u05e6\u05d5\u05d1"]];`;
const newTabs = `    : [["text","\u270f\ufe0f \u05d8\u05e7\u05e1\u05d8"],["elements","\ud83c\udfa8 \u05d0\u05dc\u05de\u05e0\u05d8\u05d9\u05dd"],["bg","\u05e2\u05d9\u05e6\u05d5\u05d1"],["print","\ud83d\udda8\ufe0f \u05d4\u05d3\u05e4\u05e1\u05d4"]];`;
if (!code.includes(oldTabs)) { console.log('ERROR: toolTabs desktop not found'); process.exit(1); }
code = code.replace(oldTabs, newTabs);
console.log('5. toolTabs updated');

// ── 6. Insert print tab UI before the DESIGN TAB comment ──
const lines = code.split('\n');
const designTabIdx = lines.findIndex(l => l.includes('DESIGN TAB'));
if (designTabIdx === -1) { console.log('ERROR: DESIGN TAB comment not found'); process.exit(1); }
console.log('Design tab found at line (1-indexed):', designTabIdx + 1);

const printTabLines = [
  `            {/* \u2500\u2500 PRINT TAB \u2500\u2500 */}`,
  `            {tab==="\u05d4\u05d3\u05e4\u05e1\u05d4" && false}{/* placeholder */}`,
  `            {tab==="print" && <div style={{ padding:"16px 12px", display:"flex", flexDirection:"column", gap:20 }}>`,
  `              <div>`,
  `                <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.04em" }}>\u05e8\u05d6\u05d5\u05dc\u05d5\u05e6\u05d9\u05d4</div>`,
  `                <div style={{ display:"flex", gap:6 }}>`,
  `                  {[[150,"150"],[300,"300 \u2605"],[600,"600"]].map(([val,label]) => (`,
  `                    <button key={val} onClick={() => setPrintDpi(val)} style={{ flex:1, border:"none", borderRadius:10, padding:"7px 0", cursor:"pointer", fontSize:11, fontWeight:800, fontFamily:"'Inter','Heebo',sans-serif", background:printDpi===val?"rgba(139,61,255,0.14)":"rgba(15,23,42,0.05)", color:printDpi===val?"#6D28D9":"#475569", boxShadow:printDpi===val?"inset 0 0 0 1px rgba(139,61,255,0.18)":"inset 0 0 0 1px rgba(226,232,240,0.9)" }}>{label}</button>`,
  `                  ))}`,
  `                </div>`,
  `                <div style={{ fontSize:10, color:"#9CA3AF", marginTop:5 }}>DPI{printDpi===300?" \u2014 \u05de\u05d5\u05de\u05dc\u05e5":""}</div>`,
  `              </div>`,
  `              {["portrait","landscape"].map(m => (`,
  `                <div key={m} style={{ borderTop:"1px solid #F3F4F6", paddingTop:14 }}>`,
  `                  <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>{m==="portrait"?"\u05d0\u05d5\u05e8\u05da":"\u05e8\u05d5\u05d7\u05d1"} \u2014 \u05db\u05d9\u05d5\u05d5\u05df \u05d2\u05d5\u05d3\u05dc</div>`,
  `                  {[["w","\u05e8\u05d5\u05d7\u05d1"],["h","\u05d2\u05d5\u05d1\u05d4"]].map(([axis,axisLabel]) => (`,
  `                    <div key={axis} style={{ marginBottom:10 }}>`,
  `                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#6B7280", marginBottom:3 }}>`,
  `                        <span>{axisLabel}</span>`,
  `                        <span style={{ fontVariantNumeric:"tabular-nums" }}>{printSizeAdj[m][axis]>0?"+":""}{printSizeAdj[m][axis].toFixed(1)} \u05e1"\u05de</span>`,
  `                      </div>`,
  `                      <input type="range" min={-10} max={10} step={1} value={Math.round(printSizeAdj[m][axis]*10)} onChange={e => setPrintSizeAdj(prev => ({...prev, [m]:{...prev[m],[axis]:parseInt(e.target.value)/10}}))} style={{ width:"100%", accentColor:"#8B3DFF", cursor:"pointer" }} />`,
  `                    </div>`,
  `                  ))}`,
  `                </div>`,
  `              ))}`,
  `            </div>}`,
  ``,
];

// Remove the placeholder line (index 1)
printTabLines.splice(1, 1);

lines.splice(designTabIdx, 0, ...printTabLines);
console.log('6. Print tab UI inserted before design tab');

writeFileSync(FILE, lines.join('\n'));
console.log('Done! Saved.');
