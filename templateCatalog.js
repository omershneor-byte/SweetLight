export function isGradientBgType(type) {
  return type === "gradient" || type === "radial";
}

function withAlpha(color, alpha = 1) {
  const value = String(color || "").trim();
  if (!value) return `rgba(0,0,0,${alpha})`;
  if (/^rgba?\(/i.test(value)) return value;
  const normalized = value.replace("#", "");
  if (!/^[0-9a-fA-F]{3,8}$/.test(normalized)) return value;
  const full = normalized.length === 3
    ? normalized.split("").map((part) => part + part).join("")
    : normalized.slice(0, 6).padEnd(6, "0");
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function textLayer(id, text, x, y, options = {}) {
  return {
    id,
    text,
    x,
    y,
    fontFamily: options.fontFamily || "Heebo",
    fontSize: options.fontSize || 60,
    fill: options.fill || "#222222",
    fontWeight: options.fontWeight || "normal",
    shadow: !!options.shadow,
    halo: !!options.halo,
    stroke: options.stroke || "#000000",
    strokeWidth: typeof options.strokeWidth === "number" ? options.strokeWidth : 0,
    opacity: typeof options.opacity === "number" ? options.opacity : 1,
    rotation: options.rotation || 0,
    textAlign: options.textAlign || "center",
    direction: "rtl",
    lineHeight: options.lineHeight || 1.2,
    scaleX: typeof options.scaleX === "number" ? options.scaleX : 1,
    scaleY: typeof options.scaleY === "number" ? options.scaleY : 1,
  };
}

function rectObj(id, left, top, width, height, fill, extra = {}) {
  return {
    type: "rect",
    id,
    left,
    top,
    width,
    height,
    fill,
    opacity: typeof extra.opacity === "number" ? extra.opacity : 1,
    angle: extra.angle || 0,
    rx: typeof extra.rx === "number" ? extra.rx : 0,
    ry: typeof extra.ry === "number" ? extra.ry : 0,
    stroke: extra.stroke || null,
    strokeWidth: extra.strokeWidth || 0,
    originX: "center",
    originY: "center",
    selectable: true,
    evented: true,
  };
}

function ruleObj(id, left, top, width, height, fill, extra = {}) {
  return rectObj(id, left, top, width, height, fill, {
    ...extra,
    rx: typeof extra.rx === "number" ? extra.rx : Math.max(1, Math.round(height / 2)),
    ry: typeof extra.ry === "number" ? extra.ry : Math.max(1, Math.round(height / 2)),
  });
}

function circleObj(id, left, top, radius, fill, extra = {}) {
  return {
    type: "circle",
    id,
    left,
    top,
    radius,
    fill,
    opacity: typeof extra.opacity === "number" ? extra.opacity : 1,
    angle: extra.angle || 0,
    stroke: extra.stroke || null,
    strokeWidth: extra.strokeWidth || 0,
    originX: "center",
    originY: "center",
    selectable: true,
    evented: true,
  };
}

function textDecorObj(id, text, left, top, fontSize, fill, extra = {}) {
  const item = {
    type: "text",
    id,
    text,
    left,
    top,
    fontSize,
    fill,
    fontFamily: extra.fontFamily || "Heebo",
    fontWeight: extra.fontWeight || "normal",
    opacity: typeof extra.opacity === "number" ? extra.opacity : 1,
    angle: extra.angle || 0,
    scaleX: typeof extra.scaleX === "number" ? extra.scaleX : 1,
    scaleY: typeof extra.scaleY === "number" ? extra.scaleY : 1,
    originX: "center",
    originY: "center",
    selectable: true,
    evented: true,
  };
  if (extra.emoName) item._emoName = extra.emoName;
  return item;
}

function iconObj(src, left, top, scaleX, scaleY, id, extra = {}) {
  if (!src) return null;
  return {
    type: "image",
    src,
    left,
    top,
    scaleX,
    scaleY,
    originX: "center",
    originY: "center",
    id,
    angle: extra.angle || 0,
    opacity: typeof extra.opacity === "number" ? extra.opacity : 1,
    selectable: true,
    evented: true,
  };
}

function cleanItems(items = []) {
  return items.filter(Boolean);
}

const FRAME_LAYOUTS = {
  classic: { titleY: 664, dateY: 722, decorY: 742, bandTop: 618, titleMax: 56, dateSize: 24, cornerY: 680 },
  strip: { titleY: 680, dateY: 724, decorY: 742, bandTop: 648, titleMax: 50, dateSize: 22, cornerY: 690 },
  thin: { titleY: 716, dateY: 744, decorY: 748, bandTop: 693, titleMax: 40, dateSize: 18, cornerY: 724 },
  none: { titleY: 666, dateY: 720, decorY: 738, bandTop: null, titleMax: 68, dateSize: 28, cornerY: 640 },
};

function isDarkColor(color) {
  const value = String(color || "").trim().replace("#", "");
  if (!/^[0-9a-fA-F]{3,6}$/.test(value)) return false;
  const full = value.length === 3 ? value.split("").map((part) => part + part).join("") : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.58;
}

function getTextLayout(def = {}) {
  const frameStyle = def.frameStyle || "classic";
  const base = FRAME_LAYOUTS[frameStyle] || FRAME_LAYOUTS.classic;
  return {
    frameStyle,
    overlay: frameStyle === "none",
    hasFrame: frameStyle !== "none",
    bandTop: base.bandTop,
    cornerY: base.cornerY,
    titleY: def.titleY || base.titleY,
    dateY: def.subtitleY || base.dateY,
    decorY: base.decorY,
    titleSize: Math.min(def.titleSize || 60, base.titleMax),
    dateSize: def.subSize || base.dateSize,
  };
}

function frameAwareTitleProps(def = {}, layout = FRAME_LAYOUTS.classic) {
  return {
    fontFamily: def.titleFont,
    fontSize: layout.titleSize,
    fill: def.titleColor,
    fontWeight: def.titleWeight,
    shadow: layout.overlay ? true : !!def.titleShadow,
    halo: layout.overlay ? true : !!def.titleHalo,
    stroke: layout.overlay ? (def.titleStroke || "#FFFFFF") : (def.titleStroke || "#000000"),
    strokeWidth: layout.overlay ? Math.max(def.titleStrokeWidth || 0, 1.1) : (def.titleStrokeWidth || 0),
    scaleX: def.titleScaleX,
    scaleY: def.titleScaleY,
  };
}

function frameAwareDateProps(def = {}, layout = FRAME_LAYOUTS.classic) {
  const subColor = def.subColor || def.titleColor;
  const wantsWhiteOutline = layout.overlay && isDarkColor(subColor);
  return {
    fontFamily: def.subFont || "Heebo",
    fontSize: layout.dateSize,
    fill: subColor,
    fontWeight: def.subWeight || "normal",
    shadow: layout.overlay ? true : def.subShadow !== false,
    halo: layout.overlay ? true : !!def.subHalo,
    stroke: wantsWhiteOutline ? (def.subStroke || "#FFFFFF") : (def.subStroke || "#000000"),
    strokeWidth: wantsWhiteOutline ? Math.max(def.subStrokeWidth || 0, 0.9) : (def.subStrokeWidth || 0),
  };
}

const SAMPLE_NAMES = [
  "נועה & יובל",
  "מאיה & רון",
  "שירה & דניאל",
  "רומי & אריאל",
  "אופיר & רז",
  "טל & גיא",
  "יעל & תומר",
  "הילה & רותם",
  "שני & יאיר",
  "אביגיל & ליאור",
  "ספיר & רון",
  "רוני & איתי",
  "מאיה & גלעד",
  "ליה & עומר",
  "דנה & עידו",
  "עמית & שלו",
  "מיקה & אלון",
  "אמה & גל",
  "תהל & רפאל",
  "ליבי & נועם",
];

const SAMPLE_DATES = [
  "14.06.2026",
  "22.06.2026",
  "03.07.2026",
  "18.07.2026",
  "29.07.2026",
  "09.08.2026",
  "21.08.2026",
  "02.09.2026",
  "14.09.2026",
  "27.09.2026",
  "10.10.2026",
  "25.10.2026",
  "08.11.2026",
  "24.11.2026",
  "14.12.2026",
];

const MINIMAL_HE_NAMES = [
  "השקד",
  "הכלנית",
  "הדרים",
  "הגפן",
  "האיריס",
  "הדס",
  "הנרקיס",
  "המעיין",
  "היסמין",
  "הרקפת",
  "הזית",
  "התאנה",
  "הברוש",
  "האלה",
  "התמר",
];

const MODERN_HE_NAMES = [
  "דיזנגוף",
  "רוטשילד",
  "שבזי",
  "נחלת בנימין",
  "בוגרשוב",
  "שינקין",
  "אבן גבירול",
  "בן יהודה",
  "פרישמן",
  "הרצל",
  "החשמונאים",
  "הארבעה",
  "קרליבך",
  "אלנבי",
  "קינג ג'ורג'",
];

const CLASSIC_HE_NAMES = [
  "אחד העם",
  "לילינבלום",
  "מונטיפיורי",
  "נחמני",
  "רמב\"ן",
  "הנשיא",
  "דוד המלך",
  "בלפור",
  "ארלוזורוב",
  "מזל אריה",
];

const BOLD_HE_NAMES = [
  "פלורנטין",
  "לוינסקי",
  "יהודה הלוי",
  "המסגר",
  "לבונטין",
  "קפלן",
  "הכרמל",
  "הנמל",
  "התחנה",
  "יפו",
];

const MINIMAL_DEFS = [
  { name: "Pure Minimalism 01 · Ivory Whisper", frameStyle: "thin", bg: "#FFFDF8", titleColor: "#534B45", subColor: "#A19487", accent: "#CDB7A1", titleFont: "Assistant", titleSize: 62, pattern: "center-heart" },
  { name: "Pure Minimalism 02 · Blush Thread", frameStyle: "none", bg: "#FFF7F8", titleColor: "#5A4B4F", subColor: "#A88F95", accent: "#D8A8B7", titleFont: "Heebo", titleSize: 60, pattern: "soft-pill" },
  { name: "Pure Minimalism 03 · Cloud Line", frameStyle: "thin", bg: "#F8FBFF", titleColor: "#48515D", subColor: "#8D99A8", accent: "#AAB8CA", titleFont: "Varela Round", titleSize: 60, pattern: "quiet-corners" },
  { name: "Pure Minimalism 04 · Sand Margin", frameStyle: "classic", bg: "#FBF6EF", titleColor: "#5B4D42", subColor: "#9F8C7D", accent: "#D6BDA6", titleFont: "Assistant", titleSize: 64, pattern: "double-dot" },
  { name: "Pure Minimalism 05 · Sage Air", frameStyle: "thin", bg: "#F5FAF4", titleColor: "#49574B", subColor: "#829184", accent: "#B8C9B5", titleFont: "Heebo", titleSize: 61, pattern: "leaf-pair" },
  { name: "Pure Minimalism 06 · Pearl Note", frameStyle: "strip", bg: "#FFFDFC", titleColor: "#4E4845", subColor: "#938883", accent: "#D2C5BE", titleFont: "Rubik", titleSize: 60, pattern: "polaroid-pin", subtitleY: 708 },
  { name: "Pure Minimalism 07 · Dust Rose", frameStyle: "none", bg: "#FDF5F6", titleColor: "#614C53", subColor: "#A98F98", accent: "#D6B0BC", titleFont: "Varela Round", titleSize: 58, pattern: "star-trace" },
  { name: "Pure Minimalism 08 · Linen Whisper", frameStyle: "classic", bg: "#FCF9F4", titleColor: "#564D46", subColor: "#9A8C7E", accent: "#C9B8A8", titleFont: "Assistant", titleSize: 63, pattern: "bottom-whisper" },
  { name: "Pure Minimalism 09 · Quiet Sky", frameStyle: "thin", bg: "#F6FAFD", titleColor: "#4B5662", subColor: "#95A2AE", accent: "#B8C5D3", titleFont: "Heebo", titleSize: 59, pattern: "center-heart" },
  { name: "Pure Minimalism 10 · Nude Trace", frameStyle: "none", bg: "#FFF7F2", titleColor: "#5E4E49", subColor: "#A68E84", accent: "#D9BCAC", titleFont: "Rubik", titleSize: 60, pattern: "quiet-corners" },
  { name: "Pure Minimalism 11 · Frost Breath", frameStyle: "thin", bg: "#FBFCFE", titleColor: "#4D5259", subColor: "#98A0AA", accent: "#C7D0DB", titleFont: "Assistant", titleSize: 61, pattern: "soft-pill" },
  { name: "Pure Minimalism 12 · Olive Paper", frameStyle: "classic", bg: "#F8FAF5", titleColor: "#505A4D", subColor: "#879184", accent: "#BECBBD", titleFont: "Heebo", titleSize: 62, pattern: "leaf-pair" },
  { name: "Pure Minimalism 13 · Silver Thread", frameStyle: "thin", bg: "#FAFBFC", titleColor: "#4D5258", subColor: "#9198A1", accent: "#C3CAD2", titleFont: "Varela Round", titleSize: 58, pattern: "double-dot" },
  { name: "Pure Minimalism 14 · Warm Milk", frameStyle: "strip", bg: "#FFFDF9", titleColor: "#554C44", subColor: "#988B7D", accent: "#D7C7B6", titleFont: "Rubik", titleSize: 60, pattern: "polaroid-pin", titleY: 646, subtitleY: 706 },
  { name: "Pure Minimalism 15 · Bare Blush", frameStyle: "none", bg: "#FFF8FA", titleColor: "#5B4C52", subColor: "#A79099", accent: "#D9B6C2", titleFont: "Assistant", titleSize: 60, pattern: "bottom-whisper" },
];

const MODERN_DEFS = [
  { name: "Modern Digital 01 · Aqua Pulse", frameStyle: "thin", bgType: "gradient", bg: "#E8FDFF", bg2: "#EEF1FF", gradAngle: 32, titleColor: "#0F3F57", subColor: "#2D92A8", accent: "#00C4CC", titleFont: "Rubik", titleSize: 66, titleHalo: true, subHalo: true, pattern: "glow-corners" },
  { name: "Modern Digital 02 · Neon Bloom", frameStyle: "none", bgType: "radial", bg: "#FFF0FA", bg2: "#E8F7FF", titleColor: "#5A3C77", subColor: "#9673B8", accent: "#8B5CF6", detail: "#00C2D7", titleFont: "Heebo", titleSize: 64, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 0.8, pattern: "orbit-dots" },
  { name: "Modern Digital 03 · Sky Interface", frameStyle: "thin", bgImageName: "הייטק", bg: "#EFF8FF", titleColor: "#114862", subColor: "#3D8FB0", accent: "#35B6E8", detail: "#8B5CF6", titleFont: "Assistant", titleSize: 64, titleHalo: true, pattern: "digital-pill" },
  { name: "Modern Digital 04 · Mint Signal", frameStyle: "strip", bgType: "gradient", bg: "#F1FFF9", bg2: "#E5F7FF", gradAngle: 142, titleColor: "#14504A", subColor: "#2E8C83", accent: "#00C4A8", detail: "#64D2FF", titleFont: "Varela Round", titleSize: 61, titleHalo: true, subtitleY: 706, pattern: "signal-stack" },
  { name: "Modern Digital 05 · Soft Voltage", frameStyle: "thin", bgType: "radial", bg: "#F7F0FF", bg2: "#EAFBFF", titleColor: "#453267", subColor: "#7F67A7", accent: "#A855F7", detail: "#22D3EE", titleFont: "Rubik", titleSize: 65, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 1, pattern: "inner-outline" },
  { name: "Modern Digital 06 · Holo Stream", frameStyle: "none", bgType: "gradient", bg: "#F3FFFD", bg2: "#F2EDFF", gradAngle: 18, titleColor: "#194B5B", subColor: "#3E95AE", accent: "#06B6D4", detail: "#8B5CF6", titleFont: "Heebo", titleSize: 62, titleHalo: true, pattern: "holo-slice" },
  { name: "Modern Digital 07 · Rose UI", frameStyle: "thin", bgType: "gradient", bg: "#FFF2F8", bg2: "#F1FAFF", gradAngle: 128, titleColor: "#5C4060", subColor: "#996FA0", accent: "#EC4899", detail: "#38BDF8", titleFont: "Assistant", titleSize: 63, titleHalo: true, pattern: "floating-chip" },
  { name: "Modern Digital 08 · Arctic Grid", frameStyle: "classic", bgImageName: "מודרני", bg: "#F4FAFF", titleColor: "#123E5D", subColor: "#4A86A6", accent: "#38BDF8", detail: "#818CF8", titleFont: "Rubik", titleSize: 63, titleHalo: true, pattern: "soft-grid" },
  { name: "Modern Digital 09 · Lilac Wire", frameStyle: "none", bgType: "radial", bg: "#F8F2FF", bg2: "#F1FBFF", titleColor: "#49326E", subColor: "#8A6BB5", accent: "#A855F7", detail: "#22D3EE", titleFont: "Varela Round", titleSize: 62, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 0.8, pattern: "glow-corners" },
  { name: "Modern Digital 10 · Deep Screen", frameStyle: "thin", bgType: "gradient", bg: "#0F172A", bg2: "#1D3557", gradAngle: 48, titleColor: "#F8FAFC", subColor: "#A5E7FF", accent: "#22D3EE", detail: "#8B5CF6", titleFont: "Heebo", titleSize: 64, titleHalo: true, titleStroke: "#0B1220", titleStrokeWidth: 1.4, subHalo: true, pattern: "digital-pill" },
  { name: "Modern Digital 11 · Teal Halo", frameStyle: "strip", bgType: "gradient", bg: "#E6FFFB", bg2: "#EDF3FF", gradAngle: 76, titleColor: "#10515C", subColor: "#2D91A0", accent: "#14B8A6", detail: "#7C3AED", titleFont: "Assistant", titleSize: 63, titleHalo: true, subtitleY: 706, pattern: "orbit-dots" },
  { name: "Modern Digital 12 · Blue Wash", frameStyle: "none", bgImageName: "צבע מים כחול", bg: "#EFF8FF", titleColor: "#173E68", subColor: "#4E84B8", accent: "#0EA5E9", detail: "#7C3AED", titleFont: "Rubik", titleSize: 64, titleHalo: true, pattern: "holo-slice" },
  { name: "Modern Digital 13 · Magenta Circuit", frameStyle: "thin", bgType: "gradient", bg: "#FFF0F7", bg2: "#EAF3FF", gradAngle: 154, titleColor: "#5B2F68", subColor: "#A15AB4", accent: "#D946EF", detail: "#38BDF8", titleFont: "Heebo", titleSize: 62, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 0.8, pattern: "inner-outline" },
  { name: "Modern Digital 14 · Aurora Chip", frameStyle: "classic", bgType: "radial", bg: "#F4FFF6", bg2: "#F4F0FF", titleColor: "#215542", subColor: "#4AA187", accent: "#22C55E", detail: "#8B5CF6", titleFont: "Varela Round", titleSize: 61, titleHalo: true, pattern: "floating-chip" },
  { name: "Modern Digital 15 · Pulse Wave", frameStyle: "none", bgType: "gradient", bg: "#EFFFFD", bg2: "#F6EEFF", gradAngle: 8, titleColor: "#154A55", subColor: "#2A95A0", accent: "#06B6D4", detail: "#A855F7", titleFont: "Assistant", titleSize: 63, titleHalo: true, pattern: "signal-stack" },
];

const CLASSIC_DEFS = [
  { name: "Classic & Elegant 01 · Ivory Crest", frameStyle: "classic", bgImageName: "סרטוטי פרחים", bg: "#FCFAF4", titleColor: "#6C5539", subColor: "#9B8568", accent: "#B89B72", detail: "#F3E8D8", titleFont: "Frank Ruhl Libre", titleSize: 66, titleWeight: "bold", titleShadow: true, titleStroke: "#F4E8D5", titleStrokeWidth: 1.2, pattern: "crest-top" },
  { name: "Classic & Elegant 02 · Linen Emblem", frameStyle: "classic", bgImageName: "עלים אלגנטים", bg: "#FBF8F2", titleColor: "#5E4B38", subColor: "#8F7A63", accent: "#A98B65", detail: "#EFE3D4", titleFont: "Noto Serif Hebrew", titleSize: 64, titleWeight: "bold", titleShadow: true, titleStroke: "#F2E9DB", titleStrokeWidth: 1, pattern: "paper-plaque" },
  { name: "Classic & Elegant 03 · Parchment Gate", frameStyle: "classic", bgImageName: "פרחוני בצדדים", bg: "#F9F5EE", titleColor: "#66503C", subColor: "#99836A", accent: "#B49A74", detail: "#F1E6D8", titleFont: "Frank Ruhl Libre", titleSize: 65, titleWeight: "bold", titleShadow: true, titleStroke: "#F3E8D8", titleStrokeWidth: 1.2, pattern: "heritage-arch" },
  { name: "Classic & Elegant 04 · Antique Bloom", frameStyle: "classic", bgImageName: "כלניות מציצות", bg: "#FBF7F0", titleColor: "#704E4B", subColor: "#AA7B77", accent: "#C38F88", detail: "#F7E7E3", titleFont: "Noto Serif Hebrew", titleSize: 63, titleWeight: "bold", titleShadow: true, titleStroke: "#F8ECE8", titleStrokeWidth: 1, pattern: "side-florals" },
  { name: "Classic & Elegant 05 · Heritage Leaf", frameStyle: "classic", bgImageName: "עלים מסורטטים למטה", bg: "#F9F6EF", titleColor: "#5A4F41", subColor: "#8A7A6C", accent: "#A9977D", detail: "#EEE6D9", titleFont: "Frank Ruhl Libre", titleSize: 64, titleWeight: "bold", titleShadow: true, titleStroke: "#F2EADD", titleStrokeWidth: 1, pattern: "botanical-columns" },
  { name: "Classic & Elegant 06 · Paper Hall", frameStyle: "classic", bgImageName: "פרחוני למטה", bg: "#FBF8F3", titleColor: "#64503A", subColor: "#917C61", accent: "#B49A73", detail: "#EFE3D4", titleFont: "Noto Serif Hebrew", titleSize: 64, titleWeight: "bold", titleShadow: true, titleStroke: "#F6ECDF", titleStrokeWidth: 1.1, pattern: "crest-top" },
  { name: "Classic & Elegant 07 · Quiet Monument", frameStyle: "thin", bgImageName: "סרטוט פרחים", bg: "#FCF9F4", titleColor: "#5D4B3B", subColor: "#8B7866", accent: "#AE9270", detail: "#EFE3D7", titleFont: "Frank Ruhl Libre", titleSize: 62, titleWeight: "bold", titleShadow: true, titleStroke: "#F3E7D7", titleStrokeWidth: 1, pattern: "ornate-rule" },
  { name: "Classic & Elegant 08 · Marble Script", frameStyle: "classic", bgImageName: "פרחים מסוגננים", bg: "#FBF8F5", titleColor: "#684B47", subColor: "#9D746E", accent: "#C38B85", detail: "#F6E7E4", titleFont: "Noto Serif Hebrew", titleSize: 63, titleWeight: "bold", titleShadow: true, titleStroke: "#FAEEEB", titleStrokeWidth: 1, pattern: "paper-plaque" },
  { name: "Classic & Elegant 09 · Fine Invitation", frameStyle: "thin", bgImageName: "עלים ירוקים למטה", bg: "#FAF8F2", titleColor: "#55533F", subColor: "#7F8764", accent: "#9AA67A", detail: "#E8EAD9", titleFont: "Frank Ruhl Libre", titleSize: 62, titleWeight: "bold", titleShadow: true, titleStroke: "#F2F0E3", titleStrokeWidth: 1, pattern: "side-florals" },
  { name: "Classic & Elegant 10 · Golden Ceremony", frameStyle: "classic", bgImageName: "פרחוני בצדדים", bg: "#FCF8F0", titleColor: "#6E5635", subColor: "#A28758", accent: "#C2A16B", detail: "#F4E8D1", titleFont: "Noto Serif Hebrew", titleSize: 64, titleWeight: "bold", titleShadow: true, titleStroke: "#F7EEDC", titleStrokeWidth: 1.2, pattern: "heritage-arch" },
];

const BOLD_DEFS = [
  { name: "Creative & Bold 01 · Electric Bloom", frameStyle: "none", bgType: "gradient", bg: "#1D1633", bg2: "#45226E", gradAngle: 42, titleColor: "#FFF4A8", subColor: "#F8D6FF", accent: "#F97316", detail: "#22D3EE", titleFont: "Secular One", titleSize: 70, titleWeight: "bold", titleShadow: true, titleHalo: true, titleStroke: "#140C25", titleStrokeWidth: 2.4, pattern: "diagonal-bloom" },
  { name: "Creative & Bold 02 · Coral Clash", frameStyle: "strip", bgType: "gradient", bg: "#FFF1EE", bg2: "#FFD8E4", gradAngle: 150, titleColor: "#7A1E37", subColor: "#C53F6B", accent: "#F43F5E", detail: "#FB923C", titleFont: "Rubik", titleSize: 67, titleWeight: "bold", titleShadow: true, titleStroke: "#FFFFFF", titleStrokeWidth: 2, subtitleY: 706, pattern: "poster-strip" },
  { name: "Creative & Bold 03 · Aqua Reverb", frameStyle: "thin", bgType: "radial", bg: "#E8FFFF", bg2: "#C8E7FF", titleColor: "#083B52", subColor: "#137A96", accent: "#06B6D4", detail: "#8B5CF6", titleFont: "Heebo", titleSize: 68, titleWeight: "bold", titleShadow: true, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 1.8, pattern: "orbit-burst" },
  { name: "Creative & Bold 04 · Sunset Ribbon", frameStyle: "none", bgType: "gradient", bg: "#FFF3D6", bg2: "#FFC1C1", gradAngle: 34, titleColor: "#7C2D12", subColor: "#C2410C", accent: "#FB7185", detail: "#F59E0B", titleFont: "Secular One", titleSize: 68, titleWeight: "bold", titleShadow: true, titleStroke: "#FFF7ED", titleStrokeWidth: 2.2, pattern: "split-ribbon" },
  { name: "Creative & Bold 05 · Night Poster", frameStyle: "classic", bgType: "gradient", bg: "#111827", bg2: "#312E81", gradAngle: 20, titleColor: "#FFFFFF", subColor: "#C4B5FD", accent: "#22D3EE", detail: "#F472B6", titleFont: "Rubik", titleSize: 70, titleWeight: "bold", titleShadow: true, titleHalo: true, titleStroke: "#0B1120", titleStrokeWidth: 2.4, subHalo: true, pattern: "double-frame" },
  { name: "Creative & Bold 06 · Wild Garden", frameStyle: "strip", bgImageName: "פרחים מסוגננים", bg: "#FFF6FA", titleColor: "#7A1F49", subColor: "#C14E87", accent: "#EC4899", detail: "#14B8A6", titleFont: "Secular One", titleSize: 68, titleWeight: "bold", titleShadow: true, titleStroke: "#FFFFFF", titleStrokeWidth: 2, subtitleY: 706, pattern: "wild-corners" },
  { name: "Creative & Bold 07 · Hyper Frame", frameStyle: "thin", bgImageName: "מודרני", bg: "#EEF7FF", titleColor: "#10324D", subColor: "#2A7DA3", accent: "#0EA5E9", detail: "#A855F7", titleFont: "Heebo", titleSize: 69, titleWeight: "bold", titleShadow: true, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 1.8, pattern: "double-frame" },
  { name: "Creative & Bold 08 · Botanical Shock", frameStyle: "none", bgType: "gradient", bg: "#F1FFF3", bg2: "#FFF0F7", gradAngle: 138, titleColor: "#165B33", subColor: "#2C8B58", accent: "#22C55E", detail: "#D946EF", titleFont: "Rubik", titleSize: 67, titleWeight: "bold", titleShadow: true, titleStroke: "#FFFFFF", titleStrokeWidth: 2, pattern: "diagonal-bloom" },
  { name: "Creative & Bold 09 · Violet Orbit", frameStyle: "classic", bgType: "radial", bg: "#F7F0FF", bg2: "#D6DCFF", titleColor: "#36205F", subColor: "#7347B2", accent: "#8B5CF6", detail: "#22D3EE", titleFont: "Secular One", titleSize: 69, titleWeight: "bold", titleShadow: true, titleHalo: true, titleStroke: "#FFFFFF", titleStrokeWidth: 1.8, pattern: "orbit-burst" },
  { name: "Creative & Bold 10 · Hot Contrast", frameStyle: "strip", bgType: "gradient", bg: "#FFF5F2", bg2: "#FFE3A3", gradAngle: 8, titleColor: "#7A1C15", subColor: "#A84A1E", accent: "#EF4444", detail: "#F59E0B", titleFont: "Rubik", titleSize: 67, titleWeight: "bold", titleShadow: true, titleStroke: "#FFFFFF", titleStrokeWidth: 2.2, subtitleY: 706, pattern: "poster-strip" },
];

function minimalDecor(id, pattern, def, layout) {
  const accent = def.accent;
  const soft = def.detail || withAlpha(accent, 0.26);
  const quiet = withAlpha(accent, 0.14);
  const y = layout.dateY;
  switch (pattern) {
    case "center-heart": return [ruleObj(`${id}-l`, 416, y, 108, 2, soft), ruleObj(`${id}-r`, 608, y, 108, 2, soft), textDecorObj(`${id}-heart`, "♡", 512, y, 21, accent, { emoName: "לב", opacity: 0.92 })];
    case "leaf-pair": return [textDecorObj(`${id}-leaf-l`, "🌿", 436, y, 18, accent, { emoName: "עלה", opacity: 0.7 }), textDecorObj(`${id}-leaf-r`, "🌿", 588, y, 18, accent, { emoName: "עלה", opacity: 0.7, scaleX: -1 }), circleObj(`${id}-dot`, 512, layout.hasFrame ? layout.bandTop + 18 : layout.titleY - 40, 4, quiet, { opacity: 0.65 })];
    case "quiet-corners": return [ruleObj(`${id}-tlh`, 120, 82, 54, 3, quiet), ruleObj(`${id}-tlv`, 92, 110, 3, 54, quiet), ruleObj(`${id}-trh`, 904, 82, 54, 3, quiet), ruleObj(`${id}-trv`, 932, 110, 3, 54, quiet)];
    case "soft-pill": return [rectObj(`${id}-pill`, 512, y, 220, 34, quiet, { rx: 17, ry: 17, opacity: 0.55 }), circleObj(`${id}-dot-l`, 408, y, 3, accent, { opacity: 0.65 }), circleObj(`${id}-dot-r`, 616, y, 3, accent, { opacity: 0.65 })];
    case "double-dot": return [circleObj(`${id}-d1`, 372, layout.titleY - 10, 4, accent, { opacity: 0.6 }), circleObj(`${id}-d2`, 652, layout.titleY - 10, 4, accent, { opacity: 0.6 }), ruleObj(`${id}-under`, 512, layout.decorY, 124, 2, soft, { opacity: 0.5 })];
    case "polaroid-pin": return [rectObj(`${id}-pin`, 512, 56, 54, 10, quiet, { rx: 5, ry: 5, opacity: 0.6 }), ruleObj(`${id}-sub-l`, 430, y + 6, 64, 2, soft), ruleObj(`${id}-sub-r`, 594, y + 6, 64, 2, soft)];
    case "bottom-whisper": return [ruleObj(`${id}-line`, 512, layout.decorY, 240, 2, soft), circleObj(`${id}-c1`, 392, layout.decorY, 3, accent, { opacity: 0.45 }), circleObj(`${id}-c2`, 632, layout.decorY, 3, accent, { opacity: 0.45 })];
    case "star-trace": return [textDecorObj(`${id}-star`, "✦", 512, layout.titleY - 42, 16, accent, { emoName: "כוכב", opacity: 0.78 }), ruleObj(`${id}-l`, 404, y, 78, 2, soft), ruleObj(`${id}-r`, 620, y, 78, 2, soft)];
    default: return [];
  }
}

function modernDecor(id, pattern, def, idx, iconsByCategory, layout) {
  const accent = def.accent;
  const accent2 = def.detail || withAlpha(def.titleColor || accent, 0.3);
  switch (pattern) {
    case "glow-corners": return [ruleObj(`${id}-tlh`, 136, 76, 64, 4, withAlpha(accent, 0.42)), ruleObj(`${id}-tlv`, 106, 106, 4, 64, withAlpha(accent, 0.42)), ruleObj(`${id}-trh`, 888, 76, 64, 4, withAlpha(def.subColor || accent, 0.42)), ruleObj(`${id}-trv`, 918, 106, 4, 64, withAlpha(def.subColor || accent, 0.42)), ruleObj(`${id}-under`, 512, layout.decorY, 140, 4, withAlpha(accent, 0.22))];
    case "orbit-dots": return [circleObj(`${id}-orb-1`, 356, layout.overlay ? 650 : layout.cornerY, 48, withAlpha(accent, 0.1)), circleObj(`${id}-orb-2`, 668, layout.overlay ? 648 : layout.cornerY, 42, withAlpha(def.subColor || accent, 0.12)), circleObj(`${id}-orb-3`, 704, 92, 22, withAlpha(accent, 0.12))];
    case "digital-pill": return [rectObj(`${id}-pill`, 512, layout.dateY, 252, 38, withAlpha(accent, 0.14), { rx: 19, ry: 19 }), ruleObj(`${id}-chip-l`, 172, 118, 46, 6, withAlpha(accent, 0.36)), ruleObj(`${id}-chip-r`, 852, 118, 46, 6, withAlpha(def.subColor || accent, 0.36))];
    case "signal-stack": return [ruleObj(`${id}-v1`, 118, 228, 6, 150, withAlpha(accent, 0.3)), ruleObj(`${id}-v2`, 906, 214, 6, 112, withAlpha(def.subColor || accent, 0.28)), ruleObj(`${id}-under`, 512, layout.decorY, 180, 4, withAlpha(accent, 0.28))];
    case "inner-outline": return [rectObj(`${id}-outline`, 512, 384, 944, 692, "transparent", { stroke: withAlpha(accent, 0.35), strokeWidth: 2, rx: 18, ry: 18 }), ruleObj(`${id}-cut`, 512, layout.decorY - 8, 180, 5, withAlpha(def.subColor || accent, 0.28))];
    case "holo-slice": return [rectObj(`${id}-slice`, 168, 164, 240, 34, withAlpha(accent, 0.12), { angle: -24, rx: 17, ry: 17 }), rectObj(`${id}-slice-2`, 856, 198, 220, 26, withAlpha(def.subColor || accent, 0.13), { angle: -24, rx: 13, ry: 13 }), circleObj(`${id}-pulse`, 512, layout.decorY - 16, 14, withAlpha(accent, 0.18))];
    case "soft-grid": return [ruleObj(`${id}-g1`, 330, 122, 2, 96, withAlpha(accent, 0.18)), ruleObj(`${id}-g2`, 364, 122, 2, 96, withAlpha(accent, 0.14)), ruleObj(`${id}-g3`, 694, layout.overlay ? 604 : layout.cornerY - 18, 2, 74, withAlpha(def.subColor || accent, 0.18)), ruleObj(`${id}-g4`, 728, layout.overlay ? 604 : layout.cornerY - 18, 2, 74, withAlpha(def.subColor || accent, 0.14))];
    case "floating-chip": return [rectObj(`${id}-chip`, 834, 88, 124, 34, withAlpha(accent, 0.14), { rx: 17, ry: 17 }), textDecorObj(`${id}-spark`, "✦", 834, 88, 14, accent, { emoName: "כוכב", opacity: 0.85 }), ruleObj(`${id}-base`, 512, layout.decorY, 116, 4, accent2)];
    default: return [];
  }
}

function classicDecor(id, pattern, def, idx, iconsByCategory, layout) {
  const accent = def.accent;
  const lowAccent = withAlpha(accent, 0.28);
  const wedding = iconsByCategory["חתונה"] || [];
  const flowers = iconsByCategory["פרחים"] || [];
  const plants = iconsByCategory["צמחים"] || [];
  switch (pattern) {
    case "crest-top": return [iconObj(wedding[idx % Math.max(1, wedding.length)], 512, 78, 0.11, 0.11, `${id}-crest`, { opacity: 0.78 }), ruleObj(`${id}-rule`, 512, layout.decorY, 240, 2, lowAccent)];
    case "paper-plaque": return [rectObj(`${id}-plaque`, 512, Math.round((layout.titleY + layout.dateY) / 2), 380, 94, withAlpha(def.detail || accent, 0.12), { rx: 24, ry: 24 }), ruleObj(`${id}-rule-l`, 360, layout.dateY, 76, 2, lowAccent), ruleObj(`${id}-rule-r`, 664, layout.dateY, 76, 2, lowAccent)];
    case "side-florals": return [iconObj(flowers[(idx + 1) % Math.max(1, flowers.length)], 82, layout.cornerY, 0.16, 0.16, `${id}-floral-l`, { opacity: 0.72 }), iconObj(flowers[(idx + 3) % Math.max(1, flowers.length)], 944, layout.cornerY, 0.16, 0.16, `${id}-floral-r`, { opacity: 0.62, angle: 10 })];
    case "heritage-arch": return [ruleObj(`${id}-arch-top`, 512, layout.titleY - 42, 220, 2, lowAccent), ruleObj(`${id}-arch-l`, 404, layout.titleY - 4, 2, 68, lowAccent), ruleObj(`${id}-arch-r`, 620, layout.titleY - 4, 2, 68, lowAccent), circleObj(`${id}-dot-top`, 512, layout.titleY - 42, 4, accent, { opacity: 0.52 })];
    case "botanical-columns": return [iconObj(plants[idx % Math.max(1, plants.length)], 108, layout.cornerY, 0.18, 0.18, `${id}-leaf-l`, { opacity: 0.24 }), iconObj(plants[(idx + 2) % Math.max(1, plants.length)], 916, layout.cornerY, 0.18, 0.18, `${id}-leaf-r`, { opacity: 0.24, angle: 180 })];
    case "ornate-rule": return [ruleObj(`${id}-rule`, 512, layout.decorY, 280, 2, lowAccent), textDecorObj(`${id}-mark`, "✦", 512, layout.decorY, 16, accent, { emoName: "כוכב", opacity: 0.72 }), circleObj(`${id}-dot-l`, 378, layout.decorY, 3, accent, { opacity: 0.4 }), circleObj(`${id}-dot-r`, 646, layout.decorY, 3, accent, { opacity: 0.4 })];
    default: return [];
  }
}

function boldDecor(id, pattern, def, idx, iconsByCategory, layout) {
  const accent = def.accent;
  const accent2 = def.detail || def.subColor || def.titleColor;
  const flowers = iconsByCategory["פרחים"] || [];
  const hearts = iconsByCategory["לבבות"] || [];
  const plants = iconsByCategory["צמחים"] || [];
  switch (pattern) {
    case "diagonal-bloom": return [rectObj(`${id}-slash`, 162, 196, 320, 46, withAlpha(accent, 0.18), { angle: -26, rx: 23, ry: 23 }), iconObj(flowers[idx % Math.max(1, flowers.length)], 66, layout.overlay ? 624 : layout.cornerY, 0.22, 0.22, `${id}-bloom`, { opacity: 0.92, angle: -8 }), iconObj(flowers[(idx + 2) % Math.max(1, flowers.length)], 944, 124, 0.14, 0.14, `${id}-bloom-2`, { opacity: 0.7, angle: 18 })];
    case "double-frame": return [rectObj(`${id}-outer`, 512, 384, 952, 700, "transparent", { stroke: withAlpha(accent, 0.48), strokeWidth: 3, rx: 22, ry: 22 }), rectObj(`${id}-inner`, 512, 384, 900, 648, "transparent", { stroke: withAlpha(accent2, 0.38), strokeWidth: 2, rx: 18, ry: 18 })];
    case "poster-strip": return [rectObj(`${id}-strip`, 512, layout.dateY + 4, 508, 52, withAlpha(accent, 0.2), { rx: 26, ry: 26 }), ruleObj(`${id}-left`, 242, 130, 100, 8, withAlpha(accent2, 0.34), { angle: -14 }), ruleObj(`${id}-right`, 786, layout.overlay ? 596 : layout.bandTop + 30, 132, 8, withAlpha(accent, 0.34), { angle: -14 })];
    case "orbit-burst": return [circleObj(`${id}-orb-1`, 126, 130, 86, withAlpha(accent, 0.14)), circleObj(`${id}-orb-2`, 924, layout.overlay ? 648 : layout.cornerY, 72, withAlpha(accent2, 0.16)), circleObj(`${id}-orb-3`, 812, 120, 24, withAlpha(accent, 0.18)), textDecorObj(`${id}-spark`, "✦", 812, 120, 20, accent, { emoName: "כוכב", opacity: 0.95 })];
    case "split-ribbon": return [rectObj(`${id}-left`, 164, layout.overlay ? 616 : layout.bandTop + 26, 246, 36, withAlpha(accent, 0.18), { angle: -8, rx: 18, ry: 18 }), rectObj(`${id}-right`, 860, 148, 246, 36, withAlpha(accent2, 0.18), { angle: -8, rx: 18, ry: 18 }), iconObj(plants[(idx + 1) % Math.max(1, plants.length)], 940, layout.overlay ? 618 : layout.cornerY, 0.18, 0.18, `${id}-leaf`, { opacity: 0.8, angle: 18 })];
    case "wild-corners": return [iconObj(hearts[idx % Math.max(1, hearts.length)], 74, 82, 0.16, 0.16, `${id}-tl`, { opacity: 0.8, angle: -12 }), iconObj(flowers[(idx + 4) % Math.max(1, flowers.length)], 952, layout.overlay ? 620 : layout.cornerY, 0.2, 0.2, `${id}-br`, { opacity: 0.92, angle: 10 }), ruleObj(`${id}-under`, 512, layout.decorY, 168, 5, withAlpha(accent, 0.34))];
    default: return [];
  }
}

function createTemplate(def, id, titleText, dateText, category, decorators, layout) {
  return {
    id,
    name: def.name,
    heName: def.heName || def.name,
    legacyName: def.name,
    isBuiltin: true,
    templateSource: "system",
    templateStyle: "wedding",
    templateCategory: category,
    sourceMode: "landscape",
    frameStyle: def.frameStyle || "classic",
    bg: def.bg || "#ffffff",
    bgType: def.bgType || "solid",
    bg2: def.bg2 || "#c8a06e",
    gradAngle: def.gradAngle || 135,
    bgImageName: def.bgImageName || null,
    ac: def.accent || def.titleColor || "#8B5CF6",
    textLayers: [
      textLayer(`${id}-title`, titleText, 512, layout.titleY, frameAwareTitleProps(def, layout)),
      textLayer(`${id}-date`, dateText, 512, layout.dateY, frameAwareDateProps(def, layout)),
    ],
    objects: cleanItems(decorators),
  };
}

export function buildBuiltInTemplates({ iconsByCategory = {} } = {}) {
  const minimal = MINIMAL_DEFS.map((def, idx) => {
    const layout = getTextLayout(def);
    const namedDef = { ...def, heName: MINIMAL_HE_NAMES[idx] || def.name };
    return createTemplate(namedDef, `pm${idx + 1}`, SAMPLE_NAMES[idx % SAMPLE_NAMES.length], SAMPLE_DATES[idx % SAMPLE_DATES.length], "pure_minimalism", minimalDecor(`pm${idx + 1}`, namedDef.pattern, namedDef, layout), layout);
  });
  const modern = MODERN_DEFS.map((def, idx) => {
    const layout = getTextLayout(def);
    const namedDef = { ...def, heName: MODERN_HE_NAMES[idx] || def.name };
    return createTemplate(namedDef, `md${idx + 1}`, SAMPLE_NAMES[(idx + 3) % SAMPLE_NAMES.length], SAMPLE_DATES[idx % SAMPLE_DATES.length], "modern_digital", modernDecor(`md${idx + 1}`, namedDef.pattern, namedDef, idx, iconsByCategory, layout), layout);
  });
  const classic = CLASSIC_DEFS.map((def, idx) => {
    const layout = getTextLayout(def);
    const namedDef = { ...def, heName: CLASSIC_HE_NAMES[idx] || def.name };
    return createTemplate(namedDef, `ce${idx + 1}`, SAMPLE_NAMES[(idx + 6) % SAMPLE_NAMES.length], SAMPLE_DATES[idx % SAMPLE_DATES.length], "classic_elegant", classicDecor(`ce${idx + 1}`, namedDef.pattern, namedDef, idx, iconsByCategory, layout), layout);
  });
  const bold = BOLD_DEFS.map((def, idx) => {
    const layout = getTextLayout(def);
    const namedDef = { ...def, heName: BOLD_HE_NAMES[idx] || def.name };
    return createTemplate(namedDef, `cb${idx + 1}`, SAMPLE_NAMES[(idx + 9) % SAMPLE_NAMES.length], SAMPLE_DATES[idx % SAMPLE_DATES.length], "creative_bold", boldDecor(`cb${idx + 1}`, namedDef.pattern, namedDef, idx, iconsByCategory, layout), layout);
  });
  return [...minimal, ...modern, ...classic, ...bold];
}
