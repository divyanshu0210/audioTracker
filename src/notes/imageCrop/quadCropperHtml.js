// The cropper UI and the perspective warp both live inside a WebView: canvas
// gives us per-pixel control that no RN view can, and it keeps the feature free
// of any new native module (nothing to rebuild, same behaviour on both OSes).
//
// RN drives the page with window.__load(dataUri) and
// window.__cmd('crop' | 'reset' | 'rotate'); the page answers over postMessage
// with {type: 'boot' | 'ready' | 'result' | 'error'}.
export const QUAD_CROPPER_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
  html, body { margin:0; padding:0; height:100%; background:#0d0f12; overflow:hidden; }
  canvas { display:block; width:100%; height:100%; touch-action:none; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  // The working copy is capped so getImageData on a 12MP photo cannot OOM the
  // WebView; since the warp reads from it, it also caps output resolution.
  var MAX_SRC = 2600;
  var MAX_OUT = 2600;
  var PAD = 30;          // keeps a handle sitting on the image edge reachable
  var CORNER_R = 12;
  var MID_R = 6;
  var GRAB = 30;         // finger slop, css px

  var src = null;        // canvas holding the working-resolution image
  var corners = [];      // clockwise from top-left, in working-image coords
  var W = 0, H = 0, scale = 1, ox = 0, oy = 0;
  var drag = -1;         // 0..3 corner, 4..7 edge midpoint, -1 none
  var grabDx = 0, grabDy = 0;
  var loupeAt = null;

  function post(msg) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    }
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function toView(p) { return {x: p.x * scale + ox, y: p.y * scale + oy}; }
  function toImg(x, y) { return {x: (x - ox) / scale, y: (y - oy) / scale}; }
  function mid(a, b) { return {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function resetCorners() {
    corners = [
      {x: 0, y: 0},
      {x: src.width, y: 0},
      {x: src.width, y: src.height},
      {x: 0, y: src.height}
    ];
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (src) {
      scale = Math.min((W - 2 * PAD) / src.width, (H - 2 * PAD) / src.height);
      ox = (W - src.width * scale) / 2;
      oy = (H - src.height * scale) / 2;
    }
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(0, 0, W, H);
    if (!src) { return; }

    ctx.drawImage(src, ox, oy, src.width * scale, src.height * scale);

    var v = corners.map(toView);
    var i;

    // Everything outside the quad goes dim, so the selection reads instantly.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(v[0].x, v[0].y);
    for (i = 1; i < 4; i++) { ctx.lineTo(v[i].x, v[i].y); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(8,10,14,0.62)';
    ctx.fill('evenodd');
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    for (i = 1; i < 4; i++) { ctx.lineTo(v[i].x, v[i].y); }
    ctx.closePath();
    ctx.strokeStyle = '#4da3ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    for (i = 0; i < 4; i++) {
      var m = mid(v[i], v[(i + 1) % 4]);
      dot(m.x, m.y, MID_R, drag === 4 + i);
    }
    for (i = 0; i < 4; i++) {
      dot(v[i].x, v[i].y, CORNER_R, drag === i);
    }

    if (loupeAt) { drawLoupe(loupeAt); }
  }

  function dot(x, y, r, active) {
    ctx.beginPath();
    ctx.arc(x, y, active ? r + 2 : r, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#4da3ff' : 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = active ? '#ffffff' : '#4da3ff';
    ctx.stroke();
  }

  // A loupe is the difference between "roughly the corner" and "exactly the
  // corner"; it parks on whichever side of the screen the finger is not over.
  function drawLoupe(p) {
    var R = 62, M = 14, z = scale * 3;
    var v = toView(p);
    var cx = v.x < W / 2 ? W - M - R : M + R;
    var cy = M + R;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0d0f12';
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.drawImage(src, cx - p.x * z, cy - p.y * z, src.width * z, src.height * z);

    // The quad is drawn in loupe space too, so an edge can be lined up on a seam.
    ctx.translate(cx - p.x * z, cy - p.y * z);
    ctx.scale(z, z);
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (var i = 1; i < 4; i++) { ctx.lineTo(corners[i].x, corners[i].y); }
    ctx.closePath();
    ctx.strokeStyle = '#4da3ff';
    ctx.lineWidth = 1.5 / z;
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
    ctx.moveTo(cx, cy - 12); ctx.lineTo(cx, cy + 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function hit(x, y) {
    var v = corners.map(toView), i;
    for (i = 0; i < 4; i++) {
      if (dist(v[i], {x: x, y: y}) < GRAB) { return i; }
    }
    for (i = 0; i < 4; i++) {
      if (dist(mid(v[i], v[(i + 1) % 4]), {x: x, y: y}) < GRAB * 0.8) { return 4 + i; }
    }
    return -1;
  }

  function point(e) {
    var t = e.touches && e.touches.length ? e.touches[0] : e;
    return {x: t.clientX, y: t.clientY};
  }

  function onStart(e) {
    if (!src) { return; }
    var p = point(e);
    drag = hit(p.x, p.y);
    if (drag < 0) { return; }
    e.preventDefault();
    var anchor = drag < 4
      ? toView(corners[drag])
      : mid(toView(corners[drag - 4]), toView(corners[(drag - 3) % 4]));
    grabDx = anchor.x - p.x;
    grabDy = anchor.y - p.y;
    loupeAt = toImg(anchor.x, anchor.y);
    draw();
  }

  function onMove(e) {
    if (drag < 0) { return; }
    e.preventDefault();
    var p = point(e);
    var t = toImg(p.x + grabDx, p.y + grabDy);
    if (drag < 4) {
      corners[drag] = {
        x: clamp(t.x, 0, src.width),
        y: clamp(t.y, 0, src.height)
      };
      loupeAt = corners[drag];
    } else {
      // An edge handle slides the whole edge, capped by whichever endpoint
      // would leave the image first.
      var a = corners[drag - 4], b = corners[(drag - 3) % 4];
      var m = mid(a, b);
      var dx = clamp(t.x - m.x, -Math.min(a.x, b.x), src.width - Math.max(a.x, b.x));
      var dy = clamp(t.y - m.y, -Math.min(a.y, b.y), src.height - Math.max(a.y, b.y));
      a.x += dx; a.y += dy;
      b.x += dx; b.y += dy;
      loupeAt = mid(a, b);
    }
    draw();
  }

  function onEnd() {
    if (drag < 0) { return; }
    drag = -1;
    loupeAt = null;
    draw();
  }

  canvas.addEventListener('touchstart', onStart, {passive: false});
  canvas.addEventListener('touchmove', onMove, {passive: false});
  canvas.addEventListener('touchend', onEnd);
  canvas.addEventListener('touchcancel', onEnd);
  canvas.addEventListener('mousedown', onStart);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseup', onEnd);
  window.addEventListener('resize', layout);

  // Solves the 8x8 system for the projective transform that sends the output
  // rectangle onto the quad the user drew (Gaussian elimination, no library).
  function homography(dst, quad) {
    var A = [], b = [], i;
    for (i = 0; i < 4; i++) {
      var x = dst[i].x, y = dst[i].y, X = quad[i].x, Y = quad[i].y;
      A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
      A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    for (i = 0; i < 8; i++) {
      var piv = i, r;
      for (r = i + 1; r < 8; r++) {
        if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) { piv = r; }
      }
      var swap = A[i]; A[i] = A[piv]; A[piv] = swap;
      var swapB = b[i]; b[i] = b[piv]; b[piv] = swapB;
      if (Math.abs(A[i][i]) < 1e-10) { return null; }
      for (r = i + 1; r < 8; r++) {
        var f = A[r][i] / A[i][i];
        if (!f) { continue; }
        for (var c = i; c < 8; c++) { A[r][c] -= f * A[i][c]; }
        b[r] -= f * b[i];
      }
    }
    var h = new Array(8);
    for (i = 7; i >= 0; i--) {
      var s = b[i];
      for (var c2 = i + 1; c2 < 8; c2++) { s -= A[i][c2] * h[c2]; }
      h[i] = s / A[i][i];
    }
    return h;
  }

  function crop() {
    if (!src) { return; }
    try {
      var outW = Math.round(Math.max(dist(corners[0], corners[1]), dist(corners[3], corners[2])));
      var outH = Math.round(Math.max(dist(corners[0], corners[3]), dist(corners[1], corners[2])));
      if (outW < 8 || outH < 8) {
        post({type: 'error', message: 'Selection is too small.'});
        return;
      }
      var k = Math.min(1, MAX_OUT / Math.max(outW, outH));
      outW = Math.max(8, Math.round(outW * k));
      outH = Math.max(8, Math.round(outH * k));

      var h = homography(
        [{x: 0, y: 0}, {x: outW, y: 0}, {x: outW, y: outH}, {x: 0, y: outH}],
        corners
      );
      if (!h) {
        post({type: 'error', message: 'That shape cannot be flattened.'});
        return;
      }

      var sw = src.width, sh = src.height;
      var sdata = src.getContext('2d').getImageData(0, 0, sw, sh).data;
      var out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      var octx = out.getContext('2d');
      var odata = octx.createImageData(outW, outH);
      var o = odata.data;

      // Inverse map plus bilinear sampling: walk the output, pull from the
      // source. Straight rectangles come out pixel-for-pixel; a slanted quad
      // gets its perspective flattened on the way.
      for (var y = 0; y < outH; y++) {
        var yc = y + 0.5;
        for (var x = 0; x < outW; x++) {
          var xc = x + 0.5;
          var w = h[6] * xc + h[7] * yc + 1;
          var fx = (h[0] * xc + h[1] * yc + h[2]) / w;
          var fy = (h[3] * xc + h[4] * yc + h[5]) / w;
          fx = fx < 0 ? 0 : fx > sw - 1 ? sw - 1 : fx;
          fy = fy < 0 ? 0 : fy > sh - 1 ? sh - 1 : fy;
          var x0 = fx | 0, y0 = fy | 0;
          var x1 = x0 + 1 < sw ? x0 + 1 : x0;
          var y1 = y0 + 1 < sh ? y0 + 1 : y0;
          var ax = fx - x0, ay = fy - y0;
          var i00 = (y0 * sw + x0) << 2, i10 = (y0 * sw + x1) << 2;
          var i01 = (y1 * sw + x0) << 2, i11 = (y1 * sw + x1) << 2;
          var w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay);
          var w01 = (1 - ax) * ay, w11 = ax * ay;
          var di = (y * outW + x) << 2;
          o[di] = sdata[i00] * w00 + sdata[i10] * w10 + sdata[i01] * w01 + sdata[i11] * w11;
          o[di + 1] = sdata[i00 + 1] * w00 + sdata[i10 + 1] * w10 + sdata[i01 + 1] * w01 + sdata[i11 + 1] * w11;
          o[di + 2] = sdata[i00 + 2] * w00 + sdata[i10 + 2] * w10 + sdata[i01 + 2] * w01 + sdata[i11 + 2] * w11;
          o[di + 3] = 255;
        }
      }
      octx.putImageData(odata, 0, 0);
      post({
        type: 'result',
        uri: out.toDataURL('image/jpeg', 0.92),
        width: outW,
        height: outH
      });
    } catch (err) {
      post({type: 'error', message: String((err && err.message) || err)});
    }
  }

  function rotate() {
    if (!src) { return; }
    var oldH = src.height;
    var r = document.createElement('canvas');
    r.width = src.height;
    r.height = src.width;
    var rc = r.getContext('2d');
    rc.translate(r.width, 0);
    rc.rotate(Math.PI / 2);
    rc.drawImage(src, 0, 0);
    var turned = corners.map(function (p) { return {x: oldH - p.y, y: p.x}; });
    src = r;
    // A quarter turn clockwise moves every corner one slot along the ring.
    corners = [turned[3], turned[0], turned[1], turned[2]];
    layout();
  }

  window.__load = function (dataUri) {
    var im = new Image();
    im.onload = function () {
      var s = Math.min(1, MAX_SRC / Math.max(im.width, im.height));
      var w = Math.max(1, Math.round(im.width * s));
      var hh = Math.max(1, Math.round(im.height * s));
      src = document.createElement('canvas');
      src.width = w;
      src.height = hh;
      src.getContext('2d').drawImage(im, 0, 0, w, hh);
      resetCorners();
      layout();
      post({type: 'ready'});
    };
    im.onerror = function () {
      post({type: 'error', message: 'Could not read the image.'});
    };
    im.src = dataUri;
  };

  window.__cmd = function (name) {
    if (name === 'crop') { setTimeout(crop, 16); }
    else if (name === 'reset') { if (src) { resetCorners(); draw(); } }
    else if (name === 'rotate') { rotate(); }
  };

  layout();
  post({type: 'boot'});
})();
</script>
</body>
</html>`;
