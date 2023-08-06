"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const express = require("express");
const bodyParser = require("body-parser");
const uuid_1 = require("uuid");
const app = express();
const PORT = 8080;
app.use(express.json());
app.use(bodyParser.json());
const platesCollectionRef = db_1.firestoreDB.collection("carPlate");
// Recibe Nombre y patente y devuelve un array de los autos
app.get("/getUserData", (req, res) => {
    const { userId } = req.body;
    const userRef = db_1.realtimeDB.ref("users/" + userId);
    userRef.get().then((snap) => {
        if (snap != null) {
            const snapData = snap.val();
            res.json([snapData]);
        }
        else {
            res.status(404).send({
                message: "El userID No existe",
            });
        }
    });
});
//Cuando va a estacionar el auto, ingresa sus datos y luego se agregan a a "/Parkedcars"
app.post("/parkCar", (req, res) => {
    const { coordinates, carId, userId, time } = req.body;
    // Crea una date nueva y le setea los minutos que recibió, para posteriormente guardarlos en la RTDB Como string
    const expirationTime = new Date();
    expirationTime.setMinutes(expirationTime.getMinutes() + time);
    var carData;
    //Trae todo de la RTDB
    const rtdbData = db_1.realtimeDB.ref("/");
    rtdbData
        .get()
        .then((snap) => {
        const allData = snap.val();
        //Busca la info del auto para guardarlas en el string declarado anteriormente
        carData = allData.users[userId].cars[carId];
    })
        .then(() => {
        //Setea en "/parkedCars", los siguientes datos
        db_1.realtimeDB.ref("/parkedCars/" + (0, uuid_1.v4)()).set({
            carId: carId,
            coordinates: coordinates,
            userId: userId,
            name: carData.name,
            expirationTime: expirationTime.toString(),
        });
    })
        .then(() => {
        res.json({
            message: "Estacionado con éxito!",
        });
    });
});
app.post("/createCar", (req, res) => {
    let randomId = (0, uuid_1.v4)();
    const { carName, plate, userId } = req.body;
    const rtdbRef = db_1.realtimeDB.ref("users/" + userId + "/cars/");
    platesCollectionRef
        .doc(plate.toString())
        .get()
        .then((doc) => {
        if (doc.exists) {
            rtdbRef
                .get()
                .then((currentDataSnap) => {
                let currentDataSnapData = currentDataSnap.val();
                Object.assign(currentDataSnapData, {
                    [randomId]: {
                        expirationTime: "",
                        isParked: false,
                        name: carName,
                        plate: plate,
                    },
                });
                rtdbRef.update(currentDataSnapData);
            })
                .then(() => {
                res.json({
                    message: "Auto agregado!",
                });
            });
        }
        else {
            res
                .status(401)
                .send({ message: "Numero de patente incorrecto o inexistente" });
        }
    });
});
app.listen(PORT, () => {
    console.log("API running at ", PORT);
});
