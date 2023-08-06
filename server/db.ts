// CONEXIÓN A LA DATABASE
import admin from "firebase-admin";
import * as serviceAccount from "../key.json";
import mercadopago from "mercadopago";

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as any),
  databaseURL: "https://estaciona-chivilcoy-37816-default-rtdb.firebaseio.com",
});

const firestoreDB = admin.firestore();
const realtimeDB = admin.database();


/* mercadopago.configure({
  access_token: process.env.MP_TOKEN,
});
 */
export async function getMerchantOrder(id) {
  const res = await mercadopago.merchant_orders.get(id);
  console.log(res.body);
}


export { firestoreDB, realtimeDB };
