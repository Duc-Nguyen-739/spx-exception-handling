/**
 * mock/mock-google.js — Mock google.script.run cho test UI local (file://).
 *
 * KHÔNG push lên GAS production (đã .claspignore). index.html tự phát hiện
 * thiếu google.script và nạp file này (pattern KHỚP spx-diem-danh/mock/mock-google.js).
 * Interface khớp thật: run.withSuccessHandler(h).withFailureHandler(e).fn(...args).
 */
(function () {
  if (typeof window.google !== 'undefined' && window.google.script) return;

  window.__PAGE_ERRORS__ = [];
  window.addEventListener('error', function (e) {
    window.__PAGE_ERRORS__.push(String((e && e.message) || e));
  });

  var ME = 'admin.mock@spxexpress.com';

  var ITEMS = [
    {
      code: 'Box.06-10-2026.1', kind: 'Box', createdAt: '06/10/2026 08:02:00',
      createdBy: 'duc.nguyenvan05@spxexpress.com', imgOuter: '', imgProduct: '',
      description: 'Thùng 12 áo thun hoàn, seal còn nguyên', note: 'Kệ B2',
      status: 'chua_xu_ly', statusLabel: 'Lưu kho', bill: '', days: 0, extras: [],
      slots: [
        { slot: 'ngoai_quan', url: '' },
        { slot: 'san_pham', url: '' }
      ]
    },
    {
      code: 'Item.06-10-2026.2', kind: 'Item', createdAt: '06/10/2026 09:15:00',
      createdBy: 'duc.nguyenvan05@spxexpress.com', imgOuter: '', imgProduct: '',
      description: 'Khăn màu đỏ', note: '', status: 'da_tim_bill',
      statusLabel: 'Resolve', bill: 'SPXVN123456789', days: 0, extras: [],
      slots: [{ slot: 'san_pham', url: '' }]
    },
    {
      code: 'Box.05-10-2026.9', kind: 'Box', createdAt: '05/10/2026 08:00:00',
      createdBy: 'duc.nguyenvan05@spxexpress.com', imgOuter: '', imgProduct: '',
      description: 'Thùng thanh lý demo', note: '', status: 'thanh_ly',
      statusLabel: 'Thanh Lý', bill: 'SPXVN999', days: 1, extras: [],
      slots: [{ slot: 'san_pham', url: '' }]
    }
  ];

  var HIST = {
    'Box.06-10-2026.1': [
      { at: '06/10/2026 08:02:00', code: 'Box.06-10-2026.1', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '' }
    ],
    'Item.06-10-2026.2': [
      { at: '06/10/2026 09:15:00', code: 'Item.06-10-2026.2', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '' },
      { at: '06/10/2026 18:01:00', code: 'Item.06-10-2026.2', from: 'chua_xu_ly', to: 'da_tim_bill', by: 'son.nguyenngoc@spxexpress.com', note: 'SPXVN123456789', bill: 'SPXVN123456789' },
      { at: '06/10/2026 18:05:00', code: 'Item.06-10-2026.2', from: 'da_tim_bill', to: 'da_tim_bill', by: ME, note: 'ADMIN chỉnh sửa Mô tả sản phẩm', bill: '' }
    ],
    'Box.05-10-2026.9': [
      { at: '05/10/2026 08:00:00', code: 'Box.05-10-2026.9', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '' },
      { at: '06/10/2026 17:00:00', code: 'Box.05-10-2026.9', from: 'chua_xu_ly', to: 'thanh_ly', by: 'son.nguyenngoc@spxexpress.com', note: 'SPXVN999', bill: 'SPXVN999' }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function find(code) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].code === code) return ITEMS[i];
    return null;
  }

  var API = {
    me: function () { return { ok: true, data: { email: ME, role: 'ADMIN', deployer: ME } }; },
    listItems: function (limit) {
      var out = ITEMS.slice().sort(function (a, b) { return b.code < a.code ? -1 : 1; });
      return { ok: true, data: clone(out.slice(0, limit || 100)) };
    },
    getItem: function (code) {
      var it = find(code);
      if (!it) return { ok: false, error: 'Không Có' };
      return { ok: true, data: { item: clone(it), history: clone(HIST[code] || []) } };
    },
    previewCode: function (kind) {
      var k = kind === 'Item' ? 'Item' : 'Box';
      return { ok: true, data: { code: (k === 'Item' ? 'Item.' : 'Box.') + '06-10-2026.9' } };
    },
    previewBulkCodes: function (kind, count) {
      var k = kind === 'Item' ? 'Item.' : 'Box.';
      var n = Math.min(Math.max(parseInt(count, 10) || 10, 1), 10);
      var start = k === 'Item.' ? 3 : 21;
      var codes = [];
      for (var i = 0; i < n; i++) codes.push(k + '06-10-2026.' + (start + i));
      return { ok: true, data: { codes: codes, kind: kind === 'Item' ? 'Item' : 'Box' } };
    },
    createBox: function (p) { return create_('Box', p); },
    createItem: function (p) { return create_('Item', p); },
    resolveItem: function (code, bill) {
      var it = find(code);
      if (!it) return { ok: false, error: 'Không Có' };
      if (!bill) return { ok: false, error: 'Vui lòng nhập mã bill xử lý.' };
      if (it.status !== 'chua_xu_ly') return { ok: false, error: 'Trạng thái hiện tại: ' + it.status };
      it.status = 'da_tim_bill'; it.statusLabel = 'Resolve'; it.bill = bill;
      (HIST[code] = HIST[code] || []).push({ at: '06/10/2026 18:10:00', code: code, from: 'chua_xu_ly', to: 'da_tim_bill', by: ME, note: bill, bill: bill });
      return { ok: true, data: { code: code } };
    },
    liquidateBatch: function (codes, liqCode) {
      (codes || []).forEach(function (cd) {
        var it = find(cd);
        if (it && it.status === 'chua_xu_ly') {
          it.status = 'thanh_ly'; it.statusLabel = 'Thanh Lý'; it.bill = liqCode;
          (HIST[cd] = HIST[cd] || []).push({ at: '06/10/2026 18:10:00', code: cd, from: 'chua_xu_ly', to: 'thanh_ly', by: ME, note: liqCode, bill: liqCode });
        }
      });
      return { ok: true, data: { count: (codes || []).length, liqCode: liqCode } };
    },
    adminEditItem: function (p) {
      var it = find(p.code);
      if (!it) return { ok: false, error: 'Không Có' };
      if (p.description != null) it.description = String(p.description);
      if (p.note != null) it.note = String(p.note);
      var changed = [];
      if ((p.deleteSlots || []).length || (p.addPhotos || []).length) changed.push('Ảnh');
      if (changed.length || p.description !== undefined) changed.push('Mô tả sản phẩm');
      if (p.toStatus && p.toStatus !== it.status) {
        var map = { chua_xu_ly: 'Lưu kho', da_tim_bill: 'Resolve', thanh_ly: 'Thanh Lý' };
        it.status = p.toStatus; it.statusLabel = map[p.toStatus] || p.toStatus;
        if (p.bill) it.bill = p.bill;
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:20:00', code: p.code, from: 'da_tim_bill', to: p.toStatus, by: 'ADMIN đổi trạng thái', note: p.bill || '', bill: p.bill || '' });
      }
      if (changed.length) {
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:21:00', code: p.code, from: it.status, to: it.status, by: ME, note: 'ADMIN chỉnh sửa ' + changed.join(', '), bill: '' });
      }
      return { ok: true, data: { code: p.code } };
    },
    listUsers: function () { return { ok: true, data: [{ email: ME, role: 'ADMIN' }] }; },
    addAdmin: function (email) { return { ok: true, data: { email: email, role: 'ADMIN' } }; },
    deleteUser: function (email) { return { ok: true, data: { email: email } }; },
    fixPhotoSharing: function () { return { ok: true, data: { total: 0, shared: 0, failed: [], domainOnly: false } }; },
    getPhoto: function (fileId) {
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(String(fileId || ''))) return { ok: false, error: 'Ảnh không hợp lệ.' };
      return { ok: true, data: { mime: 'image/png', b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } };
    }
  };

  function create_(kind, p) {
    var code = (kind === 'Box' ? 'Box.' : 'Item.') + '06-10-2026.' + (ITEMS.length + 1);
    var it = {
      code: code, kind: kind, createdAt: '06/10/2026 18:30:00', createdBy: ME,
      imgOuter: '', imgProduct: '', description: (p && p.description) || '', note: (p && p.note) || '',
      status: 'chua_xu_ly', statusLabel: 'Lưu kho', bill: '', days: 0, extras: [], slots: []
    };
    ITEMS.unshift(it);
    HIST[code] = [{ at: '06/10/2026 18:30:00', code: code, from: '', to: 'chua_xu_ly', by: ME, note: 'Tạo mới', bill: '' }];
    return { ok: true, data: { code: code, shareOk: true, item: clone(it) } };
  }

  function makeChain(ok, err) {
    var c = {
      withSuccessHandler: function (h) { ok = h; return c; },
      withFailureHandler: function (h) { err = h; return c; }
    };
    Object.keys(API).forEach(function (name) {
      c[name] = function () {
        var args = [].slice.call(arguments);
        window.__MOCK_CALLS__.push([name].concat(args));
        setTimeout(function () {
          var r;
          try {
            r = API[name].apply(null, args);
          } catch (e) {
            (err || function () {})(e);
            return;
          }

          (ok || function () {})(r);
        }, 20);
      };
    });
    return c;
  }

  window.__MOCK_CALLS__ = [];
  window.google = {
    script: {
      run: {
        withSuccessHandler: function (h) { return makeChain(h, null); },
        withFailureHandler: function (h) { return makeChain(null, h); }
      }
    }
  };
})();
