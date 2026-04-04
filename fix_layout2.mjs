import { readFileSync, writeFileSync } from 'fs';

let code = readFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', 'utf8');

// ---- Fix 1: Center the header title/description, X button absolute ----
const oldHeader = `            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:isMobile?14:16, paddingTop:isMobile?0:2 }}>
              <div>
                <h3 style={{ margin:0, fontFamily:"'Inter','Heebo',sans-serif", color:"#111827", fontWeight:800, fontSize:isMobile?20:21 }}>תצוגה מקדימה לפני הורדה</h3>
                <p style={{ margin:"3px 0 0", color:"#6B7280", fontSize:isMobile?12:11, lineHeight:1.5, maxWidth:isMobile?"100%":460 }}>
                  PNG שקוף ומותאם להדפסה — אפשרות לקו חיתוך
                </p>
              </div>
              <button
                onClick={()=>setExportM(false)}
                style={{ border:"none", background:"rgba(15,23,42,0.06)", color:"#4B5563", width:32, height:32, borderRadius:"50%", cursor:"pointer", fontSize:18, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}
                title="סגור"
              >
                ×
              </button>
            </div>`;

const newHeader = `            <div style={{ position:"relative", textAlign:"center", marginBottom:isMobile?14:16, paddingTop:isMobile?0:2 }}>
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

if (!code.includes(oldHeader)) { console.log('ERROR: oldHeader not found'); process.exit(1); }
code = code.replace(oldHeader, newHeader);
console.log('Fix 1 done: header centered');

// ---- Fix 2: Selection row — only "בחר הכל" on the right ----
const oldSelRow = `            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:isMobile?10:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.04em" }}>בחר פורמטים להורדה</div>
              <button`;

const newSelRow = `            <div style={{ display:"flex", alignItems:"center", justifyContent:"flex-start", marginBottom:isMobile?10:8 }}>
              <button`;

if (!code.includes(oldSelRow)) { console.log('ERROR: oldSelRow not found'); process.exit(1); }
code = code.replace(oldSelRow, newSelRow);
console.log('Fix 2 done: בחר הכל on right');

// ---- Fix 3: Controls order — קו חיתוך (right), עובי קו (middle), צבע קו (left) ----
// Find the controls box and reorder the 3 sections

const startMarker = `            <div style={{ display:"flex", flexDirection:isMobile?"column":"row", marginBottom:isMobile?16:10, flex:"0 0 auto", border:"1px solid #E5E7EB", borderRadius:14, background:"#FCFCFD", overflow:"hidden" }}>`;
const endMarker = `\n            </div>\n\n            <div style={{ display:"flex", flexDirection:isMobile?"column-reverse":"row"`;

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker, startIdx);

if (startIdx === -1) { console.log('ERROR: controls start not found'); process.exit(1); }
if (endIdx === -1) { console.log('ERROR: controls end not found'); process.exit(1); }

const newControls = `            <div style={{ display:"flex", flexDirection:isMobile?"column":"row", marginBottom:isMobile?16:10, flex:"0 0 auto", border:"1px solid #E5E7EB", borderRadius:14, background:"#FCFCFD", overflow:"hidden", justifyContent:"center" }}>
              {/* קו חיתוך — rightmost in RTL */}
              <div style={{ flex:isMobile?undefined:"0 0 auto", padding:isMobile?"12px 14px":"10px 14px", borderBottom:isMobile?"1px solid #E5E7EB":"none", borderLeft:isMobile?"none":"1px solid #E5E7EB" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.04em" }}>קו חיתוך</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {[
                    ["none", "ללא"],
                    ["solid", "קו אחיד"],
                    ["dashed", "מקווקו"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setExportCutLineType(value)}
                      style={{
                        border:"none",
                        borderRadius:999,
                        padding:isMobile?"8px 12px":"5px 9px",
                        cursor:"pointer",
                        fontSize:11,
                        fontWeight:800,
                        fontFamily:"'Inter','Heebo',sans-serif",
                        background:exportCutLineType===value?"linear-gradient(135deg,#00C4CC 0%,#8B3DFF 100%)":"rgba(15,23,42,0.06)",
                        color:exportCutLineType===value?"#fff":"#475569",
                        boxShadow:exportCutLineType===value?"0 6px 18px rgba(139,61,255,0.22)":"none",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* עובי קו — middle */}
              <div style={{ flex:isMobile?undefined:"0 0 auto", padding:isMobile?"12px 14px":"10px 14px", borderBottom:isMobile?"1px solid #E5E7EB":"none", borderLeft:isMobile?"none":"1px solid #E5E7EB" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.04em" }}>עובי קו</div>
                <div style={{ display:"flex", gap:5 }}>
                  {[1, 2, 3].map((value) => (
                    <button
                      key={value}
                      onClick={() => setExportCutLineWidth(value)}
                      style={{
                        flex:1,
                        border:"none",
                        borderRadius:10,
                        padding:isMobile?"9px 14px":"5px 12px",
                        cursor:"pointer",
                        fontSize:11,
                        fontWeight:800,
                        fontFamily:"'Inter','Heebo',sans-serif",
                        background:exportCutLineWidth===value?"rgba(139,61,255,0.14)":"rgba(15,23,42,0.05)",
                        color:exportCutLineWidth===value?"#6D28D9":"#475569",
                        boxShadow:exportCutLineWidth===value?"inset 0 0 0 1px rgba(139,61,255,0.18)":"inset 0 0 0 1px rgba(226,232,240,0.9)",
                      }}
                    >
                      {value}px
                    </button>
                  ))}
                </div>
              </div>

              {/* צבע קו — leftmost in RTL */}
              <div style={{ flex:isMobile?undefined:"0 0 auto", padding:isMobile?"12px 14px":"10px 14px" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#9CA3AF", marginBottom:5, textTransform:"uppercase", letterSpacing:"0.04em" }}>צבע קו</div>
                <div style={{ display:"flex", gap:5 }}>
                  {[
                    ["light", "בהיר"],
                    ["dark", "כהה"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setExportCutLineTone(value)}
                      style={{
                        flex:1,
                        border:"none",
                        borderRadius:10,
                        padding:isMobile?"9px 14px":"5px 12px",
                        cursor:"pointer",
                        fontSize:11,
                        fontWeight:800,
                        fontFamily:"'Inter','Heebo',sans-serif",
                        background:exportCutLineTone===value?"rgba(139,61,255,0.14)":"rgba(15,23,42,0.05)",
                        color:exportCutLineTone===value?"#6D28D9":"#475569",
                        boxShadow:exportCutLineTone===value?"inset 0 0 0 1px rgba(139,61,255,0.18)":"inset 0 0 0 1px rgba(226,232,240,0.9)",
                        display:"inline-flex",
                        alignItems:"center",
                        justifyContent:"center",
                        gap:6,
                        whiteSpace:"nowrap",
                      }}
                    >
                      <span
                        style={{
                          width:9,
                          height:9,
                          borderRadius:"50%",
                          background:value==="dark" ? "#64748B" : "#CBD5E1",
                          boxShadow:"inset 0 0 0 1px rgba(148,163,184,0.35)",
                          flexShrink:0,
                        }}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
`;

code = code.substring(0, startIdx) + newControls + code.substring(endIdx);
console.log('Fix 3 done: controls reordered');

writeFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', code);
console.log('All fixes saved.');
