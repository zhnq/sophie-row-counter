/* Offline garter texture inside a continuous, non-dimensional scarf illustration. */
(function (root) {
  'use strict';
  function tint(hex, amount) {
    var rgb = [1,3,5].map(function(i){return parseInt(hex.slice(i, i + 2), 16);});
    var target = amount < 0 ? 0 : 255, strength = Math.abs(amount);
    return 'rgb(' + rgb.map(function(n){return Math.round(n + (target - n) * strength);}).join(',') + ')';
  }
  function trace(ctx, upper, lower) {
    ctx.beginPath();
    ctx.moveTo(upper[0].x, upper[0].y);
    upper.slice(1).forEach(function(p){ctx.lineTo(p.x, p.y);});
    lower.slice().reverse().forEach(function(p){ctx.lineTo(p.x, p.y);});
    ctx.closePath();
  }
  function clearFallback(canvas) {
    var previous = canvas.sophieFallback;
    if (!previous) return;
    if (previous.node.parentNode) previous.node.parentNode.removeChild(previous.node);
    canvas.style.display = previous.display;
    if (previous.label === null) canvas.removeAttribute('aria-hidden');
    else canvas.setAttribute('aria-hidden', previous.label);
    delete canvas.sophieFallback;
  }
  function fallback(canvas, plan) {
    // Reset the backing store so a failed redraw cannot show another scarf.
    canvas.width = 0; canvas.height = 0;
    canvas.setAttribute('data-rendered', 'fallback');
    canvas.removeAttribute('data-outline-kind');
    canvas.removeAttribute('data-schematic');
    var document = canvas.ownerDocument || root.document, parent = canvas.parentNode;
    if (!document || !parent) return false;
    var rect = canvas.getBoundingClientRect(), width = rect.width || 320, height = rect.height || 180;
    var node, outline;
    try { outline = root.SophieShape.illustration(root.SophieShape.build(plan)); } catch (ignored) {}
    if (outline) {
      var namespace = 'http://www.w3.org/2000/svg';
      node = document.createElementNS(namespace, 'svg');
      node.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      node.setAttribute('role', 'img');
      node.setAttribute('aria-label', canvas.getAttribute('aria-label') || '围巾形状示意');
      node.setAttribute('data-outline-kind', outline.kind);
      node.setAttribute('data-schematic', 'true');
      node.setAttribute('focusable', 'false');
      var color = root.SophiePattern.COLORS.filter(function(c){return c.key === plan.params.yarnColor;})[0];
      var yarn = (color || root.SophiePattern.COLORS[0]).hex, box = outline.extent;
      var scale = Math.max(.01, Math.min((width - 42) / Math.max(box.width, .1), (height - 46) / Math.max(box.height, .1)));
      var points = outline.upper.concat(outline.lower.slice().reverse());
      var path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', points.map(function(point, index) {
        return (index ? ' L' : 'M') + ((point.x - box.width / 2) * scale + width / 2).toFixed(4) +
          ' ' + ((point.y - (box.minY + box.maxY) / 2) * scale + height / 2 - 3).toFixed(4);
      }).join('') + ' Z');
      path.setAttribute('fill', yarn); path.setAttribute('stroke', tint(yarn, -.13));
      path.setAttribute('stroke-width', '.55'); path.setAttribute('stroke-linejoin', 'round');
      node.appendChild(path);
    } else {
      node = document.createElement('div'); node.textContent = '预览暂不可用';
      node.style.textAlign = 'center'; node.style.lineHeight = height + 'px';
    }
    node.setAttribute('data-preview-fallback', 'true');
    node.style.display = 'block'; node.style.width = '100%'; node.style.height = height + 'px';
    canvas.sophieFallback = {node:node, display:canvas.style.display, label:canvas.getAttribute('aria-hidden')};
    canvas.style.display = 'none'; canvas.setAttribute('aria-hidden', 'true');
    parent.insertBefore(node, canvas.nextSibling);
    return false;
  }
  function draw(canvas, plan) {
    clearFallback(canvas);
    var ctx;
    try { ctx = canvas.getContext('2d'); } catch (ignored) { return fallback(canvas, plan); }
    if (!ctx) return fallback(canvas, plan);
    var shape = root.SophieShape.build(plan), outline = root.SophieShape.illustration(shape), box = outline.extent;
    var color = root.SophiePattern.COLORS.filter(function(c){return c.key === plan.params.yarnColor;})[0];
    var yarn = (color || root.SophiePattern.COLORS[0]).hex;
    var width = canvas.getBoundingClientRect().width, height = canvas.getBoundingClientRect().height;
    if (!width || !height) return fallback(canvas, plan);
    var pixelRatio = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    // The illustration has a fixed presentation ratio; stored sample gauges do
    // not claim a physical size or silently alter the look of an old scarf.
    var scale = Math.min((width - 42) / Math.max(box.width, 0.1), (height - 46) / Math.max(box.height, 0.1));
    ctx.save(); ctx.translate(width / 2, height / 2 - 3); ctx.scale(scale, scale);
    ctx.translate(-box.width / 2, -(box.minY + box.maxY) / 2);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    trace(ctx, outline.upper, outline.lower);
    ctx.shadowColor = 'rgba(63,43,32,.22)'; ctx.shadowBlur = 9 * pixelRatio;
    ctx.shadowOffsetY = 5 * pixelRatio; ctx.fillStyle = yarn; ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.clip();
    var light = ctx.createLinearGradient(0, box.minY, 0, box.maxY);
    light.addColorStop(0, tint(yarn, .14)); light.addColorStop(.30, yarn);
    light.addColorStop(.78, tint(yarn, -.06)); light.addColorStop(1, tint(yarn, -.17));
    ctx.fillStyle = light; ctx.fillRect(0, box.minY, box.width, box.height);
    var rowStep = box.width / 256, stitchStep = .065;
    var stride = Math.max(2, Math.ceil(1.7 / (rowStep * scale)));
    var courseWidth = rowStep * stride, stitchHeight = Math.max(stitchStep, 2.1 / scale);
    var edgeWidth = Math.min(plan.params.slip * .035, .11);
    for (var i = 0; i < outline.rows.length; i += stride) {
      var row = outline.rows[i], x = row.x - courseWidth * .4;
      var border = Math.min(edgeWidth, row.width / 3);
      for (var y = row.upper + border + stitchHeight / 2; y < row.lower - border; y += stitchHeight) {
        var variation = Math.sin(i * .61 + y * 3.4) * .035;
        // Garter ridges: short curved bumps, rather than stockinette V stitches.
        ctx.beginPath(); ctx.moveTo(x - courseWidth * .32, y - stitchHeight * .30);
        ctx.bezierCurveTo(x + courseWidth * (.43 + variation), y - stitchHeight * .46,
          x + courseWidth * (.48 + variation), y + stitchHeight * .40, x - courseWidth * .29, y + stitchHeight * .30);
        ctx.strokeStyle = tint(yarn, -.27); ctx.lineWidth = Math.max(.75 / scale, courseWidth * .34); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - courseWidth * .34, y - stitchHeight * .35);
        ctx.bezierCurveTo(x + courseWidth * .34, y - stitchHeight * .43,
          x + courseWidth * .35, y + stitchHeight * .30, x - courseWidth * .31, y + stitchHeight * .25);
        ctx.strokeStyle = tint(yarn, .26 + variation); ctx.lineWidth = Math.max(.4 / scale, courseWidth * .16); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x - courseWidth * .10, y - stitchHeight * .22);
        ctx.lineTo(x + courseWidth * .20, y + stitchHeight * .14);
        ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = .25 / scale; ctx.stroke();
      }
    }
    // Tubular edges occupy the existing cloth width; no extra edge stitches are added.
    if (edgeWidth > 0) {
      [outline.upper, outline.lower].forEach(function(points, side){
        var direction = side ? -1 : 1;
        for (var strand = 0; strand < 3; strand++) {
          ctx.beginPath();
          points.forEach(function(point, n){
            var offset = edgeWidth * (.16 + strand * .27);
            var px = point.x, py = point.y + direction * offset;
            if (!n) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          });
          ctx.strokeStyle = strand === 1 ? tint(yarn, .20) : tint(yarn, -.17);
          ctx.lineWidth = Math.max(.6 / scale, edgeWidth * .22); ctx.stroke();
        }
        for (var n = 0; n < outline.rows.length; n += stride) {
          var point = outline.rows[n], by = side ? point.lower : point.upper;
          var inside = Math.min(edgeWidth, point.width / 3);
          ctx.beginPath();
          ctx.ellipse(point.x - courseWidth * .4, by + direction * inside * .47,
            courseWidth * .26, Math.max(inside * .20, .25 / scale), -.35, 0, Math.PI * 2);
          ctx.strokeStyle = tint(yarn, .28); ctx.lineWidth = .35 / scale; ctx.stroke();
        }
      });
    }
    ctx.restore();
    trace(ctx, outline.upper, outline.lower);
    ctx.strokeStyle = tint(yarn, -.13); ctx.lineWidth = .55 / scale; ctx.stroke();
    ctx.restore();
    canvas.setAttribute('data-rendered', 'true');
    canvas.setAttribute('data-outline-kind', outline.kind);
    canvas.setAttribute('data-schematic', 'true');
    return shape;
  }
  function shapingMarkers(plan, width, height) {
    var outline = root.SophieShape.illustration(plan), box = outline.extent;
    var scale = Math.max(.01, Math.min((width - 42) / Math.max(box.width,.1), (height - 46) / Math.max(box.height,.1)));
    return root.SophieShape.shapingMarkers(plan, outline).map(function(point) {
      return Object.assign({}, point, {
        x:(point.x - box.width / 2) * scale + width / 2,
        y:(point.y - (box.minY + box.maxY) / 2) * scale + height / 2 - 3
      });
    });
  }
  function increaseMarkers(plan, width, height) {
    return shapingMarkers(plan, width, height).filter(function(point) { return point.delta > 0; });
  }
  root.SophiePreview = {draw:draw, shapingMarkers:shapingMarkers, increaseMarkers:increaseMarkers};
})(this);
