import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', 'utf8');
const lines = code.split('\n');

// Lines 10391-10433 (0-indexed: 10390-10432) = the entire header block
// Replace with: X left | title centered | בחר הכל right — all one row
// Then description centered below

const startLine = 10390; // "            <div style={{ flex:"0 0 auto", marginBottom..."
const endLine = 10432;   // "            </div>"

console.log('Start:', lines[startLine]);
console.log('End:', lines[endLine]);

const newBlock = [
  `            <div style={{ flex:"0 0 auto", marginBottom:isMobile?22:26 }}>`,
  `              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>`,
  `                <button`,
  `                  onClick={()=>setExportM(false)}`,
  `                  style={{ border:"none", background:"rgba(15,23,42,0.06)", color:"#4B5563", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}`,
  `                  title="סגור"`,
  `                >`,
  `                  ×`,
  `                </button>`,
  `                <div style={{ flex:1, textAlign:"center" }}>`,
  `                  <h3 style={{ margin:0, fontFamily:"'Inter','Heebo',sans-serif", color:"#111827", fontWeight:800, fontSize:isMobile?20:21 }}>תצוגה מקדימה לפני הורדה</h3>`,
  `                  <p style={{ margin:"3px 0 0", color:"#6B7280", fontSize:isMobile?12:11, lineHeight:1.5 }}>`,
  `                    PNG שקוף ומותאם להדפסה — אפשרות לקו חיתוך`,
  `                  </p>`,
  `                </div>`,
  `                <button`,
  `                  onClick={() => setExportSelection({`,
  `                    landscape: !exportAllSelected,`,
  `                    portrait: !exportAllSelected,`,
  `                  })}`,
  `                  style={{`,
  `                    border:"none",`,
  `                    background:exportAllSelected ? "rgba(139,61,255,0.12)" : "rgba(15,23,42,0.06)",`,
  `                    color:exportAllSelected ? "#6D28D9" : "#475569",`,
  `                    padding:"5px 12px",`,
  `                    borderRadius:999,`,
  `                    cursor:"pointer",`,
  `                    fontFamily:"'Inter','Heebo',sans-serif",`,
  `                    fontWeight:800,`,
  `                    fontSize:11,`,
  `                    display:"inline-flex",`,
  `                    alignItems:"center",`,
  `                    gap:6,`,
  `                    flexShrink:0,`,
  `                    boxShadow:exportAllSelected ? "inset 0 0 0 1px rgba(139,61,255,0.18)" : "inset 0 0 0 1px rgba(226,232,240,0.95)",`,
  `                  }}`,
  `                >`,
  `                  <span style={{ width:13, height:13, borderRadius:3, display:"inline-flex", alignItems:"center", justifyContent:"center", background:exportAllSelected ? "#8B3DFF" : "#FFFFFF", color:"#FFFFFF", fontSize:9, boxShadow:"inset 0 0 0 1px rgba(148,163,184,0.45)" }}>`,
  `                    {exportAllSelected ? "✓" : ""}`,
  `                  </span>`,
  `                  בחר הכל`,
  `                </button>`,
  `              </div>`,
  `            </div>`,
];

lines.splice(startLine, endLine - startLine + 1, ...newBlock);
console.log('Header fixed');

// Fix alignItems for preview cards: "flex-end" → "center"
const rebuiltCode = lines.join('\n');
const fixed = rebuiltCode.replace(
  `alignItems:isMobile?undefined:"flex-end",`,
  `alignItems:isMobile?undefined:"center",`
);
if (fixed === rebuiltCode) { console.log('ERROR: alignItems not found'); process.exit(1); }
console.log('alignItems fixed: flex-end → center');

writeFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', fixed);
console.log('Saved.');
