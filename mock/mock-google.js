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
      createdBy: 'duc.nguyenvan05@spxexpress.com',
      imgOuter: 'https://drive.google.com/thumbnail?id=MOCKouter01AB3456789012&sz=w400',
      imgProduct: 'https://drive.google.com/thumbnail?id=MOCKproduct02CD3456789012&sz=w400',
      description: 'Thùng 12 áo thun hoàn, seal còn nguyên', note: 'Kệ B2',
      status: 'chua_xu_ly', statusLabel: 'Lưu kho', bill: '', days: 0,
      extras: ['https://drive.google.com/thumbnail?id=MOCKextra03EF3456789012&sz=w400'],
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
    },
    {
      code: 'Box.06-10-2026.5', kind: 'Box', createdAt: '06/10/2026 11:00:00',
      createdBy: 'duc.nguyenvan05@spxexpress.com', imgOuter: '', imgProduct: '',
      description: 'Thùng chờ thanh lý', note: '', status: 'chua_xu_ly',
      statusLabel: 'Lưu kho', bill: '', days: 0, extras: [],
      slots: [{ slot: 'san_pham', url: '' }]
    }
  ];

  var HIST = {
    'Box.06-10-2026.1': [
      { at: '06/10/2026 08:02:00', code: 'Box.06-10-2026.1', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '', reason: '' }
    ],
    'Item.06-10-2026.2': [
      { at: '06/10/2026 09:15:00', code: 'Item.06-10-2026.2', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '', reason: '' },
      { at: '06/10/2026 18:01:00', code: 'Item.06-10-2026.2', from: 'chua_xu_ly', to: 'da_tim_bill', by: 'son.nguyenngoc@spxexpress.com', note: 'SPXVN123456789', bill: 'SPXVN123456789', reason: '' },
      { at: '06/10/2026 18:05:00', code: 'Item.06-10-2026.2', from: 'da_tim_bill', to: 'da_tim_bill', by: ME, note: 'ADMIN chỉnh sửa Mô tả sản phẩm', bill: '', reason: '' }
    ],
    'Box.05-10-2026.9': [
      { at: '05/10/2026 08:00:00', code: 'Box.05-10-2026.9', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '', reason: '' },
      { at: '06/10/2026 17:00:00', code: 'Box.05-10-2026.9', from: 'chua_xu_ly', to: 'thanh_ly', by: 'son.nguyenngoc@spxexpress.com', note: 'SPXVN999', bill: 'SPXVN999', reason: '' }
    ],
    'Box.06-10-2026.5': [
      { at: '06/10/2026 11:00:00', code: 'Box.06-10-2026.5', from: '', to: 'chua_xu_ly', by: 'duc.nguyenvan05@spxexpress.com', note: 'Tạo mới', bill: '', reason: '' }
    ]
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var PRINTQUEUE = [];
  var FEEDBACK = [
    { id: 'fb-1', at: '08/10/2026 19:19:00', email: 'duc.nguyenvan05@spxexpress.com', role: 'STAFF', text: 'Chức năng mới rất tiện, nhưng khung ảnh hơi nhỏ.', replies: [{ id: 'fr-1', at: '08/10/2026 20:05:00', text: 'Đã ghi nhận — sẽ mở rộng khung ảnh bản cập sau.' }] },
    { id: 'fb-2', at: '09/10/2026 08:02:00', email: 'lan.tran@spxexpress.com', role: 'STAFF', text: 'Nên thêm xuất Excel để kiểm kê cuối tháng.', replies: [] },
    { id: 'fb-3', at: '09/10/2026 08:20:00', email: 'tuan.pham@spxexpress.com', role: 'STAFF', text: 'Đề xuất thêm cột trọng lượng vào form create.', replies: [] },
    { id: 'fb-4', at: '09/10/2026 09:10:00', email: 'admin.mock@spxexpress.com', role: 'ADMIN', text: 'Tôi là admin — góp ý này chỉ hiện “Admin” chứ không email.', replies: [] }
  ];
  var PRINT_RE_MOCK = /^(Box|Item)\.\d{2}-\d{2}-\d{4}\.\d+$/;
  function queueCodes(codes) {
    var seen = {}, list = [];
    (codes || []).forEach(function (raw) {
      var s = String(raw || '').trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      list.push(s);
    });
    return list;
  }

  function find(code) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].code === code) return ITEMS[i];
    return null;
  }

  var API = {
    me: function () { return { ok: true, data: { email: ME, role: 'ADMIN', deployer: ME } }; },
    listItems: function (limit) {
      var out = ITEMS.slice().sort(function (a, b) { return b.code < a.code ? -1 : 1; });
      return { ok: true, data: clone(out.slice(0, limit || 150)) };
    },
    listFull: function (limit) {
      var out = ITEMS.slice().sort(function (a, b) { return b.code < a.code ? -1 : 1; });
      var n = limit || 150;
      return { ok: true, data: clone(out.slice(0, n).map(function (it) { return { item: it, history: HIST[it.code] || [] }; })) };
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
    enqueuePrintJob: function (codes) {
      var list = queueCodes(codes);
      if (!list.length) return { ok: false, error: 'Thiếu mã cần in.' };
      if (list.length > 10) return { ok: false, error: 'Tối đa 10 mã/lần.' };
      for (var i = 0; i < list.length; i++) {
        if (!PRINT_RE_MOCK.test(list[i])) return { ok: false, error: 'Mã chưa đúng định dạng: ' + list[i] };
      }
      var id = 'job-' + (PRINTQUEUE.length + 1) + '-' + Date.now();
      PRINTQUEUE.push({ job_id: id, codes: list, requested_at: '09/10/2026 15:00:00', requested_by: ME, status: 'pending', claimed_by: '', claimed_at: '', done_at: '', note: '' });
      return { ok: true, data: { job_id: id, count: list.length } };
    },
    pollPrintJobs: function () {
      var out = PRINTQUEUE.filter(function (j) { return j.status === 'pending'; }).slice(0, 20).map(function (j) {
        return { job_id: j.job_id, codes: j.codes.slice(), requested_at: j.requested_at, requested_by: j.requested_by };
      });
      return { ok: true, data: { jobs: out } };
    },
    claimPrintJob: function (jobId, stationId) {
      var id = String(jobId || '').trim();
      for (var i = 0; i < PRINTQUEUE.length; i++) {
        if (PRINTQUEUE[i].job_id === id) {
          if (PRINTQUEUE[i].status !== 'pending') return { ok: false, error: 'Đã có trạm nhận.' };
          PRINTQUEUE[i].status = 'printing';
          PRINTQUEUE[i].claimed_by = String(stationId || 'station').slice(0, 60);
          PRINTQUEUE[i].claimed_at = '09/10/2026 15:00:01';
          return { ok: true, data: { job_id: id, codes: PRINTQUEUE[i].codes.slice() } };
        }
      }
      return { ok: false, error: 'Việc in không tồn tại.' };
    },
    ackPrintJob: function (jobId, okFlag, note) {
      var id = String(jobId || '').trim();
      for (var i = 0; i < PRINTQUEUE.length; i++) {
        if (PRINTQUEUE[i].job_id === id) {
          if (PRINTQUEUE[i].status !== 'printing' && PRINTQUEUE[i].status !== 'pending') return { ok: false, error: 'Việc đã xong.' };
          PRINTQUEUE[i].status = okFlag ? 'done' : 'failed';
          PRINTQUEUE[i].done_at = '09/10/2026 15:00:02';
          PRINTQUEUE[i].note = String(note || '').slice(0, 200);
          return { ok: true, data: { job_id: id } };
        }
      }
      return { ok: false, error: 'Việc in không tồn tại.' };
    },
    createBox: function (p) { return create_('Box', p); },
    createItem: function (p) { return create_('Item', p); },
    resolveItem: function (code, bill) {
      var it = find(code);
      if (!it) return { ok: false, error: 'Không Có' };
      if (!bill) return { ok: false, error: 'Vui lòng nhập mã bill xử lý.' };
      if (it.status !== 'chua_xu_ly') return { ok: false, error: 'Trạng thái hiện tại: ' + it.status };
      it.status = 'da_tim_bill'; it.statusLabel = 'Resolve'; it.bill = bill;
      (HIST[code] = HIST[code] || []).push({ at: '06/10/2026 18:10:00', code: code, from: 'chua_xu_ly', to: 'da_tim_bill', by: ME, note: bill, bill: bill, reason: '' });
      return { ok: true, data: { code: code } };
    },
    liquidateBatch: function (codes, liqCode) {
      (codes || []).forEach(function (cd) {
        var it = find(cd);
        if (it && it.status === 'chua_xu_ly') {
          it.status = 'thanh_ly'; it.statusLabel = 'Thanh Lý'; it.bill = liqCode;
          (HIST[cd] = HIST[cd] || []).push({ at: '06/10/2026 18:10:00', code: cd, from: 'chua_xu_ly', to: 'thanh_ly', by: ME, note: liqCode, bill: liqCode, reason: '' });
        }
      });
      return { ok: true, data: { count: (codes || []).length, liqCode: liqCode } };
    },
    editItem: function (p) {
      var it = find(p.code);
      if (!it) return { ok: false, error: 'Không Có' };
      var notes = [];
      if (p.description != null && String(p.description) !== String(it.description)) notes.push('Edit Mô tả: ' + it.description + ' => ' + p.description);
      if (p.note != null && String(p.note) !== String(it.note)) notes.push('Edit Ghi chú: ' + it.note + ' => ' + p.note);
      if (!notes.length) return { ok: false, error: 'Không có gì thay đổi.' };
      if (p.description != null) it.description = String(p.description);
      if (p.note != null) it.note = String(p.note);
      notes.forEach(function (n) {
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:22:00', code: p.code, from: it.status, to: it.status, by: 'son.nguyenngoc@spxexpress.com', note: n, bill: '', reason: '' });
      });
      return { ok: true, data: { code: p.code } };
    },
    adminEditItem: function (p) {
      var it = find(p.code);
      if (!it) return { ok: false, error: 'Không Có' };
      if (p.toStatus && p.toStatus !== it.status && !String(p.reason || '').trim()) return { ok: false, error: 'Đổi trạng thái phải điền Lý do.' };
      var oldD = it.description, oldN = it.note;
      if (p.description != null) it.description = String(p.description);
      if (p.note != null) it.note = String(p.note);
      if (p.toStatus && p.toStatus !== it.status) {
        var map = { chua_xu_ly: 'Lưu kho', da_tim_bill: 'Resolve', thanh_ly: 'Thanh Lý' };
        var from = it.status;
        it.status = p.toStatus; it.statusLabel = map[p.toStatus] || p.toStatus;
        if (p.bill) it.bill = p.bill;
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:20:00', code: p.code, from: from, to: p.toStatus, by: 'ADMIN đổi trạng thái', note: p.bill || '', bill: p.bill || '', reason: p.reason || '' });
      }
      if (p.description != null && String(p.description) !== String(oldD)) {
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:21:00', code: p.code, from: it.status, to: it.status, by: ME, note: 'ADMIN Edit Mô tả: ' + oldD + ' => ' + p.description, bill: '', reason: '' });
      }
      if (p.note != null && String(p.note) !== String(oldN)) {
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:21:00', code: p.code, from: it.status, to: it.status, by: ME, note: 'ADMIN Edit Ghi chú: ' + oldN + ' => ' + p.note, bill: '', reason: '' });
      }
      if (((p.deleteSlots || []).length || (p.addPhotos || []).length)) {
        (HIST[p.code] = HIST[p.code] || []).push({ at: '06/10/2026 18:21:00', code: p.code, from: it.status, to: it.status, by: ME, note: 'ADMIN chỉnh sửa Ảnh', bill: '', reason: '' });
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
    },
    getThumb: function (fileId) {
      if (!/^[a-zA-Z0-9_-]{10,}$/.test(String(fileId || ''))) return { ok: false, error: 'Ảnh không hợp lệ.' };
      return { ok: true, data: { mime: 'image/png', b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' } };
    },
    getThumbs: function (ids, size) {
      var items = {};
      ((ids || []).slice(0, 24)).forEach(function (id) {
        if (!/^[a-zA-Z0-9_-]{10,}$/.test(String(id || ''))) { items[id] = { error: 'Ảnh không hợp lệ.' }; return; }
        items[id] = { mime: 'image/png', b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' };
      });
      return { ok: true, data: { size: size || 400, items: items } };
    },
    listFeedback: function () { return { ok: true, data: clone(FEEDBACK) }; },
    addFeedback: function (text) {
      var t = String(text || '').trim();
      if (!t) return { ok: false, error: 'Vui lòng nhập nội dung.' };
      if (t.length > 2000) return { ok: false, error: 'Tối đa 2000 ký tự.' };
      var m = { id: 'fb-' + (FEEDBACK.length + 1) + '-' + Date.now(), at: '09/10/2026 15:00:00', email: ME, role: 'ADMIN', text: t, replies: [] };
      FEEDBACK.push(m);
      return { ok: true, data: clone(m) };
    },
    replyFeedback: function (id, text) {
      var t = String(text || '').trim();
      if (!t) return { ok: false, error: 'Vui lòng nhập nội dung.' };
      if (t.length > 2000) return { ok: false, error: 'Tối đa 2000 ký tự.' };
      for (var i = 0; i < FEEDBACK.length; i++) {
        if (FEEDBACK[i].id === String(id || '')) {
          var rep = { id: 'fr-' + Date.now(), at: '09/10/2026 15:01:00', text: t };
          FEEDBACK[i].replies.push(rep);
          return { ok: true, data: clone(rep) };
        }
      }
      return { ok: false, error: 'Không tìm thấy góp ý.' };
    }
  };

  function create_(kind, p) {
    p = p || {};
    var custom = String(p.customCode || '').trim();
    var wantPrefix = kind === 'Box' ? 'Box.' : 'Item.';
    if (custom) {
      if (!/^(Box|Item)\.\d{2}-\d{2}-\d{4}\.\d+$/.test(custom)) return { ok: false, error: 'Mã sửa chưa đúng định dạng Box./Item. (ngày-tháng-năm.số).' };
      if (custom.indexOf(wantPrefix) !== 0) return { ok: false, error: 'Mã sửa phải bắt đầu bằng ' + wantPrefix };
      if (find(custom)) return { ok: false, error: 'Mã ' + custom + ' đã tồn tại — sửa mã khác.' };
    }
    var code = custom || ((kind === 'Box' ? 'Box.' : 'Item.') + '06-10-2026.' + (ITEMS.length + 1));
    var it = {
      code: code, kind: kind, createdAt: '06/10/2026 18:30:00', createdBy: ME,
      imgOuter: '', imgProduct: '', description: (p && p.description) || '', note: (p && p.note) || '',
      status: 'chua_xu_ly', statusLabel: 'Lưu kho', bill: '', days: 0, extras: [], slots: []
    };
    ITEMS.unshift(it);
    HIST[code] = [{ at: '06/10/2026 18:30:00', code: code, from: '', to: 'chua_xu_ly', by: ME, note: 'Tạo mới', bill: '', reason: '' }];
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
