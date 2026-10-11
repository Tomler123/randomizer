import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  update,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import QRCode from "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm";

/*
  1) Create a Firebase project.
  2) Enable Anonymous Authentication.
  3) Create a Realtime Database.
  4) Paste your Firebase web config below.
  See README.md for exact steps.
*/
const firebaseConfig = {
  apiKey: "PASTE_YOURS_HERE",
  authDomain: "PASTE_YOURS_HERE",
  databaseURL: "PASTE_YOURS_HERE",
  projectId: "PASTE_YOURS_HERE",
  storageBucket: "PASTE_YOURS_HERE",
  messagingSenderId: "PASTE_YOURS_HERE",
  appId: "PASTE_YOURS_HERE"
};

const els = {
  statusCard: document.querySelector("#statusCard"),
  homeView: document.querySelector("#homeView"),
  hostView: document.querySelector("#hostView"),
  studentView: document.querySelector("#studentView"),
  createRoomBtn: document.querySelector("#createRoomBtn"),
  manualJoinForm: document.querySelector("#manualJoinForm"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  hostRoomCode: document.querySelector("#hostRoomCode"),
  participantCount: document.querySelector("#participantCount"),
  waitingCount: document.querySelector("#waitingCount"),
  qrCanvas: document.querySelector("#qrCanvas"),
  joinUrl: document.querySelector("#joinUrl"),
  randomizeBtn: document.querySelector("#randomizeBtn"),
  rerandomizeBtn: document.querySelector("#rerandomizeBtn"),
  participantList: document.querySelector("#participantList"),
  emptyParticipants: document.querySelector("#emptyParticipants"),
  groupsSection: document.querySelector("#groupsSection"),
  assignedCount: document.querySelector("#assignedCount"),
  group1Count: document.querySelector("#group1Count"),
  group2Count: document.querySelector("#group2Count"),
  group3Count: document.querySelector("#group3Count"),
  group1List: document.querySelector("#group1List"),
  group2List: document.querySelector("#group2List"),
  group3List: document.querySelector("#group3List"),
  studentRoomCode: document.querySelector("#studentRoomCode"),
  studentJoinForm: document.querySelector("#studentJoinForm"),
  studentNameInput: document.querySelector("#studentNameInput"),
  studentWaiting: document.querySelector("#studentWaiting"),
  studentAssignment: document.querySelector("#studentAssignment"),
  studentGroupNumber: document.querySelector("#studentGroupNumber"),
  studentAssignmentText: document.querySelector("#studentAssignmentText")
};

let app;
let auth;
let db;
let currentUser = null;
let currentRoom = null;
let participants = {};
let assignments = {};

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

function setStatus(message = "", type = "") {
  if (!message) {
    hide(els.statusCard);
    els.statusCard.textContent = "";
    els.statusCard.className = "status-card hidden";
    return;
  }
  els.statusCard.textContent = message;
  els.statusCard.className = `status-card ${type}`.trim();
  show(els.statusCard);
}

function validateConfig() {
  return !Object.values(firebaseConfig).some(v => !v || String(v).includes("PASTE_YOURS_HERE"));
}

function cleanRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, n => alphabet[n % alphabet.length]).join("");
}

function shuffle(array) {
  const result = [...array];
  const random = new Uint32Array(result.length || 1);
  crypto.getRandomValues(random);
  for (let i = result.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "?";
}

function safeText(value) {
  return String(value ?? "");
}

function buildJoinUrl(roomCode) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", roomCode);
  return url.toString();
}

async function ensureSignedIn() {
  if (currentUser) return currentUser;

  const existing = await new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    });
  });

  if (existing) {
    currentUser = existing;
    return existing;
  }

  const credential = await signInAnonymously(auth);
  currentUser = credential.user;
  return currentUser;
}

async function createRoom() {
  try {
    setStatus("Creating room…");
    els.createRoomBtn.disabled = true;
    await ensureSignedIn();

    let code = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const candidate = randomCode();
      const hostRef = ref(db, `rooms/${candidate}/hostUid`);
      const result = await runTransaction(hostRef, current => current === null ? currentUser.uid : undefined);
      if (result.committed) {
        code = candidate;
        break;
      }
    }

    if (!code) throw new Error("Could not create a unique room. Try again.");

    await set(ref(db, `rooms/${code}/meta`), {
      createdAt: serverTimestamp(),
      groupCount: 3,
      status: "lobby"
    });

    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("host", code);
    history.replaceState({}, "", url);

    setStatus("");
    startHost(code);
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not create the room.", "error");
  } finally {
    els.createRoomBtn.disabled = false;
  }
}

async function startHost(code) {
  try {
    currentRoom = cleanRoomCode(code);
    await ensureSignedIn();

    const roomSnap = await get(ref(db, `rooms/${currentRoom}`));
    if (!roomSnap.exists()) throw new Error("This room does not exist.");

    const room = roomSnap.val();
    if (room.hostUid !== currentUser.uid) {
      throw new Error("This browser is not the presenter for that room. Create a new room instead.");
    }

    hide(els.homeView);
    hide(els.studentView);
    show(els.hostView);
    els.hostRoomCode.textContent = currentRoom;

    const joinUrl = buildJoinUrl(currentRoom);
    els.joinUrl.textContent = joinUrl;

    await QRCode.toCanvas(els.qrCanvas, joinUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M"
    });

    onValue(ref(db, `rooms/${currentRoom}/participants`), snap => {
      participants = snap.val() || {};
      renderParticipants();
      renderGroups();
    });

    onValue(ref(db, `rooms/${currentRoom}/assignments`), snap => {
      assignments = snap.val() || {};
      renderGroups();
    });
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not open presenter room.", "error");
    hide(els.hostView);
    show(els.homeView);
  }
}

function renderParticipants() {
  const entries = Object.entries(participants)
    .sort((a, b) => safeText(a[1]?.name).localeCompare(safeText(b[1]?.name)));

  const n = entries.length;
  els.participantCount.textContent = `${n} student${n === 1 ? "" : "s"}`;
  els.waitingCount.textContent = `${n} joined`;
  els.randomizeBtn.disabled = n === 0;
  els.rerandomizeBtn.disabled = n === 0;

  els.participantList.replaceChildren();
  els.emptyParticipants.classList.toggle("hidden", n !== 0);

  for (const [, person] of entries) {
    const li = document.createElement("li");
    const avatar = document.createElement("span");
    const name = document.createElement("span");

    avatar.className = "avatar";
    avatar.textContent = initials(person?.name);
    name.textContent = safeText(person?.name || "Unnamed student");

    li.append(avatar, name);
    els.participantList.append(li);
  }
}

function renderGroups() {
  const ids = Object.keys(participants);
  const grouped = { 1: [], 2: [], 3: [] };

  for (const uid of ids) {
    const group = Number(assignments?.[uid]);
    if ([1, 2, 3].includes(group)) {
      grouped[group].push(participants[uid]?.name || "Unnamed student");
    }
  }

  const assigned = grouped[1].length + grouped[2].length + grouped[3].length;
  if (assigned === 0) {
    hide(els.groupsSection);
    return;
  }

  show(els.groupsSection);
  els.assignedCount.textContent = `${assigned} assigned`;

  for (const groupNum of [1, 2, 3]) {
    const list = els[`group${groupNum}List`];
    const count = els[`group${groupNum}Count`];
    const names = grouped[groupNum].sort((a, b) => a.localeCompare(b));
    count.textContent = `${names.length} student${names.length === 1 ? "" : "s"}`;
    list.replaceChildren();

    for (const personName of names) {
      const li = document.createElement("li");
      li.textContent = personName;
      list.append(li);
    }
  }
}

async function randomizeGroups() {
  try {
    const ids = shuffle(Object.keys(participants));
    if (!ids.length) return;

    els.randomizeBtn.disabled = true;
    els.rerandomizeBtn.disabled = true;

    const nextAssignments = {};
    ids.forEach((uid, index) => {
      nextAssignments[uid] = (index % 3) + 1;
    });

    await set(ref(db, `rooms/${currentRoom}/assignments`), nextAssignments);
    await update(ref(db, `rooms/${currentRoom}/meta`), {
      status: "assigned",
      randomizedAt: serverTimestamp()
    });

    setStatus(`Randomized ${ids.length} students into three balanced groups.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Randomization failed.", "error");
  } finally {
    els.randomizeBtn.disabled = false;
    els.rerandomizeBtn.disabled = false;
  }
}

async function startStudent(code) {
  try {
    currentRoom = cleanRoomCode(code);
    if (currentRoom.length !== 6) throw new Error("Invalid room code.");

    await ensureSignedIn();
    const roomSnap = await get(ref(db, `rooms/${currentRoom}/meta`));
    if (!roomSnap.exists()) throw new Error("Room not found. Check the code with the presenter.");

    hide(els.homeView);
    hide(els.hostView);
    show(els.studentView);
    els.studentRoomCode.textContent = currentRoom;

    const participantSnap = await get(ref(db, `rooms/${currentRoom}/participants/${currentUser.uid}`));
    if (participantSnap.exists()) {
      const data = participantSnap.val();
      els.studentNameInput.value = data?.name || "";
      hide(els.studentJoinForm);
      show(els.studentWaiting);
      listenForAssignment();
    }
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not join the room.", "error");
    hide(els.studentView);
    show(els.homeView);
  }
}

async function joinStudent(name) {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 50) {
    setStatus("Enter a name between 1 and 50 characters.", "error");
    return;
  }

  try {
    await ensureSignedIn();
    await set(ref(db, `rooms/${currentRoom}/participants/${currentUser.uid}`), {
      name: trimmed,
      joinedAt: serverTimestamp()
    });

    setStatus("");
    hide(els.studentJoinForm);
    show(els.studentWaiting);
    listenForAssignment();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not join.", "error");
  }
}

function listenForAssignment() {
  onValue(ref(db, `rooms/${currentRoom}/assignments/${currentUser.uid}`), snap => {
    const group = Number(snap.val());

    if (![1, 2, 3].includes(group)) {
      hide(els.studentAssignment);
      show(els.studentWaiting);
      return;
    }

    hide(els.studentWaiting);
    show(els.studentAssignment);
    els.studentGroupNumber.textContent = String(group);
    els.studentAssignmentText.textContent = `You have been assigned to Group ${group}.`;
  });
}

function goToStudentRoom(code) {
  const clean = cleanRoomCode(code);
  if (clean.length !== 6) {
    setStatus("Enter the 6-character room code.", "error");
    return;
  }
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", clean);
  window.location.href = url.toString();
}

function wireEvents() {
  els.createRoomBtn.addEventListener("click", createRoom);

  els.manualJoinForm.addEventListener("submit", event => {
    event.preventDefault();
    goToStudentRoom(els.roomCodeInput.value);
  });

  els.roomCodeInput.addEventListener("input", () => {
    els.roomCodeInput.value = cleanRoomCode(els.roomCodeInput.value);
  });

  els.studentJoinForm.addEventListener("submit", event => {
    event.preventDefault();
    joinStudent(els.studentNameInput.value);
  });

  els.randomizeBtn.addEventListener("click", randomizeGroups);
  els.rerandomizeBtn.addEventListener("click", randomizeGroups);
}

async function init() {
  wireEvents();

  if (!validateConfig()) {
    show(els.homeView);
    setStatus("Firebase is not configured yet. Follow README.md, then paste your Firebase config into app.js.", "error");
    return;
  }

  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  try {
    await ensureSignedIn();
  } catch (error) {
    console.error(error);
    show(els.homeView);
    setStatus("Could not connect to Firebase. Check Anonymous Authentication and your Firebase configuration.", "error");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const hostCode = cleanRoomCode(params.get("host"));
  const roomCode = cleanRoomCode(params.get("room"));

  if (hostCode) {
    startHost(hostCode);
  } else if (roomCode) {
    startStudent(roomCode);
  } else {
    show(els.homeView);
  }
}

init();
