/*!
 * Codevertex POS — Room Booking Widget v1.0
 *
 * Usage:
 *   <script src="https://pos.codevertexafrica.com/widget/room-booking.js"
 *           data-tenant="<tenant-slug>"
 *           data-outlet-id="<outlet-uuid>"        (optional — picker shown if omitted)
 *           data-api-url="https://posapi.codevertexafrica.com"
 *           data-primary-color="#6366F1"
 *           data-accent-color="#8B5CF6"
 *           data-hotel-name="Our Guest House"
 *           data-whatsapp="254712345678"
 *           async></script>
 *
 * Flow:
 *   1. Guest picks arrival/departure dates + guest count
 *   2. Guest sees room types available for those dates (live availability + real rate)
 *   3. Guest picks a room type + how many rooms
 *   4. Guest fills name + phone/email + notes
 *   5. Booking submitted as "pending" → staff (front desk) must confirm
 *   6. Confirmation screen shows the booking reference + the property's REAL cancellation
 *      policy and payment terms (fetched live, never hand-typed into the embed like the
 *      sibling table-booking widget's data-cancellation-policy attribute).
 */
(function () {
  'use strict';
  if (window.__cvRoomBookingLoaded) return;
  window.__cvRoomBookingLoaded = true;

  var script = document.currentScript;
  var _cfg = window.__cvRoomBookingConfig || {};

  var ALLOWED_HOSTS = ['posapi.codevertexafrica.com', 'localhost'];
  function validateApiUrl(url) {
    try {
      var p = new URL(url);
      if (ALLOWED_HOSTS.indexOf(p.hostname) === -1) return 'https://posapi.codevertexafrica.com';
      return url.replace(/\/$/, '');
    } catch (e) { return 'https://posapi.codevertexafrica.com'; }
  }

  var _rawTenant = (script && script.dataset.tenant) || _cfg.tenant || '';
  var tenantSlug = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$/.test(_rawTenant) ? _rawTenant : '';
  if (!tenantSlug) { console.warn('[cv-room-booking] data-tenant is required'); return; }

  var apiURL        = validateApiUrl((script && script.dataset.apiUrl) || _cfg.apiUrl || 'https://posapi.codevertexafrica.com');
  var configOutletId = (script && script.dataset.outletId) || _cfg.outletId || '';
  var primaryColor  = (script && script.dataset.primaryColor) || _cfg.primaryColor || '#6366F1';
  var accentColor   = (script && script.dataset.accentColor)  || _cfg.accentColor  || '#8B5CF6';
  var hotelName     = (script && script.dataset.hotelName)    || _cfg.hotelName    || 'Our Property';
  var waNumber      = (script && script.dataset.whatsapp)     || _cfg.whatsapp     || '';
  var waHref        = waNumber ? 'https://wa.me/' + waNumber : '';

  var tenantUUID = null;

  // ── State ─────────────────────────────────────────────────────────────────────
  var step           = 'search';   // outlet | search | types | guest | confirm
  var selectedOutlet = configOutletId ? { id: configOutletId, name: hotelName } : null;
  var arrivalDate    = '';
  var departureDate  = '';
  var adults         = 2;
  var children       = 0;
  var roomTypes      = [];
  var selectedType   = null;
  var roomsCount     = 1;
  var policy         = null;
  var bookingRef     = null;

  var submitCount = 0;
  var SUBMIT_LIMIT = 3;

  var host = document.createElement('div');
  host.id = 'cv-room-booking-root';
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:inherit';
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });

  var css = '\
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}\
:host{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}\
\
.fab{\
  width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;\
  background:linear-gradient(135deg,' + primaryColor + ',' + accentColor + ');\
  box-shadow:0 4px 20px rgba(0,0,0,.28);\
  display:flex;align-items:center;justify-content:center;\
  transition:transform .2s,box-shadow .2s\
}\
.fab:hover{transform:scale(1.06)}\
.fab:active{transform:scale(.97)}\
.fab-icon{font-size:24px;color:#fff}\
.fab .pulse{\
  position:absolute;top:2px;right:2px;width:12px;height:12px;\
  border-radius:50%;background:#22c55e;border:2px solid #fff\
}\
.fab .pulse::after{\
  content:"";position:absolute;inset:-3px;border-radius:50%;\
  border:2px solid #22c55e;animation:pulse-ring 2s ease-out infinite\
}\
@keyframes pulse-ring{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.8)}}\
\
.panel{\
  position:absolute;bottom:70px;right:0;width:400px;\
  background:#fff;border-radius:20px;\
  box-shadow:0 16px 48px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);\
  display:none;flex-direction:column;overflow:hidden;\
  max-height:640px;border:1px solid rgba(0,0,0,.06)\
}\
.panel.open{display:flex;animation:slideUp .25s ease-out}\
@media(max-width:480px){\
  .panel{position:fixed;inset:0;width:100%;max-height:100%;border-radius:0;z-index:2147483646}\
  .fab{bottom:16px;right:16px}\
}\
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}\
\
.hdr{\
  background:linear-gradient(135deg,' + primaryColor + ',' + accentColor + ');\
  color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0\
}\
.hdr-icon{font-size:22px;flex-shrink:0}\
.hdr-info{flex:1;min-width:0}\
.hdr-title{font-weight:700;font-size:14px}\
.hdr-sub{font-size:11px;opacity:.85;margin-top:1px}\
.hdr-close{\
  background:rgba(255,255,255,.15);border:none;border-radius:50%;\
  width:30px;height:30px;cursor:pointer;color:#fff;font-size:15px;\
  display:flex;align-items:center;justify-content:center;flex-shrink:0;\
  transition:background .15s\
}\
.hdr-close:hover{background:rgba(255,255,255,.3)}\
\
.body{flex:1;overflow-y:auto;padding:16px;background:#f8fafc}\
.body::-webkit-scrollbar{width:4px}\
.body::-webkit-scrollbar-thumb{background:#e2e8f0;border-radius:4px}\
\
.step-title{font-size:13px;font-weight:700;color:#111827;margin-bottom:12px}\
\
label{display:block;font-size:11px;font-weight:600;color:#374151;margin-bottom:4px}\
input,select,textarea{\
  width:100%;border:1.5px solid #e5e7eb;border-radius:10px;\
  padding:9px 12px;font-size:13px;outline:none;\
  font-family:inherit;transition:border .15s;\
  background:#fff;color:#111827;margin-bottom:10px\
}\
input:focus,select:focus,textarea:focus{border-color:' + primaryColor + '}\
textarea{resize:none;rows:2}\
\
.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}\
\
.btn{\
  display:block;width:100%;padding:11px;border:none;border-radius:12px;\
  font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s,transform .1s;\
  background:linear-gradient(135deg,' + primaryColor + ',' + accentColor + ');\
  color:#fff;margin-top:4px\
}\
.btn:hover{opacity:.92}\
.btn:active{transform:scale(.98)}\
.btn:disabled{opacity:.4;cursor:not-allowed}\
.btn-ghost{\
  background:transparent;color:' + primaryColor + ';border:1.5px solid ' + primaryColor + '33\
}\
.btn-ghost:hover{background:' + primaryColor + '0d}\
\
.type-card{\
  border:2px solid #e5e7eb;border-radius:12px;padding:12px;margin-bottom:8px;\
  cursor:pointer;transition:all .15s\
}\
.type-card:hover{border-color:' + primaryColor + '55;background:' + primaryColor + '08}\
.type-card.selected{border-color:' + primaryColor + ';background:' + primaryColor + '12}\
.type-card.full{opacity:.45;cursor:not-allowed}\
.type-name{font-weight:700;font-size:13px;color:#111827;text-transform:capitalize}\
.type-meta{font-size:11px;color:#6b7280;margin-top:2px}\
.type-rate{font-size:13px;font-weight:700;color:' + primaryColor + ';margin-top:2px}\
\
.stepper{display:flex;align-items:center;gap:8px;margin-bottom:2px}\
.stepper button{\
  width:30px;height:30px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fff;\
  font-size:16px;font-weight:700;color:' + primaryColor + ';cursor:pointer;flex-shrink:0\
}\
.stepper span{flex:1;text-align:center;font-weight:700;font-size:14px}\
\
.badge{\
  display:inline-flex;align-items:center;gap:5px;\
  font-size:11px;font-weight:600;padding:4px 10px;\
  border-radius:20px;background:#dbeafe;color:#1d4ed8\
}\
\
.info-box{\
  background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;\
  padding:10px 12px;font-size:12px;color:#166534;margin-bottom:10px\
}\
.warn-box{\
  background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;\
  padding:10px 12px;font-size:12px;color:#9a3412;margin-bottom:10px\
}\
.policy-box{\
  background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;\
  padding:10px 12px;font-size:11px;color:#6b7280;margin-bottom:10px;line-height:1.5\
}\
.ref{font-size:22px;font-weight:800;color:' + primaryColor + ';text-align:center;letter-spacing:1px;margin:8px 0}\
.powered{text-align:center;padding:6px;font-size:10px;color:#cbd5e1;background:#fff;border-top:1px solid #f1f5f9;flex-shrink:0}\
.powered a{color:#94a3b8;text-decoration:none}\
.powered a:hover{color:' + primaryColor + '}\
.back{font-size:11px;color:' + primaryColor + ';cursor:pointer;text-decoration:underline;display:block;margin-bottom:12px}\
.divider{border:none;border-top:1px solid #e5e7eb;margin:10px 0}\
.loading{text-align:center;padding:20px;color:#6b7280;font-size:13px}\
.err{color:#dc2626;font-size:12px;margin-bottom:8px;padding:8px 10px;background:#fef2f2;border-radius:8px}\
';

  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  shadow.appendChild(styleEl);

  function escHTML(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtMoney(n, currency) {
    return (currency || 'KES') + ' ' + Math.round(n || 0).toLocaleString();
  }

  var fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-label', 'Book a room');
  fab.style.position = 'relative';
  fab.innerHTML = '<span class="fab-icon">🛏️</span><div class="pulse"></div>';
  shadow.appendChild(fab);

  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Room booking');
  shadow.appendChild(panel);

  var panelOpen = false;
  function openPanel() {
    panelOpen = true;
    panel.classList.add('open');
    fab.innerHTML = '<span class="fab-icon">✕</span>';
    renderStep();
  }
  function closePanel() {
    panelOpen = false;
    panel.classList.remove('open');
    fab.innerHTML = '<span class="fab-icon">🛏️</span><div class="pulse"></div>';
  }
  fab.addEventListener('click', function () { if (panelOpen) closePanel(); else openPanel(); });

  function renderHeader(title, subtitle) {
    return '<div class="hdr">' +
      '<span class="hdr-icon">🛏️</span>' +
      '<div class="hdr-info">' +
        '<div class="hdr-title">' + escHTML(hotelName) + '</div>' +
        '<div class="hdr-sub">' + escHTML(title) + (subtitle ? ' · ' + escHTML(subtitle) : '') + '</div>' +
      '</div>' +
      '<button class="hdr-close" id="cv-close">✕</button>' +
    '</div>';
  }
  var poweredHTML = '<div class="powered">Powered by <a href="https://codevertexafrica.com" target="_blank" rel="noreferrer">Codevertex</a></div>';

  function renderOutletOptions(outlets) {
    if (!outlets || !outlets.length) return '<p class="loading">No locations available</p>';
    return outlets.map(function (o) {
      return '<button class="type-card" data-outlet-id="' + escHTML(o.id) + '" data-outlet-name="' + escHTML(o.name || o.slug) + '" style="text-align:left;width:100%">' +
        '<div class="type-name" style="text-transform:none">📍 ' + escHTML(o.name || o.slug) + '</div>' +
        '</button>';
    }).join('');
  }

  // ── Step renderers ─────────────────────────────────────────────────────────────
  function renderStep() {
    panel.innerHTML = '';
    var hdr, body;

    if (step === 'outlet') {
      hdr = renderHeader('Select Location', '');
      body = '<div class="body" id="cv-body">' +
        '<p class="step-title">Choose your preferred location</p>' +
        '<div id="cv-outlet-grid"><p class="loading">Loading…</p></div>' +
        '</div>';
      panel.innerHTML = hdr + body + poweredHTML;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      loadOutlets();
      return;
    }

    if (step === 'search') {
      var today = new Date().toISOString().split('T')[0];
      var tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      hdr = renderHeader('Book a Room', 'Check availability');
      body = '<div class="body" id="cv-body">' +
        (selectedOutlet && !configOutletId ? '<span class="back" id="cv-back-outlet">← Change location</span>' : '') +
        '<p class="step-title">When are you staying?</p>' +
        '<div class="row">' +
          '<div><label>Arrival</label><input type="date" id="cv-arrival" min="' + today + '" value="' + (arrivalDate || today) + '" /></div>' +
          '<div><label>Departure</label><input type="date" id="cv-departure" min="' + tomorrow + '" value="' + (departureDate || tomorrow) + '" /></div>' +
        '</div>' +
        '<div class="row">' +
          '<div>' +
            '<label>Adults</label>' +
            '<div class="stepper"><button type="button" id="cv-adults-minus">−</button><span id="cv-adults-val">' + adults + '</span><button type="button" id="cv-adults-plus">+</button></div>' +
          '</div>' +
          '<div>' +
            '<label>Children</label>' +
            '<div class="stepper"><button type="button" id="cv-children-minus">−</button><span id="cv-children-val">' + children + '</span><button type="button" id="cv-children-plus">+</button></div>' +
          '</div>' +
        '</div>' +
        '<button class="btn" id="cv-search-btn">Check Availability →</button>' +
        (waHref ? '<div style="text-align:center;margin-top:10px;font-size:11px;color:#6b7280">Prefer to call? <a href="' + escHTML(waHref) + '" target="_blank" rel="noreferrer" style="color:' + primaryColor + '">WhatsApp us</a></div>' : '') +
        '</div>';
      panel.innerHTML = hdr + body + poweredHTML;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      if (shadow.getElementById('cv-back-outlet')) {
        shadow.getElementById('cv-back-outlet').addEventListener('click', function () { step = 'outlet'; renderStep(); });
      }
      bindStepper('cv-adults', function (v) { adults = v; }, 1, 20, function () { return adults; });
      bindStepper('cv-children', function (v) { children = v; }, 0, 10, function () { return children; });
      shadow.getElementById('cv-search-btn').addEventListener('click', function () {
        var a = shadow.getElementById('cv-arrival').value;
        var d = shadow.getElementById('cv-departure').value;
        if (!a || !d) { showErr('cv-body', 'Please select both dates'); return; }
        if (d <= a) { showErr('cv-body', 'Departure must be after arrival'); return; }
        arrivalDate = a; departureDate = d;
        step = 'types';
        roomTypes = [];
        renderStep();
      });
      return;
    }

    if (step === 'types') {
      hdr = renderHeader('Choose Room Type', fmtNights() + ' · ' + (adults + children) + ' guest' + (adults + children === 1 ? '' : 's'));
      var typesHTML = '';
      if (!roomTypes.length) {
        typesHTML = '<p class="loading" id="cv-types-loading">Checking availability…</p>';
      } else {
        typesHTML = roomTypes.map(function (t) {
          var full = t.available_count <= 0;
          var isSelected = selectedType && selectedType.room_type === t.room_type;
          return '<div class="type-card' + (full ? ' full' : '') + (isSelected ? ' selected' : '') + '" data-room-type="' + escHTML(t.room_type) + '">' +
            '<div class="type-name">' + escHTML(t.room_type.replace(/_/g, ' ')) + '</div>' +
            '<div class="type-meta">' + (full ? 'Fully booked for these dates' : t.available_count + ' of ' + t.total_count + ' rooms free') + '</div>' +
            (t.sample_rate > 0 ? '<div class="type-rate">' + fmtMoney(t.sample_rate, t.currency) + ' / night</div>' : '') +
          '</div>';
        }).join('');
        if (!roomTypes.length) typesHTML = '<p class="loading">No room types configured</p>';
      }

      var roomsPicker = '';
      if (selectedType) {
        var maxRooms = Math.max(1, selectedType.available_count);
        if (roomsCount > maxRooms) roomsCount = maxRooms;
        roomsPicker = '<hr class="divider" /><label>Number of rooms</label>' +
          '<div class="stepper"><button type="button" id="cv-rooms-minus">−</button><span id="cv-rooms-val">' + roomsCount + '</span><button type="button" id="cv-rooms-plus">+</button></div>';
      }

      body = '<div class="body" id="cv-body">' +
        '<span class="back" id="cv-back-search">← Change dates</span>' +
        '<p class="step-title">Room types available</p>' +
        typesHTML +
        roomsPicker +
        (selectedType ? '<button class="btn" id="cv-type-next">Continue →</button>' : '') +
        '</div>';
      panel.innerHTML = hdr + body + poweredHTML;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      shadow.getElementById('cv-back-search').addEventListener('click', function () { step = 'search'; renderStep(); });

      shadow.querySelectorAll('.type-card[data-room-type]').forEach(function (el) {
        el.addEventListener('click', function () {
          if (el.classList.contains('full')) return;
          var rt = el.dataset.roomType;
          selectedType = roomTypes.find(function (t) { return t.room_type === rt; }) || null;
          roomsCount = 1;
          renderStep();
        });
      });
      if (selectedType) {
        bindStepper('cv-rooms', function (v) { roomsCount = v; }, 1, Math.max(1, selectedType.available_count), function () { return roomsCount; });
      }
      if (shadow.getElementById('cv-type-next')) {
        shadow.getElementById('cv-type-next').addEventListener('click', function () { step = 'guest'; renderStep(); });
      }
      if (!roomTypes.length) loadAvailability();
      return;
    }

    if (step === 'guest') {
      hdr = renderHeader('Your Details', escHTML((selectedType ? selectedType.room_type : '')) + ' · ' + roomsCount + ' room(s)');
      body = '<div class="body" id="cv-body">' +
        '<span class="back" id="cv-back-types">← Change room type</span>' +
        '<p class="step-title">Guest information</p>' +
        '<label>Full name *</label>' +
        '<input type="text" id="cv-name" placeholder="Your full name" />' +
        '<div class="row">' +
          '<div><label>Phone *</label><input type="tel" id="cv-phone" placeholder="+254..." /></div>' +
          '<div><label>Email</label><input type="email" id="cv-email" placeholder="you@email.com" /></div>' +
        '</div>' +
        '<label>Special requests (optional)</label>' +
        '<textarea id="cv-notes" rows="2" placeholder="Late arrival, accessibility needs, occasion…"></textarea>' +
        '<hr class="divider" />' +
        '<div class="warn-box">📋 Your booking will be reviewed by our front desk. We\'ll contact you within a few hours to confirm.</div>' +
        '<button class="btn" id="cv-submit-btn">Request Booking →</button>' +
        '</div>';
      panel.innerHTML = hdr + body + poweredHTML;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      shadow.getElementById('cv-back-types').addEventListener('click', function () { step = 'types'; renderStep(); });
      shadow.getElementById('cv-submit-btn').addEventListener('click', submitBooking);
      return;
    }

    if (step === 'confirm') {
      hdr = renderHeader('Booking Received!', '');
      var policyHTML = '';
      if (policy) {
        var terms = [];
        if (policy.payment_timing === 'pay_upfront') terms.push('Full payment is required at check-in.');
        else if (policy.payment_timing === 'per_day_split') terms.push('The room charge is split per night on your bill.');
        else terms.push('Payment is settled at checkout.');
        if (policy.cancellation_fee > 0) {
          terms.push('Cancelling within ' + policy.cancellation_window_hours + 'h of arrival incurs a ' + fmtMoney(policy.cancellation_fee, policy.currency) + ' fee.');
        } else {
          terms.push('Free cancellation up to ' + policy.cancellation_window_hours + 'h before arrival.');
        }
        policyHTML = '<div class="policy-box"><strong>Booking Policy</strong><br>' + terms.map(escHTML).join('<br>') + '</div>';
      }
      body = '<div class="body" id="cv-body" style="text-align:center;padding:24px 16px">' +
        '<div style="font-size:48px;margin-bottom:12px">🎉</div>' +
        '<p style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px">Booking Requested</p>' +
        '<p style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.5">Your booking is pending confirmation.<br>We\'ll call or message you soon.</p>' +
        '<div class="ref">' + escHTML(bookingRef || 'BK-???') + '</div>' +
        '<div class="badge" style="margin:0 auto 16px;display:inline-flex">⏳ Pending Front-Desk Confirmation</div>' +
        '<div style="font-size:12px;color:#6b7280;margin-bottom:4px">' + fmtNights() + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:16px">' + escHTML((selectedType ? selectedType.room_type.replace(/_/g, ' ') : '')) + ' · ' + roomsCount + ' room(s)</div>' +
        '<hr class="divider" />' +
        policyHTML +
        (waHref ? '<a href="' + escHTML(waHref) + '" target="_blank" rel="noreferrer" style="display:block;text-align:center;margin-top:8px;font-size:12px;color:#fff;background:#22c55e;padding:10px;border-radius:10px;text-decoration:none;font-weight:600">💬 WhatsApp us for faster confirmation</a>' : '') +
        '<button class="btn btn-ghost" id="cv-new-booking" style="margin-top:12px">Make another booking</button>' +
        '</div>';
      panel.innerHTML = hdr + body + poweredHTML;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      shadow.getElementById('cv-new-booking').addEventListener('click', function () {
        step = 'search'; arrivalDate = ''; departureDate = ''; roomTypes = []; selectedType = null; roomsCount = 1; bookingRef = null;
        renderStep();
      });
    }
  }

  function bindStepper(prefix, setter, min, max, getter) {
    var minus = shadow.getElementById(prefix + '-minus');
    var plus = shadow.getElementById(prefix + '-plus');
    var val = shadow.getElementById(prefix + '-val');
    if (!minus || !plus || !val) return;
    minus.addEventListener('click', function () { var v = Math.max(min, getter() - 1); setter(v); val.textContent = v; });
    plus.addEventListener('click', function () { var v = Math.min(max, getter() + 1); setter(v); val.textContent = v; });
  }

  function fmtNights() {
    if (!arrivalDate || !departureDate) return '';
    var nights = Math.round((new Date(departureDate) - new Date(arrivalDate)) / 86400000);
    return new Date(arrivalDate + 'T12:00').toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }) +
      ' → ' + new Date(departureDate + 'T12:00').toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }) +
      ' · ' + nights + ' night' + (nights === 1 ? '' : 's');
  }

  // ── API calls ──────────────────────────────────────────────────────────────────

  function getTenantUUID(callback) {
    if (tenantUUID) { callback(tenantUUID); return; }
    fetch(apiURL + '/api/v1/' + encodeURIComponent(tenantSlug) + '/pos/outlets', { headers: { 'X-Tenant-Slug': tenantSlug } })
      .then(function (r) { if (!r.ok) throw new Error('resolve failed'); return r.json(); })
      .then(function (d) {
        var outlets = (d && d.data) || [];
        if (outlets.length) { tenantUUID = outlets[0].tenant_id; callback(tenantUUID); } else { callback(null); }
      }).catch(function () { callback(null); });
  }

  function loadOutlets() {
    var grid = shadow.getElementById('cv-outlet-grid');
    if (!grid) return;
    fetch(apiURL + '/api/v1/' + encodeURIComponent(tenantSlug) + '/pos/outlets', { headers: { 'X-Tenant-Slug': tenantSlug } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var outlets = ((d && d.data) || []).filter(function (o) { return o.use_case === 'hospitality'; });
        if (!outlets.length) { grid.innerHTML = '<p style="font-size:12px;color:#6b7280;text-align:center">No locations found</p>'; return; }
        grid.innerHTML = renderOutletOptions(outlets);
        grid.querySelectorAll('[data-outlet-id]').forEach(function (el) {
          el.addEventListener('click', function () {
            var outletObj = { id: el.dataset.outletId, name: el.dataset.outletName };
            selectedOutlet = outletObj;
            var match = outlets.find(function (o) { return o.id === outletObj.id; });
            if (match && match.tenant_id) tenantUUID = match.tenant_id;
            step = 'search';
            renderStep();
          });
        });
      }).catch(function () { grid.innerHTML = '<p style="font-size:12px;color:#6b7280;text-align:center">Could not load locations</p>'; });
  }

  function loadAvailability() {
    if (!selectedOutlet) return;
    var tid = tenantUUID || tenantSlug;
    var url = apiURL + '/api/v1/' + encodeURIComponent(tid) + '/pos/room-bookings/availability' +
      '?outlet_id=' + encodeURIComponent(selectedOutlet.id) +
      '&arrival_date=' + encodeURIComponent(arrivalDate) +
      '&departure_date=' + encodeURIComponent(departureDate);
    fetch(url).then(function (r) { return r.json(); })
      .then(function (d) { roomTypes = (d && d.data) || []; renderStep(); })
      .catch(function () { roomTypes = []; renderStep(); });

    // Fetch the real policy in parallel (best-effort — the confirm screen just omits the
    // policy box if this fails, it never blocks the booking flow).
    var policyUrl = apiURL + '/api/v1/' + encodeURIComponent(tid) + '/pos/room-bookings/policy?outlet_id=' + encodeURIComponent(selectedOutlet.id);
    fetch(policyUrl).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { policy = d; }).catch(function () {});
  }

  function showErr(bodyId, msg) {
    var b = shadow.getElementById(bodyId);
    if (!b) return;
    var existing = b.querySelector('.err');
    if (existing) existing.remove();
    var e = document.createElement('div');
    e.className = 'err';
    e.textContent = msg;
    b.insertBefore(e, b.firstChild);
  }

  function submitBooking() {
    if (submitCount >= SUBMIT_LIMIT) { showErr('cv-body', 'Too many booking attempts. Please contact us directly.'); return; }

    var name  = (shadow.getElementById('cv-name') || {}).value || '';
    var phone = (shadow.getElementById('cv-phone') || {}).value || '';
    var email = (shadow.getElementById('cv-email') || {}).value || '';
    var notes = (shadow.getElementById('cv-notes') || {}).value || '';

    if (!name.trim()) { showErr('cv-body', 'Please enter your name'); return; }
    if (!phone.trim() && !email.trim()) { showErr('cv-body', 'Please provide a phone number or email so we can contact you'); return; }
    if (!selectedType) { showErr('cv-body', 'Please select a room type'); return; }

    var btn = shadow.getElementById('cv-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

    var payload = {
      outlet_id: selectedOutlet.id,
      room_type: selectedType.room_type,
      rooms_count: roomsCount,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      lead_guest_name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      adults: adults,
      children: children,
      notes: notes.trim() || undefined,
    };

    var tid = tenantUUID || tenantSlug;
    fetch(apiURL + '/api/v1/' + encodeURIComponent(tid) + '/pos/room-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Failed'); });
      return r.json();
    }).then(function (d) {
      submitCount++;
      bookingRef = d.confirmation_no || ('BK-' + (d.id || '').slice(0, 6).toUpperCase());
      step = 'confirm';
      renderStep();
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Request Booking →'; }
      showErr('cv-body', err.message || 'Booking failed. Please try again.');
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  if (!configOutletId) { step = 'outlet'; } else { selectedOutlet = { id: configOutletId, name: hotelName }; step = 'search'; }
  getTenantUUID(function (uuid) { tenantUUID = uuid; });

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panelOpen) closePanel(); });

  window.__cvRoomBooking = { open: openPanel, close: closePanel };
})();
