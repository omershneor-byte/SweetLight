import { readFileSync, writeFileSync } from 'fs';

const code = readFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', 'utf8');

// Find the controls section and replace it
const startMarker = `            <div style={{ display:isMobile?"grid":"flex", gridTemplateColumns:isMobile?"1fr":undefined, justifyContent:isMobile?undefined:"center", alignItems:isMobile?undefined:"center", flexWrap:isMobile?undefined:"wrap", gap:8, marginBottom:isMobile?16:8, flex:"0 0 auto" }}>`;
const endMarker = `            </div>

            <div style={{ display:"flex", flexDirection:isMobile?"column-reverse":"row"`;

const startIdx = code.indexOf(startMarker);
const endIdx = code.indexOf(endMarker, startIdx);

if (startIdx === -1) { console.log('ERROR: startMarker not found'); process.exit(1); }
if (endIdx === -1) { console.log('ERROR: endMarker not found'); process.exit(1); }

console.log('Found controls section at line:', code.substring(0, startIdx).split('\n').length);
console.log('Ends at line:', code.substring(0, endIdx).split('\n').length);

const oldSection = code.substring(startIdx, endIdx);
console.log('Old section length:', oldSection.length, 'chars');

const newSection = `            <div style={{ display:"flex", flexDirection:isMobile?"column":"row", marginBottom:isMobile?16:10, flex:"0 0 auto", border:"1px solid #E5E7EB", borderRadius:14, background:"#FCFCFD", overflow:"hidden" }}>
              <div style={{ flex:isMobile?undefined:"0 0 auto", padding:isMobile?"12px 14px":"10px 12px", borderBottom:isMobile?"1px solid #E5E7EB":"none" }}>
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

              <div style={{ flex:isMobile?undefined:"0 0 auto", padding:isMobile?"12px 14px":"10px 12px", borderBottom:isMobile?"1px solid #E5E7EB":"none", borderRight:isMobile?"none":"1px solid #E5E7EB", borderLeft:isMobile?"none":"1px solid #E5E7EB" }}>
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

              <div style={{ flex:isMobile?undefined:"1 1 0", padding:isMobile?"12px 14px":"10px 12px" }}>
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
`;

const newCode = code.substring(0, startIdx) + newSection + code.substring(endIdx);
writeFileSync('C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx', newCode);
console.log('Done! Controls merged into single unified box.');
