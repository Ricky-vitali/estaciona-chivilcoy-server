import { realtimeDB, firestoreDB } from "./db";
import * as express from "express";
import * as bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import * as cors from "cors"
import { getMerchantOrder } from "./db";

const app = express();
const PORT = 8080;

const mercadopago = require("mercadopago");
app.use(express.json());
app.use(cors())
app.use(bodyParser.json());


const platesCollectionRef = firestoreDB.collection("carPlate");

mercadopago.configure({
    access_token: "TEST-2039711323530302-072700-102a314cf2e5d98a9a91f5c25c49f643-1102603889",
});


function getExpiredCarIds(objetos) {
  const currentDate = new Date();

  const expiredCarIds = Object.keys(objetos).filter((key) => {
    const expirationTime = new Date(objetos[key].expirationTime);
    return expirationTime < currentDate;
  });

  console.log(expiredCarIds);

  if (expiredCarIds.length > 0) {
    expiredCarIds.forEach((carId) => {
      realtimeDB
        .ref(`/parkedCars/${carId}`)
        .remove()
        .then(() => {
          console.log(`Car with ID ${carId} removed from the database.`);
        })
        .catch((error) => {
          console.error(
            `Error removing car with ID ${carId}: ${error.message}`
          );
        });
    });
  }
}

(async () => {
  const rtdbRef = realtimeDB.ref("/parkedCars/");
  rtdbRef.on("value", (snap) => {
    let data = snap.val();
    //Para que no aparezca el prueba: 1 que esta en al database
    delete data.prueba;

    const intervalId = setInterval(() => {
      getExpiredCarIds(data);
    }, 30000);
  });
})(); 

// Recibe Nombre y patente y devuelve un array de los autos
// Recibe Nombre y patente y devuelve un array de los autos

app.get("/getUserData/:userId", async (req, res) => {
  const { userId } = req.params;
  const userRef = realtimeDB.ref("users/" + userId);

  try {
    const snap = await userRef.get();
    if (snap.exists()) {
      const snapData = snap.val();
      const carsData = snapData.cars;

      // Convert the object into an array with 'id' included in each car object
      const carsArray = await Promise.all(
        Object.keys(carsData).map(async (carId) => {
          const car = {
            id: carId,
            ...carsData[carId],
          };

          // Fetch additional data from Firestore based on the plate property
          const plateDoc = await platesCollectionRef.doc(car.plate).get();
          if (plateDoc.exists) {
            const plateData = plateDoc.data();
            car.type = plateData.type;
            car.color = plateData.color;
            car.brand = plateData.brand;

            // Add other properties from the plateData object as needed
          }

          return car;
        })
      );

      res.json(carsArray);
    } else {
      res.status(404).send({
        message: "El userID No existe",
      });
    }
  } catch (error) {
    console.error("Error al obtener los datos:", error);
    res.status(500).send({
      message: "Error al obtener los datos",
    });
  }
});

//Cuando va a estacionar el auto, ingresa sus datos y luego se agregan a a "/Parkedcars"
app.post("/parkCar", (req, res) => {
  const { coordinates, carId, userId, time, plate } = req.body;
  // Crea una date nueva y le setea los minutos que recibió, para posteriormente guardarlos en la RTDB Como string
  const currentTime = new Date();
  const expirationTime = new Date(currentTime.getTime() + time * 60000);

  let carData;
  //Trae todo de la RTDB
  const rtdbData = realtimeDB.ref("/");
  rtdbData
    .get()
    .then((snap) => {
      const allData = snap.val();
      //Busca la info del auto para guardarlas en el string declarado anteriormente
      carData = allData.users[userId].cars[carId];

      // Update the 'isParked' property to true in the user's car entry
      realtimeDB.ref(`/users/${userId}/cars/${carId}`).update({
        isParked: true,
      });

      //Setea en "/parkedCars", los siguientes datos
      return realtimeDB.ref("/parkedCars/" + uuidv4()).set({
        carId: carId,
        coordinates: coordinates,
        userId: userId,
        name: carData.name,
        expirationTime: expirationTime.toString(),
        plate: plate,
      });
    })
    .then(() => {
      res.json({
        message: "Estacionado con éxito!",
      });
    })
    .catch((error) => {
      res.status(500).json({
        error: "Error al estacionar el auto: " + error.message,
      });
    });
});
/* app.post("/parkCar", (req, res) => {
  const { coordinates, carId, userId, time, plate } = req.body;
  // Crea una date nueva y le setea los minutos que recibió, para posteriormente guardarlos en la RTDB Como string
  const currentTime = new Date();
  const expirationTime = new Date(currentTime.getTime() + time * 60000);

  let carData;
  //Trae todo de la RTDB
  const rtdbData = realtimeDB.ref("/");
  rtdbData
    .get()
    .then((snap) => {
      const allData = snap.val();
      //Busca la info del auto para guardarlas en el string declarado anteriormente
      carData = allData.users[userId].cars[carId];
    })
    .then(() => {
      //Setea en "/parkedCars", los siguientes datos
      realtimeDB.ref("/parkedCars/" + uuidv4()).set({
        carId: carId,
        coordinates: coordinates,
        userId: userId,
        name: carData.name,
        expirationTime: expirationTime.toString(),
        plate: plate,
      });
    })
    .then(() => {
      res.json({
        message: "Estacionado con éxito!",
      });
    });
}); */

app.post("/createCar", (req, res) => {
  let randomId = uuidv4();
  const { carName, plate, userId } = req.body;
  console.log("el post '/createCar', recibió: ", req.body);
  if (!carName || !plate || !userId) {
    res.status(400).send({
      message:
        "Faltan datos en el body, la request debe recibir 'carName', 'plate' y 'userId' en el body",
    });
  } else {
    const rtdbRef = realtimeDB.ref("users/" + userId);
    platesCollectionRef
      .doc(plate.toString())
      .get()
      .then((doc) => {
        if (doc.exists) {
          rtdbRef
            .get()
            .then((currentDataSnap) => {
              let currentDataSnapData = currentDataSnap.val();
              // Si existe un "/cars/, lo agrega a .cars", pero primero chequea si ya tiene otro auto con la misma patente
              if (currentDataSnapData.cars) {
                Object.assign(currentDataSnapData.cars, {
                  [randomId]: {
                    expirationTime: "",
                    isParked: false,
                    name: carName,
                    plate: plate,
                  },
                });
                rtdbRef.update(currentDataSnapData);
              } else {
                // Si no existe, lo agrega,
                Object.assign(currentDataSnapData, {
                  cars: {
                    [randomId]: {
                      expirationTime: "",
                      isParked: false,
                      name: carName,
                      plate: plate,
                    },
                  },
                });
                rtdbRef.update(currentDataSnapData);
              }
            })
            .then(() => {
              console.log("Auto agregado")
              res.json({
                message: "Auto agregado!",
              });
            });
        } else {
          console.log("Pantente error")
          res
            .status(401)
            .send({ message: "Numero de patente incorrecto o inexistente" });
        }
      });
  }
});

app.get("/parkedCars/:userId/:isOfficer?", (req, res) => {
  const { userId, isOfficer } = req.params;
  let isOfficerBoolean;
  if (isOfficer == "false") {
    isOfficerBoolean = false;
  } else if (isOfficer == "true") {
    isOfficerBoolean = true;
  }
  console.log("/parkedCars recibió: ", req.params);
  const parkedCarsRef = realtimeDB.ref("parkedCars/");
  // Si isOfficer es true, devuelve todos los estacionados.
  if (isOfficerBoolean === true) {
    console.log("Officer true");
    parkedCarsRef.get().then((snap) => {
      if (snap.exists) {
        const snapData = snap.val();
        const objectsArray = Object.values(snapData);
        res.json(objectsArray);
      } else {
        res.json({ message: "No hay ningún auto estacionado" });
      }
    });
  }
  // Si es falso, devuelve solo el del userId
  else if (isOfficerBoolean === false) {
    console.log("Officer false");
    parkedCarsRef.get().then((snap) => {
      let snapData = snap.val();

      const snapDataValues = Object.values(snapData);
      const filteredData = snapDataValues.filter((data: any) => {
        return data.userId === userId;
      });
     /*  console.log({ filteredData }); */
      res.json( filteredData );
    });
  }
});


app.delete("/deleteCar", (req, res) => {
  const { userId, carId } = req.body;
  console.log("/deleteCar recibió: ", req.body);
  if (!carId || !userId) {
    res.status(400).send({ message: "Faltan datos en el body" });
  }
  const userCarRef = realtimeDB.ref("users/" + userId + "/cars/" + carId);

  userCarRef
    .remove()
    .then(() => {
      res.json({ message: "Auto removido!" });
    })
    .catch((error) => {
      console.error("Error al eliminar el auto:", error);
      res.status(500).send({ message: "Error al eliminar el auto" });
    }); 
});


/* MERCADO PAGO */

const parkedCars = [];

app.post("/create_preference", (req, res) => {
  let preference = {
    items: [
      {
        title: req.body.description,
        unit_price: Number(req.body.price),
        quantity: Number(req.body.quantity),
      },
    ],
        back_urls: {
            success: "http://localhost:3000/parking",
            failure: "http://localhost:3000/parking",
            pending: "http://localhost:3000/parking"
        },
        notification_url:"http://localhost:8080/webhook/mercadopago",
        auto_return: "approved",
  };
  mercadopago.preferences.create(preference)
    .then(function (response) {
      res.json({
        id: response.body.id,
      });
    })
    .catch(function (error) {
      console.log(error);
    });
});



app.post("/webhook/mercadopago", async (req, res) => {
  const { id, topic } = req.query;
  if (topic == "merchant_order") {
    const order = await getMerchantOrder(id);
    console.log(order);
  }
  res.status(200).send("ok");
});


app.listen(PORT, () => {
  console.log("API running at ", PORT);
});
