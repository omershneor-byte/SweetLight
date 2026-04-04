import { readFileSync, writeFileSync } from 'fs';

const FILE = 'C:/Users/Omer Shneor/MISGAROT V2/MisgarotV2_23_03_26/sweetlight_magnetool_21.3.26.jsx';
let code = readFileSync(FILE, 'utf8');

// ── 1. Add draft state variables ──
const oldUnit = `  const [printSizeAdjUnit, setPrintSizeAdjUnit] = useState('mm');`;
const newUnit = `  const [printSizeAdjUnit, setPrintSizeAdjUnit] = useState('mm');
  const [draftPrintDpi, setDraftPrintDpi] = useState(300);
  const [draftPrintSizeAdj, setDraftPrintSizeAdj] = useState({ landscape: { w: 0, h: 0 }, portrait: { w: 0, h: 0 } });`;
if (!code.includes(oldUnit)) { console.log('ERROR 1: printSizeAdjUnit not found'); process.exit(1); }
code = code.replace(oldUnit, newUnit);
console.log('1. Draft state variables added');

// ── 2. Init draft when opening settings modal ──
const oldGear = `onClick={()=>setWmSettingsM(true)}`;
const newGear = `onClick={()=>{ setDraftPrintDpi(printDpi); setDraftPrintSizeAdj({ landscape:{...printSizeAdj.landscape}, portrait:{...printSizeAdj.portrait} }); setWmSettingsM(true); }}`;
if (!code.includes(oldGear)) { console.log('ERROR 2: gear button not found'); process.exit(1); }
code = code.replace(oldGear, newGear);
console.log('2. Gear button updated to init draft on open');

// ── 3. Commit draft on save ──
const oldSave = `                  setWmSettingsM(false);
                } catch(e) { console.error('Settings save error:', e); }`;
const newSave = `                  setPrintDpi(draftPrintDpi);
                  setPrintSizeAdj(draftPrintSizeAdj);
                  setWmSettingsM(false);
                } catch(e) { console.error('Settings save error:', e); }`;
if (!code.includes(oldSave)) { console.log('ERROR 3: save button pattern not found'); process.exit(1); }
code = code.replace(oldSave, newSave);
console.log('3. Save button commits draft to real state');

// ── 4. Replace printDpi/printSizeAdj → draft inside the print settings block only ──
const blockStart = `            {settingsTab==="print" && <>`;
const blockEnd   = `            </>}`;
const bsIdx = code.indexOf(blockStart);
if (bsIdx === -1) { console.log('ERROR 4: print settings block start not found'); process.exit(1); }
const beIdx = code.indexOf(blockEnd, bsIdx);
if (beIdx === -1) { console.log('ERROR 4: print settings block end not found'); process.exit(1); }
const beEnd = beIdx + blockEnd.length;

let block = code.substring(bsIdx, beEnd);

// Replace all occurrences within the block
const rep = (s, from, to) => s.split(from).join(to);
block = rep(block, 'printDpi===', 'draftPrintDpi===');
block = rep(block, 'printDpi/', 'draftPrintDpi/');
block = rep(block, 'setPrintDpi(', 'setDraftPrintDpi(');
block = rep(block, 'printSizeAdj[', 'draftPrintSizeAdj[');
block = rep(block, 'setPrintSizeAdj(', 'setDraftPrintSizeAdj(');
// Also fix the getExportPixelSize / getAdjustedFrameSizeCm calls with printSizeAdj
block = rep(block, 'printDpi, printSizeAdj', 'draftPrintDpi, draftPrintSizeAdj');
block = rep(block, 'printDpi, draftPrintSizeAdj', 'draftPrintDpi, draftPrintSizeAdj'); // dedupe
block = rep(block, ', printSizeAdj)', ', draftPrintSizeAdj)');
// Fix any remaining printDpi references (like in multiplier expressions)
block = rep(block, '*printDpi/', '*draftPrintDpi/');
block = rep(block, 'val*2.54/printDpi', 'val*2.54/draftPrintDpi');
// Avoid double-replacing already replaced text
block = rep(block, 'draftDraftPrint', 'draftPrint'); // safety cleanup

code = code.substring(0, bsIdx) + block + code.substring(beEnd);
console.log('4. Print block updated to use draft state');

// ── 5. Add explanatory text + reset button at the top of the print settings block ──
const oldBlockTop = `            {settingsTab==="print" && <>
              {/* DPI */}`;
const newBlockTop = `            {settingsTab==="print" && <>
              {/* Explanation */}
              <div style={{ fontSize:isMobile?12:11, color:"#6B7280", lineHeight:1.6, marginBottom:isMobile?16:14, padding:"10px 12px", background:"rgba(139,61,255,0.04)", borderRadius:8, border:"1px solid rgba(139,61,255,0.08)" }}>
                \u05db\u05d9\u05d5\u05d5\u05df \u05d0\u05d9\u05e9\u05d9 \u05dc\u05e4\u05d9 \u05d4\u05de\u05d3\u05e4\u05e1\u05ea \u2014 \u05de\u05d3\u05e4\u05e1\u05d5\u05ea \u05e9\u05d5\u05e0\u05d5\u05ea \u05e2\u05e9\u05d5\u05d9\u05d5\u05ea \u05dc\u05d7\u05ea\u05d5\u05da \u05e7\u05e6\u05ea \u05e9\u05d5\u05e0\u05d4, \u05e9\u05e0\u05d4 \u05db\u05d0\u05df \u05d0\u05ea \u05d2\u05d5\u05d3\u05dc \u05d4\u05de\u05e1\u05d2\u05e8\u05ea \u05d1\u05d4\u05ea\u05d0\u05dd
              </div>
              {/* DPI */}`;
if (!code.includes(oldBlockTop)) { console.log('ERROR 5: print block top not found'); process.exit(1); }
code = code.replace(oldBlockTop, newBlockTop);
console.log('5. Explanatory text added');

// ── 6. Add reset button inside the size adjustment section ──
const oldSizeSection = `              {/* Size adjustment */}
              {[[\"\u05d0\u05d5\u05e8\u05da\",\"portrait\"],[\"\u05e8\u05d5\u05d7\u05d1\",\"landscape\"]].map(([mLabel,m]) => (`;
const newSizeSection = `              {/* Size adjustment */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:isMobile?8:6 }}>
                <span style={{ fontSize:isMobile?12:11, fontWeight:700, color:"#374151" }}>\u05db\u05d9\u05d5\u05d5\u05df \u05d2\u05d5\u05d3\u05dc</span>
                <button onClick={() => setDraftPrintSizeAdj({ landscape:{w:0,h:0}, portrait:{w:0,h:0} })} style={{ fontSize:10, padding:"3px 9px", border:"1px solid #E5E7EB", borderRadius:999, cursor:"pointer", background:"#F9FAFB", color:"#6B7280", fontFamily:"'Inter','Heebo',sans-serif", fontWeight:600 }}>\u05d0\u05d9\u05e4\u05d5\u05e1</button>
              </div>
              {[[\"\u05d0\u05d5\u05e8\u05da\",\"portrait\"],[\"\u05e8\u05d5\u05d7\u05d1\",\"landscape\"]].map(([mLabel,m]) => (`;
if (!code.includes(oldSizeSection)) { console.log('ERROR 6: size section header not found'); process.exit(1); }
code = code.replace(oldSizeSection, newSizeSection);
console.log('6. Reset button added');

writeFileSync(FILE, code);
console.log('\nAll done! Saved.');
