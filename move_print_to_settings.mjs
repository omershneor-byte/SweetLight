import { readFileSync, writeFileSync } from 'fs';

const FILE = 'C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx';
let code = readFileSync(FILE, 'utf8');

// ── 1. Remove print tab from toolTabs ──
const oldTabs = `["print","\ud83d\udda8\ufe0f \u05d4\u05d3\u05e4\u05e1\u05d4"]`;
if (!code.includes(oldTabs)) { console.log('ERROR: print toolTab not found'); process.exit(1); }
code = code.replace(`,${oldTabs}`, '');
console.log('1. Removed print from toolTabs');

// ── 2. Remove print tab UI block from sidebar (line-based) ──
let lines = code.split('\n');
const printTabStart = lines.findIndex(l => l.includes('PRINT TAB'));
if (printTabStart === -1) { console.log('ERROR: PRINT TAB comment not found'); process.exit(1); }
// Find closing </div>} at same indent (12 spaces)
let printTabEnd = printTabStart;
for (let i = printTabStart + 1; i < lines.length; i++) {
  if (lines[i].match(/^            <\/div>\}$/) || lines[i] === `            </div>}`) {
    printTabEnd = i;
    break;
  }
}
if (printTabEnd === printTabStart) { console.log('ERROR: print tab end not found'); process.exit(1); }
// Remove the block + trailing empty line
const removeCount = (printTabEnd - printTabStart + 1) + (lines[printTabEnd + 1] === '' ? 1 : 0);
lines.splice(printTabStart, removeCount);
code = lines.join('\n');
console.log(`2. Removed sidebar print tab UI (${removeCount} lines from line ${printTabStart + 1})`);

// ── 3. Add "הדפסה" tab to settings modal tabs array ──
const oldSettingsTabs = `[["watermark","\u270d\ufe0f \u05d7\u05d5\u05ea\u05de\u05ea"],["main","\ud83d\uddf4\ufe0f \u05de\u05e1\u05da \u05e8\u05d0\u05e9\u05d9"]]`;
const newSettingsTabs = `[["watermark","\u270d\ufe0f \u05d7\u05d5\u05ea\u05de\u05ea"],["main","\ud83d\uddf4\ufe0f \u05de\u05e1\u05da \u05e8\u05d0\u05e9\u05d9"],["print","\ud83d\udda8\ufe0f \u05d4\u05d3\u05e4\u05e1\u05d4"]]`;
if (!code.includes(oldSettingsTabs)) { console.log('ERROR: settings tabs array not found'); process.exit(1); }
code = code.replace(oldSettingsTabs, newSettingsTabs);
console.log('3. Added print tab to settings modal');

// ── 4. Add print tab content before the save/cancel buttons ──
const saveBtnMarker = `            <div style={{ display:"flex",gap:10,marginTop:isMobile?20:18,flexDirection:isMobile?"column-reverse":"row" }}>`;
const printTabContent = `            {settingsTab==="print" && <>
              {/* DPI */}
              <div style={{ marginBottom:isMobile?16:14 }}>
                <div style={{ fontSize:isMobile?12:11, fontWeight:700, color:"#9CA3AF", marginBottom:8, textTransform:"uppercase", letterSpacing:"0.04em" }}>\u05e8\u05d6\u05d5\u05dc\u05d5\u05e6\u05d9\u05d4 (DPI)</div>
                <div style={{ display:"flex", gap:6 }}>
                  {[[150,"150"],[300,"300 \u2605"],[600,"600"]].map(([val,label]) => (
                    <button key={val} onClick={() => setPrintDpi(val)} style={{ flex:1, border:"none", borderRadius:10, padding:isMobile?"11px 0":"8px 0", cursor:"pointer", fontSize:isMobile?13:12, fontWeight:800, fontFamily:"'Inter','Heebo',sans-serif", background:printDpi===val?"rgba(139,61,255,0.14)":"rgba(15,23,42,0.05)", color:printDpi===val?"#6D28D9":"#475569", boxShadow:printDpi===val?"inset 0 0 0 1px rgba(139,61,255,0.18)":"inset 0 0 0 1px rgba(226,232,240,0.9)" }}>{label}</button>
                  ))}
                </div>
                {printDpi===300 && <div style={{ fontSize:10, color:"#9CA3AF", marginTop:5 }}>\u05de\u05d5\u05de\u05dc\u05e5 \u05dc\u05e8\u05d5\u05d1 \u05d4\u05e9\u05d9\u05de\u05d5\u05e9\u05d9\u05dd</div>}
              </div>
              {/* Size adjustment per mode */}
              {[["portrait","\u05d0\u05d5\u05e8\u05da"],["landscape","\u05e8\u05d5\u05d7\u05d1"]].map(([m,mLabel]) => (
                <div key={m} style={{ marginBottom:isMobile?16:14 }}>
                  <div style={{ fontSize:isMobile?12:11, fontWeight:700, color:"#9CA3AF", marginBottom:10, textTransform:"uppercase", letterSpacing:"0.04em" }}>{mLabel} \u2014 \u05db\u05d9\u05d5\u05d5\u05df \u05d2\u05d5\u05d3\u05dc</div>
                  {[["\u05e8\u05d5\u05d7\u05d1","w"],["\u05d2\u05d5\u05d1\u05d4","h"]].map(([axisLabel,axis]) => (
                    <div key={axis} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                        <span style={{ fontSize:isMobile?12:11, color:"#374151" }}>{axisLabel}</span>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <input
                            type="number" min={-10} max={10} step={1}
                            value={Math.round(printSizeAdj[m][axis]*10)}
                            onChange={e => { const mm=Math.max(-10,Math.min(10,parseInt(e.target.value)||0)); setPrintSizeAdj(prev=>({...prev,[m]:{...prev[m],[axis]:mm/10}})); }}
                            style={{ width:46, textAlign:"center", border:"1px solid #E5E7EB", borderRadius:6, padding:"3px 0", fontSize:11, fontFamily:"'Inter','Heebo',sans-serif", color:"#374151" }}
                          />
                          <span style={{ fontSize:10, color:"#9CA3AF" }}>\u05de"\u05de</span>
                          <span style={{ fontSize:10, color:"#D1D5DB" }}>|</span>
                          <span style={{ fontSize:10, color:"#9CA3AF", minWidth:40, textAlign:"left", fontVariantNumeric:"tabular-nums" }}>{printSizeAdj[m][axis]>0?"+":""}{Math.round(printSizeAdj[m][axis]*printDpi/2.54)} px</span>
                        </div>
                      </div>
                      <input type="range" min={-10} max={10} step={1}
                        value={Math.round(printSizeAdj[m][axis]*10)}
                        onChange={e => setPrintSizeAdj(prev=>({...prev,[m]:{...prev[m],[axis]:parseInt(e.target.value)/10}}))}
                        style={{ width:"100%", accentColor:"#8B3DFF", cursor:"pointer" }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </>}
            ${saveBtnMarker.trimStart()}`;

if (!code.includes(saveBtnMarker)) { console.log('ERROR: save button marker not found'); process.exit(1); }
code = code.replace(saveBtnMarker, printTabContent);
console.log('4. Print tab content added to settings modal');

writeFileSync(FILE, code);
console.log('Done! Saved.');
