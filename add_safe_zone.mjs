import { readFileSync, writeFileSync } from 'fs';

const FILE = 'C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx';
let code = readFileSync(FILE, 'utf8');

// ── 1. Add state + ref + useEffects after draftPrintSizeAdj ──
const old1 = `  const [draftPrintSizeAdj, setDraftPrintSizeAdj] = useState({ landscape: { w: 0, h: 0 }, portrait: { w: 0, h: 0 } });`;
const new1 = `  const [draftPrintSizeAdj, setDraftPrintSizeAdj] = useState({ landscape: { w: 0, h: 0 }, portrait: { w: 0, h: 0 } });
  const [safeZone, setSafeZone] = useState({ top:{on:false,mm:3}, bottom:{on:false,mm:3}, left:{on:false,mm:3}, right:{on:false,mm:3} });
  const [draftSafeZone, setDraftSafeZone] = useState({ top:{on:false,mm:3}, bottom:{on:false,mm:3}, left:{on:false,mm:3}, right:{on:false,mm:3} });
  const safeZoneRef = useRef({ top:{on:false,mm:3}, bottom:{on:false,mm:3}, left:{on:false,mm:3}, right:{on:false,mm:3} });
  const [canvasSerial, setCanvasSerial] = useState(0);
  useEffect(() => { safeZoneRef.current = safeZone; }, [safeZone]);
  useEffect(() => {
    const c = fab.current;
    if (!c || !window.fabric) return;
    const ds = DIMS[mode]; const fs = FRAME_SIZE_CM[mode];
    const mmX = ds.w / (fs.w * 10), mmY = ds.h / (fs.h * 10);
    const EDGE_DEFS = [
      ['safe-top',    'top',    (mm) => [0, mm*mmY, ds.w, mm*mmY]],
      ['safe-bottom', 'bottom', (mm) => [0, ds.h - mm*mmY, ds.w, ds.h - mm*mmY]],
      ['safe-left',   'left',   (mm) => [mm*mmX, 0, mm*mmX, ds.h]],
      ['safe-right',  'right',  (mm) => [ds.w - mm*mmX, 0, ds.w - mm*mmX, ds.h]],
    ];
    EDGE_DEFS.forEach(([id, key, coords]) => {
      const edge = safeZone[key];
      const co = coords(edge.mm);
      let ln = c.getObjects().find(o => o.id === id);
      if (!ln) {
        ln = new window.fabric.Line(co, { stroke:'rgba(220,50,50,0.6)', strokeWidth:1, strokeDashArray:[6,4], selectable:false, evented:false, excludeFromExport:true, id });
        c.add(ln);
      } else {
        ln.set({ x1:co[0], y1:co[1], x2:co[2], y2:co[3] });
      }
      ln._safeOn = edge.on;
      ln.set({ visible: edge.on });
    });
    c.requestRenderAll ? c.requestRenderAll() : c.renderAll();
  }, [safeZone, mode, canvasSerial]);`;
if (!code.includes(old1)) { console.log('ERROR 1: draftPrintSizeAdj state not found'); process.exit(1); }
code = code.replace(old1, new1);
console.log('1. safeZone state + effects added');

// ── 2. Add helper functions before runExportDownload ──
const old2 = `  const runExportDownload = useCallback(async () => {`;
const new2 = `  function _applySzConstraint(obj, canvas) {
    const br = obj.getBoundingRect();
    const tL = canvas.getObjects().find(o => o.id==='safe-top');
    const bL = canvas.getObjects().find(o => o.id==='safe-bottom');
    const lL = canvas.getObjects().find(o => o.id==='safe-left');
    const rL = canvas.getObjects().find(o => o.id==='safe-right');
    let nl = obj.left, nt = obj.top;
    if (tL?._safeOn && br.top < tL.y1) nt += tL.y1 - br.top;
    if (bL?._safeOn && br.top+br.height > bL.y1) nt += bL.y1 - (br.top+br.height);
    if (lL?._safeOn && br.left < lL.x1) nl += lL.x1 - br.left;
    if (rL?._safeOn && br.left+br.width > rL.x1) nl += rL.x1 - (br.left+br.width);
    if (nl !== obj.left || nt !== obj.top) obj.set({ left:nl, top:nt });
  }
  function _checkSzViolations(canvas) {
    if (!canvas) return false;
    const tL = canvas.getObjects().find(o => o.id==='safe-top');
    const bL = canvas.getObjects().find(o => o.id==='safe-bottom');
    const lL = canvas.getObjects().find(o => o.id==='safe-left');
    const rL = canvas.getObjects().find(o => o.id==='safe-right');
    if (!tL?._safeOn && !bL?._safeOn && !lL?._safeOn && !rL?._safeOn) return false;
    return canvas.getObjects().some(obj => {
      if (!obj.id) return false;
      if (['safe-top','safe-bottom','safe-left','safe-right','hole','holelabel','snap-v','snap-h'].includes(obj.id)) return false;
      if (obj.id.startsWith('halo') || obj.id.startsWith('snap')) return false;
      if (obj.type==='i-text'||obj.type==='textbox'||obj.type==='text') return false;
      const br = obj.getBoundingRect();
      if (tL?._safeOn && br.top < tL.y1) return true;
      if (bL?._safeOn && br.top+br.height > bL.y1) return true;
      if (lL?._safeOn && br.left < lL.x1) return true;
      if (rL?._safeOn && br.left+br.width > rL.x1) return true;
      return false;
    });
  }
  const runExportDownload = useCallback(async () => {`;
if (!code.includes(old2)) { console.log('ERROR 2: runExportDownload not found'); process.exit(1); }
code = code.replace(old2, new2);
console.log('2. Helper functions added');

// ── 3. Increment canvasSerial when canvas is initialized ──
const old3 = `      fab.current = c;
      canvasBuilt.current = true;`;
const new3 = `      fab.current = c;
      canvasBuilt.current = true;
      setCanvasSerial(s => s + 1);`;
if (!code.includes(old3)) { console.log('ERROR 3: fab.current assignment not found'); process.exit(1); }
code = code.replace(old3, new3);
console.log('3. canvasSerial increment added to canvas init');

// ── 4. Add text constraint to object:moving handler ──
const old4 = `      c.on("object:moving", e => {
        const obj = e.target;
        if (!isUser(obj)) return;
        applyFabricObjectSmartSnap(obj, "move");
        syncFabricTextHaloForObject(c, obj);
        safeRenderCanvas(c);
      });`;
const new4 = `      c.on("object:moving", e => {
        const obj = e.target;
        if (!isUser(obj)) return;
        applyFabricObjectSmartSnap(obj, "move");
        syncFabricTextHaloForObject(c, obj);
        if (obj.type==='i-text'||obj.type==='textbox'||obj.type==='text') _applySzConstraint(obj, c);
        safeRenderCanvas(c);
      });`;
if (!code.includes(old4)) { console.log('ERROR 4: object:moving handler not found'); process.exit(1); }
code = code.replace(old4, new4);
console.log('4. Text constraint added to object:moving');

// ── 5. Update gear button onClick ──
const old5 = `onClick={()=>{ setDraftPrintDpi(printDpi); setDraftPrintSizeAdj({ landscape:{...printSizeAdj.landscape}, portrait:{...printSizeAdj.portrait} }); setWmSettingsM(true); }}`;
const new5 = `onClick={()=>{ setDraftPrintDpi(printDpi); setDraftPrintSizeAdj({ landscape:{...printSizeAdj.landscape}, portrait:{...printSizeAdj.portrait} }); setDraftSafeZone({ top:{...safeZone.top}, bottom:{...safeZone.bottom}, left:{...safeZone.left}, right:{...safeZone.right} }); setWmSettingsM(true); }}`;
if (!code.includes(old5)) { console.log('ERROR 5: gear button onClick not found'); process.exit(1); }
code = code.replace(old5, new5);
console.log('5. Gear button updated with draftSafeZone init');

// ── 6. Save button commits safeZone ──
const old6 = `                  setPrintDpi(draftPrintDpi);
                  setPrintSizeAdj(draftPrintSizeAdj);
                  setWmSettingsM(false);`;
const new6 = `                  setPrintDpi(draftPrintDpi);
                  setPrintSizeAdj(draftPrintSizeAdj);
                  setSafeZone(draftSafeZone);
                  setWmSettingsM(false);`;
if (!code.includes(old6)) { console.log('ERROR 6: save button pattern not found'); process.exit(1); }
code = code.replace(old6, new6);
console.log('6. Save button commits safeZone');

// ── 7. Add violation warning before export download ──
const old7 = `    setExportBusy(true);
    try {
      const baseName = sanitizeDownloadBaseName(`;
const new7 = `    if (_checkSzViolations(fab.current)) {
      if (!window.confirm('יש אלמנטים החורגים מקו הבטיחות. להמשיך עם ההורדה?')) return;
    }
    setExportBusy(true);
    try {
      const baseName = sanitizeDownloadBaseName(`;
if (!code.includes(old7)) { console.log('ERROR 7: setExportBusy not found'); process.exit(1); }
code = code.replace(old7, new7);
console.log('7. Export violation check added');

// ── 8. Add violation warning before template save ──
const old8 = `  const doSave = () => {
    if (!fab.current || !tName.trim()) { alert("נא להזין שם לתבנית"); return; }
    onSaveTemplate(buildTemplateSnapshot({`;
const new8 = `  const doSave = () => {
    if (!fab.current || !tName.trim()) { alert("נא להזין שם לתבנית"); return; }
    if (_checkSzViolations(fab.current)) {
      if (!window.confirm('יש אלמנטים החורגים מקו הבטיחות. להמשיך עם שמירת התבנית?')) return;
    }
    onSaveTemplate(buildTemplateSnapshot({`;
if (!code.includes(old8)) { console.log('ERROR 8: doSave not found'); process.exit(1); }
code = code.replace(old8, new8);
console.log('8. Template save violation check added');

// ── 9. Add safe zone UI to print settings tab ──
const old9 = `              ))}
            </>}
            <div style={{ display:"flex",gap:10,marginTop:isMobile?20:18,flexDirection:isMobile?"column-reverse":"row" }}>`;
const new9 = `              ))}
              {/* ── Safe zone ── */}
              <div style={{ borderTop:"1px solid #F3F4F6", paddingTop:isMobile?16:14, marginTop:6 }}>
                <div style={{ fontSize:isMobile?12:11, fontWeight:700, color:"#374151", marginBottom:isMobile?8:6 }}>קווי בטיחות</div>
                <div style={{ fontSize:isMobile?11:10, color:"#6B7280", marginBottom:isMobile?12:10, lineHeight:1.55 }}>
                  טקסטים לא יוכלו לחצות קווים אלה. אלמנטים אחרים יקבלו אזהרה לפני הורדה.
                </div>
                {[["top","\u05e2\u05dc\u05d9\u05d5\u05df"],["bottom","\u05ea\u05d7\u05ea\u05d5\u05df"],["left","\u05e9\u05de\u05d0\u05dc"],["right","\u05d9\u05de\u05d9\u05df"]].map(([edge,label]) => (
                  <div key={edge} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:isMobile?10:8 }}>
                    <input
                      type="checkbox"
                      checked={draftSafeZone[edge].on}
                      onChange={e => setDraftSafeZone(prev => ({...prev, [edge]:{...prev[edge], on:e.target.checked}}))}
                      style={{ width:15, height:15, accentColor:"#8B3DFF", cursor:"pointer", flexShrink:0 }}
                    />
                    <span style={{ fontSize:isMobile?12:11, color:"#374151", minWidth:32 }}>{label}</span>
                    <input
                      type="number" min={0.5} max={5} step={0.5}
                      value={draftSafeZone[edge].mm}
                      disabled={!draftSafeZone[edge].on}
                      onChange={e => setDraftSafeZone(prev => ({...prev, [edge]:{...prev[edge], mm:Math.max(0.5,Math.min(5,parseFloat(e.target.value)||3))}}))}
                      style={{ width:46, textAlign:"center", border:"1px solid #E5E7EB", borderRadius:6, padding:"3px 0", fontSize:11, fontFamily:"'Inter','Heebo',sans-serif", color:"#374151", opacity:draftSafeZone[edge].on?1:0.4 }}
                    />
                    <span style={{ fontSize:10, color:"#9CA3AF" }}>\u05de"\u05de</span>
                  </div>
                ))}
              </div>
            </>}
            <div style={{ display:"flex",gap:10,marginTop:isMobile?20:18,flexDirection:isMobile?"column-reverse":"row" }}>`;
if (!code.includes(old9)) { console.log('ERROR 9: print block end not found'); process.exit(1); }
code = code.replace(old9, new9);
console.log('9. Safe zone UI added to settings modal');

writeFileSync(FILE, code);
console.log('\nAll done! Saved.');
