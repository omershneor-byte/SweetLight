function clampNum(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeRect(rect = {}) {
  const width = Math.max(
    1,
    Number.isFinite(rect.width) ? rect.width : ((rect.right ?? 0) - (rect.left ?? 0)),
  );
  const height = Math.max(
    1,
    Number.isFinite(rect.height) ? rect.height : ((rect.bottom ?? 0) - (rect.top ?? 0)),
  );
  const left = Number.isFinite(rect.left) ? rect.left : ((rect.centerX ?? 0) - (width / 2));
  const top = Number.isFinite(rect.top) ? rect.top : ((rect.centerY ?? 0) - (height / 2));
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    centerX: left + (width / 2),
    centerY: top + (height / 2),
  };
}

function expandRect(rect, padX, padY = padX) {
  const normalized = normalizeRect(rect);
  return normalizeRect({
    left: normalized.left - padX,
    top: normalized.top - padY,
    width: normalized.width + (padX * 2),
    height: normalized.height + (padY * 2),
  });
}

function unionRects(rects = []) {
  const normalized = rects.map((rect) => normalizeRect(rect)).filter(Boolean);
  if (!normalized.length) return null;
  const left = Math.min(...normalized.map((rect) => rect.left));
  const top = Math.min(...normalized.map((rect) => rect.top));
  const right = Math.max(...normalized.map((rect) => rect.right));
  const bottom = Math.max(...normalized.map((rect) => rect.bottom));
  return normalizeRect({ left, top, width: right - left, height: bottom - top });
}

function rectIntersectionArea(leftRect, rightRect) {
  const a = normalizeRect(leftRect);
  const b = normalizeRect(rightRect);
  const overlapW = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const overlapH = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlapW * overlapH;
}

function overlapRatio(candidateRect, existingRect) {
  const candidate = normalizeRect(candidateRect);
  const overlapArea = rectIntersectionArea(candidate, existingRect);
  const candidateArea = Math.max(1, candidate.width * candidate.height);
  return overlapArea / candidateArea;
}

function fitSizeIntoBounds(item, maxWidth, maxHeight, scaleCap = 1.22) {
  const width = Math.max(1, item?.width || 1);
  const height = Math.max(1, item?.height || 1);
  const scale = Math.min(
    maxWidth / width,
    maxHeight / height,
    scaleCap,
  );
  return {
    scale,
    renderedW: Math.max(1, width * scale),
    renderedH: Math.max(1, height * scale),
  };
}

function fitDecorSize(item, maxWidth, maxHeight, targetArea, scaleCap = 4) {
  const width = Math.max(1, item?.width || 1);
  const height = Math.max(1, item?.height || 1);
  const boundsScale = Math.min(
    maxWidth / width,
    maxHeight / height,
    Number.isFinite(scaleCap) ? scaleCap : Infinity,
  );
  const areaScale = targetArea > 0
    ? Math.sqrt(targetArea / Math.max(1, width * height))
    : boundsScale;
  const scale = Math.max(0.0001, Math.min(boundsScale, areaScale, Number.isFinite(scaleCap) ? scaleCap : Infinity));
  return {
    scale,
    renderedW: Math.max(1, width * scale),
    renderedH: Math.max(1, height * scale),
  };
}

function placementToRect(placement) {
  const width = Math.max(1, placement.renderedW || placement.width || 1);
  const height = Math.max(1, placement.renderedH || placement.height || 1);
  const originX = placement.originX || "center";
  const originY = placement.originY || "center";
  const left = originX === "left"
    ? placement.left
    : (originX === "right" ? placement.left - width : placement.left - (width / 2));
  const top = originY === "top"
    ? placement.top
    : (originY === "bottom" ? placement.top - height : placement.top - (height / 2));
  return normalizeRect({ left, top, width, height });
}

function normalizeZone(zone = "") {
  return String(zone || "").trim().toLowerCase();
}

function inferSideFromZone(zone = "") {
  const normalized = normalizeZone(zone);
  if (normalized.includes("left")) return "left";
  if (normalized.includes("right")) return "right";
  return null;
}

function getDecorationTraits(item, canvasArea) {
  const width = Math.max(1, item?.width || 1);
  const height = Math.max(1, item?.height || 1);
  const area = width * height;
  const areaRatio = area / Math.max(1, canvasArea);
  const aspect = width / Math.max(1, height);
  return {
    width,
    height,
    area,
    areaRatio,
    aspect,
    isWide: aspect >= 2.55,
    isTall: aspect <= 0.78,
    isCompact: aspect > 0.78 && aspect < 2.55,
    isSmall: areaRatio < 0.02,
    isTiny: areaRatio < 0.008,
  };
}

export function getClassicFrameRegions(dims, pad) {
  const photo = normalizeRect({
    left: pad.l,
    top: pad.t,
    width: Math.max(1, dims.w - pad.l - pad.r),
    height: Math.max(1, dims.h - pad.t - pad.b),
  });
  return {
    canvas: normalizeRect({ left: 0, top: 0, width: dims.w, height: dims.h }),
    photo,
    bottomBand: normalizeRect({
      left: 0,
      top: photo.bottom,
      width: dims.w,
      height: Math.max(1, pad.b),
    }),
    topStrip: normalizeRect({
      left: 0,
      top: 0,
      width: dims.w,
      height: Math.max(1, photo.top),
    }),
  };
}

function buildTextRect(placement) {
  return normalizeRect({
    left: placement.left - (placement.width / 2),
    top: placement.top - (placement.height / 2),
    width: placement.width,
    height: placement.height,
  });
}

export function buildClassicTextLayout({ mode, dims, pad, texts = [] }) {
  const regions = getClassicFrameRegions(dims, pad);
  const ordered = [...texts]
    .filter((item) => item && item.width > 0 && item.height > 0)
    .sort((left, right) => {
      if (!!left.isDateLike !== !!right.isDateLike) return left.isDateLike ? 1 : -1;
      return (left.order ?? 0) - (right.order ?? 0);
    });
  const nonDates = ordered.filter((item) => !item.isDateLike);
  const dates = ordered.filter((item) => !!item.isDateLike);
  let centerStack = [];
  if (ordered.length <= 3) {
    centerStack = [...ordered];
  } else {
    centerStack = [...nonDates.slice(0, 2), ...dates.slice(0, 1)].slice(0, 3);
    if (!centerStack.length) {
      centerStack = ordered.slice(0, 3);
    }
  }
  const centerIds = new Set(centerStack.map((item) => item.id));
  const extras = ordered.filter((item) => !centerIds.has(item.id));
  const placements = [];
  const occupiedRects = [];
  const getGap = (current, next) => {
    const baseGap = Math.min(current?.height || 0, next?.height || 0);
    if (current?.isDateLike || next?.isDateLike) {
      return clampNum(baseGap * (mode === "portrait" ? 0.11 : 0.1), 4, 9);
    }
    return clampNum(baseGap * (mode === "portrait" ? 0.13 : 0.12), 6, 12);
  };

  if (centerStack.length) {
    const stackHeight = centerStack.reduce((sum, item, index) => (
      sum + item.height + (index > 0 ? getGap(centerStack[index - 1], item) : 0)
    ), 0);
    const preferredTop = regions.bottomBand.top
      + clampNum(regions.bottomBand.height * (mode === "portrait" ? 0.16 : 0.18), 16, 28);
    const bottomPadding = clampNum(regions.bottomBand.height * (mode === "portrait" ? 0.14 : 0.15), 14, 24);
    const minCursorY = regions.bottomBand.top + 8;
    const maxCursorY = Math.max(minCursorY, dims.h - bottomPadding - stackHeight);
    let cursorY = clampNum(preferredTop, minCursorY, maxCursorY);
    centerStack.forEach((item, index) => {
      const placement = {
        id: item.id,
        left: dims.w / 2,
        top: cursorY + (item.height / 2),
        width: item.width,
        height: item.height,
        originX: "center",
        originY: "center",
      };
      placements.push(placement);
      occupiedRects.push(buildTextRect(placement));
      cursorY += item.height + (centerStack[index + 1] ? getGap(item, centerStack[index + 1]) : 0);
    });
  }

  const centeredTextRects = placements.map((placement) => buildTextRect(placement));
  const rawBand = unionRects(centeredTextRects);
  const textBand = rawBand
    ? expandRect(
      rawBand,
      mode === "portrait" ? 54 : 48,
      mode === "portrait" ? 18 : 14,
    )
    : null;

  let topCursorY = Math.max(18, regions.photo.top * (mode === "portrait" ? 0.42 : 0.5));
  let leftCursorY = regions.bottomBand.top + Math.max(12, regions.bottomBand.height * 0.16);
  let rightCursorY = leftCursorY;
  let extraSideToggle = 0;
  const sideGap = Math.max(7, regions.bottomBand.height * 0.038);

  extras.forEach((item) => {
    const canUseTop = (topCursorY + item.height) <= Math.max(item.height + 8, regions.photo.top - 12);
    if (canUseTop) {
      const placement = {
        id: item.id,
        left: dims.w / 2,
        top: topCursorY + (item.height / 2),
        width: item.width,
        height: item.height,
        originX: "center",
        originY: "center",
      };
      placements.push(placement);
      occupiedRects.push(buildTextRect(placement));
      topCursorY += item.height + Math.max(8, sideGap);
      return;
    }

    const side = item.preferredSide || (extraSideToggle % 2 === 0 ? "left" : "right");
    const bandMargin = mode === "portrait" ? 26 : 24;
    const x = side === "left"
      ? clampNum(
        (textBand ? textBand.left - bandMargin - (item.width / 2) : (dims.w * 0.24)),
        (item.width / 2) + 18,
        (dims.w / 2) - (item.width / 2) - 20,
      )
      : clampNum(
        (textBand ? textBand.right + bandMargin + (item.width / 2) : (dims.w * 0.76)),
        (dims.w / 2) + (item.width / 2) + 20,
        dims.w - (item.width / 2) - 18,
      );
    const y = side === "left" ? leftCursorY + (item.height / 2) : rightCursorY + (item.height / 2);
    const placement = {
      id: item.id,
      left: x,
      top: clampNum(y, (item.height / 2) + 8, dims.h - (item.height / 2) - 8),
      width: item.width,
      height: item.height,
      originX: "center",
      originY: "center",
    };
    placements.push(placement);
    occupiedRects.push(buildTextRect(placement));
    if (side === "left") leftCursorY += item.height + sideGap;
    else rightCursorY += item.height + sideGap;
    extraSideToggle += 1;
  });

  return {
    placements,
    textBand,
    occupiedRects,
  };
}

function placeTopBanner(item, mode, dims, pad, regions) {
  const size = fitDecorSize(
    item,
    dims.w * 0.92,
    Math.max(pad.t * 1.9, regions.photo.height * (mode === "portrait" ? 0.12 : 0.11)),
    regions.photo.width * regions.photo.height * 0.02,
    3.4,
  );
  const allowedInside = size.renderedH * 0.1;
  return {
    id: item.id,
    left: dims.w / 2,
    top: Math.max(
      -Math.min(pad.t * 0.38, size.renderedH * 0.14),
      regions.photo.top - size.renderedH + allowedInside,
    ),
    originX: "center",
    originY: "top",
    renderedW: size.renderedW,
    renderedH: size.renderedH,
    scale: size.scale,
  };
}

function placeBottomAnchor(item, side, mode, dims, pad, regions, textBand, strength = "primary") {
  const photoArea = regions.photo.width * regions.photo.height;
  const traits = getDecorationTraits(item, photoArea);
  const isPrimary = strength === "primary";
  const isWide = traits.aspect >= 1.45;
  const isTall = traits.aspect <= 0.82;
  const maxWidthRatio = isPrimary
    ? (isWide ? (mode === "portrait" ? 0.205 : 0.225) : (mode === "portrait" ? 0.17 : 0.19))
    : (isWide ? (mode === "portrait" ? 0.145 : 0.165) : (mode === "portrait" ? 0.12 : 0.138));
  const maxHeightRatio = isPrimary
    ? (isTall ? (mode === "portrait" ? 0.56 : 0.6) : (mode === "portrait" ? 0.5 : 0.54))
    : (isTall ? (mode === "portrait" ? 0.4 : 0.42) : (mode === "portrait" ? 0.34 : 0.36));
  let size = fitDecorSize(
    item,
    dims.w * maxWidthRatio,
    pad.b * maxHeightRatio,
    photoArea * (
      isPrimary
        ? (isWide
          ? (mode === "portrait" ? 0.018 : 0.024)
          : (isTall ? (mode === "portrait" ? 0.013 : 0.0165) : (mode === "portrait" ? 0.0145 : 0.0195)))
        : (isWide
          ? (mode === "portrait" ? 0.0105 : 0.0135)
          : (isTall ? (mode === "portrait" ? 0.0075 : 0.009) : (mode === "portrait" ? 0.0085 : 0.0105)))
    ),
    isPrimary ? 4 : 3.2,
  );
  if (textBand) {
    const safetyGap = mode === "portrait" ? 64 : 56;
    const availableWidth = side === "left"
      ? Math.max(44, textBand.left - safetyGap)
      : Math.max(44, dims.w - textBand.right - safetyGap);
    if (size.renderedW > availableWidth) {
      const ratio = availableWidth / Math.max(1, size.renderedW);
      size = {
        scale: size.scale * ratio,
        renderedW: size.renderedW * ratio,
        renderedH: size.renderedH * ratio,
      };
    }
  }
  const spillX = Math.min(size.renderedW * (isPrimary ? 0.18 : 0.14), mode === "portrait" ? 44 : 38);
  const allowedInside = clampNum(
    Math.min(
      size.renderedH * (isPrimary ? 0.09 : 0.075),
      regions.photo.height * (isPrimary ? 0.07 : 0.055),
    ),
    10,
    mode === "portrait" ? 24 : 20,
  );
  return {
    id: item.id,
    left: side === "left" ? -spillX : dims.w + spillX,
    top: regions.photo.bottom + size.renderedH - allowedInside,
    originX: side,
    originY: "bottom",
    renderedW: size.renderedW,
    renderedH: size.renderedH,
    scale: size.scale,
  };
}

function placeTopCorner(item, side, mode, dims, pad, regions) {
  const photoArea = regions.photo.width * regions.photo.height;
  const traits = getDecorationTraits(item, photoArea);
  const isWide = traits.aspect >= 1.5;
  const size = fitDecorSize(
    item,
    dims.w * (isWide ? (mode === "portrait" ? 0.205 : 0.22) : (mode === "portrait" ? 0.165 : 0.175)),
    Math.max(
      pad.t * (isWide ? 1.45 : 1.7),
      regions.photo.height * (isWide ? (mode === "portrait" ? 0.11 : 0.12) : (mode === "portrait" ? 0.15 : 0.17)),
    ),
    photoArea * (isWide ? (mode === "portrait" ? 0.012 : 0.015) : (mode === "portrait" ? 0.0135 : 0.017)),
    4,
  );
  const spillX = Math.min(size.renderedW * 0.16, 34);
  const allowedInside = clampNum(
    Math.min(size.renderedH * 0.1, regions.photo.height * 0.08),
    8,
    mode === "portrait" ? 22 : 18,
  );
  return {
    id: item.id,
    left: side === "left" ? -spillX : dims.w + spillX,
    top: Math.max(
      -Math.min(pad.t * 0.34, size.renderedH * 0.12),
      regions.photo.top - size.renderedH + allowedInside,
    ),
    originX: side,
    originY: "top",
    renderedW: size.renderedW,
    renderedH: size.renderedH,
    scale: size.scale,
  };
}

function placeSideAccent(item, side, mode, dims, pad, regions) {
  const photoArea = regions.photo.width * regions.photo.height;
  const traits = getDecorationTraits(item, photoArea);
  const isTall = traits.aspect <= 0.82 || ((item.height / Math.max(1, item.width)) > 1.18);
  const size = fitDecorSize(
    item,
    dims.w * (isTall ? (mode === "portrait" ? 0.1 : 0.11) : (mode === "portrait" ? 0.09 : 0.095)),
    Math.max(
      pad.b * (isTall ? 0.55 : 0.42),
      regions.photo.height * (isTall ? 0.13 : 0.1),
    ),
    photoArea * (isTall ? (mode === "portrait" ? 0.008 : 0.0095) : (mode === "portrait" ? 0.0055 : 0.0065)),
    isTall ? 3.1 : 2.8,
  );
  const spillX = Math.min(size.renderedW * 0.16, 32);
  const allowedInside = clampNum(
    Math.min(
      size.renderedH * (isTall ? 0.08 : 0.06),
      regions.photo.height * (isTall ? 0.06 : 0.045),
    ),
    8,
    mode === "portrait" ? 18 : 16,
  );
  if (isTall) {
    return {
      id: item.id,
      left: side === "left" ? -spillX : dims.w + spillX,
      top: regions.photo.bottom + size.renderedH - allowedInside,
      originX: side,
      originY: "bottom",
      renderedW: size.renderedW,
      renderedH: size.renderedH,
      scale: size.scale,
    };
  }
  return {
    id: item.id,
    left: side === "left" ? -spillX : dims.w + spillX,
    top: regions.photo.bottom + size.renderedH - allowedInside - Math.min(size.renderedH * 0.12, 10),
    originX: side,
    originY: "bottom",
    renderedW: size.renderedW,
    renderedH: size.renderedH,
    scale: size.scale,
  };
}

function placeCenterMotif(item, mode, dims, pad, textBand, textPlacements = []) {
  const size = fitDecorSize(
    item,
    dims.w * 0.082,
    pad.b * 0.18,
    dims.w * dims.h * 0.0026,
    2,
  );
  let centerY = dims.h - (pad.b * 0.5);
  if (textPlacements.length >= 2) {
    centerY = (textPlacements[0].top + textPlacements[1].top) / 2;
  } else if (textBand) {
    centerY = (textBand.top + textBand.bottom) / 2;
  }
  return {
    id: item.id,
    left: dims.w / 2,
    top: centerY,
    originX: "center",
    originY: "center",
    renderedW: size.renderedW,
    renderedH: size.renderedH,
    scale: size.scale,
  };
}

function scoreDecorItemForSlot(item, slot, canvasArea) {
  const normalizedZone = normalizeZone(item.preferredZone);
  const sidePreference = inferSideFromZone(normalizedZone) || item.preferredSide || null;
  const sameSide = sidePreference && slot.side ? sidePreference === slot.side : false;
  const sideConflict = sidePreference && slot.side ? sidePreference !== slot.side : false;
  const isCenterPreferred = normalizedZone === "centerpiece";
  const isTopPreferred = normalizedZone === "top";
  const isTopCornerPreferred = normalizedZone === `top-${slot.side}`;
  const isBottomPreferred = normalizedZone === `bottom-${slot.side}`;
  const isSidePreferred = normalizedZone === slot.side;
  const traits = getDecorationTraits(item, canvasArea);
  let score = 0;

  switch (slot.kind) {
    case "top-banner":
      score += traits.isWide ? 95 : -90;
      score += isTopPreferred ? 28 : 0;
      score += sidePreference ? -4 : 6;
      score += traits.isTall ? -24 : 0;
      break;
    case "bottom-primary":
      score += 42;
      score += sameSide ? 34 : (sideConflict ? -16 : 10);
      score += isBottomPreferred ? 24 : 0;
      score += traits.isWide ? -8 : 0;
      score += traits.isTiny ? -40 : (traits.isSmall ? 12 : 24);
      score += traits.isCompact ? 16 : 0;
      score += traits.isTall ? 8 : 0;
      break;
    case "top-corner":
      score += 18;
      score += sameSide ? 26 : (sideConflict ? -14 : 8);
      score += isTopCornerPreferred ? 26 : 0;
      score += isTopPreferred ? 10 : 0;
      score += traits.isWide ? -14 : 0;
      score += traits.isCompact ? 16 : 0;
      score += traits.isTall ? 10 : 0;
      score += traits.isTiny ? -12 : 0;
      break;
    case "side-accent":
      score += 10;
      score += sameSide ? 24 : (sideConflict ? -18 : 2);
      score += isSidePreferred ? 30 : 0;
      score += traits.isTall ? 36 : 0;
      score += traits.isWide ? -36 : 0;
      score += traits.isCompact ? -4 : 0;
      break;
    case "bottom-support":
      score += 14;
      score += sameSide ? 24 : (sideConflict ? -12 : 8);
      score += isBottomPreferred ? 18 : 0;
      score += traits.isWide ? -8 : 0;
      score += traits.isCompact ? 18 : 0;
      score += traits.isSmall ? 18 : 8;
      break;
    case "center-motif":
      score += isCenterPreferred ? 72 : 0;
      score += traits.isCompact ? 24 : 0;
      score += traits.isSmall ? 22 : 8;
      score += traits.isWide ? -18 : 0;
      score += traits.isTall ? -16 : 0;
      if (!isCenterPreferred) score -= 14;
      if (sameSide || sideConflict) score -= 4;
      break;
    default:
      break;
  }

  if (item.isManual && normalizedZone) score += 10;
  return score;
}

function canPlaceDecoration(rect, occupiedRects, textBand, kind) {
  const textThreshold = kind === "center-motif"
    ? 0.01
    : (kind === "bottom-primary" || kind === "bottom-support" ? 0.025 : 0.035);
  if (textBand && overlapRatio(rect, textBand) > textThreshold) return false;
  const occupiedThreshold = kind === "center-motif" ? 0.12 : 0.16;
  return !occupiedRects.some((existing) => overlapRatio(rect, existing) > occupiedThreshold);
}

export function inferClassicDecorationZone(rect, dims, pad) {
  const normalized = normalizeRect(rect);
  const regions = getClassicFrameRegions(dims, pad);
  const aspect = normalized.width / Math.max(1, normalized.height);
  const side = normalized.centerX <= dims.w / 2 ? "left" : "right";
  if (aspect > 2.6 && normalized.top < regions.photo.top + (regions.photo.height * 0.18)) return "top";
  if (normalized.bottom >= regions.bottomBand.top - (normalized.height * 0.14)) return `bottom-${side}`;
  if (normalized.top <= regions.photo.top + (regions.photo.height * 0.2)) return `top-${side}`;
  if (aspect < 0.78) return side;
  return `bottom-${side}`;
}

export function planClassicDecorationLayout({
  mode,
  dims,
  pad,
  textBand = null,
  occupiedRects = [],
  textPlacements = [],
  decorations = [],
}) {
  const regions = getClassicFrameRegions(dims, pad);
  const canvasArea = Math.max(1, dims.w * dims.h);
  const items = decorations
    .filter((item) => item && item.width > 0 && item.height > 0)
    .map((item, index) => ({
      ...item,
      importance: Number.isFinite(item.importance) ? item.importance : (item.width * item.height),
      order: item.order ?? index,
    }));
  const slots = [
    { name: "top-banner", kind: "top-banner", minScore: 34, place: (item) => placeTopBanner(item, mode, dims, pad, regions) },
    { name: "bottom-left-primary", kind: "bottom-primary", side: "left", minScore: 24, place: (item) => placeBottomAnchor(item, "left", mode, dims, pad, regions, textBand, "primary") },
    { name: "bottom-right-primary", kind: "bottom-primary", side: "right", minScore: 24, place: (item) => placeBottomAnchor(item, "right", mode, dims, pad, regions, textBand, "primary") },
    { name: "center-motif", kind: "center-motif", minScore: 28, place: (item) => placeCenterMotif(item, mode, dims, pad, textBand, textPlacements) },
    { name: "top-left-accent", kind: "top-corner", side: "left", minScore: 12, place: (item) => placeTopCorner(item, "left", mode, dims, pad, regions) },
    { name: "top-right-accent", kind: "top-corner", side: "right", minScore: 12, place: (item) => placeTopCorner(item, "right", mode, dims, pad, regions) },
    { name: "left-side-accent", kind: "side-accent", side: "left", minScore: 22, place: (item) => placeSideAccent(item, "left", mode, dims, pad, regions) },
    { name: "right-side-accent", kind: "side-accent", side: "right", minScore: 22, place: (item) => placeSideAccent(item, "right", mode, dims, pad, regions) },
    { name: "bottom-left-support", kind: "bottom-support", side: "left", minScore: 12, place: (item) => placeBottomAnchor(item, "left", mode, dims, pad, regions, textBand, "support") },
    { name: "bottom-right-support", kind: "bottom-support", side: "right", minScore: 12, place: (item) => placeBottomAnchor(item, "right", mode, dims, pad, regions, textBand, "support") },
  ];

  const usedIds = new Set();
  const placements = [];
  const reservedRects = [...(occupiedRects || [])].map((rect) => normalizeRect(rect));

  slots.forEach((slot) => {
    const candidates = items
      .filter((item) => !usedIds.has(item.id))
      .map((item) => ({
        item,
        score: scoreDecorItemForSlot(item, slot, canvasArea),
      }))
      .filter(({ score }) => score >= slot.minScore)
      .sort((left, right) => (
        right.score - left.score
        || right.item.importance - left.item.importance
        || left.item.order - right.item.order
      ));

    for (const candidate of candidates) {
      const placement = slot.place(candidate.item);
      if (!placement) continue;
      const rect = placementToRect(placement);
      if (!canPlaceDecoration(rect, reservedRects, textBand, slot.kind)) continue;
      placements.push({
        ...placement,
        slot: slot.name,
        preferredZone: candidate.item.preferredZone || null,
      });
      reservedRects.push(rect);
      usedIds.add(candidate.item.id);
      break;
    }
  });

  return {
    placements,
    usedIds,
  };
}
