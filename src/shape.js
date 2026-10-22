/* Estimated outline from the actual row plan, independent of counting parameters. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SophieShape = api;
})(this, function () {
  'use strict';
  function number(value, label, min, max) {
    if ((typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value)) ||
        Number(value) < min || Number(value) > max) throw new Error(label + '无法用于形状预览');
    return Number(value);
  }
  function build(plan) {
    if (!plan || !plan.params || !Array.isArray(plan.rows) || !plan.rows.length) throw new Error('计数表无法用于形状预览');
    var params = plan.params;
    var initial = number(params.mode === 'decrease' ? params.max : params.start, '起始针数', 1, 10000);
    var gaugeRows = number(params.gaugeRows, '行密度', 0, 200);
    if (!gaugeRows) throw new Error('行密度无法用于形状预览');
    var gaugeStitches = number(params.gaugeStitches === undefined ? 22 : params.gaugeStitches, '针密度', 0, 100);
    if (!gaugeStitches) throw new Error('针密度无法用于形状预览');
    var rowScale = 10 / gaugeRows, stitchScale = 10 / gaugeStitches;
    var upperY = -initial / 2, lowerY = initial / 2, x = 0, previousId = 0;
    var minY = upperY, maxY = lowerY;
    var rows = [], upper = [], lower = [], events = [], phases = [], bindoff = [];
    var counts = {increaseRows:0, decreaseRows:0, plainRows:0, bindoffRows:0,
      increaseStitches:0, decreaseStitches:0, edge0Increase:0, edge1Increase:0, edge0Decrease:0, edge1Decrease:0};
    function boundary(id, phase) {
      var width = lowerY - upperY, center = (upperY + lowerY) / 2;
      return {id:id, x:x, upper:upperY, lower:lowerY, width:width, center:center, phase:phase,
        cm:{x:x * rowScale, upper:upperY * stitchScale, lower:lowerY * stitchScale,
          width:width * stitchScale, center:center * stitchScale}};
    }
    function point(y, id) { return {x:x, y:y, rowId:id}; }
    function centimeterPoint(p) { return {x:p.x * rowScale, y:p.y * stitchScale, rowId:p.rowId}; }
    var start = boundary(0, '起针');
    var widest = {stitches:initial, rowId:0, x:0, upper:upperY, lower:lowerY, center:0,
      cm:{x:0, upper:upperY * stitchScale, lower:lowerY * stitchScale, width:initial * stitchScale, center:0}};
    upper.push(point(upperY, 0)); lower.push(point(lowerY, 0));
    plan.rows.forEach(function (row) {
      var id = number(row.id, '行号', 1, 100000);
      if (!Number.isInteger(id) || id <= previousId) throw new Error('行号顺序无法用于形状预览');
      previousId = id;
      var phase = String(row.phase || '');
      var isBindoff = phase === '收针' || (Array.isArray(row.segments) && row.segments.some(function (segment) { return segment.kind === 'bindoff'; }));
      if (number(row.before, '织前针数', 1, 10000) !== lowerY - upperY) throw new Error('计数表针数与形状不一致');
      var currentPhase = phases[phases.length - 1];
      if (!currentPhase || currentPhase.name !== phase) {
        currentPhase = {name:phase, startRow:id, endRow:id, startX:x, endX:x, rowCount:0,
          cm:{startX:x * rowScale, endX:x * rowScale}};
        phases.push(currentPhase);
      }
      currentPhase.endRow = id;
      if (isBindoff) {
        counts.bindoffRows++;
        bindoff.push(boundary(id, phase));
        return;
      }
      var delta = number(row.delta, '变针数', -10000, 10000);
      if (!Number.isInteger(delta)) throw new Error('变针数无法用于形状预览');
      var edge = row.fabricEdge, oldUpper = upperY, oldLower = lowerY;
      if (delta) {
        if (edge !== 0 && edge !== 1) throw new Error('变针位置无法用于形状预览');
        if (edge === 0) upperY -= delta;
        else lowerY += delta;
      }
      var width = lowerY - upperY;
      if (width <= 0 || number(row.stitches, '织后针数', 1, 10000) !== width) throw new Error('计数表针数与形状不一致');
      x++;
      var current = boundary(id, phase);
      current.index = x; current.local = row.local; current.delta = delta; current.fabricEdge = delta ? edge : null;
      rows.push(current); upper.push(point(upperY, id)); lower.push(point(lowerY, id));
      currentPhase.rowCount++; currentPhase.endX = x; currentPhase.cm.endX = x * rowScale;
      minY = Math.min(minY, upperY); maxY = Math.max(maxY, lowerY);
      if (width > widest.stitches) widest = {stitches:width, rowId:id, x:x, upper:upperY, lower:lowerY, center:current.center,
        cm:{x:current.cm.x, upper:current.cm.upper, lower:current.cm.lower, width:current.cm.width, center:current.cm.center}};
      if (delta) {
        var y = edge === 0 ? upperY : lowerY;
        events.push({rowId:id, index:x, x:x, y:y, delta:delta, fabricEdge:edge, phase:phase,
          before:{upper:oldUpper, lower:oldLower, width:oldLower - oldUpper},
          after:{upper:upperY, lower:lowerY, width:width}, cm:{x:x * rowScale, y:y * stitchScale}});
        if (delta > 0) { counts.increaseRows++; counts.increaseStitches += delta; counts[edge === 0 ? 'edge0Increase' : 'edge1Increase'] += delta; }
        else { counts.decreaseRows++; counts.decreaseStitches -= delta; counts[edge === 0 ? 'edge0Decrease' : 'edge1Decrease'] -= delta; }
      } else counts.plainRows++;
    });
    var end = rows.length ? boundary(rows[rows.length - 1].id, rows[rows.length - 1].phase) : boundary(0, '起针');
    var extent = {minX:0, maxX:x, minY:minY, maxY:maxY, width:x, height:maxY - minY};
    var cmExtent = {minX:0, maxX:x * rowScale, minY:minY * stitchScale, maxY:maxY * stitchScale,
      width:x * rowScale, height:(maxY - minY) * stitchScale};
    return {rows:rows, upper:upper, lower:lower, events:events, phases:phases, start:start, end:end,
      bindoff:bindoff, extent:extent, rowCount:x, widest:widest, counts:counts,
      gauge:{rowsPer10cm:gaugeRows, stitchesPer10cm:gaugeStitches, cmPerRow:rowScale, cmPerStitch:stitchScale},
      cm:{upper:upper.map(centimeterPoint), lower:lower.map(centimeterPoint), extent:cmExtent,
        length:x * rowScale, width:widest.stitches * stitchScale, height:cmExtent.height, estimated:true}};
  }
  // Knitted fabric relaxes between shaping rows. This presentation layer joins
  // successive changes on the same fabric edge without changing the row plan.
  // A direction/phase change, the first change, and the final change stay fixed,
  // so the tip width, widest waiting rows, and any displaced tail remain visible.
  function display(input) {
    var shape = input && input.params ? build(input) : input;
    if (!shape || !Array.isArray(shape.upper) || !Array.isArray(shape.lower) ||
        !Array.isArray(shape.rows) || !Array.isArray(shape.events) || !shape.gauge ||
        shape.upper.length !== shape.rows.length + 1 || shape.lower.length !== shape.upper.length)
      throw new Error('围巾轮廓无法用于形状预览');
    function clonePoint(p) { return {x:p.x, y:p.y, rowId:p.rowId}; }
    var upper = shape.upper.map(clonePoint), lower = shape.lower.map(clonePoint);
    var previous = [null, null], run = 0, lastSign = 0, lastPhase = null;
    shape.events.forEach(function(event) {
      var sign = event.delta > 0 ? 1 : -1;
      if (sign !== lastSign || event.phase !== lastPhase) run++;
      lastSign = sign; lastPhase = event.phase;
      var edge = event.fabricEdge, earlier = previous[edge], points = edge === 0 ? upper : lower;
      if (earlier && earlier.run === run) {
        var span = event.x - earlier.x;
        for (var index = earlier.x + 1; index < event.x; index++) {
          points[index].y = earlier.y + (event.y - earlier.y) * (index - earlier.x) / span;
        }
      }
      previous[edge] = {x:event.x, y:event.y, run:run};
    });
    var stitchScale = shape.gauge.cmPerStitch, rowScale = shape.gauge.cmPerRow;
    function cmPoint(p) { return {x:p.x * rowScale, y:p.y * stitchScale, rowId:p.rowId}; }
    var rows = shape.rows.map(function(row, index) {
      var high = upper[index + 1].y, low = lower[index + 1].y;
      return Object.assign({}, row, {upper:high, lower:low, width:low - high, center:(high + low) / 2,
        cm:Object.assign({}, row.cm, {upper:high * stitchScale, lower:low * stitchScale,
          width:(low - high) * stitchScale, center:(high + low) * stitchScale / 2})});
    });
    return {upper:upper, lower:lower, rows:rows, extent:Object.assign({},shape.extent),
      cm:Object.assign({},shape.cm,{upper:upper.map(cmPoint), lower:lower.map(cmPoint),
        extent:Object.assign({},shape.cm.extent)}), estimated:true};
  }
  // A scarf illustration explains the overall shaping, rather than predicting
  // physical dimensions. A monotonic width emphasis and short rounded tips make
  // shaping legible; exact stitch counts and row events stay separate from this
  // presentation so it cannot change counting or stored work.
  function illustration(input) {
    var shape = input && input.params ? build(input) : input;
    if (!shape || !Array.isArray(shape.events) || !Array.isArray(shape.rows) ||
        !shape.rows.length || !shape.start || !shape.end || !shape.widest || !shape.rowCount)
      throw new Error('围巾轮廓无法用于形状示意');
    var maximum = shape.widest.stitches;
    var presentationRatio = 4.2;
    function width(value) { var ratio = value / maximum; return ratio * ratio; }
    var stages = [], pending;
    shape.events.forEach(function(event) {
      var sign = event.delta > 0 ? 1 : -1;
      if (!pending || pending.sign !== sign) {
        pending = {sign:sign, startRow:event.x - 1, endRow:event.x,
          beforeStitches:event.before.width, afterStitches:event.after.width,
          edge0:0, edge1:0};
        stages.push(pending);
      }
      pending.endRow = event.x; pending.afterStitches = event.after.width;
      pending[event.fabricEdge === 0 ? 'edge0' : 'edge1'] += Math.abs(event.delta);
    });
    var initialWidth = width(shape.start.width), high = -initialWidth / 2, low = initialWidth / 2;
    stages.forEach(function(stage) {
      stage.upperBefore = high; stage.lowerBefore = low;
      stage.widthBefore = width(stage.beforeStitches); stage.widthAfter = width(stage.afterStitches);
      var delta = stage.widthAfter - stage.widthBefore, total = stage.edge0 + stage.edge1;
      stage.upperAfter = high - delta * stage.edge0 / total;
      stage.lowerAfter = low + delta * stage.edge1 / total;
      high = stage.upperAfter; low = stage.lowerAfter;
    });
    // Short plain spans are compact in an illustration; long waits still occupy
    // a visible portion. Derive cadence from actual events, not saved settings.
    var cadence = Infinity;
    shape.events.forEach(function(event,index) {
      var earlier = shape.events[index - 1];
      if (earlier && (earlier.delta > 0) === (event.delta > 0))
        cadence = Math.min(cadence,event.x - earlier.x);
    });
    if (!Number.isFinite(cadence)) cadence = shape.events.length ? Math.max(1,shape.events[0].x) : 1;
    var timeline = [], rowCursor = 0, weight = 0;
    function addSpan(endRow, shaping) {
      var duration = endRow - rowCursor;
      if (duration <= 0) return;
      var length = shaping || !stages.length ? duration : duration * duration / (duration + 2 * cadence);
      timeline.push({startRow:rowCursor,endRow:endRow,start:weight,end:weight + length});
      rowCursor = endRow; weight += length;
    }
    stages.forEach(function(stage) { addSpan(stage.startRow,false); addSpan(stage.endRow,true); });
    addSpan(shape.rowCount,false);
    function position(row) {
      for (var index = 0; index < timeline.length; index++) {
        var span = timeline[index];
        if (row <= span.endRow) return (span.start + (span.end - span.start) *
          (row - span.startRow) / (span.endRow - span.startRow)) / weight * presentationRatio;
      }
      return presentationRatio;
    }
    function rowAtPosition(fraction) {
      var target = fraction * weight;
      for (var index = 0; index < timeline.length; index++) {
        var span = timeline[index];
        if (target <= span.end) return span.startRow + (span.endRow - span.startRow) *
          (target - span.start) / (span.end - span.start);
      }
      return shape.rowCount;
    }
    var firstStage = stages[0], lastStage = stages[stages.length - 1];
    var longStart = firstStage && firstStage.startRow > 2 * cadence;
    var longEnd = lastStage && shape.rowCount - lastStage.endRow > 2 * cadence;
    var startSlope = longStart ? position(firstStage.startRow) : 0;
    var endSlope = longEnd ? position(lastStage.endRow) : presentationRatio;
    var startCap = firstStage && shape.start.width < maximum ?
      Math.min(presentationRatio * .03,position(firstStage.endRow) * .12) : 0;
    var endCap = lastStage && shape.end.width < maximum ?
      Math.min(presentationRatio * .03,(presentationRatio - position(lastStage.startRow)) * .12) : 0;
    // Mostly straight slopes with a short easing at each join.
    function trend(t) {
      t = Math.max(0,Math.min(1,t));
      var corner = .05, slope = 1 / (1 - corner);
      if (t < corner) return slope * t * t / (2 * corner);
      if (t > 1 - corner) return 1 - slope * (1 - t) * (1 - t) / (2 * corner);
      return slope * (t - corner / 2);
    }
    function section(row) {
      var upperY = -initialWidth / 2, lowerY = initialWidth / 2;
      for (var index = 0; index < stages.length; index++) {
        var stage = stages[index];
        if (row < stage.startRow) break;
        var t = trend((row - stage.startRow) / Math.max(1,stage.endRow - stage.startRow));
        upperY = stage.upperBefore + (stage.upperAfter - stage.upperBefore) * t;
        lowerY = stage.lowerBefore + (stage.lowerAfter - stage.lowerBefore) * t;
        if (row <= stage.endRow) break;
      }
      var x = position(row), cap = 1, anchor;
      // Blend the narrow end into its peak over the whole slope, rather than
      // attaching a rounded cap to a broad rectangular end. A small contribution
      // from stitch ratios keeps different start/end settings distinguishable.
      var bodyWidth = lowerY - upperY, taperedWidth = bodyWidth, taperAnchor;
      if (firstStage && shape.start.width < maximum && x >= startSlope && x < position(firstStage.endRow)) {
        var startWidth = longStart ? firstStage.widthBefore : 0;
        taperedWidth = bodyWidth * .15 + (startWidth + (firstStage.widthAfter - startWidth) *
          (x - startSlope) / (position(firstStage.endRow) - startSlope)) * .85;
        taperAnchor = firstStage;
      } else if (lastStage && shape.end.width < maximum && x > position(lastStage.startRow) && x <= endSlope) {
        var endWidth = longEnd ? lastStage.widthAfter : 0;
        taperedWidth = bodyWidth * .15 + (endWidth + (lastStage.widthBefore - endWidth) * (endSlope - x) /
          (endSlope - position(lastStage.startRow))) * .85;
        taperAnchor = lastStage;
      }
      if (taperAnchor) {
        if (!taperAnchor.edge1) upperY = lowerY - taperedWidth;
        else if (!taperAnchor.edge0) lowerY = upperY + taperedWidth;
        else {
          var bodyCenter = (upperY + lowerY) / 2;
          upperY = bodyCenter - taperedWidth / 2; lowerY = bodyCenter + taperedWidth / 2;
        }
      }
      if (startCap && x < startCap) {
        cap = x / startCap; anchor = firstStage;
      } else if (endCap && x > presentationRatio - endCap) {
        cap = (presentationRatio - x) / endCap; anchor = lastStage;
      }
      if (anchor) {
        bodyWidth = lowerY - upperY;
        var tipWidth = Math.min(.03,bodyWidth * .15);
        var cappedWidth = tipWidth + (bodyWidth - tipWidth) * Math.sqrt(Math.max(0,cap * (2 - cap)));
        if (!anchor.edge1) upperY = lowerY - cappedWidth;
        else if (!anchor.edge0) lowerY = upperY + cappedWidth;
        else {
          var center = (upperY + lowerY) / 2;
          upperY = center - cappedWidth / 2; lowerY = center + cappedWidth / 2;
        }
      }
      return {row:row, x:x, upper:upperY, lower:lowerY,
        width:lowerY - upperY, center:(upperY + lowerY) / 2};
    }
    var sampleRows = [0,shape.rowCount];
    for (var i = 1; i < 256; i++) sampleRows.push(rowAtPosition(i / 256));
    if (startCap) sampleRows.push(rowAtPosition(startCap / presentationRatio));
    if (endCap) sampleRows.push(rowAtPosition(1 - endCap / presentationRatio));
    stages.forEach(function(stage) { sampleRows.push(stage.startRow,stage.endRow); });
    sampleRows.sort(function(a,b) { return a - b; });
    sampleRows = sampleRows.filter(function(value,index) { return !index || Math.abs(value - sampleRows[index - 1]) > 1e-8; });
    var rows = sampleRows.map(section), upper = rows.map(function(row) { return {x:row.x,y:row.upper,row:row.row}; });
    var lower = rows.map(function(row) { return {x:row.x,y:row.lower,row:row.row}; });
    var minY = Math.min.apply(null,upper.map(function(point) { return point.y; }));
    var maxY = Math.max.apply(null,lower.map(function(point) { return point.y; }));
    var increase = stages.some(function(stage) { return stage.sign > 0; });
    var decrease = stages.some(function(stage) { return stage.sign < 0; });
    var twoEdges = stages.some(function(stage) { return stage.sign > 0 && stage.edge0 && stage.edge1; });
    var kind = increase && decrease ? twoEdges ? 'diamond' : 'triangle' : increase ? 'increase' : decrease ? 'decrease' : 'plain';
    return {schematic:true, stylized:true, kind:kind, shifted:Math.abs(shape.end.center - shape.start.center) > 1e-8,
      rowCount:shape.rowCount, upper:upper, lower:lower, rows:rows, stages:stages,
      start:rows[0], end:rows[rows.length - 1],
      stitches:{start:shape.start.width, max:maximum, end:shape.end.width},
      needleRatio:{start:shape.start.width / maximum, max:1, end:shape.end.width / maximum},
      extent:{minX:0,maxX:presentationRatio,minY:minY,maxY:maxY,width:presentationRatio,height:maxY - minY}};
  }
  // Mark actual shaping rows on the same stylized boundary that is drawn.
  // These locate shaping events, not individual stitches within a knitted row.
  function shapingMarkers(plan, outline) {
    var shape = build(plan);
    outline = outline || illustration(shape);
    var cursor = 1;
    return shape.events.map(function(event) {
      while (cursor < outline.rows.length - 1 && outline.rows[cursor].row < event.index) cursor++;
      var left = outline.rows[cursor - 1], right = outline.rows[cursor];
      var t = (event.index - left.row) / (right.row - left.row);
      var edge = event.fabricEdge === 0 ? 'upper' : 'lower';
      var row = plan.rows.find(function(item) { return item.id === event.rowId; });
      return {rowId:event.rowId, fabricEdge:event.fabricEdge, position:event.delta > 0 ? row.increasePosition : row.decreasePosition,
        kind:event.delta > 0 ? 'increase' : 'decrease', delta:event.delta,
        before:row.before, stitches:row.stitches,
        x:left.x + (right.x - left.x) * t, y:left[edge] + (right[edge] - left[edge]) * t};
    });
  }
  function increaseMarkers(plan, outline) {
    return shapingMarkers(plan, outline).filter(function(point) { return point.delta > 0; });
  }
  return {build:build, display:display, renderOutline:display, illustration:illustration, shapingMarkers:shapingMarkers, increaseMarkers:increaseMarkers};
});
