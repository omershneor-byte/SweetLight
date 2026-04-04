import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', 'utf8');

// New structure:
// 1. X button only at very top (absolute)
// 2. Title + description centered — directly above preview cards
// 3. "בחר הכל" row (right-aligned)
// 4. Preview cards
// ...

// Remove old header (title+description) and put X button alone at top
const oldHeader = `            <div style={{ position:"relative", textAlign:"center", marginBottom:isMobile?14:16, paddingTop:isMobile?0:2 }}>
              <button
                onClick={()=>setExportM(false)}
                style={{ position:"absolute", left:0, top:0, border:"none", background:"rgba(15,23,42,0.06)", color:"#4B5563", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}
                title="סגור"
              >
                ×
              </button>
              <h3 style={{ margin:0, fontFamily:"'Inter','Heebo',sans-serif", color:"#111827", fontWeight:800, fontSize:isMobile?20:21 }}>תצוגה מקדימה לפני הורדה</h3>
              <p style={{ margin:"3px 0 0", color:"#6B7280", fontSize:isMobile?12:11, lineHeight:1.5 }}>
                PNG שקוף ומותאם להדפסה — אפשרות לקו חיתוך
              </p>
            </div>`;

const newHeader = `            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:isMobile?6:6 }}>
              <button
                onClick={()=>setExportM(false)}
                style={{ border:"none", background:"rgba(15,23,42,0.06)", color:"#4B5563", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}
                title="סגור"
              >
                ×
              </button>
            </div>`;

if (!code.includes(oldHeader)) { console.log('ERROR: oldHeader not found'); process.exit(1); }
code = code.replace(oldHeader, newHeader);
console.log('Fix header: only X button at top');

// Now insert title + description + בחר הכל row just before preview cards
// Find the "בחר הכל" selection row and replace it with title+description+בחר הכל
const oldSelRow = `            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", marginBottom:isMobile?10:8 }}>
              <button`;

const newSelRow = `            <div style={{ textAlign:"center", marginBottom:isMobile?10:10 }}>
              <h3 style={{ margin:0, fontFamily:"'Inter','Heebo',sans-serif", color:"#111827", fontWeight:800, fontSize:isMobile?20:21 }}>תצוגה מקדימה לפני הורדה</h3>
              <p style={{ margin:"3px 0 0", color:"#6B7280", fontSize:isMobile?12:11, lineHeight:1.5 }}>
                PNG שקוף ומותאם להדפסה — אפשרות לקו חיתוך
              </p>
            </div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", marginBottom:isMobile?10:8 }}>
              <button`;

if (!code.includes(oldSelRow)) { console.log('ERROR: oldSelRow not found'); process.exit(1); }
code = code.replace(oldSelRow, newSelRow);
console.log('Fix: title+desc above preview cards, בחר הכל on right');

writeFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', code);
console.log('All fixes saved.');
