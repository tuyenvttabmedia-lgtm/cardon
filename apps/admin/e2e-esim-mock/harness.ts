/**
 * Self-contained Admin eSIM ops HTML. Served only through Playwright
 * route.fulfill — no Next.js, no live API, no third-party assets.
 */
export function renderHarnessHtml(): string {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>CardOn Admin eSIM mock</title>
  <style>
    body { font-family: sans-serif; margin: 24px; }
    button { margin-right: 8px; }
    .error { color: #b91c1c; }
    .ok { color: #047857; }
    .row { margin: 12px 0; }
    nav a { margin-right: 12px; }
  </style>
</head>
<body>
  <nav>
    <a data-order-link href="/esim-ops/order-a">Order A</a>
    <a data-order-link href="/esim-ops/order-b">Order B</a>
    <a data-order-link href="/esim-ops/order-recover">Order recover</a>
    <a data-order-link href="/esim-ops/order-read-only">Order read-only</a>
  </nav>
  <h1 id="title">Đơn eSIM</h1>
  <div class="row">
    <button type="button" id="refresh">Làm mới</button>
    <button type="button" id="recover" hidden></button>
  </div>
  <p id="error" class="error" hidden></p>
  <p id="message" class="ok" hidden></p>
  <section id="install">
    <h2>Mã cài eSIM</h2>
    <p id="secret-value">—</p>
    <button type="button" id="reveal" hidden>Hiện mã cài</button>
  </section>
  <script>
    (function () {
      function revealStateForOrder(bound, next, current, empty) {
        if (bound === next) return { boundOrderId: bound, value: current };
        return { boundOrderId: next, value: empty };
      }
      function applyRevealForOrder(requestOrderId, currentOrderId, payload) {
        if (!requestOrderId || requestOrderId !== currentOrderId) return null;
        return payload;
      }
      function retainRevealAfterMetadataPoll(currentReveal) {
        return currentReveal;
      }
      function orderIdFromPath() {
        var parts = location.pathname.split('/');
        return parts[parts.length - 1] || '';
      }
      function api(path, options) {
        return fetch(location.origin + '/api/v1' + path, options || {}).then(function (res) {
          return res.json().then(function (payload) {
            return { ok: res.ok, payload: payload };
          });
        });
      }
      function readErrorMessage(payload) {
        if (payload && payload.error && typeof payload.error.message === 'string') {
          return payload.error.message;
        }
        return 'Không mở được mã cài';
      }
      var boundOrderId = orderIdFromPath();
      var revealed = null;
      var detail = null;
      var revealing = false;
      var busy = false;

      function setText(id, text, show) {
        var el = document.getElementById(id);
        el.textContent = text;
        el.hidden = show === false;
      }

      function render() {
        var aligned = revealStateForOrder(boundOrderId, orderIdFromPath(), revealed, null);
        if (aligned.boundOrderId !== boundOrderId) {
          boundOrderId = aligned.boundOrderId;
          revealed = aligned.value;
        }
        document.getElementById('title').textContent = detail && detail.orderCode ? detail.orderCode : 'Đơn eSIM';
        var paid = detail && detail.paymentStatus === 'PAID';
        var hasProfile = Boolean(detail && detail.profilePresent);
        var hasAiralo = Boolean(detail && detail.airaloOrderId);
        var canRecover = paid && !hasProfile && detail &&
          (detail.fulfillmentStatus === 'NEED_MANUAL_REVIEW' ||
           detail.fulfillmentStatus === 'WAITING_ADMIN_RETRY' ||
           detail.fulfillmentStatus === 'PENDING');
        var recoverBtn = document.getElementById('recover');
        recoverBtn.hidden = !canRecover;
        recoverBtn.disabled = busy;
        recoverBtn.textContent = busy
          ? 'Đang đọc Airalo…'
          : hasAiralo
            ? 'Đọc lại đơn Airalo'
            : 'Chỉ đọc — không tạo eSIM mới';
        var revealBtn = document.getElementById('reveal');
        var secretEl = document.getElementById('secret-value');
        if (hasProfile) {
          secretEl.textContent = revealed || (detail && detail.installSecretMasked) || '—';
          revealBtn.hidden = !(detail && detail.canRevealInstallSecret);
          revealBtn.disabled = revealing;
          revealBtn.textContent = revealing ? 'Đang mở…' : revealed ? 'Ẩn mã' : 'Hiện mã cài';
        } else {
          secretEl.textContent = hasAiralo ? 'Chưa có sims.qrcode' : 'Chưa có Airalo code';
          revealBtn.hidden = true;
        }
      }

      function loadDetail(announce) {
        var requested = orderIdFromPath();
        return api('/admin/esim-ops/orders/' + requested).then(function (result) {
          if (requested !== orderIdFromPath()) return;
          if (!result.ok || !result.payload || !result.payload.success) {
            setText('error', readErrorMessage(result.payload), true);
            return;
          }
          detail = result.payload.data;
          revealed = retainRevealAfterMetadataPoll(revealed);
          setText('error', '', false);
          if (announce) {
            setText('message', 'Đã tải lại lúc ' + new Date().toLocaleTimeString('vi-VN'), true);
          }
          render();
        });
      }

      document.getElementById('refresh').addEventListener('click', function () {
        loadDetail(true);
      });

      document.getElementById('recover').addEventListener('click', function () {
        if (busy) return;
        busy = true;
        render();
        var requested = orderIdFromPath();
        api('/admin/esim-ops/orders/' + requested + '/recover', { method: 'POST' }).then(function (result) {
          busy = false;
          if (requested !== orderIdFromPath()) return;
          if (!result.ok || !result.payload || !result.payload.success) {
            setText('error', readErrorMessage(result.payload) || 'Gọi lại Airalo thất bại', true);
            render();
            return;
          }
          var status = result.payload.data.fulfillmentStatus;
          setText(
            'message',
            status === 'COMPLETED'
              ? 'Đã lấy mã cài từ Airalo (GET /v2/orders/{code}?include=sims).'
              : 'Đã đọc lại Airalo — ' + status + '. Không tạo eSIM mới. Chưa có LPA thì xem lỗi bên dưới.',
            true,
          );
          return loadDetail();
        });
      });

      document.getElementById('reveal').addEventListener('click', function () {
        if (revealed) {
          revealed = null;
          render();
          return;
        }
        revealing = true;
        render();
        var requested = orderIdFromPath();
        api('/admin/esim-ops/orders/' + requested + '/reveal', { method: 'POST' }).then(function (result) {
          if (requested !== orderIdFromPath()) {
            revealing = false;
            render();
            return;
          }
          revealing = false;
          if (!result.ok || !result.payload || !result.payload.success) {
            setText('error', readErrorMessage(result.payload), true);
            render();
            return;
          }
          var next = applyRevealForOrder(requested, orderIdFromPath(), result.payload.data.installSecret);
          if (next) revealed = next;
          render();
        });
      });

      document.addEventListener('click', function (event) {
        var link = event.target.closest('a[data-order-link]');
        if (!link) return;
        event.preventDefault();
        history.pushState({}, '', link.getAttribute('href'));
        var aligned = revealStateForOrder(boundOrderId, orderIdFromPath(), revealed, null);
        boundOrderId = aligned.boundOrderId;
        revealed = aligned.value;
        setText('error', '', false);
        setText('message', '', false);
        detail = null;
        loadDetail();
      });

      window.addEventListener('popstate', function () {
        var aligned = revealStateForOrder(boundOrderId, orderIdFromPath(), revealed, null);
        boundOrderId = aligned.boundOrderId;
        revealed = aligned.value;
        loadDetail();
      });

      loadDetail();
    })();
  </script>
</body>
</html>`;
}
