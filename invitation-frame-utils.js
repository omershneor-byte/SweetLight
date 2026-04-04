import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { buildClassicTextLayout, getClassicFrameRegions, planClassicDecorationLayout } from "./frame-composition-utils.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const INVITATION_PDF_RENDER_SCALE = 5;

function clampNum(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => clampNum(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{3,6}$/.test(normalized)) return { r: 255, g: 255, b: 255 };
  const full = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function mixHexColors(leftHex, rightHex, amount = 0.5) {
  const left = hexToRgb(leftHex);
  const right = hexToRgb(rightHex);
  const t = clampNum(amount, 0, 1);
  return rgbToHex(
    left.r + (right.r - left.r) * t,
    left.g + (right.g - left.g) * t,
    left.b + (right.b - left.b) * t
  );
}

function rgbaFromHex(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clampNum(alpha, 0, 1)})`;
}

function looksLikeUtf8Mojibake(text) {
  const sample = String(text || "");
  if (!sample) return false;
  const suspiciousPairs = sample.match(/[ÃÐÑØ×Ù][\u0080-\u00BF]/g) || [];
  const suspiciousChars = sample.match(/[ÃÐÑØ×Ù]/g) || [];
  return suspiciousPairs.length >= 2 || suspiciousChars.length >= Math.max(3, Math.floor(sample.length / 5));
}

function repairInvitationMojibake(text) {
  const sample = String(text || "");
  if (!(looksLikeUtf8Mojibake(sample) || looksLikeUtf8MojibakeEnhanced(sample))) return sample;
  try {
    const bytes = Uint8Array.from(Array.from(sample, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "");
    const currentHebrewCount = (sample.match(/[\u0590-\u05FF]/g) || []).length;
    const decodedHebrewCount = (decoded.match(/[\u0590-\u05FF]/g) || []).length;
    const decodedLatinCount = (decoded.match(/[A-Za-z]/g) || []).length;
    const currentLatinCount = (sample.match(/[A-Za-z]/g) || []).length;
    const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
    if ((decodedHebrewCount > currentHebrewCount || decodedLatinCount > currentLatinCount) && replacementCount <= 2) {
      return decoded;
    }
  } catch (error) {
    console.warn("Failed to repair invitation text mojibake", error);
  }
  return sample;
}

function cleanInvitationText(text) {
  return collapseSeparatedLetterRuns(repairInvitationMojibake(String(text || "")))
    .replace(/\s+/g, " ")
    .replace(/[|]{2,}/g, "|")
    .trim();
}

function stripOuterQuotes(text) {
  return String(text || "").replace(/^[\s"'״׳]+|[\s"'״׳]+$/g, "").trim();
}

function hasHebrew(text) {
  return /[\u0590-\u05FF]/.test(String(text || ""));
}

function hasLatin(text) {
  return /[A-Za-z]/.test(String(text || ""));
}

function inferTextDirection(text, fallback = "rtl") {
  const sample = String(text || "");
  if (hasHebrew(sample)) return "rtl";
  if (hasLatin(sample)) return "ltr";
  return fallback;
}

function tokenizeInvitationWords(text) {
  return cleanInvitationText(text)
    .replace(/([&/])/g, " $1 ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isConnectorToken(token) {
  const normalized = String(token || "").toLowerCase();
  return normalized === "&" || normalized === "/" || normalized === "and" || normalized === "ו";
}

function hasInvitationConnector(text) {
  const normalized = cleanInvitationText(text);
  if (/[&/]/.test(normalized)) return true;
  if (/\band\b/i.test(normalized)) return true;
  const tokens = tokenizeInvitationWords(normalized);
  return tokens.some((token, index) => index > 0 && /^ו[\u0590-\u05FF]{2,}$/u.test(token));
}

function lineLooksLikeBrokenNameFragment(lineText, words, isWedding = true) {
  const sample = cleanInvitationText(lineText);
  const plainWords = Array.isArray(words) ? words.filter((word) => !isConnectorToken(word)) : [];
  if (!sample || !plainWords.length) return true;
  if (plainWords.some((word) => word.length <= 1)) return true;
  if (plainWords.some((word) => /^[\u0590-\u05FF]{1,2}$/u.test(word)) && !hasInvitationConnector(sample)) return true;
  if (/^[,;:!?'"״׳-]/.test(sample) || /[,;:!?'"״׳-]$/.test(sample)) return true;
  if (isWedding && !hasInvitationConnector(sample) && plainWords.length >= 2 && plainWords.some((word) => word.length <= 2)) {
    return true;
  }
  return false;
}

function lineHasInvitationMetaWords(text) {
  return /(×ž×–×ž×™×(?:™×|×•×ª)|×©×ž×—×™×|×©×ž×—×•×ª|××¨×’×©×™×|××¨×’×©×•×ª|×œ×”×–×ž×™××›×|×œ×”×–×ž×™××›×Ÿ|×‘××”×‘×”|×—×•×¤×”|×—×ª×•××”|×§×‘×œ×ª ×¤×™×|××™×¨×•×¢×™×|××•×œ×|×’×Ÿ|×ž×©×¤×—×ª|×ž×©×¤×—×•×ª|××©×ž×—|×œ×—×’×•×’|×‘×•××•|××™×ª××•|save the date|celebrate|invite|you are invited|join us|reception|ceremony|venue|family of)/i
    .test(cleanInvitationText(text));
}

function countInvitationPlainWords(text) {
  return tokenizeInvitationWords(text).filter((word) => !isConnectorToken(word)).length;
}

function lineLooksLikeStrongNameCandidate(line, eventType, dateLine = null) {
  if (!line?.text) return false;
  const cleanText = cleanInvitationText(line.text);
  const words = tokenizeInvitationWords(cleanText).filter((word) => !isConnectorToken(word));
  if (!cleanText || !words.length) return false;
  if (/\d/.test(cleanText)) return false;
  if (lineHasInvitationMetaWords(cleanText)) return false;
  if (cleanText.length > 32) return false;
  if (words.length > 4) return false;
  if (lineLooksLikeBrokenNameFragment(cleanText, words, eventType === "wedding")) return false;
  if (dateLine && Number.isFinite(dateLine.top) && (line.top || 0) > (dateLine.top + Math.max(18, (dateLine.fontSize || 0) * 0.3))) {
    return false;
  }
  return true;
}

function refineInvitationNameLinesSimple(nameLines, dateLine, eventType) {
  const source = Array.isArray(nameLines) ? nameLines.filter(Boolean) : [];
  if (!source.length) return [];
  const centerX = source.reduce((sum, line) => sum + lineMidX(line), 0) / Math.max(1, source.length);
  const filtered = source
    .filter((line) => lineLooksLikeStrongNameCandidate(line, eventType, dateLine))
    .sort((left, right) => (left.top || 0) - (right.top || 0));
  const working = filtered.length ? filtered : source;
  if (working.length <= 1) return working.slice(0, 1);

  const connectorOnly = (line) => /^(?:&|×•)$/u.test(cleanInvitationText(line?.text || "").replace(/\s+/g, ""));
  const sequenceLooksValid = (sequence) => {
    if (!sequence.length || sequence.length > 3) return false;
    const joined = joinInvitationNameLines(sequence);
    const plainWordCount = countInvitationPlainWords(joined);
    if (!joined || plainWordCount < 2 || plainWordCount > 4) return false;
    if (lineHasInvitationMetaWords(joined)) return false;
    if (/\d/.test(joined)) return false;
    if (sequence.length === 1) return lineLooksLikeStrongNameCandidate(sequence[0], eventType, dateLine);
    const nonConnectorLines = sequence.filter((line) => !connectorOnly(line));
    if (nonConnectorLines.length < 1 || nonConnectorLines.length > 2) return false;
    return nonConnectorLines.every((line) => lineLooksLikeStrongNameCandidate(line, eventType, dateLine));
  };

  const candidates = [];
  for (let start = 0; start < working.length; start += 1) {
    for (let end = start; end < Math.min(working.length, start + 3); end += 1) {
      const sequence = working.slice(start, end + 1);
      if (!sequenceLooksValid(sequence)) continue;
      const joined = joinInvitationNameLines(sequence);
      const baseScore = scoreInvitationNameLineSet(sequence, centerX, dateLine);
      const connectorBonus = hasInvitationConnector(joined) ? 36 : 0;
      const compactBonus = Math.max(0, 22 - Math.abs(joined.length - 14));
      const linePenalty = Math.max(0, sequence.length - 2) * 10;
      candidates.push({
        sequence,
        score: baseScore + connectorBonus + compactBonus - linePenalty,
      });
    }
  }

  if (candidates.length) {
    return [...candidates]
      .sort((left, right) => right.score - left.score)[0]
      .sequence;
  }

  return [
    [...working]
      .sort((left, right) => {
        const leftScore = scoreInvitationNameCandidate(left, centerX).score;
        const rightScore = scoreInvitationNameCandidate(right, centerX).score;
        return rightScore - leftScore;
      })[0],
  ].filter(Boolean);
}

function extractNameKeywords(text) {
  const tokens = tokenizeInvitationWords(text).filter((token) => !isConnectorToken(token));
  const keywords = new Set();
  tokens.forEach((token, index) => {
    const normalized = token.replace(/^[\s"'״׳]+|[\s"'״׳]+$/g, "").toLowerCase();
    if (normalized.length >= 2) keywords.add(normalized);
    if (index > 0 && /^ו[\u0590-\u05FF]{2,}$/u.test(normalized)) {
      keywords.add(normalized.slice(1));
    }
  });
  return [...keywords].filter((word) => word.length >= 2);
}

function normalizeInvitationDate(text) {
  const raw = cleanInvitationText(text)
    .replace(/(\d)\s+(?=\d)/g, "$1")
    .replace(/\\/g, "/")
    .replace(/\s*([./-])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const numeric = raw.match(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/);
  if (numeric) return numeric[0];
  return raw;
}

function classifySeparatedRunToken(token) {
  const sample = String(token || "");
  if (!sample || sample.length !== 1) return "";
  if (/[\u0590-\u05FF]/u.test(sample)) return "hebrew";
  if (/[A-Za-z]/.test(sample)) return "latin";
  if (/\d/.test(sample)) return "digit";
  return "";
}

function collapseSeparatedLetterRuns(text) {
  const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return String(text || "").trim();
  const merged = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const tokenType = classifySeparatedRunToken(tokens[index]);
    if (!tokenType) {
      merged.push(tokens[index]);
      continue;
    }
    let end = index;
    while (end + 1 < tokens.length && classifySeparatedRunToken(tokens[end + 1]) === tokenType) {
      end += 1;
    }
    const run = tokens.slice(index, end + 1);
    if (run.length >= 3) merged.push(run.join(""));
    else merged.push(...run);
    index = end;
  }
  return merged.join(" ");
}

function looksLikeUtf8MojibakeEnhanced(text) {
  const sample = String(text || "");
  if (!sample) return false;
  if (hasHebrew(sample)) return false;
  const suspiciousPairs = sample.match(/[\u00C0-\u00FF][\u0080-\u00BF]/g) || [];
  const latinSupplementChars = sample.match(/[\u00C0-\u00FF]/g) || [];
  const repeatedCrosses = sample.match(/[×ÃÐÑØÙ]/g) || [];
  return suspiciousPairs.length >= 2
    || repeatedCrosses.length >= 2
    || latinSupplementChars.length >= Math.max(3, Math.floor(sample.length / 4));
}

function dedupeInvitationLines(lines) {
  const seen = new Set();
  return (Array.isArray(lines) ? lines : []).filter((line) => {
    const key = `${cleanInvitationText(line.text).toLowerCase()}|${Math.round(line.left || 0)}|${Math.round(line.top || 0)}|${Math.round(line.fontSize || 0)}|${line.pageNumber || 1}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPaletteFromCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const buckets = new Map();
  const step = Math.max(1, Math.floor(Math.min(width, height) / 90));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 180) continue;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
      const weight = brightness > 242 ? 0.15 : brightness < 28 ? 0.4 : 1 + spread / 120;
      buckets.set(key, (buckets.get(key) || 0) + weight);
    }
  }
  const colors = [...buckets.entries()]
    .map(([key, weight]) => {
      const [r, g, b] = key.split(",").map(Number);
      const brightness = (r + g + b) / 3;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      return { hex: rgbToHex(r, g, b), weight, brightness, spread };
    })
    .sort((a, b) => b.weight - a.weight);
  const dominant = colors[0]?.hex || "#f6f1eb";
  const accent = colors.find((color) => color.spread >= 26 && color.brightness >= 55 && color.brightness <= 225)?.hex
    || colors.find((color) => color.brightness < 210)?.hex
    || "#c9a96e";
  const secondary = colors.find((color) => color.hex !== accent && color.brightness >= 80 && color.brightness <= 235)?.hex
    || mixHexColors(accent, dominant, 0.4);
  const backgroundBase = colors.find((color) => color.brightness >= 228)?.hex
    || mixHexColors(dominant, "#ffffff", 0.78);
  const textColor = (() => {
    const { r, g, b } = hexToRgb(accent);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.62 ? mixHexColors(accent, "#1c1c1c", 0.65) : accent;
  })();
  return { dominant, accent, secondary, backgroundBase, textColor };
}

function joinRowChunks(chunks) {
  if (!chunks.length) return "";
  let text = cleanInvitationText(chunks[0].text);
  let prev = chunks[0];
  for (let index = 1; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const nextText = cleanInvitationText(chunk.text);
    if (!nextText) continue;
    const prevText = cleanInvitationText(prev.text);
    const prevEnd = prev.x + prev.width;
    const gap = chunk.x - prevEnd;
    const baseFont = Math.max(10, Math.min(prev.fontSize || 0, chunk.fontSize || 0));
    const tightGap = gap < baseFont * 0.18;
    const connectorJoin = /[&/\-]$/.test(prevText) || prevText === "ו" || prevText.endsWith("־");
    const punctuationJoin = /^[&/\-.,:;!?״׳'"()]/.test(nextText);
    const separator = tightGap || connectorJoin || punctuationJoin ? "" : " ";
    text = `${text}${separator}${nextText}`.trim();
    prev = chunk;
  }
  return cleanInvitationText(text);
}

function extractInvitationTextLines(items, viewport) {
  const rows = [];
  items.forEach((item) => {
    const text = cleanInvitationText(item.str);
    if (!text) return;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontSize = Math.max(12, Math.hypot(tx[2], tx[3]));
    const x = tx[4];
    const y = tx[5];
    const width = Math.max(fontSize * 0.65 * text.length, (item.width || text.length * 4) * viewport.scale);
    const row = rows.find((candidate) => Math.abs(candidate.anchorY - y) < Math.max(12, fontSize * 0.45));
    const chunk = { text, x, y, fontSize, width };
    if (row) {
      row.chunks.push(chunk);
      row.anchorY = (row.anchorY + y) / 2;
      row.fontSize = Math.max(row.fontSize, fontSize);
    } else {
      rows.push({ anchorY: y, fontSize, chunks: [chunk] });
    }
  });
  return rows
    .map((row) => {
      const chunks = [...row.chunks]
        .sort((a, b) => a.x - b.x)
        .map((chunk) => ({ ...chunk, text: cleanInvitationText(chunk.text) }))
        .filter((chunk) => chunk.text);
      const text = joinRowChunks(chunks);
      const left = Math.min(...chunks.map((chunk) => chunk.x));
      const width = Math.max(...chunks.map((chunk) => chunk.x + chunk.width)) - left;
      const top = row.anchorY;
      return { text, left, top, width, fontSize: row.fontSize, chunks };
    })
    .filter((line) => line.text.length >= 2)
    .sort((a, b) => a.top - b.top);
}

function selectChunksForMatch(line, matchText, options = {}) {
  const chunks = Array.isArray(line?.chunks) ? line.chunks : [];
  if (!chunks.length) return [];
  if (!matchText) return chunks;
  const exactChunkSequence = findMatchedChunkSequence(line, matchText);
  if (exactChunkSequence.length) return exactChunkSequence;
  const segment = approximateMatchedSegment(line, matchText);
  if (!segment) return chunks;
  const padding = options.segmentPadding ?? Math.max(6, Math.round((line?.fontSize || 0) * 0.18));
  const segmentLeft = segment.left - padding;
  const segmentRight = segment.left + segment.width + padding;
  const selected = chunks.filter((chunk) => {
    const chunkLeft = chunk.x;
    const chunkRight = chunk.x + chunk.width;
    return chunkRight >= segmentLeft && chunkLeft <= segmentRight;
  });
  return selected.length ? selected : chunks;
}

function findMatchedChunkSequence(line, matchText) {
  const chunks = Array.isArray(line?.chunks) ? line.chunks : [];
  const targetText = normalizeInvitationMatchText(matchText || "");
  if (!chunks.length || !targetText) return [];
  const normalizedChunks = chunks
    .map((chunk) => ({
      chunk,
      normalized: normalizeInvitationMatchText(chunk.text || ""),
    }))
    .filter((entry) => entry.normalized);
  if (!normalizedChunks.length) return [];
  const spans = [];
  let cursor = 0;
  normalizedChunks.forEach((entry) => {
    const start = cursor;
    cursor += entry.normalized.length;
    spans.push({
      ...entry,
      start,
      end: cursor,
    });
  });
  const joinedText = spans.map((entry) => entry.normalized).join("");
  const startIndex = joinedText.indexOf(targetText);
  if (startIndex < 0) return [];
  const endIndex = startIndex + targetText.length;
  return spans
    .filter((entry) => entry.end > startIndex && entry.start < endIndex)
    .map((entry) => entry.chunk);
}

function buildChunkCropRect(sourceCanvas, lines, options = {}) {
  const selectedChunks = (Array.isArray(lines) ? lines : [])
    .flatMap((line) => selectChunksForMatch(line, options.matchText, options))
    .filter(Boolean);
  if (!selectedChunks.length || !sourceCanvas) return null;
  const fontSize = Math.max(...selectedChunks.map((chunk) => chunk.fontSize || 0), 12);
  const padX = Math.round(fontSize * (options.padXFactor ?? 0.18));
  const padTop = Math.round(fontSize * (options.padTopFactor ?? 0.14));
  const padBottom = Math.round(fontSize * (options.padBottomFactor ?? 0.16));
  if (Array.isArray(lines) && lines.length === 1 && options.matchText) {
    const segment = approximateMatchedSegment(lines[0], options.matchText);
    if (segment) {
      const chunkLeft = Math.min(...selectedChunks.map((chunk) => chunk.x));
      const chunkRight = Math.max(...selectedChunks.map((chunk) => chunk.x + chunk.width));
      const chunkWidth = chunkRight - chunkLeft;
      const cleanLineText = cleanInvitationText(lines[0].text);
      const cleanMatchText = cleanInvitationText(options.matchText);
      const shouldTighten = chunkWidth > (segment.width * 1.22)
        || cleanLineText.length > (cleanMatchText.length + 3);
      if (shouldTighten) {
        const cropX = Math.max(0, segment.left - padX);
        const cropY = Math.max(
          0,
          Math.min(...selectedChunks.map((chunk) => chunk.y - ((chunk.fontSize || fontSize) * (options.topFontFactor ?? 0.82)))) - padTop
        );
        const cropRight = Math.min(sourceCanvas.width, segment.left + segment.width + padX);
        const cropBottom = Math.min(
          sourceCanvas.height,
          Math.max(...selectedChunks.map((chunk) => chunk.y + ((chunk.fontSize || fontSize) * (options.bottomFontFactor ?? 0.22)))) + padBottom
        );
        const cropW = cropRight - cropX;
        const cropH = cropBottom - cropY;
        if (cropW >= 24 && cropH >= 12) {
          return {
            x: cropX,
            y: cropY,
            width: cropW,
            height: cropH,
            fontSize,
          };
        }
      }
    }
  }
  const cropX = Math.max(0, Math.min(...selectedChunks.map((chunk) => chunk.x)) - padX);
  const cropY = Math.max(
    0,
    Math.min(...selectedChunks.map((chunk) => chunk.y - ((chunk.fontSize || fontSize) * (options.topFontFactor ?? 0.82)))) - padTop
  );
  const cropRight = Math.min(sourceCanvas.width, Math.max(...selectedChunks.map((chunk) => chunk.x + chunk.width)) + padX);
  const cropBottom = Math.min(
    sourceCanvas.height,
    Math.max(...selectedChunks.map((chunk) => chunk.y + ((chunk.fontSize || fontSize) * (options.bottomFontFactor ?? 0.22)))) + padBottom
  );
  const cropW = cropRight - cropX;
  const cropH = cropBottom - cropY;
  if (cropW < 24 || cropH < 12) return null;
  return {
    x: cropX,
    y: cropY,
    width: cropW,
    height: cropH,
    fontSize,
    selectedChunks,
  };
}

function pickInvitationFont(lines) {
  const sample = (Array.isArray(lines) ? lines : []).slice(0, 3).map((line) => line.text).join(" ");
  if (/[A-Za-z]/.test(sample) && /&/.test(sample)) return "Varela Round";
  if (/["'״׳]/.test(sample) || hasHebrew(sample)) return "Frank Ruhl Libre";
  return "Heebo";
}

function cropCanvasRegion(sourceCanvas, rect) {
  const sx = clampNum(Math.round(rect.x), 0, Math.max(0, sourceCanvas.width - 1));
  const sy = clampNum(Math.round(rect.y), 0, Math.max(0, sourceCanvas.height - 1));
  const sw = clampNum(Math.round(rect.width), 1, sourceCanvas.width - sx);
  const sh = clampNum(Math.round(rect.height), 1, sourceCanvas.height - sy);
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function softenAlpha(mask, width, height, radius = 2) {
  if (radius <= 0) return mask;
  const copy = new Uint8ClampedArray(mask);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let yy = Math.max(0, y - radius); yy <= Math.min(height - 1, y + radius); yy += 1) {
        for (let xx = Math.max(0, x - radius); xx <= Math.min(width - 1, x + radius); xx += 1) {
          sum += copy[yy * width + xx];
          count += 1;
        }
      }
      mask[y * width + x] = Math.round(sum / Math.max(1, count));
    }
  }
  return mask;
}

function fadeCanvasEdges(canvas, radius = 10) {
  if (radius <= 0) return canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distLeft = x;
      const distRight = width - 1 - x;
      const distTop = y;
      const distBottom = height - 1 - y;
      const edgeDistX = Math.min(distLeft, distRight);
      const edgeDistY = Math.min(distTop, distBottom);
      // Use euclidean distance in corners for smooth rounded fade
      let edgeDistance;
      if (edgeDistX < radius && edgeDistY < radius) {
        edgeDistance = Math.max(0, radius - Math.hypot(radius - edgeDistX, radius - edgeDistY));
      } else {
        edgeDistance = Math.min(edgeDistX, edgeDistY);
      }
      if (edgeDistance >= radius) continue;
      const t = clampNum(edgeDistance / radius, 0, 1);
      // Smooth easeInOut curve for gradual transition
      const fade = t * t * (3 - 2 * t);
      data[(y * width + x) * 4 + 3] = Math.round(data[(y * width + x) * 4 + 3] * fade);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function isolateCanvasBackground(sourceCanvas, bgHex, options = {}) {
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const bg = hexToRgb(bgHex);
  const edgeSoftness = options.edgeSoftness ?? 2;
  const lowTolerance = options.lowTolerance ?? 22;
  const highTolerance = options.highTolerance ?? 68;
  const alphaMask = new Uint8ClampedArray(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let nonBgCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 40) continue;
      const diff = (
        Math.abs(data[idx] - bg.r)
        + Math.abs(data[idx + 1] - bg.g)
        + Math.abs(data[idx + 2] - bg.b)
      ) / 3;
      let nextAlpha = 0;
      if (diff >= highTolerance) nextAlpha = 255;
      else if (diff > lowTolerance) nextAlpha = Math.round(((diff - lowTolerance) / (highTolerance - lowTolerance)) * 255);
      nextAlpha = Math.round(nextAlpha * (alpha / 255));
      alphaMask[y * width + x] = nextAlpha;
      if (nextAlpha < 18) continue;
      nonBgCount += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  softenAlpha(alphaMask, width, height, edgeSoftness);
  const padding = options.padding ?? 8;
  const x = clampNum(minX - padding, 0, width - 1);
  const y = clampNum(minY - padding, 0, height - 1);
  const w = clampNum(maxX - minX + 1 + padding * 2, 1, width - x);
  const h = clampNum(maxY - minY + 1 + padding * 2, 1, height - y);
  if ((nonBgCount / (width * height)) < 0.015) return null;
  const isolated = document.createElement("canvas");
  isolated.width = w;
  isolated.height = h;
  const out = isolated.getContext("2d");
  const imageData = out.createImageData(w, h);
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      const sourceIndex = (yy + y) * width + (xx + x);
      const srcOffset = sourceIndex * 4;
      const dstOffset = (yy * w + xx) * 4;
      imageData.data[dstOffset] = data[srcOffset];
      imageData.data[dstOffset + 1] = data[srcOffset + 1];
      imageData.data[dstOffset + 2] = data[srcOffset + 2];
      imageData.data[dstOffset + 3] = alphaMask[sourceIndex];
    }
  }
  out.putImageData(imageData, 0, 0);
  return isolated;
}

function trimCanvasToContent(sourceCanvas, bgHex, tolerance = 28, padding = 8, softEdges = true) {
  const isolated = isolateCanvasBackground(sourceCanvas, bgHex, {
    lowTolerance: Math.max(12, tolerance - 8),
    highTolerance: tolerance + 28,
    padding,
    edgeSoftness: softEdges ? 4 : 1,
  });
  if (!isolated) return null;
  if (!softEdges) return isolated;
  const fadeRadius = Math.max(4, Math.round(Math.min(isolated.width, isolated.height) * 0.06));
  return fadeCanvasEdges(isolated, fadeRadius);
}

function estimateCanvasCoverage(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let active = 0;
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 26) active += 1;
  }
  return active / Math.max(1, width * height);
}

function summarizeDecorCanvas(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let opaque = 0;
  let dark = 0;
  let soft = 0;
  let vivid = 0;
  let lowerHalfOpaque = 0;
  let bottomThirdOpaque = 0;
  let centerBandOpaque = 0;
  let maxRowOpaque = 0;
  const centerBandTop = height * 0.22;
  const centerBandBottom = height * 0.78;
  for (let y = 0; y < height; y += 1) {
    let rowOpaque = 0;
    for (let x = 0; x < width; x += 1) {
      const index = ((y * width) + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 24) continue;
      opaque += 1;
      rowOpaque += 1;
      if (y >= (height * 0.5)) lowerHalfOpaque += 1;
      if (y >= (height * 0.66)) bottomThirdOpaque += 1;
      if (y >= centerBandTop && y <= centerBandBottom) centerBandOpaque += 1;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const saturation = max <= 0 ? 0 : (max - min) / max;
      const brightness = (red + green + blue) / 3;
      if (brightness < 116) dark += 1;
      if (alpha < 190) soft += 1;
      if (saturation > 0.16) vivid += 1;
    }
    if (rowOpaque > maxRowOpaque) maxRowOpaque = rowOpaque;
  }
  const components = collectCanvasComponents(canvas, {
    alphaThreshold: 24,
    minAreaRatio: 0.00018,
  });
  const totalComponentArea = components.reduce((sum, component) => sum + component.area, 0);
  const largestComponentArea = components.length
    ? Math.max(...components.map((component) => component.area))
    : 0;
  const edgeArea = (edgeKey) => components
    .filter((component) => component[edgeKey])
    .reduce((sum, component) => sum + component.area, 0);
  return {
    darkRatio: dark / Math.max(1, opaque),
    softRatio: soft / Math.max(1, opaque),
    vividRatio: vivid / Math.max(1, opaque),
    componentCount: components.length,
    largestComponentRatio: largestComponentArea / Math.max(1, totalComponentArea),
    leftEdgeRatio: edgeArea("touchesLeft") / Math.max(1, totalComponentArea),
    rightEdgeRatio: edgeArea("touchesRight") / Math.max(1, totalComponentArea),
    topEdgeRatio: edgeArea("touchesTop") / Math.max(1, totalComponentArea),
    bottomEdgeRatio: edgeArea("touchesBottom") / Math.max(1, totalComponentArea),
    lowerHalfRatio: lowerHalfOpaque / Math.max(1, opaque),
    bottomThirdRatio: bottomThirdOpaque / Math.max(1, opaque),
    centerBandRatio: centerBandOpaque / Math.max(1, opaque),
    maxRowCoverageRatio: maxRowOpaque / Math.max(1, width),
  };
}

function estimateCanvasBorderHex(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onBorder = x < border || y < border || x >= (width - border) || y >= (height - border);
      if (!onBorder) continue;
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 24) continue;
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      count += 1;
    }
  }
  if (!count) return "#ffffff";
  return rgbToHex(red / count, green / count, blue / count);
}

function getCanvasBorderAppearance(canvas) {
  const bgHex = estimateCanvasBorderHex(canvas);
  const { r, g, b } = hexToRgb(bgHex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return {
    bgHex,
    brightness: (r + g + b) / 3,
    saturation: max <= 0 ? 0 : (max - min) / max,
  };
}

function collectCanvasComponents(canvas, alphaOrOptions = 50) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const options = typeof alphaOrOptions === "number"
    ? { alphaThreshold: alphaOrOptions }
    : (alphaOrOptions || {});
  const alphaThreshold = options.alphaThreshold ?? 50;
  const visited = new Uint8Array(width * height);
  const minArea = options.minArea
    ?? Math.max(10, Math.floor((width * height) * (options.minAreaRatio ?? 0.004)));
  const components = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (visited[index] || data[index * 4 + 3] <= alphaThreshold) continue;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      const stack = [index];
      visited[index] = 1;
      while (stack.length) {
        const current = stack.pop();
        const cx = current % width;
        const cy = Math.floor(current / width);
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [
          current - 1,
          current + 1,
          current - width,
          current + width,
        ];
        neighbors.forEach((neighbor) => {
          if (neighbor < 0 || neighbor >= visited.length || visited[neighbor]) return;
          const nx = neighbor % width;
          const ny = Math.floor(neighbor / width);
          if (Math.abs(nx - cx) + Math.abs(ny - cy) !== 1) return;
          if (data[neighbor * 4 + 3] <= alphaThreshold) return;
          visited[neighbor] = 1;
          stack.push(neighbor);
        });
      }
      if (area < minArea) continue;
      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      components.push({
        area,
        width: componentWidth,
        height: componentHeight,
        minX,
        maxX,
        minY,
        maxY,
        fillRatio: area / Math.max(1, componentWidth * componentHeight),
        touchesLeft: minX <= 2,
        touchesRight: maxX >= (width - 3),
        touchesTop: minY <= 2,
        touchesBottom: maxY >= (height - 3),
      });
    }
  }
  return components;
}

function clusterComponentsByAxis(components, axis = "x", gapTolerance = 0) {
  if (!Array.isArray(components) || !components.length) return [];
  const minKey = axis === "y" ? "minY" : "minX";
  const maxKey = axis === "y" ? "maxY" : "maxX";
  const ordered = [...components].sort((left, right) => left[minKey] - right[minKey]);
  const clusters = [];
  let current = null;

  ordered.forEach((component) => {
    if (!current || component[minKey] > (current[maxKey] + gapTolerance)) {
      current = {
        components: [component],
        minX: component.minX,
        maxX: component.maxX,
        minY: component.minY,
        maxY: component.maxY,
        area: component.area,
        count: 1,
      };
      clusters.push(current);
      return;
    }
    current.components.push(component);
    current.area += component.area;
    current.count += 1;
    current.minX = Math.min(current.minX, component.minX);
    current.maxX = Math.max(current.maxX, component.maxX);
    current.minY = Math.min(current.minY, component.minY);
    current.maxY = Math.max(current.maxY, component.maxY);
  });

  return clusters.map((cluster) => ({
    ...cluster,
    width: cluster.maxX - cluster.minX + 1,
    height: cluster.maxY - cluster.minY + 1,
    midX: (cluster.minX + cluster.maxX) / 2,
    midY: (cluster.minY + cluster.maxY) / 2,
  }));
}

function cropCanvasToComponentBounds(sourceCanvas, components, options = {}) {
  if (!sourceCanvas || !Array.isArray(components) || !components.length) return null;
  const bounds = components.reduce((acc, component) => ({
    minX: Math.min(acc.minX, component.minX),
    maxX: Math.max(acc.maxX, component.maxX),
    minY: Math.min(acc.minY, component.minY),
    maxY: Math.max(acc.maxY, component.maxY),
  }), {
    minX: sourceCanvas.width,
    maxX: 0,
    minY: sourceCanvas.height,
    maxY: 0,
  });
  const paddingX = options.paddingX ?? 2;
  const paddingY = options.paddingY ?? 2;
  return cropCanvasRegion(sourceCanvas, {
    x: Math.max(0, bounds.minX - paddingX),
    y: Math.max(0, bounds.minY - paddingY),
    width: Math.min(sourceCanvas.width, bounds.maxX + paddingX + 1) - Math.max(0, bounds.minX - paddingX),
    height: Math.min(sourceCanvas.height, bounds.maxY + paddingY + 1) - Math.max(0, bounds.minY - paddingY),
  });
}

function trimCanvasToFocusedTextContent(sourceCanvas, options = {}) {
  if (!sourceCanvas) return null;
  const components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold: options.alphaThreshold ?? 20,
    minArea: options.minArea,
    minAreaRatio: options.minAreaRatio ?? 0.00016,
  });
  if (!components.length) return sourceCanvas;

  let activeComponents = components;
  if (options.preferSingleRow) {
    const rowClusters = clusterComponentsByAxis(
      activeComponents,
      "y",
      Math.max(2, Math.round(options.rowGapTolerance ?? (sourceCanvas.height * 0.05)))
    );
    if (rowClusters.length > 1) {
      const centerY = sourceCanvas.height / 2;
      const bestRow = [...rowClusters].sort((left, right) => {
        const lowerPenalty = (cluster) => cluster.midY > (sourceCanvas.height * 0.62)
          ? ((cluster.midY - (sourceCanvas.height * 0.62)) / Math.max(1, sourceCanvas.height)) * 64
          : 0;
        const clusterScore = (cluster) => {
          const centerPenalty = Math.abs(cluster.midY - centerY) / Math.max(1, sourceCanvas.height);
          const tallPenalty = Math.max(0, (cluster.height / Math.max(1, sourceCanvas.height)) - 0.58) * 120;
          return (cluster.area * 0.42)
            + (cluster.width * 2.1)
            + (cluster.count * 11)
            - (centerPenalty * 54)
            - lowerPenalty(cluster)
            - tallPenalty;
        };
        return clusterScore(right) - clusterScore(left);
      })[0];
      if (bestRow?.components?.length) activeComponents = bestRow.components;
    }
  }

  if (options.preferSingleColumnGroup !== false) {
    const columnClusters = clusterComponentsByAxis(
      activeComponents,
      "x",
      Math.max(2, Math.round(options.columnGapTolerance ?? (sourceCanvas.width * 0.03)))
    );
    if (columnClusters.length > 1) {
      const centerX = sourceCanvas.width / 2;
      let bestRange = null;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let start = 0; start < columnClusters.length; start += 1) {
        let minX = columnClusters[start].minX;
        let maxX = columnClusters[start].maxX;
        let minY = columnClusters[start].minY;
        let maxY = columnClusters[start].maxY;
        let area = 0;
        let count = 0;
        let componentsInRange = [];
        for (let end = start; end < columnClusters.length; end += 1) {
          const cluster = columnClusters[end];
          minX = Math.min(minX, cluster.minX);
          maxX = Math.max(maxX, cluster.maxX);
          minY = Math.min(minY, cluster.minY);
          maxY = Math.max(maxY, cluster.maxY);
          area += cluster.area;
          count += cluster.count;
          componentsInRange = componentsInRange.concat(cluster.components);
          const width = maxX - minX + 1;
          const height = maxY - minY + 1;
          const midX = (minX + maxX) / 2;
          const centerPenalty = Math.abs(midX - centerX) / Math.max(1, sourceCanvas.width);
          const edgePenalty = (minX <= 1 || maxX >= (sourceCanvas.width - 2)) ? 10 : 0;
          const overspanPenalty = width > (sourceCanvas.width * 0.92)
            ? ((width / Math.max(1, sourceCanvas.width)) - 0.92) * 120
            : 0;
          const tallPenalty = height > (sourceCanvas.height * 0.8) ? 18 : 0;
          const verticalSpanPenalty = Math.max(0, (height / Math.max(1, sourceCanvas.height)) - 0.52) * 170;
          const score = (area * 0.4)
            + (width * 1.95)
            + (count * 12)
            - (centerPenalty * 54)
            - edgePenalty
            - overspanPenalty
            - tallPenalty
            - verticalSpanPenalty;
          if (score > bestScore) {
            bestScore = score;
            bestRange = componentsInRange;
          }
        }
      }
      if (bestRange?.length) activeComponents = bestRange;
    }
  }

  const cropped = cropCanvasToComponentBounds(sourceCanvas, activeComponents, {
    paddingX: options.paddingX ?? 2,
    paddingY: options.paddingY ?? 2,
  });
  return cropped || sourceCanvas;
}

function validateIsolatedTextCanvas(canvas, kind = "generic", options = {}) {
  if (!canvas) return false;
  const coverage = estimateCanvasCoverage(canvas);
  if (coverage < (options.minCoverage ?? 0.003)) return false;
  if (coverage > (options.maxCoverage ?? 0.78)) return false;
  const components = collectCanvasComponents(canvas, {
    alphaThreshold: options.alphaThreshold ?? 18,
    minAreaRatio: options.minAreaRatio ?? 0.00008,
  });
  if (!components.length) return false;
  const totalArea = components.reduce((sum, component) => sum + component.area, 0);
  const largest = [...components].sort((left, right) => right.area - left.area)[0];
  const secondaryArea = components
    .filter((component) => component !== largest)
    .reduce((sum, component) => sum + component.area, 0);
  const rowClusters = clusterComponentsByAxis(
    components,
    "y",
    Math.max(2, Math.round(options.rowGapTolerance ?? (canvas.height * 0.06)))
  );
  const columnClusters = clusterComponentsByAxis(
    components,
    "x",
    Math.max(2, Math.round(options.columnGapTolerance ?? (canvas.width * 0.035)))
  );
  const dominantRowArea = rowClusters.length
    ? Math.max(...rowClusters.map((cluster) => cluster.area))
    : totalArea;
  const dominantColumnArea = columnClusters.length
    ? Math.max(...columnClusters.map((cluster) => cluster.area))
    : totalArea;
  const edgeFragmentArea = components
    .filter((component) =>
      (component.touchesLeft || component.touchesRight || component.touchesTop || component.touchesBottom)
      && component.area <= (largest.area * 0.22)
    )
    .reduce((sum, component) => sum + component.area, 0);
  const occupiedWidthRatio = (
    Math.max(...components.map((component) => component.maxX))
    - Math.min(...components.map((component) => component.minX))
    + 1
  ) / Math.max(1, canvas.width);
  const occupiedHeightRatio = (
    Math.max(...components.map((component) => component.maxY))
    - Math.min(...components.map((component) => component.minY))
    + 1
  ) / Math.max(1, canvas.height);
  const dominantRatio = largest.area / Math.max(1, totalArea);
  const strayRatio = secondaryArea / Math.max(1, totalArea);
  const dominantRowRatio = dominantRowArea / Math.max(1, totalArea);
  const dominantColumnRatio = dominantColumnArea / Math.max(1, totalArea);
  const edgeFragmentRatio = edgeFragmentArea / Math.max(1, totalArea);

  if (kind === "date") {
    if (rowClusters.length > 3) return false;
    if (rowClusters.length > 1 && dominantRowRatio < 0.56) return false;
    if (occupiedHeightRatio > 0.82) return false;
    if (edgeFragmentRatio > 0.24 && dominantRowRatio < 0.72) return false;
    return dominantRowRatio > 0.48
      && (dominantColumnRatio > 0.22 || occupiedWidthRatio > 0.34)
      && strayRatio < 0.9;
  }

  if (kind === "name") {
    if (rowClusters.length > 4) return false;
    if (rowClusters.length > 2 && dominantRowRatio < 0.48) return false;
    if (occupiedHeightRatio > 0.88) return false;
    if (edgeFragmentRatio > 0.24 && dominantRowRatio < 0.7) return false;
    if (occupiedWidthRatio > 0.995 && dominantRowRatio < 0.52 && rowClusters.length > 1) return false;
    return (dominantRowRatio > 0.42 || dominantRatio > 0.16) && strayRatio < 0.92;
  }

  return dominantRatio > 0.14;
}

function textAssetHasCleanMargins(canvas, kind = "generic", options = {}) {
  if (!canvas) return false;
  const components = collectCanvasComponents(canvas, {
    alphaThreshold: options.alphaThreshold ?? 16,
    minAreaRatio: options.minAreaRatio ?? 0.00005,
  });
  if (!components.length) return false;
  const totalArea = components.reduce((sum, component) => sum + component.area, 0);
  const largest = [...components].sort((left, right) => right.area - left.area)[0];
  const occupiedHeightRatio = (
    Math.max(...components.map((component) => component.maxY))
    - Math.min(...components.map((component) => component.minY))
    + 1
  ) / Math.max(1, canvas.height);
  const edgeHeavyArea = components
    .filter((component) => component.touchesTop || component.touchesBottom)
    .reduce((sum, component) => sum + component.area, 0);
  const fullHeightComponent = components.some((component) =>
    component.touchesTop
    && component.touchesBottom
    && component.area >= (largest.area * (options.fullHeightLargestRatio ?? 0.42))
  );
  const edgeHeavyRatio = edgeHeavyArea / Math.max(1, totalArea);

  if (kind === "date") {
    if (fullHeightComponent && occupiedHeightRatio > 0.74) return false;
    if (edgeHeavyRatio > 0.78 && occupiedHeightRatio > 0.7) return false;
    return true;
  }

  if (kind === "name") {
    if (fullHeightComponent && occupiedHeightRatio > 0.76) return false;
    if (edgeHeavyRatio > 0.78 && occupiedHeightRatio > 0.72) return false;
    return true;
  }

  return true;
}

function canvasFromSelectedComponents(sourceCanvas, components) {
  if (!sourceCanvas || !Array.isArray(components) || !components.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width;
  canvas.height = sourceCanvas.height;
  const ctx = canvas.getContext("2d");
  components.forEach((component) => {
    const width = component.maxX - component.minX + 1;
    const height = component.maxY - component.minY + 1;
    ctx.drawImage(
      sourceCanvas,
      component.minX,
      component.minY,
      width,
      height,
      component.minX,
      component.minY,
      width,
      height
    );
  });
  return canvas;
}

function sanitizeTextAssetCanvas(sourceCanvas, kind = "generic", options = {}) {
  if (!sourceCanvas) return null;
  const alphaThreshold = options.alphaThreshold ?? 18;
  let components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold,
    minAreaRatio: options.minAreaRatio ?? 0.00005,
  });
  if (!components.length) return sourceCanvas;

  const scoreCluster = (cluster, preferCenter = true) => {
    const centerPenaltyX = preferCenter
      ? Math.abs(cluster.midX - (sourceCanvas.width / 2)) / Math.max(1, sourceCanvas.width)
      : 0;
    const centerPenaltyY = Math.abs(cluster.midY - (sourceCanvas.height / 2)) / Math.max(1, sourceCanvas.height);
    return (cluster.area * 0.42)
      + (cluster.width * 2.1)
      + (cluster.count * 9)
      - (centerPenaltyX * 34)
      - (centerPenaltyY * 20);
  };

  const rowClusters = clusterComponentsByAxis(
    components,
    "y",
    Math.max(2, Math.round(options.rowGapTolerance ?? (sourceCanvas.height * 0.06)))
  );

  if (kind === "date" && rowClusters.length > 1) {
    const bestRow = [...rowClusters].sort((left, right) => scoreCluster(right) - scoreCluster(left))[0];
    if (bestRow?.components?.length) components = bestRow.components;
  } else if (kind === "name" && rowClusters.length > 2) {
    const sortedRows = [...rowClusters].sort((left, right) => scoreCluster(right) - scoreCluster(left));
    const dominantArea = sortedRows[0]?.area || 0;
    const keptRows = [];
    sortedRows.forEach((cluster) => {
      const closeToExisting = !keptRows.length
        || keptRows.some((existing) => Math.abs(existing.midY - cluster.midY) <= (sourceCanvas.height * 0.34));
      const strongEnough = cluster.area >= (dominantArea * 0.2);
      if (closeToExisting && strongEnough && keptRows.length < 2) keptRows.push(cluster);
    });
    if (keptRows.length) components = keptRows.flatMap((cluster) => cluster.components);
  }

  if (!components.length) return null;
  const totalArea = components.reduce((sum, component) => sum + component.area, 0);
  const largest = [...components].sort((left, right) => right.area - left.area)[0];
  const edgeLargestFactor = kind === "date" ? 0.16 : 0.22;
  const edgeTotalFactor = kind === "date" ? 0.045 : 0.065;
  components = components.filter((component) => {
    const touchesEdge = component.touchesLeft || component.touchesRight || component.touchesTop || component.touchesBottom;
    if (!touchesEdge) return true;
    const smallVsLargest = component.area <= (largest.area * edgeLargestFactor);
    const smallVsTotal = component.area <= (totalArea * edgeTotalFactor);
    return !(smallVsLargest && smallVsTotal);
  });
  if (!components.length) return null;

  const selected = canvasFromSelectedComponents(sourceCanvas, components) || sourceCanvas;
  return trimCanvasToDominantContent(selected, {
    alphaThreshold,
    columnThresholdRatio: options.columnThresholdRatio ?? 0.05,
    rowThresholdRatio: options.rowThresholdRatio ?? 0.08,
    columnGapTolerance: options.columnGapTolerance,
    rowGapTolerance: options.rowGapTolerance,
    paddingX: options.paddingX ?? 2,
    paddingY: options.paddingY ?? 2,
    preferCenterX: options.preferCenterX !== false,
    preferCenterY: options.preferCenterY !== false,
  }) || selected;
}

function attemptDirectTextAsset(sourceCanvas, lines, matchText, kind = "generic", options = {}) {
  if (!sourceCanvas || !Array.isArray(lines) || !lines.length || !matchText) return null;
  const rawCrop = cropRawLineCanvas(sourceCanvas, lines, {
    matchText,
    padXFactor: options.padXFactor ?? 0.08,
    padTopFactor: options.padTopFactor ?? 0.12,
    padBottomFactor: options.padBottomFactor ?? 0.12,
    topFontFactor: options.topFontFactor ?? 0.7,
    bottomFontFactor: options.bottomFontFactor ?? 0.24,
    maxHeightRatio: options.maxHeightRatio ?? 0.22,
    chunkPaddingX: options.chunkPaddingX,
    chunkPaddingY: options.chunkPaddingY,
  });
  if (!rawCrop) return null;
  const textOnly = isolateLightBackgroundText(rawCrop, {
    padding: options.lightPadding ?? (kind === "date" ? 2 : 3),
    minCoverage: options.lightMinCoverage ?? (kind === "date" ? 0.0004 : 0.0006),
    maxCoverage: options.lightMaxCoverage ?? 0.78,
    strongDiff: options.strongDiff ?? (kind === "date" ? 14 : 16),
    softDiff: options.softDiff ?? (kind === "date" ? 3 : 4),
    darkDelta: options.darkDelta ?? (kind === "date" ? 8 : 10),
    satDelta: options.satDelta ?? (kind === "date" ? 0.02 : 0.025),
    edgeSoftness: options.edgeSoftness ?? 1,
  });
  if (!textOnly) return null;
  const sanitizedBase = sanitizeTextAssetCanvas(textOnly, kind, {
    alphaThreshold: options.alphaThreshold ?? 14,
    minAreaRatio: options.minAreaRatio ?? (kind === "date" ? 0.00005 : 0.00006),
    columnGapTolerance: options.columnGapTolerance,
    rowGapTolerance: options.rowGapTolerance,
    paddingX: options.paddingX ?? 2,
    paddingY: options.paddingY ?? 2,
  }) || textOnly;
  const sanitized = refineTextAssetCanvas(sanitizedBase, kind, {
    alphaThreshold: options.alphaThreshold ?? 12,
    minAreaRatio: options.minAreaRatio ?? (kind === "date" ? 0.00005 : 0.00006),
    paddingX: 1,
    paddingY: 1,
  }) || sanitizedBase;
  if (!assetHasExpectedTextSpan(sanitized, lines, matchText, {
    minRatio: options.minSpanRatio ?? (kind === "date" ? 0.56 : 0.58),
    minAspectRatio: options.minAspectRatio ?? (kind === "date" ? 2.2 : 1.8),
  })) return null;
  if (!textAssetHasCleanMargins(sanitized, kind, {
    alphaThreshold: options.alphaThreshold ?? 12,
    minAreaRatio: options.minAreaRatio ?? (kind === "date" ? 0.00005 : 0.00006),
  })) return null;
  if (!validateIsolatedTextCanvas(sanitized, kind, {
    alphaThreshold: options.alphaThreshold ?? 12,
    minCoverage: options.minCoverage ?? (kind === "date" ? 0.0008 : 0.0012),
    maxCoverage: options.maxCoverage ?? 0.8,
  })) return null;
  return canvasToAsset(sanitized, options.id || `direct-${kind}-img`);
}

function attemptFramedTextAsset(sourceCanvas, lines, matchText, kind = "generic", options = {}) {
  if (!sourceCanvas || !Array.isArray(lines) || !lines.length || !matchText) return null;
  const rawCrop = cropRawLineCanvas(sourceCanvas, lines, {
    matchText,
    padXFactor: options.padXFactor ?? 0.08,
    padTopFactor: options.padTopFactor ?? 0.12,
    padBottomFactor: options.padBottomFactor ?? 0.12,
    topFontFactor: options.topFontFactor ?? 0.7,
    bottomFontFactor: options.bottomFontFactor ?? 0.24,
    maxHeightRatio: options.maxHeightRatio ?? 0.24,
    chunkPaddingX: options.chunkPaddingX,
    chunkPaddingY: options.chunkPaddingY,
  });
  if (!rawCrop) return null;
  const border = getCanvasBorderAppearance(rawCrop);
  if (border.brightness < (options.minBorderBrightness ?? 220)) return null;
  if (border.saturation > (options.maxBorderSaturation ?? 0.18)) return null;
  const ribbon = trimOpaqueCanvasToDominantContent(rawCrop, border.bgHex, {
    activeThreshold: options.activeThreshold ?? 16,
    softThreshold: options.softThreshold ?? 7,
    saturationThreshold: options.saturationThreshold ?? 8,
    columnThresholdRatio: options.columnThresholdRatio ?? 0.05,
    rowThresholdRatio: options.rowThresholdRatio ?? 0.08,
    columnGapTolerance: options.columnGapTolerance,
    rowGapTolerance: options.rowGapTolerance,
    paddingX: options.paddingX ?? 2,
    paddingY: options.paddingY ?? 2,
  }) || rawCrop;
  const probe = isolateLightBackgroundText(ribbon, {
    padding: options.lightPadding ?? 2,
    minCoverage: options.lightMinCoverage ?? (kind === "date" ? 0.0004 : 0.0006),
    maxCoverage: options.lightMaxCoverage ?? 0.78,
    strongDiff: options.strongDiff ?? (kind === "date" ? 14 : 16),
    softDiff: options.softDiff ?? (kind === "date" ? 3 : 4),
    darkDelta: options.darkDelta ?? (kind === "date" ? 8 : 10),
    satDelta: options.satDelta ?? (kind === "date" ? 0.02 : 0.025),
    edgeSoftness: 1,
  });
  if (!probe) return null;
  const probeBase = sanitizeTextAssetCanvas(probe, kind, {
    alphaThreshold: 12,
    minAreaRatio: options.minAreaRatio ?? (kind === "date" ? 0.00005 : 0.00006),
    columnGapTolerance: options.columnGapTolerance,
    rowGapTolerance: options.rowGapTolerance,
    paddingX: 2,
    paddingY: 2,
  }) || probe;
  const probeClean = refineTextAssetCanvas(probeBase, kind, {
    alphaThreshold: 12,
    minAreaRatio: options.minAreaRatio ?? (kind === "date" ? 0.00005 : 0.00006),
    paddingX: 1,
    paddingY: 1,
  }) || probeBase;
  if (!assetHasExpectedTextSpan(probeClean, lines, matchText, {
    minRatio: options.minSpanRatio ?? (kind === "date" ? 0.56 : 0.58),
    minAspectRatio: options.minAspectRatio ?? (kind === "date" ? 2.2 : 1.8),
  })) return null;
  if (!textAssetHasCleanMargins(probeClean, kind)) return null;
  if (!validateIsolatedTextCanvas(probeClean, kind, {
    alphaThreshold: 12,
    minCoverage: options.minCoverage ?? (kind === "date" ? 0.0008 : 0.0012),
    maxCoverage: options.maxCoverage ?? 0.82,
  })) return null;
  return canvasToAsset(ribbon, options.id || `framed-${kind}-img`);
}

function trimCanvasToAllContent(sourceCanvas, options = {}) {
  if (!sourceCanvas) return null;
  const components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold: options.alphaThreshold ?? 18,
    minAreaRatio: options.minAreaRatio ?? 0.00006,
  });
  if (!components.length) return sourceCanvas;
  return cropCanvasToComponentBounds(sourceCanvas, components, {
    paddingX: options.paddingX ?? 2,
    paddingY: options.paddingY ?? 2,
  }) || sourceCanvas;
}

function expectedMatchedWidthForLines(lines, matchText) {
  if (!Array.isArray(lines) || !lines.length) return 0;
  if (lines.length === 1 && matchText) return estimateMatchedTextWidth(lines[0], matchText);
  return Math.max(...lines.map((line) => line.width || 0));
}

function assetHasExpectedTextSpan(canvas, lines, matchText, options = {}) {
  if (!canvas || !Array.isArray(lines) || !lines.length) return false;
  const expectedWidth = options.expectedWidth ?? expectedMatchedWidthForLines(lines, matchText);
  if (!expectedWidth) return true;
  const minRatio = options.minRatio ?? 0.7;
  const aspectRatio = canvas.width / Math.max(1, canvas.height);
  if ((options.minAspectRatio ?? 0) > 0 && aspectRatio < options.minAspectRatio) return false;
  return (canvas.width / Math.max(1, expectedWidth)) >= minRatio;
}

function collectAxisRuns(activeCounts, threshold, gapTolerance = 0) {
  const runs = [];
  let start = -1;
  let end = -1;
  let mass = 0;
  let gap = 0;
  for (let index = 0; index < activeCounts.length; index += 1) {
    const value = activeCounts[index];
    const isActive = value >= threshold;
    if (isActive) {
      if (start < 0) start = index;
      end = index;
      gap = 0;
      mass += value;
      continue;
    }
    if (start < 0) continue;
    gap += 1;
    if (gap <= gapTolerance) continue;
    runs.push({ start, end, mass, length: end - start + 1 });
    start = -1;
    end = -1;
    mass = 0;
    gap = 0;
  }
  if (start >= 0 && end >= start) runs.push({ start, end, mass, length: end - start + 1 });
  return runs;
}

function trimCanvasToDominantContent(sourceCanvas, options = {}) {
  if (!sourceCanvas) return null;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  if (!width || !height) return null;
  const alphaThreshold = options.alphaThreshold ?? 16;
  const data = ctx.getImageData(0, 0, width, height).data;
  const colActive = new Float32Array(width);
  const rowActive = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= alphaThreshold) continue;
      colActive[x] += 1;
      rowActive[y] += 1;
    }
  }
  let maxCol = 0;
  let maxRow = 0;
  for (let index = 0; index < colActive.length; index += 1) {
    if (colActive[index] > maxCol) maxCol = colActive[index];
  }
  for (let index = 0; index < rowActive.length; index += 1) {
    if (rowActive[index] > maxRow) maxRow = rowActive[index];
  }
  if (!maxCol || !maxRow) return sourceCanvas;
  const colRuns = collectAxisRuns(
    colActive,
    maxCol * (options.columnThresholdRatio ?? 0.06),
    Math.max(0, Math.round(options.columnGapTolerance ?? (width * 0.03)))
  );
  const rowRuns = collectAxisRuns(
    rowActive,
    maxRow * (options.rowThresholdRatio ?? 0.08),
    Math.max(0, Math.round(options.rowGapTolerance ?? (height * 0.08)))
  );
  if (!colRuns.length || !rowRuns.length) return sourceCanvas;
  const centerX = width / 2;
  const centerY = height / 2;
  const runScore = (run, total, center, preferCenter) => {
    const mid = (run.start + run.end) / 2;
    const centerPenalty = preferCenter ? Math.abs(mid - center) / Math.max(1, total) : 0;
    return (run.mass * 0.45) + (run.length * 2.4) - (centerPenalty * 32);
  };
  const bestCols = [...colRuns].sort((left, right) =>
    runScore(right, width, centerX, options.preferCenterX !== false)
    - runScore(left, width, centerX, options.preferCenterX !== false)
  )[0];
  const bestRows = [...rowRuns].sort((left, right) =>
    runScore(right, height, centerY, options.preferCenterY !== false)
    - runScore(left, height, centerY, options.preferCenterY !== false)
  )[0];
  if (!bestCols || !bestRows) return sourceCanvas;
  const paddingX = options.paddingX ?? 3;
  const paddingY = options.paddingY ?? 3;
  const cropX = clampNum(bestCols.start - paddingX, 0, Math.max(0, width - 1));
  const cropY = clampNum(bestRows.start - paddingY, 0, Math.max(0, height - 1));
  const cropW = clampNum((bestCols.end - bestCols.start + 1) + (paddingX * 2), 1, width - cropX);
  const cropH = clampNum((bestRows.end - bestRows.start + 1) + (paddingY * 2), 1, height - cropY);
  if (cropW >= width * 0.98 && cropH >= height * 0.98) return sourceCanvas;
  return cropCanvasRegion(sourceCanvas, {
    x: cropX,
    y: cropY,
    width: cropW,
    height: cropH,
  });
}

function trimCanvasToDominantRows(sourceCanvas, options = {}) {
  if (!sourceCanvas) return null;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  if (!width || !height) return null;
  const alphaThreshold = options.alphaThreshold ?? 16;
  const data = ctx.getImageData(0, 0, width, height).data;
  const rowActive = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] <= alphaThreshold) continue;
      rowActive[y] += 1;
    }
  }
  let maxRow = 0;
  for (let index = 0; index < rowActive.length; index += 1) {
    if (rowActive[index] > maxRow) maxRow = rowActive[index];
  }
  if (!maxRow) return sourceCanvas;
  const rowRuns = collectAxisRuns(
    rowActive,
    maxRow * (options.rowThresholdRatio ?? 0.08),
    Math.max(0, Math.round(options.rowGapTolerance ?? (height * 0.08)))
  );
  if (!rowRuns.length) return sourceCanvas;
  const centerY = height / 2;
  const bestRow = [...rowRuns].sort((left, right) => {
    const score = (run) => {
      const mid = (run.start + run.end) / 2;
      const centerPenalty = Math.abs(mid - centerY) / Math.max(1, height);
      return (run.mass * 0.5) + (run.length * 2.5) - (centerPenalty * 26);
    };
    return score(right) - score(left);
  })[0];
  if (!bestRow) return sourceCanvas;
  const paddingX = options.paddingX ?? 0;
  const paddingY = options.paddingY ?? 2;
  const cropY = clampNum(bestRow.start - paddingY, 0, Math.max(0, height - 1));
  const cropH = clampNum((bestRow.end - bestRow.start + 1) + (paddingY * 2), 1, height - cropY);
  if (cropH >= height * 0.98) return sourceCanvas;
  return cropCanvasRegion(sourceCanvas, {
    x: clampNum(0 - paddingX, 0, Math.max(0, width - 1)),
    y: cropY,
    width,
    height: cropH,
  });
}

function trimOpaqueCanvasToDominantContent(sourceCanvas, bgHex, options = {}) {
  if (!sourceCanvas || !bgHex) return null;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  if (!width || !height) return null;
  const data = ctx.getImageData(0, 0, width, height).data;
  const bg = hexToRgb(bgHex);
  const activeThreshold = options.activeThreshold ?? 18;
  const softThreshold = options.softThreshold ?? 8;
  const saturationThreshold = options.saturationThreshold ?? 10;
  const colActive = new Float32Array(width);
  const rowActive = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] < 24) continue;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const diff = (
        Math.abs(r - bg.r)
        + Math.abs(g - bg.g)
        + Math.abs(b - bg.b)
      ) / 3;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      if (diff < softThreshold && saturation < saturationThreshold) continue;
      if (diff < activeThreshold && saturation < (saturationThreshold * 1.6)) continue;
      colActive[x] += 1;
      rowActive[y] += 1;
    }
  }
  let maxCol = 0;
  let maxRow = 0;
  for (let index = 0; index < colActive.length; index += 1) {
    if (colActive[index] > maxCol) maxCol = colActive[index];
  }
  for (let index = 0; index < rowActive.length; index += 1) {
    if (rowActive[index] > maxRow) maxRow = rowActive[index];
  }
  if (!maxCol || !maxRow) return null;
  const colRuns = collectAxisRuns(
    colActive,
    maxCol * (options.columnThresholdRatio ?? 0.05),
    Math.max(0, Math.round(options.columnGapTolerance ?? (width * 0.035)))
  );
  const rowRuns = collectAxisRuns(
    rowActive,
    maxRow * (options.rowThresholdRatio ?? 0.08),
    Math.max(0, Math.round(options.rowGapTolerance ?? (height * 0.08)))
  );
  if (!colRuns.length || !rowRuns.length) return null;
  const centerX = width / 2;
  const centerY = height / 2;
  const runScore = (run, total, center) => {
    const mid = (run.start + run.end) / 2;
    const centerPenalty = Math.abs(mid - center) / Math.max(1, total);
    return (run.mass * 0.45) + (run.length * 2.3) - (centerPenalty * 28);
  };
  const bestCols = [...colRuns].sort((left, right) =>
    runScore(right, width, centerX) - runScore(left, width, centerX)
  )[0];
  const bestRows = [...rowRuns].sort((left, right) =>
    runScore(right, height, centerY) - runScore(left, height, centerY)
  )[0];
  if (!bestCols || !bestRows) return null;
  const paddingX = options.paddingX ?? 3;
  const paddingY = options.paddingY ?? 3;
  const cropX = clampNum(bestCols.start - paddingX, 0, Math.max(0, width - 1));
  const cropY = clampNum(bestRows.start - paddingY, 0, Math.max(0, height - 1));
  const cropW = clampNum((bestCols.end - bestCols.start + 1) + (paddingX * 2), 1, width - cropX);
  const cropH = clampNum((bestRows.end - bestRows.start + 1) + (paddingY * 2), 1, height - cropY);
  return cropCanvasRegion(sourceCanvas, {
    x: cropX,
    y: cropY,
    width: cropW,
    height: cropH,
  });
}

function refineTextAssetCanvas(sourceCanvas, kind = "generic", options = {}) {
  if (!sourceCanvas) return null;
  const rowTrimmed = trimCanvasToDominantRows(sourceCanvas, {
    alphaThreshold: options.alphaThreshold ?? 14,
    rowThresholdRatio: options.rowThresholdRatio ?? (kind === "date" ? 0.12 : 0.09),
    rowGapTolerance: options.rowGapTolerance ?? (kind === "date" ? Math.round(sourceCanvas.height * 0.08) : Math.round(sourceCanvas.height * 0.14)),
    paddingY: options.paddingY ?? 2,
  }) || sourceCanvas;
  return trimCanvasToAllContent(rowTrimmed, {
    alphaThreshold: options.alphaThreshold ?? 14,
    minAreaRatio: options.minAreaRatio ?? (kind === "date" ? 0.00005 : 0.00006),
    paddingX: options.paddingX ?? 1,
    paddingY: options.paddingY ?? 1,
  }) || rowTrimmed;
}

function focusDecorCluster(canvas, anchorId = "") {
  const components = collectCanvasComponents(canvas, 36);
  if (components.length <= 1) return canvas;
  const largest = [...components].sort((left, right) => right.area - left.area)[0];
  const anchorPoints = {
    "corner-tl": { x: 0, y: 0, edges: ["left", "top"] },
    "corner-tr": { x: canvas.width, y: 0, edges: ["right", "top"] },
    "corner-bl": { x: 0, y: canvas.height, edges: ["left", "bottom"] },
    "corner-br": { x: canvas.width, y: canvas.height, edges: ["right", "bottom"] },
    "frame-left-tall": { x: 0, y: canvas.height * 0.68, edges: ["left"] },
    "frame-right-tall": { x: canvas.width, y: canvas.height * 0.68, edges: ["right"] },
    "frame-bl": { x: 0, y: canvas.height, edges: ["left", "bottom"] },
    "frame-br": { x: canvas.width, y: canvas.height, edges: ["right", "bottom"] },
    "edge-top-left": { x: 0, y: 0, edges: ["left", "top"] },
    "edge-top-right": { x: canvas.width, y: 0, edges: ["right", "top"] },
    "side-left": { x: 0, y: canvas.height * 0.72, edges: ["left"] },
    "side-right": { x: canvas.width, y: canvas.height * 0.72, edges: ["right"] },
    centerpiece: { x: canvas.width / 2, y: canvas.height * 0.68, edges: [] },
    "centerpiece-lower": { x: canvas.width / 2, y: canvas.height * 0.78, edges: [] },
  };
  const anchorPoint = anchorPoints[anchorId] || null;
  const componentGapToPoint = (component, point) => {
    const dx = Math.max(0, component.minX - point.x, point.x - component.maxX);
    const dy = Math.max(0, component.minY - point.y, point.y - component.maxY);
    return Math.hypot(dx, dy);
  };
  const anchorTouchScore = (component, point) => {
    if (!point?.edges?.length) return 0;
    return point.edges.reduce((score, edge) => {
      if (edge === "left" && component.touchesLeft) return score + 1;
      if (edge === "right" && component.touchesRight) return score + 1;
      if (edge === "top" && component.touchesTop) return score + 1;
      if (edge === "bottom" && component.touchesBottom) return score + 1;
      return score;
    }, 0);
  };
  const candidates = components.filter((component) => component.area >= largest.area * 0.12);
  const anchoredCandidates = anchorPoint
    ? candidates.filter((component) => anchorTouchScore(component, anchorPoint) > 0)
    : [];
  const primaryPool = anchoredCandidates.length ? anchoredCandidates : candidates;
  const primary = anchorPoint
    ? primaryPool
      .sort((left, right) => {
        const leftTouch = anchorTouchScore(left, anchorPoint);
        const rightTouch = anchorTouchScore(right, anchorPoint);
        if (leftTouch !== rightTouch) return rightTouch - leftTouch;
        const leftGap = componentGapToPoint(left, anchorPoint);
        const rightGap = componentGapToPoint(right, anchorPoint);
        return leftGap - rightGap || right.area - left.area;
      })[0]
    : largest;
  if (!primary) return canvas;
  const gapToPrimary = (component) => {
    const dx = Math.max(0, primary.minX - component.maxX, component.minX - primary.maxX);
    const dy = Math.max(0, primary.minY - component.maxY, component.minY - primary.maxY);
    return Math.hypot(dx, dy);
  };
  const isCenterpiece = anchorId === "centerpiece" || anchorId === "centerpiece-lower";
  const proximityThreshold = Math.max(24, Math.round(Math.min(canvas.width, canvas.height) * (isCenterpiece ? 0.32 : 0.22)));
  const selected = components.filter((component) =>
    component === primary
    || (
      component.area >= primary.area * (isCenterpiece ? 0.06 : 0.12)
      && gapToPrimary(component) <= proximityThreshold
    )
  );
  if (!selected.length) return canvas;
  const padding = Math.max(8, Math.round(Math.min(canvas.width, canvas.height) * (isCenterpiece ? 0.08 : 0.05)));
  const minX = Math.max(0, Math.min(...selected.map((component) => component.minX)) - padding);
  const minY = Math.max(0, Math.min(...selected.map((component) => component.minY)) - padding);
  const maxX = Math.min(canvas.width, Math.max(...selected.map((component) => component.maxX)) + padding + 1);
  const maxY = Math.min(canvas.height, Math.max(...selected.map((component) => component.maxY)) + padding + 1);
  if ((maxX - minX) < 24 || (maxY - minY) < 24) return canvas;
  return cropCanvasRegion(canvas, {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
}

function isCanvasTooGeometric(canvas) {
  const { width, height } = canvas;
  const components = collectCanvasComponents(canvas);
  if (!components.length) return false;
  const solidLarge = components.filter((component) =>
    component.fillRatio > 0.42
    && component.area >= (width * height * 0.035)
  );
  const longThin = solidLarge.filter((component) =>
    (component.height >= height * 0.4 && component.width <= width * 0.22)
    || (component.width >= width * 0.4 && component.height <= height * 0.22)
  );
  return (components.length <= 8 && solidLarge.length >= 3)
    || (solidLarge.length >= 2 && longThin.length >= 1);
}

function isCanvasGraphic(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let solidCount = 0;
  let softCount = 0;
  for (let index = 3; index < data.length; index += 4) {
    const alpha = data[index];
    if (alpha < 20) continue;
    if (alpha > 200) solidCount += 1;
    else softCount += 1;
  }
  const total = solidCount + softCount;
  if (total < 100) return false;
  return (solidCount / total) > 0.72;
}

function isCanvasStripePattern(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const summarizeRuns = (flags, maxRunLength) => {
    const runs = [];
    let runLength = 0;
    flags.forEach((flag) => {
      if (flag) {
        runLength += 1;
        return;
      }
      if (runLength) runs.push(runLength);
      runLength = 0;
    });
    if (runLength) runs.push(runLength);
    const slimRuns = runs.filter((run) => run <= maxRunLength);
    const totalCoverage = slimRuns.reduce((sum, run) => sum + run, 0) / Math.max(1, flags.length);
    return { count: slimRuns.length, coverage: totalCoverage };
  };
  const colActive = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 40) colActive[x] += 1;
    }
  }
  const maxCol = Math.max(...colActive);
  if (maxCol === 0) return false;
  const normalized = Array.from(colActive).map((value) => value / maxCol);
  let transitions = 0;
  const threshold = 0.35;
  for (let x = 1; x < width; x += 1) {
    const prev = normalized[x - 1] > threshold;
    const curr = normalized[x] > threshold;
    if (prev !== curr) transitions += 1;
  }
  const transitionRatio = transitions / Math.max(1, width);
  const rowActive = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 40) rowActive[y] += 1;
    }
  }
  const avgRow = rowActive.reduce((sum, value) => sum + value, 0) / Math.max(1, height);
  const rowVariance = rowActive.reduce((sum, value) => sum + Math.abs(value - avgRow), 0) / Math.max(1, height);
  const rowUniformity = 1 - (rowVariance / Math.max(1, avgRow));
  const tallCols = normalized.map((value) => value > 0.72);
  const tallCoverage = tallCols.filter(Boolean).length / Math.max(1, width);
  const repeatedBars = summarizeRuns(tallCols, Math.max(8, Math.floor(width * 0.08)));
  const verticalBars = summarizeRuns(Array.from(colActive, (value) => (value / Math.max(1, height)) > 0.58), Math.max(14, Math.floor(width * 0.12)));
  const horizontalBars = summarizeRuns(Array.from(rowActive, (value) => (value / Math.max(1, width)) > 0.58), Math.max(14, Math.floor(height * 0.12)));
  const components = collectCanvasComponents(canvas).reduce((acc, component) => {
    if (component.fillRatio < 0.5) return acc;
    if (component.height >= height * 0.42 && component.width <= width * 0.2) acc.verticalBars += 1;
    if (component.width >= width * 0.42 && component.height <= height * 0.2) acc.horizontalBars += 1;
    return acc;
  }, { verticalBars: 0, horizontalBars: 0 });
  return (transitionRatio > 0.08 && rowUniformity > 0.65)
    || (repeatedBars.count >= 4 && tallCoverage >= 0.12 && tallCoverage <= 0.75)
    || (verticalBars.count >= 2 && verticalBars.coverage >= 0.12 && verticalBars.coverage <= 0.82)
    || (horizontalBars.count >= 2 && horizontalBars.coverage >= 0.12 && horizontalBars.coverage <= 0.82)
    || components.verticalBars >= 2
    || components.horizontalBars >= 2;
}

function findBestDecorTrim(sourceCanvas, bgHex) {
  const attempts = [
    { tolerance: 18, padding: 12 },
    { tolerance: 22, padding: 12 },
    { tolerance: 26, padding: 10 },
    { tolerance: 30, padding: 8 },
  ];
  const candidates = attempts
    .map((settings) => {
      const testCanvas = trimCanvasToContent(sourceCanvas, bgHex, settings.tolerance, settings.padding, false);
      if (!testCanvas) return null;
      const useHardEdges = isCanvasGraphic(testCanvas);
      const canvas = useHardEdges
        ? testCanvas
        : trimCanvasToContent(sourceCanvas, bgHex, settings.tolerance, settings.padding, true);
      if (!canvas) return null;
      return {
        canvas,
        coverage: estimateCanvasCoverage(canvas),
        area: canvas.width * canvas.height,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.coverage * b.area) - (a.coverage * a.area));
  return candidates[0]?.canvas || null;
}

function decorAnchorEdgeRatio(regionId, stats) {
  if (!regionId || !stats) return 0;
  if (regionId === "top-band" || regionId === "bunting-band") {
    return Math.min(1, (stats.leftEdgeRatio || 0) + (stats.rightEdgeRatio || 0));
  }
  if (regionId === "corner-tl" || regionId === "edge-top-left") {
    return Math.min(1, (stats.leftEdgeRatio || 0) + (stats.topEdgeRatio || 0));
  }
  if (regionId === "corner-tr" || regionId === "edge-top-right") {
    return Math.min(1, (stats.rightEdgeRatio || 0) + (stats.topEdgeRatio || 0));
  }
  if (regionId === "corner-bl" || regionId === "frame-bl" || regionId === "side-left" || regionId === "frame-left-tall") {
    return Math.min(1, (stats.leftEdgeRatio || 0) + (stats.bottomEdgeRatio || 0));
  }
  if (regionId === "corner-br" || regionId === "frame-br" || regionId === "side-right" || regionId === "frame-right-tall") {
    return Math.min(1, (stats.rightEdgeRatio || 0) + (stats.bottomEdgeRatio || 0));
  }
  if (regionId.startsWith("centerpiece")) return Math.max(stats.bottomEdgeRatio || 0, stats.topEdgeRatio || 0);
  return 0;
}

function decorLooksFragmented(regionId, stats) {
  if (!regionId || !stats) return false;
  const anchorRatio = decorAnchorEdgeRatio(regionId, stats);
  if ((stats.componentCount || 0) > 10 && (stats.largestComponentRatio || 0) < 0.24) return true;
  if ((regionId.startsWith("corner-") || regionId.startsWith("frame-") || regionId.startsWith("side-"))
    && anchorRatio < 0.14
    && (stats.componentCount || 0) > 5) return true;
  if ((regionId === "top-band" || regionId === "bunting-band")
    && ((stats.leftEdgeRatio || 0) < 0.015 || (stats.rightEdgeRatio || 0) < 0.015)
    && (stats.componentCount || 0) > 6) return true;
  return false;
}

function canvasToAsset(canvas, id) {
  const stats = summarizeDecorCanvas(canvas);
  return {
    id,
    src: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
    coverage: estimateCanvasCoverage(canvas),
    darkRatio: stats.darkRatio,
    softRatio: stats.softRatio,
    vividRatio: stats.vividRatio,
    componentCount: stats.componentCount,
    largestComponentRatio: stats.largestComponentRatio,
    leftEdgeRatio: stats.leftEdgeRatio,
    rightEdgeRatio: stats.rightEdgeRatio,
    topEdgeRatio: stats.topEdgeRatio,
    bottomEdgeRatio: stats.bottomEdgeRatio,
  };
}

function isolateLightBackgroundText(sourceCanvas, options = {}) {
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const border = getCanvasBorderAppearance(sourceCanvas);
  const bg = hexToRgb(border.bgHex);
  const strongDiff = options.strongDiff ?? 40;
  const softDiff = options.softDiff ?? 14;
  const darkDelta = options.darkDelta ?? 24;
  const satDelta = options.satDelta ?? 0.08;
  const brightnessPad = options.brightnessPad ?? 10;
  const alphaMask = new Uint8ClampedArray(width * height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let activeCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 20) continue;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const max = Math.max(red, green, blue);
      const min = Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      const saturation = max <= 0 ? 0 : (max - min) / max;
      const diff = (
        Math.abs(red - bg.r)
        + Math.abs(green - bg.g)
        + Math.abs(blue - bg.b)
      ) / 3;

      let nextAlpha = 0;
      if (diff >= strongDiff || brightness <= (border.brightness - darkDelta)) {
        nextAlpha = alpha;
      } else if (
        saturation >= (border.saturation + satDelta)
        && brightness <= (border.brightness + brightnessPad)
      ) {
        nextAlpha = Math.round(alpha * 0.9);
      } else if (diff >= softDiff && brightness <= (border.brightness + 2)) {
        const ratio = clampNum((diff - softDiff) / Math.max(1, strongDiff - softDiff), 0, 1);
        nextAlpha = Math.round(alpha * ratio);
      }

      alphaMask[y * width + x] = nextAlpha;
      if (nextAlpha < 18) continue;
      activeCount += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!activeCount || maxX < minX || maxY < minY) return null;
  if ((activeCount / Math.max(1, width * height)) < (options.minCoverage ?? 0.008)) return null;
  softenAlpha(alphaMask, width, height, options.edgeSoftness ?? 1);

  const padding = options.padding ?? 4;
  const cropX = clampNum(minX - padding, 0, Math.max(0, width - 1));
  const cropY = clampNum(minY - padding, 0, Math.max(0, height - 1));
  const cropW = clampNum((maxX - minX + 1) + (padding * 2), 1, width - cropX);
  const cropH = clampNum((maxY - minY + 1) + (padding * 2), 1, height - cropY);
  const isolated = document.createElement("canvas");
  isolated.width = cropW;
  isolated.height = cropH;
  const out = isolated.getContext("2d");
  const imageData = out.createImageData(cropW, cropH);

  for (let yy = 0; yy < cropH; yy += 1) {
    for (let xx = 0; xx < cropW; xx += 1) {
      const sourceIndex = ((yy + cropY) * width) + (xx + cropX);
      const srcOffset = sourceIndex * 4;
      const dstOffset = (yy * cropW + xx) * 4;
      imageData.data[dstOffset] = data[srcOffset];
      imageData.data[dstOffset + 1] = data[srcOffset + 1];
      imageData.data[dstOffset + 2] = data[srcOffset + 2];
      imageData.data[dstOffset + 3] = alphaMask[sourceIndex];
    }
  }

  out.putImageData(imageData, 0, 0);
  const coverage = estimateCanvasCoverage(isolated);
  if (coverage < (options.minCoverage ?? 0.008)) return null;
  if (coverage > (options.maxCoverage ?? 0.86)) return null;
  return isolated;
}

function rawTextCropLooksIntentional(canvas) {
  const border = getCanvasBorderAppearance(canvas);
  const coverage = estimateCanvasCoverage(canvas);
  if (coverage > 0.72) return false;
  return border.brightness < 222
    || border.saturation > 0.1
    || (coverage > 0.02 && coverage < 0.34);
}

function lineMidX(line) {
  return (line?.left || 0) + ((line?.width || 0) / 2);
}

function preferInvitationFirstPage(lines, minCount = 1) {
  const source = Array.isArray(lines) ? lines : [];
  const firstPage = source.filter((line) => (line.pageNumber || 1) === 1);
  return firstPage.length >= minCount ? firstPage : source;
}

function joinInvitationNameLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line) => cleanInvitationText(line.text))
    .filter(Boolean)
    .join(" ")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function extractInvitationDateMatch(line) {
  const text = cleanInvitationText(line?.text || "");
  const normalized = normalizeInvitationDate(text);
  return normalized.match(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/)?.[0]
    || text.match(/\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,4}/)?.[0]
    || normalized
    || text;
}

function scoreInvitationDateCandidate(line, centerX, maxTop) {
  const matchedDate = extractInvitationDateMatch(line);
  const extraChars = Math.max(0, cleanInvitationText(line.text).length - cleanInvitationText(matchedDate).length);
  const centerPenalty = Math.abs(lineMidX(line) - centerX) / 22;
  const lowerBonus = line.top > (maxTop * 0.34) ? 24 : 0;
  const pageBonus = (line.pageNumber || 1) === 1 ? 34 : 0;
  const isolatedBonus = extraChars <= 3 ? 46 : (extraChars <= 10 ? 18 : 0);
  return {
    ...line,
    matchedDate,
    score: (line.fontSize * 4.4) + pageBonus + lowerBonus + isolatedBonus - centerPenalty - (extraChars * 2.4),
  };
}

function scoreInvitationNameCandidate(line, centerX) {
  const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
  const centerPenalty = Math.abs(lineMidX(line) - centerX) / 18;
  const pageBonus = (line.pageNumber || 1) === 1 ? 28 : 0;
  const connectorBonus = hasInvitationConnector(line.text) ? 54 : 0;
  const lineLengthPenalty = Math.max(0, cleanInvitationText(line.text).length - 22) * 2.1;
  const wordCountPenalty = Math.max(0, words.length - 3) * 8;
  return {
    ...line,
    score: (line.fontSize * 4.2) + pageBonus + connectorBonus - centerPenalty - lineLengthPenalty - wordCountPenalty,
  };
}

function scoreInvitationNameLineSet(nameLines, centerX, dateLine) {
  const source = Array.isArray(nameLines) ? nameLines.filter(Boolean) : [];
  if (!source.length) return Number.NEGATIVE_INFINITY;
  const scored = source.map((line) => scoreInvitationNameCandidate(line, centerX));
  const bestScore = Math.max(...scored.map((line) => line.score), Number.NEGATIVE_INFINITY);
  const meanFont = scored.reduce((sum, line) => sum + (line.fontSize || 0), 0) / Math.max(1, scored.length);
  const averageCenterPenalty = scored.reduce((sum, line) => sum + (Math.abs(lineMidX(line) - centerX) / 20), 0) / Math.max(1, scored.length);
  const joinedName = joinInvitationNameLines(source);
  const connectorBonus = hasInvitationConnector(joinedName) ? 58 : 0;
  const stackedBonus = source.length === 3 ? 22 : (source.length === 2 ? 12 : 0);
  const compactBonus = joinedName.length <= 24 ? 10 : 0;
  const aboveDateBonus = dateLine && Math.max(...source.map((line) => line.top || 0)) < (dateLine.top || 0) ? 34 : 0;
  return bestScore
    + connectorBonus
    + stackedBonus
    + compactBonus
    + aboveDateBonus
    + (meanFont * 1.1)
    - averageCenterPenalty;
}

function selectInvitationNameLines(lines, dateLine, eventType) {
  const source = preferInvitationFirstPage(lines, 3);
  if (!source.length) return [];
  const preferredPage = source.filter((line) => (line.pageNumber || 1) === 1);
  const activeLines = preferredPage.length ? preferredPage : source;
  const structuralCenterX = activeLines.reduce((sum, line) => sum + lineMidX(line), 0) / Math.max(1, activeLines.length);
  const dateTop = Number.isFinite(dateLine?.top) ? dateLine.top : Number.POSITIVE_INFINITY;
  const maxTop = Math.max(...activeLines.map((line) => line.top || 0), 0);
  const structuralNumericDateRegex = /\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,4}/;
  const metaWords = /(מזמינ(?:ים|ות)|שמחים|שמחות|נרגשים|נרגשות|להזמינכם|להזמינכן|באהבה|חופה|חתונה|קבלת פנים|אירועים|אולם|גן|משפחת|משפחות|נשמח|לחגוג|בואו|איתנו|save the date|celebrate|invite|you are invited|join us|reception|ceremony|venue|family of)/i;
  const structuralCandidates = activeLines
    .filter((line) => line !== dateLine)
    .filter((line) => !structuralNumericDateRegex.test(line.text))
    .filter((line) => !/\d/.test(line.text))
    .filter((line) => !metaWords.test(cleanInvitationText(line.text)))
    .filter((line) => {
      const cleanText = cleanInvitationText(line.text);
      const words = tokenizeInvitationWords(cleanText).filter((word) => !isConnectorToken(word));
      if (!words.length || words.length > 4) return false;
      if (cleanText.length < 2 || cleanText.length > 28) return false;
      if (lineLooksLikeBrokenNameFragment(cleanText, words, eventType === "wedding")) return false;
      if (dateTop !== Number.POSITIVE_INFINITY && (line.top || 0) > (dateTop + Math.max(18, (dateLine?.fontSize || 0) * 0.35))) return false;
      const horizontalDistance = Math.abs(lineMidX(line) - structuralCenterX);
      if (horizontalDistance > Math.max(180, (line.width || 0) * 0.42)) return false;
      return true;
    })
    .map((line) => {
      const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
      const base = scoreInvitationNameCandidate(line, structuralCenterX);
      const dateBonus = dateTop !== Number.POSITIVE_INFINITY && (line.top || 0) < dateTop ? 26 : 0;
      const upperBonus = (line.top || 0) < (dateTop !== Number.POSITIVE_INFINITY ? dateTop * 0.86 : maxTop * 0.52) ? 16 : 0;
      const compactBonus = words.length <= 2 ? 12 : 0;
      return {
        ...base,
        score: base.score + dateBonus + upperBonus + compactBonus,
      };
    })
    .sort((left, right) => right.score - left.score || right.fontSize - left.fontSize);
  if (structuralCandidates.length) {
    const inlineConnector = structuralCandidates.find((line) => hasInvitationConnector(line.text));
    if (inlineConnector) return [inlineConnector];

    const standaloneConnector = structuralCandidates
      .filter((line) => /^(?:&|ו)$/u.test(cleanInvitationText(line.text).replace(/\s+/g, "")))
      .sort((left, right) => right.fontSize - left.fontSize)[0];
    if (standaloneConnector) {
      const nearby = structuralCandidates.filter((line) =>
        line !== standaloneConnector
        && (line.pageNumber || 1) === (standaloneConnector.pageNumber || 1)
        && Math.abs(lineMidX(line) - lineMidX(standaloneConnector)) <= Math.max(90, standaloneConnector.width * 0.42)
        && Math.abs(line.top - standaloneConnector.top) <= Math.max(140, standaloneConnector.fontSize * 3.3)
      );
      const above = nearby
        .filter((line) => line.top < standaloneConnector.top)
        .sort((left, right) => Math.abs(left.top - standaloneConnector.top) - Math.abs(right.top - standaloneConnector.top))[0];
      const below = nearby
        .filter((line) => line.top > standaloneConnector.top)
        .sort((left, right) => Math.abs(left.top - standaloneConnector.top) - Math.abs(right.top - standaloneConnector.top))[0];
      const grouped = [above, standaloneConnector, below].filter(Boolean).sort((left, right) => left.top - right.top);
      if (grouped.length >= 2) return grouped;
    }

    const seed = structuralCandidates[0];
    return structuralCandidates
      .filter((line) =>
        (line.pageNumber || 1) === (seed.pageNumber || 1)
        && Math.abs(line.top - seed.top) <= Math.max(150, seed.fontSize * 3.4)
        && Math.abs(lineMidX(line) - lineMidX(seed)) <= Math.max(120, Math.max(seed.width, line.width) * 0.45)
        && line.fontSize >= seed.fontSize * 0.42
      )
      .sort((left, right) => left.top - right.top)
      .slice(0, 3)
      .filter((line, index, list) => {
        if (!index) return true;
        const previous = list[index - 1];
        return Math.abs((line.top || 0) - (previous.top || 0)) <= Math.max(170, (seed.fontSize || 0) * 3.8);
      });
  }
  const centerX = source.reduce((sum, line) => sum + lineMidX(line), 0) / Math.max(1, source.length);
  const numericDateRegex = /\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,4}/;
  const invitationWords = /(×ž×–×ž×™× ×™×|×ž×–×ž×™× ×•×ª|×©×ž×—×™×|×©×ž×—×•×ª|×œ×”×–×ž×™× ×›×|×œ×”×–×ž×™× ×›×Ÿ|××•×ª×š|××•×ª×›×|××•×ª×›×Ÿ|×‘××”×‘×”|×”×—×ª×•× ×”|×—×ª×•× ×”|× ×¨×’×©×™×|× ×¨×’×©×•×ª|×œ×‘×•×|×œ×—×’×•×’|×‘×•××•|××™×ª× ×•|×‘×§×©×ª|××¡×³×“|save the date|celebrate|invite|you are invited|join us)/i;
  const venueWords = /(××™×¨×•×¢×™×|××•×œ×|×’×Ÿ|×§×‘×œ×ª ×¤× ×™×|×—×•×¤×”|×§×™×“×•×©×™×Ÿ|×¨×™×§×•×“×™×|reception|ceremony|venue)/i;
  const familyWords = /(×ž×©×¤×—×ª|×ž×©×¤×—×•×ª|family of)/i;
  const candidates = source
    .filter((line) => line !== dateLine)
    .filter((line) => !numericDateRegex.test(line.text))
    .filter((line) => !invitationWords.test(line.text))
    .filter((line) => !venueWords.test(line.text))
    .filter((line) => !familyWords.test(line.text))
    .filter((line) => !/\d/.test(line.text))
    .filter((line) => tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word)).length >= 1)
    .filter((line) => !lineLooksLikeBrokenNameFragment(line.text, tokenizeInvitationWords(line.text), eventType === "wedding"))
    .map((line) => scoreInvitationNameCandidate(line, centerX))
    .sort((left, right) => right.score - left.score || right.fontSize - left.fontSize);

  if (!candidates.length) return [];
  const inlineConnector = candidates.find((line) => hasInvitationConnector(line.text));
  if (inlineConnector) return [inlineConnector];

  const standaloneConnector = candidates
    .filter((line) => /^[&×•]$/.test(cleanInvitationText(line.text).replace(/\s+/g, "")))
    .sort((left, right) => right.fontSize - left.fontSize)[0];
  if (standaloneConnector) {
    const nearby = candidates.filter((line) =>
      line !== standaloneConnector
      && (line.pageNumber || 1) === (standaloneConnector.pageNumber || 1)
      && Math.abs(lineMidX(line) - lineMidX(standaloneConnector)) <= Math.max(90, standaloneConnector.width * 0.42)
      && Math.abs(line.top - standaloneConnector.top) <= Math.max(140, standaloneConnector.fontSize * 3.3)
    );
    const above = nearby
      .filter((line) => line.top < standaloneConnector.top)
      .sort((left, right) => Math.abs(left.top - standaloneConnector.top) - Math.abs(right.top - standaloneConnector.top))[0];
    const below = nearby
      .filter((line) => line.top > standaloneConnector.top)
      .sort((left, right) => Math.abs(left.top - standaloneConnector.top) - Math.abs(right.top - standaloneConnector.top))[0];
    const grouped = [above, standaloneConnector, below].filter(Boolean).sort((left, right) => left.top - right.top);
    if (grouped.length >= 2) return grouped;
  }

  const seed = candidates[0];
  return candidates
    .filter((line) =>
      (line.pageNumber || 1) === (seed.pageNumber || 1)
      && Math.abs(line.top - seed.top) <= Math.max(150, seed.fontSize * 3.4)
      && Math.abs(lineMidX(line) - lineMidX(seed)) <= Math.max(120, Math.max(seed.width, line.width) * 0.45)
      && line.fontSize >= seed.fontSize * 0.42
    )
    .sort((left, right) => left.top - right.top)
    .slice(0, 3);
}

function isolateCanvasBackgroundFull(sourceCanvas, bgHex, options = {}) {
  if (!sourceCanvas) return null;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const bg = hexToRgb(bgHex);
  const lowTolerance = options.lowTolerance ?? 20;
  const highTolerance = options.highTolerance ?? 62;
  const edgeSoftness = options.edgeSoftness ?? 1;
  const alphaMask = new Uint8ClampedArray(width * height);
  let active = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 24) continue;
      const diff = (
        Math.abs(data[idx] - bg.r)
        + Math.abs(data[idx + 1] - bg.g)
        + Math.abs(data[idx + 2] - bg.b)
      ) / 3;
      let nextAlpha = 0;
      if (diff >= highTolerance) nextAlpha = alpha;
      else if (diff > lowTolerance) nextAlpha = Math.round(((diff - lowTolerance) / Math.max(1, highTolerance - lowTolerance)) * alpha);
      alphaMask[y * width + x] = nextAlpha;
      if (nextAlpha > 18) active += 1;
    }
  }

  if ((active / Math.max(1, width * height)) < (options.minCoverage ?? 0.004)) return null;
  softenAlpha(alphaMask, width, height, edgeSoftness);
  const isolated = document.createElement("canvas");
  isolated.width = width;
  isolated.height = height;
  const out = isolated.getContext("2d");
  const imageData = out.createImageData(width, height);
  for (let index = 0; index < width * height; index += 1) {
    const srcOffset = index * 4;
    imageData.data[srcOffset] = data[srcOffset];
    imageData.data[srcOffset + 1] = data[srcOffset + 1];
    imageData.data[srcOffset + 2] = data[srcOffset + 2];
    imageData.data[srcOffset + 3] = alphaMask[index];
  }
  out.putImageData(imageData, 0, 0);
  return isolated;
}

function componentBoxGap(left, right) {
  const gapX = Math.max(0, left.minX - right.maxX - 1, right.minX - left.maxX - 1);
  const gapY = Math.max(0, left.minY - right.maxY - 1, right.minY - left.maxY - 1);
  return { gapX, gapY };
}

function clusterInvitationComponents(components, options = {}) {
  const source = Array.isArray(components) ? components : [];
  if (!source.length) return [];
  const gapX = options.gapX ?? 28;
  const gapY = options.gapY ?? 28;
  const visited = new Uint8Array(source.length);
  const clusters = [];
  for (let index = 0; index < source.length; index += 1) {
    if (visited[index]) continue;
    visited[index] = 1;
    const stack = [index];
    const members = [];
    while (stack.length) {
      const currentIndex = stack.pop();
      const current = source[currentIndex];
      members.push(current);
      for (let neighborIndex = 0; neighborIndex < source.length; neighborIndex += 1) {
        if (visited[neighborIndex]) continue;
        const gap = componentBoxGap(current, source[neighborIndex]);
        if (gap.gapX <= gapX && gap.gapY <= gapY) {
          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        }
      }
    }
    const area = members.reduce((sum, component) => sum + component.area, 0);
    const minX = Math.min(...members.map((component) => component.minX));
    const maxX = Math.max(...members.map((component) => component.maxX));
    const minY = Math.min(...members.map((component) => component.minY));
    const maxY = Math.max(...members.map((component) => component.maxY));
    clusters.push({
      components: members,
      area,
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      midX: (minX + maxX) / 2,
      midY: (minY + maxY) / 2,
      touchesLeft: members.some((component) => component.touchesLeft),
      touchesRight: members.some((component) => component.touchesRight),
      touchesTop: members.some((component) => component.touchesTop),
      touchesBottom: members.some((component) => component.touchesBottom),
    });
  }
  return clusters;
}

function classifyInvitationDecorZone(cluster, width, height) {
  if (!cluster) return "other";
  // Top banner (wide element across top)
  if (
    (cluster.touchesTop || cluster.minY < height * 0.1)
    && cluster.width > width * 0.38
    && cluster.width > (cluster.height * 1.12)
  ) {
    return "top";
  }
  // Top-left corner
  if (cluster.midY < height * 0.32 && cluster.midX < width * 0.34
    && (cluster.touchesTop || cluster.touchesLeft || cluster.minY < height * 0.12 || cluster.minX < width * 0.12)) {
    return "top-left";
  }
  // Top-right corner
  if (cluster.midY < height * 0.32 && cluster.midX > width * 0.66
    && (cluster.touchesTop || cluster.touchesRight || cluster.minY < height * 0.12 || cluster.maxX > width * 0.88)) {
    return "top-right";
  }
  // Bottom corners
  if (cluster.midY > height * 0.56 && cluster.midX < width * 0.46) return "bottom-left";
  if (cluster.midY > height * 0.56 && cluster.midX > width * 0.54) return "bottom-right";
  // Centerpiece (small element in middle area — could be a heart, ring, etc.)
  if (cluster.midY > height * 0.24 && cluster.midY < height * 0.78
    && cluster.midX > width * 0.24 && cluster.midX < width * 0.76
    && cluster.width < width * 0.38 && cluster.height < height * 0.34) {
    return "centerpiece";
  }
  // Side elements
  if (cluster.midX < width * 0.24) return "left";
  if (cluster.midX > width * 0.76) return "right";
  return "other";
}

function trimTextEdgeArtifacts(sourceCanvas, kind = "generic") {
  if (!sourceCanvas) return null;
  const components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold: 10,
    minAreaRatio: 0.00002,
  });
  if (!components.length) return sourceCanvas;
  if (components.length === 1) {
    return cropCanvasToComponentBounds(sourceCanvas, components, { paddingX: 1, paddingY: 1 }) || sourceCanvas;
  }
  const totalArea = components.reduce((sum, component) => sum + (component.area || 0), 0);
  const maxArea = Math.max(...components.map((component) => component.area || 0), 1);
  const maxHeight = Math.max(...components.map((component) => component.height || 0), 1);
  const edgeMargin = Math.max(6, sourceCanvas.width * (kind === "date" ? 0.08 : 0.14));
  const areaShareCap = kind === "date" ? 0.07 : 0.10;
  const maxAreaCap = kind === "date" ? 0.09 : 0.16;
  const heightCap = kind === "date" ? 0.5 : 0.72;
  const widthCap = kind === "date" ? 0.05 : 0.10;
  const preliminary = components.filter((component) => {
    const isEdge = component.maxX <= edgeMargin
      || component.minX >= (sourceCanvas.width - edgeMargin);
    if (!isEdge) return true;
    const smallByTotal = (component.area || 0) < (totalArea * areaShareCap);
    const smallByMax = (component.area || 0) < (maxArea * maxAreaCap);
    const shortComponent = (component.height || 0) < (maxHeight * heightCap);
    const narrowComponent = (component.width || 0) < (sourceCanvas.width * widthCap);
    if (!(smallByTotal && smallByMax)) return true;
    if (kind === "date") {
      const veryShort = (component.height || 0) < (maxHeight * 0.4);
      return !(shortComponent && (veryShort || narrowComponent));
    }
    return !(shortComponent || narrowComponent);
  });
  const ordered = [...preliminary].sort((left, right) => left.minX - right.minX);
  const filtered = new Set(ordered);
  const pruneIsolatedEdge = (component, neighbor, side) => {
    if (!component) return;
    const nearEdge = side === "left"
      ? component.minX <= edgeMargin
      : component.maxX >= (sourceCanvas.width - edgeMargin);
    if (!nearEdge) return;
    const gap = neighbor
      ? (side === "left" ? Math.max(0, neighbor.minX - component.maxX) : Math.max(0, component.minX - neighbor.maxX))
      : 0;
    const smallByTotal = (component.area || 0) < totalArea * (kind === "date" ? 0.05 : 0.09);
    const narrow = (component.width || 0) < sourceCanvas.width * (kind === "date" ? 0.05 : 0.12);
    const lowFill = (component.fillRatio || 0) < 0.10;
    if (smallByTotal && narrow && gap >= Math.max(6, sourceCanvas.width * 0.01)) {
      filtered.delete(component);
    } else if (lowFill && smallByTotal && gap >= Math.max(4, sourceCanvas.width * 0.008)) {
      filtered.delete(component);
    }
  };
  pruneIsolatedEdge(ordered[0], ordered[1], "left");
  if (ordered.length > 2) pruneIsolatedEdge(ordered[1], ordered[2], "left");
  pruneIsolatedEdge(ordered[ordered.length - 1], ordered[ordered.length - 2], "right");
  if (ordered.length > 2) pruneIsolatedEdge(ordered[ordered.length - 2], ordered[ordered.length - 3], "right");
  return cropCanvasToComponentBounds(
    sourceCanvas,
    filtered.size ? [...filtered] : components,
    { paddingX: 1, paddingY: 1 }
  ) || sourceCanvas;
}

function trimDateEdgeArtifacts(sourceCanvas) {
  if (!sourceCanvas) return null;
  const components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold: 10,
    minAreaRatio: 0.00002,
  });
  if (!components.length) return sourceCanvas;
  const totalArea = components.reduce((sum, component) => sum + (component.area || 0), 0);
  const maxHeight = Math.max(...components.map((c) => c.height || 0), 1);
  const ordered = [...components].sort((left, right) => left.minX - right.minX);
  const filtered = new Set(ordered);
  const maybeRemoveEdgeArtifact = (component, neighbor, side) => {
    if (!component) return;
    const edgeMargin = Math.max(6, sourceCanvas.width * 0.05);
    const nearEdge = side === "left"
      ? component.minX <= edgeMargin
      : component.maxX >= (sourceCanvas.width - edgeMargin);
    if (!nearEdge) return;
    const gap = neighbor
      ? (side === "left" ? Math.max(0, neighbor.minX - component.maxX) : Math.max(0, component.minX - neighbor.maxX))
      : Infinity;
    const tinyArea = (component.area || 0) < Math.max(totalArea * 0.06, 24);
    const narrow = (component.width || 0) <= Math.max(10, sourceCanvas.width * 0.05);
    const veryShort = (component.height || 0) < (maxHeight * 0.4);
    const lowFill = (component.fillRatio || 0) < 0.12;
    // Remove: tiny area + narrow + gap, OR very short/low-fill isolated artifact
    if (tinyArea && narrow && gap >= Math.max(6, sourceCanvas.width * 0.01)) {
      filtered.delete(component);
    } else if ((veryShort || lowFill) && tinyArea && gap >= Math.max(4, sourceCanvas.width * 0.008)) {
      filtered.delete(component);
    }
  };
  // Check first and last 2 components on each side for artifacts
  maybeRemoveEdgeArtifact(ordered[0], ordered[1], "left");
  if (ordered.length > 2) maybeRemoveEdgeArtifact(ordered[1], ordered[2], "left");
  maybeRemoveEdgeArtifact(ordered[ordered.length - 1], ordered[ordered.length - 2], "right");
  if (ordered.length > 2) maybeRemoveEdgeArtifact(ordered[ordered.length - 2], ordered[ordered.length - 3], "right");
  // Also check top/bottom edge artifacts
  const vertOrdered = [...components].sort((a, b) => a.minY - b.minY);
  const maybeRemoveVertEdge = (component, neighbor, side) => {
    if (!component) return;
    const nearEdge = side === "top"
      ? component.minY <= Math.max(4, sourceCanvas.height * 0.06)
      : component.maxY >= (sourceCanvas.height - Math.max(4, sourceCanvas.height * 0.06));
    if (!nearEdge) return;
    const tinyArea = (component.area || 0) < Math.max(totalArea * 0.04, 20);
    const short = (component.height || 0) < (maxHeight * 0.35);
    if (tinyArea && short) filtered.delete(component);
  };
  maybeRemoveVertEdge(vertOrdered[0], vertOrdered[1], "top");
  maybeRemoveVertEdge(vertOrdered[vertOrdered.length - 1], vertOrdered[vertOrdered.length - 2], "bottom");
  return cropCanvasToComponentBounds(sourceCanvas, [...filtered], { paddingX: 1, paddingY: 1 }) || sourceCanvas;
}

function padCanvasTransparent(sourceCanvas, padding = 4) {
  if (!sourceCanvas) return null;
  const pad = Math.max(0, Math.round(padding));
  if (!pad) return sourceCanvas;
  const canvas = document.createElement("canvas");
  canvas.width = sourceCanvas.width + (pad * 2);
  canvas.height = sourceCanvas.height + (pad * 2);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(sourceCanvas, pad, pad);
  return canvas;
}

function trimTextToDominantCluster(sourceCanvas, kind = "generic") {
  if (!sourceCanvas) return null;
  const padded = padCanvasTransparent(sourceCanvas, kind === "date" ? 6 : 5) || sourceCanvas;
  const components = collectCanvasComponents(padded, {
    alphaThreshold: 10,
    minAreaRatio: 0.000015,
  });
  if (!components.length) return sourceCanvas;
  if (components.length === 1) {
    return cropCanvasToComponentBounds(padded, components, { paddingX: 1, paddingY: 1 }) || padded;
  }
  const clusters = clusterInvitationComponents(components, {
    gapX: kind === "date" ? Math.max(10, Math.round(padded.width * 0.025)) : Math.max(14, Math.round(padded.width * 0.03)),
    gapY: kind === "date" ? Math.max(8, Math.round(padded.height * 0.06)) : Math.max(16, Math.round(padded.height * 0.15)),
  });
  if (!clusters.length) return padded;
  const centerX = padded.width / 2;
  const centerY = kind === "date" ? padded.height * 0.58 : padded.height * 0.48;
  const bestCluster = [...clusters].sort((left, right) => {
    const score = (cluster) => {
      const centerPenalty = Math.abs(cluster.midX - centerX) * 3.6;
      const verticalPenalty = Math.abs(cluster.midY - centerY) * (kind === "date" ? 1.2 : 0.65);
      const edgePenalty = (
        (cluster.touchesLeft ? 1 : 0)
        + (cluster.touchesRight ? 1 : 0)
        + (cluster.touchesTop && kind === "date" ? 1 : 0)
      ) * Math.max(24, padded.width * 0.03);
      const tinyPenalty = cluster.area < (padded.width * padded.height * 0.0025) ? 120 : 0;
      const shapeBonus = (cluster.width * 5.2) + (cluster.height * 2.1) + (cluster.components.length * 16);
      return (cluster.area * 0.9) + shapeBonus - centerPenalty - verticalPenalty - edgePenalty - tinyPenalty;
    };
    return score(right) - score(left);
  })[0];
  if (!bestCluster?.components?.length) return padded;
  const rowTolerance = kind === "date"
    ? Math.max(10, Math.round(padded.height * 0.2))
    : Math.max(12, Math.round(padded.height * 0.18));
  const companionClusters = clusters.filter((cluster) => {
    if (cluster === bestCluster) return true;
    if (Math.abs(cluster.midY - bestCluster.midY) > rowTolerance) return false;
    if (cluster.area < (bestCluster.area * 0.01)) return false;
    if (
      (cluster.touchesLeft || cluster.touchesRight)
      && cluster.area < (bestCluster.area * 0.18)
      && cluster.height < (bestCluster.height * 0.82)
      && cluster.width < Math.max(8, padded.width * 0.09)
    ) {
      return false;
    }
    if (
      (cluster.touchesLeft || cluster.touchesRight)
      && cluster.width < Math.max(4, padded.width * 0.035)
      && cluster.area < (bestCluster.area * 0.12)
    ) {
      return false;
    }
    if (kind === "date" && cluster.width < Math.max(3, padded.width * 0.01) && cluster.height < Math.max(8, padded.height * 0.12)) {
      return false;
    }
    // Reject companions with large horizontal gap from the best cluster (likely decorative artifacts)
    const gapFromBest = Math.max(0,
      cluster.minX > bestCluster.maxX ? cluster.minX - bestCluster.maxX
        : (bestCluster.minX > cluster.maxX ? bestCluster.minX - cluster.maxX : 0)
    );
    const gapThreshold = kind === "date"
      ? Math.max(12, padded.width * 0.035)
      : Math.max(16, padded.width * 0.04);
    if (gapFromBest > gapThreshold && cluster.area < (bestCluster.area * 0.2)) return false;
    // Reject companions with very low average fill ratio (decorative fragments, not text characters)
    const avgFill = cluster.components.reduce((sum, c) => sum + (c.fillRatio || 0), 0) / Math.max(1, cluster.components.length);
    if (avgFill < 0.06 && cluster.area < (bestCluster.area * 0.25)) return false;
    // Reject companions that are much taller than the text (decorative elements extend vertically)
    if (cluster.height > (bestCluster.height * 1.6) && cluster.area < (bestCluster.area * 0.3)) return false;
    return true;
  });
  const mergedComponents = companionClusters.flatMap((cluster) => cluster.components || []);
  return cropCanvasToComponentBounds(padded, mergedComponents.length ? mergedComponents : bestCluster.components, {
    paddingX: 2,
    paddingY: 2,
  }) || padded;
}

/**
 * Filters text canvas by removing components whose color is very different
 * from the dominant text color. This separates text (single color) from
 * decorative elements (different colors like green leaves, golden ornaments).
 */
function filterTextComponentsByDominantColor(sourceCanvas, kind = "generic") {
  if (!sourceCanvas) return null;
  const ctx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const { width, height } = sourceCanvas;
  if (!width || !height) return sourceCanvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  const components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold: 12,
    minAreaRatio: 0.00003,
  });
  if (components.length <= 1) return sourceCanvas;
  // Sample colors from each component (center + a few points)
  const sampleComponentColor = (comp) => {
    const samples = [];
    const points = [
      [Math.round((comp.minX + comp.maxX) / 2), Math.round((comp.minY + comp.maxY) / 2)],
      [comp.minX + Math.round(comp.width * 0.25), Math.round((comp.minY + comp.maxY) / 2)],
      [comp.minX + Math.round(comp.width * 0.75), Math.round((comp.minY + comp.maxY) / 2)],
      [Math.round((comp.minX + comp.maxX) / 2), comp.minY + Math.round(comp.height * 0.25)],
      [Math.round((comp.minX + comp.maxX) / 2), comp.minY + Math.round(comp.height * 0.75)],
    ];
    for (const [px, py] of points) {
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const idx = (py * width + px) * 4;
      if (data[idx + 3] < 30) continue;
      samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }
    if (!samples.length) return null;
    return {
      r: Math.round(samples.reduce((s, c) => s + c.r, 0) / samples.length),
      g: Math.round(samples.reduce((s, c) => s + c.g, 0) / samples.length),
      b: Math.round(samples.reduce((s, c) => s + c.b, 0) / samples.length),
    };
  };
  // Find dominant color from the largest components (these are most likely text)
  const byArea = [...components].sort((a, b) => b.area - a.area);
  const dominantColors = [];
  for (let i = 0; i < Math.min(3, byArea.length); i += 1) {
    const color = sampleComponentColor(byArea[i]);
    if (color) dominantColors.push(color);
  }
  if (!dominantColors.length) return sourceCanvas;
  const tolerance = kind === "date" ? 54 : 50;
  const totalArea = components.reduce((s, c) => s + c.area, 0);
  // Find components with very different colors (decorative fragments)
  const removable = components.filter((comp) => {
    // Never remove large components
    if (comp.area >= byArea[0].area * 0.35) return false;
    // Never remove components that make up significant area
    if (comp.area >= totalArea * 0.2) return false;
    const color = sampleComponentColor(comp);
    if (!color) return false;
    // Check color distance to any dominant color
    const minDiff = Math.min(...dominantColors.map((dom) =>
      (Math.abs(color.r - dom.r) + Math.abs(color.g - dom.g) + Math.abs(color.b - dom.b)) / 3
    ));
    return minDiff > tolerance;
  });
  if (!removable.length) return sourceCanvas;
  // Remove non-matching components
  const clone = document.createElement("canvas");
  clone.width = width;
  clone.height = height;
  const cloneCtx = clone.getContext("2d");
  cloneCtx.drawImage(sourceCanvas, 0, 0);
  removable.forEach((comp) => {
    cloneCtx.clearRect(
      Math.max(0, comp.minX - 1),
      Math.max(0, comp.minY - 1),
      Math.min(width - comp.minX + 1, comp.width + 2),
      Math.min(height - comp.minY + 1, comp.height + 2),
    );
  });
  return trimCanvasToAllContent(clone, {
    alphaThreshold: 10,
    minAreaRatio: 0.00002,
    paddingX: 1,
    paddingY: 1,
  }) || clone;
}

function clearTinyEdgeComponentRects(sourceCanvas, kind = "generic") {
  if (!sourceCanvas) return null;
  const components = collectCanvasComponents(sourceCanvas, {
    alphaThreshold: 12,
    minAreaRatio: 0.00008,
  });
  if (components.length <= 1) return sourceCanvas;
  const maxArea = Math.max(...components.map((component) => component.area), 1);
  const maxHeight = Math.max(...components.map((component) => component.height), 1);
  // Find main text body bounds (large components = actual text)
  const mainBody = components.filter((c) => c.area >= maxArea * 0.2);
  const mainMinX = mainBody.length ? Math.min(...mainBody.map((c) => c.minX)) : 0;
  const mainMaxX = mainBody.length ? Math.max(...mainBody.map((c) => c.maxX)) : sourceCanvas.width;
  const removable = components.filter((component) => {
    if (!(component.touchesLeft || component.touchesRight || component.touchesTop || component.touchesBottom)) return false;
    if (component.area >= (maxArea * (kind === "name" ? 0.22 : 0.12))) return false;
    if (component.height >= (maxHeight * (kind === "name" ? 0.82 : 0.7))) return false;
    if (component.width >= (sourceCanvas.width * (kind === "name" ? 0.14 : 0.08))) return false;
    if (component.fillRatio >= (kind === "name" ? 0.24 : 0.2)) return false;
    // Gap check: if close to main text body, it is likely a text character — keep it
    const gapToMain = component.touchesLeft
      ? Math.max(0, mainMinX - component.maxX)
      : (component.touchesRight
        ? Math.max(0, component.minX - mainMaxX)
        : 0);
    if (gapToMain < Math.max(4, sourceCanvas.width * 0.012)) return false;
    return true;
  });
  if (!removable.length) return sourceCanvas;
  const clone = document.createElement("canvas");
  clone.width = sourceCanvas.width;
  clone.height = sourceCanvas.height;
  const ctx = clone.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);
  removable.forEach((component) => {
    ctx.clearRect(
      Math.max(0, component.minX - 2),
      Math.max(0, component.minY - 2),
      Math.min(clone.width, component.width + 4),
      Math.min(clone.height, component.height + 4)
    );
  });
  return trimCanvasToAllContent(clone, {
    alphaThreshold: 10,
    minAreaRatio: 0.00002,
    paddingX: 1,
    paddingY: 1,
  }) || clone;
}

function pickBestInvitationPage(lines, eventType) {
  const source = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!source.length) return { pageNumber: 1, pageLines: [], nameLines: [], dateLine: null };
  const dateRegex = /(?:\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,4}|\d{1,2}\s+[Ã—Â-Ã—Âª]+(?:\s+\d{2,4})?)/u;
  const byPage = source.reduce((map, line) => {
    const pageNumber = line.pageNumber || 1;
    if (!map.has(pageNumber)) map.set(pageNumber, []);
    map.get(pageNumber).push(line);
    return map;
  }, new Map());
  const candidates = [...byPage.entries()]
    .map(([pageNumber, pageLines]) => {
      const centerX = pageLines.reduce((sum, line) => sum + lineMidX(line), 0) / Math.max(1, pageLines.length);
      const maxTop = Math.max(...pageLines.map((line) => line.top || 0), 0);
      const dateLine = pageLines
        .filter((line) => dateRegex.test(line.text) || dateRegex.test(normalizeInvitationDate(line.text)))
        .map((line) => scoreInvitationDateCandidate(line, centerX, maxTop))
        .sort((left, right) => right.score - left.score || right.fontSize - left.fontSize)[0] || null;
      const rawNameLines = selectInvitationNameLines(pageLines, dateLine, eventType);
      const nameLines = refineInvitationNameLinesSimple(rawNameLines, dateLine, eventType);
      const nameScore = scoreInvitationNameLineSet(nameLines, centerX, dateLine);
      const dateScore = dateLine?.score ?? Number.NEGATIVE_INFINITY;
      const joinedName = joinInvitationNameLines(nameLines);
      const hasBoth = !!(nameLines.length && dateLine);
      const sharedPageBonus = hasBoth ? 140 : 0;
      const orderBonus = hasBoth && Math.max(...nameLines.map((line) => line.top || 0)) < (dateLine.top || 0) ? 48 : 0;
      const centeredBonus = hasBoth
        ? Math.max(0, 26 - (Math.abs(lineMidX(dateLine) - centerX) / 18))
        : 0;
      const connectorBonus = hasInvitationConnector(joinedName) ? 34 : 0;
      return {
        pageNumber,
        pageLines,
        nameLines,
        dateLine,
        score: (Number.isFinite(nameScore) ? nameScore : -1200)
          + (Number.isFinite(dateScore) ? dateScore : -1200)
          + sharedPageBonus
          + orderBonus
          + centeredBonus
          + connectorBonus,
      };
    })
    .sort((left, right) => right.score - left.score || left.pageNumber - right.pageNumber);
  return candidates[0] || { pageNumber: 1, pageLines: source, nameLines: [], dateLine: null };
}

function scoreTopBannerAsset(asset) {
  if (!asset) return 0;
  const lowerHalfRatio = asset.lowerHalfRatio || 0;
  const bottomThirdRatio = asset.bottomThirdRatio || 0;
  const centerBandRatio = asset.centerBandRatio || 0;
  const rowPenalty = (asset.maxRowCoverageRatio || 0) > 0.74 ? 0.55 : 1;
  return (asset.score || 0)
    * rowPenalty
    * (0.4 + (lowerHalfRatio * 1.6) + (bottomThirdRatio * 2.2) + (centerBandRatio * 0.55));
}

function cropInvitationTextAssetSimple(sourceCanvas, lines, matchText, id, kind = "generic") {
  if (!sourceCanvas || !Array.isArray(lines) || !lines.length) return null;
  const isDate = kind === "date";
  const isName = kind === "name";
  const raw = cropRawLineCanvas(sourceCanvas, lines, {
    id,
    matchText,
    padXFactor: isDate ? 0.12 : (isName ? 0.12 : 0.08),
    padTopFactor: isDate ? 0.18 : (isName ? 0.16 : 0.12),
    padBottomFactor: isDate ? 0.22 : (isName ? 0.18 : 0.12),
    topFontFactor: isDate ? 0.82 : (isName ? 0.84 : 0.72),
    bottomFontFactor: isDate ? 0.40 : (isName ? 0.30 : 0.2),
    maxHeightRatio: isDate ? 0.24 : (isName ? 0.30 : 0.3),
    chunkPaddingX: isDate ? 8 : (isName ? 4 : 8),
    chunkPaddingY: isDate ? 10 : (isName ? 6 : 10),
    tightPaddingX: isName ? 2 : 2,
    tightPaddingY: isName ? 2 : 2,
    bridgeGapFactor: isDate ? 0.58 : (isName ? 0.42 : 0.72),
    segmentPadding: isDate ? 4 : (isName ? 2 : 6),
    guidePadX: isDate ? 2 : (isName ? 2 : 2),
    guidePadY: isDate ? 2 : (isName ? 2 : 2),
    guideIntersectionRatio: isDate ? 0.18 : (isName ? 0.2 : 0.16),
  });
  if (!raw) return null;
  const cropBg = estimateCanvasBorderHex(raw);
  const isolated = isolateCanvasBackground(raw, cropBg, {
    lowTolerance: isDate ? 16 : (isName ? 17 : 18),
    highTolerance: isDate ? 48 : (isName ? 50 : 54),
    padding: isDate ? 4 : (isName ? 3 : 5),
    edgeSoftness: 1,
  }) || raw;
  // Remove decorative fragments by color — keep only pixels matching text color
  const colorFiltered = filterTextComponentsByDominantColor(isolated, kind) || isolated;
  const focused = trimCanvasToFocusedTextContent(colorFiltered, {
    preferSingleRow: isDate || (isName && lines.length === 1),
    preferSingleColumnGroup: false,
    alphaThreshold: 16,
    minAreaRatio: isDate ? 0.00004 : (isName ? 0.00005 : 0.00006),
    rowGapTolerance: isDate ? 6 : (isName ? Math.max(14, Math.round(isolated.height * 0.22)) : Math.max(10, Math.round(isolated.height * 0.12))),
    columnGapTolerance: isDate ? 8 : (isName ? 5 : 6),
    paddingX: isName ? 1 : 2,
    paddingY: isName ? 1 : 2,
  }) || isolated;
  const cleaned = refineTextAssetCanvas(focused, kind, {
    alphaThreshold: 12,
    minAreaRatio: isDate ? 0.00004 : 0.00005,
    rowGapTolerance: isDate ? 6 : (isName ? 8 : 10),
    paddingX: 1,
    paddingY: 1,
  }) || focused;
  const edgeTrimmed = isDate
    ? (trimDateEdgeArtifacts(cleaned) || cleaned)
    : (isName
      ? (trimTextEdgeArtifacts(cleaned, "name") || cleaned)
      : cleaned);
  const clusterTrimmed = trimTextToDominantCluster(edgeTrimmed, kind) || edgeTrimmed;
  const finalCanvas = isDate
    ? (trimDateEdgeArtifacts(clusterTrimmed) || clusterTrimmed)
    : (isName
      ? (clearTinyEdgeComponentRects(trimTextEdgeArtifacts(clusterTrimmed, "name") || clusterTrimmed, "name") || clusterTrimmed)
      : clusterTrimmed);
  const tightenedFinal = trimCanvasToAllContent(finalCanvas, {
    alphaThreshold: 10,
    minAreaRatio: 0.00002,
    paddingX: 1,
    paddingY: 1,
  }) || finalCanvas;
  if (!assetHasExpectedTextSpan(tightenedFinal, lines, matchText, {
    minRatio: isName ? 0.62 : (isDate ? 0.58 : 0.7),
    minAspectRatio: isName ? 1.8 : (isDate ? 1.6 : 0),
  })) {
    return null;
  }
  if (isName && tightenedFinal.height > (tightenedFinal.width * 0.38)) {
    return null;
  }
  return canvasToAsset(tightenedFinal, id);
}

function cropInvitationLineBoundsCanvas(sourceCanvas, lines, kind = "generic") {
  if (!sourceCanvas || !Array.isArray(lines) || !lines.length) return null;
  const isDate = kind === "date";
  const maxFont = Math.max(...lines.map((line) => line.fontSize || line.height || 24), 24);
  const minLeft = Math.max(0, Math.min(...lines.map((line) => line.left || 0)));
  const minTop = Math.max(0, Math.min(...lines.map((line) => line.top || 0)));
  const maxRight = Math.min(sourceCanvas.width, Math.max(...lines.map((line) => (line.left || 0) + (line.width || 0))));
  const maxBottom = Math.min(sourceCanvas.height, Math.max(...lines.map((line) => (line.top || 0) + (line.height || 0))));
  const padX = Math.max(16, Math.round(maxFont * (isDate ? 0.32 : 0.30)));
  const padTop = Math.max(12, Math.round(maxFont * 0.24));
  const padBottom = Math.max(14, Math.round(maxFont * 0.28));
  const baselineLift = Math.round(maxFont * (isDate ? 0.92 : 1.10));
  const depth = Math.round(maxFont * (isDate ? 0.48 : 0.42));
  const sx = Math.max(0, Math.floor(minLeft - padX));
  const sy = Math.max(0, Math.floor(minTop - baselineLift - padTop));
  const sw = Math.min(sourceCanvas.width - sx, Math.ceil((maxRight - minLeft) + (padX * 2)));
  const sh = Math.min(sourceCanvas.height - sy, Math.ceil((maxBottom - minTop) + baselineLift + depth + padTop + padBottom));
  if (sw <= 2 || sh <= 2) return null;
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, sw, sh);
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function forceCropInvitationTextAssetSimple(sourceCanvas, lines, id, kind = "generic") {
  if (!sourceCanvas || !Array.isArray(lines) || !lines.length) return null;
  const isDate = kind === "date";
  const isName = kind === "name";
  const raw = (isName ? cropInvitationLineBoundsCanvas(sourceCanvas, lines, kind) : null) || cropRawLineCanvas(sourceCanvas, lines, {
    id,
    padXFactor: isDate ? 0.14 : (isName ? 0.14 : 0.08),
    padTopFactor: isDate ? 0.20 : (isName ? 0.18 : 0.12),
    padBottomFactor: isDate ? 0.24 : (isName ? 0.20 : 0.14),
    topFontFactor: isDate ? 0.84 : (isName ? 0.86 : 0.72),
    bottomFontFactor: isDate ? 0.46 : (isName ? 0.34 : 0.24),
    maxHeightRatio: isDate ? 0.28 : (isName ? 0.36 : 0.34),
    chunkPaddingX: isDate ? 8 : 4,
    chunkPaddingY: isDate ? 10 : 6,
    tightPaddingX: 1,
    tightPaddingY: 1,
    bridgeGapFactor: isDate ? 0.7 : 0.56,
    segmentPadding: isDate ? 6 : 4,
    guidePadX: 1,
    guidePadY: 1,
    guideIntersectionRatio: isDate ? 0.14 : 0.16,
  });
  if (!raw) return null;
  const cropBg = estimateCanvasBorderHex(raw);
  const isolated = isolateCanvasBackground(raw, cropBg, {
    lowTolerance: isDate ? 14 : 16,
    highTolerance: isDate ? 52 : 56,
    padding: 4,
    edgeSoftness: 1,
  }) || raw;
  // Remove decorative fragments by color — keep only pixels matching text color
  const colorFiltered = filterTextComponentsByDominantColor(isolated, kind) || isolated;
  const edgeTrimmed = isDate
    ? (trimDateEdgeArtifacts(colorFiltered) || colorFiltered)
    : (isName
      ? (trimCanvasToDominantRows(colorFiltered, {
        alphaThreshold: 12,
        rowThresholdRatio: 0.08,
        rowGapTolerance: Math.max(14, Math.round(colorFiltered.height * 0.22)),
        paddingY: 3,
      }) || colorFiltered)
      : (trimTextEdgeArtifacts(colorFiltered, kind) || colorFiltered));
  const clusterTrimmed = trimTextToDominantCluster(edgeTrimmed, kind) || edgeTrimmed;
  const finalCanvas = isDate
    ? (trimDateEdgeArtifacts(clusterTrimmed) || clusterTrimmed)
    : (isName ? (clearTinyEdgeComponentRects(clusterTrimmed, "name") || clusterTrimmed) : (trimTextEdgeArtifacts(clusterTrimmed, kind) || clusterTrimmed));
  const tightenedFinal = trimCanvasToAllContent(finalCanvas, {
    alphaThreshold: 10,
    minAreaRatio: 0.00002,
    paddingX: 1,
    paddingY: 1,
  }) || finalCanvas;
  return canvasToAsset(padCanvasTransparent(tightenedFinal, 4), id);
}

function extractWholeDecorativeAssetsSimple(sourceCanvas, palette, lines, pageNumber = 1) {
  if (!sourceCanvas) return [];
  const noTextCanvas = removeTextRegionsFromCanvas(sourceCanvas, lines, palette.backgroundBase);
  const isolated = isolateCanvasBackgroundFull(noTextCanvas, palette.backgroundBase, {
    lowTolerance: 18,
    highTolerance: 56,
    edgeSoftness: 1,
    minCoverage: 0.003,
  });
  if (!isolated) return [];
  const components = collectCanvasComponents(isolated, {
    alphaThreshold: 22,
    minAreaRatio: 0.0004,
  });
  if (!components.length) return [];
  const clusters = clusterInvitationComponents(components, {
    gapX: Math.max(26, Math.round(sourceCanvas.width * 0.022)),
    gapY: Math.max(24, Math.round(sourceCanvas.height * 0.02)),
  });
  return clusters
    .filter((cluster) => cluster.area >= (sourceCanvas.width * sourceCanvas.height * 0.0007))
    .filter((cluster) =>
      cluster.touchesLeft
      || cluster.touchesRight
      || cluster.touchesTop
      || cluster.touchesBottom
      || cluster.minY < sourceCanvas.height * 0.28
      || cluster.maxY > sourceCanvas.height * 0.58
      || cluster.minX < sourceCanvas.width * 0.18
      || cluster.maxX > sourceCanvas.width * 0.82
      // Allow centerpiece elements (small, in middle)
      || (cluster.midX > sourceCanvas.width * 0.3 && cluster.midX < sourceCanvas.width * 0.7
        && cluster.midY > sourceCanvas.height * 0.3 && cluster.midY < sourceCanvas.height * 0.7
        && cluster.width < sourceCanvas.width * 0.3 && cluster.height < sourceCanvas.height * 0.25)
    )
    .filter((cluster) => !(cluster.width > sourceCanvas.width * 0.72 && cluster.height < sourceCanvas.height * 0.06))
    .filter((cluster) => !(cluster.width > sourceCanvas.width * 0.82 && cluster.height > sourceCanvas.height * 0.32))
    .filter((cluster) => !(cluster.height > cluster.width * 4.2 && cluster.width < sourceCanvas.width * 0.08))
    .filter((cluster) => !(cluster.width > cluster.height * 7 && cluster.height < sourceCanvas.height * 0.05))
    .map((cluster, index) => {
      const zone = classifyInvitationDecorZone(cluster, sourceCanvas.width, sourceCanvas.height);
      if (zone === "other") return null;
      const cropPadBase = zone === "centerpiece"
        ? Math.max(18, Math.round(Math.min(cluster.width, cluster.height) * 0.08))
        : Math.max(16, Math.round(Math.min(cluster.width, cluster.height) * 0.05));
      const crop = cropCanvasToComponentBounds(isolated, cluster.components, {
        paddingX: cropPadBase,
        paddingY: cropPadBase,
      });
      if (!crop) return null;
      const anchorId = zone === "bottom-left"
        ? "frame-bl"
        : (zone === "bottom-right"
          ? "frame-br"
          : (zone === "left"
            ? "side-left"
            : (zone === "right" ? "side-right" : "centerpiece")));
      const focused = focusDecorCluster(crop, anchorId) || crop;
      const stats = summarizeDecorCanvas(focused);
      const coverage = estimateCanvasCoverage(focused);
      const largestComponentRatio = stats.largestComponentRatio || 0;
      const componentCount = stats.componentCount || 0;
      const minPixelArea = zone === "centerpiece" ? 900 : 1500;
      const minCoverage = zone === "centerpiece" ? 0.018 : 0.03;
      const minLargestRatio = zone === "centerpiece" ? 0.055 : 0.09;
      if ((focused.width * focused.height) < minPixelArea) return null;
      if (coverage < minCoverage) return null;
      if (componentCount > (zone === "centerpiece" ? 20 : 16) && largestComponentRatio < (zone === "centerpiece" ? 0.10 : 0.14)) return null;
      if (componentCount > (zone === "centerpiece" ? 12 : 10) && largestComponentRatio < (zone === "centerpiece" ? 0.14 : 0.19)) return null;
      if (largestComponentRatio < minLargestRatio) return null;
      if (zone === "top" && focused.width > focused.height * 4.5) return null;
      // Apply feathering to all decorative elements — organic shapes benefit from
      // soft edges; sharp geometric ones get a minimal fade to avoid hard cut artifacts
      const minDim = Math.min(focused.width, focused.height);
      const featherRadius = stats.softRatio > 0.25
        ? Math.max(6, Math.round(minDim * 0.09))
        : Math.max(3, Math.round(minDim * 0.045));
      const softened = (largestComponentRatio > 0.10 && componentCount <= 14)
        ? fadeCanvasEdges(focused, featherRadius)
        : fadeCanvasEdges(focused, Math.max(2, Math.round(minDim * 0.02)));
      const finalCanvas = padCanvasTransparent(softened, zone === "centerpiece" ? 8 : 5) || softened;
      const edgeBonus = (cluster.touchesLeft || cluster.touchesRight || cluster.touchesTop || cluster.touchesBottom) ? 1.14 : 1;
      const pageBonus = pageNumber === 1 ? 1.42 : 0.58;
      const zoneBonus = zone.startsWith("bottom") ? 1.32 : (zone === "top" ? 0.72 : (zone === "centerpiece" ? 1.26 : 1.04));
      const wholeBonus = 1 + Math.min(0.52, largestComponentRatio * 0.8);
      const complexityPenalty = 1 / (1 + Math.max(0, componentCount - 4) * 0.08);
      return {
        ...canvasToAsset(finalCanvas, `whole-object-${pageNumber}-${index}`),
        pageNumber,
        zone,
        componentCount,
        largestComponentRatio,
        coverage,
        softRatio: stats.softRatio || 0,
        score: cluster.area * edgeBonus * pageBonus * zoneBonus * wholeBonus * complexityPenalty,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);
}

function regionIdToInvitationZone(regionId) {
  if (!regionId) return "other";
  if (regionId === "centerpiece" || regionId === "centerpiece-lower") return "centerpiece";
  if (regionId === "top-band" || regionId === "bunting-band") return "top";
  if (regionId === "corner-tl" || regionId === "edge-top-left") return "top-left";
  if (regionId === "corner-tr" || regionId === "edge-top-right") return "top-right";
  if (regionId === "frame-left-tall" || regionId === "side-left") return "left";
  if (regionId === "frame-right-tall" || regionId === "side-right") return "right";
  if (regionId === "frame-bl" || regionId === "corner-bl") return "bottom-left";
  if (regionId === "frame-br" || regionId === "corner-br") return "bottom-right";
  return "other";
}

function extractInvitationDecorationAssetsForPage(sourceCanvas, palette, lines, pageNumber = 1) {
  const primaryAssets = extractWholeDecorativeAssetsSimple(sourceCanvas, palette, lines, pageNumber);
  if (primaryAssets.some((asset) => asset.zone === "centerpiece")) {
    return primaryAssets
      .sort((left, right) => (right.score || 0) - (left.score || 0))
      .slice(0, 10);
  }
  const centerpieceFallback = extractDecorativeAssets(sourceCanvas, palette, lines)
    .filter((asset) => ["centerpiece", "centerpiece-lower"].includes(asset.regionId))
    .map((asset) => ({
      ...asset,
      id: `${asset.id}-p${pageNumber}`,
      pageNumber,
      zone: regionIdToInvitationZone(asset.regionId),
      score: (asset.score || (asset.width * asset.height)) * 1.18,
    }))
    .sort((left, right) => (right.score || 0) - (left.score || 0))[0] || null;
  return [...primaryAssets, ...(centerpieceFallback ? [centerpieceFallback] : [])]
    .sort((left, right) => (right.score || 0) - (left.score || 0))
    .slice(0, 10);
}

function detectEventType(lines) {
  const allText = (Array.isArray(lines) ? lines : []).map((line) => line.text).join(" ").toLowerCase();
  if (/בר מצווה|bar[\s-]?mitzvah/.test(allText)) return "bar_mitzvah";
  if (/בת מצווה|bat[\s-]?mitzvah/.test(allText)) return "bat_mitzvah";
  if (/\bברית\b|brit[\s-]?milah/.test(allText)) return "brit";
  if (/יום הולדת|\bbirthday\b/.test(allText)) return "birthday";
  return "wedding";
}

function detectInvitationNameAndDate(lines) {
  const cleaned = dedupeInvitationLines(
    (Array.isArray(lines) ? lines : [])
      .map((line) => ({ ...line, text: stripOuterQuotes(cleanInvitationText(line.text)) }))
      .filter((line) => line.text.length >= 2)
  );
  const eventType = detectEventType(cleaned);
  const dateRegex = /(?:\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,4}|\d{1,2}\s+[א-ת]+(?:\s+\d{2,4})?)/u;
  const invitationWords = /(מזמינים|מזמינות|שמחים|שמחות|להזמינכם|להזמינכן|אותך|אותכם|אותכן|באהבה|החתונה|חתונה|נרגשים|נרגשות|לבוא|לחגוג|בואו|איתנו|בקשת|ביקשתי|חופה|קבלת פנים|נשמח|נשמחים|celebrate|invite|wedding|together|save the date|join us|you are invited)/i;
  const weekdayRegex = /\b(?:יום|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
  const venueWords = /(אירועים|אולם|גן|קבלת פנים|חופה|קידושין|ריקודים|אוכל|reception|ceremony|venue)/i;
  const familyNameRegex = /\b(?:משפחת|משפחות|family of|the family)\b/i;
  const centerX = cleaned.length
    ? cleaned.reduce((sum, line) => sum + (line.left + (line.width / 2)), 0) / cleaned.length
    : 0;
  const preferFirstPage = (candidates, minCount = 1) => {
    const firstPage = candidates.filter((line) => (line.pageNumber || 1) === 1);
    return firstPage.length >= minCount ? firstPage : candidates;
  };
  const dateCandidates = cleaned
    .map((line) => ({
      ...line,
      normalizedDateText: normalizeInvitationDate(line.text),
    }))
    .filter((line) => dateRegex.test(line.normalizedDateText || "") || dateRegex.test(line.text))
    .map((line) => {
      const matchedDate = line.normalizedDateText.match(/\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/)?.[0]
        || line.normalizedDateText.match(dateRegex)?.[0]
        || line.text.match(dateRegex)?.[0]
        || "";
      const extraChars = Math.max(0, cleanInvitationText(line.normalizedDateText || line.text).length - matchedDate.length);
      const centerPenalty = Math.abs((line.left + (line.width / 2)) - centerX) / 18;
      const verticalBonus = line.top > (Math.max(...cleaned.map((item) => item.top), 0) * 0.45) ? 10 : 0;
      const pageBonus = (line.pageNumber || 1) === 1 ? 8 : 0;
      const isolatedBonus = extraChars <= 2 ? 42 : (extraChars <= 6 ? 18 : 0);
      const extraPenalty = extraChars * 3.2;
      return {
        ...line,
        matchedDate,
        score: (line.fontSize * 3) + verticalBonus + pageBonus + isolatedBonus - centerPenalty - extraPenalty - Math.max(0, matchedDate.length - 16),
      };
    })
    .sort((a, b) => b.score - a.score || b.fontSize - a.fontSize);
  const dateLine = dateCandidates[0] || null;
  const isWedding = eventType === "wedding";
  const nameCandidates = preferFirstPage(cleaned
    .filter((line) => !dateRegex.test(line.text))
    .filter((line) => !invitationWords.test(line.text))
    .filter((line) => !weekdayRegex.test(line.text))
    .filter((line) => !venueWords.test(line.text))
    .filter((line) => !familyNameRegex.test(line.text))
    .filter((line) => !/\d/.test(line.text))
    .filter((line) => {
      const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
      if (lineLooksLikeBrokenNameFragment(line.text, words, isWedding)) return false;
      if (isWedding && words.some((word) => word.length <= 1)) return false;
      return isWedding ? (words.length >= 2 && words.length <= 5) : (words.length >= 1 && words.length <= 4);
    })
    .map((line) => {
      const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
      const hasConnector = hasInvitationConnector(line.text);
      const centerPenalty = Math.abs((line.left + (line.width / 2)) - centerX) / 16;
      const punctuationPenalty = /[,;:!?]/.test(line.text) ? 26 : 0;
      const quotePenalty = /["״]/.test(line.text) ? 22 : 0;
      const longPenalty = Math.max(0, line.text.length - 20) * 1.8;
      const connectorBonus = isWedding ? (hasConnector ? 55 : 0) : 0;
      const pageBonus = (line.pageNumber || 1) === 1 ? 26 : 0;
      const singleNamePenalty = isWedding && !hasConnector ? 16 : 0;
      const laterPagePenalty = isWedding && !hasConnector && (line.pageNumber || 1) > 1 ? 140 : 0;
      const fragmentPenalty = words.reduce((sum, word) => sum + (word.length <= 1 ? 120 : 0), 0);
      const balancedWordsBonus = words.length >= 2 && words.every((word) => word.length > 1) ? 18 : 0;
      const score = (line.fontSize * 3.8) + connectorBonus + pageBonus + balancedWordsBonus - (words.length * 3.5) - centerPenalty - punctuationPenalty - quotePenalty - longPenalty - singleNamePenalty - laterPagePenalty - fragmentPenalty;
      return { ...line, score };
    }))
    .sort((a, b) => b.score - a.score || b.fontSize - a.fontSize);
  let rawName = nameCandidates[0]?.text || "";
  const standaloneConnectorLines = preferFirstPage(cleaned
    .filter((line) => !dateRegex.test(line.text))
    .filter((line) => /^[&ו]$/.test(cleanInvitationText(line.text).replace(/\s+/g, "")))
    .sort((a, b) => (b.fontSize + (((b.pageNumber || 1) === 1) ? 8 : 0)) - (a.fontSize + (((a.pageNumber || 1) === 1) ? 8 : 0))));
  if (!rawName && isWedding && standaloneConnectorLines.length) {
    const connectorLine = standaloneConnectorLines[0];
    const nearbyWords = preferFirstPage(cleaned
      .filter((line) => (line.pageNumber || 1) === (connectorLine.pageNumber || 1))
      .filter((line) => !dateRegex.test(line.text))
      .filter((line) => !invitationWords.test(line.text))
      .filter((line) => !weekdayRegex.test(line.text))
      .filter((line) => !venueWords.test(line.text))
      .filter((line) => !familyNameRegex.test(line.text))
      .filter((line) => !/\d/.test(line.text))
      .filter((line) => {
        const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
        if (lineLooksLikeBrokenNameFragment(line.text, words, isWedding)) return false;
        return words.length === 1 && words.every((word) => word.length > 1);
      })
      .map((line) => ({
        ...line,
        centerPenalty: Math.abs((line.left + (line.width / 2)) - (connectorLine.left + (connectorLine.width / 2))),
        verticalDistance: Math.abs(line.top - connectorLine.top),
      })));
    const above = nearbyWords
      .filter((line) => line.top < connectorLine.top && line.verticalDistance < (connectorLine.fontSize * 4.6))
      .sort((a, b) => a.verticalDistance - b.verticalDistance || a.centerPenalty - b.centerPenalty || b.fontSize - a.fontSize)[0];
    const below = nearbyWords
      .filter((line) => line.top > connectorLine.top && line.verticalDistance < (connectorLine.fontSize * 4.6))
      .sort((a, b) => a.verticalDistance - b.verticalDistance || a.centerPenalty - b.centerPenalty || b.fontSize - a.fontSize)[0];
    if (above && below) rawName = `${above.text} & ${below.text}`;
  }
  if (!rawName) {
    const connectorFallback = preferFirstPage(cleaned
      .filter((line) => !dateRegex.test(line.text))
      .filter((line) => !invitationWords.test(line.text))
      .filter((line) => !weekdayRegex.test(line.text))
      .filter((line) => !venueWords.test(line.text))
      .filter((line) => !/\d/.test(line.text))
      .filter((line) => {
        const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
        if (lineLooksLikeBrokenNameFragment(line.text, words, isWedding)) return false;
        return words.every((word) => word.length > 1);
      })
      .filter((line) => hasInvitationConnector(line.text))
      .sort((a, b) => (b.fontSize + (((b.pageNumber || 1) === 1) ? 6 : 0)) - (a.fontSize + (((a.pageNumber || 1) === 1) ? 6 : 0))));
    if (connectorFallback.length) rawName = connectorFallback[0].text;
  }
  if (!rawName) {
    const singleWordCandidates = preferFirstPage(cleaned
      .filter((line) => !dateRegex.test(line.text))
      .filter((line) => !invitationWords.test(line.text))
      .filter((line) => !weekdayRegex.test(line.text))
      .filter((line) => !venueWords.test(line.text))
      .filter((line) => !familyNameRegex.test(line.text))
      .filter((line) => !/\d/.test(line.text))
      .filter((line) => {
        const words = tokenizeInvitationWords(line.text).filter((word) => !isConnectorToken(word));
        if (lineLooksLikeBrokenNameFragment(line.text, words, isWedding)) return false;
        return words.length <= 1 && words.every((word) => word.length > 1);
      })
      .sort((a, b) => {
        const aCenterPenalty = Math.abs((a.left + (a.width / 2)) - centerX) / 18;
        const bCenterPenalty = Math.abs((b.left + (b.width / 2)) - centerX) / 18;
        return (b.fontSize + (((b.pageNumber || 1) === 1) ? 8 : 0) - bCenterPenalty)
          - (a.fontSize + (((a.pageNumber || 1) === 1) ? 8 : 0) - aCenterPenalty)
          || a.top - b.top;
      }), isWedding ? 2 : 1);
    if (isWedding && singleWordCandidates.length >= 2) {
      rawName = `${singleWordCandidates[0].text} & ${singleWordCandidates[1].text}`;
    } else if (singleWordCandidates.length >= 1) {
      rawName = singleWordCandidates[0].text;
    }
  }
  const normalizedName = cleanInvitationText(rawName)
    .replace(/\s{2,}/g, " ")
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+ו\s+/g, " ו")
    .trim();
  const rawDate = normalizeInvitationDate(dateLine?.matchedDate || dateLine?.normalizedDateText || dateLine?.text?.match(dateRegex)?.[0] || "");
  return {
    coupleName: normalizedName,
    eventDate: rawDate,
    eventType,
    dateLine,
  };
}

function removeTextRegionsFromCanvas(sourceCanvas, lines, bgHex) {
  if (!lines?.length) return sourceCanvas;
  const clone = document.createElement("canvas");
  clone.width = sourceCanvas.width;
  clone.height = sourceCanvas.height;
  const ctx = clone.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0);
  ctx.fillStyle = bgHex;
  lines.forEach((line) => {
    const preciseRect = buildChunkCropRect(sourceCanvas, [line], {
      matchText: line.text,
      padXFactor: 0.08,
      padTopFactor: 0.08,
      padBottomFactor: 0.08,
      topFontFactor: 0.62,
      bottomFontFactor: 0.22,
    });
    const fontSize = Math.max(12, line.fontSize || line.height || 24);
    const rect = preciseRect || {
      x: Math.max(0, line.left - Math.max(8, Math.round(fontSize * 0.18))),
      y: Math.max(0, line.top - Math.max(10, Math.round(fontSize * 0.72))),
      width: Math.max(12, line.width + Math.max(14, Math.round(fontSize * 0.36))),
      height: Math.max(12, fontSize * 1.28),
    };
    const padX = Math.max(6, Math.round(fontSize * 0.12));
    const padY = Math.max(6, Math.round(fontSize * 0.12));
    ctx.fillRect(
      Math.max(0, rect.x - padX),
      Math.max(0, rect.y - padY),
      Math.min(clone.width, rect.width + (padX * 2)),
      Math.min(clone.height, rect.height + (padY * 2))
    );
  });
  return clone;
}

function extractDecorativeAssets(sourceCanvas, palette, lines = []) {
  const canvasForDecor = removeTextRegionsFromCanvas(sourceCanvas, lines, palette.backgroundBase);
  const regions = [
    { id: "top-band", x: 0.00, y: 0.00, w: 1.00, h: 0.22, weight: 1.8 },
    { id: "bunting-band", x: 0.00, y: 0.00, w: 1.00, h: 0.26, weight: 2.2 },
    { id: "corner-tl", x: 0.00, y: 0.00, w: 0.36, h: 0.34, weight: 1.08 },
    { id: "corner-tr", x: 0.64, y: 0.00, w: 0.36, h: 0.34, weight: 1.08 },
    { id: "frame-left-tall", x: 0.00, y: 0.00, w: 0.28, h: 0.82, weight: 1.28 },
    { id: "frame-right-tall", x: 0.72, y: 0.00, w: 0.28, h: 0.82, weight: 1.28 },
    { id: "frame-bl", x: 0.00, y: 0.52, w: 0.20, h: 0.40, weight: 1.55 },
    { id: "frame-br", x: 0.80, y: 0.52, w: 0.20, h: 0.40, weight: 1.55 },
    { id: "corner-bl", x: 0.00, y: 0.64, w: 0.18, h: 0.24, weight: 1.25 },
    { id: "corner-br", x: 0.82, y: 0.64, w: 0.18, h: 0.24, weight: 1.25 },
    { id: "edge-top-left", x: 0.00, y: 0.00, w: 0.28, h: 0.18, weight: 0.84 },
    { id: "edge-top-right", x: 0.72, y: 0.00, w: 0.28, h: 0.18, weight: 0.84 },
    { id: "side-left", x: 0.00, y: 0.10, w: 0.18, h: 0.46, weight: 0.96 },
    { id: "side-right", x: 0.82, y: 0.10, w: 0.18, h: 0.46, weight: 0.96 },
    { id: "centerpiece", x: 0.18, y: 0.28, w: 0.64, h: 0.56, weight: 1.7 },
    { id: "centerpiece-lower", x: 0.16, y: 0.40, w: 0.68, h: 0.46, weight: 2.15 },
  ];
  const rawAssets = regions
    .map((region) => {
      const crop = cropCanvasRegion(canvasForDecor, {
        x: canvasForDecor.width * region.x,
        y: canvasForDecor.height * region.y,
        width: canvasForDecor.width * region.w,
        height: canvasForDecor.height * region.h,
      });
      const trimmed = findBestDecorTrim(crop, palette.backgroundBase);
      if (!trimmed) return null;
      const focused = (region.id === "top-band" || region.id === "bunting-band")
        ? trimmed
        : (focusDecorCluster(trimmed, region.id) || trimmed);
      const areaRatio = (focused.width * focused.height) / (canvasForDecor.width * canvasForDecor.height);
      const coverage = estimateCanvasCoverage(focused);
      if (areaRatio < 0.004 || coverage < 0.04) return null;
      const decorStats = summarizeDecorCanvas(focused);
      const anchorRatio = decorAnchorEdgeRatio(region.id, decorStats);
      const looksStriped = isCanvasStripePattern(focused);
      if (looksStriped && (!["top-band", "bunting-band"].includes(region.id) || decorStats.softRatio < 0.18)) return null;
      if (!["top-band", "bunting-band"].includes(region.id) && isCanvasTooGeometric(focused)) return null;
      if (decorLooksFragmented(region.id, decorStats)) return null;
      if (decorStats.darkRatio > 0.72 && decorStats.softRatio < 0.16 && coverage < 0.33) return null;
      if ((region.id.startsWith("corner-") || region.id.startsWith("frame-") || region.id.startsWith("side-"))
        && anchorRatio < 0.12
        && decorStats.componentCount > 4) return null;
      if ((region.id.startsWith("frame-") || region.id.startsWith("side-"))
        && focused.height > focused.width * 2.3
        && decorStats.softRatio < 0.14
        && decorStats.vividRatio < 0.22) return null;
      if ((region.id.startsWith("frame-") || region.id.startsWith("side-"))
        && decorStats.darkRatio > 0.82
        && decorStats.softRatio < 0.12
        && decorStats.vividRatio > 0.72) return null;
      if (["top-band", "bunting-band"].includes(region.id)
        && ((decorStats.leftEdgeRatio || 0) < 0.01 || (decorStats.rightEdgeRatio || 0) < 0.01)
        && decorStats.componentCount > 6) return null;
      if (region.id.startsWith("centerpiece")
        && (focused.width < sourceCanvas.width * 0.18 || focused.height < sourceCanvas.height * 0.14)) return null;
      const softnessBonus = 1 + Math.min(0.22, decorStats.softRatio * 0.24);
      const vividBonus = 1 + Math.min(0.12, decorStats.vividRatio * 0.12);
      const darkPenalty = decorStats.darkRatio > 0.56 ? 0.72 : (decorStats.darkRatio > 0.4 ? 0.88 : 1);
      const anchoredBonus = 1 + Math.min(0.2, anchorRatio * 0.22);
      const wholeObjectBonus = 1 + Math.min(0.16, (decorStats.largestComponentRatio || 0) * 0.18);
      const fragmentationPenalty = decorStats.componentCount > 8
        ? Math.max(0.36, 1 - ((decorStats.componentCount - 8) * 0.08))
        : 1;
      const score = (focused.width * focused.height)
        * coverage
        * region.weight
        * softnessBonus
        * vividBonus
        * darkPenalty
        * anchoredBonus
        * wholeObjectBonus
        * fragmentationPenalty;
      return {
        ...canvasToAsset(focused, region.id),
        score,
        regionId: region.id,
        darkRatio: decorStats.darkRatio,
        softRatio: decorStats.softRatio,
        vividRatio: decorStats.vividRatio,
        componentCount: decorStats.componentCount,
        largestComponentRatio: decorStats.largestComponentRatio,
        leftEdgeRatio: decorStats.leftEdgeRatio,
        rightEdgeRatio: decorStats.rightEdgeRatio,
        topEdgeRatio: decorStats.topEdgeRatio,
        bottomEdgeRatio: decorStats.bottomEdgeRatio,
        anchorRatio,
      };
    })
    .filter(Boolean);
  return rawAssets.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 16);
}

function findNameLineGroups(coupleName, lines) {
  if (!coupleName || !lines?.length) return [];
  const normalized = cleanInvitationText(coupleName)
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
  const normalizedCompact = normalizeInvitationMatchText(coupleName);
  const exact = lines.find((line) => cleanInvitationText(line.text)
    .replace(/\s*&\s*/g, " & ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim() === normalized);
  if (exact) return [exact];
  const compactExact = lines.find((line) => normalizeInvitationMatchText(line.text) === normalizedCompact);
  if (compactExact) return [compactExact];
  const nameWords = extractNameKeywords(coupleName).map((word) => word.toLowerCase());
  if (!nameWords.length) return [];
  const matched = lines.filter((line) => {
    const text = cleanInvitationText(line.text).toLowerCase().trim();
    const compactText = normalizeInvitationMatchText(line.text);
    if (text.length < 2) return false;
    if (compactText && normalizedCompact && compactText.includes(normalizedCompact)) return true;
    return nameWords.some((word) => text.includes(word) || word.includes(text));
  });
  if (!matched.length) return [];
  const maxFont = Math.max(...matched.map((line) => line.fontSize));
  const candidates = matched
    .filter((line) => line.fontSize >= maxFont * 0.55)
    .sort((a, b) => a.top - b.top);
  const groups = [];
  let currentGroup = [candidates[0]];
  for (let index = 1; index < candidates.length; index += 1) {
    const prev = candidates[index - 1];
    const curr = candidates[index];
    if ((curr.top - prev.top) < maxFont * 3.5) currentGroup.push(curr);
    else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);
  return groups.sort((a, b) => {
    const aScore = Math.max(...a.map((line) => line.fontSize));
    const bScore = Math.max(...b.map((line) => line.fontSize));
    return bScore - aScore;
  })[0] || [];
}

function lineHasTightMatch(line, matchText) {
  const lineCompact = normalizeInvitationMatchText(line?.text || "");
  const targetCompact = normalizeInvitationMatchText(matchText || "");
  if (!lineCompact || !targetCompact) return false;
  const startIndex = lineCompact.indexOf(targetCompact);
  if (startIndex < 0) return false;
  const extraChars = Math.max(0, lineCompact.length - targetCompact.length);
  return extraChars <= Math.max(2, Math.floor(targetCompact.length * 0.18));
}

function estimateMatchedTextWidth(line, matchText) {
  const normalized = cleanInvitationText(matchText || "").replace(/\s+/g, "");
  if (!normalized) return line?.width || 0;
  const fontSize = line?.fontSize || 0;
  const isDateLike = /^[0-9./-]+$/.test(normalized);
  const hasLatin = /[A-Za-z]/.test(normalized);
  const separatorCount = (normalized.match(/[./-]/g) || []).length;
  const latinFactor = /&/.test(normalized) ? 0.48 : 0.53;
  const charFactor = isDateLike ? 0.63 : (hasLatin ? latinFactor : 0.7);
  const connectorBoost = /[&ו]/.test(normalized)
    ? fontSize * (hasLatin ? 0.18 : 0.26)
    : 0;
  const separatorBoost = separatorCount * fontSize * (isDateLike ? 0.16 : 0.05);
  return Math.max(fontSize * 2.2, (normalized.length * fontSize * charFactor) + connectorBoost + separatorBoost);
}

function normalizeInvitationMatchText(text) {
  return cleanInvitationText(text || "")
    .replace(/\\/g, "/")
    .replace(/[.\-]/g, "/")
    .replace(/\s+/g, "");
}

function approximateMatchedSegment(line, matchText) {
  const lineText = normalizeInvitationMatchText(line?.text || "");
  const targetText = normalizeInvitationMatchText(matchText || "");
  if (!lineText || !targetText) return null;
  const startIndex = lineText.indexOf(targetText);
  if (startIndex < 0) return null;
  const isDateLike = /^[0-9./-]+$/.test(targetText);
  const hasLatin = /[A-Za-z]/.test(targetText);
  const startRatio = startIndex / Math.max(1, lineText.length);
  const widthRatio = targetText.length / Math.max(1, lineText.length);
  const estimatedWidth = estimateMatchedTextWidth(line, matchText);
  const proportionalWidth = Math.max((line.fontSize || 0) * 2.4, (line.width || 0) * widthRatio);
  const widthCapMultiplier = isDateLike ? 1.08 : (hasLatin ? 1.1 : 1.14);
  const cappedWidth = Math.min(
    line.width || 0,
    (estimatedWidth * widthCapMultiplier) + ((line.fontSize || 0) * 0.18)
  );
  const computedWidth = Math.max((line.fontSize || 0) * 2.4, Math.min(proportionalWidth, cappedWidth));
  return {
    left: (line.left || 0) + ((line.width || 0) * startRatio),
    width: computedWidth,
  };
}

function maskCanvasToChunkBounds(sourceCanvas, rect, chunks, options = {}) {
  if (!sourceCanvas || !rect || !Array.isArray(chunks) || !chunks.length) return null;
  const cropped = cropCanvasRegion(sourceCanvas, rect);
  const ctx = cropped.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, cropped.width, cropped.height);
  const mask = new Uint8ClampedArray(cropped.width * cropped.height);
  const fontSize = rect.fontSize || Math.max(...chunks.map((chunk) => chunk.fontSize || 0), 12);
  const padX = options.chunkPaddingX ?? Math.max(4, Math.round(fontSize * 0.16));
  const padY = options.chunkPaddingY ?? Math.max(5, Math.round(fontSize * 0.34));
  const bridgeGapFactor = options.bridgeGapFactor ?? 0.72;
  const guidePadX = options.guidePadX ?? Math.max(2, Math.round(padX * 0.55));
  const guidePadY = options.guidePadY ?? Math.max(2, Math.round(padY * 0.45));
  const guides = [];
  const fillMaskRect = (minX, minY, maxX, maxY) => {
    const left = clampNum(Math.floor(minX), 0, Math.max(0, cropped.width - 1));
    const top = clampNum(Math.floor(minY), 0, Math.max(0, cropped.height - 1));
    const right = clampNum(Math.ceil(maxX), left + 1, cropped.width);
    const bottom = clampNum(Math.ceil(maxY), top + 1, cropped.height);
    for (let y = top; y < bottom; y += 1) {
      const rowOffset = y * cropped.width;
      for (let x = left; x < right; x += 1) mask[rowOffset + x] = 255;
    }
  };

  chunks.forEach((chunk, index) => {
    const localTop = (chunk.y - rect.y - ((chunk.fontSize || fontSize) * 0.84)) - padY;
    const localBottom = (chunk.y - rect.y + ((chunk.fontSize || fontSize) * 0.26)) + padY;
    const localLeft = (chunk.x - rect.x) - padX;
    const localRight = (chunk.x - rect.x + chunk.width) + padX;
    guides.push({
      left: (chunk.x - rect.x) - guidePadX,
      right: (chunk.x - rect.x + chunk.width) + guidePadX,
      top: (chunk.y - rect.y - ((chunk.fontSize || fontSize) * 0.82)) - guidePadY,
      bottom: (chunk.y - rect.y + ((chunk.fontSize || fontSize) * 0.24)) + guidePadY,
    });
    fillMaskRect(localLeft, localTop, localRight, localBottom);

    const next = chunks[index + 1];
    if (!next) return;
    const sameRow = Math.abs((next.y || 0) - (chunk.y || 0)) <= Math.max(chunk.fontSize || 0, next.fontSize || 0) * 0.4;
    const gap = next.x - (chunk.x + chunk.width);
    if (sameRow && gap > 0 && gap <= Math.max(chunk.fontSize || 0, next.fontSize || 0) * bridgeGapFactor) {
      fillMaskRect(
        (chunk.x - rect.x + chunk.width) - Math.max(2, padX * 0.45),
        Math.min(localTop, (next.y - rect.y - ((next.fontSize || fontSize) * 0.84)) - padY),
        (next.x - rect.x) + Math.max(2, padX * 0.45),
        Math.max(localBottom, (next.y - rect.y + ((next.fontSize || fontSize) * 0.26)) + padY)
      );
    }
  });

  softenAlpha(mask, cropped.width, cropped.height, options.edgeSoftness ?? 1);
  for (let index = 0; index < mask.length; index += 1) {
    imageData.data[(index * 4) + 3] = Math.round(imageData.data[(index * 4) + 3] * (mask[index] / 255));
  }
  ctx.putImageData(imageData, 0, 0);
  const components = collectCanvasComponents(cropped, {
    alphaThreshold: options.alphaThreshold ?? 10,
    minAreaRatio: options.minAreaRatio ?? 0.00002,
  });
  const minGuideIntersectionRatio = options.guideIntersectionRatio ?? 0.16;
  const filteredComponents = components.filter((component) => guides.some((guide) => {
    const overlapLeft = Math.max(component.minX, guide.left);
    const overlapRight = Math.min(component.maxX, guide.right);
    const overlapTop = Math.max(component.minY, guide.top);
    const overlapBottom = Math.min(component.maxY, guide.bottom);
    if (overlapRight < overlapLeft || overlapBottom < overlapTop) return false;
    const overlapArea = (overlapRight - overlapLeft + 1) * (overlapBottom - overlapTop + 1);
    const componentArea = Math.max(1, component.area || ((component.width || 1) * (component.height || 1)));
    const centerX = (component.minX + component.maxX) / 2;
    const centerY = (component.minY + component.maxY) / 2;
    const centerInside = centerX >= (guide.left - 1)
      && centerX <= (guide.right + 1)
      && centerY >= (guide.top - 1)
      && centerY <= (guide.bottom + 1);
    return centerInside || ((overlapArea / componentArea) >= minGuideIntersectionRatio);
  }));
  if (filteredComponents.length) {
    return cropCanvasToComponentBounds(cropped, filteredComponents, {
      paddingX: options.tightPaddingX ?? 2,
      paddingY: options.tightPaddingY ?? 2,
    }) || cropped;
  }
  return trimCanvasToAllContent(cropped, {
    alphaThreshold: options.alphaThreshold ?? 10,
    minAreaRatio: options.minAreaRatio ?? 0.00002,
    paddingX: options.tightPaddingX ?? 2,
    paddingY: options.tightPaddingY ?? 2,
  }) || cropped;
}

function buildCropRect(sourceCanvas, lines, options = {}) {
  if (!lines?.length || !sourceCanvas) return null;
  if (options.preferChunkBounds !== false) {
    const chunkRect = buildChunkCropRect(sourceCanvas, lines, options);
    if (chunkRect) return chunkRect;
  }
  const fontSize = Math.max(...lines.map((line) => line.fontSize));
  const padX = Math.round(fontSize * (options.padXFactor ?? 0.35));
  const padTop = Math.round(fontSize * (options.padTopFactor ?? 0.18));
  const padBottom = Math.round(fontSize * (options.padBottomFactor ?? 0.2));
  const lineBounds = lines.map((line) => {
    const segment = lines.length === 1 && options.matchText
      ? approximateMatchedSegment(line, options.matchText)
      : null;
    const left = segment?.left ?? line.left;
    const right = left + (segment?.width ?? line.width);
    return { left, right };
  });
  const cropX = Math.max(0, Math.min(...lineBounds.map((line) => line.left)) - padX);
  const cropY = Math.max(0, Math.min(...lines.map((line) => line.top - (line.fontSize * (options.topFontFactor ?? 0.82)))) - padTop);
  const cropRight = Math.min(sourceCanvas.width, Math.max(...lineBounds.map((line) => line.right)) + padX);
  const cropBottom = Math.min(sourceCanvas.height, Math.max(...lines.map((line) => line.top + (line.fontSize * (options.bottomFontFactor ?? 0.22)))) + padBottom);
  const cropW = cropRight - cropX;
  const cropH = cropBottom - cropY;
  if (cropW < 24 || cropH < 12) return null;
  return { x: cropX, y: cropY, width: cropW, height: cropH, fontSize };
}

function cropRawLineCanvas(sourceCanvas, lines, options = {}) {
  const rect = buildCropRect(sourceCanvas, lines, options);
  if (!rect) return null;
  const maxHeightRatio = options.maxHeightRatio ?? 0.3;
  if (rect.height > sourceCanvas.height * maxHeightRatio) return null;
  if (rect.selectedChunks?.length) {
    return maskCanvasToChunkBounds(sourceCanvas, rect, rect.selectedChunks, {
      chunkPaddingX: options.chunkPaddingX,
      chunkPaddingY: options.chunkPaddingY,
      guidePadX: options.guidePadX,
      guidePadY: options.guidePadY,
      bridgeGapFactor: options.bridgeGapFactor,
      edgeSoftness: options.chunkEdgeSoftness ?? 1,
      alphaThreshold: options.alphaThreshold ?? 12,
      minAreaRatio: options.componentMinAreaRatio ?? 0.00004,
      tightPaddingX: options.tightPaddingX ?? 2,
      tightPaddingY: options.tightPaddingY ?? 2,
    }) || cropCanvasRegion(sourceCanvas, rect);
  }
  return cropCanvasRegion(sourceCanvas, rect);
}

function cropRawLineAsset(sourceCanvas, lines, options = {}) {
  const crop = cropRawLineCanvas(sourceCanvas, lines, options);
  if (!crop) return null;
  return canvasToAsset(crop, options.id || "cropped-line-raw");
}

function cropLineAsset(sourceCanvas, lines, bgHex, options = {}) {
  const rect = buildCropRect(sourceCanvas, lines, options);
  if (!rect) return null;
  const maxHeightRatio = options.maxHeightRatio ?? 0.25;
  if (rect.height > sourceCanvas.height * maxHeightRatio) return null;
  const crop = rect.selectedChunks?.length
    ? (maskCanvasToChunkBounds(sourceCanvas, rect, rect.selectedChunks, {
      chunkPaddingX: options.chunkPaddingX,
      chunkPaddingY: options.chunkPaddingY,
      guidePadX: options.guidePadX,
      guidePadY: options.guidePadY,
      bridgeGapFactor: options.bridgeGapFactor,
      edgeSoftness: options.chunkEdgeSoftness ?? 1,
      alphaThreshold: options.alphaThreshold ?? 12,
      minAreaRatio: options.componentMinAreaRatio ?? 0.00004,
      tightPaddingX: options.tightPaddingX ?? 2,
      tightPaddingY: options.tightPaddingY ?? 2,
    }) || cropCanvasRegion(sourceCanvas, rect))
    : cropCanvasRegion(sourceCanvas, rect);
  const cropBg = options.useLocalBackground === false ? bgHex : estimateCanvasBorderHex(crop);
  const isolated = isolateCanvasBackground(crop, cropBg, {
    lowTolerance: options.lowTolerance ?? 22,
    highTolerance: options.highTolerance ?? 62,
    padding: options.padding ?? 6,
    edgeSoftness: options.edgeSoftness ?? 1,
  });
  if (!isolated) return null;
  const tightened = options.preserveSeparatedContent
    ? (trimCanvasToAllContent(isolated, {
      alphaThreshold: options.alphaThreshold ?? 18,
      minAreaRatio: options.componentMinAreaRatio ?? 0.00008,
      paddingX: options.tightPaddingX ?? 2,
      paddingY: options.tightPaddingY ?? 2,
    }) || isolated)
    : (trimCanvasToDominantContent(isolated, {
      alphaThreshold: options.alphaThreshold ?? 18,
      columnThresholdRatio: options.columnThresholdRatio ?? 0.06,
      rowThresholdRatio: options.rowThresholdRatio ?? 0.08,
      columnGapTolerance: options.columnGapTolerance,
      rowGapTolerance: options.rowGapTolerance,
      paddingX: options.tightPaddingX ?? 3,
      paddingY: options.tightPaddingY ?? 3,
      preferCenterX: options.preferCenterX !== false,
      preferCenterY: options.preferCenterY !== false,
    }) || isolated);
  const focused = options.focusTextComponents
    ? (trimCanvasToFocusedTextContent(tightened, {
      preferSingleRow: options.preferSingleRow,
      preferSingleColumnGroup: options.preferSingleColumnGroup,
      alphaThreshold: options.alphaThreshold ?? 18,
      minAreaRatio: options.componentMinAreaRatio,
      rowGapTolerance: options.componentRowGapTolerance,
      columnGapTolerance: options.componentColumnGapTolerance,
      paddingX: options.componentPaddingX ?? (options.tightPaddingX ?? 3),
      paddingY: options.componentPaddingY ?? (options.tightPaddingY ?? 3),
    }) || tightened)
    : tightened;
  const ctx = focused.getContext("2d", { willReadFrequently: true });
  const data = ctx.getImageData(0, 0, focused.width, focused.height).data;
  const rowMinActive = Math.max(1, Math.floor(focused.width * (options.rowMinActiveRatio ?? 0.04)));
  let firstActive = -1;
  let lastActive = -1;
  for (let y = 0; y < focused.height; y += 1) {
    let activeInRow = 0;
    for (let x = 0; x < focused.width; x += 1) {
      if (data[(y * focused.width + x) * 4 + 3] > 30) activeInRow += 1;
    }
    if (activeInRow >= rowMinActive) {
      if (firstActive < 0) firstActive = y;
      lastActive = y;
    }
  }
  const activeSpan = firstActive < 0 ? 0 : (lastActive - firstActive + 1);
  if (activeSpan > focused.height * (options.maxActiveSpanRatio ?? 0.7)) return null;
  const fadeRadius = options.fadeRadius ?? 0;
  if (fadeRadius > 0) fadeCanvasEdges(focused, fadeRadius);
  const coverage = estimateCanvasCoverage(focused);
  if (coverage < (options.minCoverage ?? 0.05)) return null;
  const asset = canvasToAsset(focused, options.id || "cropped-line");
  return options.includeCanvas ? { ...asset, canvas: focused } : asset;
}

function cropNameAsset(sourceCanvas, coupleName, lines, bgHex) {
  if (!coupleName || !lines?.length || !sourceCanvas) return null;
  const nameLines = findNameLineGroups(coupleName, lines);
  if (!nameLines.length) return null;
  const matchText = nameLines.length === 1 ? coupleName : undefined;
  const tightLineMatch = nameLines.length === 1 && lineHasTightMatch(nameLines[0], coupleName);
  if (tightLineMatch) {
    const directAsset = attemptDirectTextAsset(sourceCanvas, nameLines, coupleName, "name", {
      id: "couple-name-img",
      padXFactor: 0.08,
      padTopFactor: 0.12,
      padBottomFactor: 0.1,
      topFontFactor: 0.72,
      bottomFontFactor: 0.18,
      maxHeightRatio: 0.24,
      chunkPaddingX: 8,
      chunkPaddingY: 10,
      columnGapTolerance: 6,
      rowGapTolerance: 6,
      minCoverage: 0.0012,
      maxCoverage: 0.82,
      minSpanRatio: 0.58,
      minAspectRatio: 1.8,
    });
    if (directAsset) return directAsset;
    const framedAsset = attemptFramedTextAsset(sourceCanvas, nameLines, coupleName, "name", {
      id: "couple-name-img",
      padXFactor: 0.08,
      padTopFactor: 0.1,
      padBottomFactor: 0.08,
      topFontFactor: 0.7,
      bottomFontFactor: 0.16,
      maxHeightRatio: 0.24,
      chunkPaddingX: 8,
      chunkPaddingY: 10,
      columnGapTolerance: 6,
      rowGapTolerance: 6,
      minCoverage: 0.0012,
      maxCoverage: 0.82,
      minSpanRatio: 0.58,
      minAspectRatio: 1.8,
    });
    if (framedAsset) return framedAsset;
  }
  const isolated = cropLineAsset(sourceCanvas, nameLines, bgHex, {
    id: "couple-name-img",
    matchText,
    useLocalBackground: false,
    padXFactor: 0.08,
    padTopFactor: 0.12,
    padBottomFactor: 0.12,
    topFontFactor: 0.74,
    bottomFontFactor: 0.17,
    maxHeightRatio: 0.24,
    maxActiveSpanRatio: 0.94,
    minCoverage: 0.01,
    fadeRadius: 0,
    edgeSoftness: 1,
    columnThresholdRatio: 0.08,
    columnGapTolerance: 2,
    tightPaddingX: 1,
    tightPaddingY: 2,
    focusTextComponents: true,
    preserveSeparatedContent: true,
    preferSingleRow: nameLines.length === 1,
    preferSingleColumnGroup: false,
    componentMinAreaRatio: 0.00012,
    componentColumnGapTolerance: 6,
    componentPaddingX: 2,
    componentPaddingY: 2,
    chunkPaddingX: 8,
    chunkPaddingY: 10,
    includeCanvas: true,
  });
  if (isolated?.canvas) {
    const sanitizedBase = sanitizeTextAssetCanvas(isolated.canvas, "name", {
      minAreaRatio: 0.00008,
      columnGapTolerance: 6,
      rowGapTolerance: Math.max(3, Math.round(isolated.canvas.height * 0.08)),
      paddingX: 2,
      paddingY: 2,
    }) || isolated.canvas;
    const sanitized = refineTextAssetCanvas(sanitizedBase, "name", {
      alphaThreshold: 12,
      minAreaRatio: 0.00006,
      paddingX: 1,
      paddingY: 1,
    }) || sanitizedBase;
    const spanLooksRight = assetHasExpectedTextSpan(
      sanitized,
      nameLines,
      matchText,
      {
        minRatio: tightLineMatch ? 0.58 : (nameLines.length === 1 ? 0.72 : 0.56),
        minAspectRatio: nameLines.length === 1 ? 1.8 : 0.85,
      }
    );
    if (spanLooksRight
      && textAssetHasCleanMargins(sanitized, "name")
      && (validateIsolatedTextCanvas(sanitized, "name", {
      minCoverage: tightLineMatch ? 0.0012 : 0.003,
      maxCoverage: 0.82,
    }) || rawTextCropLooksIntentional(sanitized))) {
      return canvasToAsset(sanitized, "couple-name-img");
    }
  }
  const rawCrop = cropRawLineCanvas(sourceCanvas, nameLines, {
    id: "couple-name-img",
    matchText,
    padXFactor: 0.1,
    padTopFactor: 0.14,
    padBottomFactor: 0.1,
    topFontFactor: 0.76,
    bottomFontFactor: 0.16,
    maxHeightRatio: 0.24,
    chunkPaddingX: 8,
    chunkPaddingY: 10,
  });
  if (!rawCrop) return null;
  const tightenedRaw = trimCanvasToAllContent(rawCrop, {
    alphaThreshold: 18,
    minAreaRatio: 0.00008,
    paddingX: 2,
    paddingY: 2,
  }) || rawCrop;
  const textOnly = isolateLightBackgroundText(tightenedRaw, {
    padding: 3,
    minCoverage: tightLineMatch ? 0.0012 : 0.003,
    maxCoverage: 0.78,
    strongDiff: 24,
    softDiff: 6,
    darkDelta: 14,
    satDelta: 0.035,
    edgeSoftness: 1,
  });
  if (textOnly) {
    const focusedText = trimCanvasToFocusedTextContent(textOnly, {
      preferSingleRow: nameLines.length === 1,
      preferSingleColumnGroup: false,
      componentMinAreaRatio: 0.00012,
      columnGapTolerance: 6,
      paddingX: 2,
      paddingY: 2,
    }) || textOnly;
    const sanitizedTextBase = sanitizeTextAssetCanvas(focusedText, "name", {
      minAreaRatio: 0.00008,
      columnGapTolerance: 6,
      rowGapTolerance: Math.max(3, Math.round(focusedText.height * 0.08)),
      paddingX: 2,
      paddingY: 2,
    }) || focusedText;
    const sanitizedText = refineTextAssetCanvas(sanitizedTextBase, "name", {
      alphaThreshold: 12,
      minAreaRatio: 0.00006,
      paddingX: 1,
      paddingY: 1,
    }) || sanitizedTextBase;
    const spanLooksRight = assetHasExpectedTextSpan(
      sanitizedText,
      nameLines,
      matchText,
      {
        minRatio: tightLineMatch ? 0.58 : (nameLines.length === 1 ? 0.72 : 0.56),
        minAspectRatio: nameLines.length === 1 ? 1.8 : 0.85,
      }
    );
    if (spanLooksRight
      && textAssetHasCleanMargins(sanitizedText, "name")
      && (validateIsolatedTextCanvas(sanitizedText, "name", {
      minCoverage: tightLineMatch ? 0.0012 : 0.003,
      maxCoverage: 0.82,
    }) || rawTextCropLooksIntentional(sanitizedText))) {
      return canvasToAsset(sanitizedText, "couple-name-img");
    }
  }
  if (!tightLineMatch && !rawTextCropLooksIntentional(tightenedRaw)) return null;
  const sanitizedRawBase = sanitizeTextAssetCanvas(tightenedRaw, "name", {
    alphaThreshold: 14,
    minAreaRatio: 0.00008,
    columnGapTolerance: 6,
    rowGapTolerance: Math.max(3, Math.round(tightenedRaw.height * 0.08)),
    paddingX: 2,
    paddingY: 2,
  }) || tightenedRaw;
  const sanitizedRaw = refineTextAssetCanvas(sanitizedRawBase, "name", {
    alphaThreshold: 12,
    minAreaRatio: 0.00006,
    paddingX: 1,
    paddingY: 1,
  }) || sanitizedRawBase;
  if (!assetHasExpectedTextSpan(
    sanitizedRaw,
    nameLines,
    matchText,
    {
      minRatio: tightLineMatch ? 0.58 : (nameLines.length === 1 ? 0.72 : 0.56),
      minAspectRatio: nameLines.length === 1 ? 1.8 : 0.85,
    }
  )) return null;
  if (!validateIsolatedTextCanvas(sanitizedRaw, "name", {
    alphaThreshold: 12,
    minCoverage: tightLineMatch ? 0.0018 : 0.01,
    maxCoverage: 0.8,
  })) return null;
  if (!textAssetHasCleanMargins(sanitizedRaw, "name")) return null;
  return canvasToAsset(sanitizedRaw, "couple-name-img");
}

function cropDateAsset(sourceCanvas, dateLine, bgHex) {
  if (!dateLine || !sourceCanvas) return null;
  const matchText = dateLine.matchedDate || dateLine.normalizedDateText || dateLine.text;
  const tightLineMatch = lineHasTightMatch(dateLine, matchText);
  if (tightLineMatch) {
    const directAsset = attemptDirectTextAsset(sourceCanvas, [dateLine], matchText, "date", {
      id: "event-date-img",
      padXFactor: 0.05,
      padTopFactor: 0.08,
      padBottomFactor: 0.14,
      topFontFactor: 0.52,
      bottomFontFactor: 0.28,
      maxHeightRatio: 0.16,
      chunkPaddingX: 6,
      chunkPaddingY: 9,
      columnGapTolerance: 8,
      rowGapTolerance: 6,
      minCoverage: 0.0008,
      maxCoverage: 0.76,
      minSpanRatio: 0.56,
      minAspectRatio: 2.2,
    });
    if (directAsset) return directAsset;
    const framedAsset = attemptFramedTextAsset(sourceCanvas, [dateLine], matchText, "date", {
      id: "event-date-img",
      padXFactor: 0.05,
      padTopFactor: 0.08,
      padBottomFactor: 0.12,
      topFontFactor: 0.5,
      bottomFontFactor: 0.24,
      maxHeightRatio: 0.18,
      chunkPaddingX: 6,
      chunkPaddingY: 9,
      columnGapTolerance: 8,
      rowGapTolerance: 6,
      minCoverage: 0.0008,
      maxCoverage: 0.76,
      minSpanRatio: 0.56,
      minAspectRatio: 2.2,
    });
    if (framedAsset) return framedAsset;
  }
  const isolated = cropLineAsset(sourceCanvas, [dateLine], bgHex, {
    id: "event-date-img",
    matchText,
    useLocalBackground: false,
    padXFactor: 0.06,
    padTopFactor: 0.1,
    padBottomFactor: 0.16,
    topFontFactor: 0.56,
    bottomFontFactor: 0.32,
    maxHeightRatio: 0.14,
    maxActiveSpanRatio: 0.94,
    minCoverage: 0.01,
    fadeRadius: 0,
    edgeSoftness: 1,
    tightPaddingX: 1,
    tightPaddingY: 2,
    columnThresholdRatio: 0.04,
    rowThresholdRatio: 0.1,
    focusTextComponents: true,
    preserveSeparatedContent: true,
    preferSingleRow: true,
    preferSingleColumnGroup: false,
    componentMinAreaRatio: 0.00008,
    componentColumnGapTolerance: 8,
    componentRowGapTolerance: 6,
    componentPaddingX: 2,
    componentPaddingY: 2,
    chunkPaddingX: 6,
    chunkPaddingY: 9,
    includeCanvas: true,
  });
  if (isolated?.canvas) {
    const sanitizedBase = sanitizeTextAssetCanvas(isolated.canvas, "date", {
      minAreaRatio: 0.00006,
      columnGapTolerance: 8,
      rowGapTolerance: 6,
      paddingX: 2,
      paddingY: 2,
    }) || isolated.canvas;
    const sanitized = refineTextAssetCanvas(sanitizedBase, "date", {
      alphaThreshold: 12,
      minAreaRatio: 0.00005,
      paddingX: 1,
      paddingY: 1,
    }) || sanitizedBase;
    const spanLooksRight = assetHasExpectedTextSpan(sanitized, [dateLine], matchText, {
      minRatio: tightLineMatch ? 0.56 : 0.68,
      minAspectRatio: 2.2,
    });
    if (spanLooksRight
      && textAssetHasCleanMargins(sanitized, "date")
      && (validateIsolatedTextCanvas(sanitized, "date", {
      minCoverage: tightLineMatch ? 0.0008 : 0.002,
      maxCoverage: 0.72,
    }) || rawTextCropLooksIntentional(sanitized))) {
      return canvasToAsset(sanitized, "event-date-img");
    }
  }
  const rawCrop = cropRawLineCanvas(sourceCanvas, [dateLine], {
    id: "event-date-img",
    matchText,
    padXFactor: 0.05,
    padTopFactor: 0.1,
    padBottomFactor: 0.16,
    topFontFactor: 0.56,
    bottomFontFactor: 0.32,
    maxHeightRatio: 0.16,
    chunkPaddingX: 6,
    chunkPaddingY: 9,
  });
  if (!rawCrop) return null;
  const tightenedRaw = trimCanvasToAllContent(rawCrop, {
    alphaThreshold: 14,
    minAreaRatio: 0.00006,
    paddingX: 1,
    paddingY: 2,
  }) || rawCrop;
  const textOnly = isolateLightBackgroundText(tightenedRaw, {
    padding: 2,
    minCoverage: tightLineMatch ? 0.0008 : 0.002,
    maxCoverage: 0.74,
    strongDiff: 20,
    softDiff: 5,
    darkDelta: 12,
    satDelta: 0.03,
    edgeSoftness: 1,
  });
  if (textOnly) {
    const focusedText = trimCanvasToFocusedTextContent(textOnly, {
      preferSingleRow: true,
      preferSingleColumnGroup: false,
      componentMinAreaRatio: 0.00008,
      rowGapTolerance: 6,
      columnGapTolerance: 8,
      paddingX: 2,
      paddingY: 2,
    }) || textOnly;
    const sanitizedTextBase = sanitizeTextAssetCanvas(focusedText, "date", {
      minAreaRatio: 0.00006,
      columnGapTolerance: 8,
      rowGapTolerance: 6,
      paddingX: 2,
      paddingY: 2,
    }) || focusedText;
    const sanitizedText = refineTextAssetCanvas(sanitizedTextBase, "date", {
      alphaThreshold: 12,
      minAreaRatio: 0.00005,
      paddingX: 1,
      paddingY: 1,
    }) || sanitizedTextBase;
    const spanLooksRight = assetHasExpectedTextSpan(sanitizedText, [dateLine], matchText, {
      minRatio: tightLineMatch ? 0.56 : 0.68,
      minAspectRatio: 2.2,
    });
    if (spanLooksRight
      && textAssetHasCleanMargins(sanitizedText, "date")
      && (validateIsolatedTextCanvas(sanitizedText, "date", {
      minCoverage: tightLineMatch ? 0.0008 : 0.002,
      maxCoverage: 0.72,
    }) || rawTextCropLooksIntentional(sanitizedText))) {
      return canvasToAsset(sanitizedText, "event-date-img");
    }
  }
  if (!tightLineMatch && !rawTextCropLooksIntentional(tightenedRaw)) return null;
  const sanitizedRawBase = sanitizeTextAssetCanvas(tightenedRaw, "date", {
    alphaThreshold: 14,
    minAreaRatio: 0.00006,
    columnGapTolerance: 8,
    rowGapTolerance: 6,
    paddingX: 2,
    paddingY: 2,
  }) || tightenedRaw;
  const sanitizedRaw = refineTextAssetCanvas(sanitizedRawBase, "date", {
    alphaThreshold: 12,
    minAreaRatio: 0.00005,
    paddingX: 1,
    paddingY: 1,
  }) || sanitizedRawBase;
  if (!assetHasExpectedTextSpan(sanitizedRaw, [dateLine], matchText, {
    minRatio: tightLineMatch ? 0.56 : 0.68,
    minAspectRatio: 2.2,
  })) return null;
  if (!validateIsolatedTextCanvas(sanitizedRaw, "date", {
    alphaThreshold: 12,
    minCoverage: tightLineMatch ? 0.0012 : 0.006,
    maxCoverage: 0.72,
  })) return null;
  if (!textAssetHasCleanMargins(sanitizedRaw, "date")) return null;
  return canvasToAsset(sanitizedRaw, "event-date-img");
}

function detectInvitationNameAndDateSimple(lines) {
  const cleaned = dedupeInvitationLines(
    (Array.isArray(lines) ? lines : [])
      .map((line) => ({ ...line, text: stripOuterQuotes(cleanInvitationText(line.text)) }))
      .filter((line) => line.text.length >= 1)
  );
  const eventType = detectEventType(cleaned);
  const dateRegex = /(?:\d{1,4}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{1,4}|\d{1,2}\s+[×-×ª]+(?:\s+\d{2,4})?)/u;
  const centerX = cleaned.length
    ? cleaned.reduce((sum, line) => sum + lineMidX(line), 0) / cleaned.length
    : 0;
  const maxTop = Math.max(...cleaned.map((line) => line.top), 0);
  const dateLine = cleaned
    .filter((line) => dateRegex.test(line.text) || dateRegex.test(normalizeInvitationDate(line.text)))
    .map((line) => scoreInvitationDateCandidate(line, centerX, maxTop))
    .sort((left, right) => right.score - left.score || right.fontSize - left.fontSize)[0] || null;
  const nameLines = selectInvitationNameLines(cleaned, dateLine, eventType);
  return {
    coupleName: joinInvitationNameLines(nameLines),
    eventDate: normalizeInvitationDate(dateLine?.matchedDate || extractInvitationDateMatch(dateLine) || ""),
    eventType,
    dateLine,
    nameLines,
  };
}

function pickFallbackDateLineForPage(lines) {
  const source = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!source.length) return null;
  const centerX = source.reduce((sum, line) => sum + lineMidX(line), 0) / Math.max(1, source.length);
  const maxTop = Math.max(...source.map((line) => line.top || 0), 0);
  const scored = source
    .filter((line) => /\d/.test(line.text) || /\d{1,2}\s*[./-]\s*\d{1,2}/.test(normalizeInvitationDate(line.text)))
    .map((line) => scoreInvitationDateCandidate(line, centerX, maxTop))
    .sort((left, right) => right.score - left.score || right.fontSize - left.fontSize);
  return scored[0] || null;
}

function pickFallbackNameLinesForPage(lines, dateLine, eventType) {
  const source = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!source.length) return [];
  const selected = refineInvitationNameLinesSimple(
    selectInvitationNameLines(source, dateLine, eventType),
    dateLine,
    eventType
  );
  if (selected.length) return selected;
  const centerX = source.reduce((sum, line) => sum + lineMidX(line), 0) / Math.max(1, source.length);
  const fallbackCandidates = source
    .filter((line) => !/\d/.test(line.text))
    .filter((line) => cleanInvitationText(line.text).length >= 2)
    .filter((line) => !/(מזמינים|מזמינות|באהבה|you are invited|save the date|join us|נשמח|לחגוג)/i.test(line.text))
    .filter((line) => !/(יום|ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(line.text))
    .map((line) => {
      const connectorBonus = hasInvitationConnector(line.text) ? 42 : 0;
      const aboveDateBonus = dateLine && (line.top + line.height) < dateLine.top ? 24 : 0;
      const centerPenalty = Math.abs(lineMidX(line) - centerX) / 10;
      return {
        ...line,
        score: (line.fontSize * 6.8) + connectorBonus + aboveDateBonus - centerPenalty - Math.max(0, cleanInvitationText(line.text).length - 24),
      };
    })
    .sort((left, right) => right.score - left.score || right.fontSize - left.fontSize);
  return fallbackCandidates.slice(0, 2);
}

function expandInvitationNameLinesWithCompanions(lines, nameLines, dateLine, eventType) {
  const source = Array.isArray(lines) ? lines.filter(Boolean) : [];
  const seed = Array.isArray(nameLines) ? nameLines.filter(Boolean) : [];
  if (!source.length || !seed.length) return seed;
  const avgMidY = seed.reduce((sum, line) => sum + (line.top + (line.height / 2)), 0) / seed.length;
  const maxFont = Math.max(...seed.map((line) => line.fontSize || line.height || 24), 24);
  const seedKeys = new Set(seed.map((line) => `${line.left}|${line.top}|${line.text}`));
  const companions = source
    .filter((line) => !seedKeys.has(`${line.left}|${line.top}|${line.text}`))
    .filter((line) => !/\d/.test(line.text))
    .filter((line) => cleanInvitationText(line.text).length >= 1)
    .filter((line) => Math.abs((line.top + (line.height / 2)) - avgMidY) <= Math.max(18, maxFont * 0.8))
    .filter((line) => (line.fontSize || line.height || 0) >= (maxFont * 0.45))
    .filter((line) => !/(מזמינים|מזמינות|באהבה|you are invited|save the date|join us|נשמח|לחגוג)/i.test(line.text))
    .filter((line) => !dateLine || (line.top + line.height) < (dateLine.top + Math.max(0, dateLine.height * 0.25)))
    .sort((left, right) => Math.abs(lineMidX(left) - lineMidX(seed[0])) - Math.abs(lineMidX(right) - lineMidX(seed[0])));
  const merged = [...seed, ...companions.slice(0, 3)];
  return refineInvitationNameLinesSimple(merged, dateLine, eventType);
}

function detectInvitationNameAndDateSimpleV2(lines) {
  const cleaned = dedupeInvitationLines(
    (Array.isArray(lines) ? lines : [])
      .map((line) => ({ ...line, text: stripOuterQuotes(cleanInvitationText(line.text)) }))
      .filter((line) => line.text.length >= 1)
  );
  const eventType = detectEventType(cleaned);
  const bestPage = pickBestInvitationPage(cleaned, eventType);
  const globalFallback = detectInvitationNameAndDateSimple(cleaned);
  let dateLine = bestPage.dateLine || globalFallback.dateLine || null;
  let nameLines = Array.isArray(bestPage.nameLines) && bestPage.nameLines.length
    ? bestPage.nameLines
    : (globalFallback.nameLines || []);
  let pageNumber = bestPage.pageNumber || nameLines[0]?.pageNumber || dateLine?.pageNumber || 1;
  let pageLines = cleaned.filter((line) => (line.pageNumber || 1) === pageNumber);
  if (!pageLines.length) pageLines = bestPage.pageLines || cleaned;
  if (!dateLine || (dateLine.pageNumber || pageNumber) !== pageNumber) {
    const localDate = pickFallbackDateLineForPage(pageLines);
    if (localDate) dateLine = localDate;
  }
  if (!nameLines.length || nameLines.some((line) => (line.pageNumber || pageNumber) !== pageNumber)) {
    const localNameLines = pickFallbackNameLinesForPage(pageLines, dateLine, eventType);
    if (localNameLines.length) nameLines = localNameLines;
  }
  if (nameLines.length) {
    nameLines = expandInvitationNameLinesWithCompanions(pageLines, nameLines, dateLine, eventType);
  }
  if ((!nameLines.length || !dateLine) && globalFallback.pageNumber && globalFallback.pageNumber !== pageNumber) {
    pageNumber = globalFallback.pageNumber;
    pageLines = cleaned.filter((line) => (line.pageNumber || 1) === pageNumber);
    if (!dateLine) dateLine = pickFallbackDateLineForPage(pageLines) || globalFallback.dateLine || null;
    if (!nameLines.length) nameLines = pickFallbackNameLinesForPage(pageLines, dateLine, eventType) || globalFallback.nameLines || [];
  }
  return {
    coupleName: joinInvitationNameLines(nameLines),
    eventDate: normalizeInvitationDate(dateLine?.matchedDate || extractInvitationDateMatch(dateLine) || ""),
    eventType,
    dateLine,
    nameLines,
    pageNumber,
    pageLines,
  };
}

function cropNameAssetSimple(sourceCanvas, nameLines) {
  if (!sourceCanvas || !Array.isArray(nameLines) || !nameLines.length) return null;
  const matchText = nameLines.length === 1 ? joinInvitationNameLines(nameLines) : undefined;
  return cropInvitationTextAssetSimple(
    sourceCanvas,
    nameLines,
    matchText,
    "couple-name-img",
    "name"
  ) || forceCropInvitationTextAssetSimple(
    sourceCanvas,
    nameLines,
    "couple-name-img",
    "name"
  );
}

function cropDateAssetSimple(sourceCanvas, dateLine) {
  if (!sourceCanvas || !dateLine) return null;
  const matchText = dateLine.matchedDate || extractInvitationDateMatch(dateLine);
  return cropInvitationTextAssetSimple(
    sourceCanvas,
    [dateLine],
    matchText,
    "event-date-img",
    "date"
  ) || forceCropInvitationTextAssetSimple(
    sourceCanvas,
    [dateLine],
    "event-date-img",
    "date"
  );
}

function loadImageFileToCanvas(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("לא הצלחתי לקרוא את קובץ ההזמנה."));
    };
    image.src = url;
  });
}

export async function analyzeInvitationAsset(file) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    const sourceCanvas = await loadImageFileToCanvas(file);
    const palette = extractPaletteFromCanvas(sourceCanvas);
    const sourcePages = [{ pageNumber: 1, canvas: sourceCanvas }];
    return {
      fileName: file.name,
      palette,
      lines: [],
      headlineLines: [],
      coupleName: "",
      eventDate: "",
      eventType: "wedding",
      font: "Heebo",
      decorationAssets: extractInvitationDecorationAssetsForPage(sourceCanvas, palette, [], 1),
      nameImageAsset: null,
      dateImageAsset: null,
      additionalTextAssets: [],
      nameLines: [],
      dateLine: null,
      pageNumber: 1,
      _sourcePages: sourcePages,
      _sourceCanvas: sourceCanvas,
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const allPageCanvases = [];
  const pageLineGroups = [];
  const pagePalettes = [];
  let lines = [];

  const processedPageCount = Math.min(pdf.numPages, 2);
  for (let pageNumber = 1; pageNumber <= processedPageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: INVITATION_PDF_RENDER_SCALE });
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const renderCtx = pageCanvas.getContext("2d", { willReadFrequently: true });
    renderCtx.fillStyle = "#ffffff";
    renderCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    await page.render({ canvasContext: renderCtx, viewport }).promise;
    const textContent = await page.getTextContent();
    const pageLines = extractInvitationTextLines(textContent.items || [], viewport).map((line) => ({
      ...line,
      pageNumber,
    }));
    lines.push(...pageLines);
    pageLineGroups.push(pageLines);
    allPageCanvases.push(pageCanvas);
    pagePalettes.push(extractPaletteFromCanvas(pageCanvas));
  }

  lines = dedupeInvitationLines(lines);
  const palette = pagePalettes[0] || extractPaletteFromCanvas(allPageCanvases[0]);
  const sourcePages = allPageCanvases.map((canvas, index) => ({
    pageNumber: index + 1,
    canvas,
  }));
  const headlineLines = [...lines]
    .sort((a, b) => (b.fontSize * cleanInvitationText(b.text).length) - (a.fontSize * cleanInvitationText(a.text).length))
    .filter((line) => line.text.length >= 2)
    .slice(0, 12);
  const coreText = detectInvitationNameAndDateSimpleV2(lines);
  const selectedPage = coreText.pageNumber || coreText.nameLines?.[0]?.pageNumber || coreText.dateLine?.pageNumber || 1;
  const selectedCanvas = allPageCanvases[selectedPage - 1] || allPageCanvases[0];
  const selectedPalette = pagePalettes[selectedPage - 1] || palette;
  const selectedPageLines = pageLineGroups[selectedPage - 1] || [];
  const decorationAssets = sourcePages
    .flatMap(({ canvas, pageNumber }) => {
      const pagePalette = pagePalettes[pageNumber - 1] || selectedPalette || palette;
      const pageLines = pageLineGroups[pageNumber - 1] || [];
      return extractInvitationDecorationAssetsForPage(canvas, pagePalette, pageLines, pageNumber)
        .map((asset) => ({
          ...asset,
          id: `${asset.id}-p${pageNumber}`,
          pageNumber,
          score: (asset.score || (asset.width * asset.height)) * (pageNumber === selectedPage ? 1.18 : 1.06),
        }));
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 14);

  let nameImageAsset = null;
  if (coreText.nameLines?.length) {
    const namePage = coreText.pageNumber || coreText.nameLines[0]?.pageNumber || 1;
    const nameCanvas = allPageCanvases[namePage - 1] || allPageCanvases[0];
    nameImageAsset = cropNameAssetSimple(
      nameCanvas,
      coreText.nameLines.filter((line) => (line.pageNumber || 1) === namePage)
    );
  }

  let dateImageAsset = null;
  if (coreText.dateLine) {
    const datePage = coreText.pageNumber || coreText.dateLine.pageNumber || 1;
    const dateCanvas = allPageCanvases[datePage - 1] || allPageCanvases[0];
    dateImageAsset = cropDateAssetSimple(dateCanvas, coreText.dateLine);
  }

  return {
    fileName: file.name,
    palette,
    lines,
    headlineLines,
    coupleName: coreText.coupleName,
    eventDate: coreText.eventDate,
    eventType: coreText.eventType,
    font: pickInvitationFont(headlineLines),
    decorationAssets,
    nameImageAsset,
    dateImageAsset,
    additionalTextAssets: [],
    nameLines: coreText.nameLines || [],
    dateLine: coreText.dateLine || null,
    pageNumber: coreText.pageNumber || selectedPage,
    _sourcePages: sourcePages,
    _sourceCanvas: selectedCanvas,
  };
}

function rectIntersectionArea(left, right) {
  if (!left || !right) return 0;
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.w, right.x + right.w);
  const y2 = Math.min(left.y + left.h, right.y + right.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

function buildInvitationLineSelectionRect(line) {
  const fontSize = Math.max(12, line?.fontSize || line?.height || 24);
  return {
    x: Math.max(0, (line?.left || 0) - Math.max(6, Math.round(fontSize * 0.14))),
    y: Math.max(0, (line?.top || 0) - Math.max(8, Math.round(fontSize * 0.78))),
    w: Math.max(12, (line?.width || 0) + Math.max(12, Math.round(fontSize * 0.28))),
    h: Math.max(12, fontSize * 1.32),
  };
}

function keyInvitationLine(line) {
  if (!line) return "";
  return `${Math.round(line.left || 0)}|${Math.round(line.top || 0)}|${cleanInvitationText(line.text || "")}`;
}

function canvasLooksLikeManualText(canvas) {
  if (!canvas) return { isText: false, score: 0 };
  const components = collectCanvasComponents(canvas, {
    alphaThreshold: 10,
    minAreaRatio: 0.00003,
  });
  if (!components.length) return { isText: false, score: 0 };
  const coverage = estimateCanvasCoverage(canvas);
  const aspectRatio = canvas.width / Math.max(1, canvas.height);
  const rowClusters = clusterComponentsByAxis(
    components,
    "y",
    Math.max(3, Math.round(canvas.height * 0.12))
  );
  const columnClusters = clusterComponentsByAxis(
    components,
    "x",
    Math.max(3, Math.round(canvas.width * 0.07))
  );
  const totalArea = components.reduce((sum, component) => sum + component.area, 0);
  const dominantRowArea = rowClusters.length
    ? Math.max(...rowClusters.map((cluster) => cluster.area))
    : totalArea;
  const occupiedHeightRatio = (
    Math.max(...components.map((component) => component.maxY))
    - Math.min(...components.map((component) => component.minY))
    + 1
  ) / Math.max(1, canvas.height);
  const occupiedWidthRatio = (
    Math.max(...components.map((component) => component.maxX))
    - Math.min(...components.map((component) => component.minX))
    + 1
  ) / Math.max(1, canvas.width);
  const summary = summarizeDecorCanvas(canvas);
  const validated = (
    validateIsolatedTextCanvas(canvas, aspectRatio > 2.4 ? "date" : "name", {
      alphaThreshold: 10,
      minCoverage: 0.0004,
      maxCoverage: 0.82,
      minAreaRatio: 0.00003,
    })
    && textAssetHasCleanMargins(canvas, aspectRatio > 2.4 ? "date" : "name", {
      alphaThreshold: 10,
      minAreaRatio: 0.00003,
    })
  );
  // Component count is a strong discriminator: Hebrew text has many small letter-components,
  // decorations (leaf, heart, graphic) typically have only 1-3 large connected blobs.
  const componentCountScore = (
    components.length >= 10 ? 1.2
    : components.length >= 8 ? 1.0
    : components.length >= 5 ? 0.5
    : components.length <= 2 ? -1.8
    : components.length <= 3 ? -0.9
    : 0
  );

  // Decoration-specific penalty: if aspect ratio is close to 1:1 (square-ish) and
  // the content has high coverage, it's more likely a graphic/decoration than text.
  const squareishPenalty = (aspectRatio >= 0.6 && aspectRatio <= 1.6) ? -0.8 : 0;
  // High coverage penalty: decorations (leaves, hearts) tend to fill more of their bounding box
  const highCoveragePenalty = coverage > 0.45 ? -1.0 : (coverage > 0.30 ? -0.4 : 0);
  // Tall aspect (portrait) strongly suggests decoration (e.g. vertical leaf, branch)
  const tallPenalty = aspectRatio < 0.7 ? -1.2 : 0;

  const heuristicScore = (
    (aspectRatio >= 1.2 ? 1.2 : 0)
    + (coverage >= 0.001 && coverage <= 0.76 ? 1 : -0.6)
    + (rowClusters.length <= 4 ? 0.9 : -0.5)
    + ((dominantRowArea / Math.max(1, totalArea)) >= 0.44 ? 0.9 : -0.4)
    + (occupiedHeightRatio <= 0.86 ? 0.6 : -0.7)
    + (occupiedWidthRatio >= 0.22 ? 0.4 : -0.3)
    + ((columnClusters.length >= 2 || components.length >= 3 || aspectRatio > 2.2) ? 0.5 : -0.2)
    + (summary.maxRowCoverageRatio < 0.93 ? 0.35 : -0.55)
    + componentCountScore
    + squareishPenalty
    + highCoveragePenalty
    + tallPenalty
  );
  return {
    isText: validated || heuristicScore >= 3.0,
    score: validated ? 3.2 : heuristicScore,
  };
}

export function classifyInvitationManualSelection(payload = {}) {
  const canvas = payload?.canvas || null;
  const selection = payload?.selection || null;
  const analysis = payload?.analysis || {};
  const visualText = canvasLooksLikeManualText(canvas);
  if (!selection || !(selection.w > 0 && selection.h > 0)) {
    return visualText.isText
      ? { kind: "text", label: "טקסט מההזמנה" }
      : { kind: "decoration", label: "עיטור מההזמנה" };
  }
  // If visual analysis clearly shows this is NOT text, don't let positional overlap override it.
  // A leaf, heart, or graphic decoration positioned near names should stay a decoration.
  // Raised threshold: visual appearance is the primary signal. Position alone cannot override.
  if (!visualText.isText && visualText.score < 2.5) {
    return { kind: "decoration", label: "עיטור מההזמנה" };
  }
  const pageNumber = analysis.pageNumber || 1;
  const selectionRect = selection
    ? { x: selection.x || 0, y: selection.y || 0, w: selection.w || 0, h: selection.h || 0 }
    : null;
  const lines = (Array.isArray(analysis.lines) ? analysis.lines : [])
    .filter((line) => (line.pageNumber || 1) === pageNumber);
  const selectionArea = selectionRect
    ? Math.max(1, selectionRect.w * selectionRect.h)
    : 1;
  const overlaps = selectionRect
    ? lines
      .map((line) => {
        const lineRect = buildInvitationLineSelectionRect(line);
        const overlapArea = rectIntersectionArea(selectionRect, lineRect);
        if (!overlapArea) return null;
        const lineArea = Math.max(1, lineRect.w * lineRect.h);
        return {
          line,
          overlapArea,
          selectionCoverage: overlapArea / selectionArea,
          lineCoverage: overlapArea / lineArea,
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.overlapArea - left.overlapArea)
    : [];
  const nameKeys = new Set((Array.isArray(analysis.nameLines) ? analysis.nameLines : []).map(keyInvitationLine));
  const dateKey = keyInvitationLine(analysis.dateLine);
  const nameOverlap = overlaps.filter((entry) => nameKeys.has(keyInvitationLine(entry.line)));
  const dateOverlap = overlaps.filter((entry) => keyInvitationLine(entry.line) === dateKey);
  const strongestNameOverlap = nameOverlap[0] || null;
  const strongestDateOverlap = dateOverlap[0] || null;
  const joinedText = overlaps
    .slice(0, 3)
    .map((entry) => cleanInvitationText(entry.line.text || ""))
    .filter(Boolean)
    .join(" ")
    .trim();
  // Require meaningful positional overlap (not just proximity) — prevents decorations near text from being misclassified
  const overlapLooksText = overlaps.some((entry) => entry.selectionCoverage >= 0.25 || entry.lineCoverage >= 0.48);
  // Position-based name/date classification requires BOTH positional overlap AND visual evidence.
  // High-confidence visual non-text: skip name/date checks entirely.
  // Raised threshold so decorations near text areas don't get misclassified.
  const visualClearlyNotText = !visualText.isText && visualText.score < 2.8;
  if (!visualClearlyNotText && strongestDateOverlap && (strongestDateOverlap.selectionCoverage >= 0.22 || strongestDateOverlap.lineCoverage >= 0.42)) {
    return {
      kind: "date",
      label: cleanInvitationText(joinedText || analysis.eventDate || "תאריך מההזמנה"),
    };
  }
  if (!visualClearlyNotText && strongestNameOverlap && (strongestNameOverlap.selectionCoverage >= 0.16 || strongestNameOverlap.lineCoverage >= 0.3)) {
    return {
      kind: "name",
      label: cleanInvitationText(joinedText || analysis.coupleName || "שם מההזמנה"),
    };
  }
  const totalTextSelectionCoverage = overlaps.reduce((sum, entry) => sum + entry.selectionCoverage, 0);
  // Visual analysis is primary: the canvas preview itself must look like text.
  // Position-based checks (overlapLooksText) only serve as supporting evidence.
  if (
    visualText.isText
    && (overlapLooksText || totalTextSelectionCoverage >= 0.15 || visualText.score >= 2.95)
  ) {
    return {
      kind: "text",
      label: cleanInvitationText(joinedText || "טקסט מההזמנה").slice(0, 36),
    };
  }
  // High-confidence visual text with any position support
  if (visualText.score >= 3.2 && totalTextSelectionCoverage >= 0.08) {
    return {
      kind: "text",
      label: cleanInvitationText(joinedText || "טקסט מההזמנה").slice(0, 36),
    };
  }
  return {
    kind: "decoration",
    label: "עיטור מההזמנה",
  };
}

function estimateInvitationTextLayout(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const barCenterY = dims.h - (pad.b * 0.52);
  const titleFromLines = cleanInvitationText(analysis.headlineLines?.[0]?.text || "");
  const secondaryFromLines = cleanInvitationText(analysis.headlineLines?.[1]?.text || "");
  const coupleName = cleanInvitationText(analysis.coupleName || titleFromLines || "שם הזוג");
  const eventDate = normalizeInvitationDate(analysis.eventDate || secondaryFromLines || "");
  const dateImageLooksUsable = analysis.dateImageAsset
    && (analysis.dateImageAsset.width || 0) > 40
    && (analysis.dateImageAsset.height || 0) > 12
    && (analysis.dateImageAsset.coverage || 0) > 0.008
    && (analysis.dateImageAsset.coverage || 0) < 0.72
    && (((analysis.dateImageAsset.leftEdgeRatio || 0) + (analysis.dateImageAsset.rightEdgeRatio || 0)) < 1.35);
  const nameGap = mode === "portrait" ? 26 : 24;
  const dateGap = mode === "portrait" ? 30 : 28;
  let currentY = barCenterY - (eventDate ? 20 : 0);
  const layout = {
    coupleName,
    eventDate,
    dateImageLooksUsable,
    currentY,
    nameRect: null,
    dateRect: null,
    textBand: null,
  };

  if (analysis.nameImageAsset) {
    const asset = analysis.nameImageAsset;
    const maxW = dims.w * 0.62;
    const maxH = pad.b * 0.48;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    const renderedW = asset.width * scale;
    const renderedH = asset.height * scale;
    layout.nameRect = {
      left: (dims.w / 2) - (renderedW / 2),
      right: (dims.w / 2) + (renderedW / 2),
      top: currentY - (renderedH / 2),
      bottom: currentY + (renderedH / 2),
      width: renderedW,
      height: renderedH,
    };
    currentY += Math.max(renderedH * 0.68, nameGap);
  } else {
    const titleSize = mode === "portrait" ? 82 : 64;
    const estimatedWidth = Math.min(dims.w * 0.72, estimateMatchedTextWidth({ fontSize: titleSize, width: dims.w * 0.7 }, coupleName));
    layout.nameRect = {
      left: (dims.w / 2) - (estimatedWidth / 2),
      right: (dims.w / 2) + (estimatedWidth / 2),
      top: currentY - (titleSize * 0.44),
      bottom: currentY + (titleSize * 0.44),
      width: estimatedWidth,
      height: titleSize * 0.88,
    };
    currentY += titleSize * 0.92;
  }

  if (dateImageLooksUsable) {
    const asset = analysis.dateImageAsset;
    const maxW = dims.w * 0.54;
    const maxH = pad.b * 0.26;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    const renderedW = asset.width * scale;
    const renderedH = asset.height * scale;
    const top = currentY + dateGap;
    layout.dateRect = {
      left: (dims.w / 2) - (renderedW / 2),
      right: (dims.w / 2) + (renderedW / 2),
      top: top - (renderedH / 2),
      bottom: top + (renderedH / 2),
      width: renderedW,
      height: renderedH,
    };
  } else if (eventDate) {
    const fontSize = mode === "portrait" ? 36 : 30;
    const estimatedWidth = Math.min(dims.w * 0.56, estimateMatchedTextWidth({ fontSize, width: dims.w * 0.54 }, eventDate));
    const top = currentY + dateGap;
    layout.dateRect = {
      left: (dims.w / 2) - (estimatedWidth / 2),
      right: (dims.w / 2) + (estimatedWidth / 2),
      top: top - (fontSize * 0.42),
      bottom: top + (fontSize * 0.42),
      width: estimatedWidth,
      height: fontSize * 0.84,
    };
  }

  const occupied = [layout.nameRect, layout.dateRect].filter(Boolean);
  if (occupied.length) {
    layout.textBand = {
      left: Math.max(0, Math.min(...occupied.map((rect) => rect.left)) - (mode === "portrait" ? 46 : 64)),
      right: Math.min(dims.w, Math.max(...occupied.map((rect) => rect.right)) + (mode === "portrait" ? 46 : 64)),
      top: Math.max(0, Math.min(...occupied.map((rect) => rect.top)) - 18),
      bottom: Math.min(dims.h, Math.max(...occupied.map((rect) => rect.bottom)) + 18),
    };
  }

  layout.currentY = currentY;
  return layout;
}

function createInvitationTextObjectsRefined(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const barCenterY = dims.h - (pad.b * 0.52);
  const titleFromLines = cleanInvitationText(analysis.headlineLines?.[0]?.text || "");
  const secondaryFromLines = cleanInvitationText(analysis.headlineLines?.[1]?.text || "");
  const coupleName = cleanInvitationText(analysis.coupleName || titleFromLines || "שם הזוג");
  const eventDate = normalizeInvitationDate(analysis.eventDate || secondaryFromLines || "");
  const textColor = analysis.palette.textColor;
  const objects = [];
  let currentY = barCenterY - (eventDate ? 20 : 0);
  const dateImageLooksUsable = analysis.dateImageAsset
    && (analysis.dateImageAsset.width || 0) > 40
    && (analysis.dateImageAsset.height || 0) > 12
    && (analysis.dateImageAsset.coverage || 0) > 0.008
    && (analysis.dateImageAsset.coverage || 0) < 0.72
    && (((analysis.dateImageAsset.leftEdgeRatio || 0) + (analysis.dateImageAsset.rightEdgeRatio || 0)) < 1.35);

  if (analysis.nameImageAsset) {
    const asset = analysis.nameImageAsset;
    const maxW = dims.w * 0.62;
    const maxH = pad.b * 0.48;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    const renderedH = asset.height * scale;
    objects.push({
      type: "image",
      src: asset.src,
      left: dims.w / 2,
      top: currentY,
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      id: `invite-name-img-${mode}`,
      selectable: true,
      evented: true,
    });
    currentY += renderedH * 0.74 + 14;
  } else {
    const titleSize = mode === "portrait" ? 82 : 64;
    objects.push({
      type: "i-text",
      text: coupleName,
      fontSize: titleSize,
      fill: textColor,
      fontFamily: analysis.font,
      fontWeight: "bold",
      left: dims.w / 2,
      top: currentY,
      originX: "center",
      originY: "center",
      direction: inferTextDirection(coupleName, "rtl"),
      textAlign: "center",
      shadow: { color: rgbaFromHex("#000000", 0.18), blur: 10, offsetX: 0, offsetY: 4 },
      id: `invite-title-${mode}`,
      selectable: true,
      evented: true,
    });
    currentY += titleSize * 0.92;
  }

  if (dateImageLooksUsable) {
    const asset = analysis.dateImageAsset;
    const maxW = dims.w * 0.54;
    const maxH = pad.b * 0.26;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    objects.push({
      type: "image",
      src: asset.src,
      left: dims.w / 2,
      top: currentY + 24,
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      id: `invite-date-img-${mode}`,
      selectable: true,
      evented: true,
    });
  } else if (eventDate) {
    objects.push({
      type: "i-text",
      text: eventDate,
      fontSize: mode === "portrait" ? 36 : 30,
      fill: mixHexColors(textColor, analysis.palette.secondary, 0.42),
      fontFamily: analysis.font,
      left: dims.w / 2,
      top: currentY + 24,
      originX: "center",
      originY: "center",
      direction: "ltr",
      textAlign: "center",
      shadow: { color: rgbaFromHex("#000000", 0.14), blur: 6, offsetX: 0, offsetY: 2 },
      id: `invite-date-${mode}`,
      selectable: true,
      evented: true,
    });
  }

  return objects;
}

function createInvitationDecorations(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const holeTop = pad.t;
  const holeBottom = dims.h - pad.b;
  const textLayout = estimateInvitationTextLayout(mode, analysis, DIMS, PAD);
  const textBand = textLayout.textBand;
  const assets = Array.isArray(analysis.decorationAssets) ? analysis.decorationAssets : [];
  if (!assets.length) return [];

  const isAvoidableSideDecor = (asset) =>
    (asset?.regionId?.startsWith("frame-") || asset?.regionId?.startsWith("side-"))
    && (asset.height || 0) > ((asset.width || 0) * 2.1)
    && (asset.softRatio || 0) < 0.28;
  const isGraphicBarAsset = (asset) => !!asset
    && (asset.height || 0) > ((asset.width || 0) * 2.3)
    && (asset.softRatio || 0) < 0.12
    && (asset.vividRatio || 0) > 0.75
    && (asset.darkRatio || 0) > 0.75;
  const isThinStripeAsset = (asset) => !!asset
    && (asset.width || 0) < 90
    && (asset.height || 0) > ((asset.width || 0) * 4.2)
    && (asset.coverage || 0) > 0.55;
  const assetPlacementZone = (asset) => {
    const regionId = asset?.regionId || "";
    if (regionId.includes("centerpiece")) return "centerpiece";
    if (regionId === "top-band" || regionId === "bunting-band") return "top";
    if (regionId === "corner-tl" || regionId === "corner-tr" || regionId.includes("edge-top")) return "top";
    if (regionId === "frame-left-tall" || regionId === "frame-right-tall" || regionId.startsWith("side-")) return "sideframe";
    if (regionId === "corner-bl" || regionId === "corner-br" || regionId.startsWith("frame-")) return "bottom";
    return "bottom";
  };
  const effectivePlacementZone = (asset) => {
    const regionId = asset?.regionId || "";
    const placementZone = assetPlacementZone(asset);
    if ((regionId === "top-band" || regionId === "bunting-band") || placementZone !== "top") return placementZone;
    if ((asset.height || 0) > ((asset.width || 0) * 1.75)) return "bottom";
    return placementZone;
  };
  const decorSelectionScore = (asset, preferredZone = "any") => {
    if (!asset) return 0;
    const placementZone = effectivePlacementZone(asset);
    const isPageOne = (asset.pageNumber || 1) === 1;
    const zoneWeight = preferredZone === "any"
      ? 1
      : (placementZone === preferredZone ? 1.45 : 0.52);
    const pageWeight = placementZone === "centerpiece"
      ? (isPageOne ? 0.92 : 1.12)
      : (isPageOne ? 1.42 : 0.24);
    const softnessWeight = (
      (preferredZone === "top" && placementZone === "top")
      || (preferredZone === "sideframe" && placementZone === "sideframe")
    )
      ? 1 + Math.min(0.14, (asset.softRatio || 0) * 0.22)
      : 1;
    const graphicBarPenalty = isGraphicBarAsset(asset)
      ? 0.02
      : 1;
    const topEdgeBarPenalty = placementZone === "top"
      && (asset.height || 0) > ((asset.width || 0) * 2.1)
      && (asset.softRatio || 0) < 0.22
      && (asset.vividRatio || 0) > 0.24
      ? 0.06
      : 1;
    const stripPenalty = (placementZone === "bottom" || placementZone === "sideframe")
      && (asset.width || 0) > ((asset.height || 0) * 2.15)
      ? 0.12
      : 1;
    const wideBottomPenalty = placementZone === "bottom"
      && (asset.width || 0) > ((asset.height || 0) * 1.55)
      ? 0.62
      : 1;
    const hardGraphicPenalty = (placementZone === "sideframe" || placementZone === "bottom")
      && (asset.darkRatio || 0) > 0.84
      && (asset.softRatio || 0) < 0.12
      && (asset.vividRatio || 0) > 0.8
      ? 0.18
      : 1;
    const anchorPenalty = (placementZone !== "centerpiece" && (asset.anchorRatio || 0) < 0.12)
      ? 0.22
      : 1;
    const fragmentedPenalty = (asset.componentCount || 0) > 8
      && (asset.largestComponentRatio || 0) < 0.26
      ? 0.18
      : 1;
    const cornerLikeBonus = placementZone === "bottom"
      && (asset.height || 0) >= ((asset.width || 0) * 0.8)
      && (asset.height || 0) <= ((asset.width || 0) * 3.4)
      ? 1.12
      : 1;
    const anchoredBonus = placementZone !== "centerpiece"
      ? 1 + Math.min(0.12, (asset.anchorRatio || 0) * 0.16)
      : 1;
    const illustrationBonus = placementZone === "centerpiece"
      && (asset.width || 0) > ((asset.height || 0) * 0.85)
      && (asset.width || 0) < ((asset.height || 0) * 2.95)
      ? 1.18
      : 1;
    return (asset.score || 0)
      * zoneWeight
      * pageWeight
      * softnessWeight
      * graphicBarPenalty
      * topEdgeBarPenalty
      * stripPenalty
      * wideBottomPenalty
      * hardGraphicPenalty
      * anchorPenalty
      * fragmentedPenalty
      * cornerLikeBonus
      * anchoredBonus
      * illustrationBonus;
  };
  const pickDecorAsset = (regionIds, preferredZone = "any", options = {}) => {
    let pool = [...assets].filter((asset) =>
      regionIds.includes(asset.regionId)
      && !isAvoidableSideDecor(asset)
      && !isThinStripeAsset(asset)
    );
    if (options.preferPageOne) {
      const pageOnePool = pool.filter((asset) => (asset.pageNumber || 1) === 1);
      if (pageOnePool.length) pool = pageOnePool;
    }
    if (options.pageNumber) {
      const pagePool = pool.filter((asset) => (asset.pageNumber || 1) === options.pageNumber);
      if (pagePool.length) pool = pagePool;
    }
    return pool
      .sort((left, right) =>
        decorSelectionScore(right, preferredZone) - decorSelectionScore(left, preferredZone)
      )[0] || null;
  };
  const sizeForAsset = (asset) => {
    const placementZone = effectivePlacementZone(asset);
    const regionId = asset?.regionId || "";
    if (regionId === "top-band" || regionId === "bunting-band") {
      return { maxW: dims.w * 0.94, maxH: dims.h * 0.115 };
    }
    if (regionId.includes("centerpiece")) {
      return { maxW: dims.w * 0.28, maxH: pad.b * 0.74 };
    }
    if (placementZone === "sideframe") {
      return { maxW: dims.w * 0.18, maxH: pad.b * 0.9 };
    }
    if (placementZone === "top") {
      return { maxW: dims.w * 0.3, maxH: dims.h * 0.13 };
    }
    return { maxW: dims.w * 0.19, maxH: pad.b * 0.9 };
  };
  const baseScaleForAsset = (asset) => {
    const { maxW, maxH } = sizeForAsset(asset);
    return Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
  };
  const balancedPairScales = (leftAsset, rightAsset) => {
    if (!leftAsset || !rightAsset) return null;
    let leftScale = baseScaleForAsset(leftAsset);
    let rightScale = baseScaleForAsset(rightAsset);
    if (assetPlacementZone(leftAsset) !== assetPlacementZone(rightAsset)) {
      return { leftScale, rightScale };
    }
    const leftHeight = leftAsset.height * leftScale;
    const rightHeight = rightAsset.height * rightScale;
    const heightRatio = Math.max(leftHeight, rightHeight) / Math.max(1, Math.min(leftHeight, rightHeight));
    if (heightRatio > 1.28) {
      if (leftHeight > rightHeight) leftScale *= ((rightHeight * 1.08) / Math.max(1, leftHeight));
      else rightScale *= ((leftHeight * 1.08) / Math.max(1, rightHeight));
    }
    return { leftScale, rightScale };
  };
  const makeDecor = (asset, side, id, scaleOverride = null) => {
    if (!asset) return null;
    const regionId = asset?.regionId || "";
    const placementZone = effectivePlacementZone(asset);
    let scale = scaleOverride || baseScaleForAsset(asset);
    if (!Number.isFinite(scale) || scale <= 0) return null;
    let renderedW = asset.width * scale;
    let renderedH = asset.height * scale;
    if (placementZone === "bottom" && (renderedH < 44 || (renderedW * renderedH) < 3600)) return null;
    if (placementZone === "sideframe" && (renderedH < 72 || (renderedW * renderedH) < 4200)) return null;
    let left = dims.w / 2;
    let top = dims.h;
    let originX = "center";
    let originY = "bottom";
    if (regionId === "top-band" || regionId === "bunting-band") {
      const allowedInside = renderedH * 0.16;
      top = Math.max(
        -Math.min(holeTop * 0.32, renderedH * 0.12),
        holeTop - renderedH + allowedInside
      );
      originX = "center";
      originY = "top";
    } else if (placementZone === "centerpiece") {
      const allowedInside = renderedH * 0.18;
      top = Math.max(
        dims.h + Math.min(pad.b * 0.1, renderedH * 0.08),
        holeBottom + renderedH - allowedInside
      );
      originX = "center";
      originY = "bottom";
    } else if (placementZone === "top") {
      const allowedInside = renderedH * 0.14;
      const spillX = Math.min(renderedW * 0.06, mode === "portrait" ? 18 : 14);
      left = side === "left" ? -spillX : dims.w + spillX;
      top = Math.max(
        -Math.min(holeTop * 0.24, renderedH * 0.1),
        holeTop - renderedH + allowedInside
      );
      originX = side === "left" ? "left" : "right";
      originY = "top";
    } else {
      const allowedInside = renderedH * (placementZone === "sideframe" ? 0.07 : 0.1);
      const spillX = Math.min(renderedW * 0.06, mode === "portrait" ? 16 : 12);
      const textSafeHalfWidth = textBand
        ? Math.max(58, Math.abs((dims.w / 2) - textBand.left) + 18)
        : 0;
      const safeHalfWidth = Math.max(dims.w * (mode === "portrait" ? 0.21 : 0.2), textSafeHalfWidth);
      const maxAllowedWidth = Math.max(48, (dims.w / 2) - safeHalfWidth + spillX);
      if (renderedW > maxAllowedWidth) {
        scale *= maxAllowedWidth / Math.max(1, renderedW);
        renderedW = asset.width * scale;
        renderedH = asset.height * scale;
      }
      left = side === "left" ? 0 - spillX : dims.w + spillX;
      const baseTop = Math.max(
        dims.h + Math.min(pad.b * 0.14, renderedH * 0.1),
        holeBottom + renderedH - allowedInside
      );
      const textClearanceTop = textBand
        ? (textBand.bottom + renderedH + 10)
        : baseTop;
      top = Math.max(baseTop, textClearanceTop);
      originX = side === "left" ? "left" : "right";
      originY = "bottom";
    }
    const shouldMirror = (
      (side === "left" && /right/.test(regionId))
      || (side === "right" && /left/.test(regionId))
    );
    return {
      type: "image",
      src: asset.src,
      left,
      top,
      scaleX: scale,
      scaleY: scale,
      originX,
      originY,
      angle: 0,
      flipX: shouldMirror,
      opacity: 1,
      id,
      selectable: true,
      evented: true,
    };
  };

  const pairBonus = (leftAsset, rightAsset, preferredZone) =>
    leftAsset && rightAsset && ((leftAsset.pageNumber || 1) === (rightAsset.pageNumber || 1))
      ? Math.min(decorSelectionScore(leftAsset, preferredZone), decorSelectionScore(rightAsset, preferredZone)) * 0.24
      : 0;
  const preferPageOneAsset = (...candidates) =>
    candidates.find((asset) => asset && (asset.pageNumber || 1) === 1)
    || candidates.find(Boolean)
    || null;
  const chooseSideAsset = (side, candidates) => {
    const filtered = (candidates || []).filter(Boolean);
    if (!filtered.length) return null;
    return [...filtered].sort((left, right) => {
      const leftZone = effectivePlacementZone(left);
      const rightZone = effectivePlacementZone(right);
      const zoneRank = (zone) => {
        if (zone === "bottom") return 3;
        if (zone === "sideframe") return 2;
        if (zone === "top") return 1;
        return 0;
      };
      const leftRank = zoneRank(leftZone);
      const rightRank = zoneRank(rightZone);
      if (leftRank !== rightRank) return rightRank - leftRank;
      const leftScore = decorSelectionScore(left, leftZone);
      const rightScore = decorSelectionScore(right, rightZone);
      return rightScore - leftScore;
    })[0];
  };

  const topBandAsset = pickDecorAsset(["bunting-band", "top-band"], "top", { preferPageOne: true });
  const topLeftAsset = pickDecorAsset(["edge-top-left", "corner-tl"], "top", { preferPageOne: true });
  const topRightAsset = pickDecorAsset(["edge-top-right", "corner-tr"], "top", { preferPageOne: true });
  const sideLeftAsset = pickDecorAsset(["frame-left-tall", "side-left"], "sideframe", { preferPageOne: true });
  const sideRightAsset = pickDecorAsset(["frame-right-tall", "side-right"], "sideframe", { preferPageOne: true });
  const bottomLeftAsset = pickDecorAsset(["frame-bl", "corner-bl"], "bottom", { preferPageOne: true });
  const bottomRightAsset = pickDecorAsset(["frame-br", "corner-br"], "bottom", { preferPageOne: true });
  const centerpieceAsset = pickDecorAsset(["centerpiece-lower", "centerpiece"], "centerpiece");

  const topPairScore = decorSelectionScore(topLeftAsset, "top") + decorSelectionScore(topRightAsset, "top") + pairBonus(topLeftAsset, topRightAsset, "top");
  const topBandScore = decorSelectionScore(topBandAsset, "top") * 1.06;
  const topScore = Math.max(topPairScore, topBandScore);
  const sideScore = decorSelectionScore(sideLeftAsset, "sideframe") + decorSelectionScore(sideRightAsset, "sideframe") + pairBonus(sideLeftAsset, sideRightAsset, "sideframe");
  const bottomScore = decorSelectionScore(bottomLeftAsset, "bottom") + decorSelectionScore(bottomRightAsset, "bottom") + pairBonus(bottomLeftAsset, bottomRightAsset, "bottom");
  const centerScore = centerpieceAsset ? decorSelectionScore(centerpieceAsset, "centerpiece") : 0;
  const preferCenter = false;
  const trueSidePair = sideLeftAsset
    && sideRightAsset
    && ["frame-left-tall", "side-left"].includes(sideLeftAsset.regionId)
    && ["frame-right-tall", "side-right"].includes(sideRightAsset.regionId);
  const preferSides = sideScore > 0
    && trueSidePair
    && !isGraphicBarAsset(sideLeftAsset)
    && !isGraphicBarAsset(sideRightAsset)
    && sideScore >= (bottomScore * 1.12)
    && sideScore >= (topScore * 1.12);
  const topBandLooksGraphic = topBandAsset && (
    (
      topBandAsset.regionId === "bunting-band"
      && (
        (topBandAsset.vividRatio || 0) > 0.52
        || (
          (topBandAsset.softRatio || 0) < 0.42
          && (topBandAsset.darkRatio || 0) > 0.26
        )
      )
    )
    || (
      (topBandAsset.vividRatio || 0) > 0.72
      && (topBandAsset.softRatio || 0) < 0.35
      && (topBandAsset.darkRatio || 0) > 0.4
    )
  );
  const topBandLooksAmbient = topBandAsset
    && (topBandAsset.regionId === "top-band" || topBandAsset.regionId === "bunting-band")
    && (topBandAsset.softRatio || 0) > 0.48
    && (topBandAsset.darkRatio || 0) < 0.2
    && (topBandAsset.vividRatio || 0) < 0.5;
  const topBandLooksIncomplete = topBandAsset
    && ((topBandAsset.leftEdgeRatio || 0) < 0.01 || (topBandAsset.rightEdgeRatio || 0) < 0.01)
    && (topBandAsset.componentCount || 0) > 6;
  const preferTop = topScore > 0 && (
    topBandAsset && !topBandLooksAmbient && !topBandLooksIncomplete
      ? topBandScore >= Math.max(bottomScore * 0.58, sideScore * 0.86, topPairScore * 0.72)
      : (
        topBandLooksGraphic
          ? topBandScore >= (Math.max(bottomScore, sideScore) * 0.74)
          : (!topBandLooksAmbient && topScore >= (bottomScore * 1.15) && topScore >= (sideScore * 1.02))
      )
  );
  const decorations = [];
  if (preferCenter && centerpieceAsset) {
    const decor = makeDecor(centerpieceAsset, "center", `invite-decoration-${mode}-centerpiece`);
    if (decor) decorations.push(decor);
    return decorations;
  }
  if (preferSides) {
    const pairScales = balancedPairScales(sideLeftAsset, sideRightAsset);
    const leftDecor = makeDecor(sideLeftAsset, "left", `invite-decoration-${mode}-0`, pairScales?.leftScale);
    const rightDecor = makeDecor(sideRightAsset, "right", `invite-decoration-${mode}-1`, pairScales?.rightScale);
    if (leftDecor) decorations.push(leftDecor);
    if (rightDecor) decorations.push(rightDecor);
    return decorations;
  }
  if (preferTop && topBandAsset && topBandScore >= (topPairScore * 0.82)) {
    const decor = makeDecor(topBandAsset, "center", `invite-decoration-${mode}-band`);
    if (decor) decorations.push(decor);
    return decorations;
  }
  if (preferTop && topLeftAsset && topRightAsset && topPairScore >= (topBandScore * 0.9)) {
    const pairScales = balancedPairScales(topLeftAsset, topRightAsset);
    const leftDecor = makeDecor(topLeftAsset, "left", `invite-decoration-${mode}-0`, pairScales?.leftScale);
    const rightDecor = makeDecor(topRightAsset, "right", `invite-decoration-${mode}-1`, pairScales?.rightScale);
    if (leftDecor) decorations.push(leftDecor);
    if (rightDecor) decorations.push(rightDecor);
    return decorations;
  }
  let leftAsset = preferTop
    ? preferPageOneAsset(topLeftAsset, bottomLeftAsset)
    : chooseSideAsset("left", [bottomLeftAsset, sideLeftAsset, topLeftAsset]);
  let rightAsset = preferTop
    ? preferPageOneAsset(topRightAsset, bottomRightAsset)
    : chooseSideAsset("right", [bottomRightAsset, sideRightAsset, topRightAsset]);
  if (!preferTop && (!leftAsset || !rightAsset)) {
    if (sideLeftAsset && sideRightAsset) {
      leftAsset = sideLeftAsset;
      rightAsset = sideRightAsset;
    } else if (topLeftAsset || topRightAsset) {
      leftAsset = leftAsset || topLeftAsset || null;
      rightAsset = rightAsset || topRightAsset || null;
    }
  }
  const pairScales = balancedPairScales(leftAsset, rightAsset);
  if (leftAsset) {
    const decor = (!preferTop && isGraphicBarAsset(leftAsset)) ? null : makeDecor(leftAsset, "left", `invite-decoration-${mode}-0`, pairScales?.leftScale);
    if (decor) decorations.push(decor);
  }
  if (rightAsset) {
    const decor = (!preferTop && isGraphicBarAsset(rightAsset)) ? null : makeDecor(rightAsset, "right", `invite-decoration-${mode}-1`, pairScales?.rightScale);
    if (decor) decorations.push(decor);
  }
  if (decorations.length === 1) {
    const hasLeft = decorations.some((decor) => String(decor.id || "").endsWith("-0"));
    const fallbackLeft = chooseSideAsset("left", [bottomLeftAsset, sideLeftAsset, topLeftAsset]);
    const fallbackRight = chooseSideAsset("right", [bottomRightAsset, sideRightAsset, topRightAsset]);
    if (!hasLeft && fallbackLeft) {
      const decor = makeDecor(fallbackLeft, "left", `invite-decoration-${mode}-0-fallback`);
      if (decor) decorations.unshift(decor);
    } else if (hasLeft && fallbackRight) {
      const decor = makeDecor(fallbackRight, "right", `invite-decoration-${mode}-1-fallback`);
      if (decor) decorations.push(decor);
    }
  }
  if (!decorations.length) {
    const fallbackLeft = chooseSideAsset("left", [bottomLeftAsset, sideLeftAsset, topLeftAsset]);
    const fallbackRight = chooseSideAsset("right", [bottomRightAsset, sideRightAsset, topRightAsset]);
    if (fallbackLeft) {
      const decor = makeDecor(fallbackLeft, "left", `invite-decoration-${mode}-0-fallback`);
      if (decor) decorations.push(decor);
    }
    if (fallbackRight) {
      const decor = makeDecor(fallbackRight, "right", `invite-decoration-${mode}-1-fallback`);
      if (decor) decorations.push(decor);
    }
  }
  if (decorations.length === 1) {
    const existing = decorations[0];
    const mirrorSide = String(existing.id || "").includes("-0") ? "right" : "left";
    const fallbackMirrorLeft = chooseSideAsset("left", [bottomLeftAsset, sideLeftAsset, topLeftAsset]);
    const fallbackMirrorRight = chooseSideAsset("right", [bottomRightAsset, sideRightAsset, topRightAsset]);
    const sourceAsset = mirrorSide === "left"
      ? (leftAsset || fallbackMirrorLeft || rightAsset || fallbackMirrorRight)
      : (rightAsset || fallbackMirrorRight || leftAsset || fallbackMirrorLeft);
    if (sourceAsset) {
      const mirror = makeDecor(sourceAsset, mirrorSide, `invite-decoration-${mode}-mirror`);
      if (mirror) decorations.push(mirror);
    }
  }
  return decorations;
}

function createInvitationTextObjectsLegacy(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const layout = estimateInvitationTextLayout(mode, analysis, DIMS, PAD);
  const coupleName = layout.coupleName;
  const eventDate = layout.eventDate;
  const textColor = analysis.palette.textColor;
  const objects = [];
  let currentY = layout.nameRect ? ((layout.nameRect.top + layout.nameRect.bottom) / 2) : layout.currentY;

  if (analysis.nameImageAsset) {
    const asset = analysis.nameImageAsset;
    const maxW = dims.w * 0.62;
    const maxH = pad.b * 0.48;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    objects.push({
      type: "image",
      src: asset.src,
      left: dims.w / 2,
      top: currentY,
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      id: `invite-name-img-${mode}`,
      selectable: true,
      evented: true,
    });
    currentY = layout.currentY;
  } else {
    const titleSize = mode === "portrait" ? 82 : 64;
    objects.push({
      type: "i-text",
      text: coupleName,
      fontSize: titleSize,
      fill: textColor,
      fontFamily: analysis.font,
      fontWeight: "bold",
      left: dims.w / 2,
      top: currentY,
      originX: "center",
      originY: "center",
      direction: inferTextDirection(coupleName, "rtl"),
      textAlign: "center",
      shadow: { color: rgbaFromHex("#000000", 0.18), blur: 10, offsetX: 0, offsetY: 4 },
      id: `invite-title-${mode}`,
      selectable: true,
      evented: true,
    });
    currentY = layout.currentY;
  }

  if (layout.dateImageLooksUsable) {
    const asset = analysis.dateImageAsset;
    const maxW = dims.w * 0.54;
    const maxH = pad.b * 0.26;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    objects.push({
      type: "image",
      src: asset.src,
      left: dims.w / 2,
      top: layout.dateRect ? ((layout.dateRect.top + layout.dateRect.bottom) / 2) : (currentY + 28),
      scaleX: scale,
      scaleY: scale,
      originX: "center",
      originY: "center",
      id: `invite-date-img-${mode}`,
      selectable: true,
      evented: true,
    });
  } else if (eventDate) {
    objects.push({
      type: "i-text",
      text: eventDate,
      fontSize: mode === "portrait" ? 36 : 30,
      fill: mixHexColors(textColor, analysis.palette.secondary, 0.42),
      fontFamily: analysis.font,
      left: dims.w / 2,
      top: layout.dateRect ? ((layout.dateRect.top + layout.dateRect.bottom) / 2) : (currentY + 28),
      originX: "center",
      originY: "center",
      direction: "ltr",
      textAlign: "center",
      shadow: { color: rgbaFromHex("#000000", 0.14), blur: 6, offsetX: 0, offsetY: 2 },
      id: `invite-date-${mode}`,
      selectable: true,
      evented: true,
    });
  }

  return objects;
}

function estimateInvitationTextLayoutSimple(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const additionalTextAssets = (Array.isArray(analysis.additionalTextAssets) ? analysis.additionalTextAssets : [])
    .filter((asset) => asset?.src);
  const splitPairLayout = !analysis.nameImageAsset && !analysis.dateImageAsset && additionalTextAssets.length === 2;

  if (splitPairLayout) {
    const pairY = dims.h - (pad.b * 0.46);
    const centerGap = dims.w * (mode === "portrait" ? 0.11 : 0.095);
    additionalTextAssets.slice(0, 2).forEach((asset, index) => {
      const side = index === 0 ? "left" : "right";
      const maxW = dims.w * 0.26;
      const maxH = Math.max(pad.b * 0.24, dims.h * 0.08);
      const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height), 1.2);
      const renderedW = asset.width * scale;
      const renderedH = asset.height * scale;
      const left = side === "left"
        ? (dims.w / 2) - centerGap
        : (dims.w / 2) + centerGap;
      objects.push({
        id: asset.id || `invite-text-extra-${mode}-${index}`,
        type: "image",
        src: asset.src,
        left,
        top: pairY,
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        selectable: true,
        evented: true,
        renderedW,
        renderedH,
      });
    });

    const pairRects = objects.map((object) => ({
      left: object.left - (object.renderedW / 2),
      right: object.left + (object.renderedW / 2),
      top: object.top - (object.renderedH / 2),
      bottom: object.top + (object.renderedH / 2),
    }));
    return {
      objects: objects.map(({ renderedW, renderedH, ...object }) => object),
      textBand: {
        left: Math.max(0, Math.min(...pairRects.map((rect) => rect.left)) - 44),
        right: Math.min(dims.w, Math.max(...pairRects.map((rect) => rect.right)) + 44),
        top: Math.max(0, Math.min(...pairRects.map((rect) => rect.top)) - 24),
        bottom: Math.min(dims.h, Math.max(...pairRects.map((rect) => rect.bottom)) + 24),
      },
    };
  }

  const textEntries = [];
  if (analysis.nameImageAsset?.src) {
    const asset = analysis.nameImageAsset;
    const maxW = dims.w * (mode === "portrait" ? 0.62 : 0.56);
    const maxH = pad.b * 0.31;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height), 1.18);
    textEntries.push({
      id: `invite-name-img-${mode}`,
      src: asset.src,
      scale,
      renderedW: asset.width * scale,
      renderedH: asset.height * scale,
      isDateLike: false,
      order: 0,
    });
  }

  additionalTextAssets.forEach((asset, index) => {
    const maxW = dims.w * 0.62;
    const maxH = Math.max(pad.b * 0.13, dims.h * 0.058);
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height), 1.28);
    textEntries.push({
      id: asset.id || `invite-text-extra-${mode}-${index}`,
      src: asset.src,
      scale,
      renderedW: asset.width * scale,
      renderedH: asset.height * scale,
      isDateLike: false,
      order: 10 + index,
    });
  });

  if (analysis.dateImageAsset?.src) {
    const asset = analysis.dateImageAsset;
    const maxW = dims.w * (mode === "portrait" ? 0.34 : 0.28);
    const maxH = pad.b * 0.15;
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height), 1.12);
    textEntries.push({
      id: `invite-date-img-${mode}`,
      src: asset.src,
      scale,
      renderedW: asset.width * scale,
      renderedH: asset.height * scale,
      isDateLike: true,
      order: 90,
    });
  }

  if (!textEntries.length) {
    return {
      objects: [],
      textBand: null,
    };
  }

  const textPlan = buildClassicTextLayout({
    mode,
    dims,
    pad,
    texts: textEntries.map((entry) => ({
      id: entry.id,
      width: entry.renderedW,
      height: entry.renderedH,
      isDateLike: entry.isDateLike,
      order: entry.order,
    })),
  });

  const objects = textPlan.placements.map((placement) => {
    const entry = textEntries.find((candidate) => candidate.id === placement.id);
    if (!entry) return null;
    return {
      id: entry.id,
      type: "image",
      src: entry.src,
      left: placement.left,
      top: placement.top,
      scaleX: entry.scale,
      scaleY: entry.scale,
      originX: "center",
      originY: "center",
      selectable: true,
      evented: true,
    };
  }).filter(Boolean);

  const textBand = textPlan.textBand
    ? {
      left: textPlan.textBand.left,
      right: textPlan.textBand.right,
      top: textPlan.textBand.top,
      bottom: textPlan.textBand.bottom,
    }
    : null;

  return {
    objects,
    textBand,
  };
}

function createInvitationDecorationsSimple(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const photoRect = {
    left: pad.l,
    top: pad.t,
    right: dims.w - pad.r,
    bottom: dims.h - pad.b,
  };
  const layout = estimateInvitationTextLayoutSimple(mode, analysis, DIMS, PAD);
  const textBand = layout.textBand;
  const assets = (Array.isArray(analysis.decorationAssets) ? analysis.decorationAssets : [])
    .filter((asset) => asset?.src);
  if (!assets.length) return [];

  const usableAssets = assets.filter((asset) => {
    // Never filter out elements the user manually added — they made a conscious choice
    if (asset.userAdded) return true;
    if ((asset.componentCount || 0) > 12 && (asset.largestComponentRatio || 0) < 0.16) return false;
    if ((asset.coverage || 0) < 0.028) return false;
    if (asset.height > asset.width * 4.4 && asset.width < 120) return false;
    if (asset.width > asset.height * 7.2 && asset.height < 72) return false;
    if (asset.zone === "top" && asset.width > asset.height * 2.8) return false;
    // Filter out elements that are too small to look good (avoid tiny debris near text)
    if ((asset.width || 0) < 60 && (asset.height || 0) < 60) return false;
    if ((asset.width || 0) * (asset.height || 0) < 5000) return false;
    return true;
  });
  if (!usableAssets.length) return [];

  const userAddedAssets = usableAssets.filter((asset) => asset.userAdded);
  const autoAssets = usableAssets.filter((asset) => !asset.userAdded);
  const sortedAssets = [...autoAssets].sort((left, right) => (right.score || 0) - (left.score || 0));

  // Categorize by zone
  const bottomLeft = sortedAssets.find((a) => a.zone === "bottom-left") || null;
  const bottomRight = sortedAssets.find((a) => a.zone === "bottom-right") || null;
  const topLeft = sortedAssets.find((a) => a.zone === "top-left") || null;
  const topRight = sortedAssets.find((a) => a.zone === "top-right") || null;
  const leftSide = sortedAssets.find((a) => a.zone === "left") || null;
  const rightSide = sortedAssets.find((a) => a.zone === "right") || null;
  const topBanner = sortedAssets.find((a) => a.zone === "top") || null;
  const centerpiece = sortedAssets.find((a) => a.zone === "centerpiece") || null;

  // ── Bottom corner placement ─────────────────────────────────
  const makeBottomDecor = (asset, side, id, scaleMultiplier = 1) => {
    if (!asset) return null;
    const maxH = pad.b * 0.96;
    const maxW = dims.w * (side === "center-left" || side === "center-right" ? 0.26 : 0.24);
    let scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height)) * scaleMultiplier;
    let renderedW = asset.width * scale;
    let renderedH = asset.height * scale;
    const spillX = Math.min(renderedW * 0.24, mode === "portrait" ? 42 : 38);
    const allowedInside = renderedH * 0.12;
    const bottomY = photoRect.bottom + renderedH - allowedInside;
    // Respect text band — keep clear margin
    if (textBand) {
      const margin = mode === "portrait" ? 74 : 68;
      const freeHalfWidth = side === "left" || side === "center-left"
        ? Math.max(36, textBand.left - margin)
        : Math.max(36, dims.w - textBand.right - margin);
      if (renderedW > freeHalfWidth) {
        scale *= freeHalfWidth / Math.max(1, renderedW);
        renderedW = asset.width * scale;
        renderedH = asset.height * scale;
      }
    }
    const originX = side === "left" || side === "center-left" ? "left" : "right";
    const x = side === "left" ? -spillX : (side === "right" ? dims.w + spillX
      : (side === "center-left"
        ? Math.max(0, (textBand?.left || dims.w * 0.34) - 16)
        : Math.min(dims.w, (textBand?.right || dims.w * 0.66) + 16)));
    if (renderedH < 55 || renderedW < 45 || (renderedW * renderedH) < 5500) return null;
    return {
      type: "image", src: asset.src, left: x, top: bottomY,
      scaleX: scale, scaleY: scale, originX, originY: "bottom",
      selectable: true, evented: true, id, renderedW, renderedH,
    };
  };

  // ── Top corner placement ────────────────────────────────────
  const makeTopCornerDecor = (asset, side, id, scaleMultiplier = 1) => {
    if (!asset) return null;
    const maxH = Math.max(pad.t * 2.2, dims.h * 0.16);
    const maxW = dims.w * 0.24;
    let scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height)) * scaleMultiplier;
    let renderedW = asset.width * scale;
    let renderedH = asset.height * scale;
    if (renderedH < 50 || renderedW < 40 || (renderedW * renderedH) < 4500) return null;
    const spillX = Math.min(renderedW * 0.24, 40);
    const allowedInside = renderedH * 0.12;
    const x = side === "left" ? -spillX : dims.w + spillX;
    const y = Math.max(-Math.min(pad.t * 0.34, renderedH * 0.14), photoRect.top - renderedH + allowedInside);
    return {
      type: "image", src: asset.src, left: x, top: y,
      scaleX: scale, scaleY: scale,
      originX: side === "left" ? "left" : "right", originY: "top",
      selectable: true, evented: true, id, renderedW, renderedH,
    };
  };

  // ── Top banner placement ────────────────────────────────────
  const makeTopBannerDecor = (asset, id) => {
    if (!asset) return null;
    const maxW = dims.w * 0.96;
    const maxH = dims.h * 0.12;
    let scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    let renderedH = asset.height * scale;
    if (renderedH < 30) return null;
    const allowedInside = renderedH * 0.1;
    const y = Math.max(
      -Math.min(pad.t * 0.36, renderedH * 0.14),
      photoRect.top - renderedH + allowedInside
    );
    return {
      type: "image", src: asset.src,
      left: dims.w / 2, top: y,
      scaleX: scale, scaleY: scale,
      originX: "center", originY: "top",
      selectable: true, evented: true, id, renderedW: asset.width * scale, renderedH,
    };
  };

  // ── Centerpiece placement (heart, rings, etc.) ──────────────
  const makeCenterpieceDecor = (asset, id) => {
    if (!asset) return null;
    const maxH = pad.b * 0.36;
    const maxW = dims.w * 0.12;
    let scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height));
    let renderedW = asset.width * scale;
    let renderedH = asset.height * scale;
    if (renderedH < 36 || renderedW < 36) return null;
    // Place between name and date if possible
    const centerY = textBand
      ? (textBand.top + textBand.bottom) / 2
      : dims.h - pad.b * 0.48;
    return {
      type: "image", src: asset.src,
      left: dims.w / 2, top: centerY,
      scaleX: scale, scaleY: scale,
      originX: "center", originY: "center",
      selectable: true, evented: true, id, renderedW, renderedH,
    };
  };

  const normalizeManualZone = (zone, index) => {
    if (zone === "top" || zone === "top-left" || zone === "top-right" || zone === "left" || zone === "right" || zone === "centerpiece") {
      return zone;
    }
    if (zone === "bottom-left" || zone === "bottom-right") return zone;
    const fallbackZones = ["bottom-left", "bottom-right", "top-left", "top-right", "left", "right", "centerpiece"];
    return fallbackZones[index % fallbackZones.length];
  };

  const makeManualDecor = (asset, zone, slotIndex, slotCount, index, total) => {
    if (!asset) return null;
    const zoneKey = normalizeManualZone(zone, index);
    const isTopZone = zoneKey === "top" || zoneKey === "top-left" || zoneKey === "top-right";
    const isSideZone = zoneKey === "left" || zoneKey === "right";
    const isCenterZone = zoneKey === "centerpiece";
    const maxW = dims.w * (total >= 5 ? 0.12 : total === 4 ? 0.135 : total === 3 ? 0.155 : total === 2 ? 0.18 : 0.22);
    const maxH = isTopZone
      ? Math.max(pad.t * 2.1, dims.h * 0.14)
      : (isSideZone ? Math.max(pad.b * 0.95, dims.h * 0.18) : Math.max(pad.b * 0.92, dims.h * 0.14));
    let scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height), 1.22);
    const renderedW = asset.width * scale;
    const renderedH = asset.height * scale;
    // Don't discard user-added elements — they were deliberately chosen
    if (!asset.userAdded && (renderedW < 36 || renderedH < 32 || (renderedW * renderedH) < 3600)) return null;
    const slotRatio = slotCount > 1 ? (slotIndex / Math.max(1, slotCount - 1)) : 0.5;
    if (zoneKey === "top") {
      const centerSpan = Math.max(renderedW * 0.2, dims.w * 0.18);
      return {
        type: "image",
        src: asset.src,
        left: (dims.w / 2) + ((slotRatio - 0.5) * centerSpan),
        top: Math.max(-renderedH * 0.1, pad.t - renderedH * 0.84),
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "top",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }
    if (zoneKey === "top-left" || zoneKey === "top-right") {
      const side = zoneKey === "top-left" ? "left" : "right";
      const spillX = Math.min(renderedW * 0.18, 34);
      return {
        type: "image",
        src: asset.src,
        left: side === "left" ? -spillX + (slotRatio * renderedW * 0.28) : dims.w + spillX - (slotRatio * renderedW * 0.28),
        top: Math.max(-renderedH * 0.08, pad.t - renderedH * (0.8 - (slotRatio * 0.08))),
        scaleX: scale,
        scaleY: scale,
        originX: side,
        originY: "top",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }
    if (zoneKey === "left" || zoneKey === "right") {
      const side = zoneKey;
      const isTallDecor = asset.height > asset.width * 1.2;
      if (isTallDecor) {
        const preferBottom = side === "left" ? (slotIndex % 2 === 0) : (slotIndex % 2 === 1);
        const spillX = Math.min(renderedW * 0.18, 30);
        if (preferBottom) {
          return {
            type: "image",
            src: asset.src,
            left: side === "left" ? -spillX : dims.w + spillX,
            top: photoRect.bottom + renderedH - Math.min(renderedH * 0.12, 16) - (slotIndex * Math.min(20, renderedH * 0.12)),
            scaleX: scale,
            scaleY: scale,
            originX: side,
            originY: "bottom",
            selectable: true,
            evented: true,
            id: `${asset.id}-${mode}-${slotIndex}`,
            renderedW,
            renderedH,
          };
        }
        return {
          type: "image",
          src: asset.src,
          left: side === "left" ? -spillX : dims.w + spillX,
          top: Math.max(-renderedH * 0.08, pad.t - renderedH * (0.82 - (slotRatio * 0.06))),
          scaleX: scale,
          scaleY: scale,
          originX: side,
          originY: "top",
          selectable: true,
          evented: true,
          id: `${asset.id}-${mode}-${slotIndex}`,
          renderedW,
          renderedH,
        };
      }
      const verticalStart = Math.max(pad.t * 0.2, 26);
      const verticalEnd = Math.max(verticalStart + renderedH, photoRect.bottom - Math.max(pad.b * 0.12, renderedH * 0.4));
      return {
        type: "image",
        src: asset.src,
        left: side === "left" ? -Math.min(renderedW * 0.16, 30) : dims.w + Math.min(renderedW * 0.16, 30),
        top: verticalStart + ((verticalEnd - verticalStart) * slotRatio),
        scaleX: scale,
        scaleY: scale,
        originX: side,
        originY: "top",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }
    if (isCenterZone) {
      const centerY = textBand
        ? (textBand.top + textBand.bottom) / 2
        : dims.h - pad.b * 0.5;
      return {
        type: "image",
        src: asset.src,
        left: (dims.w / 2) + ((slotRatio - 0.5) * Math.max(renderedW * 0.5, dims.w * 0.16)),
        top: centerY + ((slotRatio - 0.5) * Math.min(renderedH * 0.32, 26)),
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }
    const side = zoneKey === "bottom-left" ? "left" : "right";
    const margin = mode === "portrait" ? 74 : 66;
    const usableWidth = textBand
      ? (side === "left"
        ? Math.max(42, textBand.left - margin)
        : Math.max(42, dims.w - textBand.right - margin))
      : dims.w * 0.28;
    const sweep = Math.max(renderedW * 0.52, Math.min(usableWidth * 0.88, dims.w * 0.22));
    return {
      type: "image",
      src: asset.src,
      left: side === "left"
        ? (-Math.min(renderedW * 0.16, 30)) + (slotRatio * sweep)
        : dims.w + Math.min(renderedW * 0.16, 30) - (slotRatio * sweep),
      top: photoRect.bottom + renderedH - Math.min(renderedH * 0.12, 16) - (slotRatio * Math.min(24, renderedH * 0.14)),
      scaleX: scale,
      scaleY: scale,
      originX: side,
      originY: "bottom",
      selectable: true,
      evented: true,
      id: `${asset.id}-${mode}-${slotIndex}`,
      renderedW,
      renderedH,
    };
  };

  const appendUserAddedDecorations = (baseDecorations) => {
    if (!userAddedAssets.length) return baseDecorations;
    const countsByZone = userAddedAssets.reduce((acc, asset, index) => {
      const zone = normalizeManualZone(asset.zone, index);
      acc[zone] = (acc[zone] || 0) + 1;
      return acc;
    }, {});
    const seenByZone = {};
    const manualDecorations = userAddedAssets
      .map((asset, index) => {
        const zone = normalizeManualZone(asset.zone, index);
        const slotIndex = seenByZone[zone] || 0;
        seenByZone[zone] = slotIndex + 1;
        return makeManualDecor(asset, zone, slotIndex, countsByZone[zone], index, userAddedAssets.length);
      })
      .filter(Boolean);
    return [...baseDecorations, ...manualDecorations];
  };

  const decorations = [];

  // ── Strategy 1: Top banner (like bunting flags) ─────────────
  if (topBanner && topBanner.score > 0) {
    const hasBottomPair = bottomLeft && bottomRight && bottomLeft.id !== bottomRight.id;
    const bannerDecor = makeTopBannerDecor(topBanner, `invite-decoration-${mode}-banner`);
    if (bannerDecor) {
      decorations.push(bannerDecor);
      // If there's also a strong bottom pair, add them too
      if (hasBottomPair && (bottomLeft.score + bottomRight.score) > topBanner.score * 0.6) {
        const ld = makeBottomDecor(bottomLeft, "left", `invite-decoration-${mode}-left`);
        const rd = makeBottomDecor(bottomRight, "right", `invite-decoration-${mode}-right`);
        if (ld) decorations.push(ld);
        if (rd) decorations.push(rd);
      }
      return appendUserAddedDecorations(decorations);
    }
  }

  // ── Strategy 2: Symmetric bottom pair (most common) ─────────
  const hasSymmetricBottom = bottomLeft && bottomRight && bottomLeft.id !== bottomRight.id;
  // ── Strategy 3: Diagonal pair (top-right + bottom-left or top-left + bottom-right) ──
  const diag1 = topRight && bottomLeft && topRight.id !== bottomLeft.id;
  const diag2 = topLeft && bottomRight && topLeft.id !== bottomRight.id;
  const diag1Score = diag1 ? ((topRight.score || 0) + (bottomLeft.score || 0)) : 0;
  const diag2Score = diag2 ? ((topLeft.score || 0) + (bottomRight.score || 0)) : 0;
  const symmetricScore = hasSymmetricBottom ? ((bottomLeft.score || 0) + (bottomRight.score || 0)) : 0;
  const bestDiagScore = Math.max(diag1Score, diag2Score);

  // Prefer symmetric bottom, but use diagonal if significantly stronger or no symmetric pair
  if (hasSymmetricBottom && symmetricScore >= bestDiagScore * 0.75) {
    const ld = makeBottomDecor(bottomLeft, "left", `invite-decoration-${mode}-left`);
    const rd = makeBottomDecor(bottomRight, "right", `invite-decoration-${mode}-right`);
    if (ld) decorations.push(ld);
    if (rd) decorations.push(rd);
  } else if (diag1Score >= diag2Score && diag1Score > 0) {
    // Diagonal: top-right + bottom-left
    const tr = makeTopCornerDecor(topRight, "right", `invite-decoration-${mode}-tr`);
    const bl = makeBottomDecor(bottomLeft, "left", `invite-decoration-${mode}-bl`);
    if (tr) decorations.push(tr);
    if (bl) decorations.push(bl);
  } else if (diag2Score > 0) {
    // Diagonal: top-left + bottom-right
    const tl = makeTopCornerDecor(topLeft, "left", `invite-decoration-${mode}-tl`);
    const br = makeBottomDecor(bottomRight, "right", `invite-decoration-${mode}-br`);
    if (tl) decorations.push(tl);
    if (br) decorations.push(br);
  } else if (hasSymmetricBottom) {
    const ld = makeBottomDecor(bottomLeft, "left", `invite-decoration-${mode}-left`);
    const rd = makeBottomDecor(bottomRight, "right", `invite-decoration-${mode}-right`);
    if (ld) decorations.push(ld);
    if (rd) decorations.push(rd);
  }

  // ── Fallback: hero asset ────────────────────────────────────
  if (!decorations.length) {
    const heroAsset = sortedAssets[0] || null;
    if (heroAsset) {
      const heroSide = ["bottom-left", "left", "top-left"].includes(heroAsset.zone) ? "left" : "right";
      const isTopCorner = heroAsset.zone === "top-left" || heroAsset.zone === "top-right";
      const heroDecor = isTopCorner
        ? makeTopCornerDecor(heroAsset, heroSide, `invite-decoration-${mode}-hero`, 1.08)
        : makeBottomDecor(heroAsset, heroSide, `invite-decoration-${mode}-hero`, 1.08);
      if (heroDecor) decorations.push(heroDecor);
      // Try to find a secondary on the opposite side
      const secondary = sortedAssets.find((a) =>
        a.id !== heroAsset.id
        && ((heroSide === "left" && ["bottom-right", "right", "top-right"].includes(a.zone))
          || (heroSide === "right" && ["bottom-left", "left", "top-left"].includes(a.zone)))
      ) || null;
      if (secondary) {
        const secSide = heroSide === "left" ? "right" : "left";
        const secIsTop = secondary.zone === "top-left" || secondary.zone === "top-right";
        const secDecor = secIsTop
          ? makeTopCornerDecor(secondary, secSide, `invite-decoration-${mode}-secondary`, 0.88)
          : makeBottomDecor(secondary, secSide, `invite-decoration-${mode}-secondary`, 0.88);
        if (secDecor) decorations.push(secDecor);
      }
    }
  }

  // ── Centerpiece: add heart/symbol between names if found ────
  // Only add if the text band doesn't fully cover the center (avoid overlapping with & connector)
  const hasTwoBottomTexts = Array.isArray(layout.objects) && layout.objects.length === 2;
  if (centerpiece && centerpiece.score > 0) {
    const centerX = dims.w / 2;
    const textCoversCenter = textBand
      && centerX > (textBand.left + 28) && centerX < (textBand.right - 28);
    if (!textCoversCenter || hasTwoBottomTexts) {
      const cp = makeCenterpieceDecor(centerpiece, `invite-decoration-${mode}-center`);
      if (cp) decorations.push(cp);
    }
  }

  // ── Mirror fallback: if only one side has an element, mirror it ──
  if (decorations.length === 1) {
    const existing = decorations[0];
    const isLeft = existing.originX === "left";
    const mirrorSide = isLeft ? "right" : "left";
    // Find any asset from the opposite side
    const mirrorAsset = sortedAssets.find((a) =>
      (mirrorSide === "left" && ["bottom-left", "left"].includes(a.zone))
      || (mirrorSide === "right" && ["bottom-right", "right"].includes(a.zone))
    );
    if (mirrorAsset) {
      const mirror = makeBottomDecor(mirrorAsset, mirrorSide, `invite-decoration-${mode}-mirror`, 0.92);
      if (mirror) decorations.push(mirror);
    }
  }

  const withManual = appendUserAddedDecorations(decorations);
  const placedRects = [];
  return withManual.filter((object) => {
    const width = Math.max(1, object.renderedW || 1);
    const height = Math.max(1, object.renderedH || 1);
    const toRect = () => {
      const left = object.originX === "right"
        ? object.left - width
        : (object.originX === "center" ? object.left - (width / 2) : object.left);
      const top = object.originY === "bottom"
        ? object.top - height
        : (object.originY === "center" ? object.top - (height / 2) : object.top);
      return { left, top, right: left + width, bottom: top + height };
    };
    const rectOverlaps = (rect) => placedRects.some((existing) => {
      const overlapW = Math.max(0, Math.min(existing.right, rect.right) - Math.max(existing.left, rect.left));
      const overlapH = Math.max(0, Math.min(existing.bottom, rect.bottom) - Math.max(existing.top, rect.top));
      const overlapArea = overlapW * overlapH;
      const rectArea = Math.max(1, (rect.right - rect.left) * (rect.bottom - rect.top));
      return overlapArea / rectArea > 0.28;
    });
    let rect = toRect();
    const isManual = String(object.id || "").includes("whole-object-user");
    if (isManual) {
      const stepX = Math.max(18, Math.round(width * 0.22));
      const stepY = Math.max(16, Math.round(height * 0.18));
      let tries = 0;
      while (rectOverlaps(rect) && tries < 10) {
        if (object.originX === "left") object.left += stepX;
        else if (object.originX === "right") object.left -= stepX;
        else object.left += (tries % 2 === 0 ? stepX : -stepX);
        if (object.originY === "bottom") object.top -= Math.min(stepY, 26);
        else if (object.originY === "top") object.top += Math.min(stepY, 26);
        rect = toRect();
        tries += 1;
      }
    }
    // Never drop a user-manually-added element even if it still overlaps after retries.
    if (rectOverlaps(rect) && !isManual) return false;
    placedRects.push(rect);
    return true;
  });
}

function createInvitationDecorationsFromExamples(mode, analysis, DIMS, PAD) {
  const dims = DIMS[mode];
  const pad = PAD[mode];
  const regions = getClassicFrameRegions(dims, pad);
  const photoRect = regions.photo;
  const layout = estimateInvitationTextLayoutSimple(mode, analysis, DIMS, PAD);
  const textBand = layout.textBand;
  const assets = (Array.isArray(analysis.decorationAssets) ? analysis.decorationAssets : [])
    .filter((asset) => asset?.src);
  if (!assets.length) return [];

  const usableAssets = assets.filter((asset) => {
    if (asset.userAdded) return true;
    if ((asset.componentCount || 0) > 12 && (asset.largestComponentRatio || 0) < 0.16) return false;
    if ((asset.coverage || 0) < 0.028) return false;
    if (asset.height > asset.width * 4.4 && asset.width < 120) return false;
    if (asset.width > asset.height * 7.2 && asset.height < 72) return false;
    if (asset.zone === "top" && asset.width > asset.height * 2.8) return false;
    if ((asset.width || 0) < 60 && (asset.height || 0) < 60) return false;
    if ((asset.width || 0) * (asset.height || 0) < 5000) return false;
    return true;
  });
  if (!usableAssets.length) return [];

  const userAddedAssets = usableAssets.filter((asset) => asset.userAdded);
  const autoAssets = usableAssets.filter((asset) => !asset.userAdded);
  const autoItems = autoAssets.map((asset, index) => ({
    id: asset.id || `invite-decoration-${mode}-${index}`,
    width: Math.max(1, asset.width || 1),
    height: Math.max(1, asset.height || 1),
    importance: (Number.isFinite(asset.score) ? asset.score : 0) + ((asset.width || 0) * (asset.height || 0)),
    preferredZone: asset.zone || null,
    preferredSide: asset.zone?.includes("left") ? "left" : (asset.zone?.includes("right") ? "right" : null),
    src: asset.src,
  }));

  const autoPlan = planClassicDecorationLayout({
    mode,
    dims,
    pad,
    textBand,
    occupiedRects: textBand ? [textBand] : [],
    decorations: autoItems,
  });

  const autoObjects = autoPlan.placements.map((placement) => {
    const source = autoItems.find((item) => item.id === placement.id);
    const scale = placement.scale || 1;
    return {
      type: "image",
      src: source?.src || null,
      left: placement.left,
      top: placement.top,
      scaleX: scale,
      scaleY: scale,
      originX: placement.originX,
      originY: placement.originY,
      selectable: true,
      evented: true,
      id: placement.id,
      renderedW: placement.renderedW,
      renderedH: placement.renderedH,
    };
  }).filter((object) => object.src);

  const placementRect = (object) => {
    const width = Math.max(1, object.renderedW || 1);
    const height = Math.max(1, object.renderedH || 1);
    const left = object.originX === "right"
      ? object.left - width
      : (object.originX === "center" ? object.left - (width / 2) : object.left);
    const top = object.originY === "bottom"
      ? object.top - height
      : (object.originY === "center" ? object.top - (height / 2) : object.top);
    return { left, top, right: left + width, bottom: top + height };
  };

  const normalizeManualZone = (zone, index) => {
    if (zone === "top" || zone === "top-left" || zone === "top-right" || zone === "left" || zone === "right" || zone === "centerpiece") {
      return zone;
    }
    if (zone === "bottom-left" || zone === "bottom-right") return zone;
    const fallbackZones = ["bottom-left", "bottom-right", "top-left", "top-right", "left", "right", "centerpiece"];
    return fallbackZones[index % fallbackZones.length];
  };

  const makeManualDecor = (asset, zone, slotIndex, slotCount, index, total) => {
    if (!asset) return null;
    const zoneKey = normalizeManualZone(zone, index);
    const isTopZone = zoneKey === "top" || zoneKey === "top-left" || zoneKey === "top-right";
    const isSideZone = zoneKey === "left" || zoneKey === "right";
    const isCenterZone = zoneKey === "centerpiece";
    const maxW = dims.w * (total >= 5 ? 0.12 : total === 4 ? 0.135 : total === 3 ? 0.155 : total === 2 ? 0.18 : 0.22);
    const maxH = isTopZone
      ? Math.max(pad.t * 2.1, dims.h * 0.14)
      : (isSideZone ? Math.max(pad.b * 0.95, dims.h * 0.18) : Math.max(pad.b * 0.92, dims.h * 0.14));
    const scale = Math.min(maxW / Math.max(1, asset.width), maxH / Math.max(1, asset.height), 1.22);
    const renderedW = asset.width * scale;
    const renderedH = asset.height * scale;
    const slotRatio = slotCount > 1 ? (slotIndex / Math.max(1, slotCount - 1)) : 0.5;

    if (zoneKey === "top") {
      const centerSpan = Math.max(renderedW * 0.2, dims.w * 0.18);
      return {
        type: "image",
        src: asset.src,
        left: (dims.w / 2) + ((slotRatio - 0.5) * centerSpan),
        top: Math.max(-renderedH * 0.1, pad.t - renderedH * 0.84),
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "top",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }

    if (zoneKey === "top-left" || zoneKey === "top-right") {
      const side = zoneKey === "top-left" ? "left" : "right";
      const spillX = Math.min(renderedW * 0.18, 34);
      return {
        type: "image",
        src: asset.src,
        left: side === "left" ? -spillX + (slotRatio * renderedW * 0.28) : dims.w + spillX - (slotRatio * renderedW * 0.28),
        top: Math.max(-renderedH * 0.08, pad.t - renderedH * (0.8 - (slotRatio * 0.08))),
        scaleX: scale,
        scaleY: scale,
        originX: side,
        originY: "top",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }

    if (zoneKey === "left" || zoneKey === "right") {
      const side = zoneKey;
      const spillX = Math.min(renderedW * 0.18, 30);
      const isTallDecor = asset.height > asset.width * 1.2;
      if (isTallDecor) {
        const preferBottom = side === "left" ? (slotIndex % 2 === 0) : (slotIndex % 2 === 1);
        if (preferBottom) {
          return {
            type: "image",
            src: asset.src,
            left: side === "left" ? -spillX : dims.w + spillX,
            top: photoRect.bottom + renderedH - Math.min(renderedH * 0.12, 16) - (slotIndex * Math.min(20, renderedH * 0.12)),
            scaleX: scale,
            scaleY: scale,
            originX: side,
            originY: "bottom",
            selectable: true,
            evented: true,
            id: `${asset.id}-${mode}-${slotIndex}`,
            renderedW,
            renderedH,
          };
        }
        return {
          type: "image",
          src: asset.src,
          left: side === "left" ? -spillX : dims.w + spillX,
          top: Math.max(-renderedH * 0.08, pad.t - renderedH * (0.82 - (slotRatio * 0.06))),
          scaleX: scale,
          scaleY: scale,
          originX: side,
          originY: "top",
          selectable: true,
          evented: true,
          id: `${asset.id}-${mode}-${slotIndex}`,
          renderedW,
          renderedH,
        };
      }
      const verticalStart = Math.max(pad.t * 0.2, 26);
      const verticalEnd = Math.max(verticalStart + renderedH, photoRect.bottom - Math.max(pad.b * 0.12, renderedH * 0.4));
      return {
        type: "image",
        src: asset.src,
        left: side === "left" ? -Math.min(renderedW * 0.16, 30) : dims.w + Math.min(renderedW * 0.16, 30),
        top: verticalStart + ((verticalEnd - verticalStart) * slotRatio),
        scaleX: scale,
        scaleY: scale,
        originX: side,
        originY: "top",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }

    if (isCenterZone) {
      const centerY = textBand
        ? (textBand.top + textBand.bottom) / 2
        : dims.h - pad.b * 0.5;
      return {
        type: "image",
        src: asset.src,
        left: (dims.w / 2) + ((slotRatio - 0.5) * Math.max(renderedW * 0.5, dims.w * 0.16)),
        top: centerY + ((slotRatio - 0.5) * Math.min(renderedH * 0.32, 26)),
        scaleX: scale,
        scaleY: scale,
        originX: "center",
        originY: "center",
        selectable: true,
        evented: true,
        id: `${asset.id}-${mode}-${slotIndex}`,
        renderedW,
        renderedH,
      };
    }

    const side = zoneKey === "bottom-left" ? "left" : "right";
    const margin = mode === "portrait" ? 74 : 66;
    const usableWidth = textBand
      ? (side === "left"
        ? Math.max(42, textBand.left - margin)
        : Math.max(42, dims.w - textBand.right - margin))
      : dims.w * 0.28;
    const sweep = Math.max(renderedW * 0.52, Math.min(usableWidth * 0.88, dims.w * 0.22));
    return {
      type: "image",
      src: asset.src,
      left: side === "left"
        ? (-Math.min(renderedW * 0.16, 30)) + (slotRatio * sweep)
        : dims.w + Math.min(renderedW * 0.16, 30) - (slotRatio * sweep),
      top: photoRect.bottom + renderedH - Math.min(renderedH * 0.12, 16) - (slotRatio * Math.min(24, renderedH * 0.14)),
      scaleX: scale,
      scaleY: scale,
      originX: side,
      originY: "bottom",
      selectable: true,
      evented: true,
      id: `${asset.id}-${mode}-${slotIndex}`,
      renderedW,
      renderedH,
    };
  };

  const countsByZone = userAddedAssets.reduce((acc, asset, index) => {
    const zone = normalizeManualZone(asset.zone, index);
    acc[zone] = (acc[zone] || 0) + 1;
    return acc;
  }, {});
  const seenByZone = {};
  const manualObjects = userAddedAssets
    .map((asset, index) => {
      const zone = normalizeManualZone(asset.zone, index);
      const slotIndex = seenByZone[zone] || 0;
      seenByZone[zone] = slotIndex + 1;
      return makeManualDecor(asset, zone, slotIndex, countsByZone[zone], index, userAddedAssets.length);
    })
    .filter(Boolean);

  const placedRects = autoObjects.map((object) => placementRect(object));
  const manualPlaced = manualObjects.filter((object) => {
    const rectOverlaps = (rect) => placedRects.some((existing) => {
      const overlapW = Math.max(0, Math.min(existing.right, rect.right) - Math.max(existing.left, rect.left));
      const overlapH = Math.max(0, Math.min(existing.bottom, rect.bottom) - Math.max(existing.top, rect.top));
      const overlapArea = overlapW * overlapH;
      const rectArea = Math.max(1, (rect.right - rect.left) * (rect.bottom - rect.top));
      return overlapArea / rectArea > 0.28;
    });
    let rect = placementRect(object);
    const stepX = Math.max(18, Math.round((object.renderedW || 40) * 0.22));
    const stepY = Math.max(16, Math.round((object.renderedH || 40) * 0.18));
    let tries = 0;
    while (rectOverlaps(rect) && tries < 10) {
      if (object.originX === "left") object.left += stepX;
      else if (object.originX === "right") object.left -= stepX;
      else object.left += (tries % 2 === 0 ? stepX : -stepX);
      if (object.originY === "bottom") object.top -= Math.min(stepY, 26);
      else if (object.originY === "top") object.top += Math.min(stepY, 26);
      rect = placementRect(object);
      tries += 1;
    }
    placedRects.push(rect);
    return true;
  });

  return [...autoObjects, ...manualPlaced].map(({ renderedW, renderedH, ...object }) => object);
}

export function createInvitationFrameState(mode, analysis, config) {
  const { DIMS, PAD, createModeState } = config || {};
  if (!DIMS || !PAD || typeof createModeState !== "function") {
    throw new Error("Missing invitation frame config");
  }
  const bg = analysis.palette.backgroundBase;
  const textLayout = estimateInvitationTextLayoutSimple(mode, analysis, DIMS, PAD);
  return createModeState({
    objs: [
      ...createInvitationDecorationsFromExamples(mode, analysis, DIMS, PAD),
      ...textLayout.objects,
    ],
    bg,
    bgType: "solid",
    bg2: bg,
    gradAngle: 0,
  });
}

export { canvasToAsset, cropCanvasRegion };
