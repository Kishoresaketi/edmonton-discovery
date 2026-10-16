// Interactive search, filters, tabs, event list, and place detail panel.
(function () {
      "use strict";
      var $ = function (s) { return document.querySelector(s); };
      var PAGE = 60;

      var PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>';
      var CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
      var ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M8 7h9v9"/></svg>';

      function esc(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
      }
      // Licence data is ALL CAPS — soften to title case for display.
      function tc(s) {
        if (!s) return s;
        var out = s.toLowerCase().replace(/(^|[\s\-\/''’.(])(\p{L})/gu, function (m, p, c) { return p + c.toUpperCase(); });
        out = out.replace(/'S\b/g, "'s");
        out = out.replace(/\bMc([a-z])/g, function (m, c) { return "Mc" + c.toUpperCase(); });
        out = out.replace(/\b(Nw|Ne|Sw|Se)\b/g, function (m) { return m.toUpperCase(); });
        return out;
      }
      function addrLabel(a) {
        if (!a) return "";
        if (a === "<Home Based Business>") return "Home-based business";
        if (a === "<Non-Resident Business>") return "Non-resident business";
        return tc(a);
      }
      function realAddr(a) {
        return a && a.charAt(0) !== "<" ? a : "";
      }
      function tagCls(t) {
        return t === "Food Truck" ? "tag-truck" : t === "Restaurant & Bar" ? "tag-bar" : "tag-rest";
      }

      /* ---------- dining data ---------- */
      var rows = DINING.map(function (d, i) {
        return {
          i: i,
          name: tc(d[0]),
          type: d[1],
          addr: addrLabel(d[2]),
          addrRaw: d[2] || "",
          hood: d[3] || "",
          lat: d[4], lon: d[5],
          search: (d[0] + " " + (d[2] || "") + " " + (d[3] || "") + " " + d[1]).toLowerCase()
        };
      });
      rows.sort(function (a, b) { return a.name.localeCompare(b.name); });
      var byIndex = {};
      rows.forEach(function (r) { byIndex[r.i] = r; });

      var hoodCounts = {};
      rows.forEach(function (r) { if (r.hood) hoodCounts[r.hood] = (hoodCounts[r.hood] || 0) + 1; });
      var hoodNames = Object.keys(hoodCounts).sort(function (a, b) { return a.localeCompare(b); });
      var noHoodCount = rows.filter(function (r) { return !r.hood; }).length;
      var popular = Object.keys(hoodCounts).sort(function (a, b) { return hoodCounts[b] - hoodCounts[a]; }).slice(0, 7);

      var state = { q: "", type: "All", hood: "__all", shown: PAGE };
      var TYPES = ["All", "Restaurant", "Restaurant & Bar", "Food Truck"];

      var grid = $("#grid"), resultLine = $("#resultLine"), moreBtn = $("#moreBtn"),
          emptyState = $("#emptyState"), typeChips = $("#typeChips"), hoodSel = $("#hoodSel"),
          popChips = $("#popChips"), qInput = $("#q");

      function passHoodQ(r) {
        if (state.hood === "__none" && r.hood) return false;
        if (state.hood !== "__all" && state.hood !== "__none" && r.hood !== state.hood) return false;
        if (state.q && r.search.indexOf(state.q) === -1) return false;
        return true;
      }
      function filtered() {
        return rows.filter(function (r) {
          return passHoodQ(r) && (state.type === "All" || r.type === state.type);
        });
      }

      function renderChips() {
        typeChips.innerHTML = TYPES.map(function (t) {
          var n = rows.filter(function (r) { return passHoodQ(r) && (t === "All" || r.type === t); }).length;
          return '<button type="button" class="chip' + (state.type === t ? " active" : "") + '" data-type="' + esc(t) + '">' +
            esc(t) + '<span class="n">' + n.toLocaleString("en-CA") + "</span></button>";
        }).join("");
        popChips.innerHTML = '<span class="plabel">Popular:</span>' + popular.map(function (h) {
          return '<button type="button" class="popchip' + (state.hood === h ? " active" : "") + '" data-hood="' + esc(h) + '">' + esc(h) + "</button>";
        }).join("");
      }

      function cardHTML(r) {
        var line1 = r.addr || r.hood || "Edmonton, AB";
        var hoodLine = r.addr && r.hood ? '<span class="chood">' + esc(r.hood) + "</span>" : "";
        return '<button type="button" class="card" data-i="' + r.i + '" aria-label="Details for ' + esc(r.name) + '">' +
          '<span class="cardhead"><span class="cardname">' + esc(r.name) + '</span><span class="tag ' + tagCls(r.type) + '">' + esc(r.type) + "</span></span>" +
          '<span class="cline">' + PIN + "<span>" + esc(line1) + "</span></span>" + hoodLine + "</button>";
      }

      function renderDining() {
        var list = filtered();
        var slice = list.slice(0, state.shown);
        grid.innerHTML = slice.map(cardHTML).join("");
        var hoodLabel = state.hood === "__all" ? "all neighbourhoods" :
          state.hood === "__none" ? "no neighbourhood listed" : state.hood;
        resultLine.innerHTML = "<strong>" + list.length.toLocaleString("en-CA") + "</strong> " +
          (list.length === 1 ? "place" : "places") + " · " + esc(hoodLabel) +
          (state.type !== "All" ? " · " + esc(state.type) : "") +
          (state.q ? " · matching “" + esc(qInput.value.trim()) + "”" : "");
        emptyState.hidden = list.length !== 0;
        moreBtn.hidden = !(list.length > state.shown);
        if (!moreBtn.hidden) moreBtn.textContent = "Show more places (" + (list.length - state.shown).toLocaleString("en-CA") + " more)";
        renderChips();
      }

      /* neighbourhood select */
      hoodSel.innerHTML = '<option value="__all">All neighbourhoods (' + rows.length.toLocaleString("en-CA") + ")</option>" +
        hoodNames.map(function (h) { return '<option value="' + esc(h) + '">' + esc(h) + " (" + hoodCounts[h] + ")</option>"; }).join("") +
        (noHoodCount ? '<option value="__none">Not specified (' + noHoodCount + ")</option>" : "");

      /* filter events */
      var debounce = null;
      qInput.addEventListener("input", function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          state.q = qInput.value.trim().toLowerCase();
          state.shown = PAGE;
          renderDining();
        }, 120);
      });
      typeChips.addEventListener("click", function (e) {
        var b = e.target.closest("[data-type]");
        if (!b) return;
        state.type = b.getAttribute("data-type");
        state.shown = PAGE;
        renderDining();
      });
      hoodSel.addEventListener("change", function () {
        state.hood = hoodSel.value;
        state.shown = PAGE;
        renderDining();
      });
      popChips.addEventListener("click", function (e) {
        var b = e.target.closest("[data-hood]");
        if (!b) return;
        var h = b.getAttribute("data-hood");
        state.hood = state.hood === h ? "__all" : h;
        hoodSel.value = state.hood;
        state.shown = PAGE;
        renderDining();
      });
      moreBtn.addEventListener("click", function () {
        state.shown += PAGE;
        renderDining();
      });
      $("#clearFilters").addEventListener("click", function () {
        state.q = ""; state.type = "All"; state.hood = "__all"; state.shown = PAGE;
        qInput.value = ""; hoodSel.value = "__all";
        renderDining();
        qInput.focus();
      });

      /* ---------- detail sheet ---------- */
      var sheet = $("#sheet"), scrim = $("#scrim"), cur = null;
      function directionsURL(r) {
        var q;
        if (r.lat != null && r.lon != null) q = r.lat + "," + r.lon;
        else q = encodeURIComponent(r.name + " " + realAddr(r.addrRaw) + " " + (r.hood || "") + " Edmonton AB");
        return "https://www.google.com/maps/search/?api=1&query=" + q;
      }
      function openDetail(r) {
        cur = r;
        var tag = $("#dTag");
        tag.textContent = r.type;
        tag.className = "tag " + tagCls(r.type);
        $("#dName").textContent = r.name;
        $("#dHood").textContent = r.hood ? r.hood + " · Edmonton, Alberta" : "Edmonton, Alberta";
        $("#dAddr").textContent = r.addr || "Address not listed in the licence record";
        $("#dDir").href = directionsURL(r);
        updateSaveButton(r);
        var wrap = $("#mapWrap"), map = $("#dMap");
        if (r.lat != null && r.lon != null) {
          var lat = parseFloat(r.lat), lon = parseFloat(r.lon);
          map.src = "https://www.openstreetmap.org/export/embed.html?bbox=" +
            (lon - 0.012) + "%2C" + (lat - 0.006) + "%2C" + (lon + 0.012) + "%2C" + (lat + 0.006) +
            "&layer=mapnik&marker=" + lat + "%2C" + lon;
          wrap.hidden = false;
        } else {
          map.removeAttribute("src");
          wrap.hidden = true;
        }
        sheet.hidden = false;
        scrim.hidden = false;
        document.body.classList.add("lock");
        try { history.replaceState(null, "", "#place-" + r.i); } catch (e) {}
        $("#closeSheet").focus();
      }
      function closeDetail() {
        sheet.hidden = true;
        scrim.hidden = true;
        document.body.classList.remove("lock");
        cur = null;
        try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      }
      grid.addEventListener("click", function (e) {
        var c = e.target.closest("[data-i]");
        if (c) openDetail(byIndex[c.getAttribute("data-i")]);
      });
      scrim.addEventListener("click", closeDetail);
      $("#closeSheet").addEventListener("click", closeDetail);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && cur) closeDetail();
      });
      /* ---------- events ---------- */
      var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var MONFULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      function parseD(b) { var p = b.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
      var now = new Date();
      var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
      var savedEventKeys = [];
      var evs = EVENTS.filter(function (e) { return e.b >= todayStr; });
      if (!evs.length) evs = EVENTS.slice();
      evs.sort(function (a, b) {
        if (a.b !== b.b) return a.b < b.b ? -1 : 1;
        return (a.st || "") < (b.st || "") ? -1 : 1;
      });
      function eventHTML(e) {
        var d = parseD(e.b);
        var time = e.st ? (e.et ? e.st + " – " + e.et : e.st) : "";
        var meta = time;
        var typeTag = e.type ? '<span class="tag tag-rest">' + esc(e.type) + "</span>" : "";
        var hood = e.hood ? '<span class="evhood">' + esc(e.hood) + "</span>" : "";
        var link = e.link ? '<a class="evlink" href="' + esc(e.link) + '" target="_blank" rel="noopener">Official event info ' + ARROW + "</a>" : "";
        var eventKey = encodeURIComponent(e.b + "::" + e.t);
        var saved = savedEventKeys.indexOf(e.b + "::" + e.t) !== -1;
        var saveButton = '<button type="button" class="save-event' + (saved ? ' is-saved' : '') + '" data-event-key="' + esc(eventKey) + '" aria-pressed="' + (saved ? 'true' : 'false') + '">' + (saved ? '♥ Saved' : '♡ Save event') + '</button>';
        return '<article class="event">' +
          '<div class="badge"><span class="bday">' + d.getDate() + '</span><span class="bmon">' + MON[d.getMonth()] + '</span><span class="bdow">' + DOW[d.getDay()] + "</span></div>" +
          '<div class="evbody"><h3>' + esc(e.t) + "</h3>" +
          (meta ? '<p class="evmeta">' + CLOCK + "<span>" + esc(meta) + "</span></p>" : "") +
          '<p class="evmeta">' + PIN + "<span>" + esc(e.v || "Venue TBA") + "</span></p>" +
          ((typeTag || hood) ? '<div class="evrow2">' + typeTag + hood + "</div>" : "") +
          '<div class="event-actions">' + link + saveButton + '</div></div></article>';
      }
      function renderEvents() {
        var html = "", lastMonth = "";
        evs.forEach(function (e) {
          var d = parseD(e.b);
          var mk = MONFULL[d.getMonth()] + " " + d.getFullYear();
          if (mk !== lastMonth) { html += '<h2 class="monthhead">' + mk + "</h2>"; lastMonth = mk; }
          html += eventHTML(e);
        });
        $("#evList").innerHTML = html;
        $("#evLine").innerHTML = "<strong>" + evs.length + "</strong> upcoming public events in Edmonton · save the ones you want to remember";
      }
      renderEvents();

      /* ---------- tabs ---------- */
      var tabD = $("#tab-dining"), tabE = $("#tab-events");
      function setTab(which) {
        var dining = which === "dining";
        tabD.classList.toggle("active", dining);
        tabE.classList.toggle("active", !dining);
        tabD.setAttribute("aria-selected", dining ? "true" : "false");
        tabE.setAttribute("aria-selected", !dining ? "true" : "false");
        $("#view-dining").hidden = !dining;
        $("#view-events").hidden = dining;
        window.scrollTo(0, 0);
      }
      tabD.addEventListener("click", function () { setTab("dining"); });
      tabE.addEventListener("click", function () { setTab("events"); });


      /* ---------- account, saved places, and membership ---------- */
      var plansBackdrop = $("#plansBackdrop"), accountBackdrop = $("#accountBackdrop");
      var accountForm = $("#accountForm"), accountName = $("#accountName"), accountEmail = $("#accountEmail"), accountPassword = $("#accountPassword");
      var accountMessage = $("#accountMessage"), accountSummary = $("#accountSummary"), signOut = $("#signOut"), openAccount = $("#openAccount");
      var verificationPanel = $("#verificationPanel"), googleLogin = $("#googleLogin"), verifyExisting = $("#verifyExisting"), authOptions = { api:false, google:false, emailVerification:false };
      var pendingPlan = null, pendingSaveId = null, pendingEventKey = null, currentUser = null, savedPlaceIds = [], authMode = "signup", toastTimer = null;
      async function api(path, options) {
        var response = await fetch(path, Object.assign({ credentials:"same-origin", headers:{"Content-Type":"application/json"} }, options || {}));
        var result = await response.json();
        if (!response.ok) { var error = new Error(result.error || "Something went wrong."); error.details = result; throw error; }
        return result;
      }
      function showToast(message) {
        var toast = $("#demoToast"); toast.textContent = message; toast.classList.add("visible");
        clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove("visible"); }, 4200);
      }
      function closeModals() { plansBackdrop.hidden = true; accountBackdrop.hidden = true; }
      function setAuthMode(mode) {
        authMode = mode;
        var signup = mode === "signup";
        $("#authSignup").classList.toggle("active", signup); $("#authLogin").classList.toggle("active", !signup);
        $("#authSignup").setAttribute("aria-selected", signup ? "true" : "false"); $("#authLogin").setAttribute("aria-selected", signup ? "false" : "true");
        $("#accountNameLabel").hidden = !signup; accountName.hidden = !signup; accountName.required = signup;
        accountPassword.autocomplete = signup ? "new-password" : "current-password";
        accountPassword.placeholder = signup ? "At least 12 characters" : "Your password";
        $("#accountTitle").textContent = signup ? "Create your Edmonton account." : "Welcome back.";
        $("#authSubmit").textContent = signup ? "Create free account" : "Log in";
        accountMessage.textContent = ""; accountMessage.classList.remove("error");
      }
      function renderAccount() {
        openAccount.textContent = currentUser ? "My account" : "Log in / Sign up";
        var signedIn = !!currentUser;
        var unavailable = !authOptions.api;
        accountForm.hidden = signedIn || !verificationPanel.hidden || unavailable; $("#authModes").hidden = signedIn || !verificationPanel.hidden || unavailable;
        googleLogin.hidden = signedIn || !verificationPanel.hidden || unavailable; $("#googleStatus").hidden = signedIn || !verificationPanel.hidden || unavailable;
        $(".or-divider").hidden = signedIn || !verificationPanel.hidden || unavailable;
        $("#backendNotice").hidden = !unavailable; $("#accountNotice").hidden = signedIn || unavailable;
        signOut.hidden = !signedIn; accountSummary.hidden = !signedIn;
        if (signedIn) {
          verificationPanel.hidden = true;
          accountSummary.textContent = currentUser.name + " · " + currentUser.email + " · Free Edmonton Member · " + ((currentUser.savedPlaces || []).length + (currentUser.savedEvents || []).length) + " saved items" + (currentUser.needsVerification ? " · email not verified" : " · email verified");
          verifyExisting.hidden = !currentUser.needsVerification;
          $("#accountTitle").textContent = "Your Edmonton account.";
        } else { verifyExisting.hidden = true; if (verificationPanel.hidden) setAuthMode(authMode); }
      }
      function openAccountModal(mode) { closeModals(); if (!currentUser) verificationPanel.hidden = true; if (mode) setAuthMode(mode); if (currentUser) verificationPanel.hidden = true; renderAccount(); accountBackdrop.hidden = false; if (authOptions.api && !currentUser) (authMode === "signup" ? accountName : accountEmail).focus(); }
      function showVerification(message) {
        verificationPanel.hidden = false; $("#verificationText").textContent = message;
        accountForm.hidden = true; $("#authModes").hidden = true; googleLogin.hidden = true; $("#googleStatus").hidden = true; $(".or-divider").hidden = true;
      }
      async function refreshSession() {
        try {
          var results = await Promise.all([api("/api/session"), api("/api/auth-options")]);
          currentUser = results[0].user; savedPlaceIds = currentUser ? currentUser.savedPlaces || [] : []; savedEventKeys = currentUser ? currentUser.savedEvents || [] : []; authOptions = Object.assign({api:true}, results[1]);
        } catch (e) { currentUser = null; savedPlaceIds = []; savedEventKeys = []; authOptions = {api:false, google:false, emailVerification:false}; }
        googleLogin.classList.toggle("disabled", !authOptions.google); googleLogin.setAttribute("aria-disabled", authOptions.google ? "false" : "true");
        $("#googleLoginText").textContent = authOptions.google ? "Continue with Google" : "Google sign-in · setup required";
        $("#googleStatus").textContent = authOptions.google ? "Use your Google account securely. We only request your basic profile and email." : "Google sign-in is ready to connect when the site owner adds OAuth credentials.";
        $("#accountNotice").textContent = authOptions.emailVerification ? "Use a unique password you do not use elsewhere. Passwords are one-way hashed on the server." : "Email verification is required. The site owner must configure email delivery before new email accounts can be verified.";
        renderAccount(); if (cur) updateSaveButton(cur); renderEvents();
        if (location.search.indexOf("verified=1") !== -1 || location.search.indexOf("signedin=google") !== -1) {
          showToast(location.search.indexOf("verified=1") !== -1 ? "Email verified. You’re signed in." : "Signed in with Google.");
          history.replaceState(null, "", location.pathname);
        }
      }
      function updateSaveButton(r) {
        var saved = savedPlaceIds.indexOf(Number(r.i)) !== -1;
        $("#savePlace").textContent = saved ? "♥ Saved" : "♡ Save place";
        $("#savePlace").classList.toggle("is-saved", saved);
      }
      async function toggleSavedPlace(id) {
        try {
          var result = await api("/api/saved", { method:"POST", body:JSON.stringify({placeId:Number(id)}) });
          savedPlaceIds = result.savedPlaces || []; if (currentUser) currentUser.savedPlaces = savedPlaceIds; if (cur) updateSaveButton(cur); renderAccount();
          showToast(result.saved ? "Saved to your Edmonton account." : "Removed from your saved places.");
        } catch (e) { if (e.message === "Log in to save places.") { pendingSaveId = Number(id); openAccountModal("signup"); } else showToast(e.message); }
      }
      $("#openPlans").addEventListener("click", function () { closeModals(); plansBackdrop.hidden = false; });
      openAccount.addEventListener("click", function () { verificationPanel.hidden = true; openAccountModal(); });
      googleLogin.addEventListener("click", function (e) { if (!authOptions.google) { e.preventDefault(); showToast("Google sign-in is not configured yet. The site owner must add OAuth credentials."); } });
      $("#authSignup").addEventListener("click", function () { setAuthMode("signup"); });
      $("#authLogin").addEventListener("click", function () { setAuthMode("login"); });
      document.querySelectorAll("[data-close-modal]").forEach(function (b) { b.addEventListener("click", closeModals); });
      [plansBackdrop, accountBackdrop].forEach(function (backdrop) { backdrop.addEventListener("click", function (e) { if (e.target === backdrop) closeModals(); }); });
      document.querySelectorAll("[data-plan]").forEach(function (button) {
        button.addEventListener("click", async function () {
          var plan = button.getAttribute("data-plan");
          if (!authOptions.api) { showToast("Free accounts will be available when the account server is connected."); return; }
          if (!currentUser) { pendingPlan = plan; openAccountModal("signup"); accountMessage.textContent = "Create an account to choose " + plan + "."; return; }
          try {
            var result = await api("/api/membership", { method:"POST", body:JSON.stringify({plan:plan}) });
            currentUser = result.user; renderAccount(); closeModals();
            showToast("Free Edmonton membership is active on your account.");
          } catch (e) { showToast(e.message); }
        });
      });
      accountForm.addEventListener("submit", async function (e) {
        e.preventDefault(); accountMessage.textContent = ""; accountMessage.classList.remove("error");
        var payload = { name:accountName.value.trim(), email:accountEmail.value.trim(), password:accountPassword.value };
        try {
          var result = await api(authMode === "signup" ? "/api/signup" : "/api/login", { method:"POST", body:JSON.stringify(payload) });
          if (result.verificationRequired) { accountPassword.value = ""; showVerification(result.message); return; }
          currentUser = result.user; savedPlaceIds = currentUser.savedPlaces || []; savedEventKeys = currentUser.savedEvents || []; accountPassword.value = ""; renderEvents();
          if (pendingPlan) {
            var chosenPlan = pendingPlan; pendingPlan = null;
            var member = await api("/api/membership", { method:"POST", body:JSON.stringify({plan:chosenPlan}) }); currentUser = member.user;
          }
          if (pendingSaveId !== null) { var savedId = pendingSaveId; pendingSaveId = null; await toggleSavedPlace(savedId); }
          if (pendingEventKey !== null) {
            var eventKeyToSave = pendingEventKey; pendingEventKey = null;
            var eventResult = await api("/api/saved-event", { method:"POST", body:JSON.stringify({eventKey:eventKeyToSave}) });
            savedEventKeys = eventResult.savedEvents || []; currentUser.savedEvents = savedEventKeys; renderEvents();
          }
          closeModals(); renderAccount();
          showToast(authMode === "signup" ? "Account created. Welcome to Edmonton Discovery!" : "You’re signed in.");
        } catch (error) {
          if (error.details && error.details.needsVerification) showVerification(error.message + " Use Resend verification email below.");
          else if (error.details && error.details.verificationRequired) showVerification(error.message);
          else { accountMessage.textContent = error.message; accountMessage.classList.add("error"); }
        }
      });
      async function resendForEmail(email, target) {
        try { var result = await api("/api/verification/resend", { method:"POST", body:JSON.stringify({email:email}) }); target.textContent = result.message; }
        catch (error) { target.textContent = error.message; target.classList.add("error"); }
      }
      $("#resendVerification").addEventListener("click", function () { resendForEmail(accountEmail.value.trim(), accountMessage); });
      verifyExisting.addEventListener("click", async function () {
        var messageTarget = accountMessage;
        await resendForEmail(currentUser.email, messageTarget);
        if (currentUser) { currentUser.legacyAccount = false; }
      });
      signOut.addEventListener("click", async function () {
        try { await api("/api/logout", { method:"POST", body:"{}" }); } catch (e) {}
        currentUser = null; savedPlaceIds = []; savedEventKeys = []; renderEvents(); closeModals(); renderAccount(); showToast("You’re signed out.");
      });
      $("#savePlace").addEventListener("click", function () { if (!authOptions.api) { showToast("Saved places are unavailable on this static page until its account server is connected."); return; } if (cur) toggleSavedPlace(cur.i); });
      $("#evList").addEventListener("click", async function (e) {
        var button = e.target.closest("[data-event-key]"); if (!button) return;
        if (!authOptions.api) { showToast("Saved events are unavailable on this static page until its account server is connected."); return; }
        var key; try { key = decodeURIComponent(button.getAttribute("data-event-key")); } catch (err) { return; }
        if (!currentUser) { pendingEventKey = key; openAccountModal("signup"); accountMessage.textContent = "Create a free account to save this event."; return; }
        try {
          var result = await api("/api/saved-event", { method:"POST", body:JSON.stringify({eventKey:key}) });
          savedEventKeys = result.savedEvents || []; if (currentUser) currentUser.savedEvents = savedEventKeys; renderEvents(); renderAccount();
          showToast(result.saved ? "Event saved to your Edmonton account." : "Event removed from your saved list.");
        } catch (err) { showToast(err.message); }
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModals(); });
      refreshSession();

      /* ---------- footer + deep link ---------- */
      (function () {
        var d = parseD(SEED_DATE);
        $("#seedDate").textContent = MONFULL[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
      })();
      renderDining();
      var m = /#place-(\d+)/.exec(location.hash || "");
      if (m && byIndex[m[1]]) openDetail(byIndex[m[1]]);
    })();
