import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', 'utf8');
const lines = code.split('\n');

// Lines 10391-10434 (0-indexed: 10390-10433) contain the broken header.
// Replace them with one clean block.

const startLine = 10390; // 0-indexed, "            <div style={{ display:"flex", justifyContent:"flex-end"..."
const endLine = 10433;   // 0-indexed, closing </div> of בחר הכל row

// Verify
console.log('Start line content:', lines[startLine]);
console.log('End line content:', lines[endLine]);

const newBlock = [
  `            <div style={{ flex:"0 0 auto", marginBottom:isMobile?14:16 }}>`,
  `              <div style={{ position:"relative", textAlign:"center", marginBottom:isMobile?10:10 }}>`,
  `                <button`,
  `                  onClick={()=>setExportM(false)}`,
  `                  style={{ position:"absolute", left:0, top:0, border:"none", background:"rgba(15,23,42,0.06)", color:"#4B5563", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}`,
  `                  title="סגור"`,
  `                >`,
  `                  ×`,
  `                </button>`,
  `                <h3 style={{ margin:0, fontFamily:"'Inter','Heebo',sans-serif", color:"#111827", fontWeight:800, fontSize:isMobile?20:21 }}>תצוגה מקדימה לפני הורדה</h3>`,
  `                <p style={{ margin:"3px 0 0", color:"#6B7280", fontSize:isMobile?12:11, lineHeight:1.5 }}>`,
  `                  PNG שקוף ומותאם להדפסה — אפשרות לקו חיתוך`,
  `                </p>`,
  `              </div>`,
  `              <div style={{ display:"flex", justifyContent:"flex-start" }}>`,
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
console.log('Replaced lines', startLine, '-', endLine, 'with', newBlock.length, 'lines');

writeFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', lines.join('\n'));
console.log('Saved.');
