const admin = require("firebase-admin");
const fetch = require("node-fetch");

// Load firebase service account from ENV secret
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

async function sendOneSignalPush(playerIds, title, body) {
  if (playerIds.length === 0) return;

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_player_ids: playerIds,
      headings: { en: title },
      contents: { en: body },
      url: "https://blood-donor-pwa.web.app"
    })
  });

  const data = await res.json();
  console.log("OneSignal response:", data);
}

async function main() {
  console.log("Checking for new requests...");

  // 1️⃣ Find latest un-notified active request
  const reqSnap = await db.collection("requests")
    .where("status", "==", "active")
    .where("notified", "==", false)
    .orderBy("createdAt", "desc")
    .limit(1)
    .get();

  if (reqSnap.empty) {
    console.log("No new request found.");
    return;
  }

  const reqDoc = reqSnap.docs[0];
  const requestId = reqDoc.id;
  const req = reqDoc.data();

  console.log("Found request:", requestId, req);

  // 2️⃣ Get OneSignal tokens
  const tokenSnap = await db.collection("oneSignalUsers").get();
  const playerIds = [];

  tokenSnap.forEach(doc => {
    const d = doc.data();
    if (d.playerId) playerIds.push(d.playerId);
  });

  console.log("Player IDs:", playerIds.length);

  // 3️⃣ Send push
  await sendOneSignalPush(
    playerIds,
    `🩸 Blood Needed: ${req.bloodGroup}`,
    `Units: ${req.unitsRemaining} | Location: ${req.patientLocation}`
  );

  // 4️⃣ Mark request as notified
  await db.collection("requests").doc(requestId).update({
    notified: true,
    notifiedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  console.log("✅ Notification sent + marked notified.");
}

main().catch(console.error);
