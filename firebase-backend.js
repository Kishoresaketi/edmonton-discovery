// Firebase Authentication + Firestore adapter for the existing app API.
(function () {
  "use strict";
  var config = window.ED_FIREBASE_CONFIG;
  if (!window.firebase || !config || !config.apiKey || !config.projectId || !config.appId) return;

  var app = firebase.apps.length ? firebase.app() : firebase.initializeApp(config);
  var auth = firebase.auth(app), db = firebase.firestore(app);
  var provider = new firebase.auth.GoogleAuthProvider();
  var errorText = {
    "auth/email-already-in-use":"An account with that email already exists. Try logging in.",
    "auth/invalid-email":"Enter a valid email address.",
    "auth/invalid-credential":"Email or password did not match.",
    "auth/user-not-found":"Email or password did not match.",
    "auth/wrong-password":"Email or password did not match.",
    "auth/weak-password":"Use a stronger password with at least 12 characters.",
    "auth/too-many-requests":"Too many attempts. Please wait and try again.",
    "auth/popup-closed-by-user":"Google sign-in was closed before it finished.",
    "permission-denied":"This action is not allowed for this account. Verify your email or sign in as the site editor."
  };
  function fail(error) {
    var e = new Error(errorText[error.code] || error.message || "Something went wrong.");
    e.details = error.details || {};
    if (error.code === "auth/email-already-in-use") e.details.emailExists = true;
    throw e;
  }
  function profileRef(user) { return db.collection("users").doc(user.uid); }
  async function savedItems(user, collection) {
    if (!user.emailVerified) return [];
    var snapshot = await profileRef(user).collection(collection).get();
    return snapshot.docs.map(function (doc) { return doc.data().value; });
  }
  async function safeUser(user) {
    if (!user) return null;
    await user.reload();
    var fresh = auth.currentUser || user;
    await fresh.getIdToken(true);
    var profileSnap = await profileRef(fresh).get();
    var profile = profileSnap.exists ? profileSnap.data() : {};
    var adminSnap = await db.collection("admins").doc(fresh.uid).get();
    var places = await savedItems(fresh, "savedPlaces"), events = await savedItems(fresh, "savedEvents");
    return { id:fresh.uid, name:profile.name || fresh.displayName || "Edmonton Member", email:fresh.email, emailVerified:!!fresh.emailVerified, needsVerification:!fresh.emailVerified, plan:"Edmonton Member", planStatus:"free", savedPlaces:places, savedEvents:events, isAdmin:adminSnap.exists && adminSnap.data().role === "admin" };
  }
  async function ensureProfile(user, name) {
    var ref = profileRef(user), snap = await ref.get();
    if (!snap.exists) await ref.set({ name:name || user.displayName || "Edmonton Member", email:user.email || "", createdAt:firebase.firestore.FieldValue.serverTimestamp() });
  }
  async function authorized() {
    var user = auth.currentUser;
    if (!user) throw Object.assign(new Error("Sign in to continue."), { code:"permission-denied" });
    if (!user.emailVerified) throw Object.assign(new Error("Verify your email before continuing."), { code:"permission-denied" });
    await user.getIdToken(true);
    return user;
  }
  async function toggleDoc(user, collection, id, value) {
    var ref = profileRef(user).collection(collection).doc(String(id));
    var exists = (await ref.get()).exists;
    if (exists) await ref.delete(); else await ref.set({ value:value, createdAt:firebase.firestore.FieldValue.serverTimestamp() });
    return !exists;
  }
  async function handle(path, options) {
    options = options || {};
    var method = options.method || "GET", input = {};
    if (options.body) { try { input = JSON.parse(options.body); } catch {} }
    if (path === "/api/auth-options") return { google:true, emailVerification:true };
    if (path === "/api/session") return { user:await safeUser(auth.currentUser) };
    if (path === "/api/signup" && method === "POST") {
      var credential = await auth.createUserWithEmailAndPassword(String(input.email || "").trim().toLowerCase(), String(input.password || ""));
      await credential.user.updateProfile({ displayName:String(input.name || "").trim().slice(0,80) });
      await ensureProfile(credential.user, input.name);
      await credential.user.sendEmailVerification({ url:window.location.origin + window.location.pathname + "?verified=1" });
      return { verificationRequired:true, message:"Verification email sent. Check your inbox and spam folder." };
    }
    if (path === "/api/login" && method === "POST") {
      var login = await auth.signInWithEmailAndPassword(String(input.email || "").trim().toLowerCase(), String(input.password || ""));
      await ensureProfile(login.user);
      if (!login.user.emailVerified) {
        await login.user.sendEmailVerification({ url:window.location.origin + window.location.pathname + "?verified=1" });
        return { verificationRequired:true, message:"Verify your email before continuing. We sent a fresh link; check your inbox and spam folder." };
      }
      return { user:await safeUser(login.user) };
    }
    if (path === "/api/verification/resend" && method === "POST") {
      var active = auth.currentUser;
      if (!active || active.email !== String(input.email || "").trim().toLowerCase()) throw Object.assign(new Error("Log in with that email first, then request another verification link."), { code:"permission-denied" });
      await active.sendEmailVerification({ url:window.location.origin + window.location.pathname + "?verified=1" });
      return { message:"A new verification link was sent. Check your inbox and spam folder." };
    }
    if (path === "/api/logout" && method === "POST") { await auth.signOut(); return { ok:true }; }
    if (path === "/api/membership" && method === "POST") return { user:await safeUser(auth.currentUser) };
    if (path === "/api/saved" && method === "POST") {
      var u = await authorized(), id = Number(input.placeId);
      if (!Number.isInteger(id) || id < 0) throw new Error("That place could not be saved.");
      var placeSaved = await toggleDoc(u, "savedPlaces", id, id), placeIds = await savedItems(u, "savedPlaces");
      return { savedPlaces:placeIds, saved:placeSaved };
    }
    if (path === "/api/saved-event" && method === "POST") {
      var u2 = await authorized(), eventKey = String(input.eventKey || "");
      if (!eventKey || eventKey.length > 520) throw new Error("That event could not be saved.");
      var keyBytes = new TextEncoder().encode(eventKey), keyHash = await crypto.subtle.digest("SHA-256", keyBytes);
      var docId = Array.from(new Uint8Array(keyHash)).map(function (n) { return n.toString(16).padStart(2,"0"); }).join("");
      var eventSaved = await toggleDoc(u2, "savedEvents", docId, eventKey), eventKeys = await savedItems(u2, "savedEvents");
      return { savedEvents:eventKeys, saved:eventSaved };
    }
    if (path === "/api/place-details" && method === "GET") {
      var overrides = {}, snap = await db.collection("placeOverrides").get();
      snap.forEach(function (doc) { overrides[doc.id] = doc.data(); });
      return { overrides:overrides };
    }
    if (path === "/api/place-reports" && method === "POST") {
      await authorized();
      var field = String(input.field || ""), note = String(input.note || "").trim(), placeId = Number(input.placeId);
      if (!Number.isInteger(placeId) || placeId < 0 || note.length < 8 || note.length > 1000) throw new Error("Choose a detail and add a note between 8 and 1,000 characters.");
      await db.collection("placeReports").add({ placeId:placeId, placeName:String(input.placeName || "").slice(0,120), field:field, note:note, status:"pending", createdAt:firebase.firestore.FieldValue.serverTimestamp(), reporterUid:auth.currentUser.uid });
      return { message:"Thanks. Your suggestion is in the review queue." };
    }
    if (path === "/api/place-reports" && method === "GET") {
      var pending = await db.collection("placeReports").orderBy("createdAt","desc").limit(100).get();
      var reports = pending.docs.map(function (doc) { var item=doc.data(); return Object.assign({ id:doc.id, createdAt:item.createdAt && item.createdAt.toDate ? item.createdAt.toDate().toISOString() : new Date().toISOString() }, item); });
      var ov = await handle("/api/place-details");
      return { reports:reports, overrides:ov.overrides };
    }
    if (path.indexOf("/api/place-reports/") === 0 && method === "PATCH") {
      var parts = path.split("/"), reportId = decodeURIComponent(parts[parts.length - 1]), reportRef = db.collection("placeReports").doc(reportId);
      var reportSnap = await reportRef.get();
      if (!reportSnap.exists) throw new Error("Suggestion not found.");
      var status = String(input.status || "reviewed"), correction = {};
      if (!["reviewed","resolved","declined"].includes(status)) throw new Error("Choose a valid review status.");
      ["address","hours","website","menuUrl","businessStatus"].forEach(function (key) { var value=String(input[key] || "").trim().slice(0,500); if (value) correction[key]=value; });
      if (status === "resolved" && !Object.keys(correction).length) throw new Error("Add at least one verified correction before publishing.");
      ["website","menuUrl"].forEach(function (key) { if (correction[key] && !/^https?:\/\//i.test(correction[key])) throw new Error("Website and menu links must use http or https."); });
      if (status === "resolved") await db.collection("placeOverrides").doc(String(reportSnap.data().placeId)).set(Object.assign(correction, { verifiedAt:firebase.firestore.FieldValue.serverTimestamp() }), { merge:true });
      await reportRef.update({ status:status, reviewedAt:firebase.firestore.FieldValue.serverTimestamp() });
      return { ok:true };
    }
    throw new Error("That backend action is not supported.");
  }
  window.edmontonFirebase = {
    ready:true,
    request:async function (path, options) { try { return await handle(path, options); } catch (error) { fail(error); } },
    signInGoogle:async function () { try { var result=await auth.signInWithPopup(provider); await ensureProfile(result.user); return result.user; } catch (error) { fail(error); } }
  };
})();
