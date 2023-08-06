"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeDB = exports.firestoreDB = void 0;
// CONEXIÓN A LA DATABASE
const firebase_admin_1 = require("firebase-admin");
const serviceAccount = require("../key.json");
firebase_admin_1.default.initializeApp({
    credential: firebase_admin_1.default.credential.cert(serviceAccount),
    databaseURL: "https://estaciona-chivilcoy-37816-default-rtdb.firebaseio.com",
});
const firestoreDB = firebase_admin_1.default.firestore();
exports.firestoreDB = firestoreDB;
const realtimeDB = firebase_admin_1.default.database();
exports.realtimeDB = realtimeDB;
