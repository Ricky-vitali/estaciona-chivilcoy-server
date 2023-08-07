// CONEXIÓN A LA DATABASE
const admin = require("firebase-admin");
// Mercadopago
const mercadopago = require('mercadopago');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DB_URL,
});

const firestoreDB = admin.firestore();
const realtimeDB = admin.database();

export { firestoreDB, realtimeDB };

mercadopago.configure({
  access_token: process.env.ACCESS_TOKEN,
});

export async function getMerchantOrder(id) {
  console.log("Soy la function getMerchantOrder", id);
  try {
    const res = await mercadopago.merchant_orders.get(id);

    return res.body.order_status;
  } catch (err) {
    return err;
  }
}

