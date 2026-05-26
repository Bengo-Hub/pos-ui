/*!
 * Codevertex POS — Table Booking Widget v1.0
 *
 * Usage:
 *   <script src="https://pos.codevertexitsolutions.com/widget/booking.js"
 *           data-tenant="<tenant-slug>"
 *           data-outlet-id="<outlet-uuid>"        (optional — picker shown if omitted)
 *           data-api-url="https://posapi.codevertexitsolutions.com"
 *           data-primary-color="#EC4899"
 *           data-accent-color="#7C3AED"
 *           data-restaurant-name="Urban Loft"
 *           data-opening-time="08:00"
 *           data-closing-time="22:00"
 *           data-slot-interval="30"               (minutes between time slots)
 *           data-max-party-size="20"
 *           data-cancellation-policy="Free cancellation up to 24 hours before"
 *           data-deposit-info=""                  (e.g. "KES 500 deposit required")
 *           data-whatsapp="254712345678"
 *           async></script>
 *
 * Flow:
 *   1. Guest fills date + party size → sees available tables with slot grid
 *   2. Guest selects table + time slot
 *   3. Guest fills name + phone/email + special requests
 *   4. Booking submitted as "pending" → staff (receptionist/manager) must confirm
 *   5. Confirmation screen shows booking reference + policy info
 */
(function () {
  'use strict';
  if (window.__cvBookingLoaded) return;
  window.__cvBookingLoaded = true;

  var script = document.currentScript;

  // ── Config ────────────────────────────────────────────────────────────────────
  // Support window.__cvBookingConfig as fallback (for dynamic injection in SPAs/Next.js)
  var _cfg = window.__cvBookingConfig || {};

  var ALLOWED_HOSTS = ['posapi.codevertexitsolutions.com', 'localhost'];
  function validateApiUrl(url) {
    try {
      var p = new URL(url);
      if (ALLOWED_HOSTS.indexOf(p.hostname) === -1) {
        return 'https://posapi.codevertexitsolutions.com';
      }
      return url.replace(/\/$/, '');
    } catch (e) { return 'https://posapi.codevertexitsolutions.com'; }
  }

  var _rawTenant = (script && script.dataset.tenant) || _cfg.tenant || '';
  var tenantSlug = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]?$/.test(_rawTenant) ? _rawTenant : '';
  if (!tenantSlug) { console.warn('[cv-booking] data-tenant is required'); return; }

  var apiURL         = validateApiUrl((script && script.dataset.apiUrl) || _cfg.apiUrl || 'https://posapi.codevertexitsolutions.com');
  var configOutletId = (script && script.dataset.outletId) || _cfg.outletId || '';
  var primaryColor   = (script && script.dataset.primaryColor)  || _cfg.primaryColor  || '#6366F1';
  var accentColor    = (script && script.dataset.accentColor)   || _cfg.accentColor   || '#8B5CF6';
  var restaurantName = (script && script.dataset.restaurantName) || _cfg.restaurantName || 'Our Restaurant';
  var openTime       = (script && script.dataset.openingTime)   || _cfg.openingTime   || '09:00';
  var closeTime      = (script && script.dataset.closingTime)   || _cfg.closingTime   || '22:00';
  var slotInterval   = parseInt((script && script.dataset.slotInterval) || _cfg.slotInterval || '30', 10);
  var maxPartySize   = parseInt((script && script.dataset.maxPartySize) || _cfg.maxPartySize || '20', 10);
  var cancelPolicy   = (script && script.dataset.cancellationPolicy) || _cfg.cancellationPolicy || 'Cancellations accepted up to 24 hours before your reservation. Late cancellations may incur a fee.';
  var depositInfo    = (script && script.dataset.depositInfo)   || _cfg.depositInfo   || '';
  var waNumber       = (script && script.dataset.whatsapp)      || _cfg.whatsapp      || '';
  var waHref         = waNumber ? 'https://wa.me/' + waNumber : '';

  // ── Tenant UUID lookup — slug → UUID ─────────────────────────────────────────
  // The public endpoint returns tenant UUID from slug for building API calls
  var tenantUUID = null;

  // ── State ─────────────────────────────────────────────────────────────────────
  var step          = 'search';   // search | tables | guest | confirm | done
  var selectedOutlet = configOutletId ? { id: configOutletId, name: restaurantName } : null;
  var selectedDate  = '';
  var selectedParty = 2;
  var selectedTable = null;
  var selectedSlot  = null;
  var availableTables = [];
  var bookingRef    = null;

  // ── Rate limit ────────────────────────────────────────────────────────────────
  var submitCount = 0;
  var SUBMIT_LIMIT = 3;

  // ── Shadow DOM ────────────────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.id = 'cv-booking-root';
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;font-family:inherit';
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });

  // ── CSS ───────────────────────────────────────────────────────────────────────
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
textarea{resize:none;rows:3}\
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
.table-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}\
.tbl-card{\
  border:2px solid #e5e7eb;border-radius:12px;padding:8px;\
  cursor:pointer;transition:all .15s;text-align:center\
}\
.tbl-card:hover{border-color:' + primaryColor + '55;background:' + primaryColor + '08}\
.tbl-card.selected{border-color:' + primaryColor + ';background:' + primaryColor + '12}\
.tbl-card.busy{border-color:#f59e0b;background:#fef3c7}\
.tbl-card.full{border-color:#e5e7eb;opacity:.45;cursor:not-allowed}\
.tbl-name{font-weight:700;font-size:14px;color:#111827}\
.tbl-cap{font-size:10px;color:#6b7280;margin-top:1px}\
.tbl-slots{font-size:9px;color:#f59e0b;font-weight:600;margin-top:2px}\
\
.slot-grid{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}\
.slot{\
  padding:5px 10px;border-radius:8px;font-size:11px;font-weight:600;\
  border:1.5px solid #e5e7eb;cursor:pointer;transition:all .15s\
}\
.slot:hover{border-color:' + primaryColor + ';color:' + primaryColor + '}\
.slot.selected{background:' + primaryColor + ';color:#fff;border-color:' + primaryColor + '}\
.slot.booked{background:#f1f5f9;color:#94a3b8;border-color:#e5e7eb;cursor:not-allowed;text-decoration:line-through}\
\
.badge{\
  display:inline-flex;align-items:center;gap:5px;\
  font-size:11px;font-weight:600;padding:4px 10px;\
  border-radius:20px;background:#fef3c7;color:#92400e\
}\
.badge.pending{background:#dbeafe;color:#1d4ed8}\
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

  // ── Escape helpers ────────────────────────────────────────────────────────────
  function escHTML(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── FAB ───────────────────────────────────────────────────────────────────────
  var fab = document.createElement('button');
  fab.className = 'fab';
  fab.setAttribute('aria-label', 'Reserve a table');
  fab.style.position = 'relative';
  fab.innerHTML = '<span class="fab-icon">🍽️</span><div class="pulse"></div>';
  shadow.appendChild(fab);

  // ── Panel ─────────────────────────────────────────────────────────────────────
  var panel = document.createElement('div');
  panel.className = 'panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Table reservation');
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
    fab.innerHTML = '<span class="fab-icon">🍽️</span><div class="pulse"></div>';
  }

  fab.addEventListener('click', function () {
    if (panelOpen) closePanel(); else openPanel();
  });

  // ── Time slots generator ──────────────────────────────────────────────────────
  function generateSlots(openT, closeT, intervalMin) {
    var slots = [];
    var parts = openT.split(':');
    var cur = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    var closeParts = closeT.split(':');
    var end = parseInt(closeParts[0], 10) * 60 + parseInt(closeParts[1], 10);
    while (cur + intervalMin <= end) {
      var h = Math.floor(cur / 60);
      var m = cur % 60;
      slots.push((h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m);
      cur += intervalMin;
    }
    return slots;
  }

  // ── Is slot booked (overlaps with any booked slot on the table) ────────────────
  function isSlotBooked(table, slotTime) {
    if (!table.booked_slots || !table.booked_slots.length) return false;
    var slotDate = new Date(selectedDate + 'T' + slotTime + ':00Z');
    return table.booked_slots.some(function (bs) {
      var bsStart = new Date(bs.start);
      var bsEnd   = new Date(bs.end);
      return slotDate >= bsStart && slotDate < bsEnd;
    });
  }

  // ── Render helpers ────────────────────────────────────────────────────────────
  function renderHeader(title, subtitle) {
    return '<div class="hdr">' +
      '<span class="hdr-icon">🍽️</span>' +
      '<div class="hdr-info">' +
        '<div class="hdr-title">' + escHTML(restaurantName) + '</div>' +
        '<div class="hdr-sub">' + escHTML(title) + (subtitle ? ' · ' + escHTML(subtitle) : '') + '</div>' +
      '</div>' +
      '<button class="hdr-close" id="cv-close">✕</button>' +
    '</div>';
  }

  function renderOutletOptions(outlets) {
    if (!outlets || !outlets.length) return '<p class="loading">No outlets available</p>';
    return outlets.map(function (o) {
      return '<button class="tbl-card" data-outlet-id="' + escHTML(o.id) + '" data-outlet-name="' + escHTML(o.name || o.slug) + '" style="text-align:left;grid-column:span 3;display:flex;align-items:center;gap:10px;padding:12px">' +
        '<span style="font-size:20px">📍</span>' +
        '<div><div class="tbl-name" style="text-align:left">' + escHTML(o.name || o.slug) + '</div>' +
        '<div class="tbl-cap" style="text-align:left">' + escHTML(o.address || '') + '</div></div>' +
        '</button>';
    }).join('');
  }

  // ── Step renderers ─────────────────────────────────────────────────────────────

  function renderStep() {
    panel.innerHTML = '';
    var hdr, body, pwr;

    if (step === 'outlet') {
      hdr = renderHeader('Select Location', '');
      body = '<div class="body" id="cv-body">' +
        '<p class="step-title">Choose your preferred location</p>' +
        '<div class="table-grid" id="cv-outlet-grid"><p class="loading">Loading…</p></div>' +
        '</div>';
      pwr = '<div class="powered">Powered by <a href="https://codevertexitsolutions.com" target="_blank" rel="noreferrer">Codevertex</a></div>';
      panel.innerHTML = hdr + body + pwr;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      loadOutlets();
      return;
    }

    if (step === 'search') {
      var today = new Date().toISOString().split('T')[0];
      hdr = renderHeader('Book a Table', 'Find availability');
      body = '<div class="body" id="cv-body">' +
        (selectedOutlet && !configOutletId
          ? '<span class="back" id="cv-back-outlet">← Change location</span>'
          : '') +
        '<p class="step-title">When are you visiting?</p>' +
        '<div class="row">' +
          '<div><label>Date</label><input type="date" id="cv-date" min="' + today + '" value="' + (selectedDate || today) + '" /></div>' +
          '<div><label>Party size</label><select id="cv-party">' +
            Array.from({length: maxPartySize}, function(_, i) {
              var n = i + 1;
              return '<option value="' + n + '"' + (n === selectedParty ? ' selected' : '') + '>' + n + ' ' + (n === 1 ? 'guest' : 'guests') + '</option>';
            }).join('') +
          '</select></div>' +
        '</div>' +
        '<button class="btn" id="cv-search-btn">Check Availability →</button>' +
        (waHref ? '<div style="text-align:center;margin-top:10px;font-size:11px;color:#6b7280">Prefer to call? <a href="' + escHTML(waHref) + '" target="_blank" rel="noreferrer" style="color:' + primaryColor + '">WhatsApp us</a></div>' : '') +
        '</div>';
      pwr = '<div class="powered">Powered by <a href="https://codevertexitsolutions.com" target="_blank" rel="noreferrer">Codevertex</a></div>';
      panel.innerHTML = hdr + body + pwr;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      if (shadow.getElementById('cv-back-outlet')) {
        shadow.getElementById('cv-back-outlet').addEventListener('click', function () { step = 'outlet'; renderStep(); });
      }
      shadow.getElementById('cv-search-btn').addEventListener('click', function () {
        var d = shadow.getElementById('cv-date').value;
        var p = parseInt(shadow.getElementById('cv-party').value, 10);
        if (!d) { showErr('cv-body', 'Please select a date'); return; }
        selectedDate = d;
        selectedParty = p;
        step = 'tables';
        renderStep();
      });
      return;
    }

    if (step === 'tables') {
      var slots = generateSlots(openTime, closeTime, slotInterval);
      hdr = renderHeader('Pick a Table', new Date(selectedDate + 'T12:00').toLocaleDateString('en-KE', {weekday:'short',month:'short',day:'numeric'}) + ' · ' + selectedParty + ' guests');
      var tableHTML = '';
      if (!availableTables.length) {
        tableHTML = '<p class="loading" id="cv-tables-loading">Loading availability…</p>';
      } else {
        tableHTML = '<div class="table-grid">' +
          availableTables.map(function (t) {
            var isFull = t.status === 'occupied';
            var bookedCount = (t.booked_slots || []).length;
            var cls = isFull ? 'full' : bookedCount > 0 ? 'busy' : '';
            var isSelected = selectedTable && selectedTable.id === t.id;
            return '<div class="tbl-card ' + cls + (isSelected ? ' selected' : '') + '" data-table-id="' + escHTML(t.id) + '">' +
              '<div class="tbl-name">' + escHTML(t.name) + '</div>' +
              '<div class="tbl-cap">' + escHTML(String(t.capacity)) + ' seats</div>' +
              (t.tags && t.tags.length ? '<div class="tbl-slots">' + t.tags.slice(0,2).map(escHTML).join(' · ') + '</div>' : '') +
              (bookedCount > 0 ? '<div class="tbl-slots">' + bookedCount + ' booked</div>' : '') +
            '</div>';
          }).join('') +
        '</div>';
      }

      var slotHTML = '';
      if (selectedTable) {
        slotHTML = '<p style="font-size:11px;font-weight:700;color:#374151;margin-bottom:8px">Select time slot</p>' +
          '<div class="slot-grid">' +
          slots.map(function (s) {
            var booked = isSlotBooked(selectedTable, s);
            return '<div class="slot' + (booked ? ' booked' : '') + (selectedSlot === s && !booked ? ' selected' : '') + '" data-slot="' + s + '">' + s + '</div>';
          }).join('') +
          '</div>';
      }

      body = '<div class="body" id="cv-body">' +
        '<span class="back" id="cv-back-search">← Change date or party</span>' +
        '<p class="step-title">Choose a table</p>' +
        tableHTML +
        '<hr class="divider" />' +
        slotHTML +
        (selectedTable && selectedSlot
          ? '<button class="btn" id="cv-slot-next">Continue →</button>'
          : '') +
        '</div>';
      pwr = '<div class="powered">Powered by <a href="https://codevertexitsolutions.com" target="_blank" rel="noreferrer">Codevertex</a></div>';
      panel.innerHTML = hdr + body + pwr;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      shadow.getElementById('cv-back-search').addEventListener('click', function () { step = 'search'; renderStep(); });

      // Table selection
      shadow.querySelectorAll('.tbl-card').forEach(function (el) {
        el.addEventListener('click', function () {
          if (el.classList.contains('full')) return;
          var tid = el.dataset.tableId;
          selectedTable = availableTables.find(function (t) { return t.id === tid; }) || null;
          selectedSlot = null;
          renderStep();
        });
      });

      // Slot selection
      shadow.querySelectorAll('.slot').forEach(function (el) {
        el.addEventListener('click', function () {
          if (el.classList.contains('booked')) return;
          selectedSlot = el.dataset.slot;
          renderStep();
        });
      });

      if (shadow.getElementById('cv-slot-next')) {
        shadow.getElementById('cv-slot-next').addEventListener('click', function () {
          step = 'guest';
          renderStep();
        });
      }

      // Load tables if needed
      if (!availableTables.length) { loadAvailability(); }
      return;
    }

    if (step === 'guest') {
      hdr = renderHeader('Your Details', escHTML(selectedTable ? selectedTable.name : 'Any table') + ' · ' + (selectedSlot || '') + ' · ' + selectedParty + ' guests');
      body = '<div class="body" id="cv-body">' +
        '<span class="back" id="cv-back-tables">← Change table or time</span>' +
        '<p class="step-title">Guest information</p>' +
        '<label>Full name *</label>' +
        '<input type="text" id="cv-name" placeholder="Your full name" />' +
        '<div class="row">' +
          '<div><label>Phone *</label><input type="tel" id="cv-phone" placeholder="+254..." /></div>' +
          '<div><label>Email</label><input type="email" id="cv-email" placeholder="you@email.com" /></div>' +
        '</div>' +
        '<label>Special requests / dietary needs</label>' +
        '<textarea id="cv-notes" rows="2" placeholder="Dietary requirements, occasion, seating preference…"></textarea>' +
        '<hr class="divider" />' +
        '<div class="policy-box"><strong>Booking Policy</strong><br>' + escHTML(cancelPolicy) + (depositInfo ? '<br><br><strong>Deposit:</strong> ' + escHTML(depositInfo) : '') + '</div>' +
        '<div class="warn-box">📋 Your booking will be reviewed by our team. We\'ll contact you within 1 hour to confirm.</div>' +
        '<button class="btn" id="cv-submit-btn">Request Reservation →</button>' +
        '</div>';
      pwr = '<div class="powered">Powered by <a href="https://codevertexitsolutions.com" target="_blank" rel="noreferrer">Codevertex</a></div>';
      panel.innerHTML = hdr + body + pwr;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      shadow.getElementById('cv-back-tables').addEventListener('click', function () { step = 'tables'; renderStep(); });
      shadow.getElementById('cv-submit-btn').addEventListener('click', submitBooking);
      return;
    }

    if (step === 'done') {
      var refDate = new Date(selectedDate + 'T' + selectedSlot + ':00').toLocaleString('en-KE', {weekday:'long', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'});
      hdr = renderHeader('Booking Received!', '');
      body = '<div class="body" id="cv-body" style="text-align:center;padding:24px 16px">' +
        '<div style="font-size:48px;margin-bottom:12px">🎉</div>' +
        '<p style="font-size:14px;font-weight:700;color:#111827;margin-bottom:6px">Reservation Requested</p>' +
        '<p style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.5">Your booking is pending confirmation.<br>We\'ll call or message you within 1 hour.</p>' +
        '<div class="ref">' + escHTML(bookingRef || 'RES-???') + '</div>' +
        '<div class="badge pending" style="margin:0 auto 16px;display:inline-flex">' +
          '⏳ Pending Staff Confirmation' +
        '</div>' +
        '<div style="font-size:12px;color:#6b7280;margin-bottom:6px">' + escHTML(restaurantName) + '</div>' +
        '<div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:16px">' + escHTML(refDate) + '</div>' +
        '<div style="font-size:12px;color:#374151;margin-bottom:4px"><strong>Table:</strong> ' + escHTML(selectedTable ? selectedTable.name : 'Any available') + ' · ' + selectedParty + ' guests</div>' +
        '<hr class="divider" />' +
        '<div class="policy-box">' + escHTML(cancelPolicy) + '</div>' +
        (waHref ? '<a href="' + escHTML(waHref) + '" target="_blank" rel="noreferrer" style="display:block;text-align:center;margin-top:8px;font-size:12px;color:#fff;background:#22c55e;padding:10px;border-radius:10px;text-decoration:none;font-weight:600">💬 WhatsApp us for faster confirmation</a>' : '') +
        '<button class="btn btn-ghost" id="cv-new-booking" style="margin-top:12px">Make another booking</button>' +
        '</div>';
      pwr = '<div class="powered">Powered by <a href="https://codevertexitsolutions.com" target="_blank" rel="noreferrer">Codevertex</a></div>';
      panel.innerHTML = hdr + body + pwr;
      shadow.getElementById('cv-close').addEventListener('click', closePanel);
      shadow.getElementById('cv-new-booking').addEventListener('click', function () {
        step = 'search';
        selectedTable = null;
        selectedSlot = null;
        selectedDate = '';
        availableTables = [];
        bookingRef = null;
        renderStep();
      });
    }
  }

  // ── API calls ──────────────────────────────────────────────────────────────────

  function getTenantUUID(callback) {
    if (tenantUUID) { callback(tenantUUID); return; }
    // Use the public outlet endpoint to resolve tenant UUID from slug
    fetch(apiURL + '/api/v1/' + encodeURIComponent(tenantSlug) + '/pos/outlets', {
      headers: { 'X-Tenant-Slug': tenantSlug },
    }).then(function (r) {
      if (!r.ok) throw new Error('resolve failed');
      return r.json();
    }).then(function (d) {
      // Server responds with tenant context; extract from first outlet or use slug
      // The public outlets endpoint includes the tenant_id in each outlet
      var outlets = (d && d.data) || [];
      if (outlets.length) {
        tenantUUID = outlets[0].tenant_id;
        callback(tenantUUID);
      } else {
        callback(null);
      }
    }).catch(function () { callback(null); });
  }

  function loadOutlets() {
    var grid = shadow.getElementById('cv-outlet-grid');
    if (!grid) return;
    fetch(apiURL + '/api/v1/' + encodeURIComponent(tenantSlug) + '/pos/outlets', {
      headers: { 'X-Tenant-Slug': tenantSlug },
    }).then(function (r) { return r.json(); })
    .then(function (d) {
      var outlets = (d && d.data) || [];
      if (!outlets.length) {
        grid.innerHTML = '<p style="font-size:12px;color:#6b7280;grid-column:span 3;text-align:center">No locations found</p>';
        return;
      }
      grid.innerHTML = renderOutletOptions(outlets);
      grid.querySelectorAll('.tbl-card').forEach(function (el) {
        el.addEventListener('click', function () {
          tenantUUID = el.closest ? null : null; // reset, will resolve via outlet tenant_id
          var outletObj = { id: el.dataset.outletId, name: el.dataset.outletName };
          selectedOutlet = outletObj;
          // Extract tenant_id from the outlet data we have
          var match = outlets.find(function (o) { return o.id === outletObj.id; });
          if (match && match.tenant_id) tenantUUID = match.tenant_id;
          step = 'search';
          renderStep();
        });
      });
    }).catch(function () {
      if (grid) grid.innerHTML = '<p style="font-size:12px;color:#6b7280;text-align:center;grid-column:span 3">Could not load locations</p>';
    });
  }

  function loadAvailability() {
    if (!selectedOutlet) return;
    var url = apiURL + '/api/v1/' + encodeURIComponent(tenantUUID || tenantSlug) + '/pos/reservations/available' +
      '?date=' + encodeURIComponent(selectedDate) +
      '&party_size=' + selectedParty +
      '&outlet_id=' + encodeURIComponent(selectedOutlet.id);

    fetch(url).then(function (r) { return r.json(); })
    .then(function (d) {
      availableTables = d.tables || [];
      renderStep();
    }).catch(function () {
      availableTables = [];
      renderStep();
    });
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
    if (submitCount >= SUBMIT_LIMIT) {
      showErr('cv-body', 'Too many booking attempts. Please contact us directly.');
      return;
    }

    var name  = (shadow.getElementById('cv-name') || {}).value || '';
    var phone = (shadow.getElementById('cv-phone') || {}).value || '';
    var email = (shadow.getElementById('cv-email') || {}).value || '';
    var notes = (shadow.getElementById('cv-notes') || {}).value || '';

    if (!name.trim()) { showErr('cv-body', 'Please enter your name'); return; }
    if (!phone.trim() && !email.trim()) { showErr('cv-body', 'Please provide a phone number or email so we can contact you'); return; }

    var btn = shadow.getElementById('cv-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }

    // Build ISO datetime from date + slot
    var scheduledAt = new Date(selectedDate + 'T' + selectedSlot + ':00').toISOString();

    var payload = {
      outlet_id:        selectedOutlet.id,
      guest_name:       name.trim(),
      guest_phone:      phone.trim() || undefined,
      guest_email:      email.trim() || undefined,
      party_size:       selectedParty,
      scheduled_at:     scheduledAt,
      duration_minutes: slotInterval < 60 ? 90 : slotInterval,
      special_requests: notes.trim() || undefined,
      source:           'online_widget',
      table_id:         selectedTable ? selectedTable.id : undefined,
    };

    var tid = tenantUUID || tenantSlug;
    fetch(apiURL + '/api/v1/' + encodeURIComponent(tid) + '/pos/reservations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || 'Failed'); });
      return r.json();
    }).then(function (d) {
      submitCount++;
      // Generate a short human-readable reference from the UUID
      bookingRef = 'RES-' + (d.id || '').slice(0, 6).toUpperCase();
      step = 'done';
      renderStep();
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Request Reservation →'; }
      showErr('cv-body', err.message || 'Booking failed. Please try again.');
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  if (!configOutletId) {
    step = 'outlet';
  } else {
    selectedOutlet = { id: configOutletId, name: restaurantName };
    step = 'search';
  }
  // Pre-resolve tenant UUID once
  getTenantUUID(function (uuid) { tenantUUID = uuid; });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panelOpen) closePanel();
  });

  // Public API — callers can do: window.__cvBooking.open() / .close()
  window.__cvBooking = { open: openPanel, close: closePanel };
})();
